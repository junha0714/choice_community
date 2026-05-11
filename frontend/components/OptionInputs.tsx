"use client";

export type OptionInputsAiSuggest = {
  onClick: () => void;
  loading: boolean;
  notice?: string;
};

type Props = {
  options: string[];
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  aiSuggest?: OptionInputsAiSuggest;
};

function allOptionsEmpty(options: string[]): boolean {
  return options.every((o) => !o.trim());
}

export function OptionInputs({
  options,
  onChange,
  onAdd,
  onRemove,
  aiSuggest,
}: Props) {
  const showAi = Boolean(aiSuggest && allOptionsEmpty(options));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-700 dark:text-white">
          선택지
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {showAi && aiSuggest ? (
            <button
              type="button"
              onClick={aiSuggest.onClick}
              disabled={aiSuggest.loading}
              aria-label="제목·고민 내용으로 선택지 채우기"
              title="제목·고민 내용으로 선택지 채우기"
              className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-violet-200 bg-violet-50 px-2 text-xs font-semibold text-violet-900 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/70"
            >
              <span aria-hidden className="text-[13px] leading-none">
                ✨
              </span>
              <span>AI</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAdd}
            disabled={options.length >= 6}
            aria-label="선택지 추가"
            title="선택지 추가"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-xl font-light leading-none text-zinc-600 transition hover:border-sky-400 hover:bg-sky-50/80 hover:text-sky-800 disabled:cursor-not-allowed disabled:opacity-35 dark:border-[#223141] dark:bg-[#1B2733] dark:text-[#AFC6D8] dark:hover:border-sky-600/60 dark:hover:bg-sky-950/40"
          >
            +
          </button>
        </div>
      </div>
      {options.map((value, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={value}
            onChange={(e) => onChange(i, e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
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
      {aiSuggest?.notice ? (
        <p className="text-xs text-amber-800 dark:text-amber-200/90">{aiSuggest.notice}</p>
      ) : null}
    </div>
  );
}
