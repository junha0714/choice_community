from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from categories import ALLOWED_CATEGORIES
from schemas import (
    CategoryAutoSuggestRequest,
    CategoryAutoSuggestResponse,
    PostDraftSuggestRequest,
    PostDraftSuggestResponse,
    TagSuggestRequest,
    TagSuggestResponse,
)
from app_helpers import _normalize_tag_term, _suggest_tags_from_db

router = APIRouter(tags=["meta"])

@router.get("/")
def root():
    return {"message": "Backend + PostgreSQL 연결 성공"}


@router.get("/meta/categories")
def meta_categories():
    """글 작성 시 선택 가능한 카테고리 목록."""
    return {"categories": list(ALLOWED_CATEGORIES)}


def _suggest_tags_ai(
    *,
    title: str,
    content: str,
    category: str | None,
    selected: list[str],
    limit: int = 8,
) -> list[str]:
    from ai_conversation import _extract_text, _parse_ai_json_response
    from openai_client import client

    selected_set = {_normalize_tag_term(x) for x in selected if _normalize_tag_term(x)}
    cat_line = f"참고 분류(있을 때만): {category.strip()}\n" if (category or "").strip() else ""
    sel_line = (
        f"이미 고른 태그(절대 반복·변형 금지): {', '.join(sorted(selected_set))}\n"
        if selected_set
        else ""
    )
    system = (
        "너는 한국어 커뮤니티 글에 붙일 **짧은 해시태그 후보**를 제안한다. "
        "반드시 JSON만 출력한다. 형식: {\"tags\":[\"태그1\",\"태그2\"]}\n"
        "규칙:\n"
        f"- {limit}개 이하, 권장 4~8개. 각 태그는 **2~10자** 짜리 주제어(너무 길게 쓰지 않는다).\n"
        "- #·공백·쉼표 없이 단어만. 한글·영문 소문자·숫자만 써도 된다(영문은 소문자).\n"
        "- 제목·본문에 근거 없는 고유명사·브랜드는 만들지 않는다. "
        "본문이 짧으면 덜 내도 된다.\n"
        + cat_line
        + sel_line
    )
    user = f"제목:\n{title}\n\n본문:\n{content}\n"
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        raw = response.choices[0].message.content
        if not raw:
            return []
        data = _parse_ai_json_response(raw)
    except Exception:
        return []

    raw_tags = data.get("tags")
    out: list[str] = []
    seen: set[str] = set()
    if not isinstance(raw_tags, list):
        return []
    for x in raw_tags:
        s = (
            _extract_text(x).strip()
            if not isinstance(x, str)
            else str(x).strip()
        )
        s = s.lstrip("#").strip()
        t = _normalize_tag_term(s)
        if len(t) < 2 or t in selected_set or t in seen:
            continue
        seen.add(t)
        out.append(t)
        if len(out) >= limit:
            break
    return out


@router.post("/meta/tag-suggestions", response_model=TagSuggestResponse)
def suggest_tags(body: TagSuggestRequest, db: Session = Depends(get_db)):
    """
    제목/본문(그리고 선택적으로 카테고리)을 기반으로 태그 후보를 추천한다.
    - 로그인 불필요 (작성 폼 UX용)
    - 기본(use_ai=True): LLM으로 짧은 태그 제안
    - use_ai=False: 기존처럼 DB에 올라온 태그 빈도 기반
    """
    title = (body.title or "").strip()
    content = (body.content or "").strip()
    if len(title) + len(content) < 8:
        return {"tags": []}
    selected = body.selected or []
    if body.use_ai:
        tags = _suggest_tags_ai(
            title=title,
            content=content,
            category=body.category,
            selected=selected,
            limit=8,
        )
        return {"tags": tags}
    tags = _suggest_tags_from_db(
        db,
        title=title,
        content=content,
        category=body.category,
        selected=selected,
        limit=8,
    )
    return {"tags": tags}


POST_DRAFT_SUGGEST_DISCLAIMER = (
    "AI가 제안한 내용이라 실제와 다르거나 어색할 수 있어요. 반드시 확인한 뒤 수정해 주세요."
)

_CATEGORY_AUTO_DISCLAIMER = (
    "분류는 AI가 맞춘 값이라 어긋날 수 있어요. ‘직접 고르기’에서 바꿀 수 있어요."
)


