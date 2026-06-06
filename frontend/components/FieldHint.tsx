type FieldHintProps = {
  message?: string | null;
  id?: string;
  className?: string;
};

export function FieldHint({ message, id, className = "" }: FieldHintProps) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className={`mt-1 text-xs font-medium text-red-600 dark:text-red-300 ${className}`.trim()}
    >
      {message}
    </p>
  );
}

export function fieldInputClass(invalid?: boolean, extra = ""): string {
  const base =
    "rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 outline-none dark:bg-zinc-950/40 dark:text-white";
  const valid =
    "border-zinc-300 focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:focus:border-sky-400 dark:focus:ring-sky-500/30";
  const invalidCls =
    "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:border-red-500/70 dark:focus:border-red-400 dark:focus:ring-red-500/30";
  return [base, invalid ? invalidCls : valid, extra].filter(Boolean).join(" ");
}
