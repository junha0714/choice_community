"use client";

type Props = {
  options: string[];
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

export function OptionInputs({ options, onChange, onAdd, onRemove }: Props) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-zinc-700 dark:text-white">선택지</div>
      <p className="text-xs text-zinc-600 dark:text-[#AFC6D8]/80">
        최소 2개 · 최대 6개 · 투표에 올라갈 항목이에요.
      </p>
      {options.map((value, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={value}
            onChange={(e) => onChange(i, e.target.value)}
            placeholder={`선택지 ${i + 1}`}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
          />
          {options.length > 2 && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#1B2733] dark:text-[#AFC6D8] dark:hover:bg-sky-950/35"
            >
              삭제
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        disabled={options.length >= 6}
        className="text-sm font-semibold text-sky-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-300"
      >
        + 선택지 추가
      </button>
    </div>
  );
}
