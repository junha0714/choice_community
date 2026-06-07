/** 고민·게시판 카테고리 표시 (DB 값은 이모지 없음) */

export const CHOICE_CATEGORY_ORDER = [
  "음식·카페",
  "패션·뷰티",
  "진로·커리어",
  "연애·인간관계",
  "취미·여가",
  "주거·생활",
  "쇼핑·소비",
  "여행·이동",
  "반려동물",
  "기타",
] as const;

/** backend/categories.py LEGACY_CATEGORY_MAP 과 동기화 */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  "음식·맛집": "음식·카페",
  "음료·카페": "음식·카페",
  "학교·진로": "진로·커리어",
  "학업·진로": "진로·커리어",
  "직장·커리어": "진로·커리어",
  "연애·관계": "연애·인간관계",
  "취미·엔터테인먼트": "취미·여가",
  "취미·여가": "취미·여가",
  "게임·디지털": "취미·여가",
  "영화·책·콘텐츠": "취미·여가",
  "가족·친구": "연애·인간관계",
  "생활·건강": "주거·생활",
  "집·인테리어": "주거·생활",
  "생활·자취": "주거·생활",
  "금융·소비": "쇼핑·소비",
  "운동·스포츠": "취미·여가",
  취미여가: "취미·여가",
};

const ALLOWED_SET = new Set<string>([
  ...CHOICE_CATEGORY_ORDER,
  "공지사항",
  "건의게시판",
]);

export function normalizeCategory(category: string | null | undefined): string {
  const t = (category || "").trim();
  if (!t) return "기타";
  if (ALLOWED_SET.has(t)) return t;
  return LEGACY_CATEGORY_MAP[t] ?? "기타";
}

/** UI 표기명 (DB 카테고리 값과 다를 수 있음) */
export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  건의게시판: "피드백",
};

export function categoryDisplayName(category: string): string {
  const norm = normalizeCategory(category);
  return CATEGORY_DISPLAY_NAMES[norm] ?? norm;
}

/** select 등 텍스트 전용 표기 (아이콘은 CategoryLabel 사용) */
export function categoryDisplayLabel(category: string): string {
  return categoryDisplayName(category);
}
