from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_, case, literal
import os
import re
import json
import hashlib
import secrets
import uuid
import difflib
from datetime import datetime, timedelta, timezone
from pathlib import Path

from openai import OpenAI
from dotenv import load_dotenv

# database import보다 먼저 .env 적용 (아니면 DATABASE_URL 없이 engine이 만들어짐)
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

from database import engine, get_db
from models import Base
from models import (
    Post,
    Comment,
    Vote,
    AIInteraction,
    User,
    PostLike,
    Report,
    UserBlock,
    PasswordResetToken,
    Notification,
)
from schemas import (
    PostCreate,
    PostUpdate,
    PostResponse,
    PaginatedPosts,
    CommentCreate,
    CommentUpdate,
    CommentResponse,
    VoteCreate,
    VoteResponse,
    VoteCountResponse,
    AIQuestionFlowResponse,
    AITranscriptItem,
    AIAnswerRequest,
    UserRegister,
    UserLogin,
    TokenResponse,
    UserPublic,
    UserProfileUpdate,
    CategoryStat,
    PopularPostBrief,
    PopularPostByViewsBrief,
    RecentCommentBrief,
    LikeToggleResponse,
    ReportCreate,
    ReportResponse,
    ReportAdminPatch,
    UserBlockCreate,
    UserBlockResponse,
    PasswordChangeBody,
    ForgotPasswordBody,
    ResetPasswordBody,
    ForgotPasswordResponse,
    MessageResponse,
    TagSuggestRequest,
    TagSuggestResponse,
    AdminUserBrief,
    AdminUserPatch,
    AdminPostPatch,
    PaginatedReports,
    PaginatedAdminUsers,
    NotificationResponse,
    PaginatedNotifications,
    NotificationUnreadCount,
    SimilarPostBrief,
)
from auth import hash_password, verify_password, create_access_token
from deps import get_current_user, get_current_user_optional, get_current_admin
from migrate_schema import run_schema_migrations
from categories import ALLOWED_CATEGORIES


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
_UPLOAD_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
_UPLOAD_MAX_BYTES = 5 * 1024 * 1024

PASSWORD_RESET_DEBUG = os.getenv("PASSWORD_RESET_DEBUG", "").strip().lower() in (
    "1",
    "true",
    "yes",
)

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://choice-community.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 테이블 생성
Base.metadata.create_all(bind=engine)
run_schema_migrations()

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def _tags_list(post: Post) -> list[str]:
    raw = getattr(post, "tags", None) or ""
    return [x.strip() for x in str(raw).split(",") if x.strip()]


def _notify(
    db: Session,
    *,
    user_id: int | None,
    kind: str,
    title: str,
    body: str,
    post_id: int | None = None,
    comment_id: int | None = None,
    report_id: int | None = None,
) -> None:
    if not user_id:
        return
    db.add(
        Notification(
            user_id=user_id,
            kind=kind,
            title=title[:255],
            body=body,
            post_id=post_id,
            comment_id=comment_id,
            report_id=report_id,
        )
    )


def _comment_reply_counts(db: Session, comment_ids: list[int]) -> dict[int, int]:
    if not comment_ids:
        return {}
    rows = (
        db.query(Comment.parent_id, func.count(Comment.id))
        .filter(
            Comment.parent_id.in_(comment_ids),
            Comment.deleted_at.is_(None),
        )
        .group_by(Comment.parent_id)
        .all()
    )
    return {int(pid): int(cnt) for pid, cnt in rows if pid is not None}


def _comment_to_response(
    c: Comment,
    nick_map: dict[int, str | None],
    reply_map: dict[int, int],
) -> CommentResponse:
    return CommentResponse(
        id=c.id,
        content=c.content,
        post_id=c.post_id,
        user_id=c.user_id,
        author_nickname=nick_map.get(c.user_id) if c.user_id else None,
        parent_id=getattr(c, "parent_id", None),
        reply_count=reply_map.get(c.id, 0),
        created_at=c.created_at,
    )


def _nickname_map(db: Session, user_ids: set[int]) -> dict[int, str | None]:
    if not user_ids:
        return {}
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    return {u.id: u.nickname for u in users}


def _vote_deadline_passed(post: Post) -> bool:
    dl = getattr(post, "vote_deadline_at", None)
    if dl is None:
        return False
    now = datetime.now(timezone.utc)
    if dl.tzinfo is None:
        dl = dl.replace(tzinfo=timezone.utc)
    else:
        dl = dl.astimezone(timezone.utc)
    return now > dl


def _post_to_response(
    post: Post,
    nick_map: dict[int, str | None],
    *,
    liked_by_me: bool | None = None,
) -> PostResponse:
    kind = getattr(post, "post_kind", None) or "community"
    return PostResponse(
        id=post.id,
        title=post.title,
        content=post.content,
        category=post.category,
        options=post.options,
        post_kind=kind,
        ai_mode=getattr(post, "ai_mode", None),
        view_count=getattr(post, "view_count", None) or 0,
        like_count=getattr(post, "like_count", None) or 0,
        liked_by_me=liked_by_me,
        ai_recommended=getattr(post, "ai_recommended", None),
        ai_reason=getattr(post, "ai_reason", None),
        ai_transcript_public=bool(getattr(post, "ai_transcript_public", False)),
        user_id=post.user_id,
        author_nickname=nick_map.get(post.user_id) if post.user_id else None,
        created_at=post.created_at,
        is_hidden=bool(getattr(post, "is_hidden", False)),
        tags=_tags_list(post),
        vote_deadline_at=getattr(post, "vote_deadline_at", None),
    )


def _posts_ilike_pattern(raw: str) -> str:
    """ILIKE용 패턴. %, _ 와일드카드·과도한 길이 방지."""
    s = (raw or "").strip()[:200]
    s = s.replace("%", "").replace("_", "")
    return f"%{s}%" if s else ""


def _apply_post_search(query, q: str | None):
    pattern = _posts_ilike_pattern(q or "")
    if not pattern:
        return query
    return query.filter(
        or_(
            Post.title.ilike(pattern),
            Post.content.ilike(pattern),
            Post.options.ilike(pattern),
        )
    )


def _hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _get_blocked_ids(db: Session, blocker_id: int) -> set[int]:
    rows = (
        db.query(UserBlock.blocked_id)
        .filter(UserBlock.blocker_id == blocker_id)
        .all()
    )
    return {r[0] for r in rows}


def _posts_list_query(db: Session, current_user: User | None):
    q = db.query(Post).filter(Post.deleted_at.is_(None))
    if current_user is None or not getattr(current_user, "is_admin", False):
        # is_hidden IS NULL 인 레거시 행도 목록에 포함 (== False 는 NULL 행을 SQL에서 제외함)
        q = q.filter(func.coalesce(Post.is_hidden, False).is_(False))
    if current_user:
        blocked = _get_blocked_ids(db, current_user.id)
        if blocked:
            q = q.filter(or_(Post.user_id.is_(None), ~Post.user_id.in_(blocked)))
    return q


def _post_to_similar_brief(post: Post) -> SimilarPostBrief:
    kind = getattr(post, "post_kind", None) or "community"
    return SimilarPostBrief(
        id=post.id,
        title=post.title,
        category=post.category,
        post_kind=kind,
        view_count=getattr(post, "view_count", None) or 0,
        like_count=getattr(post, "like_count", None) or 0,
        created_at=post.created_at,
        tags=_tags_list(post),
    )


def _get_post_or_404(
    db: Session,
    post_id: int,
    current_user: User | None,
) -> Post:
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    admin = current_user is not None and getattr(current_user, "is_admin", False)
    author = (
        current_user is not None
        and post.user_id is not None
        and post.user_id == current_user.id
    )
    if post.deleted_at is not None and not admin:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if getattr(post, "is_hidden", False) and not admin and not author:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    return post


def _parse_ai_json_response(raw: str | None) -> dict:
    s = (raw or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```\w*\n?", "", s)
        s = re.sub(r"\n?```\s*$", "", s).strip()
    brace = re.search(r"\{[\s\S]*\}", s)
    return json.loads(brace.group(0) if brace else s)


def _ai_max_question_steps(post: Post) -> int:
    """저장된 질문 개수가 이 값에 도달하면 다음 답변 후 최종 추천. simple=3, detailed=5."""
    if (getattr(post, "ai_mode", None) or "simple") == "detailed":
        return 5
    return 3


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
    opts = _post_option_list(post)
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
    if not _post_states_binary_dilemma_between_options(post):
        return False
    opts = _post_option_list(post)
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
        "첫 질문은 '이름만 나열하고 어느 쪽'처럼 딱 자르지 말고, "
        "지금 마음·부담·설렘·후회 같은 감정이나 상황이 드러나게 한 번 물어라."
    )


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
    opts = _post_option_list(post)
    if len(opts) != 2:
        return False
    if _question_has_emotional_or_value_framing(question):
        return False
    nq = _normalize_question(question)
    if _option_named_in_text(opts[0], question) and _option_named_in_text(opts[1], question):
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
    if len(_post_option_list(post)) != 2:
        return ""
    return (
        "\n\n[주의] 선택지가 2개다. "
        "이름만 나란히 놓고 '어느 쪽'만 묻기보다, 가치·감정·상황을 곁들여 물어도 된다. "
        "단, 방금 답한 내용을 그대로 반복해 묻지는 마라."
    )

 
def _next_ai_sys_suffix_binary(post: Post) -> str:
    if len(_post_option_list(post)) != 2:
        return ""
    return (
        " 선택지가 2개여도, 기계적인 나열 대신 마음·부담·후회·일상 리듬처럼 "
        "사람이 쓰는 말로 비교해도 된다."
    )


