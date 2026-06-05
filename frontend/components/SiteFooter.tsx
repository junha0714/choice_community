import Link from "next/link";
import { homeFeedHref } from "@/lib/home-feed";
import { SHELL_WIDTH_CLASS, SITE_NAME } from "@/lib/site";

const FOOTER_TAGLINE = "AI와 사람들의 의견으로 더 나은 선택";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-sky-200/60 bg-white/70 backdrop-blur-sm dark:border-sky-900/50 dark:bg-zinc-950/70">
      <div className={`py-8 sm:py-10 ${SHELL_WIDTH_CLASS}`}>
        <div className="flex flex-col gap-5 sm:gap-6">
          <div>
            <p className="text-base font-semibold tracking-tight text-zinc-900 dark:text-white">
              {SITE_NAME}
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-[#9bb3c7]">
              {FOOTER_TAGLINE}
            </p>
          </div>

          <nav
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-sky-200/80"
            aria-label="푸터 링크"
          >
            <Link
              href="/terms"
              className="transition hover:text-sky-700 dark:hover:text-sky-100"
            >
              이용약관
            </Link>
            <span className="text-zinc-300 dark:text-sky-800/80" aria-hidden>
              |
            </span>
            <Link
              href="/privacy"
              className="transition hover:text-sky-700 dark:hover:text-sky-100"
            >
              개인정보처리방침
            </Link>
            <span className="text-zinc-300 dark:text-sky-800/80" aria-hidden>
              |
            </span>
            <Link
              href={homeFeedHref("feedback")}
              className="transition hover:text-sky-700 dark:hover:text-sky-100"
            >
              피드백
            </Link>
          </nav>

          <p className="text-xs text-zinc-500 dark:text-sky-200/60">
            © {year} {SITE_NAME}
          </p>
        </div>
      </div>
    </footer>
  );
}
