"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CARD, PAGE_STACK, SECTION_TITLE } from "@/lib/ui-classes";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body className="min-h-screen bg-zinc-50 px-4 py-16 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <div className={PAGE_STACK}>
          <article className={`${CARD} mx-auto max-w-lg text-center`}>
            <h1 className={`${SECTION_TITLE} text-lg`}>문제가 발생했어요</h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-[#9bb3c7]">
              일시적인 오류일 수 있어요. 잠시 후 다시 시도해 주세요.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => reset()}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500"
              >
                다시 시도
              </button>
              <Link
                href="/"
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#1B2733] dark:text-sky-100"
              >
                홈으로
              </Link>
            </div>
          </article>
        </div>
      </body>
    </html>
  );
}
