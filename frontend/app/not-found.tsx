import Link from "next/link";
import { CARD, PAGE_STACK, SECTION_TITLE } from "@/lib/ui-classes";
import { SITE_NAME } from "@/lib/site";

export default function NotFound() {
  return (
    <div className={PAGE_STACK}>
      <article className={`${CARD} mx-auto max-w-lg text-center`}>
        <p className="text-5xl font-semibold tabular-nums text-sky-600 dark:text-sky-400">
          404
        </p>
        <h1 className={`${SECTION_TITLE} mt-3 text-lg`}>페이지를 찾을 수 없어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-[#9bb3c7]">
          주소가 바뀌었거나 삭제된 페이지일 수 있어요.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400"
          >
            홈으로
          </Link>
          <Link
            href="/board"
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#1B2733] dark:text-sky-100 dark:hover:bg-sky-950/35"
          >
            게시판
          </Link>
        </div>
      </article>
    </div>
  );
}
