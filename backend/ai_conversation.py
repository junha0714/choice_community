"""AI question flow: prompts, JSON parsing, question quality checks."""
from __future__ import annotations

import difflib
import json
import random
import re
from enum import StrEnum

from fastapi import HTTPException

from models import Post
from post_utils import post_option_list, tags_list

# --- 대화 스타일 (DB 문자열; 레거시 simple/detailed·제거된 balance_game 정규화) ---
AI_MODE_CANONICAL = frozenset({"quick", "deep", "friend", "random_fun"})
_LEGACY_AI_MODE_MAP = {
    "simple": "quick",
    "detailed": "deep",
    "balance_game": "quick",
}


def normalize_ai_mode(raw: str | None) -> str:
    if raw is None or not str(raw).strip():
        return "quick"
    m = str(raw).strip().lower()
    return _LEGACY_AI_MODE_MAP.get(m, m if m in AI_MODE_CANONICAL else "quick")


def default_ai_question_steps_for_mode(mode: str) -> int:
    m = normalize_ai_mode(mode)
    return {"quick": 4, "deep": 7, "friend": 5, "random_fun": 3}.get(m, 4)


def _parse_ai_json_response(raw: str | None) -> dict:
    s = (raw or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```\w*\n?", "", s)
        s = re.sub(r"\n?```\s*$", "", s).strip()
    brace = re.search(r"\{[\s\S]*\}", s)
    return json.loads(brace.group(0) if brace else s)


def _ai_max_question_steps(post: Post) -> int:
    """저장된 질문 개수가 이 값에 도달하면 다음 답변 후 최종 추천.

    ai_question_steps가 3~10이면 그 값을 쓰고, 없으면 스타일별 기본.
    """
    raw = getattr(post, "ai_question_steps", None)
    if raw is not None:
        try:
            n = int(raw)
        except (TypeError, ValueError):
            n = None
        else:
            if 3 <= n <= 10:
                return n
    return default_ai_question_steps_for_mode(getattr(post, "ai_mode", None))


def _require_ai_post(post: Post) -> None:
    """AI 질문/추천 API는 post_kind가 ai인 글에서만 사용 가능."""
    if (getattr(post, "post_kind", None) or "community") != "ai":
        raise HTTPException(
            status_code=400,
            detail="AI 질문·추천은 'AI와 함께 고민하기'로 작성한 글에서만 사용할 수 있어요.",
        )

def _normalize_question(s: str | None) -> str:
    t = (s or "").strip()
    # 비교를 위해 공백/구두점 정도만 약하게 정규화
    t = re.sub(r"\s+", " ", t)
    t = t.strip(" \t\r\n-•·")
    # 흔한 문장부호 제거(의미 중복 감지에 유리)
    t = re.sub(r"[?!.…]+$", "", t).strip()
    return t.lower()


def _is_duplicate_question(candidate: str, previous: list[str]) -> bool:
    c = _normalize_question(candidate)
    if not c:
        return True
    prev_norm = [_normalize_question(x) for x in previous if _normalize_question(x)]
    if c in set(prev_norm):
        return True
    # 의미가 거의 같은 문장(표현만 다른 경우)도 중복으로 취급
    for p in prev_norm:
        if not p:
            continue
        if difflib.SequenceMatcher(None, c, p).ratio() >= 0.9:
            return True
    return False


def _is_too_similar_to_recent_answer(candidate: str, last_answer: str | None) -> bool:
    """
    사용자가 방금 한 답을 그대로 되묻는(재진술) 질문을 방지.
    정확한 의미 유사도는 어렵지만, 문장 유사도가 높으면 반복으로 취급한다.
    """
    a = _normalize_question(last_answer or "")
    q = _normalize_question(candidate)
    if not a or not q:
        return False
    # 답변을 질문형으로 바꿔 반복하는 케이스를 막기 위한 비교
    return difflib.SequenceMatcher(None, q, a).ratio() >= 0.78


def _option_named_in_text(opt: str, hay: str) -> bool:
    """선택지 이름이 본문/질문에 들어 있는지(약어·표기 차이 포함) 대략 판별."""
    o_raw = (opt or "").strip()
    if not o_raw:
        return False
    o = _normalize_question(o_raw)
    h = _normalize_question(hay)
    if len(o) == 1:
        return bool(re.search(rf"(?<![가-힣a-z0-9]){re.escape(o)}(?![가-힣a-z0-9])", h))
    if o in h:
        return True
    tokens = re.findall(r"[가-힣a-z0-9]+", h)
    thr = 0.45 if len(o) <= 4 else 0.55
    for w in tokens:
        if len(w) < 2:
            continue
        if o == w or (len(o) >= 3 and (o in w or w in o)):
            return True
        if difflib.SequenceMatcher(None, o, w).ratio() >= thr:
            return True
    step = max(1, len(o) // 3)
    for i in range(0, max(1, len(h) - len(o) + 1), step):
        chunk = h[i : i + len(o) + 8]
        if len(chunk) < 2:
            continue
        if difflib.SequenceMatcher(None, o, chunk).ratio() >= 0.48:
            return True
    return False


def _post_states_binary_dilemma_between_options(post: Post) -> bool:
    """선택지가 정확히 2개이고, 제목·본문에 둘 다 언급되며 '고민/갈지' 등이 있는 경우."""
    opts = post_option_list(post)
    if len(opts) != 2:
        return False
    blob = f"{post.title or ''}\n{post.content or ''}"
    if not _option_named_in_text(opts[0], blob) or not _option_named_in_text(opts[1], blob):
        return False
    nb = _normalize_question(blob)
    markers = (
        "vs",
        " or ",
        "versus",
        "할지",
        "갈지",
        "아니면",
        "고민",
        "둘중",
        "둘 중",
        "which",
    )
    return any(m in nb for m in markers)


def _first_question_redundant_binary_repeat(question: str, post: Post) -> bool:
    """
    본문이 이미 두 선택지 사이 고민인데, 질문이 두 옵션을 직접 들먹이며 '어느 쪽'류로 묻는 경우.
    """
    if _value_priority_framing_ok(question):
        return False
    if not _post_states_binary_dilemma_between_options(post):
        return False
    opts = post_option_list(post)
    if not _option_named_in_text(opts[0], question) or not _option_named_in_text(opts[1], question):
        return False
    nq = _normalize_question(question)
    triggers = (
        "어느",
        "뭐가",
        "무엇",
        "어떤",
        "쪽",
        "끌려",
        "골라",
        "고를",
        "선택",
        "편해",
        "나음",
        "vs",
        "versus",
        "중에",
        "중에서",
        "더 ",
    )
    return any(t in nq for t in triggers)


def _anti_binary_redundant_user_suffix(post: Post) -> str:
    if not _post_states_binary_dilemma_between_options(post):
        return ""
    return (
        "\n\n[주의] 본문이 이미 두 선택지 사이 고민이다. "
        "첫 질문은 후보 이름만 나란히 놓고 ‘어느 쪽’만 자르지 말고, "
        "글에 이미 있는 맥락을 한 덩어리 더 드러나게 물어라."
    )


def _post_user_prose_blob(post: Post) -> str:
    """제목·본문만(선택지 문자열 제외). 이미 사용자가 쓴 맥락 기준."""
    return f"{post.title or ''}\n{post.content or ''}"


def _value_priority_framing_ok(question: str) -> bool:
    """
    감정·가치·현실 우선순위 축이 있으면 '단순 취향 재확인'이 아닌 비교로 본다.
    예: 지금 편함 vs 오래 만족 — 후보 이름이 있어도 허용.
    """
    nq = _normalize_question(question)
    axes = (
        "지금은",
        "당장",
        "오래",
        "장기",
        "단기",
        "만족",
        "편한",
        "편함",
        "후회",
        "우선순위",
        "기준",
        "더 중요",
        "무엇이 더 중요",
        "일상",
        "리듬",
        "부담 덜",
        "스트레스",
        "가치",
        "마음",
        "미루",
    )
    return any(a in nq for a in axes)


def _pairwise_preference_between_stated_options(question: str, post: Post) -> bool:
    """
    제목·본문에 이미 올라온 후보 둘을 질문에서 맞대며
    '어느 쪽이 더 끌리나/매력/호기심'처럼 선호만 묻는 노골적 패턴.
    (선택지 문자열만 있고 본문에 이름이 없으면 과하게 막지 않는다.)
    """
    opts = post_option_list(post)
    if len(opts) < 2:
        return False
    prose = _post_user_prose_blob(post)
    if not prose.strip():
        return False
    named_in_q = [o for o in opts if _option_named_in_text(o, question)]
    if len(named_in_q) < 2:
        return False
    stated = [o for o in named_in_q if _option_named_in_text(o, prose)]
    if len(stated) < 2:
        return False
    nq = _normalize_question(question)
    triggers = (
        "어느",
        "뭐가",
        "무엇",
        "어떤",
        "쪽",
        "끌리",
        "골라",
        "고를",
        "선택",
        "편해",
        "나음",
        "vs",
        "versus",
        "중에",
        "중에서",
        "더 ",
        "호기심",
        "매력",
        "나을",
        "끌려",
    )
    if not any(t in nq for t in triggers):
        return False
    # 진짜 trade-off(한쪽만 가능·포기)면 같은 이름 맞대기라도 허용
    tradeoff_ok = any(
        k in nq
        for k in (
            "한쪽만",
            "하나만",
            "포기",
            "희생",
            "대신 잃",
            "못 키우",
            "키울 수 없",
        )
    )
    if tradeoff_ok:
        return False
    if _value_priority_framing_ok(question):
        return False
    return True


def _question_confirms_stated_candidate(question: str, post: Post) -> bool:
    """
    제목·본문에 이미 나온 후보에 대해 '~도 고려 중?' '외에 다른 ~?' 식으로만 확인하는 질문.
    """
    opts = post_option_list(post)
    if not opts:
        return False
    prose = _post_user_prose_blob(post)
    if not prose.strip():
        return False
    nq = _normalize_question(question)
    mentioned = [
        o
        for o in opts
        if _option_named_in_text(o, question) and _option_named_in_text(o, prose)
    ]
    if not mentioned:
        return False
    if not any(m in nq for m in ("고려", "생각", "포함", "후보", "끼")):
        return False
    if "외에" in nq or "그외" in nq.replace(" ", ""):
        return True
    if "말고" in nq and ("다른" in nq or "또" in nq):
        return True
    if "도 고려" in nq or "도생각" in nq.replace(" ", ""):
        return True
    if "도 생각" in nq:
        return True
    return False


def _anti_obvious_restate_user_suffix(post: Post) -> str:
    if len(post_option_list(post)) < 2:
        return ""
    return (
        "\n\n[품질] 이미 글에 나온 후보를 둘·셋 묶어 ‘어느 쪽이 더 끌리나요’처럼 "
        "선호만 다시 확인하는 질문은 피해라. "
        "극단 악재 가정으로 ‘무엇을 포기할지’를 **잇달아** 묻지 말고, 그 류는 대화 전체에서 많아도 한 번 정도."
    )


def _stressful_counterfactual_pick_question(question: str) -> bool:
    """
    '만약 ~악조건이면 어떤 후보를 포기/안 고를/우선순위' 류 설문형 재난 가정.
    연속으로 나오면 사용자가 지치므로 횟수를 제한한다.
    """
    nq = _normalize_question(question)
    stress = any(
        s in nq
        for s in (
            "비용",
            "두 배",
            "2배",
            "둘로 늘",
            "공간",
            "줄어들",
            "좁아지",
            "시간이 부족",
            "충분하지 않",
            "극단적",
            "악조건",
            "반대한다",
            "못하게 된다면",
            "상황이 바뀌",
        )
    )
    if not stress:
        return False
    force = any(
        s in nq
        for s in (
            "포기",
            "안 고를",
            "안고를",
            "안 키울",
            "키우지 않",
            "선택하지",
            "손 뗄",
            "손을 뗄",
            "먼저",
            "최우선",
            "우선순위",
            "제일 먼저",
            "가장 먼저",
            "첫째로",
            "먼저 고려",
        )
    )
    if not force:
        return False
    hypo = any(s in nq for s in ("만약", "만약에", "만일", "갑자기")) or ("다면" in nq)
    return hypo


def _recent_stressful_counterfactual_pick_count(
    prev_questions: list[str], *, window: int = 8
) -> int:
    if not prev_questions:
        return 0
    tail = prev_questions[-window:]
    return sum(1 for q in tail if _stressful_counterfactual_pick_question(q))


def _second_or_later_stressful_counterfactual_bad(
    question: str, prev_questions: list[str]
) -> bool:
    """재난 가정+포기 류는 대화당 한 번 넘기지 않는다."""
    if not _stressful_counterfactual_pick_question(question):
        return False
    return _recent_stressful_counterfactual_pick_count(prev_questions) >= 1


def _answer_consistency_user_suffix(conversation_text: str) -> str:
    """이미 나온 답의 전제와 충돌하는 극단 가정 금지(도메인 비특이)."""
    text = (conversation_text or "").strip()
    if len(text) < 120:
        return ""
    return (
        "\n\n[일관성] 이전 Q/A에 이미 밝힌 전제(범위·규모·관계·제약 등)와 **모순**하게 "
        "상황을 뒤집거나 ‘만약 정반대였다면’ 식으로 되돌리지 마라. 같은 전제에서 한 가지만 더 물어라."
    )


def _anti_multi_pet_family_doom_from_answers(conversation_text: str) -> str:
    """레거시 이름 — `_answer_consistency_user_suffix`와 동일."""
    return _answer_consistency_user_suffix(conversation_text)


class DecisionStage(StrEnum):
    """질문 생성 직전 사용자 상태(휴리스틱)."""

    INFO_LACK = "INFO_LACK"
    PRACTICAL_CONSTRAINT = "PRACTICAL_CONSTRAINT"
    EMOTION_CONFLICT = "EMOTION_CONFLICT"
    ALREADY_DECIDED = "ALREADY_DECIDED"
    AVOIDING_DECISION = "AVOIDING_DECISION"


# intent·스타일 힌트가 주가 되도록, 재생성은 진짜 나쁜 경우만(합산 높을 때).
QUESTION_REJECT_SCORE_THRESHOLD = 8


def classify_decision_stage(
    conversation_text: str,
    last_answer: str | None,
    prev_question_count: int,
) -> DecisionStage:
    la = _normalize_question(last_answer or "")
    blob = _normalize_question(conversation_text)
    if any(
        x in la
        for x in (
            "정했",
            "이쪽",
            "고를게",
            "할게",
            "채택",
            "선택했",
            "그쪽으로",
            "그걸로",
            "마음 정",
        )
    ):
        return DecisionStage.ALREADY_DECIDED
    if any(x in la for x in ("미루", "피하", "하기싫", "안 할래", "회피")) and len(la) > 10:
        return DecisionStage.AVOIDING_DECISION
    if _answer_is_low_information(last_answer) and prev_question_count >= 1:
        return DecisionStage.INFO_LACK
    tail = blob[-400:] if len(blob) > 400 else blob
    if any(x in la or x in tail for x in ("불안", "걱정", "외로", "답답", "마음이", "스트레스", "힘들")):
        return DecisionStage.EMOTION_CONFLICT
    if any(
        x in la or x in blob
        for x in ("예산", "돈", "비용", "시간", "일정", "장소", "규칙", "계약", "제약", "마감")
    ):
        return DecisionStage.PRACTICAL_CONSTRAINT
    return DecisionStage.INFO_LACK


def _decision_stage_user_suffix(stage: DecisionStage) -> str:
    hints: dict[DecisionStage, str] = {
        DecisionStage.INFO_LACK: "사용자가 아직 정보가 부족해 보인다. 한 턴에 **한 가지**만 더 드러나게.",
        DecisionStage.PRACTICAL_CONSTRAINT: "현실·제약 쪽이 막혀 보인다. **한 가지 제약**만 더 명확히.",
        DecisionStage.EMOTION_CONFLICT: "말이 감정 쪽에 많이 붙어 있다. 단정 없이 **한 가지 기준**만.",
        DecisionStage.ALREADY_DECIDED: "거의 결론에 가깝다. **가볍게 확인** 한 문장.",
        DecisionStage.AVOIDING_DECISION: "결정을 미루는 흔적이 있다. **막히는 한 점**만 짧게.",
    }
    return f"\n\n[대화 단계: {stage.value}] {hints[stage]}"


class QuestionIntent(StrEnum):
    """질문 생성 직전에 고정하는 ‘이번 턴의 목적’(도메인 비특이)."""

    UNDERSTAND_CONTEXT = "UNDERSTAND_CONTEXT"
    UNDERSTAND_EMOTION = "UNDERSTAND_EMOTION"
    CHECK_PRACTICAL_CONSTRAINT = "CHECK_PRACTICAL_CONSTRAINT"
    CHECK_LIFESTYLE_OR_USAGE = "CHECK_LIFESTYLE_OR_USAGE"
    CHECK_PRIORITY = "CHECK_PRIORITY"
    COMPARE_TRADEOFF = "COMPARE_TRADEOFF"
    REDUCE_UNCERTAINTY = "REDUCE_UNCERTAINTY"
    FINAL_CONFIRM = "FINAL_CONFIRM"


_QUESTION_INTENT_AXES = (
    "이번 [질문 의도]에 맞게 **한 가지**만, 글·선택지·직전 답에서 **새 문장**으로 써라. "
    "아래 설명이나 시스템 문장을 그대로 복붙하지 말고, 특정 축(예: 비용·시간·마음)에만 끌려 가지 마라."
)

_INTENT_USER_LINES: dict[QuestionIntent, str] = {
    QuestionIntent.UNDERSTAND_CONTEXT: (
        "맥락 이해 — 이 고민이 왜 지금 떠올랐는지, 배경에서 **한 가지**만 더 알고 싶은 점."
    ),
    QuestionIntent.UNDERSTAND_EMOTION: (
        "감정 쪽 — 단정·진단은 피하고, **같은 말만** 연거푸 묻지 말고 "
        "이번 턴에 새로 드러날 **한 가지**만."
    ),
    QuestionIntent.CHECK_PRACTICAL_CONSTRAINT: (
        "조건·제약 — 지금 결정에 실제로 걸리는 **한 가지**를 구체적으로."
    ),
    QuestionIntent.CHECK_LIFESTYLE_OR_USAGE: (
        "쓰임·패턴 — 자주 겪는 상황이나 쓰는 방식 중 **한 가지**."
    ),
    QuestionIntent.CHECK_PRIORITY: (
        "우선순위 — 지금 가장 중요하게 보는 기준 **한 가지**."
    ),
    QuestionIntent.COMPARE_TRADEOFF: (
        "트레이드오프 — 한쪽을 택하면 잃거나 감수하는 점이 **한 가지** 드러나게."
    ),
    QuestionIntent.REDUCE_UNCERTAINTY: (
        "불확실성 줄이기 — 아직 애매한 점 **한 가지**만 좁혀 묻기."
    ),
    QuestionIntent.FINAL_CONFIRM: (
        "마무리 확인 — 지금까지 나온 말만으로도 방향이 잡혔는지 **가볍게 한 번**."
    ),
}

_STAGE_INTENT_ROTATIONS: dict[DecisionStage, tuple[QuestionIntent, ...]] = {
    DecisionStage.INFO_LACK: (
        QuestionIntent.UNDERSTAND_CONTEXT,
        QuestionIntent.UNDERSTAND_EMOTION,
        QuestionIntent.CHECK_PRIORITY,
        QuestionIntent.CHECK_PRACTICAL_CONSTRAINT,
    ),
    DecisionStage.PRACTICAL_CONSTRAINT: (
        QuestionIntent.CHECK_PRACTICAL_CONSTRAINT,
        QuestionIntent.CHECK_PRIORITY,
        QuestionIntent.CHECK_LIFESTYLE_OR_USAGE,
        QuestionIntent.REDUCE_UNCERTAINTY,
    ),
    DecisionStage.EMOTION_CONFLICT: (
        QuestionIntent.UNDERSTAND_EMOTION,
        QuestionIntent.CHECK_PRIORITY,
        QuestionIntent.COMPARE_TRADEOFF,
        QuestionIntent.UNDERSTAND_CONTEXT,
    ),
    DecisionStage.AVOIDING_DECISION: (
        QuestionIntent.UNDERSTAND_CONTEXT,
        QuestionIntent.REDUCE_UNCERTAINTY,
        QuestionIntent.CHECK_PRIORITY,
        QuestionIntent.CHECK_PRACTICAL_CONSTRAINT,
    ),
    DecisionStage.ALREADY_DECIDED: (QuestionIntent.FINAL_CONFIRM,),
}


def _infer_question_intent_from_question(question: str) -> QuestionIntent | None:
    """직전 질문의 의도를 휴리스틱으로 추정(연속 회피용)."""
    nq = _normalize_question(question)
    if not nq:
        return None
    rules: tuple[tuple[QuestionIntent, tuple[str, ...]], ...] = (
        (QuestionIntent.FINAL_CONFIRM, ("맞", "확인", "이대로", "괜찮을까", "마지막")),
        (QuestionIntent.COMPARE_TRADEOFF, ("포기", "대신", "한쪽", "감수", "트레이드")),
        (QuestionIntent.CHECK_PRACTICAL_CONSTRAINT, ("비용", "예산", "공간", "시간", "가능", "마감", "계약", "제약")),
        (QuestionIntent.CHECK_LIFESTYLE_OR_USAGE, ("일상", "하루", "루틴", "자주", "평소", "사용")),
        (QuestionIntent.CHECK_PRIORITY, ("더 중요", "우선", "기준", "먼저")),
        (QuestionIntent.UNDERSTAND_EMOTION, ("마음", "기분", "느낌", "불안", "걱정", "부담")),
        (QuestionIntent.REDUCE_UNCERTAINTY, ("아직", "헷갈", "모르", "애매", "확신")),
        (QuestionIntent.UNDERSTAND_CONTEXT, ("왜", "상황", "언제", "계기", "배경")),
    )
    for intent, words in rules:
        if any(w in nq for w in words):
            return intent
    return None


_FATIGUE_ESCAPE_INTENTS: tuple[QuestionIntent, ...] = (
    QuestionIntent.CHECK_LIFESTYLE_OR_USAGE,
    QuestionIntent.REDUCE_UNCERTAINTY,
    QuestionIntent.COMPARE_TRADEOFF,
    QuestionIntent.CHECK_PRACTICAL_CONSTRAINT,
    QuestionIntent.CHECK_PRIORITY,
)


def _question_invites_fatigue_burden_axis(question: str) -> bool:
    """비슷한 ‘막히는/힘든’ 뉘앙스만 파는 질문인지(같은 축 연속 방지용)."""
    nq = _normalize_question(question)
    if any(m in nq for m in ("부담", "힘들", "지치", "피곤", "버겁", "견디", "막막")):
        return True
    if "부담스" in nq:
        return True
    if "걸리" in nq and "이유" in nq:
        return True
    return False


def _last_answer_is_fatigue_short_echo(answer: str | None) -> bool:
    """답이 짧고 피로·회피만 반복하는지."""
    la = _normalize_question(answer or "")
    if not la or len(la) > 40:
        return False
    return any(
        m in la
        for m in (
            "힘들",
            "부담",
            "지쳐",
            "피곤",
            "모르",
            "애매",
            "글쎄",
            "그냥",
            "잘 모르",
            "상관",
        )
    )


def _should_pivot_from_fatigue_loop(
    prev_questions: list[str], last_answer: str | None
) -> bool:
    """같은 뉘앙스만 맴돌면 다음 질문 각도를 바꾼다."""
    if not prev_questions:
        return False
    win3 = prev_questions[-3:]
    if sum(1 for q in win3 if _question_invites_fatigue_burden_axis(q)) >= 2:
        return True
    tail = prev_questions[-2:] if len(prev_questions) >= 2 else prev_questions[-1:]
    fatigue_q = sum(1 for q in tail if _question_invites_fatigue_burden_axis(q))
    if fatigue_q >= 2:
        return True
    if fatigue_q >= 1 and _last_answer_is_fatigue_short_echo(last_answer):
        return True
    return False


def _stall_guard_user_suffix(
    prev_questions: list[str], last_answer: str | None
) -> str:
    if not _should_pivot_from_fatigue_loop(prev_questions, last_answer):
        return ""
    return (
        "\n\n[대화 리듬] 직전에 비슷한 말로만 돌고 있었다면, 이번엔 **다른 각도**(기준·조건·선택지 차이 등)로 "
        "한 문장만 물어라. 감정을 아예 피할 필요는 없고, **같은 뉘앙스만** 반복하지 않으면 된다."
    )


def select_question_intent(
    *,
    stage: DecisionStage,
    next_step: int,
    max_rounds: int,
    prev_questions: list[str],
    last_answer: str | None = None,
) -> QuestionIntent:
    """
    decision_stage 이후, 이번 턴에 어떤 ‘목적’의 질문을 할지 고른다.
    도메인이 아니라 결정 과정의 일반 단계만 사용한다.
    """
    if max_rounds <= 1:
        return QuestionIntent.CHECK_PRIORITY
    if next_step >= max_rounds:
        return QuestionIntent.FINAL_CONFIRM
    if stage == DecisionStage.ALREADY_DECIDED:
        return QuestionIntent.FINAL_CONFIRM

    if _should_pivot_from_fatigue_loop(prev_questions, last_answer):
        return _FATIGUE_ESCAPE_INTENTS[
            (max(0, next_step - 1)) % len(_FATIGUE_ESCAPE_INTENTS)
        ]

    pool = _STAGE_INTENT_ROTATIONS.get(
        stage,
        _STAGE_INTENT_ROTATIONS[DecisionStage.INFO_LACK],
    )
    idx = (max(0, next_step - 1)) % len(pool)
    intent = pool[idx]
    if prev_questions:
        prev_i = _infer_question_intent_from_question(prev_questions[-1])
        if prev_i is not None and prev_i == intent and len(pool) > 1:
            intent = pool[(idx + 1) % len(pool)]
    return intent


def _question_intent_user_suffix(intent: QuestionIntent) -> str:
    line = _INTENT_USER_LINES[intent]
    return (
        f"\n\n[질문 의도: {intent.value}] 이번 턴의 목적은 다음이다: {line} "
        f"{_QUESTION_INTENT_AXES} "
        "제목·본문·선택지·(있으면) 직전 답에 **근거**해 한국어 질문 1개만 써라. "
        "예시 문장이 있어도 말투·길이만 참고하고, 표현을 베끼지 마라."
    )


# 경량 테마: emotion / budget / schedule / relationship / risk
_THEME_CLASSIFIER: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("emotion", ("마음", "기분", "불안", "외로", "스트레스", "답답", "후회", "설렘")),
    ("budget", ("비용", "예산", "돈", "만원", "가격")),
    ("schedule", ("시간", "일정", "기한", "당장", "오늘", "내일")),
    ("relationship", ("주변", "혼자", "함께", "다른 사람", "관계")),
    ("risk", ("위험", "리스크", "실패", "건강", "안전")),
)


def _question_theme_set(question: str) -> frozenset[str]:
    nq = _normalize_question(question)
    return frozenset(tid for tid, words in _THEME_CLASSIFIER if any(w in nq for w in words))


def _dominant_repeated_theme(prev_questions: list[str]) -> str | None:
    if len(prev_questions) < 2:
        return None
    tail = prev_questions[-3:]
    counts: dict[str, int] = {}
    for q in tail:
        for tid in _question_theme_set(q):
            counts[tid] = counts.get(tid, 0) + 1
    for tid, c in counts.items():
        if c >= 2:
            return tid
    return None


# 질문 '스타일'(분위기) — 테마(비용/시간)와 별개로 설문 느낌 연속을 끊는다.
QUESTION_STYLE_IDS: tuple[str, ...] = (
    "emotional",
    "lifestyle",
    "practical_constraint",
    "future_projection",
    "fear_or_concern",
    "value_priority",
    "relationship_style",
    "motivation",
    "tradeoff",
)

# 앞쪽일수록 우선 매칭(한 질문에 한 스타일만 부여)
_STYLE_SIGNALS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("tradeoff", ("포기", "한쪽만", "다른 쪽", "대신 잃", "희생", "못 고르", "양쪽")),
    ("future_projection", ("1년", "몇 달 뒤", "몇달 뒤", "나중", "미래", "그때", "앞으로", "상상")),
    ("fear_or_concern", ("무서", "두려", "걱정되는", "망할", "실패가", "리스크")),
    (
        "practical_constraint",
        (
            "비용",
            "예산",
            "얼마",
            "공간",
            "장소",
            "시간이 얼마",
            "자주",
            "스케줄",
            "가능해",
            "당장",
            "기한",
            "마감",
            "주차",
            "계약",
        ),
    ),
    ("value_priority", ("더 중요", "우선순위", "기준", "제일 먼저", "둘 중 뭐", "어느 쪽이")),
    ("relationship_style", ("주변", "다른 사람", "혼자", "같이", "함께", "관계")),
    ("emotional", ("마음", "기분", "느낌", "설렘", "외로", "불안", "스트레스", "답답", "위로")),
    ("motivation", ("왜", "이유", "계기", "망설", "어려운 점", "막히는")),
    ("lifestyle", ("일상", "하루", "루틴", "주말", "편하게", "생활", "패턴", "자주")),
)


