from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator, ValidationInfo
from typing import List, Literal
from datetime import datetime

from categories import (
    ALLOWED_CATEGORIES,
    normalize_category,
    is_board_category,
    is_notice_category,
    is_suggestion_category,
)


# --- 인증 ---
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    nickname: str | None = Field(default=None, max_length=50)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserPublic(BaseModel):
    id: int
    email: str
    nickname: str | None
    created_at: datetime
    is_admin: bool = False
    auth_provider: str = "email"
    has_password: bool = False

    class Config:
        from_attributes = True


class OAuthProvidersResponse(BaseModel):
    google: bool = False
    kakao: bool = False


class UserProfileUpdate(BaseModel):
    """닉네임만 수정 (빈 문자열이면 닉네임 제거)"""
    nickname: str = Field(default="", max_length=50)


class UserSettingsResponse(BaseModel):
    default_ai_mode: str = "quick"
    default_ai_transcript_public: bool = False
    notify_comment: bool = True
    notify_reply: bool = True
    notify_like: bool = True
    notify_vote_end: bool = True

    class Config:
        from_attributes = True


class UserSettingsUpdate(BaseModel):
    default_ai_mode: Literal["quick", "deep", "friend"] | None = None
    default_ai_transcript_public: bool | None = None
    notify_comment: bool | None = None
    notify_reply: bool | None = None
    notify_like: bool | None = None
    notify_vote_end: bool | None = None


class AccountDeleteBody(BaseModel):
    password: str = Field(default="", max_length=128)


def _normalize_tag_list(v: List[str] | None) -> List[str]:
    if not v:
        return []
    seen: set[str] = set()
    out: List[str] = []
    for x in v:
        s = (x or "").strip().lower()[:30]
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out[:10]


class PostCreate(BaseModel):
    title: str
    content: str
    category: str
    options: List[str]
    post_kind: Literal["community", "ai"] = "community"
    ai_mode: str | None = None
    ai_question_steps: int | None = Field(
        default=None,
        ge=3,
        le=10,
        description="AI 글만: 질문 횟수. 비우면 스타일별 기본",
    )

    @field_validator("ai_mode", mode="before")
    @classmethod
    def _normalize_post_ai_mode(cls, v):
        if v is None:
            return None
        from ai_conversation import normalize_ai_mode

        return normalize_ai_mode(str(v))
    tags: List[str] | None = None
    vote_deadline_at: datetime | None = Field(
        default=None,
        description="투표 마감 시각(없으면 마감 없음)",
    )

    @field_validator("tags", mode="before")
    @classmethod
    def validate_tags(cls, v):
        return _normalize_tag_list(v if isinstance(v, list) else None)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        t = normalize_category(v)
        if t not in ALLOWED_CATEGORIES:
            raise ValueError("카테고리를 목록에서 선택해 주세요.")
        return t

    @field_validator("options")
    @classmethod
    def validate_options(cls, v: List[str], info: ValidationInfo) -> List[str]:
        cat = (info.data.get("category") or "").strip() if info.data else ""
        if is_board_category(cat):
            return []
        stripped = [x.strip() for x in v if str(x).strip()]
        if len(stripped) < 2:
            raise ValueError(
                "선택지는 비어 있지 않은 항목으로 최소 2개 이상 입력해 주세요."
            )
        if len(stripped) > 6:
            raise ValueError("선택지는 최대 6개까지예요.")
        if len({x.casefold() for x in stripped}) != len(stripped):
            raise ValueError("선택지는 서로 달라야 해요.")
        return stripped

    @model_validator(mode="after")
    def validate_board_post(self) -> "PostCreate":
        if is_notice_category(self.category):
            if self.post_kind == "ai":
                raise ValueError("공지는 AI 글로 작성할 수 없어요.")
            object.__setattr__(self, "options", [])
            object.__setattr__(self, "vote_deadline_at", None)
        elif is_suggestion_category(self.category):
            if self.post_kind == "ai":
                raise ValueError("건의 게시판은 AI 글로 작성할 수 없어요.")
            object.__setattr__(self, "options", [])
            object.__setattr__(self, "vote_deadline_at", None)
        return self

class PostUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None
    options: List[str] | None = None
    tags: List[str] | None = None
    vote_deadline_at: datetime | None = None
    ai_transcript_public: bool | None = None

    @field_validator("tags", mode="before")
    @classmethod
    def validate_tags(cls, v):
        if v is None:
            return None
        return _normalize_tag_list(v if isinstance(v, list) else None)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str | None) -> str | None:
        if v is None:
            return None
        t = normalize_category(v)
        if t not in ALLOWED_CATEGORIES:
            raise ValueError("카테고리를 목록에서 선택해 주세요.")
        return t

    @field_validator("options")
    @classmethod
    def validate_options(
        cls, v: List[str] | None, info: ValidationInfo
    ) -> List[str] | None:
        if v is None:
            return None
        cat = (info.data.get("category") or "").strip() if info.data else ""
        if is_board_category(cat):
            return []
        stripped = [x.strip() for x in v if str(x).strip()]
        if len(stripped) < 2:
            raise ValueError(
                "선택지는 비어 있지 않은 항목으로 최소 2개 이상 입력해 주세요."
            )
        if len(stripped) > 6:
            raise ValueError("선택지는 최대 6개까지예요.")
        if len({x.casefold() for x in stripped}) != len(stripped):
            raise ValueError("선택지는 서로 달라야 해요.")
        return stripped

    @model_validator(mode="after")
    def validate_board_update(self) -> "PostUpdate":
        if self.category is not None and is_board_category(self.category):
            object.__setattr__(self, "options", [])
            object.__setattr__(self, "vote_deadline_at", None)
        return self


