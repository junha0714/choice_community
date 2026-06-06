"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { BOARD_CATEGORIES } from "@/lib/board-categories";
import { CHOICE_CATEGORY_ORDER } from "@/lib/categories";
import { CategoryLabel } from "@/components/CategoryLabel";
import {
  BOARD_PATH,
  homeFeedHref,
  resolveHomeFeed,
  type HomeFeed,
} from "@/lib/home-feed";
import { LINK_MORE } from "@/lib/ui-classes";
import { readClientCache, writeClientCache } from "@/lib/client-cache";

const SHELL_CACHE_KEY = "shell-sidebar";
const SHELL_CACHE_TTL_MS = 90_000;

type ShellSidebarPayload = {
  choice_categories: string[];
  category_stats: { category: string; count: number }[];
  trending: TrendingPostsBundle;
};

type CategoryStat = { category: string; count: number };
type TrendingPost = {
  id: number;
  title: string;
  category: string;
};

type TrendingPostsBundle = {
  by_votes: TrendingPost[];
  by_views: TrendingPost[];
  by_likes: TrendingPost[];
};

const TRENDING_SECTIONS: { key: keyof TrendingPostsBundle; label: string }[] = [
  { key: "by_votes", label: "투표순" },
  { key: "by_views", label: "조회순" },
  { key: "by_likes", label: "좋아요순" },
];

