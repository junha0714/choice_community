"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
    <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm shadow-zinc-900/4 backdrop-blur-sm">
      <div className="border-b border-indigo-100/80 pb-3">
        <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-zinc-400">{subtitle}</p>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function CommunityShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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

  const categoryNav = (
    <nav className="flex flex-col gap-0.5 text-sm">
      <Link
        href="/"
        className="rounded-lg px-2.5 py-2 text-zinc-700 transition-colors hover:bg-violet-50/90 hover:text-violet-900"
      >
        전체
      </Link>
      {categories.map((row) => (
        <Link
          key={row.category}
          href={`/?category=${encodeURIComponent(row.category)}`}
          className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-zinc-700 transition-colors hover:bg-violet-50/90 hover:text-violet-900"
        >
          <span className="truncate">{row.category}</span>
          <span className="shrink-0 rounded-md bg-zinc-100/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-500">
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
            <SideCard title="인기 글" subtitle="투표 수 기준">
              <ol className="space-y-3 text-sm">
                {popular.length === 0 ? (
                  <li className="text-sm text-zinc-400">아직 없어요</li>
                ) : (
                  popular.map((post, i) => (
                    <li key={post.id}>
                      <Link
                        href={`/posts/${post.id}`}
                        className="group line-clamp-2 text-zinc-700 transition-colors hover:text-indigo-600"
                      >
                        <span className="mr-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-semibold text-zinc-500 group-hover:bg-indigo-100 group-hover:text-indigo-700">
                          {i + 1}
                        </span>
                        {post.title}
                      </Link>
                      <div className="mt-1 pl-7 text-[11px] text-zinc-400">
                        {post.category} · {post.vote_count}표
                      </div>
                    </li>
                  ))
                )}
              </ol>
            </SideCard>

            <SideCard title="조회 인기" subtitle="조회수 기준">
              <ol className="space-y-3 text-sm">
                {popularViews.length === 0 ? (
                  <li className="text-sm text-zinc-400">아직 없어요</li>
                ) : (
                  popularViews.map((post, i) => (
                    <li key={`v-${post.id}`}>
                      <Link
                        href={`/posts/${post.id}`}
                        className="group line-clamp-2 text-zinc-700 transition-colors hover:text-indigo-600"
                      >
                        <span className="mr-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-semibold text-zinc-500 group-hover:bg-indigo-100 group-hover:text-indigo-700">
                          {i + 1}
                        </span>
                        {post.title}
                      </Link>
                      <div className="mt-1 pl-7 text-[11px] text-zinc-400">
                        {post.category} · 조회 {post.view_count}
                      </div>
                    </li>
                  ))
                )}
              </ol>
            </SideCard>

            <SideCard title="최근 댓글">
              <ul className="space-y-4 text-sm">
                {recent.length === 0 ? (
                  <li className="text-sm text-zinc-400">아직 없어요</li>
                ) : (
                  recent.map((c) => (
                    <li key={c.id} className="border-b border-zinc-100/90 pb-4 last:border-0 last:pb-0">
                      <Link
                        href={`/posts/${c.post_id}`}
                        className="line-clamp-2 text-zinc-700 transition-colors hover:text-indigo-600"
                      >
                        {c.content}
                      </Link>
                      <div className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
                        {c.post_title}
                        {c.author_nickname ? ` · ${c.author_nickname}` : ""}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </SideCard>
          </div>
        </aside>
      </div>

      <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-4 shadow-sm shadow-zinc-900/3 backdrop-blur-sm lg:hidden">
        <h2 className="text-sm font-semibold text-zinc-800">카테고리</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-full border border-transparent bg-zinc-100/90 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-violet-100/80 hover:text-violet-900"
          >
            전체
          </Link>
          {categories.map((row) => (
            <Link
              key={row.category}
              href={`/?category=${encodeURIComponent(row.category)}`}
              className="rounded-full border border-zinc-200/80 bg-white px-3 py-1.5 text-xs text-zinc-600 transition hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-900"
            >
              {row.category}
              <span className="ml-1 tabular-nums text-zinc-400">
                {row.count}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
