"""데모용 게시글 여러 개 삽입.

  backend 폴더에서 (venv 활성화 후):

    python seed_demo_posts.py
    python seed_demo_posts.py --reset

  --reset: 기존 게시글·댓글·투표·좋아요·AI기록·관련 신고·알림을 모두 지운 뒤 데모만 넣습니다.

  - 사용자가 한 명이라도 있으면: 가장 id가 작은 사용자를 작성자로 씁니다.
  - 사용자가 없으면: seed@demo.local / demo1234! 계정을 만들고 그 계정으로 글을 씁니다.

  구성: 커뮤니티 투표 글 + 「AI와 함께 고민하기」글(post_kind=ai)이 함께 들어갑니다.
"""
from __future__ import annotations

import sys
from pathlib import Path

from dotenv import load_dotenv

_BACKEND = Path(__file__).resolve().parent
load_dotenv(_BACKEND / ".env")
load_dotenv()

from auth import hash_password  # noqa: E402
from categories import ALLOWED_CATEGORIES  # noqa: E402
from database import SessionLocal  # noqa: E402
from models import (  # noqa: E402
    AIInteraction,
    Comment,
    Notification,
    Post,
    PostLike,
    Report,
    User,
    Vote,
)

SAMPLES: list[dict] = [
    {
        "title": "점심 메뉴 뭐가 좋을까요?",
        "content": "회사 근처에서 빠르게 먹을 수 있는 메뉴를 고르고 있어요. 매일 같은 곳만 가서 고민이에요.",
        "category": "음식·맛집",
        "options": ["한식", "일식", "양식"],
        "tags": "점심,직장",
        "post_kind": "community",
    },
    {
        "title": "주말 데이트 코스 추천",
        "content": "비 오는 날에도 실내 위주로 돌아다닐 수 있는 코스가 있으면 좋겠어요.",
        "category": "연애·관계",
        "options": ["카페 투어", "전시·박물관", "영화관"],
        "tags": "데이트,주말",
        "post_kind": "community",
    },
    {
        "title": "첫 직장 이직 타이밍",
        "content": "입사 1년 차인데 성장은 있는지 잘 모르겠어요. 언제쯤 이직을 고민하면 될까요?",
        "category": "직장·커리어",
        "options": ["지금 당장", "2~3년 후", "우선 연차 쌓기"],
        "tags": "이직,커리어",
        "post_kind": "community",
    },
    {
        "title": "운동 루틴 어떻게 잡을까요?",
        "content": "헬스 vs 러닝 vs 홈트 중에서 꾸준히 할 수 있는 걸 고르고 싶어요.",
        "category": "운동·스포츠",
        "options": ["헬스", "러닝", "홈트"],
        "tags": "운동,루틴",
        "post_kind": "community",
    },
    {
        "title": "노트북 살 때 CPU vs RAM",
        "content": "개발용으로 쓸 건데 예산은 한정적이에요. 우선순위를 어떻게 두면 좋을까요?",
        "category": "게임·디지털",
        "options": ["CPU 우선", "RAM 우선", "화질·디스플레이 우선"],
        "tags": "노트북,개발",
        "post_kind": "community",
    },
    {
        "title": "여행 가면 꼭 챙길 것",
        "content": "3박 4일 국내 여행 예정이에요. 짐을 줄이고 싶은데 빼면 안 되는 게 뭘까요?",
        "category": "여행·이동",
        "options": ["보조배터리", "우산", "상비약"],
        "tags": "여행,짐",
        "post_kind": "community",
    },
    {
        "title": "재테크 시작은 어디서?",
        "content": "적금만 하고 있는데 요즘 금리가 아쉬워요. 공격적으로 가도 될까요?",
        "category": "금융·소비",
        "options": ["적금·예금 유지", "ETF 소액", "공부 더 하기"],
        "tags": "재테크,저축",
        "post_kind": "community",
    },
    # --- AI와 함께 고민하기 (상세에서 AI 질문 시작 가능) ---
    {
        "title": "[AI] 번아웃 이후, 이직 vs 휴식",
        "content": "몇 달째 무기력하고 번아웃이 와요. 당장 이직을 준비할지, 아니면 짧게라도 쉴지 AI와 함께 정리해 보고 싶어요.",
        "category": "직장·커리어",
        "options": ["이직 준비", "휴식/휴직", "현 직장 유지"],
        "tags": "ai,번아웃",
        "post_kind": "ai",
        "ai_mode": "simple",
    },
    {
        "title": "[AI] 연애 3년 차, 다음 단계 고민",
        "content": "서로를 잘 알게 됐는데 결혼·동거·현상 유지 중 선택지가 막막해요. 선택지마다 장단점을 비교해 보고 싶어요.",
        "category": "연애·관계",
        "options": ["결혼 준비", "동거", "지금 관계 유지"],
        "tags": "ai,연애",
        "post_kind": "ai",
        "ai_mode": "detailed",
    },
    {
        "title": "[AI] 이사 vs 리모델링",
        "content": "예산은 한정적인데 살기 불편해요. 이사를 갈지, 집을 리모델링할지 AI와 질문을 나눠 보고 싶어요.",
        "category": "집·인테리어",
        "options": ["이사", "부분 리모델링", "1~2년 더 유지"],
        "tags": "ai,집",
        "post_kind": "ai",
        "ai_mode": "simple",
    },
]