# 이전 질문에서 이미 다룬 '떠먹이 체크리스트' 축(중복 방지). 여행뿐 아니라 일상 전반에서 자주 반복되는 패턴.
_QUESTION_AXIS_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    # --- 범용 결정 축(카테고리 공통) ---
    (
        "우선순위·기준",
        (
            "기준",
            "우선",
            "중요",
            "가장",
            "제일",
            "필수",
            "절대",
            "원해",
            "바라",
        ),
    ),
    (
        "시간·일정",
        (
            "시간",
            "일정",
            "기한",
            "마감",
            "오늘",
            "이번주",
            "이번 주",
            "당장",
            "급하",
            "늦",
        ),
    ),
    (
        "비용·예산",
        ("비용", "예산", "경비", "만원", "지출", "돈이", "얼마나 고려", "지갑", "가격", "가성비"),
    ),
    (
        "노력·번거로움",
        (
            "번거",
            "귀찮",
            "노력",
            "준비",
            "절차",
            "복잡",
            "쉬운",
            "간단",
            "힘들",
        ),
    ),
    (
        "리스크·후회",
        (
            "리스크",
            "위험",
            "후회",
            "망할",
            "실패",
            "불안",
            "걱정",
            "손해",
            "부담",
        ),
    ),
    (
        "장기·단기",
        (
            "장기",
            "단기",
            "나중",
            "미래",
            "1년",
            "몇달",
            "몇 달",
            "계속",
            "습관",
        ),
    ),
    (
        "사람·관계",
        (
            "사람",
            "가족",
            "친구",
            "연인",
            "동료",
            "같이",
            "혼자",
            "관계",
            "눈치",
        ),
    ),
    (
        "건강·컨디션",
        (
            "건강",
            "몸",
            "컨디션",
            "피로",
            "스트레스",
            "잠",
            "회복",
            "아프",
        ),
    ),
    (
        "재미·만족",
        (
            "재미",
            "만족",
            "즐거",
            "기분",
            "취향",
            "좋아",
            "싫어",
            "행복",
        ),
    ),
    (
        "원칙·가치",
        (
            "원칙",
            "가치",
            "양심",
            "윤리",
            "정직",
            "공정",
            "의미",
            "신념",
        ),
    ),

    # --- 도메인 축(있으면 더 정교하게) ---
    ("비용·예산", ("비용", "예산", "경비", "만원", "지출", "돈이", "얼마나 고려", "지갑")),
    ("기간·일수", ("기간", "며칠", "일주일", "몇 일", "몇일", "당일", "몇 박", "몇박")),
    ("음식·식사", ("음식", "식사", "맛이", "먹거리", "맛집", "레스토랑", "요리")),
    ("휴식·공간", ("숙소", "호텔", "편안함", "숙박", "룸")),
    ("준비·여유 시간", ("준비", "시간을 준비", "준비할 수")),
    ("이동·교통", ("비행기", "교통", "항공", "이동 수단")),
    # 음료/카페 고민에서 반복되기 쉬운 축(기분·날씨·카페인·맛) 중복 방지용
    (
        "온도·날씨",
        (
            "시원",
            "차가",
            "아이스",
            "따뜻",
            "뜨끈",
            "날씨",
            "더워",
            "추워",
        ),
    ),
    (
        "카페인·각성",
        (
            "카페인",
            "잠",
            "졸",
            "각성",
            "집중",
            "공부",
            "업무",
            "버텨",
            "깨",
        ),
    ),
    (
        "맛·당도",
        (
            "달",
            "단맛",
            "달달",
            "쓴",
            "쓴맛",
            "고소",
            "산미",
            "맛",
        ),
    ),
    (
        "컨디션·속",
        (
            "속",
            "위",
            "부담",
            "배",
            "소화",
            "컨디션",
            "두근",
            "어지",
        ),
    ),
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


def _smart_fallback_question(post: Post, prev_questions: list[str]) -> str:
    """
    모델이 계속 bad로 걸려 chosen이 비거나, 대화가 '모르겠다'로 정체될 때
    어떤 카테고리든 적용 가능한 '결정 기준' 질문으로 수렴시키기 위한 fallback.
    """
    used = set(_used_question_axes(prev_questions))

    # 가장 범용적인 것부터: 우선순위/시간/비용/리스크/노력
    candidates: list[tuple[str, str]] = [
        ("우선순위·기준", "지금 이 선택에서 제일 중요한 기준 1가지만 꼽으면 뭐예요? (예: 돈/시간/후회/편함)"),
        ("시간·일정", "이 결정을 오늘 안에 내려야 해요, 아니면 며칠 더 고민해도 괜찮아요?"),
        ("비용·예산", "비용이 조금 더 들어도 괜찮아요, 아니면 예산을 꼭 지켜야 해요?"),
        ("노력·번거로움", "좀 번거로워도 원하는 걸 챙길래요, 아니면 간단하고 편한 쪽이 좋아요?"),
        ("리스크·후회", "지금 더 피하고 싶은 건 ‘후회’예요, 아니면 ‘당장의 불편함’이에요?"),
        ("사람·관계", "이 선택이 다른 사람(가족/친구/동료)에게도 영향을 주나요? (예/아니오)"),
        ("장기·단기", "단기 만족이 더 중요해요, 아니면 3개월 뒤에도 괜찮을 선택이 더 중요해요?"),
    ]

    for label, q in candidates:
        if label not in used:
            return q

    # 다 썼으면 가장 덜 유도적인 범용 질문으로
    return "둘 다 가능하다면, ‘지금 더 아쉬운 쪽’은 어느 쪽에 가까워요?"


def _used_question_axes(prev_questions: list[str]) -> list[str]:
    blob = _normalize_question("\n".join(prev_questions))
    used: list[str] = []
    for label, kws in _QUESTION_AXIS_KEYWORDS:
        if any(k in blob for k in kws):
            used.append(label)
    return used


def _question_overlaps_covered_axes(question: str, prev_questions: list[str]) -> bool:
    """이미 다룬 결정 축을 새 질문이 또 건드리면 True (같은 템플릿 반복 방지)."""
    used_labels = {lbl for lbl in _used_question_axes(prev_questions)}
    if not used_labels:
        return False
    nq = _normalize_question(question)
    for label, kws in _QUESTION_AXIS_KEYWORDS:
        if label not in used_labels:
            continue
        if any(k in nq for k in kws):
            return True
    return False


# 감정·관심사 축이 최근 질문에서만 반복되는 패턴 (외로움·혼자만 파기 등)
_QUESTION_THEME_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "lonely_alone",
        (
            "외로",
            "혼자",
            "고립",
            "쓸쓸",
            "외톨",
            "말벗",
            "혼자 있",
            "혼자일",
            "혼자로",
            "외로움",
            "답답",
        ),
    ),
    (
        "social_people",
        (
            "친구",
            "사람과",
            "사람이랑",
            "만남",
            "소통",
            "룸메",
            "동료",
            "함께",
        ),
    ),
    (
        "freedom_self",
        (
            "자유",
            "독립",
            "마음대",
            "내 페이스",
            "제약",
            "통제",
        ),
    ),
)


def _question_matched_themes(question: str) -> frozenset[str]:
    nq = _normalize_question(question)
    out: set[str] = set()
    for theme_id, kws in _QUESTION_THEME_GROUPS:
        if any(k in nq for k in kws):
            out.add(theme_id)
    return frozenset(out)


def _recent_theme_overuse_bad(candidate: str, prev_questions: list[str]) -> bool:
    """
    최근 3개 질문 중 2개 이상이 같은 테마(외로움·사람·자유 등)를 건드렸는데
    새 질문도 그 테마를 또 쓰면 True.
    """
    if len(prev_questions) < 2:
        return False
    tail = prev_questions[-3:]
    cand_themes = _question_matched_themes(candidate)
    if not cand_themes:
        return False
    for t in cand_themes:
        hits = sum(1 for q in tail if t in _question_matched_themes(q))
        if hits >= 2:
            return True
    return False


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
    """
    선택지 2개일 때 최근 질문이 한쪽 이름만 반복 썼는데,
    새 질문도 같은 한쪽만 쓰면 True (다른 선택지 축을 한동안 안 묻는 것 방지).
    """
    opts = _post_option_list(post)
    if len(opts) != 2:
        return False
    tail = prev_questions[-3:]
    if len(tail) < 2:
        return False
    a0, a1 = opts[0].strip(), opts[1].strip()
    if not a0 or not a1:
        return False

    def only_first(q: str) -> bool:
        return _option_named_in_text(a0, q) and not _option_named_in_text(a1, q)

    def only_second(q: str) -> bool:
        return _option_named_in_text(a1, q) and not _option_named_in_text(a0, q)

    only_a = sum(1 for q in tail if only_first(q))
    only_b = sum(1 for q in tail if only_second(q))
    ca0 = _option_named_in_text(a0, candidate)
    ca1 = _option_named_in_text(a1, candidate)
    if only_a >= 2 and ca0 and not ca1:
        return True
    if only_b >= 2 and ca1 and not ca0:
        return True
    return False


def _any_recent_theme_saturated(prev_questions: list[str]) -> bool:
    if len(prev_questions) < 2:
        return False
    tail = prev_questions[-3:]
    for _tid, kws in _QUESTION_THEME_GROUPS:
        hits = sum(
            1 for q in tail if any(k in _normalize_question(q) for k in kws)
        )
        if hits >= 2:
            return True
    return False


