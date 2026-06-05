"""글 카테고리: 게시판(공지·건의) + 선택 고민 분류."""

NOTICE_CATEGORY = "공지사항"
SUGGESTION_CATEGORY = "건의게시판"

BOARD_CATEGORIES: tuple[str, ...] = (NOTICE_CATEGORY, SUGGESTION_CATEGORY)

# 투표·선택지 중심 고민 분류 (10종)
CHOICE_CATEGORIES: tuple[str, ...] = (
    "음식·카페",
    "패션·뷰티",
    "진로·커리어",
    "연애·인간관계",
    "취미여가",
    "주거·생활",
    "쇼핑·소비",
    "여행·이동",
    "반려동물",
    "기타",
)

ALLOWED_CATEGORIES: tuple[str, ...] = BOARD_CATEGORIES + CHOICE_CATEGORIES

# 구 카테고리 → 신규 (DB 마이그레이션·레거시 글)
LEGACY_CATEGORY_MAP: dict[str, str] = {
    "음식·맛집": "음식·카페",
    "음료·카페": "음식·카페",
    "학교·진로": "진로·커리어",
    "학업·진로": "진로·커리어",
    "직장·커리어": "진로·커리어",
    "연애·관계": "연애·인간관계",
    "취미·엔터테인먼트": "취미여가",
    "취미·여가": "취미여가",
    "게임·디지털": "취미여가",
    "영화·책·콘텐츠": "취미여가",
    "가족·친구": "연애·인간관계",
    "생활·건강": "주거·생활",
    "집·인테리어": "주거·생활",
    "생활·자취": "주거·생활",
    "금융·소비": "쇼핑·소비",
    "운동·스포츠": "취미여가",
}


def normalize_category(category: str | None) -> str:
    """저장·표시용 카테고리 문자열 정규화."""
    t = (category or "").strip()
    if not t:
        return "기타"
    if t in ALLOWED_CATEGORIES:
        return t
    return LEGACY_CATEGORY_MAP.get(t, "기타")


def category_filter_values(category: str | None) -> list[str]:
    """DB 필터: canonical + 해당 legacy 별칭."""
    norm = normalize_category(category)
    values = {norm}
    for old, new in LEGACY_CATEGORY_MAP.items():
        if new == norm:
            values.add(old)
    return list(values)


def is_notice_category(category: str | None) -> bool:
    return normalize_category(category) == NOTICE_CATEGORY


def is_suggestion_category(category: str | None) -> bool:
    return normalize_category(category) == SUGGESTION_CATEGORY


def is_board_category(category: str | None) -> bool:
    return normalize_category(category) in BOARD_CATEGORIES


def is_board_no_vote_category(category: str | None) -> bool:
    """공지·건의 — 선택지·투표 없음."""
    return is_board_category(category)


def categories_for_auto_suggest() -> tuple[str, ...]:
    """AI 자동 분류·선택지 제안에는 게시판 카테고리를 넣지 않는다."""
    return CHOICE_CATEGORIES