def _infer_question_style(question: str) -> str:
    """질문 1개에 대해 단일 스타일 id (대화 리듬·연속 방지용)."""
    nq = _normalize_question(question)
    for sid, words in _STYLE_SIGNALS:
        if any(w in nq for w in words):
            return sid
    return "motivation"


def _used_question_styles(prev_questions: list[str]) -> list[str]:
    return [_infer_question_style(q) for q in prev_questions if q.strip()]


def _ai_question_style_rotation_suffix(prev_questions: list[str]) -> str:
    """같은 스타일 연속을 피하라는 가벼운 힌트(의도·품질 점검이 주)."""
    if not prev_questions:
        return ""
    last_s = _infer_question_style(prev_questions[-1])
    others = [s for s in QUESTION_STYLE_IDS if s != last_s]
    return (
        f"\n\n[질문 스타일] 직전 톤은 '{last_s}'에 가깝다. "
        f"가능하면 다른 뉘앙스로 바꿔라(참고: {', '.join(others[:5])}). "
        "[질문 의도]가 우선이다."
    )


def _first_question_human_opening_suffix(post: Post) -> str:
    """첫 질문이 행정·조사 톤으로만 가지 않게."""
    opts = post_option_list(post)
    opt_hint = ""
    if opts:
        opt_hint = "선택지: " + ", ".join(o.strip() for o in opts if o.strip()) + ". "
    return (
        "\n\n[첫 질문 톤] "
        + opt_hint
        + "위 [질문 의도]에 맞춰 한 문장으로 써라. "
        "조건만 잇달아 체크하는 식은 피하고, 글·선택지와 붙은 말로 자연스럽게 물어라."
    )


