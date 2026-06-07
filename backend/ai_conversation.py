"""AI question flow — 대화형 의사결정 코치. 프롬프트 중심, 검증은 최소."""
from __future__ import annotations

import difflib
import json
import random
import re

from fastapi import HTTPException

from models import Post
from post_utils import post_option_list, tags_list

# --- 모드 ---
AI_MODE_CANONICAL = frozenset({"quick", "deep", "friend", "random_fun"})
_LEGACY_AI_MODE_MAP = {"simple": "quick", "detailed": "deep", "balance_game": "quick"}


def normalize_ai_mode(raw: str | None) -> str:
    if raw is None or not str(raw).strip():
        return "quick"
    m = str(raw).strip().lower()
    return _LEGACY_AI_MODE_MAP.get(m, m if m in AI_MODE_CANONICAL else "quick")


def default_ai_question_steps_for_mode(mode: str) -> int:
    return {"quick": 3, "deep": 7, "friend": 5, "random_fun": 3}.get(
        normalize_ai_mode(mode), 4
    )


def _ai_max_question_steps(post: Post) -> int:
    raw = getattr(post, "ai_question_steps", None)
    if raw is not None:
        try:
            n = int(raw)
            if 3 <= n <= 10:
                return n
        except (TypeError, ValueError):
            pass
    return default_ai_question_steps_for_mode(getattr(post, "ai_mode", None))


def _require_ai_post(post: Post) -> None:
    if (getattr(post, "post_kind", None) or "community") != "ai":
        raise HTTPException(
            status_code=400,
            detail="AI 질문·추천은 'AI와 함께 고민하기'로 작성한 글에서만 사용할 수 있어요.",
        )


