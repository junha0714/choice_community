from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Literal
from datetime import datetime

from categories import ALLOWED_CATEGORIES


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

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    """닉네임만 수정 (빈 문자열이면 닉네임 제거)"""
    nickname: str = Field(default="", max_length=50)


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
    ai_mode: Literal["simple", "detailed"] | None = None
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
        t = (v or "").strip()
        if t not in ALLOWED_CATEGORIES:
            raise ValueError("카테고리를 목록에서 선택해 주세요.")
        return t

    @field_validator("options")
    @classmethod
    def validate_options(cls, v: List[str]) -> List[str]:
        stripped = [x.strip() for x in v if str(x).strip()]
        if len(stripped) < 2:
            raise ValueError(
                "선택지는 비어 있지 않은 항목으로 최소 2개 이상 입력해 주세요."
            )
        if len(stripped) > 6:
            raise ValueError("선택지는 최대 6개까지예요.")
        return stripped

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
        t = (v or "").strip()
        if t not in ALLOWED_CATEGORIES:
            raise ValueError("카테고리를 목록에서 선택해 주세요.")
        return t

    @field_validator("options")
    @classmethod
    def validate_options(cls, v: List[str] | None) -> List[str] | None:
        if v is None:
            return None
        stripped = [x.strip() for x in v if str(x).strip()]
        if len(stripped) < 2:
            raise ValueError(
                "선택지는 비어 있지 않은 항목으로 최소 2개 이상 입력해 주세요."
            )
        if len(stripped) > 6:
            raise ValueError("선택지는 최대 6개까지예요.")
        return stripped


class PostResponse(BaseModel):
    id: int
    title: str
    content: str
    category: str
    options: str
    post_kind: str = "community"
    ai_mode: str | None = None
    view_count: int = 0
    like_count: int = 0
    liked_by_me: bool | None = None
    ai_recommended: str | None = None
    ai_reason: str | None = None
    # AI 글: 질문·답변 로그를 방문자에게 공개할지 (완료 후에만 적용)
    ai_transcript_public: bool = False
    user_id: int | None = None
    author_nickname: str | None = None
    created_at: datetime
    is_hidden: bool = False
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


class LikeToggleResponse(BaseModel):
    liked: bool
    like_count: int

class CommentCreate(BaseModel):
    content: str
    parent_id: int | None = None


class CommentUpdate(BaseModel):
    content: str = Field(min_length=1)


class CommentResponse(BaseModel):
    id: int
    content: str
    post_id: int
    user_id: int | None = None
    author_nickname: str | None = None
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
    recommended: str | None = None
    reason: str | None = None
    transcript: List[AITranscriptItem] | None = None


class AIAnswerRequest(BaseModel):
    answer: str


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


class RecentCommentBrief(BaseModel):
    id: int
    content: str
    post_id: int
    post_title: str
    author_nickname: str | None = None
    created_at: datetime


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
    is_banned: bool


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