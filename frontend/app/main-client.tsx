"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { CategoryLabel } from "@/components/CategoryLabel";
import { BOARD_PATH } from "@/lib/home-feed";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { SITE_NAME } from "@/lib/site";
import { PostStatsInline } from "@/components/PostStatsInline";
import {
  CARD,
  LIST_PANEL,
  LIST_ROW_HOVER,
  PAGE_STACK,
  SECTION_TITLE,
  TEXT_MUTED,
  TEXT_STATS,
} from "@/lib/ui-classes";

type StatsSummary = {
  total_posts: number;
  total_votes: number;
  ai_recommendations: number;
};

type PostPreview = {
  id: number;
  title: string;
  category: string;
  view_count?: number;
  like_count?: number;
  vote_count?: number;
  comment_count?: number;
  created_at: string;
};

type PopularPost = {
  id: number;
  title: string;
  category: string;
  view_count?: number;
  like_count?: number;
  vote_count?: number;
  comment_count?: number;
};

function fmtNumber(n: number | null | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("ko-KR").format(v);
}

type MainPostItem = Pick<
  PostPreview,
  | "id"
  | "title"
  | "category"
  | "view_count"
  | "like_count"
  | "vote_count"
  | "comment_count"
>;

function MainPostListItem({ post }: { post: MainPostItem }) {
  return (
    <Link href={`/posts/${post.id}`} className={LIST_ROW_HOVER}>
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-white">
          {post.title}
        </p>
        <span className={`shrink-0 ${TEXT_STATS}`}>
          <PostStatsInline
            className="flex-nowrap"
            view_count={post.view_count}
            like_count={post.like_count}
            vote_count={post.vote_count}
            comment_count={post.comment_count}
          />
        </span>
      </div>
      <p className={`mt-0.5 truncate ${TEXT_MUTED}`}>
        <CategoryLabel category={post.category} />
      </p>
    </Link>
  );
}

export default function MainClient() {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [recent, setRecent] = useState<PostPreview[]>([]);
  const [popular, setPopular] = useState<PopularPost[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, posts, pop] = await Promise.all([
          fetchWithTimeout(`${API_BASE_URL}/stats/summary`, { timeoutMs: 10000 }),
          fetchWithTimeout(`${API_BASE_URL}/posts?page_size=10&sort=latest`, {
            timeoutMs: 12000,
          }),
          fetchWithTimeout(`${API_BASE_URL}/stats/trending-posts?limit=10`, {
            timeoutMs: 10000,
          }),
        ]);
        if (cancelled) return;
        if (s.ok) {
          const j = (await s.json()) as Record<string, unknown>;
          setSummary({
            total_posts: typeof j.total_posts === "number" ? j.total_posts : 0,
            total_votes: typeof j.total_votes === "number" ? j.total_votes : 0,
            ai_recommendations:
              typeof j.ai_recommendations === "number" ? j.ai_recommendations : 0,
          });
        }
        if (posts.ok) {
          const j = (await posts.json()) as { items?: PostPreview[] };
          setRecent(Array.isArray(j.items) ? j.items : []);
        }
        if (pop.ok) {
          const bundle = (await pop.json()) as { by_votes?: PopularPost[] };
          setPopular(Array.isArray(bundle.by_votes) ? bundle.by_votes : []);
        }
      } catch {
        /* optional */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const boardCta = (
    <div className="rounded-xl border border-sky-300/50 bg-linear-to-r from-sky-50/90 via-white to-cyan-50/80 px-4 py-4 dark:border-sky-700/45 dark:from-sky-950/35 dark:via-[#111827] dark:to-cyan-950/20 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
          고민 게시판
        </p>
        <p className="mt-0.5 text-base font-bold text-zinc-900 dark:text-white sm:text-lg">
          전체 글 둘러보기
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-[#9bb3c7]">
          카테고리 · 검색 · 정렬로 원하는 고민을 찾아보세요
        </p>
      </div>
      <div className="mt-3 flex w-full flex-wrap gap-2 sm:w-auto sm:gap-2.5">
        <Link
          href={BOARD_PATH}
          className="group inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 dark:bg-sky-500 dark:hover:bg-sky-400 dark:focus-visible:ring-offset-0 sm:flex-none sm:px-5"
        >
          게시판 가기
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            aria-hidden
            className="transition group-hover:translate-x-0.5"
          >
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <Link
          href="/write/ai"
          className="inline-flex flex-1 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70 focus-visible:ring-offset-2 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:ring-offset-0 sm:flex-none sm:px-5"
        >
          글쓰기
        </Link>
      </div>
    </div>
  );

  return (
    <div className={PAGE_STACK}>
      <section className={CARD}>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">
          <span className="text-zinc-900 dark:text-sky-50">혼자 고민하지 말고 </span>
          <span className="bg-linear-to-r from-sky-600 via-sky-500 to-cyan-500 bg-clip-text text-transparent">
            {SITE_NAME}
          </span>
        </h1>
        <p className={`mt-1.5 ${TEXT_MUTED}`}>
          투표 · AI 추천 · 댓글로 고민을 정리해 보세요
        </p>
        <div
          className="mt-4 grid grid-cols-3 gap-2 sm:gap-3"
          role="group"
          aria-label="서비스 통계"
        >
          {(
            [
              { value: summary?.total_posts, label: "등록된 고민" },
              { value: summary?.total_votes, label: "투표 참여" },
              { value: summary?.ai_recommendations, label: "AI 답변" },
            ] as const
          ).map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-sky-200/75 bg-sky-50/60 px-2 py-2.5 text-center dark:border-sky-800/55 dark:bg-sky-950/40 sm:px-3 sm:py-3"
            >
              <p className="text-xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
                {fmtNumber(stat.value)}
              </p>
              <p className="mt-0.5 text-[10px] font-medium text-zinc-500 dark:text-sky-400/85 sm:text-[11px]">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4">{boardCta}</div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="main-recent-heading">
          <h2 id="main-recent-heading" className={SECTION_TITLE}>
            최근 고민 🕐
          </h2>
          <ul className={`mt-2 ${LIST_PANEL}`}>
            {recent.length === 0 ? (
              <li className={`px-3 py-6 text-center ${TEXT_MUTED}`}>
                아직 글이 없어요
              </li>
            ) : (
              recent.map((post) => (
                <li key={post.id}>
                  <MainPostListItem post={post} />
                </li>
              ))
            )}
          </ul>
        </section>

        <section aria-labelledby="main-popular-heading">
          <h2 id="main-popular-heading" className={SECTION_TITLE}>
            지금 가장 뜨는 고민 🔥
          </h2>
          <ul className={`mt-2 ${LIST_PANEL}`}>
            {popular.length === 0 ? (
              <li className={`px-3 py-6 text-center ${TEXT_MUTED}`}>
                집계 중이에요
              </li>
            ) : (
              popular.map((post) => (
                <li key={post.id}>
                  <MainPostListItem post={post} />
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