def _ai_theme_stretch_user_suffix(prev_questions: list[str]) -> str:
    if not _any_recent_theme_saturated(prev_questions):
        return ""
    return (
        "\n\n[중요] 최근 질문이 비슷한 감정·관심사(외로움·혼자·사람·자유 등)만 반복됐다. "
        "이번에는 비용·규칙·동선·집안일·룸메·장기 계획·컨디션 등 완전히 다른 축으로 물어라."
    )


def _ai_binary_option_balance_suffix(prev_questions: list[str], post: Post) -> str:
    opts = _post_option_list(post)
    if len(opts) != 2:
        return ""
    tail = prev_questions[-3:]
    if len(tail) < 2:
        return ""
    a0, a1 = opts[0].strip(), opts[1].strip()
    if not a0 or not a1:
        return ""

    def only_first(q: str) -> bool:
        return _option_named_in_text(a0, q) and not _option_named_in_text(a1, q)

    def only_second(q: str) -> bool:
        return _option_named_in_text(a1, q) and not _option_named_in_text(a0, q)

    only_a = sum(1 for q in tail if only_first(q))
    only_b = sum(1 for q in tail if only_second(q))
    if only_a >= 2:
        return (
            f"\n\n[중요] 최근 질문에 '{a1}'가 거의 안 나왔다. "
            f"이번 질문에는 반드시 '{a1}'를 넣어 그쪽만 파거나 비교의 한 축으로 써라."
        )
    if only_b >= 2:
        return (
            f"\n\n[중요] 최근 질문에 '{a0}'가 거의 안 나왔다. "
            f"이번 질문에는 반드시 '{a0}'를 넣어 물어라."
        )
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
    warmth = _question_has_emotional_or_value_framing(question)

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


def _ai_system_prompt_question(*, followup: bool, detailed_mode: bool) -> str:
    """모든 카테고리 공통 — 질문 단계 시스템 프롬프트.

    목표: 사용자 대신 고르는 것이 아니라, 사용자의 '결정 기준'을 빠르게 선명하게 만든다.
    """
    style = (
        "말투는 친근한 존댓말. 글이 무거울 때만 조심스럽고, 가벼운 주제는 담백하게."
        if detailed_mode
        else "말투는 가벼운 존댓말. 짧게, 부담 없이 답할 수 있게."
    )

    continuity = ""
    if followup:
        continuity = (
            "이전 Q/A를 반영하되, 직전 답을 그대로 되묻지 않는다. "
            "이미 다룬 기준(축)을 표현만 바꿔 반복하지 않는다. "
            "최근 질문이 'A vs B' 대칭 비교였다면, 이번에는 형식을 바꿔 "
            "우선순위/제약조건/가정/후회/하루 상황 같은 방식으로 묻는다. "
        )

    guard = (
        "절대 하지 말 것: "
        "선택지별 장점/단점을 질문 안에서 길게 설명해 결론을 유도하기, "
        "감정·상황을 지어내 위로/단정하기, "
        "체크리스트처럼 항목을 나열하기, "
        "같은 템플릿으로 표현만 바꿔 반복하기."
    )

    # 질문 품질 기준을 더 타이트하게 정의(후처리 규칙과 함께 안정화)
    format_rules = (
        "질문은 한국어 1문장(최대 60자), 줄바꿈 없음, 질문 하나만. "
        "사용자가 5~15초 안에 답할 수 있는 형태(예/아니오/1~5/둘 중 선택/짧은 단어)로. "
        "질문은 '한 가지 기준(축)'만 묻는다."
    )

    objective = (
        "역할: 당신은 '선택 코치'다. 사용자가 스스로 결정할 수 있게 핵심 기준을 뽑아준다. "
        "근거는 주어진 제목·본문·선택지와(후속이면) 지금까지의 Q/A뿐이다. "
        "카테고리는 참고만 하고 끼워 맞추지 않는다. "
        "먼저 부족한 정보(제약/기한/예산/필수조건/리스크)를 좁혀 묻고, "
        "그 다음에 우선순위(무엇이 더 중요한지)로 수렴시킨다."
    )

    examples = (
        "좋은 질문 예: "
        "“이 결정을 오늘 안에 내려야 해요? (예/아니오)” "
        "“돈을 더 써도 편한 쪽이 좋아요, 아니면 불편해도 아끼는 쪽이 좋아요?” "
        "“후회가 더 무서워요, 지금의 번거로움이 더 싫어요?”"
    )

    return (
        f"{objective} {style} {format_rules} {guard} {continuity} {examples} "
        '반드시 JSON만 출력한다. 형식: {"question":"질문"}'
    )


def _ai_user_block_post(post: Post) -> str:
    return (
        f"제목: {post.title}\n"
        f"본문:\n{post.content}\n\n"
        f"선택지(쉼표 구분, 비교 후보): {post.options}\n"
        f"분류(참고만): {post.category}\n"
        f"태그(있으면 참고): {', '.join(_tags_list(post))}\n"
    )


# 짧은 음식 메뉴 글에서 '기분·상상'만 파는 AI 질문 방지
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


def _post_is_simple_menu_style(post: Post) -> bool:
    """음식 카테고리 + 짧은 본문 → 메뉴 고민으로 보고 심리 질문 과다를 줄인다."""
    c = post.category or ""
    if "음식" not in c and "맛집" not in c:
        return False
    if len(_post_option_list(post)) < 2:
        return False
    return len((post.content or "").strip()) < 220


def _question_has_menu_overpsych_probe(question: str) -> bool:
    nq = _normalize_question(question)
    return any(m in nq for m in _MENU_OVERPSYCH_MARKERS)


def _simple_menu_overpsych_question_bad(question: str, post: Post) -> bool:
    if not _post_is_simple_menu_style(post):
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

    # 체감 품질을 위해 시스템 제한(85자)보다 더 타이트하게 운영
    if len(q) > 68:
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
    if sum(1 for m in leading_markers if m in nq) >= 2:
        return True

    # 선택지 이름을 둘 이상 포함하면서 비교·대립 마커가 있으면 유도형일 확률이 높다
    if _question_pits_multiple_named_options(q, post):
        if any(x in nq for x in ("vs", "대신", "반면", "하지만", "둘 중", "어느 쪽")):
            return True

    # 쉼표/접속어가 많으면 질문이 아니라 설명문처럼 길어지기 쉽다
    if q.count(",") >= 2 or nq.count("그리고") >= 2:
        return True

    return False

def _ai_simple_menu_user_suffix(post: Post) -> str:
    if not _post_is_simple_menu_style(post):
        return ""
    return (
        "\n\n[주의] 이 글은 짧은 메뉴 고민이다. "
        "선택지마다 '○○을 고르면 기분이' '느낌·기대·상상·즐거움'을 묻지 말고, "
        "허기·시간·짜/맵/바삭·배달·혼자 vs 같이·가격 중 하나로만 물어라."
    )


def _ai_question_context_suffix(prev_questions: list[str]) -> str:
    """이전 질문에서 잡힌 '축'이 있으면 한 줄로만 힌트."""
    used = _used_question_axes(prev_questions)
    if not used:
        return ""
    return (
        "\n\n[힌트] 아래 이전 질문들에서 이미 다룬 관점으로 보이는 주제: "
        + ", ".join(used)
        + ". 이와 겹치지 않는 새 질문 1개."
    )


def _ai_no_tournament_user_suffix(post: Post) -> str:
    """선택지가 여러 개일 때 기계적 토너먼트만 피하도록."""
    if len(_post_option_list(post)) < 3:
        return ""
    return (
        "\n\n[주의] 선택지가 3개 이상이다. "
        "두 개씩 잘라 같은 문장 틀로만 반복해 묻지 말고, "
        "이번 글에 맞는 감정·상황·가치 한 가지 축으로 자연스럽게 물어라."
    )


def _question_pits_multiple_named_options(question: str, post: Post) -> bool:
    """
    질문에 선택지 이름이 둘 이상 실리고, 두 후보를 맞대 비교하는 뉘앙스면 True.
    (연속 설문형 맞대기 감지용 — 중복/유사도 로직과 별개.)
    """
    opts = _post_option_list(post)
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
    """최근 질문에서 두 후보 맞대기가 잦으면 다음은 다른 형식을 유도."""
    if len(prev_questions) < 2:
        return False
    return _recent_named_option_comparison_count(prev_questions, post, window=3) >= 2


def _ai_question_rhythm_user_suffix(
    prev_questions: list[str], post: Post
) -> str:
    if not _should_avoid_named_option_comparison(prev_questions, post):
        return ""
    return (
        "\n\n[중요] 최근 질문이 두 선택지를 한 문장에 같이 놓고 맞댄 형식이 반복됐다. "
        "이번에는 두 후보 이름을 같이 쓰지 말고, 한쪽만 파기·가정(비용이 같다면)·"
        "1년 뒤 후회·우선순위 나열·구체 하루 상황 중 하나로 물어라."
    )


def _detailed_rhythm_plan_hint(post: Post) -> str:
    """상세 모드에서 첫 질문부터 형식 섞기 계획 유도."""
    if (getattr(post, "ai_mode", None) or "simple") != "detailed":
        return ""
    if len(_post_option_list(post)) < 2:
        return ""
    return (
        "\n\n[힌트] 앞으로 총 다섯 번 묻는다. 그중 최소 두 번은 "
        "두 후보를 한 문장에 나란히 맞대지 말고, 한쪽만·가정·후회·우선순위 등으로 물어라."
    )


def _simple_rhythm_plan_hint(post: Post) -> str:
    if (getattr(post, "ai_mode", None) or "simple") == "detailed":
        return ""
    if len(_post_option_list(post)) < 2:
        return ""
    return (
        "\n\n[힌트] 세 번 묻는 동안 한 번은 두 후보를 맞대기만 하지 말고, "
        "한쪽만 또는 가정·후회처럼 형식을 바꿔라."
    )


