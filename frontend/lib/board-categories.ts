/** 백엔드 categories.py 와 동일한 게시판·공지 카테고리 */

export const NOTICE_CATEGORY = "공지사항";
export const SUGGESTION_CATEGORY = "건의게시판";

export const BOARD_CATEGORIES = [NOTICE_CATEGORY, SUGGESTION_CATEGORY] as const;

export function isNoticeCategory(category: string | null | undefined): boolean {
  return (category || "").trim() === NOTICE_CATEGORY;
}

export function isSuggestionCategory(category: string | null | undefined): boolean {
  return (category || "").trim() === SUGGESTION_CATEGORY;
}

export function isBoardCategory(category: string | null | undefined): boolean {
  const c = (category || "").trim();
  return BOARD_CATEGORIES.includes(c as (typeof BOARD_CATEGORIES)[number]);
}

/** 공지·건의 — 선택지·투표 없음 */
export function isBoardNoVoteCategory(category: string | null | undefined): boolean {
  return isBoardCategory(category);
}