def _options_connection_penalty(question: str, post: Post) -> int:
    """선택지 이름·본문 고민과 질문이 너무 동떨어지면 소량 감점(설문 느낌 완화)."""
    opts = post_option_list(post)
    if len(opts) < 2:
        return 0
    prose = _post_user_prose_blob(post)
    named = any(_option_named_in_text(o, question) for o in opts)
    prose_hit = any(_option_named_in_text(o, question) and _option_named_in_text(o, prose) for o in opts)
    if named or prose_hit:
        return 0
    # 순수 조건 나열만 하고 후보/고민과 안 엮이면
    if _infer_question_style(question) == "practical_constraint":
        return 1
    return 0


_AI_WARMTH_MARKERS: tuple[str, ...] = (
    "느낌",
    "마음",
    "후회",
    "부담",
    "설렘",
    "설레",
    "걱정",
    "소중",
    "가치",
    "의미",
    "상상",
    "만약",
    "요즘",
    "스스로",
    "미래",
    "기분",
    "편안",
    "편해",
    "행복",
    "스트레스",
    "답답",
    "위로",
    "두근",
    "안도",
    "컨디션",
    "지금은",
    "지금 상황",
    "요즘은",
    "하루가",
    "일상에서",
)


def _question_has_emotional_or_value_framing(question: str) -> bool:
    """감정·가치·상황 맥락이 있으면 선택지 비교 제약을 완화할 때 사용."""
    nq = _normalize_question(question)
    return any(m in nq for m in _AI_WARMTH_MARKERS)


