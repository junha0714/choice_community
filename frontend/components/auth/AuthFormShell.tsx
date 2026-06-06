import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_NAME } from "@/lib/site";

type AuthFormShellProps = {
  title: string;
  lead?: string;
  children: ReactNode;
  banner?: ReactNode;
  footer?: ReactNode;
};

export function AuthFormShell({
  title,
  lead,
  children,
  banner,
  footer,
}: AuthFormShellProps) {
  return (
    <main className="mx-auto w-full max-w-[26rem] px-1 py-2 sm:py-4">
      <div className="mb-5 text-center">
        <Link
          href="/"
          className="inline-block text-xl font-semibold tracking-tight"
        >
          <span className="bg-linear-to-r from-sky-600 via-sky-500 to-cyan-500 bg-clip-text text-transparent">
            {SITE_NAME}
          </span>
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-sky-200/70 bg-white shadow-sm shadow-sky-900/5 dark:border-sky-900/40 dark:bg-[#16202A] dark:shadow-sky-950/20">
        <div className="border-b border-sky-100/90 bg-linear-to-r from-sky-50/80 via-white to-cyan-50/50 px-5 py-4 dark:border-[#223141] dark:from-sky-950/30 dark:via-[#16202A] dark:to-cyan-950/20 sm:px-6">
          <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
            {title}
          </h1>
          {lead ? (
            <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-[#AFC6D8]/90">
              {lead}
            </p>
          ) : null}
        </div>

        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {banner ? <div className="mb-4">{banner}</div> : null}
          {children}
          {footer ? (
            <div className="mt-5 border-t border-zinc-100 pt-5 dark:border-[#223141]">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
