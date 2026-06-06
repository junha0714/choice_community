"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { BOARD_PATH, homeFeedHref } from "@/lib/home-feed";

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (pathname === BOARD_PATH) {
      setDraft(searchParams.get("q")?.trim() ?? "");
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    router.push(homeFeedHref("choice", { q: q || undefined, page: 1 }));
    setMobileOpen(false);
  };

  const inputClass =
    "h-9 w-full min-w-0 rounded-lg border border-sky-200/80 bg-white/90 pl-9 pr-3 text-sm text-zinc-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300/50 dark:border-sky-800/60 dark:bg-zinc-950/50 dark:text-white dark:focus:border-sky-500 dark:focus:ring-sky-500/30";

  const searchForm = (className: string, inputId: string) => (
    <form onSubmit={submit} className={className} role="search">
      <label htmlFor={inputId} className="sr-only">
        검색
      </label>
      <div className="relative min-w-0 flex-1">
        <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
        <input
          id={inputId}
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder=""
          autoComplete="off"
          className={inputClass}
        />
      </div>
    </form>
  );

  return (
    <>
      <div className="hidden min-w-0 sm:block sm:w-56 md:w-72 lg:w-80 xl:w-96">
        {searchForm("flex w-full", "header-search-desktop")}
      </div>

      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        className="order-first flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-200/80 bg-white/90 text-zinc-500 transition hover:bg-sky-50 hover:text-sky-800 dark:border-sky-800/60 dark:bg-zinc-950/50 dark:text-zinc-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-200 sm:hidden"
        aria-label={mobileOpen ? "검색 닫기" : "검색 열기"}
        aria-expanded={mobileOpen}
      >
        <IconSearch className="h-[18px] w-[18px]" />
      </button>

      {mobileOpen ? (
        <div className="absolute inset-x-0 top-full border-b border-sky-200/60 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur-md dark:border-sky-900/50 dark:bg-zinc-950/95 sm:hidden">
          {searchForm("flex w-full", "header-search-mobile")}
        </div>
      ) : null}
    </>
  );
}