def _binary_followup_forces_option_pick(question: str, post: Post) -> bool:
    """
    선택지가 정확히 2개일 때, 후속 질문이 또 '둘 중 하나'를 고르게 만드는 경우.
    옵션 이름을 쓰지 않아도 '어떤 동물'처럼 이진 고민을 되풀이하면 True.
    """
    if _value_priority_framing_ok(question):
        return False
    opts = post_option_list(post)
    if len(opts) != 2:
        return False
    nq = _normalize_question(question)
    if _option_named_in_text(opts[0], question) and _option_named_in_text(opts[1], question):
        # '좋지만/느낌' 같은 말로 감싼 설문형 맞대기는 여전히 피한다
        shallow_compare = any(
            s in nq
            for s in (
                "호기심",
                "끌리",
                "매력적",
                "매력",
                "어느 쪽",
                "어느쪽",
                "뭐가 더",
                "무엇이 더",
                "더 선호",
                "나을까",
                "나을",
                "끌려",
            )
        )
        if shallow_compare:
            return True
        triggers = (
            "어느",
            "뭐가",
            "무엇",
            "어떤",
            "쪽",
            "끌려",
            "골라",
            "고를",
            "선택",
            "편해",
            "나음",
            "중에",
            "중에서",
            "더 ",
        )
        if any(t in nq for t in triggers):
            if _question_has_emotional_or_value_framing(question):
                return False
            return True
    force_phrases = (
        "어느 쪽",
        "어느편",
        "어느 것",
        "어떤 쪽",
        "어떤편",
        "어떤 것",
        "어느 동물",
        "어떤 동물",
        "둘 중",
        "둘중",
        "둘 중에",
        "둘중에",
        "무엇을 키울",
        "뭘 키울",
        "더 많은 관심",
        "두 옵션",
        "두가지 중",
        "두 가지 중",
    )
    return any(p in nq for p in force_phrases)


def _next_ai_user_suffix_binary(post: Post) -> str:
    if len(post_option_list(post)) != 2:
        return ""
    return (
        "\n\n[주의] 선택지가 2개다. "
        "이름만 나란히 놓고 ‘어느 쪽’만 자르지 말고, [질문 의도]에 맞게 맥락을 붙여 물어도 된다. "
        "방금 답을 그대로 반복해 묻지는 마라."
    )

 
def _next_ai_sys_suffix_binary(post: Post) -> str:
    if len(post_option_list(post)) != 2:
        return ""
    return (
        " 선택지가 2개여도 기계적으로만 맞대지 말고, "
        "우선순위·제약·사용 맥락처럼 사람 말로 한 축을 붙여 물어도 된다."
    )


def _answer_is_low_information(answer: str | None) -> bool:
    a = _normalize_question(answer or "")
    if not a:
        return True
    markers = (
        "모르겠",
        "잘 모르",
        "모름",
        "생각이 없어",
        "생각 없음",
        "딱히",
        "아직",
        "그냥",
        "상관없",
        "아무거나",
        "괜찮",
    )
    return any(m in a for m in markers) or len(a) <= 6


_FALLBACK_BY_INTENT: dict[QuestionIntent, str] = {
    QuestionIntent.UNDERSTAND_CONTEXT: "이 고민, 지금 왜 제일 먼저 떠올랐어요?",
    QuestionIntent.UNDERSTAND_EMOTION: "말로 꺼내기 애매한 부분이 있으면, 그건 뭐에 가까워요?",
    QuestionIntent.CHECK_PRACTICAL_CONSTRAINT: "막히는 조건 하나만 꼽자면 뭐예요?",
    QuestionIntent.CHECK_LIFESTYLE_OR_USAGE: "실제로 쓸 때 가장 신경 쓰이는 건 뭐예요?",
    QuestionIntent.CHECK_PRIORITY: "지금 기준으로 가장 중요하게 보는 건 뭐예요?",
    QuestionIntent.COMPARE_TRADEOFF: "한쪽 고르면 아깝게 느껴지는 점이 더 큰 쪽이 있어요?",
    QuestionIntent.REDUCE_UNCERTAINTY: "아직 애매한 거 하나만 짚자면 뭐예요?",
    QuestionIntent.FINAL_CONFIRM: "지금까지 말로 보면, 어느 쪽이 더 가깝게 느껴져요?",
}


def _smart_fallback_question(
    post: Post,
    prev_questions: list[str],
    *,
    intent: QuestionIntent | None = None,
) -> str:
    """
    모델이 계속 점수 임계값에 걸릴 때. [질문 의도]에 맞는 범용 문장(도메인 비특이).
    """
    opts = post_option_list(post)
    opt_tail = ""
    if opts:
        opt_tail = f" ({', '.join(o.strip() for o in opts[:4] if o.strip())} 생각하면서)"

    if intent is not None:
        base = _FALLBACK_BY_INTENT.get(intent)
        if base:
            return base + opt_tail

    used_styles = {_infer_question_style(q) for q in prev_questions if q.strip()}
    candidates: list[tuple[str, str]] = [
        ("motivation", f"지금 이 고민, 어디서 제일 시작된 것 같아요?{opt_tail}"),
        ("emotional", f"말하기 괜찮은 범위에서, 더 짚고 싶은 쪽이 있어요?{opt_tail}"),
        ("lifestyle", f"실제로 써 먹을 때 기준이 하나만 있다면 뭐예요?{opt_tail}"),
        ("future_projection", f"조금만 미뤄서 보면, 뭐가 더 해보고 싶어요?{opt_tail}"),
        ("value_priority", f"지금은 뭐를 더 챙기고 싶어요?{opt_tail}"),
        ("relationship_style", "다른 사람 생각까지 넣으면 답이 달라져요? (예/아니오)"),
        ("fear_or_concern", "나중에 생각하면 더 신경 쓰일 쪽이 있어요?"),
        ("practical_constraint", f"제일 먼저 걸리는 조건 하나만요?{opt_tail}"),
    ]
    for sid, q in candidates:
        if sid not in used_styles:
            return q
    return f"지금 대화만으로 보면, 더 이야기하고 싶은 쪽이 있어요?{opt_tail}"


