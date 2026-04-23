"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-sky-300/60 bg-white p-5 shadow-[0_10px_30px_-22px_rgba(2,132,199,0.18)] dark:border-sky-800/55 dark:bg-[#1B2733]/82 dark:shadow-sky-950/20">
      <div className="border-b border-sky-100/90 pb-3 dark:border-[#223141]">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-white">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-[#AFC6D8]">{subtitle}</p>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function CommunityShell({ children }: { children: React.ReactNode }) {
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
    <SideCard title="인기글" subtitle="투표수 기준">
      <ol className="space-y-3 text-sm">
        {popular.length === 0 ? (
          <li className="text-sm text-zinc-400 dark:text-[#AFC6D8]">아직 없어요</li>
        ) : (
          popular.map((post, i) => (
            <li key={post.id}>
              <Link
                href={`/posts/${post.id}`}
                className="group line-clamp-2 cursor-pointer text-zinc-700 transition-colors hover:text-sky-700 dark:text-[#AFC6D8] dark:hover:text-white"
              >
                <span className="mr-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-semibold text-zinc-500 group-hover:bg-sky-100 group-hover:text-sky-800 dark:bg-zinc-800 dark:text-sky-400 dark:group-hover:bg-sky-950 dark:group-hover:text-sky-200">
                  {i + 1}
                </span>
                {post.title}
              </Link>
              <div className="mt-1 pl-7 text-[11px] text-zinc-400 dark:text-[#AFC6D8]">
                {post.category} · {post.vote_count}표
              </div>
            </li>
          ))
        )}
      </ol>
    </SideCard>
  );

  const popularViewsCard = (
    <SideCard title="인기글" subtitle="조회수 기준">
      <ol className="space-y-3 text-sm">
        {popularViews.length === 0 ? (
          <li className="text-sm text-zinc-400 dark:text-[#AFC6D8]">아직 없어요</li>
        ) : (
          popularViews.map((post, i) => (
            <li key={`v-${post.id}`}>
              <Link
                href={`/posts/${post.id}`}
                className="group line-clamp-2 cursor-pointer text-zinc-700 transition-colors hover:text-sky-700 dark:text-[#AFC6D8] dark:hover:text-white"
              >
                <span className="mr-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-semibold text-zinc-500 group-hover:bg-sky-100 group-hover:text-sky-800 dark:bg-zinc-800 dark:text-sky-400 dark:group-hover:bg-sky-950 dark:group-hover:text-sky-200">
                  {i + 1}
                </span>
                {post.title}
              </Link>
              <div className="mt-1 pl-7 text-[11px] text-zinc-400 dark:text-[#AFC6D8]">
                {post.category} · 조회 {post.view_count}
              </div>
            </li>
          ))
        )}
      </ol>
    </SideCard>
  );

  const recentCommentsCard = (
    <SideCard title="최근 댓글">
      <ul className="space-y-4 text-sm">
        {recent.length === 0 ? (
          <li className="text-sm text-zinc-400 dark:text-[#AFC6D8]">아직 없어요</li>
        ) : (
          recent.map((c) => (
            <li
              key={c.id}
              className="border-b border-zinc-100/90 pb-4 last:border-0 last:pb-0 dark:border-[#223141]"
            >
              <Link
                href={`/posts/${c.post_id}`}
                className="line-clamp-2 cursor-pointer text-zinc-700 transition-colors hover:text-sky-700 dark:text-[#AFC6D8] dark:hover:text-white"
              >
                {c.content}
              </Link>
              <div className="mt-1.5 text-[11px] leading-relaxed text-zinc-400 dark:text-[#AFC6D8]">
                {c.post_title}
                {c.author_nickname ? ` · ${c.author_nickname}` : ""}
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
    <div className="flex w-full flex-col gap-8 lg:gap-10">
      <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(220px,280px)] lg:items-start lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <SideCard title="카테고리">{categoryNav}</SideCard>
          </div>
        </aside>

        <div className="min-w-0">{children}</div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-5">
            {popularVoteCard}
            {popularViewsCard}
            {recentCommentsCard}
          </div>
        </aside>
      </div>

      <div className="rounded-2xl border border-sky-200/70 bg-white/82 p-4 shadow-sm shadow-sky-900/5 backdrop-blur-sm dark:border-sky-800/55 dark:bg-zinc-950/65 lg:hidden">
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

      <div className="grid grid-cols-1 gap-4 lg:hidden sm:grid-cols-2">
        {popularVoteCard}
        {popularViewsCard}
        <div className="sm:col-span-2">{recentCommentsCard}</div>
      </div>
    </div>
  );
}
