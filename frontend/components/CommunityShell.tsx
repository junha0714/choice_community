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
    return <p className="py-1 text-[11px] text-zinc-400 dark:text-[#AFC6D8]">아직 없어요</p>;
  }
  return (
    <ul className="space-y-0.5 text-sm">
      {posts.map((post, index) => (
        <li key={post.id}>
          <Link
            href={`/posts/${post.id}`}
            title={post.title}
            className="group flex min-w-0 items-center gap-1.5 rounded-lg px-1 py-1 text-sm transition hover:bg-sky-50/80 dark:hover:bg-sky-950/40"
          >
            <span
              className="w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums text-sky-600/90 dark:text-sky-400/85"
              aria-hidden
            >
              {index + 1}
            </span>
            <span className="min-w-0 truncate font-medium text-zinc-800 group-hover:text-sky-800 dark:text-sky-100 dark:group-hover:text-white">
              {post.title}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

/** 헤더(sticky) 아래에서 양쪽 사이드가 스크롤 시 따라옴 */
const STICKY_SIDEBAR_CLASS =
  "sticky z-20 top-[4.75rem] max-h-[calc(100dvh-5.25rem)] overflow-y-auto overscroll-y-contain pb-2 lg:top-[5rem] xl:top-[5.25rem] 2xl:top-[5.5rem]";

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
    <div className="cc-card p-3.5 sm:p-4">
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
  const [trending, setTrending] = useState<TrendingPostsBundle | null>(null);

  useEffect(() => {
    if (hideShell) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [metaRes, statsRes, trendingRes] = await Promise.all([
          fetch(`${API_BASE_URL}/meta/categories`),
          fetch(`${API_BASE_URL}/stats/categories`),
          fetch(`${API_BASE_URL}/stats/trending-posts?limit=5`),
        ]);
        if (cancelled) return;

        let choiceList: string[] = [...CHOICE_CATEGORY_ORDER];
        if (metaRes.ok) {
          const meta = (await metaRes.json()) as { choice_categories?: string[] };
          if (Array.isArray(meta.choice_categories) && meta.choice_categories.length > 0) {
            choiceList = meta.choice_categories;
          }
        }

        const countMap: Record<string, number> = {};
        if (statsRes.ok) {
          const stats = (await statsRes.json()) as CategoryStat[];
          for (const row of stats) {
            countMap[row.category] = row.count;
          }
        }

        setCategories(
          choiceList.map((category) => ({
            category,
            count: countMap[category] ?? 0,
          }))
        );

        if (trendingRes.ok) setTrending(await trendingRes.json());
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
      <div className="space-y-3">
        {TRENDING_SECTIONS.map(({ key, label }, i) => (
          <div
            key={key}
            className={
              i > 0
                ? "border-t border-sky-100/90 pt-3 dark:border-[#223141]"
                : undefined
            }
          >
            <h3 className="text-[11px] font-semibold text-sky-700/90 dark:text-sky-300/85">
              {label}
            </h3>
            <div className="mt-1">
              <TrendingPostList posts={trending?.[key] ?? []} />
            </div>
          </div>
        ))}
      </div>
    </SideCard>
  );

  const navLinkClass = (active: boolean, muted = false) =>
    [
      "group flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors",
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
          <span className="truncate font-medium dark:font-semibold">
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
        "rounded-full border px-3 py-1.5 text-xs transition",
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
        <aside className="hidden lg:block lg:min-h-0">
          <div className={STICKY_SIDEBAR_CLASS}>
            <SideCard title="게시판">{categoryNav}</SideCard>
          </div>
        </aside>

        <div className="min-w-0">{children}</div>

        <aside className="hidden lg:block lg:min-h-0">
          <div className={`${STICKY_SIDEBAR_CLASS} space-y-4 lg:space-y-5 xl:space-y-6`}>
            {trendingPopularCard}
          </div>
        </aside>
      </div>

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

      <div className="lg:hidden">{trendingPopularCard}</div>
    </div>
  );
}