def _used_question_axes(prev_questions: list[str]) -> list[str]:
    """이전 질문들에서 등장한 테마 id 목록(힌트·fallback용)."""
    seen: set[str] = set()
    for q in prev_questions:
        seen |= set(_question_theme_set(q))
    return sorted(seen)


def _question_overlaps_covered_axes(question: str, prev_questions: list[str]) -> bool:
    """직전 질문과 같은 경량 테마가 겹치면 True (레거시 호환)."""
    if not prev_questions:
        return False
    ct = _question_theme_set(question)
    if not ct:
        return False
    return bool(ct & _question_theme_set(prev_questions[-1]))


def _question_matched_themes(question: str) -> frozenset[str]:
    """레거시 이름 — `_question_theme_set`과 동일."""
    return _question_theme_set(question)


def _recent_theme_overuse_bad(candidate: str, prev_questions: list[str]) -> bool:
    """레거시 호환(점수제와 병행 시 동작 유지)."""
    if len(prev_questions) < 2:
        return False
    dom = _dominant_repeated_theme(prev_questions)
    if dom is None:
        return False
    return dom in _question_theme_set(candidate)


def _question_nearly_duplicate_of_recent(
    candidate: str, prev_questions: list[str], *, ratio: float = 0.68
) -> bool:
    """직전 1~2개 질문과 문장 전체가 비슷하면 True (다른 말로 되묻기 방지)."""
    c = _normalize_question(candidate)
    if not c or not prev_questions:
        return False
    for pq in prev_questions[-2:]:
        p = _normalize_question(pq)
        if not p:
            continue
        if difflib.SequenceMatcher(None, c, p).ratio() >= ratio:
            return True
    return False


def _binary_option_side_echo_bad(
    candidate: str, prev_questions: list[str], post: Post
) -> bool:
    """축소됨: 점수제·가치 프레이밍으로 대부분 흡수. 레거시 API만 유지."""
    return False


def _any_recent_theme_saturated(prev_questions: list[str]) -> bool:
    return _dominant_repeated_theme(prev_questions) is not None


def _ai_theme_stretch_user_suffix(prev_questions: list[str]) -> str:
    """레거시: intent·스타일 힌트로 흐름을 맡기고 유저 메시지 길이를 줄인다."""
    return ""


def _ai_binary_option_balance_suffix(prev_questions: list[str], post: Post) -> str:
    """과적합 방지를 위해 비활성(점수제·프롬프트로 조정)."""
    return ""


def _question_is_pairwise_tournament(question: str) -> bool:
    """
    이름만 나열하고 고르게 하는 기계적 1:1 토너먼트만 차단.
    감정·가치·상황 맥락이 있으면 같은 구조도 허용한다.
    """
    if not (question or "").strip():
        return False
    nq = _normalize_question(question)
    raw_l = question.lower()
    q_raw = (question or "").strip()
    warmth = _question_has_emotional_or_value_framing(question) or _value_priority_framing_ok(
        question
    )

    pair_ko = (
        "와 " in nq
        or "과 " in nq
        or " 또는 " in nq
        or " 아니면 " in nq
        or "이랑 " in nq
        or "랑 " in nq
    )
    strong_bracket = "둘 중" in nq or "둘중" in nq or "어느 쪽" in nq or "어느쪽" in nq
    naked_prefer = ("더 선호" in nq or "더 좋아" in nq or "더 끌" in nq) and (
        "어느" in nq or "뭐가" in nq or "무엇" in nq
    )
    explicit_pick = any(
        p in nq for p in ("골라", "고를래", "고를까", "고르라", "선택해", "선택하")
    )

    if pair_ko:
        if warmth:
            # 맥락 있음: '둘 중 골라'처럼 괄호+명령만 토너먼트로 본다.
            return bool(strong_bracket and explicit_pick)
        if strong_bracket or explicit_pick or naked_prefer:
            return True

    if (" or " in raw_l or " and " in raw_l or " vs " in raw_l) and "?" in q_raw:
        if warmth:
            return False
        if any(w in raw_l for w in ("which", "prefer", "rather", "more interested")):
            return True
        if " vs " in raw_l:
            return True
    return False


def _ai_style_block_for_questions(mode: str) -> str:
    m = normalize_ai_mode(mode)
    if m == "quick":
        return (
            "말투는 가벼운 존댓말. 짧게, 부담 없이 답할 수 있게. "
            "빠르게 결론 쪽으로 수렴한다. "
            "상담 세션·긴 회유·앞붙임 잡담은 피하고, **한 턴에 쓸 정보 한 덩어리**만 노린다."
        )
    if m == "deep":
        return (
            "말투는 친근한 존댓말이되 한 끗 더 차분하게. "
            "질문 한 개로도 사용자의 성향·우선순위가 조금 더 드러나게 설계한다."
        )
    if m == "friend":
        return (
            "말투는 친한 친구랑 카톡하는 느낌의 **반말**(이모지는 쓰지 않는다). "
            "존댓말·딱딱한 상담 코치 말투는 쓰지 않는다. "
            "정형 공감 멘트(그럴 수 있지 등)만 반복하지 않고, 글에 맞는 구체적인 말을 쓴다. "
            "과한 위로·심리분석 단정은 피한다. "
            "심문·체크리스트처럼 이어 붙이지 말고, **답 늘리라고 재촉하지 않는** 한 가지만 연다."
        )
    return _ai_style_block_for_questions("quick")


def _ai_objective_for_questions(mode: str) -> str:
    m = normalize_ai_mode(mode)
    core = (
        "근거는 제목·본문·선택지와(후속이면) Q/A뿐. 카테고리는 참고만. "
        "사용자가 스스로 결정할 수 있게 **부족한 정보 1가지**만 짧게 묻는다. "
        "반복·단순 취향 재확인·장황한 설명형 질문은 피한다. "
        "유저 메시지의 **[질문 의도]** 한 가지에만 맞춰 한 문장을 쓴다. "
        "제약·일정·비용 같은 **현실 쪽**은 필요하면 자연스럽게 물어도 된다. "
        "같은 말만 잇달아 설문처럼 나열하지는 말고, [질문 의도]와 균형을 맞춰라. "
        "상투적인 질문 틀에 끌리지 말고 글 맥락에서 새로 써라."
    )
    if m == "friend":
        return (
            "역할: 편하게 말 거는 친구 같은 대화 상대(반말). "
            + core
            + " 매 턴 **생각이 덜 막히게** 한 가지만 여는 쪽으로 묻고, 결론을 재촉하지 않는다."
        )
    if m == "deep":
        return "역할: 차분한 선택 코치. " + core + " 가정 질문은 한 턴에 하나만."
    return (
        "역할: 빠른 선택 코치. "
        + core
        + " 매 턴 **다음 추천에 바로 쓸** 정보 한 덩어리만 노린다. 상태 점검·긴 회유는 피한다."
    )


def _ai_format_rules_for_questions(mode: str) -> str:
    m = normalize_ai_mode(mode)
    max_chars = 60
    if m == "friend":
        max_chars = 78
    elif m == "deep":
        max_chars = 64
    tail = ""
    if m == "quick":
        tail = "문장은 직설적으로; 앞붙임 한 줄은 없어도 된다. "
    elif m == "friend":
        tail = "문장은 반말로 부드럽게; 단, 한 문장 안에서 한 가지만 묻는다. "
    return (
        f"질문은 한국어 1문장(최대 {max_chars}자), 줄바꿈 없음, 질문 하나만. "
        + tail
        + "짧게 답할 수 있게(예/아니오·둘 중 하나도 좋고, 한두 문장으로 말해도 되는 짧은 질문도 좋다). "
        "한 번에 **한 가지**만 묻는다."
    )


def _ai_system_prompt_question(
    *, followup: bool, conversation_style: str, max_question_rounds: int | None = None
) -> str:
    """질문 단계 시스템 프롬프트. conversation_style은 normalize 전 값도 허용."""
    m = normalize_ai_mode(conversation_style)
    if m == "random_fun":
        m = "quick"
    style = _ai_style_block_for_questions(m)
    objective = _ai_objective_for_questions(m)
    format_rules = _ai_format_rules_for_questions(m)
    budget = ""
    if max_question_rounds is not None and max_question_rounds > 0:
        budget = f"질문은 이 대화에서 최대 {max_question_rounds}번. 한 턴에 정보 한 덩어리만. "
    follow = ""
    if followup:
        follow = "가능하면 직전 답을 그대로 되묻지 않는다. "
    ex = _ai_question_examples_for_mode(m)
    return (
        f"{budget}{objective} {style} {format_rules} {follow} {ex} "
        "세부 품질(반복·장황함 등)은 서버에서 점검한다. "
        "예시 문장은 말투·길이만 참고하고, 문장을 그대로 쓰거나 특정 축에만 맞추지 마라. "
        '반드시 JSON만 출력한다. 형식: {"question":"질문"}'
    )


