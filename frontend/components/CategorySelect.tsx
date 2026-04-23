"use client";

type Props = {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function CategorySelect({
  categories,
  value,
  onChange,
  disabled,
}: Props) {
  return (
    <label className="block text-sm font-medium text-zinc-700 dark:text-white">
      카테고리
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || categories.length === 0}
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30 dark:disabled:bg-zinc-900/40"
      >
        {categories.length === 0 ? (
          <option value="">불러오는 중…</option>
        ) : (
          categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))
        )}
      </select>
    </label>
  );
}
