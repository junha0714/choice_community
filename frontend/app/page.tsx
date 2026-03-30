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
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const [data, setData] = useState<PaginatedPosts | null>(null);
  const [searchDraft, setSearchDraft] = useState("");

  const fetchPosts = async () => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (searchQ) params.set("q", searchQ);
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
  }, [searchParams]);

  useEffect(() => {
    void fetchPosts();
  }, [category, searchQ, page]);

  const searchHrefBase = () => {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
  };

  const buildPageHref = (p: number) => {
    const q = new URLSearchParams();
    if (category) q.set("category", category);
    if (searchQ) q.set("q", searchQ);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `/?${qs}` : "/";
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    const t = searchDraft.trim();
    if (t) p.set("q", t);
    const qs = p.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  const posts = data?.items ?? [];
  const totalPages = data?.total_pages ?? 0;
  const total = data?.total ?? 0;

  return (
    <main className="space-y-8">
      {(category || searchQ) && (
        <div className="flex flex-wrap items-center gap-2">
          {category && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50/90 px-3 py-1 text-xs font-medium text-indigo-900">
              <span className="text-indigo-600/80">필터</span>
              {category}
              <Link
                href={searchQ ? `/?q=${encodeURIComponent(searchQ)}` : "/"}
                className="ml-0.5 rounded-full border border-indigo-200/80 bg-white/80 px-2 py-0.5 text-[11px] text-indigo-700 transition hover:bg-indigo-100"
              >
                해제
              </Link>
            </span>
          )}
          {searchQ && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50/90 px-3 py-1 text-xs font-medium text-amber-950">
              <span className="text-amber-700/80">검색</span>
              &quot;{searchQ}&quot;
              <Link
                href={searchHrefBase()}
                className="ml-0.5 rounded-full border border-amber-200/80 bg-white/80 px-2 py-0.5 text-[11px] text-amber-800 transition hover:bg-amber-100"
              >
                지우기
              </Link>
            </span>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-white/60 bg-linear-to-br from-white via-white to-violet-50/40 p-6 shadow-sm shadow-indigo-950/4 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          AI 선택 고민 커뮤니티
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
          투표 고민은 커뮤니티 표로, AI 고민은 글 작성 시 &quot;AI와 함께
          고민하기&quot;에서만 질문·추천을 받을 수 있어요.
        </p>
        <form
          onSubmit={handleSearchSubmit}
          className="mt-4 flex w-full max-w-xl flex-col gap-2 sm:mt-5 sm:flex-row sm:items-center"
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
            className="min-w-0 flex-1 rounded-xl border border-zinc-200/90 bg-white/90 px-3.5 py-2.5 text-sm shadow-inner shadow-zinc-900/5 outline-none ring-0 transition placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200/80"
            autoComplete="off"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-500/25 transition hover:from-violet-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
          >
            검색
          </button>
        </form>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900">최근 고민 글</h2>
          {data != null && total > 0 && (
            <p className="text-xs tabular-nums text-zinc-400">
              총 {total}건 · {page}/{Math.max(totalPages, 1)}페이지
            </p>
          )}
        </div>

        {posts.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-200/90 bg-zinc-50/50 px-4 py-8 text-center text-sm text-zinc-500">
            {searchQ || category
              ? "조건에 맞는 글이 없어요. 다른 검색어나 필터를 써 보세요."
              : "아직 글이 없어요. 투표 고민 또는 AI 고민으로 첫 글을 남겨보세요."}
          </p>
        ) : (
          <div className="mt-4 space-y-2.5">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="group flex flex-row items-start gap-3 rounded-2xl border border-zinc-200/70 bg-white/90 py-2.5 pl-3.5 pr-0 shadow-sm shadow-zinc-900/3 transition duration-200 hover:border-indigo-200/70 hover:bg-white hover:shadow-md hover:shadow-indigo-500/10 sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold leading-snug text-zinc-900 transition group-hover:text-indigo-900">
                      {post.title}
                    </h3>
                    {(post.post_kind ?? "community") === "ai" ? (
                      <span className="shrink-0 rounded-full bg-indigo-100/90 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
                        AI
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        투표
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug text-zinc-500">
                    {post.content}
                  </p>
                </div>
                <div className="w-[42%] max-w-[min(240px,42vw)] shrink-0 space-y-1 self-stretch border-l border-zinc-100 pl-3 text-right text-[11px] leading-snug text-zinc-500 sm:w-[38%] sm:max-w-[260px] sm:pl-3 sm:text-xs">
                  <div className="rounded-l-lg bg-stone-50/90 py-1.5 pl-2 pr-0 text-zinc-600">
                    <span className="text-zinc-400">카테고리</span>{" "}
                    <span className="font-medium text-zinc-700">
                      {post.category}
                    </span>
                  </div>
                  <div className="text-zinc-500">
                    {authorLabel(post)} · 조회 {post.view_count ?? 0} · ♥{" "}
                    {post.like_count ?? 0}
                  </div>
                  <div className="line-clamp-2 text-zinc-500">
                    <span className="text-zinc-400">선택지</span>{" "}
                    {post.options}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <nav
            className="mt-8 flex flex-wrap items-center justify-center gap-2"
            aria-label="페이지"
          >
            <Link
              href={buildPageHref(Math.max(1, page - 1))}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                page <= 1
                  ? "pointer-events-none border-zinc-100 text-zinc-300"
                  : "border-zinc-200 bg-white text-zinc-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-900"
              }`}
            >
              이전
            </Link>
            <span className="min-w-20 text-center text-sm tabular-nums text-zinc-500">
              {page} / {totalPages}
            </span>
            <Link
              href={buildPageHref(Math.min(totalPages, page + 1))}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                page >= totalPages
                  ? "pointer-events-none border-zinc-100 text-zinc-300"
                  : "border-zinc-200 bg-white text-zinc-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-900"
              }`}
            >
              다음
            </Link>
          </nav>
        )}
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="space-y-6">
          <div className="h-40 animate-pulse rounded-2xl bg-linear-to-br from-zinc-100 to-violet-50/30" />
          <div className="mt-4 space-y-2">
            <div className="h-24 animate-pulse rounded-2xl bg-zinc-100/80" />
            <div className="h-24 animate-pulse rounded-2xl bg-zinc-100/80" />
          </div>
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  );
}