def _ai_question_examples_for_mode(mode: str) -> str:
    """형태 참고용 한 줄(특정 축 과적합 방지)."""
    m = normalize_ai_mode(mode)
    if m == "friend":
        return "예시(말투만): ‘지금 뭐가 제일 걸려?’ — **이 문장을 그대로 쓰지 말 것.**"
    return "예시(말투만): ‘지금 가장 중요하게 보는 기준은 뭐예요?’ — **이 문장을 그대로 쓰지 말 것.**"


def _ai_mode_question_user_suffix(
    *,
    mode: str,
    step: int,
    max_rounds: int,
) -> str:
    """유저 메시지에 붙여 모델이 매 턴 다른 문장 형식을 쓰게 한다."""
    m = normalize_ai_mode(mode)
    mx = max(1, int(max_rounds))
    st = max(1, int(step))
    if m == "quick":
        return (
            f"\n\n[모드 지시: 빠른 결정] 지금 {st}/{mx}턴 질문이다. "
            "답이 길어지지 않게 짧게 물어라. 예/아니오·둘 중 하나도 좋고, "
            "‘지금 가장 걸리는 건 뭐예요?’처럼 한두 문장으로 답 가능한 짧은 질문도 된다. "
            "상담처럼 깊게 파고들거나 감정만 오래 두드리지 말고, **한 턴에 한 포인트**만."
        )
    if m == "deep":
        late = st >= max(3, mx - 1)
        if late:
            return (
                f"\n\n[모드 지시: 깊은 분석] 지금 {st}/{mx}턴(후반)이다. "
                "**수렴·정리형**으로 한 문장만 물어라(가정은 있어도 되고 없어도 된다). "
                "조건이 **갑자기 크게 나빠진다**는 식으로 후보를 포기하게 만드는 질문은 "
                "이미 썼다면 또 쓰지 마라."
            )
        return (
            f"\n\n[모드 지시: 깊은 분석] 지금 {st}/{mx}턴 질문이다. "
            "우선순위·맞바꿈·짧은 가정·후회·쓰임 중 **하나**가 드러나게 한 문장으로 써라. "
            "‘최악이면 뭐 포기’ 식은 잇달아 쓰지 말고, 전체 대화에서 많아도 한 번 정도."
        )
    if m == "friend":
        closer = "~할까?" if st % 2 == 1 else "~야?"
        return (
            f"\n\n[모드 지시: 친구 상담·반말] 지금 {st}/{mx}턴 질문이다. "
            "질문 전체를 **반말**로 써라(존댓말·‘해요’체 금지). "
            f"질문은 물음표로 끝내고, 말끝은 '{closer}'에 가깝게 자연스럽게 닫아라. "
            "'너 OO형이다' 같은 성격 진단 표현은 쓰지 마라. "
            "질문 앞에 붙이는 말은 생략해도 된다. "
            "답을 길게 늘리라고 재촉하거나, 결론을 재촉하는 말투는 피한다. "
            "절대 반복하지 말 것: '그럴 수 있지' '이해해' '힘들겠다' 같은 "
            "빈말·정형 공감 한 줄을 매 턴 꺼내는 것. 공감이 필요하면 글 내용에 맞는 구체적인 한 단어만."
        )
    return (
        f"\n\n[모드 지시: 빠른 결정] 지금 {st}/{mx}턴 질문이다. "
        "짧게 답할 수 있게 물어라(예/아니오·이항도 가능, 한두 문장 자유답도 가능)."
    )


def _ai_user_block_post(post: Post) -> str:
    return (
        f"제목: {post.title}\n"
        f"본문:\n{post.content}\n\n"
        f"선택지(쉼표 구분, 비교 후보): {post.options}\n"
        f"분류(참고만): {post.category}\n"
        f"태그(있으면 참고): {', '.join(tags_list(post))}\n"
    )


# 본문이 짧을 때 추상적인 ‘기분·기대’만 파는 질문 방지(카테고리 무관)
_MENU_OVERPSYCH_MARKERS: tuple[str, ...] = (
    "어떤 기분",
    "기분일",
    "기분이",
    "느낌이",
    "느낌일",
    "특별한 느낌",
    "특별한 기대",
    "기대",
    "상상해",
    "상상해 보면",
    "즐거움",
    "마음이 어떤",
)


def _post_is_thin_context_post(post: Post) -> bool:
    """선택지는 있는데 본문 근거가 매우 짧은 글 → 모호한 심리 탐문을 줄인다."""
    if len(post_option_list(post)) < 2:
        return False
    return len((post.content or "").strip()) < 220


def _post_is_simple_menu_style(post: Post) -> bool:
    """레거시 이름 — 얇은 맥락 글 허용 규칙과 동일."""
    return _post_is_thin_context_post(post)


def _question_has_menu_overpsych_probe(question: str) -> bool:
    nq = _normalize_question(question)
    return any(m in nq for m in _MENU_OVERPSYCH_MARKERS)


def _simple_menu_overpsych_question_bad(question: str, post: Post) -> bool:
    if not _post_is_thin_context_post(post):
        return False
    return _question_has_menu_overpsych_probe(question)


def _question_is_leading_or_wordy(question: str, post: Post) -> bool:
    """
    질문이 장황하거나(설명형 접속어/구조), 선택지별 장점·단점을 미리 깔아
    답을 유도하는 형태면 True.
    """
    q = (question or "").strip()
    if not q:
        return True

    if len(q) > 82:
        return True

    nq = _normalize_question(q)

    # 설명형/양면 프레이밍 마커가 여러 개 섞이면 대개 유도/장황해진다
    leading_markers: tuple[str, ...] = (
        "할 수 있고",
        "할 수있고",
        "하지만",
        "반면",
        "대신",
        "그래도",
        "또는",
        "아니면",
        "이면서",
        "해주지만",
        "해 주지만",
        "느낄 수",
        "느낄수",
    )
    if sum(1 for m in leading_markers if m in nq) >= 3:
        return True

    # 선택지 이름을 둘 이상 포함하면서 비교·대립 마커가 있으면 유도형일 확률이 높다
    if _question_pits_multiple_named_options(q, post):
        if any(x in nq for x in ("vs", "대신", "반면", "하지만", "둘 중", "어느 쪽")):
            return True

    # 쉼표/접속어가 많으면 질문이 아니라 설명문처럼 길어지기 쉽다
    if q.count(",") >= 2 or nq.count("그리고") >= 2:
        return True

    return False

def _ai_thin_context_user_suffix(post: Post) -> str:
    if not _post_is_thin_context_post(post):
        return ""
    return (
        "\n\n[주의] 본문 근거가 매우 짧다. "
        "추상적인 감상만 잇달아 묻지 말고, 답하기 쉬운 **한 가지**(기준·조건·쓰임·우선순위 등)로만 물어라."
    )


def _ai_simple_menu_user_suffix(post: Post) -> str:
    """레거시 이름 — `_ai_thin_context_user_suffix`와 동일."""
    return _ai_thin_context_user_suffix(post)


def _ai_question_context_suffix(prev_questions: list[str]) -> str:
    """후반에만 가벼운 참고(의도가 주)."""
    if len(prev_questions) < 3:
        return ""
    used = _used_question_axes(prev_questions)
    if not used:
        return ""
    return (
        "\n\n[참고] 최근에 다룬 관점: "
        + ", ".join(used)
        + ". [질문 의도]에 맞으면 비슷한 각도도 괜찮다."
    )


def _ai_no_tournament_user_suffix(post: Post) -> str:
    """선택지가 많을 때 기계적 1:1만 반복하지 않도록 짧게."""
    if len(post_option_list(post)) < 3:
        return ""
    return (
        "\n\n[참고] 선택지가 3개 이상이다. "
        "같은 문장 틀로 두 개씩만 잘라 반복하지 말고, [질문 의도]에 맞게 한 문장으로 물어라."
    )


def _question_pits_multiple_named_options(question: str, post: Post) -> bool:
    """
    질문에 선택지 이름이 둘 이상 실리고, 두 후보를 맞대 비교하는 뉘앙스면 True.
    (연속 설문형 맞대기 감지용 — 중복/유사도 로직과 별개.)
    """
    opts = post_option_list(post)
    if len(opts) < 2:
        return False
    named = [o for o in opts if _option_named_in_text(o, question)]
    if len(named) < 2:
        return False
    nq = _normalize_question(question)
    markers = (
        "vs",
        "versus",
        "대비",
        "반면",
        "둘 중",
        "둘중",
        "어느 쪽",
        "어느쪽",
        "뭐가 더",
        "무엇이 더",
        "더 중요",
        "더 크게",
        "더 걱정",
        "더 끌",
        "더 선호",
        "나을",
        "낫다",
        "나을까",
        "차라리",
        "호기심",
        "매력",
    )
    if any(m in nq for m in markers):
        return True
    if "중에서" in nq and any(x in nq for x in ("뭐", "어느", "무엇")):
        return True
    if " 와 " in nq or " 과 " in nq or " 이랑 " in nq or " 랑 " in nq:
        if any(
            x in nq
            for x in (
                "뭐",
                "어느",
                "무엇",
                "더 ",
                "나을",
                "편해",
                "불편",
                "부담",
                "자유",
                "걱정",
            )
        ):
            return True
    return False


def _recent_named_option_comparison_count(
    prev_questions: list[str], post: Post, *, window: int = 3
) -> int:
    if not prev_questions:
        return 0
    tail = prev_questions[-window:]
    return sum(1 for q in tail if _question_pits_multiple_named_options(q, post))


