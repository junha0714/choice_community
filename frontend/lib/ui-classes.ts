/** PickTalk 공통 UI 클래스 (globals.css cc-* 토큰과 함께 사용) */

export const PAGE_STACK = "w-full space-y-5 sm:space-y-6";

export const CARD = "cc-card p-4 sm:p-5";

export const CARD_STRONG = "cc-card-strong px-3 py-2.5 sm:px-4 sm:py-3";

export const LIST_PANEL =
  "divide-y divide-sky-100/90 overflow-hidden rounded-xl border border-sky-200/70 bg-white/95 dark:divide-sky-900/50 dark:border-sky-800/45 dark:bg-[#16202A]/75";

export const LIST_ROW_HOVER =
  "block px-3 py-3 transition hover:bg-sky-50/80 sm:py-2.5 dark:hover:bg-sky-950/30";

export const SECTION_TITLE =
  "text-sm font-semibold tracking-tight text-zinc-800 dark:text-sky-100";

export const SECTION_SUBTITLE =
  "mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-[#9bb3c7]";

export const SECTION_HEADING_BAR =
  "min-w-0 border-l-2 border-sky-500/80 pl-3 dark:border-sky-400/70";

export const TEXT_MUTED = "text-[11px] leading-relaxed text-zinc-500 dark:text-[#9bb3c7]";

export const TEXT_STATS =
  "text-[11px] tabular-nums text-zinc-400 dark:text-[#8fa3b8]";

export const LINK_MORE =
  "inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-sky-200/80 bg-sky-50/80 px-2.5 py-1.5 text-xs font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:border-sky-600 dark:hover:bg-sky-900/50";

/** 헤더·툴바 공통 (높이·패딩 통일) */
export const BTN_NAV =
  "inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors";

export const BTN_PRIMARY =
  "inline-flex min-h-[2.5rem] items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400";

export const BTN_SECONDARY =
  "inline-flex min-h-[2.5rem] items-center justify-center rounded-lg border border-indigo-200/80 bg-indigo-50/60 px-4 py-2 text-sm font-semibold text-indigo-900 transition hover:border-indigo-300 hover:bg-indigo-100/80 dark:border-indigo-800/55 dark:bg-indigo-950/30 dark:text-indigo-100 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/50";

export const BTN_SM =
  "inline-flex min-h-[2rem] items-center justify-center rounded-lg px-3.5 py-1.5 text-xs font-semibold shadow-sm transition";

export const SORT_CHIP =
  "inline-flex min-h-[2rem] items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-medium transition";

export const SORT_CHIP_ACTIVE =
  "bg-sky-600 text-white shadow-sm shadow-sky-900/20 dark:bg-sky-500 dark:shadow-sky-950/40";

export const SORT_CHIP_IDLE =
  "border border-sky-200/75 bg-sky-50/85 text-sky-950 hover:border-sky-300 hover:bg-sky-100/85 dark:border-sky-700/70 dark:bg-sky-950/45 dark:text-sky-100 dark:hover:border-sky-600 dark:hover:bg-sky-900/55";

export const FILTER_CHIP =
  "inline-flex items-center gap-1.5 rounded-lg border border-sky-200/75 bg-sky-50/90 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:border-sky-800/60 dark:bg-sky-950/35 dark:text-sky-100";

export const TAG_CHIP =
  "inline-flex shrink-0 items-center rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/55 dark:text-sky-300";

export const TAG_FILTER_CHIP =
  "inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium transition";

export const TAG_FILTER_CHIP_ACTIVE =
  "bg-sky-600 text-white shadow-sm shadow-sky-900/25 dark:bg-sky-500 dark:shadow-sky-950/40";

export const TAG_FILTER_CHIP_IDLE =
  "border border-sky-200/80 bg-sky-50 text-sky-800 hover:border-sky-300 hover:bg-sky-100 dark:border-sky-700/70 dark:bg-sky-950/45 dark:text-sky-200 dark:hover:border-sky-600 dark:hover:bg-sky-900/55";

export const INPUT_FIELD =
  "cc-input min-w-0 flex-1 rounded-lg px-3.5 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-300/90 dark:placeholder:text-sky-500/80 dark:focus:border-sky-400 dark:focus:ring-sky-500/35";