def _fallback_next_question(
    post: Post, prev_questions: list[str] | None = None
) -> str:
    avoid = (
        prev_questions is not None
        and _should_avoid_named_option_comparison(prev_questions, post)
    )
    if avoid:
        return (
            "말로만 떠올릴 때랑, 실제로 한 주를 산다고 상상할 때, "
            "더 크게 달라질 것 같은 걱정은 어디에 가 있어?"
        )
    if len(_post_option_list(post)) == 2:
        return "둘 다 떠올려 봤을 때, 지금 마음이 살짝 더 기우는 쪽이 있어?"
    return "지금 마음이 더 끌리는 쪽 말고, 놓치면 아쉬울 것 같은 쪽이 있어?"


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


@app.post("/auth/register", response_model=UserPublic)
def register(body: UserRegister, db: Session = Depends(get_db)):
    email_norm = str(body.email).lower().strip()
    if db.query(User).filter(User.email == email_norm).first():
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다.")

    nickname = (body.nickname or "").strip() or None

    user = User(
        email=email_norm,
        hashed_password=hash_password(body.password),
        nickname=nickname,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=TokenResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    email = str(body.email).lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )
    if getattr(user, "is_banned", False):
        raise HTTPException(
            status_code=403,
            detail="이용이 제한된 계정입니다.",
        )
    try:
        token = create_access_token(user_id=user.id, email=user.email)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return TokenResponse(access_token=token)


@app.get("/auth/me", response_model=UserPublic)
def auth_me(current_user: User = Depends(get_current_user)):
    return current_user