@router.post("/meta/suggest-category", response_model=CategoryAutoSuggestResponse)
def suggest_category_only(body: CategoryAutoSuggestRequest):
    """제목·본문만으로 카테고리(고정 목록 중 하나)만 가볍게 추천한다."""
    from ai_conversation import _extract_text, _parse_ai_json_response
    from openai_client import client

    title = (body.title or "").strip()
    content = (body.content or "").strip()
    if len(title) + len(content) < 10:
        return CategoryAutoSuggestResponse(
            category="기타",
            disclaimer=_CATEGORY_AUTO_DISCLAIMER,
        )

    cat_joined = " / ".join(ALLOWED_CATEGORIES)
    system = (
        "너는 한국어 커뮤니티 고민 글의 분류만 고른다. "
        "제목·본문에 없는 사실은 지어내지 않는다. "
        '반드시 JSON만 출력: {"category":"…"}\n'
        f"category 값은 아래 중 **정확히 한 문자열**만(철자 동일): {cat_joined}\n"
        "애매하면 반드시 '기타'.\n"
    )
    user = f"제목:\n{title}\n\n본문:\n{content}\n"
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        raw = response.choices[0].message.content
        if not raw:
            raise ValueError("empty model response")
        data = _parse_ai_json_response(raw)
    except Exception:
        return CategoryAutoSuggestResponse(
            category="기타",
            disclaimer=_CATEGORY_AUTO_DISCLAIMER,
        )

    cat_raw = _extract_text(data.get("category")).strip()
    category = cat_raw if cat_raw in ALLOWED_CATEGORIES else "기타"
    return CategoryAutoSuggestResponse(
        category=category,
        disclaimer=_CATEGORY_AUTO_DISCLAIMER,
    )


@router.post("/meta/suggest-options-category", response_model=PostDraftSuggestResponse)
def suggest_options_category(body: PostDraftSuggestRequest):
    """
    제목·본문만으로 투표 선택지 후보와 카테고리(고정 목록 중 하나)를 AI로 제안한다.
    로그인 불필요(작성 폼 UX용). 부정확할 수 있음은 disclaimer로 안내한다.
    """
    from ai_conversation import _extract_text, _parse_ai_json_response
    from openai_client import client

    title = (body.title or "").strip()
    content = (body.content or "").strip()
    if len(title) + len(content) < 10:
        return PostDraftSuggestResponse(
            options=[],
            category="기타",
            disclaimer=POST_DRAFT_SUGGEST_DISCLAIMER,
        )

    cat_joined = " / ".join(ALLOWED_CATEGORIES)
    system = (
        "너는 한국어 커뮤니티에서 사용자의 고민 글을 보고 투표 선택지와 분류를 제안하는 도우미다. "
        "제목과 본문에 없는 사실을 지어내지 말고, 추측은 과하지 않게 한다. "
        "반드시 JSON만 출력한다. 형식:\n"
        '{"options":["짧은 선택지1","짧은 선택지2"],"category":"…"}\n'
        "규칙:\n"
        "- options: 2~6개(가능하면 2~4개로도 충분할 때는 짧게). **투표 버튼에 붙일 짧은 후보명**만 쓴다. "
        "가능하면 **명사·짧은 구(대략 2~10자)**로 끝낸다(예: ‘축구’ ‘농구’, ‘A회사’ ‘B회사’). "
        "‘~해요’ ‘~할까요’ ‘~가 좋아요’ 같은 **문장형·설명형**은 쓰지 않는다. "
        "각 선택지는 **최대 18자**, 서로 겹치지 않게. 번호·글머리표 없이 문구만.\n"
        f"- category: 아래 중 **정확히 한 문자열**만(철자 동일): {cat_joined}\n"
        "- 애매하면 category는 '기타'.\n"
    )
    user = f"제목:\n{title}\n\n본문:\n{content}\n"

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        raw = response.choices[0].message.content
        if not raw:
            raise ValueError("empty model response")
        data = _parse_ai_json_response(raw)
    except Exception:
        return PostDraftSuggestResponse(
            options=[],
            category="기타",
            disclaimer=POST_DRAFT_SUGGEST_DISCLAIMER,
        )

    opts_raw = data.get("options")
    opts: list[str] = []
    seen: set[str] = set()
    if isinstance(opts_raw, list):
        for x in opts_raw:
            s = (
                _extract_text(x).strip()
                if not isinstance(x, str)
                else str(x).strip()
            )
            if not s:
                continue
            key = s.casefold()
            if key in seen:
                continue
            seen.add(key)
            opts.append(s[:18])
            if len(opts) >= 6:
                break

    cat_raw = _extract_text(data.get("category")).strip()
    category = cat_raw if cat_raw in ALLOWED_CATEGORIES else "기타"

    return PostDraftSuggestResponse(
        options=opts,
        category=category,
        disclaimer=POST_DRAFT_SUGGEST_DISCLAIMER,
    )
