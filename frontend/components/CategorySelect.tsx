"use client";

import { useId } from "react";
import { categoryDisplayLabel } from "@/lib/categories";

type Props = {
  categories: string[];
  boardCategories?: string[];
  choiceCategories?: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** false면 바깥 레이블 없이 select만 (CategoryPicker 안에서 사용) */
  showFieldLabel?: boolean;
};

export function CategorySelect({
  categories,
  boardCategories = [],
  choiceCategories,
  value,
  onChange,
  disabled,
  showFieldLabel = true,
}: Props) {
  const id = useId();
  const selectId = `${id}-category`;

  const boardSet = new Set(boardCategories);
  const choiceList =
    choiceCategories ??
    categories.filter((c) => !boardSet.has(c));
  const boardList =
    boardCategories.length > 0
      ? boardCategories.filter((c) => categories.includes(c))
      : [];

  const renderOptions = () => {
    if (boardList.length > 0 && choiceList.length > 0) {
      return (
        <>
          <optgroup label="게시판">
            {boardList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </optgroup>
          <optgroup label="고민 분류">
            {choiceList.map((c) => (
              <option key={c} value={c}>
                {categoryDisplayLabel(c)}
              </option>
            ))}
          </optgroup>
        </>
      );
    }
    return categories.map((c) => (
      <option key={c} value={c}>
        {boardSet.has(c) ? c : categoryDisplayLabel(c)}
      </option>
    ));
  };

  const selectEl = (
    <select
      id={selectId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || categories.length === 0}
      className={[
        "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30 dark:disabled:bg-zinc-900/40",
        showFieldLabel ? "mt-1" : "",
      ].join(" ")}
    >
      {categories.length === 0 ? (
        <option value="">불러오는 중…</option>
      ) : (
        renderOptions()
      )}
    </select>
  );

  if (!showFieldLabel) {
    return <div>{selectEl}</div>;
  }

  return (
    <label
      htmlFor={selectId}
      className="block text-sm font-medium text-zinc-700 dark:text-white"
    >
      카테고리
      {selectEl}
    </label>
  );
}
