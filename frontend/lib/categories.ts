/** 고민·게시판 카테고리 표시 (DB 값은 이모지 없음) */

export const CHOICE_CATEGORY_ORDER = [
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
] as const;

/** UI 표기명 (DB 카테고리 값과 다를 수 있음) */
export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  건의게시판: "피드백",
};

export function categoryDisplayName(category: string): string {
  const c = (category || "").trim();
  return CATEGORY_DISPLAY_NAMES[c] ?? c;
}

/** select 등 텍스트 전용 표기 (아이콘은 CategoryLabel 사용) */
export function categoryDisplayLabel(category: string): string {
  return categoryDisplayName(category);
}
