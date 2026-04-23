from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    nickname = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_admin = Column(Boolean, nullable=False, server_default="false", default=False)
    is_banned = Column(Boolean, nullable=False, server_default="false", default=False)


class Post(Base):
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String, nullable=False)
    options = Column(Text, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    # community: 투표·댓글 중심 / ai: AI 질문·추천 플로우 허용
    post_kind = Column(String(20), nullable=False, server_default="community")
    # ai 글만: simple(짧은 질문 3회) / detailed(질문 5회 + 선택지별 비교)
    ai_mode = Column(String(20), nullable=True)
    view_count = Column(Integer, nullable=False, server_default="0", default=0)
    like_count = Column(Integer, nullable=False, server_default="0", default=0)
    # AI 최종 결과
    ai_recommended = Column(Text, nullable=True)
    ai_reason = Column(Text, nullable=True)
    # True면 질문·답변 과정(ai_interactions)을 완료 후 다른 사용자에게도 공개
    ai_transcript_public = Column(Boolean, nullable=False, server_default="false", default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    is_hidden = Column(Boolean, nullable=False, server_default="false", default=False)
    # 쉼표로 구분된 태그 (소문자 정규화), 예: "고민,연애"
    tags = Column(Text, nullable=True)
    # 투표 마감 시각 (NULL이면 마감 없음)
    vote_deadline_at = Column(DateTime(timezone=True), nullable=True)

class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)

    post_id = Column(Integer, ForeignKey("posts.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    parent_id = Column(Integer, ForeignKey("comments.id"), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)

class Vote(Base):
    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    selected_option = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AIInteraction(Base):
    __tablename__ = "ai_interactions"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    step_number = Column(Integer, nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    target_type = Column(String(20), nullable=False, index=True)
    target_id = Column(Integer, nullable=False, index=True)
    reason = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, server_default="pending", index=True)
    admin_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)


class UserBlock(Base):
    __tablename__ = "user_blocks"
    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_user_block_pair"),
    )

    id = Column(Integer, primary_key=True, index=True)
    blocker_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    blocked_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String(40), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=True, index=True)
    comment_id = Column(Integer, ForeignKey("comments.id"), nullable=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class PostLike(Base):
    __tablename__ = "post_likes"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_like_post_user"),)

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

