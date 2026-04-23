"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";

type Post = {
  id: number;
  title: string;
  content: string;
  category: string;
  options: string;
  post_kind?: string;
  view_count?: number;
  like_count?: number;
  user_id?: number | null;
  author_nickname?: string | null;
  created_at: string;
  tags?: string[];
};

type PaginatedPosts = {
  items: Post[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

function authorLabel(post: Post): string {
  if (post.author_nickname) return post.author_nickname;
  if (post.user_id != null) return `사용자 #${post.user_id}`;
  return "익명";
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("category");
  const searchQ = searchParams.get("q")?.trim() || "";
  const sortParam = searchParams.get("sort")?.trim() || "likes";
  const tagParam = searchParams.get("tag")?.trim() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const SORTS = ["likes", "harmony", "comments", "votes"] as const;
  const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
    likes: "좋아요",
    harmony: "조회",
    comments: "댓글",
    votes: "투표",
  };
  const sort = (SORTS as readonly string[]).includes(sortParam)
    ? sortParam
    : "likes";

  const [data, setData] = useState<PaginatedPosts | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");

  const fetchPosts = async () => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (searchQ) params.set("q", searchQ);
    if (sort !== "likes") params.set("sort", sort);
    if (tagParam) params.set("tag", tagParam);
    params.set("page", String(page));
    params.set("page_size", "20");
    const qs = params.toString();
    const token = getStoredToken();
    const headers: HeadersInit = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/posts?${qs}`, { headers });
    const json = await res.json();
    setData(json as PaginatedPosts);
  };

  useEffect(() => {
    setSearchDraft(searchParams.get("q") || "");
    setTagDraft(searchParams.get("tag") || "");
  }, [searchParams]);

  useEffect(() => {
    void fetchPosts();
  }, [category, searchQ, page, sort, tagParam]);

  const buildListParams = (overrides?: {
    page?: number;
    sort?: string;
    tag?: string;
    q?: string;
  }) => {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    const qv = overrides && "q" in overrides ? overrides.q ?? "" : searchQ;
    if (qv) p.set("q", qv);
    const sv = overrides && "sort" in overrides ? overrides.sort ?? "likes" : sort;
    if (sv && sv !== "likes") p.set("sort", sv);
    const tv = overrides && "tag" in overrides ? overrides.tag ?? "" : tagParam;
    if (tv) p.set("tag", tv);
    const pg = overrides?.page !== undefined ? overrides.page : page;
    if (pg > 1) p.set("page", String(pg));
    return p;
  };

  const searchHrefBase = () => {
    const qs = buildListParams({ page: 1, q: "" }).toString();
    return qs ? `/?${qs}` : "/";
  };

  const buildPageHref = (pnum: number) => {
    const qs = buildListParams({ page: pnum }).toString();
    return qs ? `/?${qs}` : "/";
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const t = searchDraft.trim();
    const qs = buildListParams({ page: 1, q: t }).toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  const handleTagSubmit = (e: FormEvent) => {
    e.preventDefault();
    const t = tagDraft.trim().toLowerCase();
    const qs = buildListParams({ page: 1, tag: t }).toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  const posts = data?.items ?? [];
  const totalPages = data?.total_pages ?? 0;
  const total = data?.total ?? 0;

  return (
    <div className="space-y-10 rounded-2xl border border-sky-300/55 bg-linear-to-b from-sky-50 via-white to-cyan-50/35 p-4 shadow-[0_16px_52px_-30px_rgba(2,132,199,0.25)] ring-1 ring-white/70 dark:border-sky-800/45 dark:bg-linear-to-b dark:from-zinc-950 dark:via-sky-950/25 dark:to-zinc-900 dark:ring-sky-900/25 sm:p-6">
      {(category || searchQ || tagParam) && (
        <div className="flex flex-wrap items-center gap-2">
          {category && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/75 bg-sky-100/85 px-3 py-1 text-xs font-medium text-sky-950 shadow-sm shadow-sky-900/10 dark:border-sky-700/60 dark:bg-sky-950/50 dark:text-sky-100 dark:shadow-sky-950/30">
              <span className="text-sky-700/95 dark:text-sky-300/90">필터</span>
              {category}
              <Link
                href={searchQ ? `/?q=${encodeURIComponent(searchQ)}` : "/"}
                className="ml-0.5 rounded-full border border-sky-200/85 bg-white/90 px-2 py-0.5 text-[11px] text-sky-900 transition hover:bg-sky-50 dark:border-sky-700 dark:bg-zinc-900/90 dark:text-sky-100 dark:hover:bg-sky-950"
              >
                해제
              </Link>
            </span>
          )}
          {searchQ && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/75 bg-cyan-100/80 px-3 py-1 text-xs font-medium text-cyan-950 shadow-sm shadow-cyan-900/10 dark:border-cyan-800/55 dark:bg-cyan-950/40 dark:text-cyan-50 dark:shadow-cyan-950/25">
              <span className="text-cyan-700/95 dark:text-cyan-300/90">검색</span>
              &quot;{searchQ}&quot;
              <Link
                href={searchHrefBase()}
                className="ml-0.5 rounded-full border border-cyan-200/85 bg-white/90 px-2 py-0.5 text-[11px] text-cyan-950 transition hover:bg-cyan-50 dark:border-cyan-800 dark:bg-zinc-900/90 dark:text-cyan-100 dark:hover:bg-cyan-950/50"
              >
                지우기
              </Link>
            </span>
          )}
          {tagParam && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/70 bg-sky-100/75 px-3 py-1 text-xs font-medium text-sky-950 shadow-sm shadow-sky-900/10 dark:border-sky-700/55 dark:bg-sky-950/45 dark:text-sky-100">
              <span className="text-sky-700/90 dark:text-sky-300/90">태그</span>
              #{tagParam}
              <Link
                href={`/?${buildListParams({ page: 1, tag: "" }).toString()}`}
                className="ml-0.5 rounded-full border border-sky-200/85 bg-white/90 px-2 py-0.5 text-[11px] text-sky-950 transition hover:bg-sky-50 dark:border-sky-700 dark:bg-zinc-900/90 dark:text-sky-100 dark:hover:bg-sky-950"
              >
                해제
              </Link>
            </span>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-sky-300/55 bg-white p-6 shadow-[0_12px_32px_-24px_rgba(2,132,199,0.18)] dark:border-sky-800/50 dark:bg-none dark:bg-[#111827] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wider text-sky-600/95 dark:text-sky-400/90">
          Choice Community
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-sky-50 sm:text-3xl">
          일상 선택 고민 커뮤니티
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-700 dark:text-sky-200/75">
          투표로 모으고, AI로 정리하고, 후기로 검증해요. 연애·일·소비·취미 등 무엇이든
          선택지로 올려 보세요.
        </p>
        <div className="mt-5 flex w-full max-w-2xl flex-col gap-4 sm:mt-6">
          <form
            onSubmit={handleSearchSubmit}
            className="flex w-full flex-col gap-2 sm:flex-row sm:items-center"
            role="search"
          >
            <label className="sr-only" htmlFor="home-search">
              글 검색
            </label>
            <input
              id="home-search"
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="제목·본문·선택지에서 검색"
              className="min-w-0 flex-1 rounded-xl border border-sky-300/70 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-inner shadow-sky-900/5 outline-none ring-0 transition placeholder:text-zinc-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-300/90 dark:border-sky-700/70 dark:bg-sky-950/40 dark:text-sky-50 dark:placeholder:text-sky-500/80 dark:focus:border-sky-400 dark:focus:bg-zinc-950/80 dark:focus:ring-sky-500/35"
              autoComplete="off"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-linear-to-r from-sky-600 to-sky-700 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-sky-900/20 transition hover:from-sky-500 hover:to-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2 dark:shadow-sky-950/40"
            >
              검색
            </button>
          </form>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
              <span
                id="home-sort-label"
                className="text-xs font-medium text-sky-700/90 dark:text-sky-400/90"
              >
                정렬
              </span>
              <div
                role="group"
                aria-labelledby="home-sort-label"
                className="flex flex-wrap gap-1"
              >
                {SORTS.map((s) => {
                  const qs = buildListParams({ page: 1, sort: s }).toString();
                  const href = qs ? `/?${qs}` : "/";
                  const active = sort === s;
                  return (
                    <Link
                      key={s}
                      href={href}
                      className={[
                        "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                        active
                          ? "bg-sky-600 text-white shadow-sm shadow-sky-900/25 dark:bg-sky-500 dark:shadow-sky-950/40"
                          : "border border-sky-200/75 bg-sky-50/85 text-sky-950 hover:border-sky-300 hover:bg-sky-100/85 dark:border-sky-700/70 dark:bg-sky-950/45 dark:text-sky-100 dark:hover:border-sky-600 dark:hover:bg-sky-900/55",
                      ].join(" ")}
                    >
                      {SORT_LABELS[s]}
                    </Link>
                  );
                })}
              </div>
            </div>
            <form
              onSubmit={handleTagSubmit}
              className="flex min-w-0 flex-1 flex-wrap items-center gap-2 border-t border-sky-100/95 pt-3 dark:border-sky-800/60 sm:border-t-0 sm:pt-0"
            >
              <label className="sr-only" htmlFor="home-tag">
                태그 필터
              </label>
              <span
                className="text-xs font-medium text-cyan-800/90 dark:text-cyan-300/85"
                id="home-tag-label"
              >
                태그
              </span>
              <input
                id="home-tag"
                aria-labelledby="home-tag-label"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="예: 연애"
                className="min-w-0 flex-1 rounded-lg border border-cyan-200/75 bg-cyan-50/50 px-2.5 py-1.5 text-sm text-zinc-800 shadow-sm shadow-cyan-900/5 outline-none focus:border-cyan-500 focus:bg-white/95 focus:ring-2 focus:ring-cyan-200/85 dark:border-cyan-800/55 dark:bg-cyan-950/35 dark:text-sky-100 dark:focus:border-cyan-500 dark:focus:bg-zinc-950/80 dark:focus:ring-cyan-900/60"
              />
              <button
                type="submit"
                className="rounded-lg border border-cyan-200/85 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-cyan-950 shadow-sm transition hover:bg-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/85 focus-visible:ring-offset-1 dark:border-cyan-800/70 dark:bg-zinc-900/90 dark:text-cyan-100 dark:hover:bg-cyan-950/50"
              >
                적용
              </button>
            </form>
          </div>
        </div>
      </div>

      <section aria-labelledby="recent-posts-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="border-l-2 border-sky-500/85 pl-3 dark:border-sky-400/80">
            <h2
              id="recent-posts-heading"
              className="text-lg font-semibold tracking-tight text-sky-950 dark:text-sky-100"
            >
              최근 고민 글
            </h2>
            <p className="mt-0.5 text-sm text-sky-800/80 dark:text-sky-300/80">
              지금 올라온 고민을 둘러보세요
            </p>
          </div>
          {data != null && total > 0 && (
            <p className="text-xs tabular-nums text-sky-600/90 dark:text-sky-400/80" aria-live="polite">
              총 {total}건 · {page}/{Math.max(totalPages, 1)}페이지
            </p>
          )}
        </div>

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sky-300/65 bg-sky-50/55 px-4 py-10 text-center dark:border-sky-700/55 dark:bg-sky-950/35">
            <p className="text-sm text-sky-950/85 dark:text-sky-100/90">
              {searchQ || category || tagParam
                ? "조건에 맞는 글이 없어요. 다른 검색어나 필터를 써 보세요."
                : "아직 글이 없어요. 투표 고민 또는 AI 고민으로 첫 글을 남겨보세요."}
            </p>
            {!searchQ && !category && !tagParam && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/write"
                  className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-sky-900/20 transition hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-2 dark:bg-sky-500 dark:hover:bg-sky-400"
                >
                  투표 고민 쓰기
                </Link>
                <Link
                  href="/write/ai"
                  className="inline-flex items-center justify-center rounded-xl border border-cyan-400/75 bg-cyan-50/95 px-4 py-2 text-sm font-medium text-cyan-950 shadow-sm transition hover:border-cyan-500 hover:bg-cyan-100/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 dark:border-cyan-700/70 dark:bg-cyan-950/45 dark:text-cyan-50 dark:hover:border-cyan-600 dark:hover:bg-cyan-900/50"
                >
                  AI와 함께 고민하기
                </Link>
              </div>
            )}
          </div>
        ) : (
          <ul className="list-none space-y-2.5 p-0">
            {posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/posts/${post.id}`}
                  className="group relative flex cursor-pointer flex-row items-start gap-3 rounded-2xl border border-sky-300/60 bg-white py-3.5 pl-4 pr-4 shadow-[0_8px_22px_-18px_rgba(2,132,199,0.18)] transition duration-200 hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-[0_18px_56px_-26px_rgba(14,165,233,0.32)] focus-visible:-translate-y-0.5 focus-visible:border-sky-500 focus-visible:shadow-[0_18px_56px_-26px_rgba(14,165,233,0.32)] dark:border-sky-800/45 dark:bg-none dark:bg-[#16202A] dark:hover:border-sky-500/85 dark:hover:shadow-[0_18px_56px_-28px_rgba(56,189,248,0.22)] dark:focus-visible:border-sky-500/90 dark:focus-visible:shadow-[0_18px_56px_-28px_rgba(56,189,248,0.22)] sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold leading-snug text-zinc-950 transition group-hover:text-sky-900 dark:text-white dark:group-hover:text-white">
                        {post.title}
                      </span>
                      {(post.tags ?? []).length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">
                          {(post.tags ?? []).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-cyan-100/90 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-cyan-950 ring-1 ring-inset ring-cyan-200/70 dark:bg-[#2a3642] dark:text-[#6B7C8F] dark:ring-[#6B7C8F]/25"
                            >
                              #{t}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      {(post.post_kind ?? "community") === "ai" ? (
                        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900 ring-1 ring-inset ring-sky-200/90 dark:bg-[#2b1f4a] dark:text-white dark:ring-[#9B5DE5]/40">
                          AI
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-emerald-100/90 px-2 py-0.5 text-[11px] font-semibold text-emerald-900/90 ring-1 ring-inset ring-emerald-200/70 dark:bg-[#16283a] dark:text-[#4A90E2] dark:ring-[#4A90E2]/35">
                          투표
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-zinc-700 dark:text-[#B0C4D4]">
                      {post.content}
                    </p>
                  </div>
                  <div className="w-[42%] max-w-[min(240px,42vw)] shrink-0 space-y-1.5 self-stretch border-l border-sky-100/80 pl-3.5 text-right text-[11px] leading-snug text-sky-900/80 dark:border-[#223141]/90 dark:text-[#AFC6D8] sm:w-[38%] sm:max-w-[260px] sm:pl-4 sm:text-xs">
                    <div className="text-sky-950/90 dark:text-white">
                      <span className="text-sky-500/90 dark:text-[#6AA6D8]">카테고리</span>{" "}
                      <span className="font-medium text-sky-950 dark:text-white">
                        {post.category}
                      </span>
                    </div>
                    <div className="text-sky-800/75 dark:text-[#AFC6D8]">
                      {authorLabel(post)} · 조회 {post.view_count ?? 0} · ♥{" "}
                      {post.like_count ?? 0}
                    </div>
                    <div className="line-clamp-2 text-sky-800/75 dark:text-[#AFC6D8]">
                      <span className="text-sky-500/90 dark:text-[#6AA6D8]">선택지</span>{" "}
                      {post.options}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav
            className="mt-8 flex flex-wrap items-center justify-center gap-2"
            aria-label="페이지"
          >
            <Link
              href={buildPageHref(Math.max(1, page - 1))}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition duration-150 ${
                page <= 1
                  ? "pointer-events-none border-sky-100/90 text-sky-200 dark:border-sky-900 dark:text-sky-800"
                  : "border-sky-200/75 bg-sky-50/85 text-sky-950 shadow-sm hover:border-sky-400 hover:bg-sky-100/90 dark:border-sky-700/70 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:border-sky-600 dark:hover:bg-sky-900/55"
              }`}
              aria-disabled={page <= 1}
            >
              이전
            </Link>
            <span className="min-w-20 text-center text-sm tabular-nums text-sky-700/85 dark:text-sky-400/85">
              {page} / {totalPages}
            </span>
            <Link
              href={buildPageHref(Math.min(totalPages, page + 1))}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition duration-150 ${
                page >= totalPages
                  ? "pointer-events-none border-sky-100/90 text-sky-200 dark:border-sky-900 dark:text-sky-800"
                  : "border-sky-200/75 bg-sky-50/85 text-sky-950 shadow-sm hover:border-sky-400 hover:bg-sky-100/90 dark:border-sky-700/70 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:border-sky-600 dark:hover:bg-sky-900/55"
              }`}
              aria-disabled={page >= totalPages}
            >
              다음
            </Link>
          </nav>
        )}
      </section>
    </div>
  );
}

export default function HomeClient() {
  return (
    <Suspense
      fallback={
        <div
          className="animate-pulse space-y-10"
          aria-busy="true"
          aria-label="불러오는 중"
        >
          <div className="rounded-2xl border border-sky-200/50 bg-linear-to-br from-sky-50/90 via-cyan-50/40 to-sky-100/30 p-6 dark:border-sky-800/50 dark:from-zinc-950 dark:via-sky-950/30 dark:to-zinc-900 sm:p-8">
            <div className="h-3 w-28 rounded bg-sky-200/90 dark:bg-sky-800/80" />
            <div className="mt-3 h-8 max-w-md rounded-lg bg-sky-200/80 dark:bg-sky-800/70" />
            <div className="mt-2 h-4 max-w-xl rounded bg-sky-100/90 dark:bg-zinc-800/80" />
            <div className="mt-2 h-4 max-w-lg rounded bg-sky-100/90 dark:bg-zinc-800/80" />
            <div className="mt-6 h-11 rounded-xl bg-white/80 ring-1 ring-sky-200/80 dark:bg-zinc-900/80 dark:ring-sky-800/60" />
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="h-8 w-14 rounded-lg bg-sky-200/75 dark:bg-sky-800/70" />
              <div className="h-8 w-14 rounded-lg bg-sky-200/75 dark:bg-sky-800/70" />
              <div className="h-8 w-14 rounded-lg bg-sky-200/75 dark:bg-sky-800/70" />
              <div className="h-8 w-14 rounded-lg bg-sky-200/75 dark:bg-sky-800/70" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-5 w-40 rounded bg-sky-200/85 dark:bg-sky-900/70" />
            <div className="h-3 w-56 rounded bg-sky-100/90 dark:bg-zinc-800/80" />
            <div className="h-21 rounded-2xl border border-sky-100/85 bg-linear-to-br from-white/85 to-sky-50/55 dark:border-sky-800/55 dark:from-zinc-900/85 dark:to-sky-950/40" />
            <div className="h-21 rounded-2xl border border-sky-100/85 bg-linear-to-br from-white/85 to-sky-50/55 dark:border-sky-800/55 dark:from-zinc-900/85 dark:to-sky-950/40" />
            <div className="h-21 rounded-2xl border border-sky-100/85 bg-linear-to-br from-white/85 to-sky-50/55 dark:border-sky-800/55 dark:from-zinc-900/85 dark:to-sky-950/40" />
          </div>
        </div>
      }
    >
      <HomeInner />
    </Suspense>
  );
}
