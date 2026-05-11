"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";

type CategoryStat = { category: string; count: number };
type PopularPost = {
  id: number;
  title: string;
  category: string;
  vote_count: number;
};
type PopularByViews = {
  id: number;
  title: string;
  category: string;
  view_count: number;
};
type RecentComment = {
  id: number;
  content: string;
  post_id: number;
  post_title: string;
  author_nickname: string | null;
  created_at: string;
};

const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

function SideCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-sky-300/60 bg-white/92 p-3.5 shadow-[0_10px_36px_-26px_rgba(2,132,199,0.2)] backdrop-blur-sm dark:border-sky-800/55 dark:bg-[#1B2733]/82 dark:shadow-sky-950/25 sm:p-4 md:p-4 lg:p-4 xl:p-5">
      <div className="flex items-start justify-between gap-2 border-b border-sky-100/90 pb-2.5 dark:border-[#223141]">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-white">
            {title}
          </h2>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-[#AFC6D8]">{subtitle}</p>
        ) : null}
        </div>
        {icon ? (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-600/10 text-sky-700 ring-1 ring-sky-200/80 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-800/60">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function CommunityShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hideShell = AUTH_PATHS.some((p) => pathname === p);

  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [popular, setPopular] = useState<PopularPost[]>([]);
  const [popularViews, setPopularViews] = useState<PopularByViews[]>([]);
  const [recent, setRecent] = useState<RecentComment[]>([]);

  useEffect(() => {
    if (hideShell) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [c, p, pv, r] = await Promise.all([
          fetch(`${API_BASE_URL}/stats/categories`),
          fetch(`${API_BASE_URL}/stats/popular-posts?limit=5`),
          fetch(`${API_BASE_URL}/stats/popular-posts-by-views?limit=5`),
          fetch(`${API_BASE_URL}/stats/recent-comments?limit=5`),
        ]);
        if (cancelled) return;
        if (c.ok) setCategories(await c.json());
        if (p.ok) setPopular(await p.json());
        if (pv.ok) setPopularViews(await pv.json());
        if (r.ok) setRecent(await r.json());
      } catch {
        /* ignore */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [hideShell, pathname]);

  if (hideShell) {
    return <>{children}</>;
  }

  const activeCategory = searchParams.get("category");

  const popularVoteCard = (
    <SideCard
      title="실시간 인기 고민"
      subtitle="지금 많이 참여하는 글"
      icon={
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
          <path
            d="M13 3S6 10 6 14a6 6 0 0 0 12 0c0-4-5-11-5-11Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M10 15.2c.4 1.4 1.4 2.3 2.8 2.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      }
    >
      <ol className="space-y-2.5 text-sm">
        {popular.length === 0 ? (
          <li className="text-sm text-zinc-400 dark:text-[#AFC6D8]">아직 없어요</li>
        ) : (
          popular.map((post, i) => (
            <li key={post.id}>
              <Link
                href={`/posts/${post.id}`}
                className={[
                  "group relative block rounded-xl border border-transparent px-2.5 py-2 transition",
                  "hover:border-sky-200/85 hover:bg-sky-50/70",
                  "dark:hover:border-sky-800/70 dark:hover:bg-sky-950/35",
                ].join(" ")}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={[
                      "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tabular-nums ring-1 ring-inset",
                      i === 0
                        ? "bg-amber-100 text-amber-950 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/20"
                        : i === 1
                          ? "bg-slate-100 text-slate-900 ring-slate-200/80 dark:bg-slate-400/10 dark:text-slate-100 dark:ring-slate-400/20"
                          : i === 2
                            ? "bg-orange-100 text-orange-950 ring-orange-200/80 dark:bg-orange-500/15 dark:text-orange-100 dark:ring-orange-400/20"
                            : "bg-zinc-100 text-zinc-600 ring-zinc-200/80 dark:bg-zinc-800/70 dark:text-sky-200/80 dark:ring-sky-800/60",
                    ].join(" ")}
                    aria-label={`${i + 1}위`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="line-clamp-2 font-semibold text-zinc-800 transition-colors group-hover:text-sky-800 dark:text-sky-100 dark:group-hover:text-white">
                      {post.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400 dark:text-[#AFC6D8]">
                      <span className="truncate">{post.category}</span>
                      <span aria-hidden className="text-zinc-300 dark:text-sky-800/80">
                        ·
                      </span>
                      <span className="tabular-nums">{post.vote_count}표</span>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))
        )}
      </ol>
    </SideCard>
  );

  const popularViewsCard = (
    <SideCard
      title="지금 많이 보는 글"
      subtitle="조회수 기준"
      icon={
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
          <path
            d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      }
    >
      <ol className="space-y-2.5 text-sm">
        {popularViews.length === 0 ? (
          <li className="text-sm text-zinc-400 dark:text-[#AFC6D8]">아직 없어요</li>
        ) : (
          popularViews.map((post, i) => (
            <li key={`v-${post.id}`}>
              <Link
                href={`/posts/${post.id}`}
                className="group block rounded-xl border border-transparent px-2.5 py-2 transition hover:border-sky-200/85 hover:bg-sky-50/70 dark:hover:border-sky-800/70 dark:hover:bg-sky-950/35"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[11px] font-bold text-zinc-600 ring-1 ring-inset ring-zinc-200/80 dark:bg-zinc-800/70 dark:text-sky-200/80 dark:ring-sky-800/60">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="line-clamp-2 font-semibold text-zinc-800 transition-colors group-hover:text-sky-800 dark:text-sky-100 dark:group-hover:text-white">
                      {post.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400 dark:text-[#AFC6D8]">
                      <span className="truncate">{post.category}</span>
                      <span aria-hidden className="text-zinc-300 dark:text-sky-800/80">
                        ·
                      </span>
                      <span className="tabular-nums">조회 {post.view_count}</span>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))
        )}
      </ol>
    </SideCard>
  );

  const recentCommentsCard = (
    <SideCard
      title="최근 댓글"
      subtitle="방금 달린 이야기"
      icon={
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
          <path
            d="M6 18l-2 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M8 8.5h8M8 12h6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      }
    >
      <ul className="space-y-3 text-sm">
        {recent.length === 0 ? (
          <li className="text-sm text-zinc-400 dark:text-[#AFC6D8]">아직 없어요</li>
        ) : (
          recent.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-transparent px-2.5 py-2 transition hover:border-sky-200/85 hover:bg-sky-50/70 dark:hover:border-sky-800/70 dark:hover:bg-sky-950/35"
            >
              <Link
                href={`/posts/${c.post_id}`}
                className="line-clamp-2 cursor-pointer font-medium text-zinc-800 transition-colors hover:text-sky-800 dark:text-sky-100 dark:hover:text-white"
              >
                {c.content}
              </Link>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-relaxed text-zinc-400 dark:text-[#AFC6D8]">
                <span className="line-clamp-1 max-w-[18rem] text-zinc-500 dark:text-[#9bb3c7]">
                  {c.post_title}
                </span>
                {c.author_nickname ? (
                  <>
                    <span aria-hidden className="text-zinc-300 dark:text-sky-800/80">
                      ·
                    </span>
                    <span>{c.author_nickname}</span>
                  </>
                ) : null}
              </div>
            </li>
          ))
        )}
      </ul>
    </SideCard>
  );

  const categoryLinkClass = (cat: string | null) => {
    const isActive = (cat ?? null) === (activeCategory ?? null);
    return [
      "group flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors",
      isActive
        ? "bg-sky-200/80 text-sky-950 shadow-sm shadow-sky-900/5 dark:bg-sky-500/18 dark:text-white"
        : "text-zinc-800 hover:bg-sky-100 hover:text-sky-950 dark:text-[#AFC6D8] dark:hover:bg-sky-950/45 dark:hover:text-white",
    ].join(" ");
  };

  const categoryNav = (
    <nav className="flex flex-col gap-1 text-sm">
      <Link
        href="/"
        className={categoryLinkClass(null)}
      >
        <span className="truncate">전체</span>
      </Link>
      {categories.map((row) => (
        <Link
          key={row.category}
          href={`/?category=${encodeURIComponent(row.category)}`}
          className={categoryLinkClass(row.category)}
        >
          <span className="truncate font-medium dark:font-semibold">{row.category}</span>
          <span className="shrink-0 rounded-md bg-zinc-100/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-500 transition-colors group-hover:bg-sky-100 group-hover:text-sky-900 dark:bg-[#16202A] dark:text-[#AFC6D8] dark:group-hover:bg-sky-950/60 dark:group-hover:text-white">
            {row.count}
          </span>
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex w-full flex-col gap-6 sm:gap-7 md:gap-8 lg:gap-10 xl:gap-11 2xl:gap-12">
      <div className="grid w-full grid-cols-1 gap-5 sm:gap-6 md:gap-7 lg:grid-cols-[minmax(220px,240px)_minmax(0,1fr)_minmax(200px,240px)] lg:items-start lg:gap-8 xl:grid-cols-[minmax(230px,250px)_minmax(0,1fr)_minmax(210px,230px)] xl:gap-9 2xl:grid-cols-[minmax(235px,260px)_minmax(0,1fr)_minmax(220px,240px)] 2xl:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-20 lg:top-24 xl:top-24 2xl:top-28">
            <SideCard title="카테고리">{categoryNav}</SideCard>
          </div>
        </aside>

        <div className="min-w-0">{children}</div>

        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-4 lg:top-24 lg:space-y-5 xl:space-y-6 2xl:top-28 2xl:space-y-6">
            {popularVoteCard}
            {popularViewsCard}
            {recentCommentsCard}
          </div>
        </aside>
      </div>

      <div className="rounded-2xl border border-sky-200/70 bg-white/82 p-4 shadow-sm shadow-sky-900/5 backdrop-blur-sm dark:border-sky-800/55 dark:bg-zinc-950/65 sm:p-5 md:p-5 lg:hidden">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-sky-100">카테고리</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-full border border-transparent bg-zinc-100/90 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-sky-100/90 hover:text-sky-950 dark:bg-zinc-800/90 dark:text-sky-200 dark:hover:bg-sky-950/55 dark:hover:text-sky-50"
          >
            전체
          </Link>
          {categories.map((row) => (
            <Link
              key={row.category}
              href={`/?category=${encodeURIComponent(row.category)}`}
              className="rounded-full border border-sky-200/80 bg-white px-3 py-1.5 text-xs text-zinc-600 transition hover:border-sky-400 hover:bg-sky-50/90 hover:text-sky-950 dark:border-sky-800/70 dark:bg-zinc-900/80 dark:text-sky-300 dark:hover:border-sky-600 dark:hover:bg-sky-950/55 dark:hover:text-sky-50"
            >
              {row.category}
              <span className="ml-1 tabular-nums text-zinc-400">
                {row.count}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 md:gap-4 lg:hidden">
        {popularVoteCard}
        {popularViewsCard}
        <div className="sm:col-span-2 md:col-span-3">{recentCommentsCard}</div>
      </div>
    </div>
  );
}