# --- JSON / 텍스트 ---
def _parse_ai_json_response(raw: str | None) -> dict:
    s = (raw or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```\w*\n?", "", s)
        s = re.sub(r"\n?```\s*$", "", s).strip()
    brace = re.search(r"\{[\s\S]*\}", s)
    return json.loads(brace.group(0) if brace else s)


def _extract_question_text(data: dict) -> str:
    q = data.get("question")
    if isinstance(q, str):
        return q
    if isinstance(q, dict):
        for key in ("text", "question", "value", "content"):
            v = q.get(key)
            if isinstance(v, str):
                return v
        return json.dumps(q, ensure_ascii=False)
    return "" if q is None else str(q)


def _extract_text(value) -> str:
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
        return "\n".join(str(x) for x in value if str(x).strip())
    return str(value)


def _normalize_ai_comparison_field(raw) -> str:
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
        return "\n\n".join(_normalize_ai_comparison_field(x) for x in raw if x is not None).strip()
    if isinstance(raw, dict):
        for key in ("text", "content", "markdown", "body"):
            t = raw.get(key)
            if isinstance(t, str) and t.strip():
                return t.strip()
        parts = [f"## {k}\n{_extract_text(v)}" for k, v in raw.items()]
        return "\n\n".join(parts).strip()
    return _extract_text(raw).strip()


def _normalize_text(s: str | None) -> str:
    t = re.sub(r"\s+", " ", (s or "").strip())
    t = re.sub(r"[?!.…]+$", "", t).strip()
    return t.lower()


def _option_named_in_text(opt: str, text: str) -> bool:
    """선택지 문자열이 질문에 그대로 포함됐는지 (부분 문자열)."""
    o = _normalize_text(opt)
    h = _normalize_text(text)
    return bool(o and h and len(o) >= 2 and o in h)


def _tone_for_mode(mode: str) -> str:
    m = normalize_ai_mode(mode)
    if m == "friend":
        return "친한 친구처럼 편한 **반말** (이모지 없음)"
    if m == "deep":
        return "차분하고 따뜻한 존댓말, 조금 여유 있게"
    if m == "random_fun":
        return "가볍고 재미있게, 부담 없이"
    return "가볍고 자연스러운 존댓말, 짧게"


# --- 질문 프롬프트: build_question_prompt → LLM → accept_generated_question ---
def _ai_user_block_post(post: Post) -> str:
    tags = tags_list(post)
    return (
        f"제목: {post.title}\n"
        f"본문:\n{post.content or '(없음)'}\n"
        f"선택지: {post.options}\n"
        f"분류(참고): {post.category}\n"
        + (f"태그: {', '.join(tags)}\n" if tags else "")
    )


def _length_hint(mode: str) -> str:
    m = normalize_ai_mode(mode)
    if m == "deep":
        return "한 문장, 80자 안팎"
    if m == "friend":
        return "한 문장, 70자 안팎"
    return "한 문장, 60자 안팎"


def question_system_prompt(mode: str, *, max_rounds: int = 4) -> str:
    """질문 생성 system 프롬프트 (단일 조립 지점)."""
    tone = _tone_for_mode(mode)
    length = _length_hint(mode)
    return (
        "당신은 ChatGPT처럼 자연스럽게 고민을 들어주는 상담자입니다. 설문·면접관이 아닙니다.\n\n"
        "**하는 일:** 글과 지금까지 대화만 보고, 선택을 돕는 데 "
        "**지금 가장 도움이 될 질문 1개**를 스스로 정합니다.\n"
        "**하지 않는 일:** 선택지 중 하나를 바로 고르게 하지 말고, "
        "사용자의 판단 기준을 자연스럽게 물어라. 추천 시점은 사용자/설정이 결정한다.\n\n"
        "**원칙:**\n"
        "1. 글과 대화만 근거로 한다. 없는 정보는 만들지 않는다.\n"
        "2. 매 질문마다 아직 탐색하지 않은 새로운 기준을 골라라. "
        "탐색 가능한 기준: 현재 상태, 과거 경험, 외부 제약, "
        "주변 관계, 미래 계획, 가치관, 우선순위, 직감, "
        "실용적 조건, 기대하는 결과, 걱정되는 점, 이상적인 상황.\n"
        "3. 선택지 이름을 질문에 직접 넣지 않는다. "
        "단, 고민 맥락에서 자연스럽게 나오는 속성이나 "
        "감각적 표현은 자유롭게 물어볼 수 있다.\n"
        "4. 한 문장, 말하듯 자연스럽게. 고민의 무게에 맞게 조절한다.\n"
        "   질문 하나에 하나의 기준만 담아라.\n"
        "   사용자가 '네/아니오' 또는 한두 마디로 바로 답할 수 있을 만큼\n"
        "   좁고 구체적으로 물어라.\n"
        "   아래 예시는 스타일 참고용이며 그대로 쓰지 않는다.\n"
        "   맥락에 맞게 완전히 다른 표현으로 만들어라.\n"
        "   \n"
        "   나쁜 예:\n"
        "   - '기분이나 상황에 따라 어떤 게 끌리세요?'\n"
        "   - '어떤 점을 가장 중요하게 생각하세요?'\n"
        "   \n"
        "   좋은 예:\n"
        "   - '오늘 든든하게 먹고 싶은 날이에요?'\n"
        "   - '요즘 새로운 걸 시도해보고 싶은 편이에요?'\n"
        "   - '이번 결정이 1년 뒤에도 중요할 것 같아요?'\n\n"
        f"말투: {tone}\n"
        f"형식: {length}\n"
        f"\n이 대화에서 질문은 최대 {max_rounds}번까지 가능합니다."
        f'\n\nJSON만: {{"question":"..."}}'
    )


def _conversation_guidance(conversation_text: str) -> str:
    if not conversation_text.strip():
        return ""
    answers = _answers_from_conversation(conversation_text)
    if not answers:
        return ""
    if _is_canned_skip(answers[-1]):
        return "\n직전 질문은 스킵됐습니다. 다른 방향으로, 답하기 쉽게 한 가지만 물어보세요."
    return "\n위 대화를 읽고, 지금 가장 도움이 될 질문 하나만 이어가세요."


def build_question_prompt(
    post: Post,
    *,
    conversation_text: str,
    prev_questions: list[str],
    step: int,
    max_steps: int,
    mode: str,
) -> tuple[str, str]:
    """(system, user) — 질문 생성용 프롬프트."""
    _ = prev_questions
    system = question_system_prompt(mode, max_rounds=max_steps)
    base = _ai_user_block_post(post)
    if conversation_text.strip():
        user = (
            base
            + f"\n지금까지 대화:\n{conversation_text}\n"
            + f"\n{step}/{max_steps}번째 질문입니다."
            + _conversation_guidance(conversation_text)
        )
    else:
        user = base + "\n첫 질문입니다. 글을 읽고, 상담하듯 자연스럽게 한 마디만 하세요."
    return system, user


def build_answer_suggestions_prompt(
    post: Post,
    *,
    question: str,
    conversation_text: str,
    mode: str,
) -> tuple[str, str]:
    """질문 맥락에 맞는 빠른 답변 버튼 3개 생성용."""
    tone = _tone_for_mode(mode)
    system = (
        "당신은 고민 상담 UI용 **빠른 답변 버튼** 문구를 만듭니다.\n"
        f"말투: {tone}\n"
        "선택지 이름을 넣지 마라.\n"
        "각 답은 한두 마디로, '네/아니오'로 바로 답하거나 짧게 말할 수 있게.\n"
        'JSON만: {"suggested_answers": ["...", "...", "..."]} (정확히 3개)'
    )
    user = (
        _ai_user_block_post(post)
        + (
            f"\n지금까지 대화:\n{conversation_text}\n"
            if conversation_text.strip()
            else ""
        )
        + f"\n지금 AI 질문:\n{question}\n\n"
        "이 질문과 글 맥락에 맞는 빠른 답변 예시 3개만 만들어라."
    )
    return system, user


SUGGESTED_ANSWER_MAX_CHARS = 60
SUGGESTED_ANSWER_COUNT = 3
SUGGESTED_ANSWER_GENERATION_MAX_ATTEMPTS = 3


def _suggested_answer_is_valid(s: str, post: Post, existing: list[str]) -> bool:
    t = (s or "").strip()
    if not t or len(t) > SUGGESTED_ANSWER_MAX_CHARS:
        return False
    if t in existing:
        return False
    if any(_option_named_in_text(o, t) for o in post_option_list(post)):
        return False
    return True


def normalize_suggested_answers(
    raw,
    post: Post,
    *,
    existing: list[str] | None = None,
) -> list[str]:
    """LLM suggested_answers → 유효한 짧은 문장만 (기존 목록과 중복 제외)."""
    out: list[str] = list(existing or [])
    if not isinstance(raw, list):
        return out[:SUGGESTED_ANSWER_COUNT]
    for item in raw:
        s = (_extract_text(item) if not isinstance(item, str) else item).strip()
        if _suggested_answer_is_valid(s, post, out):
            out.append(s)
        if len(out) >= SUGGESTED_ANSWER_COUNT:
            break
    return out[:SUGGESTED_ANSWER_COUNT]


def suggested_answer_retry_suffix(attempt_index: int, partial: list[str]) -> str:
    if attempt_index <= 0:
        return ""
    avoid = ", ".join(f'"{a}"' for a in partial) if partial else ""
    extra = f"이미 있는 답({avoid})과 겹치지 않는 " if avoid else ""
    return (
        "\n\n방금 후보는 부족했습니다. "
        f"{extra}서로 다른 빠른 답변 {SUGGESTED_ANSWER_COUNT}개를 JSON으로 다시 답하세요."
    )


def generic_suggested_answer_pool(mode: str) -> list[str]:
    if normalize_ai_mode(mode) == "friend":
        return [
            "응, 그래",
            "아니, 별로야",
            "잘 모르겠어",
            "그런 편이야",
            "그렇지 않아",
            "보통이야",
        ]
    return [
        "네, 그래요",
        "아니요, 아니에요",
        "잘 모르겠어요",
        "그런 편이에요",
        "그렇지 않아요",
        "보통이에요",
    ]


def _last_resort_suggested_answer_pool(mode: str) -> list[str]:
    if normalize_ai_mode(mode) == "friend":
        return [
            "음, 그런 것 같아",
            "음, 그렇진 않아",
            "좀 애매해",
            "딱히 없어",
        ]
    return [
        "음, 그런 것 같아요",
        "음, 그렇진 않아요",
        "좀 애매해요",
        "딱히 없어요",
    ]


def complete_suggested_answers(
    partial: list[str],
    post: Post,
    *,
    mode: str,
) -> list[str]:
    """부족분은 범용 답으로 채워 항상 3개를 반환."""
    out: list[str] = []
    for s in partial:
        if _suggested_answer_is_valid(s, post, out):
            out.append(s.strip())
    for filler in (
        generic_suggested_answer_pool(mode) + _last_resort_suggested_answer_pool(mode)
    ):
        if len(out) >= SUGGESTED_ANSWER_COUNT:
            break
        if _suggested_answer_is_valid(filler, post, out):
            out.append(filler)
    idx = 0
    while len(out) < SUGGESTED_ANSWER_COUNT and idx < 6:
        idx += 1
        candidate = (
            f"잘 모르겠어 ({idx})"
            if normalize_ai_mode(mode) == "friend"
            else f"잘 모르겠어요 ({idx})"
        )
        if _suggested_answer_is_valid(candidate, post, out):
            out.append(candidate)
    return out[:SUGGESTED_ANSWER_COUNT]


# --- 질문 검증 (최소) ---
QUESTION_MAX_LENGTH_CHARS = 150
QUESTION_GENERATION_MAX_ATTEMPTS = 3


def question_is_unacceptable(
    question: str,
    post: Post,
    prev_questions: list[str],
    last_answer: str | None = None,
    *,
    step: int = 1,
) -> bool:
    """빈 문자열·과도한 길이·선택지 이름 노출·거의 동일한 재질문."""
    _ = (last_answer, step)
    q = (question or "").strip()
    if not q or len(q) > QUESTION_MAX_LENGTH_CHARS:
        return True

    if any(_option_named_in_text(o, q) for o in post_option_list(post)):
        return True

    nq = _normalize_text(q)
    for pq in prev_questions:
        pn = _normalize_text(pq)
        if pn and difflib.SequenceMatcher(None, nq, pn).ratio() >= 0.88:
            return True

    return False


def question_generation_retry_suffix(attempt_index: int) -> str:
    if attempt_index <= 0:
        return ""
    return (
        "\n\n방금 후보는 쓸 수 없었습니다. "
        "선택을 바로 강요하지 않고, 다른 각도의 자연스러운 질문 하나만 JSON으로 답하세요."
    )


def accept_generated_question(
    question: str,
    post: Post,
    prev_questions: list[str],
    last_answer: str | None = None,
    *,
    step: int = 1,
) -> bool:
    return not question_is_unacceptable(
        question, post, prev_questions, last_answer, step=step
    )


def resolve_question_generation_fallback(last_candidate: str) -> str | None:
    s = (last_candidate or "").strip()
    return s or None


AI_CANNED_SKIP_ANSWER = "(이 질문은 넘길게요)"
AI_CANNED_FINISH_ANSWER = "(여기서 끝내고 추천만 볼게요)"


def _is_canned_skip(answer: str | None) -> bool:
    """프론트 '질문 건너뛰기' → AI_CANNED_SKIP_ANSWER 로 저장됨."""
    return _normalize_text(answer or "") == _normalize_text(AI_CANNED_SKIP_ANSWER)


def _is_canned_finish(answer: str | None) -> bool:
    """프론트 '바로 추천' → AI_CANNED_FINISH_ANSWER 로 저장됨."""
    a = _normalize_text(answer or "")
    base = _normalize_text(AI_CANNED_FINISH_ANSWER)
    return a == base or a.startswith(base + " ")


def _answers_from_conversation(conversation_text: str) -> list[str]:
    answers: list[str] = []
    for line in conversation_text.splitlines():
        if line.strip().upper().startswith("A") and ":" in line:
            answers.append(line.split(":", 1)[1].strip())
    return answers


def _conversation_has_usable_answers(conversation_text: str) -> bool:
    """Q/A에서 추천 근거로 쓸 만한 답이 하나라도 있는지."""
    for a in _answers_from_conversation(conversation_text):
        s = (a or "").strip()
        if not s or _is_canned_skip(s) or _is_canned_finish(s):
            continue
        if re.fullmatch(r"[\s?!.…]+", s):
            continue
        return True
    return False


# --- 최종 추천 ---
_FINAL_EARLY_NOTE = (
    "Q/A가 짧아도 나온 답만으로 추천해라. 없는 근거는 만들지 마라.\n\n"
)

_FINAL_REASON_RULE = (
    "reason에는 사용자가 Q/A에서 **실제로 한 말**을 되짚어 근거로 삼아라. "
    "답이 짧아도 있는 말만 쓰고, 없는 기준·상황은 지어내지 마라. "
    "대화 근거가 부족하면 글·선택지 내용으로 자연스럽게 이유를 써라. "
    "'종합적으로'만 쓰고 끝내지 마라."
)


def recommendation_low_confidence(conversation_text: str) -> bool:
    """Q/A에서 추천 근거로 쓸 만한 답이 없으면 True."""
    return not _conversation_has_usable_answers(conversation_text)


def _final_result_json_schema(mode: str, *, low_confidence: bool) -> str:
    low_note = (
        " Q/A 근거가 거의 없으므로 low_confidence는 true로 설정해라."
        if low_confidence
        else ""
    )
    if normalize_ai_mode(mode) == "deep":
        return (
            'JSON: {"recommended":"…","reason":"…","comparison":"…",'
            '"low_confidence":true|false}'
            + low_note
        )
    return (
        'JSON: {"recommended":"…","reason":"…","low_confidence":true|false}'
        + low_note
    )


def parse_low_confidence_flag(raw, *, conversation_text: str) -> bool:
    """프롬프트·대화 상태를 합쳐 최종 low_confidence 결정."""
    if recommendation_low_confidence(conversation_text):
        return True
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        return raw.strip().lower() in ("true", "1", "yes")
    return False

_LEGACY_REASON_DISCLAIMER = re.compile(
    r"(?:[.!?…]\s*|\s+)?대화에서\s*기준이\s*드러나지\s*않아\.?\s*$",
    re.UNICODE,
)


def _strip_legacy_reason_disclaimer(text: str) -> str:
    return _LEGACY_REASON_DISCLAIMER.sub("", (text or "").strip()).strip()


def sanitize_ai_reason(reason: str) -> str:
    """예전 프롬프트가 붙이던 고정 면책 문장 제거."""
    s = (reason or "").strip()
    if not s:
        return s
    sep = "\n\n---\n\n"
    if sep in s:
        head, rest = s.split(sep, 1)
        return f"{_strip_legacy_reason_disclaimer(head)}{sep}{rest}".strip()
    return _strip_legacy_reason_disclaimer(s)


def ai_final_system_user_for_result(
    post: Post,
    conversation_text: str,
    *,
    early_finish: bool = False,
) -> tuple[str, str, str | None]:
    m = normalize_ai_mode(getattr(post, "ai_mode", None))
    early = _FINAL_EARLY_NOTE if early_finish else ""
    base_user = _ai_user_block_post(post) + f"질문/답변:\n{conversation_text}\n\n{early}"
    low_confidence = recommendation_low_confidence(conversation_text)

    if low_confidence:
        base_user += (
            "참고: Q/A가 거의 없거나 스킵만 있다. "
            "글·선택지를 중심으로 추천 이유를 자연스럽게 써라. "
            "low_confidence는 true로 설정해라.\n\n"
        )

    json_schema = _final_result_json_schema(m, low_confidence=low_confidence)

    if m == "deep":
        sys_msg = (
            "역할: 선택을 돕는 조언자. 근거는 글·선택지·Q/A뿐. "
            + _FINAL_REASON_RULE
            + " "
            "recommended는 선택지 문자열과 정확히 일치. "
            "comparison은 markdown, 선택지마다 ## 제목 + 잘 맞는 조건/걸리는 점/추천 대상. "
            + json_schema
        )
        return sys_msg, base_user + "추천과 선택지별 비교를 작성해라.", None

    if m == "friend":
        sys_msg = (
            "역할: 친구처럼 추천 (**반말**). "
            + _FINAL_REASON_RULE
            + " "
            "recommended는 선택지와 정확히 일치. reason 4~6문장 반말. "
            + json_schema
        )
        return sys_msg, base_user + "대화 반영해서 하나 추천하고 이유 써.", None

    sys_msg = (
        "역할: 고민 들어준 뒤 하나를 추천. "
        + _FINAL_REASON_RULE
        + " "
        "recommended는 선택지와 정확히 일치. reason 2~4문장. "
        + json_schema
    )
    return sys_msg, base_user + "최종 추천 작성.", None


def random_fun_result_messages(
    post: Post, *, conversation_text: str | None = None
) -> tuple[str, str, str]:
    opts = post_option_list(post)
    if len(opts) < 2:
        raise ValueError("선택지가 부족합니다.")
    rec = random.choice(opts)
    sys_msg = (
        "가벼운 코멘트. recommended는 user의 '고정 추천:'과 동일. "
        "reason 2~4문장, 고정 추천 하나만. 타 후보 언급 금지. "
        'JSON: {"recommended":"…","reason":"…"}'
    )
    parts = [_ai_user_block_post(post)]
    if conversation_text:
        parts.append(f"참고 Q/A:\n{conversation_text}\n")
    parts.append(f"고정 추천: {rec}")
    return sys_msg, "\n".join(parts), rec


__all__ = [
    "AI_CANNED_FINISH_ANSWER",
    "AI_CANNED_SKIP_ANSWER",
    "QUESTION_GENERATION_MAX_ATTEMPTS",
    "SUGGESTED_ANSWER_COUNT",
    "SUGGESTED_ANSWER_GENERATION_MAX_ATTEMPTS",
    "accept_generated_question",
    "complete_suggested_answers",
    "ai_final_system_user_for_result",
    "build_answer_suggestions_prompt",
    "build_question_prompt",
    "question_system_prompt",
    "default_ai_question_steps_for_mode",
    "normalize_ai_mode",
    "normalize_suggested_answers",
    "parse_low_confidence_flag",
    "question_generation_retry_suffix",
    "suggested_answer_retry_suffix",
    "question_is_unacceptable",
    "random_fun_result_messages",
    "recommendation_low_confidence",
    "resolve_question_generation_fallback",
    "sanitize_ai_reason",
    "_ai_max_question_steps",
    "_ai_user_block_post",
    "_extract_question_text",
    "_extract_text",
    "_normalize_ai_comparison_field",
    "_parse_ai_json_response",
    "_require_ai_post",
]