def _delete_all_posts_and_related(db) -> int:
    """모든 게시글과 댓글·투표·좋아요·AI로그·해당 신고·알림을 삭제. 사용자·차단 목록은 유지."""
    pids = [r[0] for r in db.query(Post.id).all()]
    if not pids:
        return 0

    cids = [r[0] for r in db.query(Comment.id).filter(Comment.post_id.in_(pids)).all()]

    rep_rows = (
        db.query(Report.id)
        .filter(Report.target_type == "post", Report.target_id.in_(pids))
        .all()
    )
    rep_ids = [r[0] for r in rep_rows]
    if cids:
        rep_ids += [
            r[0]
            for r in db.query(Report.id)
            .filter(Report.target_type == "comment", Report.target_id.in_(cids))
            .all()
        ]

    if rep_ids:
        db.query(Notification).filter(Notification.report_id.in_(rep_ids)).delete(
            synchronize_session=False
        )
    if cids:
        db.query(Notification).filter(Notification.comment_id.in_(cids)).delete(
            synchronize_session=False
        )
    db.query(Notification).filter(Notification.post_id.in_(pids)).delete(
        synchronize_session=False
    )

    if rep_ids:
        db.query(Report).filter(Report.id.in_(rep_ids)).delete(synchronize_session=False)

    # 댓글: 자식(답글)부터 삭제
    while db.query(Comment).filter(Comment.post_id.in_(pids)).count() > 0:
        used_as_parent = {
            r[0]
            for r in db.query(Comment.parent_id)
            .filter(Comment.parent_id.isnot(None))
            .distinct()
            .all()
            if r[0]
        }
        batch = [
            c.id
            for c in db.query(Comment).filter(Comment.post_id.in_(pids)).all()
            if c.id not in used_as_parent
        ]
        if not batch:
            one = db.query(Comment).filter(Comment.post_id.in_(pids)).first()
            if not one:
                break
            batch = [one.id]
        db.query(Comment).filter(Comment.id.in_(batch)).delete(synchronize_session=False)
        db.commit()

    db.query(Vote).filter(Vote.post_id.in_(pids)).delete(synchronize_session=False)
    db.query(PostLike).filter(PostLike.post_id.in_(pids)).delete(synchronize_session=False)
    db.query(AIInteraction).filter(AIInteraction.post_id.in_(pids)).delete(
        synchronize_session=False
    )
    deleted = db.query(Post).filter(Post.id.in_(pids)).delete(synchronize_session=False)
    db.commit()
    return deleted


def _get_or_create_user(db) -> User:
    u = db.query(User).order_by(User.id.asc()).first()
    if u:
        return u
    email = "seed@demo.local"
    if db.query(User).filter(User.email == email).first():
        return db.query(User).filter(User.email == email).first()
    u = User(
        email=email,
        hashed_password=hash_password("demo1234!"),
        nickname="데모시드",
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    print(f"사용자 없음 → 생성: {email} / 비밀번호: demo1234!", file=sys.stderr)
    return u


def main(*, reset: bool = False) -> None:
    db = SessionLocal()
    try:
        if reset:
            n = _delete_all_posts_and_related(db)
            print(f"기존 게시글 및 연관 데이터 삭제 완료 (삭제된 글: {n}건).", file=sys.stderr)
        user = _get_or_create_user(db)
        created = 0
        n_comm = 0
        n_ai = 0
        for i, row in enumerate(SAMPLES):
            cat = row["category"]
            if cat not in ALLOWED_CATEGORIES:
                cat = ALLOWED_CATEGORIES[i % len(ALLOWED_CATEGORIES)]
            opts = row["options"]
            kind = row.get("post_kind") or "community"
            ai_mode_val = None
            if kind == "ai":
                ai_mode_val = row.get("ai_mode") or "simple"
                n_ai += 1
            else:
                n_comm += 1
            post = Post(
                title=row["title"],
                content=row["content"],
                category=cat,
                options=",".join(opts),
                user_id=user.id,
                post_kind=kind,
                ai_mode=ai_mode_val,
                tags=row.get("tags"),
            )
            db.add(post)
            created += 1
        db.commit()
        print(
            f"게시글 {created}개 등록 (커뮤니티 {n_comm}, AI {n_ai}) / 사용자 id={user.id} ({user.email})"
        )
    finally:
        db.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="데모 게시글 삽입. --reset 으로 기존 글 전부 지운 뒤 시드."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="모든 게시글·댓글·투표·좋아요·AI기록·관련 신고/알림 삭제 후 데모만 추가",
    )
    args = parser.parse_args()
    main(reset=args.reset)