@app.patch("/auth/me", response_model=UserPublic)
def update_me(
    body: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.nickname = (body.nickname or "").strip() or None
    db.commit()
    db.refresh(current_user)
    return current_user


@app.get("/")
def root():
    return {"message": "Backend + PostgreSQL 연결 성공"}


@app.get("/meta/categories")
def meta_categories():
    """글 작성 시 선택 가능한 카테고리 목록."""
    return {"categories": list(ALLOWED_CATEGORIES)}


def _tokenize_for_tag_suggest(text: str) -> set[str]:
    """
    태그 추천용 매우 가벼운 토크나이저.
    - 한국어/영문/숫자 토큰을 뽑아 소문자화
    - 너무 짧은 토큰은 제거
    """
    raw = (text or "").lower()
    tokens = re.findall(r"[가-힣a-z0-9]{2,}", raw)
    out: set[str] = set()
    for t in tokens:
        if len(t) < 2:
            continue
        if len(t) > 30:
            t = t[:30]
        out.add(t)
    return out


def _normalize_tag_term(s: str) -> str:
    return (s or "").strip().lower()[:30]


def _suggest_tags_from_db(
    db: Session,
    *,
    title: str,
    content: str,
    category: str | None,
    selected: list[str],
    limit: int = 8,
) -> list[str]:
    blob = f"{title}\n{content}".strip().lower()
    tokens = _tokenize_for_tag_suggest(blob)
    selected_set = {_normalize_tag_term(x) for x in (selected or []) if _normalize_tag_term(x)}

    q = db.query(Post.tags).filter(Post.deleted_at.is_(None), Post.tags.isnot(None))
    if category:
        q = q.filter(Post.category == category.strip())
    rows = q.order_by(Post.id.desc()).limit(600).all()

    counts: dict[str, int] = {}
    for (csv,) in rows:
        if not csv:
            continue
        for raw in str(csv).split(","):
            t = _normalize_tag_term(raw)
            if not t or t in selected_set:
                continue
            counts[t] = counts.get(t, 0) + 1

    if not counts:
        return []

    # 점수: 빈도 + 본문/제목에 직접 등장하면 가산
    scored: list[tuple[int, str]] = []
    for tag, cnt in counts.items():
        score = cnt
        if tag in tokens or (tag and tag in blob):
            score += 60
        else:
            # 토큰 중 부분 일치(예: "이직" vs "이직준비") 약하게 가산
            if any(tag in tok or tok in tag for tok in tokens):
                score += 10
        scored.append((score, tag))

    scored.sort(key=lambda x: (-x[0], x[1]))
    return [t for _, t in scored[:limit]]


@app.post("/meta/tag-suggestions", response_model=TagSuggestResponse)
def suggest_tags(body: TagSuggestRequest, db: Session = Depends(get_db)):
    """
    제목/본문(그리고 선택적으로 카테고리)을 기반으로 태그 후보를 추천한다.
    - 로그인 불필요 (작성 폼 UX용)
    - 기존에 선택한 태그는 제외
    """
    title = (body.title or "").strip()
    content = (body.content or "").strip()
    if len(title) + len(content) < 8:
        return {"tags": []}
    selected = body.selected or []
    tags = _suggest_tags_from_db(
        db,
        title=title,
        content=content,
        category=body.category,
        selected=selected,
        limit=8,
    )
    return {"tags": tags}


@app.post("/posts", response_model=PostResponse)
def create_post(
    post: PostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai_mode_val = None
    if post.post_kind == "ai":
        ai_mode_val = post.ai_mode or "simple"

    tags_csv = ",".join(post.tags) if post.tags else None
    new_post = Post(
        title=post.title,
        content=post.content,
        category=post.category,
        options=",".join(post.options),  # 일단 문자열로 저장
        user_id=current_user.id,
        post_kind=post.post_kind,
        ai_mode=ai_mode_val,
        tags=tags_csv,
        vote_deadline_at=post.vote_deadline_at,
    )

    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    return _post_to_response(
        new_post,
        {current_user.id: current_user.nickname},
    )


@app.get("/posts", response_model=PaginatedPosts)
def get_posts(
    category: str | None = None,
    q: str | None = None,
    tag: str | None = None,
    sort: str = "likes",
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 50)
    sort = (sort or "likes").strip().lower()
    # 예전 URL 호환: latest/popular → 기본 정렬
    if sort in ("latest", "popular"):
        sort = "likes"
    if sort not in ("likes", "harmony", "comments", "votes"):
        sort = "likes"

    query = _posts_list_query(db, current_user)
    if category:
        query = query.filter(Post.category == category.strip())
    query = _apply_post_search(query, q)
    if tag:
        t = tag.strip().lower()[:30]
        if t:
            wrapped = func.concat(",", func.coalesce(Post.tags, ""), ",")
            query = query.filter(wrapped.like(f"%,{t},%"))

    cc_sub = (
        db.query(
            Comment.post_id.label("pid"),
            func.count(Comment.id).label("cnt"),
        )
        .filter(Comment.deleted_at.is_(None))
        .group_by(Comment.post_id)
        .subquery()
    )
    vc_sub = (
        db.query(
            Vote.post_id.label("pid"),
            func.count(Vote.id).label("cnt"),
        )
        .group_by(Vote.post_id)
        .subquery()
    )

    if sort == "comments":
        query = query.outerjoin(cc_sub, Post.id == cc_sub.c.pid)
        query = query.order_by(
            func.coalesce(cc_sub.c.cnt, 0).desc(),
            Post.id.desc(),
        )
    elif sort == "votes":
        query = query.outerjoin(vc_sub, Post.id == vc_sub.c.pid)
        query = query.order_by(
            func.coalesce(vc_sub.c.cnt, 0).desc(),
            Post.id.desc(),
        )
    elif sort == "harmony":
        # 조회순: 좋아요·댓글·투표 반응을 한 점수로 합산 (한쪽만 튀는 글보다 고르게 반응받은 글 우선)
        query = query.outerjoin(cc_sub, Post.id == cc_sub.c.pid).outerjoin(
            vc_sub, Post.id == vc_sub.c.pid
        )
        harmony_score = (
            func.coalesce(Post.like_count, 0)
            + func.coalesce(cc_sub.c.cnt, 0)
            + func.coalesce(vc_sub.c.cnt, 0)
        )
        query = query.order_by(harmony_score.desc(), Post.id.desc())
    else:
        query = query.order_by(Post.like_count.desc(), Post.id.desc())

    total = query.count()
    total_pages = (total + page_size - 1) // page_size if total else 0
    posts = (
        query.offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    ids = {p.user_id for p in posts if p.user_id}
    nick_map = _nickname_map(db, ids)
    liked_map: dict[int, bool] = {}
    if current_user and posts:
        pids = [p.id for p in posts]
        likes = (
            db.query(PostLike.post_id)
            .filter(
                PostLike.post_id.in_(pids),
                PostLike.user_id == current_user.id,
            )
            .all()
        )
        liked_set = {row[0] for row in likes}
        liked_map = {p.id: p.id in liked_set for p in posts}

    items = [
        _post_to_response(
            p,
            nick_map,
            liked_by_me=liked_map.get(p.id) if current_user else None,
        )
        for p in posts
    ]
    return PaginatedPosts(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@app.get("/stats/categories", response_model=list[CategoryStat])
def stats_categories(db: Session = Depends(get_db)):
    rows = (
        db.query(Post.category, func.count(Post.id))
        .filter(Post.deleted_at.is_(None), Post.is_hidden == False)
        .group_by(Post.category)
        .all()
    )
    count_map = {r[0]: int(r[1]) for r in rows}
    return [
        CategoryStat(category=cat, count=count_map.get(cat, 0))
        for cat in ALLOWED_CATEGORIES
    ]


@app.get("/stats/popular-posts", response_model=list[PopularPostBrief])
def stats_popular_posts(limit: int = 5, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 20)
    rows = (
        db.query(Post, func.count(Vote.id).label("vc"))
        .outerjoin(Vote, Post.id == Vote.post_id)
        .filter(Post.deleted_at.is_(None), Post.is_hidden == False)
        .group_by(Post.id)
        .order_by(func.count(Vote.id).desc(), Post.id.desc())
        .limit(limit)
        .all()
    )
    return [
        PopularPostBrief(
            id=p.id,
            title=p.title,
            category=p.category,
            vote_count=int(vc),
        )
        for p, vc in rows
    ]


@app.get("/stats/popular-posts-by-views", response_model=list[PopularPostByViewsBrief])
def stats_popular_posts_by_views(limit: int = 5, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 20)
    rows = (
        db.query(Post)
        .filter(Post.deleted_at.is_(None), Post.is_hidden == False)
        .order_by(Post.view_count.desc(), Post.id.desc())
        .limit(limit)
        .all()
    )
    return [
        PopularPostByViewsBrief(
            id=p.id,
            title=p.title,
            category=p.category,
            view_count=getattr(p, "view_count", None) or 0,
        )
        for p in rows
    ]


@app.get("/stats/recent-comments", response_model=list[RecentCommentBrief])
def stats_recent_comments(limit: int = 5, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 20)
    comments = (
        db.query(Comment)
        .join(Post, Comment.post_id == Post.id)
        .filter(
            Comment.deleted_at.is_(None),
            Post.deleted_at.is_(None),
            Post.is_hidden == False,
        )
        .order_by(Comment.id.desc())
        .limit(limit)
        .all()
    )
    if not comments:
        return []

    post_ids = {c.post_id for c in comments}
    posts = {p.id: p for p in db.query(Post).filter(Post.id.in_(post_ids)).all()}
    user_ids = {c.user_id for c in comments if c.user_id}
    nick_map = _nickname_map(db, user_ids)

    out: list[RecentCommentBrief] = []
    for c in comments:
        pt = posts.get(c.post_id)
        title = pt.title if pt else "(글 없음)"
        text = c.content if len(c.content) <= 100 else c.content[:100] + "…"
        out.append(
            RecentCommentBrief(
                id=c.id,
                content=text,
                post_id=c.post_id,
                post_title=title,
                author_nickname=nick_map.get(c.user_id) if c.user_id else None,
                created_at=c.created_at,
            )
        )
    return out


@app.get("/posts/me", response_model=list[PostResponse])
def my_posts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """내가 작성한 고민 글 (최신순, 삭제된 글 제외 · 숨김 글은 작성자에게 표시)"""
    posts = (
        db.query(Post)
        .filter(
            Post.user_id == current_user.id,
            Post.deleted_at.is_(None),
        )
        .order_by(Post.id.desc())
        .all()
    )
    nick_map = {current_user.id: current_user.nickname}
    return [_post_to_response(p, nick_map) for p in posts]


@app.get("/posts/{post_id}", response_model=PostResponse)
def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    post = _get_post_or_404(db, post_id, current_user)

    post.view_count = (getattr(post, "view_count", None) or 0) + 1
    db.commit()
    db.refresh(post)

    ids = {post.user_id} if post.user_id else set()
    nick_map = _nickname_map(db, ids)

    liked_by_me: bool | None = None
    if current_user:
        liked_by_me = (
            db.query(PostLike)
            .filter(PostLike.post_id == post_id, PostLike.user_id == current_user.id)
            .first()
            is not None
        )

    return _post_to_response(post, nick_map, liked_by_me=liked_by_me)


@app.get("/posts/{post_id}/similar", response_model=list[SimilarPostBrief])
def get_similar_posts(
    post_id: int,
    limit: int = 8,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    비슷한 고민 글 추천 (MVP):
    - 태그 겹침 개수 + 카테고리 동일 보너스로 점수화
    - 삭제/숨김/차단 필터는 목록과 동일하게 적용
    """
    limit = min(max(int(limit or 8), 1), 20)
    src = _get_post_or_404(db, post_id, current_user)

    base = _posts_list_query(db, current_user).filter(Post.id != src.id)

    src_tags = _tags_list(src)
    wrapped = func.concat(",", func.coalesce(Post.tags, ""), ",")
    tag_terms = [(t or "").strip().lower()[:30] for t in src_tags]
    tag_terms = [t for t in tag_terms if t]

    # tag overlap score
    tag_score_expr = literal(0)
    for t in tag_terms:
        tag_score_expr = tag_score_expr + case(
            (wrapped.like(f"%,{t},%"), 1),
            else_=0,
        )

    category_bonus_expr = case((Post.category == src.category, 2), else_=0)
    score_expr = tag_score_expr + category_bonus_expr

    # Return only meaningful matches:
    # - If src has tags: require at least 1 tag overlap OR same category
    # - If src has no tags: require same category
    if tag_terms:
        base = base.filter(or_(tag_score_expr > 0, Post.category == src.category))
    else:
        base = base.filter(Post.category == src.category)

    rows = (
        base.add_columns(score_expr.label("score"))
        .order_by(func.coalesce(score_expr, 0).desc(), Post.id.desc())
        .limit(limit)
        .all()
    )

    posts = [p for (p, _score) in rows]
    return [_post_to_similar_brief(p) for p in posts]


@app.post("/posts/{post_id}/like", response_model=LikeToggleResponse)
def toggle_post_like(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)

    existing = (
        db.query(PostLike)
        .filter(PostLike.post_id == post_id, PostLike.user_id == current_user.id)
        .first()
    )
    lc = getattr(post, "like_count", None) or 0
    if existing:
        db.delete(existing)
        post.like_count = max(0, lc - 1)
        liked = False
    else:
        db.add(PostLike(post_id=post_id, user_id=current_user.id))
        post.like_count = lc + 1
        liked = True
    db.commit()
    db.refresh(post)

    return LikeToggleResponse(
        liked=liked,
        like_count=getattr(post, "like_count", None) or 0,
    )

@app.post("/posts/{post_id}/comments", response_model=CommentResponse)
def create_comment(
    post_id: int,
    comment: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)
    parent_id = comment.parent_id
    parent: Comment | None = None
    if parent_id is not None:
        parent = (
            db.query(Comment)
            .filter(
                Comment.id == parent_id,
                Comment.post_id == post_id,
                Comment.deleted_at.is_(None),
            )
            .first()
        )
        if not parent:
            raise HTTPException(
                status_code=400,
                detail="대댓글 대상을 찾을 수 없습니다.",
            )

    new_comment = Comment(
        content=comment.content,
        post_id=post_id,
        user_id=current_user.id,
        parent_id=parent_id,
    )
    db.add(new_comment)
    db.flush()

    title_short = (post.title or "")[:80]
    if parent_id is not None and parent and parent.user_id:
        if parent.user_id != current_user.id:
            _notify(
                db,
                user_id=parent.user_id,
                kind="reply_to_comment",
                title="내 댓글에 답글이 달렸어요",
                body=f"글: {title_short}",
                post_id=post_id,
                comment_id=new_comment.id,
            )
    elif post.user_id and post.user_id != current_user.id:
        _notify(
            db,
            user_id=post.user_id,
            kind="comment_on_post",
            title="내 글에 댓글이 달렸어요",
            body=f"글: {title_short}",
            post_id=post_id,
            comment_id=new_comment.id,
        )

    db.commit()
    db.refresh(new_comment)

    nick_map = _nickname_map(
        db, {new_comment.user_id} if new_comment.user_id else set()
    )
    reply_map = _comment_reply_counts(db, [new_comment.id])
    return _comment_to_response(new_comment, nick_map, reply_map)


@app.get("/posts/{post_id}/comments", response_model=list[CommentResponse])
def get_comments(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    _get_post_or_404(db, post_id, current_user)
    q = db.query(Comment).filter(
        Comment.post_id == post_id,
        Comment.deleted_at.is_(None),
    )
    if current_user:
        blocked = _get_blocked_ids(db, current_user.id)
        if blocked:
            q = q.filter(
                or_(Comment.user_id.is_(None), ~Comment.user_id.in_(blocked))
            )
    comments = q.order_by(Comment.id.asc()).all()
    ids = {c.user_id for c in comments if c.user_id}
    nick_map = _nickname_map(db, ids)
    cids = [c.id for c in comments]
    reply_map = _comment_reply_counts(db, cids)
    return [_comment_to_response(c, nick_map, reply_map) for c in comments]

def _post_option_list(post: Post) -> list[str]:
    return [o.strip() for o in post.options.split(",") if o.strip()]


@app.post("/posts/{post_id}/votes", response_model=VoteResponse)
def create_vote(
    post_id: int,
    vote: VoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)

    if _vote_deadline_passed(post):
        raise HTTPException(
            status_code=400,
            detail="투표 마감 시간이 지났습니다.",
        )

    options = _post_option_list(post)
    choice = vote.selected_option.strip()
    if choice not in options:
        raise HTTPException(
            status_code=400,
            detail="선택지에 없는 항목입니다.",
        )

    if post.user_id is not None and post.user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="본인이 쓴 글에는 투표할 수 없어요.",
        )

    existing = (
        db.query(Vote)
        .filter(Vote.post_id == post_id, Vote.user_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="이미 이 글에 투표했습니다. 투표는 변경할 수 없습니다.",
        )

    new_vote = Vote(
        post_id=post_id,
        user_id=current_user.id,
        selected_option=choice,
    )
    try:
        db.add(new_vote)
        db.commit()
        db.refresh(new_vote)
        return new_vote
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="투표 처리 중 충돌이 났습니다. 다시 시도해 주세요.",
        )


@app.get("/posts/{post_id}/votes/me", response_model=VoteResponse | None)
def get_my_vote(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 로그인 사용자의 이 글에 대한 투표 (없으면 null)"""
    _get_post_or_404(db, post_id, current_user)
    v = (
        db.query(Vote)
        .filter(Vote.post_id == post_id, Vote.user_id == current_user.id)
        .first()
    )
    return v

@app.get("/posts/{post_id}/votes", response_model=list[VoteCountResponse])
def get_vote_counts(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    post = _get_post_or_404(db, post_id, current_user)

    options = _post_option_list(post)
    votes = db.query(Vote).filter(Vote.post_id == post_id).all()

    results = []
    for option in options:
        count = sum(1 for vote in votes if vote.selected_option.strip() == option)
        results.append({"option": option, "count": count})

    return results


def _load_ai_transcript(db: Session, post_id: int) -> list[AITranscriptItem]:
    rows = (
        db.query(AIInteraction)
        .filter(AIInteraction.post_id == post_id)
        .order_by(AIInteraction.step_number.asc())
        .all()
    )
    return [
        AITranscriptItem(step=r.step_number, question=r.question, answer=r.answer)
        for r in rows
    ]


@app.get("/posts/{post_id}/ai-transcript", response_model=list[AITranscriptItem])
def get_ai_transcript(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    post = _get_post_or_404(db, post_id, current_user)
    _require_ai_post(post)
    author = (
        current_user is not None
        and post.user_id is not None
        and post.user_id == current_user.id
    )
    public_ok = bool(getattr(post, "ai_transcript_public", False)) and bool(
        (getattr(post, "ai_recommended", None) or "").strip()
    )
    if not author and not public_ok:
        raise HTTPException(
            status_code=404,
            detail="대화 내용을 불러올 수 없습니다.",
        )
    return _load_ai_transcript(db, post_id)


@app.post("/posts/{post_id}/start-ai", response_model=AIQuestionFlowResponse)
def start_ai(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)
    _require_ai_post(post)
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 AI 질문을 진행할 수 있어요.")

    # 이전 대화 있으면 제거 (새로 시작)
    old_interactions = db.query(AIInteraction).filter(AIInteraction.post_id == post_id).all()
    for item in old_interactions:
        db.delete(item)
    post.ai_recommended = None
    post.ai_reason = None
    post.ai_transcript_public = False
    db.commit()

    try:
        mode = getattr(post, "ai_mode", None) or "simple"
        detailed = mode == "detailed"
        sys_first = _ai_system_prompt_question(followup=False, detailed_mode=detailed)
        user_first = (
            _ai_user_block_post(post)
            + "첫 질문 1개를 만들어라."
            + _anti_binary_redundant_user_suffix(post)
            + _ai_no_tournament_user_suffix(post)
            + _detailed_rhythm_plan_hint(post)
            + _simple_rhythm_plan_hint(post)
            + _ai_simple_menu_user_suffix(post)
            + _ai_question_context_suffix([])
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": sys_first},
                {"role": "user", "content": user_first},
            ]
        )

        content = response.choices[0].message.content
        data = _parse_ai_json_response(content)
        question_text = _extract_question_text(data).strip()

        # 방어: 첫 질문이 비거나 중복(드물게)일 때 한 번 더 시도
        if _is_duplicate_question(question_text, []):
            retry_sys = sys_first + " 질문이 비었거나 부적절하다. 다른 질문 1개."
            response2 = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": retry_sys},
                    {"role": "user", "content": user_first},
                ],
            )
            data2 = _parse_ai_json_response(response2.choices[0].message.content)
            q2 = _extract_question_text(data2).strip()
            if q2:
                question_text = q2

        # 본문이 이미 A/B 고민인데 질문이 같은 선택을 되묻는 경우 재생성
        if _first_question_redundant_binary_repeat(question_text, post):
            retry_sys = (
                sys_first
                + " 두 옵션을 딱 잘라 또 고르게 했다. "
                "이름 대신 마음·부담·후회·일상 리듬처럼 감정·상황이 드러나게 바꿔라."
            )
            response3 = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": retry_sys},
                    {"role": "user", "content": user_first},
                ],
            )
            data3 = _parse_ai_json_response(response3.choices[0].message.content)
            q3 = _extract_question_text(data3).strip()
            if q3 and not _is_duplicate_question(q3, [question_text]):
                question_text = q3
            if _first_question_redundant_binary_repeat(question_text, post):
                response4 = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": retry_sys
                            + " 선택지 이름은 쓰지 말고, 가치·감정 한 가지 축으로만 물어라.",
                        },
                        {"role": "user", "content": user_first},
                    ],
                )
                data4 = _parse_ai_json_response(response4.choices[0].message.content)
                q4 = _extract_question_text(data4).strip()
                if q4:
                    question_text = q4

        if _question_is_pairwise_tournament(question_text):
            retry_sys_t = (
                sys_first
                + " 질문이 이름만 나열하고 고르게 하는 기계적 토너먼트에 가깝다. "
                "감정·상황·가치를 한 톨 섞어, 사람이 말하듯 한 문장으로 다시 물어라."
            )
            response_t = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": retry_sys_t},
                    {"role": "user", "content": user_first},
                ],
            )
            data_t = _parse_ai_json_response(response_t.choices[0].message.content)
            qt = _extract_question_text(data_t).strip()
            if qt and not _is_duplicate_question(qt, [question_text]):
                question_text = qt
            if _question_is_pairwise_tournament(question_text):
                response_t2 = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": retry_sys_t
                            + " 선택지 이름은 빼고, 마음이나 부담이 드러나게만 물어라.",
                        },
                        {"role": "user", "content": user_first},
                    ],
                )
                data_t2 = _parse_ai_json_response(response_t2.choices[0].message.content)
                qt2 = _extract_question_text(data_t2).strip()
                if qt2:
                    question_text = qt2

        if _simple_menu_overpsych_question_bad(question_text, post):
            retry_menu = (
                sys_first
                + " 질문이 메뉴 고민에 맞지 않게 기분·느낌·기대·상상만 파고 있다. "
                "허기·시간·짜/맵/바삭·배달·혼자 먹을지·가격 중 하나로 담백하게 다시 물어라."
            )
            response_m = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": retry_menu},
                    {"role": "user", "content": user_first},
                ],
            )
            qm = _extract_question_text(
                _parse_ai_json_response(response_m.choices[0].message.content)
            ).strip()
            if qm and not _is_duplicate_question(qm, [question_text]):
                question_text = qm
            if _simple_menu_overpsych_question_bad(question_text, post):
                response_m2 = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": retry_menu
                            + " 선택지 이름은 쓰지 말고 '지금 얼마나 배고프다' '짜게 vs 담백하게' 같은 한 축만 물어라.",
                        },
                        {"role": "user", "content": user_first},
                    ],
                )
                qm2 = _extract_question_text(
                    _parse_ai_json_response(response_m2.choices[0].message.content)
                ).strip()
                if qm2:
                    question_text = qm2

        # 장황/유도형 질문이면 한 번 더 재생성
        if _question_is_leading_or_wordy(question_text, post):
            retry_wordy = (
                sys_first
                + " 질문이 길거나 유도적이다. "
                "선택지의 장점/단점을 질문에 미리 설명하지 말고, "
                "시간·온도·카페인·예산·허기 같은 한 가지 축만 60자 이내로 물어라."
            )
            response_w = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": retry_wordy},
                    {"role": "user", "content": user_first},
                ],
            )
            qw = _extract_question_text(
                _parse_ai_json_response(response_w.choices[0].message.content)
            ).strip()
            if qw and not _is_duplicate_question(qw, [question_text]):
                question_text = qw

        interaction = AIInteraction(
            post_id=post_id,
            step_number=1,
            question=question_text,
            answer=None,
        )

        db.add(interaction)
        db.commit()

        tr = _load_ai_transcript(db, post_id)
        return {
            "type": "question",
            "step": 1,
            "question": question_text,
            "transcript": tr,
        }

    except Exception as e:
        print("=== start_ai error ===")
        print(repr(e))
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/posts/{post_id}/next-ai", response_model=AIQuestionFlowResponse)
def next_ai(
    post_id: int,
    req: AIAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)
    _require_ai_post(post)
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 AI 질문을 진행할 수 있어요.")

    interactions = (
        db.query(AIInteraction)
        .filter(AIInteraction.post_id == post_id)
        .order_by(AIInteraction.step_number.asc())
        .all()
    )

    if not interactions:
        raise HTTPException(status_code=400, detail="먼저 /start-ai를 호출해야 합니다.")

    last_interaction = interactions[-1]

    # 마지막 질문에 답변 저장
    last_interaction.answer = req.answer
    db.commit()

    # 지금까지 대화 정리
    conversation_text = ""
    for item in interactions:
        conversation_text += f"Q{item.step_number}: {item.question}\n"
        conversation_text += f"A{item.step_number}: {item.answer}\n"

    current_step = len(interactions)
    max_steps = _ai_max_question_steps(post)
    mode = getattr(post, "ai_mode", None) or "simple"

    try:
        if current_step >= max_steps:
            if mode == "detailed":
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "역할: '선택 코치'로서 최종 추천 1개를 낸다. "
                                "근거는 오직 글/선택지/질문-답변뿐이며, 없는 사실을 지어내지 않는다. "
                                "먼저 Q/A에서 사용자의 우선순위·제약(시간/돈/리스크/노력/관계/건강 등)을 요약해라. "
                                "그 기준에 가장 잘 맞는 선택지를 1개 추천한다. "
                                "recommended는 반드시 선택지 문자열 중 하나와 정확히 일치해야 한다. "
                                "'모르겠다/상관없다' 같은 답은 불확실성으로만 반영하고, 이유에 '가정'을 한 줄로 명시한다. "
                                "comparison은 markdown 문자열 하나로, 모든 선택지를 빠짐없이 다룬다. "
                                "각 선택지마다 다음 소제목을 포함: "
                                "## (선택지 이름)\\n- **잘 맞는 조건:**\\n- **걸리는 점:**\\n- **추천 대상:** "
                                '출력은 JSON만: {"recommended":"…","reason":"2~4문장","comparison":"markdown 본문"}'
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                _ai_user_block_post(post)
                                + f"질문/답변:\n{conversation_text}\n\n"
                                + "최종 추천과 선택지별 비교를 작성해라."
                            ),
                        },
                    ],
                )
                content = response.choices[0].message.content
                data = _parse_ai_json_response(content)
                rec = _extract_text(data.get("recommended")).strip()
                reason_short = _extract_text(data.get("reason")).strip()
                comp = _normalize_ai_comparison_field(data.get("comparison")).strip()
                if comp:
                    full_reason = f"{reason_short}\n\n---\n\n{comp}".strip()
                else:
                    full_reason = reason_short
                post.ai_recommended = rec
                post.ai_reason = full_reason
                db.commit()
                db.refresh(post)
                tr_final = _load_ai_transcript(db, post_id)
                return {
                    "type": "result",
                    "recommended": rec,
                    "reason": full_reason,
                    "transcript": tr_final,
                }

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "역할: '선택 코치'로서 최종 추천 1개와 이유를 쓴다. "
                            "근거는 오직 글/선택지/질문-답변뿐이며, 없는 사실을 지어내지 않는다. "
                            "Q/A에서 사용자의 우선순위·제약을 1~2개로 요약한 뒤, 그 기준에 맞춰 추천한다. "
                            "recommended는 반드시 선택지 문자열 중 하나와 정확히 일치해야 한다. "
                            "'모르겠다/상관없다' 같은 답은 불확실성으로만 반영하고, 이유에 가정을 짧게 적는다. "
                            "이유는 2~4문장, 과도한 수사 없이 구체적으로. "
                            'JSON만: {"recommended":"…","reason":"2~4문장"}'
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            _ai_user_block_post(post)
                            + f"질문/답변:\n{conversation_text}\n\n"
                            + "최종 추천을 작성해라."
                        ),
                    },
                ],
            )

            content = response.choices[0].message.content
            data = _parse_ai_json_response(content)

            post.ai_recommended = _extract_text(data.get("recommended")).strip()
            post.ai_reason = _extract_text(data.get("reason")).strip()
            db.commit()
            db.refresh(post)

            tr_final = _load_ai_transcript(db, post_id)
            return {
                "type": "result",
                "recommended": post.ai_recommended,
                "reason": post.ai_reason,
                "transcript": tr_final,
            }

        next_step = current_step + 1
        prev_questions = [it.question for it in interactions if it.question]
        last_answer = interactions[-1].answer if interactions else None

        detailed = mode == "detailed"
        sys_next = _ai_system_prompt_question(
            followup=True, detailed_mode=detailed
        ) + _next_ai_sys_suffix_binary(post)
        user_next = (
            _ai_user_block_post(post)
            + f"지금까지 질문/답변:\n{conversation_text}\n"
            + "다음 질문 1개를 만들어라."
            + _next_ai_user_suffix_binary(post)
            + _ai_no_tournament_user_suffix(post)
            + _ai_question_rhythm_user_suffix(prev_questions, post)
            + _ai_theme_stretch_user_suffix(prev_questions)
            + _ai_binary_option_balance_suffix(prev_questions, post)
            + _ai_simple_menu_user_suffix(post)
            + _ai_question_context_suffix(prev_questions)
        )

        sys_base = sys_next
        user_base = user_next
        chosen: str | None = None
        for attempt in range(5):
            extra = ""
            if attempt > 0:
                extra = (
                    "이미 했던 질문을 반복하지 마. "
                    "이전 질문 목록과 겹치면 안 돼. "
                    "그리고 사용자가 방금 답한 내용을 그대로 되묻지 마. "
                    "반드시 다른 관점의 새 질문 1개. "
                    "같은 문장 틀로 후보만 바꿔 묻는 기계적 반복은 피한다."
                )
                if _should_avoid_named_option_comparison(prev_questions, post):
                    extra += (
                        " 이번 질문에서 두 선택지 이름을 한 문장에 동시에 쓰지 마라. "
                        "A의 장점 vs B의 장점 식 맞대기면 실패다."
                    )
                if _any_recent_theme_saturated(prev_questions):
                    extra += (
                        " 최근과 같은 감정·상황 키워드만 반복하지 마라. "
                        "돈·규칙·동선·집안일·룸메·장기 계획 등 새 축으로 바꿔라."
                    )
                if _ai_binary_option_balance_suffix(prev_questions, post):
                    extra += " 최근에 안 나온 선택지 이름을 이번 질문에 반드시 넣어라."
                if _post_is_simple_menu_style(post):
                    extra += (
                        " 메뉴 고민인데 기분·느낌·기대·상상·즐거움만 묻는 질문이면 실패다. "
                        "허기·시간·맛·배달·가격·혼자/함께 중 하나로 물어라."
                    )
                if _answer_is_low_information(last_answer):
                    extra += (
                        " 사용자가 '모르겠다/상관없다'처럼 답했다. "
                        "추상적인 기분 질문을 반복하지 말고, 예/아니오로 답하기 쉬운 "
                        "아주 구체적인 한 축 질문(시간·비용·리스크·번거로움·건강·관계 중 하나)로 바꿔라."
                    )
            if attempt >= 2 and len(_post_option_list(post)) == 2:
                extra += (
                    " 설문지처럼 딱딱하지 말고 대화하듯 물어라. "
                    "가치·감정·상황을 곁들여도 된다. 방금 답을 그대로 반복해 묻지는 마라."
                )
            if attempt >= 1 and _used_question_axes(prev_questions):
                extra += " 이미 다룬 관점(비용·기간·식사 등)을 또 쓰지 마라."
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": sys_base + extra},
                    {"role": "user", "content": user_base},
                ],
            )

            data = _parse_ai_json_response(response.choices[0].message.content)
            cq = _extract_question_text(data).strip()
            bad = (
                _is_duplicate_question(cq, prev_questions)
                or _is_too_similar_to_recent_answer(cq, last_answer)
                or _binary_followup_forces_option_pick(cq, post)
                or _question_overlaps_covered_axes(cq, prev_questions)
                or _question_is_pairwise_tournament(cq)
                or _question_is_leading_or_wordy(cq, post)
                or (
                    _should_avoid_named_option_comparison(prev_questions, post)
                    and _question_pits_multiple_named_options(cq, post)
                )
                or _recent_theme_overuse_bad(cq, prev_questions)
                or _question_nearly_duplicate_of_recent(cq, prev_questions)
                or _binary_option_side_echo_bad(cq, prev_questions, post)
                or _simple_menu_overpsych_question_bad(cq, post)
            )
            if not bad:
                chosen = cq
                break

        next_question = chosen if chosen else _smart_fallback_question(post, prev_questions)

        interaction = AIInteraction(
            post_id=post_id,
            step_number=next_step,
            question=next_question,
            answer=None,
        )

        db.add(interaction)
        db.commit()

        tr = _load_ai_transcript(db, post_id)
        return {
            "type": "question",
            "step": next_step,
            "question": next_question,
            "transcript": tr,
        }

    except Exception as e:
        print("=== next_ai error ===")
        print(repr(e))
        raise HTTPException(status_code=500, detail=str(e))


