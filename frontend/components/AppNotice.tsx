import type { ReactNode } from "react";

export type AppNoticeVariant = "error" | "success" | "info" | "warning";

const VARIANT_CLASS: Record<AppNoticeVariant, string> = {
  error:
    "border-red-200/90 bg-red-50/90 text-red-800 dark:border-red-900/45 dark:bg-red-950/25 dark:text-red-100",
  success:
    "border-emerald-200/80 bg-emerald-50/90 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100",
  info: "border-sky-200/80 bg-sky-50/90 text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100",
  warning:
    "border-amber-200/80 bg-amber-50/90 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100",
};

type AppNoticeProps = {
  variant: AppNoticeVariant;
  children: ReactNode;
  role?: "alert" | "status";
  className?: string;
};

export function AppNotice({
  variant,
  children,
  role,
  className = "",
}: AppNoticeProps) {
  return (
    <p
      role={role ?? (variant === "error" ? "alert" : "status")}
      className={`rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed ${VARIANT_CLASS[variant]} ${className}`}
    >
      {children}
    </p>
  );
}