function TrendingPostList({ posts }: { posts: TrendingPost[] }) {
  if (posts.length === 0) {
    return (
      <p className="py-2 text-[11px] leading-relaxed text-zinc-400 dark:text-[#AFC6D8]">
        아직 없어요
      </p>
    );
  }
  return (
    <ul className="space-y-0.5 text-sm">
      {posts.map((post, index) => (
        <li key={post.id}>
          <Link
            href={`/posts/${post.id}`}
            title={post.title}
            className="group flex min-w-0 items-start gap-2 rounded-lg px-1.5 py-1.5 transition hover:bg-sky-50/80 dark:hover:bg-sky-950/40"
          >
            <span
              className="mt-0.5 w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums text-sky-600/90 dark:text-sky-400/85"
              aria-hidden
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[13px] font-medium leading-snug text-zinc-800 group-hover:text-sky-800 dark:text-sky-100 dark:group-hover:text-white">
                {post.title}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-zinc-400 dark:text-[#8fa3b8]">
                <CategoryLabel
                  category={post.category}
                  showIcon={false}
                  className="inline-flex min-w-0 max-w-full"
                />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

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
    <div className="cc-card p-4 sm:p-4">
      <div className="flex items-start justify-between gap-2 border-b border-sky-100/90 pb-3 dark:border-[#223141]">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-white">
            {title}
          </h2>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400 dark:text-[#AFC6D8]">
            {subtitle}
          </p>
        ) : null}
        </div>
        {icon ? (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600/10 text-sky-700 ring-1 ring-sky-200/80 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-800/60">
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
  const [trending, setTrending] = useState<TrendingPostsBundle | null>(null);

  useEffect(() => {
    if (hideShell) return;

    const cached = readClientCache<ShellSidebarPayload>(
      SHELL_CACHE_KEY,
      SHELL_CACHE_TTL_MS
    );
    if (cached) {
      const countMap: Record<string, number> = {};
      for (const row of cached.category_stats) {
        countMap[row.category] = row.count;
      }
      const choiceList =
        cached.choice_categories.length > 0
          ? cached.choice_categories
          : [...CHOICE_CATEGORY_ORDER];
      setCategories(
        choiceList.map((category) => ({
          category,
          count: countMap[category] ?? 0,
        }))
      );
      setTrending(cached.trending);
    }

    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/stats/shell`);
        if (cancelled || !res.ok) return;
        const payload = (await res.json()) as ShellSidebarPayload;
        writeClientCache(SHELL_CACHE_KEY, payload);

        const countMap: Record<string, number> = {};
        for (const row of payload.category_stats) {
          countMap[row.category] = row.count;
        }
        const choiceList =
          payload.choice_categories.length > 0
            ? payload.choice_categories
            : [...CHOICE_CATEGORY_ORDER];

        setCategories(
          choiceList.map((category) => ({
            category,
            count: countMap[category] ?? 0,
          }))
        );
        setTrending(payload.trending);
      } catch {
        /* ignore */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [hideShell]);

  if (hideShell) {
    return <>{children}</>;
  }

  const onBoard = pathname === BOARD_PATH;
  const activeCategory = onBoard ? searchParams.get("category") : null;
  const feed = onBoard
    ? resolveHomeFeed(searchParams.get("feed"), activeCategory)
    : ("choice" as HomeFeed);

  const trendingPopularCard = (
    <SideCard
      title="실시간 인기 고민글"
      subtitle="전체 기간"
      icon={<TrendingUp className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />}
    >
      <div className="space-y-3.5">
        {TRENDING_SECTIONS.map(({ key, label }, i) => (
          <div
            key={key}
            className={
              i > 0
                ? "border-t border-sky-100/90 pt-3.5 dark:border-[#223141]"
                : undefined
            }
          >
            <h3 className="text-xs font-semibold text-sky-700 dark:text-sky-300/90">
              {label}
            </h3>
            <div className="mt-1.5">
              <TrendingPostList posts={trending?.[key] ?? []} />
            </div>
          </div>
        ))}
        <div className="border-t border-sky-100/90 pt-3 dark:border-[#223141]">
          <Link href={BOARD_PATH} className={LINK_MORE}>
            게시판에서 더 보기
          </Link>
        </div>
      </div>
    </SideCard>
  );

  const navLinkClass = (active: boolean, muted = false) =>
    [
      "group flex min-h-[2.75rem] cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors",
      active
        ? "bg-sky-200/80 text-sky-950 shadow-sm shadow-sky-900/5 dark:bg-sky-500/18 dark:text-white"
        : muted
          ? "text-zinc-500 hover:bg-zinc-100/90 hover:text-zinc-800 dark:text-[#8fa3b8] dark:hover:bg-zinc-800/40 dark:hover:text-[#E2E8F0]"
          : "text-zinc-800 hover:bg-sky-100 hover:text-sky-950 dark:text-[#AFC6D8] dark:hover:bg-sky-950/45 dark:hover:text-white",
    ].join(" ");

  const boardSet = new Set<string>(BOARD_CATEGORIES);
  const choiceRows = categories.filter((row) => !boardSet.has(row.category));

  const boardNavItems: { feed: HomeFeed; category: string }[] = [
    { feed: "notice", category: "공지사항" },
    { feed: "feedback", category: "건의게시판" },
  ];

  const categoryNav = (
    <nav className="flex flex-col gap-0.5 text-sm">
      <Link
        href={homeFeedHref("choice")}
        className={navLinkClass(onBoard && feed === "choice" && !activeCategory)}
      >
        <span className="truncate font-medium">전체</span>
      </Link>
      {choiceRows.map((row) => (
        <Link
          key={row.category}
          href={homeFeedHref("choice", { category: row.category })}
          className={navLinkClass(
            onBoard && feed === "choice" && activeCategory === row.category
          )}
        >
          <span className="truncate text-[13px] font-medium leading-snug">
            <CategoryLabel category={row.category} />
          </span>
        </Link>
      ))}
      <div
        className="my-1.5 border-t border-zinc-200/70 dark:border-[#334155]"
        role="separator"
      />
      {boardNavItems.map((item) => (
        <Link
          key={item.feed}
          href={homeFeedHref(item.feed)}
          className={navLinkClass(onBoard && feed === item.feed, true)}
        >
          <span className="truncate font-medium">
            <CategoryLabel category={item.category} />
          </span>
        </Link>
      ))}
    </nav>
  );

  const mobileNavPill = (
    key: string,
    href: string,
    label: ReactNode,
    active: boolean,
    muted = false
  ) => (
    <Link
      key={key}
      href={href}
      className={[
        "rounded-full border px-3 py-2 text-xs transition",
        active
          ? "border-sky-500 bg-sky-100 font-medium text-sky-950 dark:border-sky-500 dark:bg-sky-950/60 dark:text-sky-50"
          : muted
            ? "border-zinc-200/90 bg-zinc-50/90 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400"
            : "border-sky-200/80 bg-white text-zinc-600 hover:border-sky-400 dark:border-sky-800/70 dark:bg-zinc-900/80 dark:text-sky-300",
      ].join(" ")}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex w-full flex-col gap-6 sm:gap-7 md:gap-8 lg:gap-10 xl:gap-11 2xl:gap-12">
      <div className="grid w-full grid-cols-1 gap-5 sm:gap-6 md:gap-7 lg:grid-cols-[minmax(200px,220px)_minmax(0,1fr)_minmax(240px,280px)] lg:gap-7 xl:grid-cols-[minmax(200px,220px)_minmax(0,1fr)_minmax(256px,300px)] xl:gap-8">
        <aside className="hidden lg:block lg:min-w-0">
          <SideCard title="게시판">{categoryNav}</SideCard>
        </aside>

        <div className="min-w-0">{children}</div>

        <aside className="hidden lg:block lg:min-w-0">
          <div className="space-y-4 lg:space-y-5 xl:space-y-6">{trendingPopularCard}</div>
        </aside>
      </div>

      <div className="lg:hidden">{trendingPopularCard}</div>

      <div className="cc-card p-4 sm:p-5 lg:hidden">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-sky-100">게시판</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {mobileNavPill(
            "all",
            homeFeedHref("choice"),
            "전체",
            onBoard && feed === "choice" && !activeCategory
          )}
          {choiceRows.map((row) =>
            mobileNavPill(
              row.category,
              homeFeedHref("choice", { category: row.category }),
              <CategoryLabel category={row.category} />,
              onBoard && feed === "choice" && activeCategory === row.category
            )
          )}
          {boardNavItems.map((item) =>
            mobileNavPill(
              item.feed,
              homeFeedHref(item.feed),
              <CategoryLabel category={item.category} />,
              onBoard && feed === item.feed,
              true
            )
          )}
        </div>
      </div>
    </div>
  );
}