# --- 글/댓글 수정·삭제 ---


@app.patch("/posts/{post_id}", response_model=PostResponse)
def update_post(
    post_id: int,
    body: PostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 수정할 수 있습니다.")
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="수정할 항목이 없습니다.")
    if "title" in data:
        post.title = data["title"]
    if "content" in data:
        post.content = data["content"]
    if "category" in data:
        post.category = data["category"]
    if "options" in data:
        post.options = ",".join(data["options"])
    if "tags" in data:
        post.tags = ",".join(data["tags"]) if data["tags"] else ""
    if "vote_deadline_at" in data:
        post.vote_deadline_at = data["vote_deadline_at"]
    if "ai_transcript_public" in data:
        if (getattr(post, "post_kind", None) or "community") != "ai":
            raise HTTPException(
                status_code=400,
                detail="AI 글에서만 대화 공개 설정을 바꿀 수 있어요.",
            )
        if not (getattr(post, "ai_recommended", None) or "").strip():
            raise HTTPException(
                status_code=400,
                detail="AI 추천을 완료한 뒤에만 대화 공개 여부를 바꿀 수 있어요.",
            )
        post.ai_transcript_public = bool(data["ai_transcript_public"])
    db.commit()
    db.refresh(post)
    nick_map = _nickname_map(db, {post.user_id} if post.user_id else set())
    return _post_to_response(post, nick_map)