class PostResponse(BaseModel):
    id: int
    title: str
    content: str
    category: str
    options: str
    post_kind: str = "community"
    ai_mode: str | None = None
    ai_question_steps: int | None = None
    view_count: int = 0
    like_count: int = 0
    vote_count: int = 0
    comment_count: int = 0
    liked_by_me: bool | None = None
    ai_recommended: str | None = None
    ai_reason: str | None = None
    # AI 글: 질문·답변 로그를 방문자에게 공개할지 (완료 후에만 적용)
    ai_transcript_public: bool = False
    user_id: int | None = None
    author_nickname: str | None = None
    created_at: datetime
    is_hidden: bool = False
    is_published: bool = True
    is_notice: bool = False
    is_board_post: bool = False
    tags: List[str] = []
    vote_deadline_at: datetime | None = None

    class Config:
        from_attributes = True


class PaginatedPosts(BaseModel):
    items: List[PostResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class SimilarPostBrief(BaseModel):
    id: int
    title: str
    category: str
    post_kind: str = "community"
    view_count: int = 0
    like_count: int = 0
    created_at: datetime
    tags: List[str] = []

    class Config:
        from_attributes = True


class PostPageDataResponse(BaseModel):
    post: PostResponse
    comments: List["CommentResponse"]
    vote_counts: List["VoteCountResponse"]
    my_vote: "VoteResponse | None" = None
    similar: List[SimilarPostBrief]


class LikeToggleResponse(BaseModel):
    liked: bool
    like_count: int

class CommentCreate(BaseModel):
    content: str
    parent_id: int | None = None
    is_anonymous: bool = False


class CommentUpdate(BaseModel):
    content: str = Field(min_length=1)


class CommentResponse(BaseModel):
    id: int
    content: str
    post_id: int
    user_id: int | None = None
    author_nickname: str | None = None
    is_anonymous: bool = False
    parent_id: int | None = None
    reply_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationResponse(BaseModel):
    id: int
    kind: str
    title: str
    body: str
    post_id: int | None = None
    comment_id: int | None = None
    report_id: int | None = None
    read_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class PaginatedNotifications(BaseModel):
    items: List[NotificationResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class NotificationUnreadCount(BaseModel):
    count: int

class VoteCreate(BaseModel):
    selected_option: str


class VoteResponse(BaseModel):
    id: int
    post_id: int
    user_id: int | None = None
    selected_option: str
    created_at: datetime

    class Config:
        from_attributes = True

class VoteCountResponse(BaseModel):
    option: str
    count: int


class AITranscriptItem(BaseModel):
    step: int
    question: str
    answer: str | None = None

    class Config:
        from_attributes = True


class AIQuestionFlowResponse(BaseModel):
    type: str
    step: int | None = None
    question: str | None = None
    suggested_answers: List[str] | None = None
    recommended: str | None = None
    reason: str | None = None
    low_confidence: bool | None = None
    transcript: List[AITranscriptItem] | None = None
    draft_post_id: int | None = None


class AIAnswerRequest(BaseModel):
    """action이 answer가 아니면 answer 필드는 무시되고 서버가 고정 문구로 대체한다."""

    answer: str = ""
    action: Literal["answer", "skip_question", "finish_here"] = Field(
        default="answer",
        description="answer=일반, skip_question=질문 패스, finish_here=남은 질문 없이 추천",
    )

    @model_validator(mode="after")
    def _normalize_ai_answer(self):
        from ai_conversation import AI_CANNED_FINISH_ANSWER, AI_CANNED_SKIP_ANSWER

        if self.action == "skip_question":
            object.__setattr__(self, "answer", AI_CANNED_SKIP_ANSWER)
        elif self.action == "finish_here":
            extra = (self.answer or "").strip()
            merged = (
                f"{AI_CANNED_FINISH_ANSWER} {extra}".strip()
                if extra
                else AI_CANNED_FINISH_ANSWER
            )
            object.__setattr__(self, "answer", merged)
        else:
            a = (self.answer or "").strip()
            if not a:
                raise ValueError("답변을 입력해 주세요.")
            object.__setattr__(self, "answer", a)
        return self


class PostDraftSuggestRequest(BaseModel):
    title: str = Field(default="", max_length=500)
    content: str = Field(default="", max_length=50_000)


class PostDraftSuggestResponse(BaseModel):
    options: List[str]
    category: str
    disclaimer: str


class CategoryAutoSuggestRequest(BaseModel):
    title: str = Field(default="", max_length=500)
    content: str = Field(default="", max_length=50_000)


class CategoryAutoSuggestResponse(BaseModel):
    category: str
    disclaimer: str


# --- AI 세션(대화 후 게시) ---
class AISessionStartRequest(BaseModel):
    title: str
    content: str
    category: str
    options: List[str]
    ai_mode: str = Field(default="quick", description="quick|deep|friend|random_fun")
    ai_question_steps: int = Field(default=3, ge=3, le=10)

    @field_validator("ai_mode", mode="before")
    @classmethod
    def _normalize_session_ai_mode(cls, v):
        from ai_conversation import normalize_ai_mode

        return normalize_ai_mode(v if v is not None else "quick")
    tags: List[str] | None = None
    vote_deadline_at: datetime | None = None

    @field_validator("options")
    @classmethod
    def validate_ai_session_options(cls, v: List[str]) -> List[str]:
        stripped = [x.strip() for x in v if str(x).strip()]
        if len(stripped) < 2:
            raise ValueError("선택지는 최소 2개 이상 입력해 주세요.")
        if len(stripped) > 6:
            raise ValueError("선택지는 최대 6개까지예요.")
        if len({x.casefold() for x in stripped}) != len(stripped):
            raise ValueError("선택지는 서로 달라야 해요.")
        return stripped

    @field_validator("tags", mode="before")
    @classmethod
    def validate_ai_session_tags(cls, v):
        return _normalize_tag_list(v if isinstance(v, list) else None)


class AISessionStartResponse(AIQuestionFlowResponse):
    session_id: str

# --- 사이드바 / 통계 ---
class CategoryStat(BaseModel):
    category: str
    count: int


class PopularPostBrief(BaseModel):
    id: int
    title: str
    category: str
    vote_count: int


class PopularPostByViewsBrief(BaseModel):
    id: int
    title: str
    category: str
    view_count: int


class TrendingPostBrief(BaseModel):
    id: int
    title: str
    category: str
    view_count: int = 0
    like_count: int = 0
    vote_count: int = 0
    comment_count: int = 0


class TrendingPostsBundle(BaseModel):
    """사이드바 인기 글 (투표·조회·좋아요). days 미지정 시 전체 기간."""

    by_votes: list[TrendingPostBrief] = []
    by_views: list[TrendingPostBrief] = []
    by_likes: list[TrendingPostBrief] = []


class ShellSidebarResponse(BaseModel):
    choice_categories: List[str]
    category_stats: List["CategoryStat"]
    trending: TrendingPostsBundle
class RecentCommentBrief(BaseModel):
    id: int
    content: str
    post_id: int
    post_title: str
    author_nickname: str | None = None
    created_at: datetime


class StatsSummary(BaseModel):
    total_posts: int = 0
    total_votes: int = 0
    ai_recommendations: int = 0


# --- 신고 · 차단 · 비밀번호 · 관리자 ---
ReportTargetType = Literal["post", "comment", "user"]
ReportStatus = Literal["pending", "resolved", "dismissed"]


class ReportCreate(BaseModel):
    target_type: ReportTargetType
    target_id: int
    reason: str = Field(min_length=1, max_length=2000)


class ReportResponse(BaseModel):
    id: int
    reporter_id: int
    target_type: str
    target_id: int
    reason: str
    status: str
    admin_note: str | None
    created_at: datetime
    resolved_at: datetime | None

    class Config:
        from_attributes = True


class ReportAdminPatch(BaseModel):
    status: ReportStatus
    admin_note: str | None = None


class UserBlockCreate(BaseModel):
    blocked_user_id: int


class UserBlockResponse(BaseModel):
    id: int
    blocker_id: int
    blocked_id: int
    blocked_nickname: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class PasswordChangeBody(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordBody(BaseModel):
    email: EmailStr


class ResetPasswordBody(BaseModel):
    token: str = Field(min_length=10)
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: str | None = None


class MessageResponse(BaseModel):
    message: str


# --- 태그 추천 ---
class TagSuggestRequest(BaseModel):
    title: str = ""
    content: str = ""
    category: str | None = None
    selected: List[str] | None = None
    use_ai: bool = Field(
        default=True,
        description="True: 제목·본문 기준 LLM 짧은 태그. False: 기존 게시글 태그 빈도 기반",
    )

    @field_validator("selected", mode="before")
    @classmethod
    def validate_selected(cls, v):
        return _normalize_tag_list(v if isinstance(v, list) else None)


class TagSuggestResponse(BaseModel):
    tags: List[str] = []


class AdminUserBrief(BaseModel):
    id: int
    email: str
    nickname: str | None
    is_admin: bool
    is_banned: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserPatch(BaseModel):
    is_banned: bool | None = None
    delete_account: bool = False

    @model_validator(mode="after")
    def require_action(self):
        if self.delete_account:
            return self
        if self.is_banned is None:
            raise ValueError("is_banned 또는 delete_account가 필요합니다.")
        return self


class AdminPostPatch(BaseModel):
    is_hidden: bool


class PaginatedReports(BaseModel):
    items: List[ReportResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class PaginatedAdminUsers(BaseModel):
    items: List[AdminUserBrief]
    total: int
    page: int
    page_size: int
    total_pages: int