def _should_avoid_named_option_comparison(
    prev_questions: list[str], post: Post
) -> bool:
    """최근 질문에서 두 후보 맞대기가 매우 잦을 때만 추가 패널티."""
    if len(prev_questions) < 2:
        return False
    return _recent_named_option_comparison_count(prev_questions, post, window=4) >= 3


def _ai_question_rhythm_user_suffix(
    prev_questions: list[str], post: Post
) -> str:
    """레거시: 맞대기 반복은 패널티·의도로만 가볍게 다룬다."""
    return ""


def _detailed_rhythm_plan_hint(post: Post) -> str:
    """레거시: 질문 횟수·흐름은 시스템 budget 문장으로만 안내한다."""
    return ""


def _simple_rhythm_plan_hint(post: Post) -> str:
    """레거시: `_detailed_rhythm_plan_hint`와 동일하게 비활성."""
    return ""


def _fallback_next_question(
    post: Post, prev_questions: list[str] | None = None
) -> str:
    avoid = (
        prev_questions is not None
        and _should_avoid_named_option_comparison(prev_questions, post)
    )
    if avoid:
        return "생각만 할 때랑, 실제로 해볼 때랑 달라질 것 같은 점이 있어요?"
    if len(post_option_list(post)) == 2:
        return "후보 둘 다 짧게 떠올려 보면, 조금 더 손이 가는 쪽이 있어요?"
    return "후보들 중에서, 놓치면 아쉬울 것 같은 쪽이 있어요?"


def _extract_question_text(data: dict) -> str:
    """
    모델이 {"question": "..."} 대신 {"question": {...}} 같은 형태로 줄 때도 방어.
    """
    q = data.get("question")
    if isinstance(q, str):
        return q
    if isinstance(q, dict):
        # 흔한 케이스: {"question":{"text":"..."}} 또는 {"question":{"question":"..."}}
        for key in ("text", "question", "value", "content"):
            v = q.get(key)
            if isinstance(v, str):
                return v
        return json.dumps(q, ensure_ascii=False)
    if q is None:
        return ""
    return str(q)