@app.delete("/posts/{post_id}", response_model=MessageResponse)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    is_author = post.user_id is not None and post.user_id == current_user.id
    is_admin = getattr(current_user, "is_admin", False)
    if not is_author and not is_admin:
        raise HTTPException(
            status_code=403,
            detail="작성자 또는 관리자만 삭제할 수 있습니다.",
        )
    if post.deleted_at is not None:
        raise HTTPException(status_code=400, detail="이미 삭제된 글입니다.")
    post.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return MessageResponse(message="글이 삭제되었습니다.")


@app.patch(
    "/posts/{post_id}/comments/{comment_id}",
    response_model=CommentResponse,
)
def update_comment(
    post_id: int,
    comment_id: int,
    body: CommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_post_or_404(db, post_id, current_user)
    c = (
        db.query(Comment)
        .filter(
            Comment.id == comment_id,
            Comment.post_id == post_id,
        )
        .first()
    )
    if not c or c.deleted_at is not None:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if c.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 수정할 수 있습니다.")
    c.content = body.content
    db.commit()
    db.refresh(c)
    nick_map = _nickname_map(db, {c.user_id} if c.user_id else set())
    reply_map = _comment_reply_counts(db, [c.id])
    return _comment_to_response(c, nick_map, reply_map)


@app.delete(
    "/posts/{post_id}/comments/{comment_id}",
    response_model=MessageResponse,
)
def delete_comment(
    post_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_post_or_404(db, post_id, current_user)
    c = (
        db.query(Comment)
        .filter(
            Comment.id == comment_id,
            Comment.post_id == post_id,
        )
        .first()
    )
    if not c or c.deleted_at is not None:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if c.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 삭제할 수 있습니다.")
    c.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return MessageResponse(message="댓글이 삭제되었습니다.")


@app.post("/upload/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """본문에 삽입할 이미지 업로드. 반환 URL을 마크다운/텍스트에 넣으면 됩니다."""
    name = (file.filename or "").lower()
    ext = os.path.splitext(name)[1]
    if ext not in _UPLOAD_ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail="jpg, png, gif, webp만 업로드할 수 있어요.",
        )
    raw = await file.read()
    if len(raw) > _UPLOAD_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail="파일 크기는 5MB 이하여야 합니다.",
        )
    fn = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, fn)
    with open(path, "wb") as f:
        f.write(raw)
    return {"url": f"/uploads/{fn}"}


@app.get("/notifications", response_model=PaginatedNotifications)
def list_notifications(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 50)
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    total = q.count()
    total_pages = (total + page_size - 1) // page_size if total else 0
    rows = (
        q.order_by(Notification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedNotifications(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@app.get("/notifications/unread-count", response_model=NotificationUnreadCount)
def notifications_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = (
        db.query(func.count(Notification.id))
        .filter(
            Notification.user_id == current_user.id,
            Notification.read_at.is_(None),
        )
        .scalar()
    )
    return NotificationUnreadCount(count=int(n or 0))


@app.patch("/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if not n:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
    if n.read_at is None:
        n.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(n)
    return n


@app.post("/notifications/read-all", response_model=MessageResponse)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    rows = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.read_at.is_(None),
        )
        .all()
    )
    for n in rows:
        n.read_at = now
    db.commit()
    return MessageResponse(message="모두 읽음으로 표시했습니다.")


# --- 비밀번호 ---


@app.patch("/auth/password", response_model=MessageResponse)
def change_password(
    body: PasswordChangeBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail="현재 비밀번호가 올바르지 않습니다.",
        )
    current_user.hashed_password = hash_password(body.new_password)
    db.commit()
    return MessageResponse(message="비밀번호가 변경되었습니다.")


def _expires_at_utc(expires_at: datetime) -> datetime:
    if expires_at.tzinfo is None:
        return expires_at.replace(tzinfo=timezone.utc)
    return expires_at.astimezone(timezone.utc)


@app.post("/auth/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(body: ForgotPasswordBody, db: Session = Depends(get_db)):
    email = str(body.email).lower().strip()
    user = db.query(User).filter(User.email == email).first()
    reset_token: str | None = None
    if user:
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id
        ).delete()
        raw = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=_hash_reset_token(raw),
                expires_at=expires,
            )
        )
        db.commit()
        if PASSWORD_RESET_DEBUG:
            reset_token = raw
    msg = "등록된 이메일이면 비밀번호 재설정 안내가 발송됩니다."
    if reset_token:
        msg += " (개발 모드: 응답의 토큰으로 /auth/reset-password 호출)"
    return ForgotPasswordResponse(message=msg, reset_token=reset_token)


@app.post("/auth/reset-password", response_model=MessageResponse)
def reset_password_ep(body: ResetPasswordBody, db: Session = Depends(get_db)):
    th = _hash_reset_token(body.token.strip())
    row = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == th)
        .first()
    )
    now = datetime.now(timezone.utc)
    if not row or _expires_at_utc(row.expires_at) < now:
        raise HTTPException(
            status_code=400,
            detail="만료되었거나 유효하지 않은 토큰입니다.",
        )
    user = db.query(User).filter(User.id == row.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="유효하지 않은 토큰입니다.")
    user.hashed_password = hash_password(body.new_password)
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id
    ).delete()
    db.commit()
    return MessageResponse(message="비밀번호가 재설정되었습니다. 로그인해 주세요.")


# --- 신고 · 차단 ---


def _validate_report_target(db: Session, target_type: str, target_id: int) -> None:
    if target_type == "post":
        if not db.query(Post).filter(Post.id == target_id).first():
            raise HTTPException(status_code=404, detail="대상 게시글을 찾을 수 없습니다.")
    elif target_type == "comment":
        if not db.query(Comment).filter(Comment.id == target_id).first():
            raise HTTPException(status_code=404, detail="대상 댓글을 찾을 수 없습니다.")
    elif target_type == "user":
        if not db.query(User).filter(User.id == target_id).first():
            raise HTTPException(status_code=404, detail="대상 사용자를 찾을 수 없습니다.")


@app.post("/reports", response_model=ReportResponse)
def create_report(
    body: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_report_target(db, body.target_type, body.target_id)
    if body.target_type == "user" and body.target_id == current_user.id:
        raise HTTPException(status_code=400, detail="자기 자신은 신고할 수 없습니다.")
    r = Report(
        reporter_id=current_user.id,
        target_type=body.target_type,
        target_id=body.target_id,
        reason=body.reason.strip(),
        status="pending",
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@app.get("/users/blocks", response_model=list[UserBlockResponse])
def list_blocks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(UserBlock)
        .filter(UserBlock.blocker_id == current_user.id)
        .order_by(UserBlock.id.desc())
        .all()
    )
    return rows


@app.post("/users/blocks", response_model=UserBlockResponse)
def create_block(
    body: UserBlockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.blocked_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="자기 자신은 차단할 수 없습니다.")
    if not db.query(User).filter(User.id == body.blocked_user_id).first():
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    existing = (
        db.query(UserBlock)
        .filter(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == body.blocked_user_id,
        )
        .first()
    )
    if existing:
        return existing
    row = UserBlock(
        blocker_id=current_user.id,
        blocked_id=body.blocked_user_id,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
        return row
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(UserBlock)
            .filter(
                UserBlock.blocker_id == current_user.id,
                UserBlock.blocked_id == body.blocked_user_id,
            )
            .first()
        )
        if existing:
            return existing
        raise HTTPException(status_code=409, detail="차단 처리에 실패했습니다.")


@app.delete("/users/blocks/{blocked_user_id}", response_model=MessageResponse)
def delete_block(
    blocked_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(UserBlock)
        .filter(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == blocked_user_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="차단 정보를 찾을 수 없습니다.")
    db.delete(row)
    db.commit()
    return MessageResponse(message="차단이 해제되었습니다.")


# --- 관리자 ---


@app.get("/admin/reports", response_model=PaginatedReports)
def admin_list_reports(
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    q = db.query(Report)
    if status in ("pending", "resolved", "dismissed"):
        q = q.filter(Report.status == status)
    total = q.count()
    total_pages = (total + page_size - 1) // page_size if total else 0
    rows = (
        q.order_by(Report.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedReports(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@app.patch("/admin/reports/{report_id}", response_model=ReportResponse)
def admin_patch_report(
    report_id: int,
    body: ReportAdminPatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    r = db.query(Report).filter(Report.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="신고를 찾을 수 없습니다.")
    prev = r.status
    r.status = body.status
    r.admin_note = body.admin_note
    if body.status in ("resolved", "dismissed"):
        r.resolved_at = datetime.now(timezone.utc)
    if body.status in ("resolved", "dismissed") and prev != body.status:
        label = "처리 완료" if body.status == "resolved" else "기각"
        note = (body.admin_note or "").strip()
        msg = f"신고가 {label}되었습니다."
        if note:
            msg += f" {note}"
        _notify(
            db,
            user_id=r.reporter_id,
            kind=f"report_{body.status}",
            title="신고 처리 결과",
            body=msg,
            report_id=r.id,
        )
    db.commit()
    db.refresh(r)
    return r


@app.get("/admin/users", response_model=PaginatedAdminUsers)
def admin_list_users(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    q = db.query(User)
    total = q.count()
    total_pages = (total + page_size - 1) // page_size if total else 0
    rows = (
        q.order_by(User.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedAdminUsers(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@app.patch("/admin/users/{user_id}", response_model=AdminUserBrief)
def admin_patch_user(
    user_id: int,
    body: AdminUserPatch,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="본인 계정은 여기서 변경할 수 없습니다.")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    u.is_banned = body.is_banned
    db.commit()
    db.refresh(u)
    return u


@app.patch("/admin/posts/{post_id}", response_model=PostResponse)
def admin_patch_post(
    post_id: int,
    body: AdminPostPatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    post.is_hidden = body.is_hidden
    db.commit()
    db.refresh(post)
    ids = {post.user_id} if post.user_id else set()
    nick_map = _nickname_map(db, ids)
    return _post_to_response(post, nick_map)


@app.delete("/admin/posts/{post_id}", response_model=MessageResponse)
def admin_delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """관리자 글 삭제(소프트 삭제). 작성자 삭제와 동일하게 deleted_at 설정."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if post.deleted_at is not None:
        raise HTTPException(status_code=400, detail="이미 삭제된 글입니다.")
    post.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return MessageResponse(message="관리자에 의해 글이 삭제되었습니다.")