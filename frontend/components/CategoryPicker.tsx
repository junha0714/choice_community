"use client";

import { CategoryLabel } from "@/components/CategoryLabel";
import { CategorySelect } from "@/components/CategorySelect";

type CategoryPickerMode = "auto" | "manual";

type CategoryPickerProps = {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
  mode: CategoryPickerMode;
  onModeChange: (mode: CategoryPickerMode) => void;
  autoLoading?: boolean;
  boardCategories?: string[];
  choiceCategories?: string[];
  /** 직접 선택 시 AI 추천 칩 숨김 (게시판 글 등) */
  manualOnly?: boolean;
};

export function CategoryPicker({
  categories,
  value,
  onChange,
  mode,
  onModeChange,
  autoLoading = false,
  boardCategories,
  choiceCategories,
  manualOnly = false,
}: CategoryPickerProps) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2.5 dark:border-[#223141] dark:bg-zinc-900/50">
      <p className="text-sm font-semibold text-zinc-800 dark:text-white">카테고리</p>
      {!manualOnly ? (
        <div
          role="group"
          aria-label="카테고리 선택 방식"
          className="mt-2 flex flex-wrap gap-1.5"
        >
          <button
            type="button"
            aria-pressed={mode === "auto"}
            onClick={() => onModeChange("auto")}
            className={[
              "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
              mode === "auto"
                ? "bg-sky-600 text-white shadow-sm dark:bg-sky-500"
                : "border border-sky-200/80 bg-white text-sky-900 hover:bg-sky-50 dark:border-sky-800 dark:bg-[#16202A] dark:text-sky-100 dark:hover:bg-sky-950/50",
            ].join(" ")}
          >
            AI 추천
          </button>
          <button
            type="button"
            aria-pressed={mode === "manual"}
            onClick={() => onModeChange("manual")}
            className={[
              "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
              mode === "manual"
                ? "bg-sky-600 text-white shadow-sm dark:bg-sky-500"
                : "border border-sky-200/80 bg-white text-sky-900 hover:bg-sky-50 dark:border-sky-800 dark:bg-[#16202A] dark:text-sky-100 dark:hover:bg-sky-950/50",
            ].join(" ")}
          >
            직접 선택
          </button>
        </div>
      ) : null}
      {mode === "auto" && !manualOnly ? (
        <div className="mt-2 text-sm text-zinc-700 dark:text-[#AFC6D8]">
          {autoLoading ? (
            <span className="text-sky-700 dark:text-sky-300">추천 중…</span>
          ) : value ? (
            <CategoryLabel
              category={value}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-200/80 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-900 dark:border-sky-800/60 dark:bg-[#16202A] dark:text-white"
              iconClassName="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300"
            />
          ) : (
            <span className="text-zinc-500 dark:text-[#8fa3b8]">
              제목·본문을 보면 추천해 드려요
            </span>
          )}
        </div>
      ) : null}
      {mode === "manual" || manualOnly ? (
        <div className={manualOnly ? "mt-2" : "mt-2"}>
          <CategorySelect
            categories={categories}
            boardCategories={boardCategories}
            choiceCategories={choiceCategories}
            value={value}
            onChange={onChange}
            showFieldLabel={false}
          />
        </div>
      ) : null}
    </div>
  );
}