def _extract_text(value) -> str:
    """LLM JSON 값이 str이 아닐 때도 안전하게 문자열로 변환."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        for key in ("text", "content", "value", "reason", "comparison", "recommended"):
            v = value.get(key)
            if isinstance(v, str):
                return v
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        # 리스트면 줄바꿈으로 합쳐서 보여주기
        parts = [str(x) for x in value if str(x).strip()]
        return "\n".join(parts)
    return str(value)


def _format_nested_comparison_value(v) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, (int, float, bool)):
        return str(v)
    if isinstance(v, list):
        return " ".join(
            _format_nested_comparison_value(x) for x in v if x is not None
        ).strip()
    if isinstance(v, dict):
        inner = "\n".join(
            f"  - **{str(k).strip()}:** {_format_nested_comparison_value(val)}"
            for k, val in v.items()
        )
        return inner.strip()
    return str(v).strip()


def _normalize_ai_comparison_field(raw) -> str:
    """
    detailed 모드에서 comparison이 JSON 객체로 올 때 그대로 덤프되지 않도록
    마크다운(## 제목, - **항목:** 본문)으로 바꾼다.
    """
    if raw is None:
        return ""
    if isinstance(raw, str):
        s = raw.strip()
        if s.startswith("{") and s.endswith("}"):
            try:
                return _normalize_ai_comparison_field(json.loads(s))
            except json.JSONDecodeError:
                pass
        return s
    if isinstance(raw, list):
        chunks = [_normalize_ai_comparison_field(x) for x in raw if x is not None]
        return "\n\n".join(c for c in chunks if c).strip()
    if isinstance(raw, dict):
        for key in ("text", "content", "markdown", "body"):
            t = raw.get(key)
            if isinstance(t, str) and t.strip():
                return t.strip()
        parts: list[str] = []
        for title, body in raw.items():
            title_s = str(title).strip()
            if isinstance(body, dict):
                parts.append(f"## {title_s}")
                for sk, sv in body.items():
                    sks = str(sk).strip()
                    val = _format_nested_comparison_value(sv)
                    if "\n" in val:
                        parts.append(f"- **{sks}:**")
                        for ln in val.split("\n"):
                            if ln.strip():
                                parts.append(f"  {ln.strip()}")
                    else:
                        parts.append(f"- **{sks}:** {val}")
                parts.append("")
            else:
                parts.append(f"## {title_s}")
                parts.append(_format_nested_comparison_value(body))
                parts.append("")
        return "\n".join(parts).strip()
    return _extract_text(raw).strip()


def _shallow_taste_pair_penalty(
    question: str, post: Post, *, is_first_question: bool
) -> int:
    """단순 취향 재확인(후보 이름 맞대기·끌림만). 가치/우선순위 프레이밍이면 0."""
    if _value_priority_framing_ok(question):
        return 0
    p = 0
    if is_first_question and _first_question_redundant_binary_repeat(question, post):
        p = max(p, 3)
    if _pairwise_preference_between_stated_options(question, post):
        p = max(p, 3)
    if len(post_option_list(post)) == 2 and _binary_followup_forces_option_pick(question, post):
        p = max(p, 2)
    return p


def _fatigue_burden_question_penalty(
    candidate: str,
    prev_questions: list[str],
    last_answer: str | None,
) -> int:
    """직전에 같은 뉘앙스(막힘·피로)만 있었는데 또 비슷하게 묻는 경우."""
    if not prev_questions or not _question_invites_fatigue_burden_axis(candidate):
        return 0
    window = prev_questions[-3:]
    c = sum(1 for q in window if _question_invites_fatigue_burden_axis(q))
    extra = 1 if _last_answer_is_fatigue_short_echo(last_answer) else 0
    if c >= 2:
        return min(8, 5 + extra)
    if c >= 1:
        return min(8, 2 + extra)
    return 0


def question_rejection_penalties(
    candidate: str,
    post: Post,
    prev_questions: list[str],
    last_answer: str | None,
    *,
    is_first_question: bool = False,
) -> tuple[int, dict[str, int]]:
    """
    질문 품질 점수(패널티 합). QUESTION_REJECT_SCORE_THRESHOLD 이상이면 재생성 권장.
    대부분은 낮은 soft penalty; 중복·답 되묻기·얕은 맞대기 등만 상대적으로 크다.
    """
    penalties: dict[str, int] = {}
    if not (candidate or "").strip():
        penalties["empty"] = 99
        return 99, penalties
    total = 0
    dup = 0
    if _is_duplicate_question(candidate, prev_questions):
        dup = max(dup, 4)
    if _question_nearly_duplicate_of_recent(candidate, prev_questions):
        dup = max(dup, 3)
    if dup:
        penalties["duplicate_cluster"] = dup
        total += dup
    if _is_too_similar_to_recent_answer(candidate, last_answer):
        penalties["echo_answer"] = 2
        total += 2
    if _question_is_leading_or_wordy(candidate, post):
        penalties["too_wordy"] = 1
        total += 1
    axis_pen = 0
    if prev_questions:
        ct = _question_theme_set(candidate)
        if ct and ct & _question_theme_set(prev_questions[-1]):
            axis_pen = max(axis_pen, 1)
    dom = _dominant_repeated_theme(prev_questions)
    if dom and dom in _question_theme_set(candidate):
        axis_pen = max(axis_pen, 1)
    if axis_pen:
        penalties["same_axis"] = axis_pen
        total += axis_pen
    st = _shallow_taste_pair_penalty(candidate, post, is_first_question=is_first_question)
    if st:
        penalties["shallow_taste_pair"] = st
        total += st
    if _question_confirms_stated_candidate(candidate, post):
        penalties["confirm_stated"] = 2
        total += 2
    if (
        _stressful_counterfactual_pick_question(candidate)
        and _recent_stressful_counterfactual_pick_count(prev_questions) >= 1
    ):
        penalties["stressful_repeat"] = 2
        total += 2
    if (
        _should_avoid_named_option_comparison(prev_questions, post)
        and _question_pits_multiple_named_options(candidate, post)
        and not _value_priority_framing_ok(candidate)
    ):
        penalties["named_pair_spam"] = 1
        total += 1
    if _simple_menu_overpsych_question_bad(candidate, post):
        penalties["thin_context_vague"] = 2
        total += 2
    if prev_questions:
        last_s = _infer_question_style(prev_questions[-1])
        if _infer_question_style(candidate) == last_s:
            penalties["consecutive_same_style"] = 1
            total += 1
    oc = _options_connection_penalty(candidate, post)
    if oc:
        penalties["options_disconnected"] = oc
        total += oc
    fb = _fatigue_burden_question_penalty(candidate, prev_questions, last_answer)
    if fb:
        penalties["fatigue_axis_repeat"] = fb
        total += fb
    return total, penalties


def question_should_reject(
    candidate: str,
    post: Post,
    prev_questions: list[str],
    last_answer: str | None,
    *,
    is_first_question: bool = False,
) -> bool:
    s, _ = question_rejection_penalties(
        candidate, post, prev_questions, last_answer, is_first_question=is_first_question
    )
    return s >= QUESTION_REJECT_SCORE_THRESHOLD


def random_fun_result_messages(
    post: Post, *, conversation_text: str | None = None
) -> tuple[str, str, str]:
    """질문 없이 후보 중 무작위 1개를 고른 뒤, 그 항목만 짧게 이유(맛·상황·기분 등)를 쓴다. 타 후보와 비교하지 않는다."""
    opts = post_option_list(post)
    if len(opts) < 2:
        raise ValueError("선택지가 부족합니다.")
    rec = random.choice(opts)
    ctx = (conversation_text or "").strip()
    sys_msg = (
        "역할: 가벼운 한 마디 코멘터리. "
        "추천 항목은 이미 무작위로 정해졌다. "
        "recommended는 반드시 user 메시지의 '고정 추천:' 줄과 문자 단위로 동일해야 한다. "
        "reason은 2~4문장, **고정 추천 그 하나만** 다룬다: 오늘 기분·상황에 어울리는 점, 고르거나 쓰면 좋은 점, "
        "가벼운 농담을 섞어도 된다. "
        "**다른 선택지 이름을 말하거나, 타 후보와 비교·서열화하지 마라.** "
        "운세·예언이 맞다고 말하지 마라. "
        'JSON만: {"recommended":"…","reason":"…"}'
    )
    parts: list[str] = [_ai_user_block_post(post)]
    if ctx:
        parts.append(
            "참고용 질문/답변(있으면 말투만 참고하고, 고정 추천은 바꾸지 마라):\n"
            + ctx
            + "\n"
        )
    parts.append(
        f"고정 추천(절대 변경 금지): {rec}\n\n"
        "recommended에 위 문자열을 그대로 두고, "
        "이 추천 **자체**가 왜 괜찮을 수 있는지만 reason에 적어라."
    )
    return sys_msg, "\n".join(parts), rec


AI_CANNED_SKIP_ANSWER = "(이 질문은 넘길게요)"
AI_CANNED_FINISH_ANSWER = "(여기서 끝내고 추천만 볼게요)"

_FINAL_EARLY_FINISH_USER_NOTE = (
    "참고: 사용자가 남은 질문 없이 지금 단계에서 추천을 요청했다. "
    "Q/A가 짧거나 일부를 넘겼어도 글·선택지·나온 답만으로 합리적으로 추천해라. "
    "불확실하면 이유에 한 줄로 밝혀라.\n\n"
)

_FINAL_RECOMMENDATION_COHERENCE = (
    "Q/A 전체를 읽고, 사용자가 말한 내용 중 **서로 다른 뉘앙스**(끌림과 아쉬움, 편함과 귀찮음 등)를 "
    "**이번 대화에 실제로 나온 말**로 이유에서 짧게 짚어라. 추천과 이유가 그 요약과 **모순**되면 안 된다. "
    "특정 단어 목록에 맞춰 억지로 맞추지 말고, 없는 말은 넣지 마라."
)

_FINAL_SYS_DEEP_COMPARISON = (
    "역할: '선택 코치'로서 최종 추천 1개를 낸다. "
    "근거는 오직 글/선택지/질문-답변뿐이며, 없는 사실을 지어내지 않는다. "
    + _FINAL_RECOMMENDATION_COHERENCE
    + " "
    "먼저 Q/A에서 사용자의 우선순위·제약(시간/돈/리스크/노력/관계/건강 등)을 요약해라. "
    "그 기준에 가장 잘 맞는 선택지를 1개 추천한다. "
    "recommended는 반드시 선택지 문자열 중 하나와 정확히 일치해야 한다. "
    "'모르겠다/상관없다' 같은 답은 불확실성으로만 반영하고, 이유에 '가정'을 한 줄로 명시한다. "
    "comparison은 markdown 문자열 하나로, 모든 선택지를 빠짐없이 다룬다. "
    "각 선택지마다 다음 소제목을 포함: "
    "## (선택지 이름)\\n- **잘 맞는 조건:**\\n- **걸리는 점:**\\n- **추천 대상:** "
    '출력은 JSON만: {"recommended":"…","reason":"2~4문장","comparison":"markdown 본문"}'
)


def ai_final_system_user_for_result(
    post: Post,
    conversation_text: str,
    *,
    early_finish: bool = False,
) -> tuple[str, str, str | None]:
    """최종 추천 LLM 호출용 (system, user, friend/quick/deep). random_fun은 별도 처리."""
    m = normalize_ai_mode(getattr(post, "ai_mode", None))
    early = _FINAL_EARLY_FINISH_USER_NOTE if early_finish else ""
    base_user = _ai_user_block_post(post) + f"질문/답변:\n{conversation_text}\n\n{early}"

    if m == "deep":
        return (
            _FINAL_SYS_DEEP_COMPARISON,
            base_user + "최종 추천과 선택지별 비교를 작성해라.",
            None,
        )

    if m == "friend":
        sys_msg = (
            "역할: 친한 친구처럼 말하는 선택 도우미(**반말**). "
            "근거는 오직 글/선택지/질문-답변뿐. 없는 사실을 지어내지 않는다. "
            + _FINAL_RECOMMENDATION_COHERENCE
            + " "
            "recommended는 반드시 선택지 문자열 중 하나와 정확히 일치해야 한다. "
            "reason은 4~7문장, **반말**로 써라(존댓말·‘해요’체 금지). "
            "대화 톤은 이어가도 되되 **새 사실은 Q/A에 근거**를 둔다. "
            "'그럴 수 있지' '이해해'처럼 빈 공감 문장만으로 시작하거나 채우지 마라. "
            "과한 심리분석·진단 톤은 피한다. "
            'JSON만: {"recommended":"…","reason":"…"}'
        )
        return (
            sys_msg,
            base_user
            + "지금 대화를 반영해 한 가지를 추천하고 이유를 써라. "
            "말투는 친구에게 하는 **반말**로. "
            "결론을 강요하는 말투는 피하고, 이유는 **천천히 짚는** 느낌으로.",
            None,
        )

    sys_msg = (
        "역할: '선택 코치'로서 최종 추천 1개와 이유를 쓴다. "
        "근거는 오직 글/선택지/질문-답변뿐이며, 없는 사실을 지어내지 않는다. "
        + _FINAL_RECOMMENDATION_COHERENCE
        + " "
        "Q/A에서 사용자의 우선순위·제약을 1~2개로 요약한 뒤, 그 기준에 맞춰 추천한다. "
        "recommended는 반드시 선택지 문자열 중 하나와 정확히 일치해야 한다. "
        "'모르겠다/상관없다' 같은 답은 불확실성으로만 반영하고, 이유에 가정을 짧게 적는다. "
        "이유는 2~3문장, **한 줄에 한 포인트** 위주. 서두·위로·잡담으로 분량 채우지 않는다. "
        'JSON만: {"recommended":"…","reason":"2~3문장"}'
    )
    return (
        sys_msg,
        base_user + "최종 추천을 작성해라. 이유는 짧고 결정적으로.",
        None,
    )


__all__ = [
    "_parse_ai_json_response",
    "normalize_ai_mode",
    "DecisionStage",
    "QuestionIntent",
    "QUESTION_REJECT_SCORE_THRESHOLD",
    "classify_decision_stage",
    "select_question_intent",
    "question_rejection_penalties",
    "question_should_reject",
    "default_ai_question_steps_for_mode",
    "random_fun_result_messages",
    "AI_CANNED_SKIP_ANSWER",
    "AI_CANNED_FINISH_ANSWER",
    "ai_final_system_user_for_result",
    "_ai_max_question_steps",
    "_require_ai_post",
    "_normalize_question",
    "_is_duplicate_question",
    "_is_too_similar_to_recent_answer",
    "_option_named_in_text",
    "_post_states_binary_dilemma_between_options",
    "_first_question_redundant_binary_repeat",
    "_anti_binary_redundant_user_suffix",
    "_post_user_prose_blob",
    "_value_priority_framing_ok",
    "_decision_stage_user_suffix",
    "_question_intent_user_suffix",
    "_stall_guard_user_suffix",
    "_first_question_human_opening_suffix",
    "_ai_question_style_rotation_suffix",
    "_question_theme_set",
    "_pairwise_preference_between_stated_options",
    "_question_confirms_stated_candidate",
    "_anti_obvious_restate_user_suffix",
    "_stressful_counterfactual_pick_question",
    "_recent_stressful_counterfactual_pick_count",
    "_second_or_later_stressful_counterfactual_bad",
    "_answer_consistency_user_suffix",
    "_anti_multi_pet_family_doom_from_answers",
    "_question_has_emotional_or_value_framing",
    "_binary_followup_forces_option_pick",
    "_next_ai_user_suffix_binary",
    "_next_ai_sys_suffix_binary",
    "_answer_is_low_information",
    "_smart_fallback_question",
    "_used_question_axes",
    "_question_overlaps_covered_axes",
    "_question_matched_themes",
    "_recent_theme_overuse_bad",
    "_question_nearly_duplicate_of_recent",
    "_binary_option_side_echo_bad",
    "_any_recent_theme_saturated",
    "_ai_theme_stretch_user_suffix",
    "_ai_binary_option_balance_suffix",
    "_question_is_pairwise_tournament",
    "_ai_system_prompt_question",
    "_ai_question_examples_for_mode",
    "_ai_mode_question_user_suffix",
    "_ai_user_block_post",
    "_post_is_thin_context_post",
    "_post_is_simple_menu_style",
    "_question_has_menu_overpsych_probe",
    "_simple_menu_overpsych_question_bad",
    "_question_is_leading_or_wordy",
    "_ai_thin_context_user_suffix",
    "_ai_simple_menu_user_suffix",
    "_ai_question_context_suffix",
    "_ai_no_tournament_user_suffix",
    "_question_pits_multiple_named_options",
    "_recent_named_option_comparison_count",
    "_should_avoid_named_option_comparison",
    "_ai_question_rhythm_user_suffix",
    "_detailed_rhythm_plan_hint",
    "_simple_rhythm_plan_hint",
    "_fallback_next_question",
    "_extract_question_text",
    "_extract_text",
    "_format_nested_comparison_value",
    "_normalize_ai_comparison_field",
]
