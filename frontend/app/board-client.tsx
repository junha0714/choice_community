"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { fetchWithTimeout, isAbortError } from "@/lib/fetch-with-timeout";
import { formatPostDateLabel } from "@/lib/format-datetime";
import {
  isBoardCategory,
  isNoticeCategory,
  isSuggestionCategory,
  SUGGESTION_CATEGORY,
} from "@/lib/board-categories";
import { CategoryLabel } from "@/components/CategoryLabel";
import { categoryDisplayName } from "@/lib/categories";
import {
  BOARD_PATH,
  homeFeedApiParam,
  homeFeedHref,
  resolveHomeFeed,
  type HomeFeed,
} from "@/lib/home-feed";
import {
  CARD,
  CARD_STRONG,
  FILTER_CHIP,
  INPUT_FIELD,
  LIST_PANEL,
  PAGE_STACK,
  SECTION_HEADING_BAR,
  SECTION_SUBTITLE,
  SECTION_TITLE,
  TEXT_MUTED,
} from "@/lib/ui-classes";

type Post = {
  id: number;
  title: string;
  content: string;
  category: string;
  options: string;
  post_kind?: string;
  is_notice?: boolean;
  is_board_post?: boolean;
  view_count?: number;
  like_count?: number;
  vote_count?: number;
  comment_count?: number;
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

function hasPostImage(post: Pick<Post, "content">): boolean {
  // 글쓰기에서 이미지 업로드 시 마크다운 `![img](url)` 형태로 삽입됨
  return /!\[[^\]]*]\([^)]+\)/.test(post.content);
}

function fmtNumber(n: number | null | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("ko-KR").format(v);
}

/** 카테고리(아이콘 없음): 연애·인간관계 전체 표기, 제목은 1fr, 메타 열은 컴팩트 */
const BOARD_DESKTOP_GRID =
  "grid grid-cols-[minmax(6.25rem,6.75rem)_minmax(0,1fr)_minmax(3.5rem,4.5rem)_minmax(3.5rem,4rem)_minmax(2.5rem,3rem)_minmax(2.25rem,2.75rem)_minmax(2.25rem,2.75rem)] items-center gap-1.5 md:gap-2";

function BoardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("category");
  const searchQ = searchParams.get("q")?.trim() || "";
  const sortParam = searchParams.get("sort")?.trim() || "latest";
  const tagParam = searchParams.get("tag")?.trim() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const SORTS = ["latest", "likes", "harmony", "comments", "votes"] as const;
  const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
    latest: "최신",
    likes: "좋아요",
    harmony: "조회",
    comments: "댓글",
    votes: "투표",
  };
  const sort = (SORTS as readonly string[]).includes(sortParam)
    ? sortParam
    : "latest";
  const feed = resolveHomeFeed(searchParams.get("feed"), category);

  const [data, setData] = useState<PaginatedPosts | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchDraft, setSearchDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");

  const fetchPosts = async (signal?: AbortSignal) => {
    const params = new URLSearchParams();
    const apiFeed = homeFeedApiParam(feed);
    if (apiFeed) params.set("feed", apiFeed);
    if (feed === "choice" && category) params.set("category", category);
    if (searchQ) params.set("q", searchQ);
    if (sort !== "likes") params.set("sort", sort);
    if (tagParam) params.set("tag", tagParam);
    params.set("page", String(page));
    params.set("page_size", "20");
    const qs = params.toString();
    const headers: HeadersInit = {};
    // 크로스 오리진에서 Authorization은 CORS preflight를 유발할 수 있어 홈(공개 목록)은
    // 같은 오리진(/api 프록시)일 때만 토큰을 붙입니다.
    if (API_BASE_URL.startsWith("/")) {
      const token = getStoredToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const timeoutMs = 15000;
    const res = await fetchWithTimeout(`${API_BASE_URL}/posts?${qs}`, {
      headers,
      signal,
      timeoutMs,
    });
    if (!res.ok) {
      // 배포 환경에서는 종종 HTML 에러 페이지가 내려오므로 본문을 그대로 노출하지 않습니다.
      let detail = "";
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = (await res.json().catch(() => null)) as unknown;
        if (
          j &&
          typeof j === "object" &&
          "detail" in j &&
          typeof (j as Record<string, unknown>).detail === "string"
        ) {
          detail = (j as Record<string, unknown>).detail as string;
        }
      }
      const base =
        res.status >= 500
          ? "서버가 잠시 불안정해요. 잠시 후 다시 시도해 주세요."
          : "게시글 목록을 불러오지 못했어요.";
      throw new Error(`${base} (${res.status})${detail ? `\n${detail}` : ""}`);
    }
    const json = (await res.json()) as unknown;
    const parsed =
      typeof json === "object" &&
      json != null &&
      "items" in json &&
      Array.isArray((json as Record<string, unknown>).items)
        ? (json as PaginatedPosts)
        : null;
    if (!parsed) throw new Error("응답 형식이 올바르지 않아요. 잠시 후 다시 시도해 주세요.");
    setData(parsed);
  };

  useEffect(() => {
    setSearchDraft(searchParams.get("q") || "");
    setTagDraft(searchParams.get("tag") || "");
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        await fetchPosts(controller.signal);
      } catch (e) {
        if (controller.signal.aborted) return;
        if (isAbortError(e)) {
          setError(
            "서버 응답이 지연되고 있어요. (타임아웃)\n잠시 후 다시 시도해 주세요.",
          );
        } else if (
          e instanceof TypeError &&
          /failed to fetch/i.test(e.message || "")
        ) {
          setError(
            "서버에 연결할 수 없어요. (Failed to fetch)\n- 백엔드가 중지/슬립 상태이거나\n- CORS가 배포 도메인을 허용하지 않거나\n- API 주소가 잘못 설정됐을 수 있어요.",
          );
        } else {
          setError(e instanceof Error ? e.message : "불러오기에 실패했어요.");
        }
        setData(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [category, feed, searchQ, page, sort, tagParam, reloadKey]);

  useEffect(() => {
    if (!data || data.total_pages <= 1) return;
    const next = page + 1;
    const prev = page - 1;
    if (next <= data.total_pages) router.prefetch(buildPageHref(next));
    if (prev >= 1) router.prefetch(buildPageHref(prev));
  }, [data, page, router]);

  const buildListParams = (overrides?: {
    page?: number;
    sort?: string;
    tag?: string;
    q?: string;
    feed?: HomeFeed;
    category?: string | null;
  }) => {
    const p = new URLSearchParams();
    const f = overrides?.feed ?? feed;
    if (f !== "choice") p.set("feed", f);
    const cat =
      overrides && "category" in overrides
        ? overrides.category
        : f === "choice"
          ? category
          : null;
    if (f === "choice" && cat) p.set("category", cat);
    const qv = overrides && "q" in overrides ? overrides.q ?? "" : searchQ;
    if (qv) p.set("q", qv);
    const sv = overrides && "sort" in overrides ? overrides.sort ?? "latest" : sort;
    if (sv && sv !== "latest") p.set("sort", sv);
    const tv = overrides && "tag" in overrides ? overrides.tag ?? "" : tagParam;
    if (tv) p.set("tag", tv);
    const pg = overrides?.page !== undefined ? overrides.page : page;
    if (pg > 1) p.set("page", String(pg));
    return p;
  };

  const searchHrefBase = () => boardListHref(buildListParams({ page: 1, q: "" }).toString());

  const buildPageHref = (pnum: number) =>
    boardListHref(buildListParams({ page: pnum }).toString());

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const t = searchDraft.trim();
    router.push(boardListHref(buildListParams({ page: 1, q: t }).toString()));
  };

  const handleTagSubmit = (e: FormEvent) => {
    e.preventDefault();
    const t = tagDraft.trim().toLowerCase();
    router.push(boardListHref(buildListParams({ page: 1, tag: t }).toString()));
  };

  const posts = data?.items ?? [];
  const totalPages = data?.total_pages ?? 0;
  const total = data?.total ?? 0;

  const listHeading =
    feed === "notice"
      ? "공지사항"
      : feed === "feedback"
        ? "피드백"
        : "게시판";
  const listSubheading =
    feed === "notice"
      ? "운영 공지와 안내"
      : feed === "feedback"
        ? "서비스 제안·버그 제보"
        : "카테고리·검색으로 고민 글을 찾아보세요";

  const boardListHref = (qs: string) => (qs ? `${BOARD_PATH}?${qs}` : BOARD_PATH);

  return (
    <div className={PAGE_STACK}>
      {(category || searchQ || tagParam) && (
        <div className="flex flex-wrap items-center gap-2">
          {category && feed === "choice" && (
            <span className={FILTER_CHIP}>
              <span className="text-sky-700/90 dark:text-sky-300/85">필터</span>
              <CategoryLabel category={category} />
              <Link
                href={homeFeedHref("choice", { q: searchQ, tag: tagParam, sort })}
                className="rounded-md px-1.5 py-0.5 text-[11px] text-sky-800 transition hover:bg-sky-100/90 dark:text-sky-200 dark:hover:bg-sky-900/50"
              >
                해제
              </Link>
            </span>
          )}
          {searchQ && (
            <span className={FILTER_CHIP}>
              <span className="text-cyan-800/90 dark:text-cyan-300/85">검색</span>
              &quot;{searchQ}&quot;
              <Link
                href={searchHrefBase()}
                className="rounded-md px-1.5 py-0.5 text-[11px] transition hover:bg-sky-100/90 dark:hover:bg-sky-900/50"
              >
                지우기
              </Link>
            </span>
          )}
          {tagParam && (
            <span className={FILTER_CHIP}>
              <span className="text-sky-700/90 dark:text-sky-300/85">태그</span>
              #{tagParam}
              <Link
                href={boardListHref(buildListParams({ page: 1, tag: "" }).toString())}
                className="rounded-md px-1.5 py-0.5 text-[11px] transition hover:bg-sky-100/90 dark:hover:bg-sky-900/50"
              >
                해제
              </Link>
            </span>
          )}
        </div>
      )}

      <div className={CARD}>
        {feed === "choice" || feed === "feedback" ? (
          <div className="mb-3 flex items-center justify-end gap-2 border-b border-sky-100/90 pb-3 dark:border-sky-800/55 sm:mb-4 sm:pb-4">
            {feed === "choice" ? (
              <Link
                href="/write/ai"
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                글쓰기
              </Link>
            ) : (
              <Link
                href="/feedback"
                className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400"
              >
                피드백 남기기
              </Link>
            )}
          </div>
        ) : null}
        <div className="flex w-full flex-col gap-3 lg:max-w-none">
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
              className={INPUT_FIELD}
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
                  const href = boardListHref(qs);
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
                className="text-xs font-medium text-sky-700/90 dark:text-sky-400/90"
                id="home-tag-label"
              >
                태그 필터
              </span>
              <input
                id="home-tag"
                aria-labelledby="home-tag-label"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="예: ai, 추천, 여행"
                className="min-w-0 flex-1 rounded-lg border border-sky-200/80 bg-sky-50/70 px-2.5 py-1.5 text-sm text-zinc-800 shadow-sm outline-none focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-200/85 dark:border-sky-800/55 dark:bg-sky-950/35 dark:text-sky-100 dark:focus:border-sky-500 dark:focus:bg-zinc-950/80 dark:focus:ring-sky-900/60"
              />
              <button
                type="submit"
                className="rounded-lg border border-sky-200/85 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-sky-900 shadow-sm transition hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/85 focus-visible:ring-offset-1 dark:border-sky-800/70 dark:bg-zinc-900/90 dark:text-sky-100 dark:hover:bg-sky-950/50"
              >
                적용
              </button>
            </form>
          </div>
        </div>
      </div>

      <section aria-labelledby="recent-posts-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className={SECTION_HEADING_BAR}>
            <h2 id="recent-posts-heading" className={SECTION_TITLE}>
              {listHeading}
            </h2>
            <p className={SECTION_SUBTITLE}>{listSubheading}</p>
          </div>
          {data != null && total > 0 && (
            <p className="text-xs tabular-nums text-sky-600/90 dark:text-sky-400/80" aria-live="polite">
              총 {total}건 · {page}/{Math.max(totalPages, 1)}페이지
            </p>
          )}
        </div>

        {error ? (
          <div
            className="rounded-2xl border border-rose-200/70 bg-rose-50/60 px-4 py-10 text-center dark:border-rose-900/60 dark:bg-rose-950/25"
            role="alert"
          >
            <p className="text-sm text-rose-950/90 dark:text-rose-100/90 whitespace-pre-wrap">
              {error}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setReloadKey((v) => v + 1);
                }}
                className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-rose-900/20 transition hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 focus-visible:ring-offset-2 dark:bg-rose-500 dark:hover:bg-rose-400"
              >
                다시 시도
              </button>
              <Link
                href={BOARD_PATH}
                className="inline-flex items-center justify-center rounded-xl border border-rose-300/70 bg-white/90 px-4 py-2 text-sm font-medium text-rose-950 shadow-sm transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60 focus:outline-none focus-visible:ring-offset-2 dark:border-rose-900/60 dark:bg-zinc-900/70 dark:text-rose-100 dark:hover:bg-rose-950/40"
              >
                게시판으로
              </Link>
            </div>
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sky-300/65 bg-sky-50/55 px-4 py-10 text-center dark:border-sky-700/55 dark:bg-sky-950/35">
            <p className="text-sm text-sky-950/85 dark:text-sky-100/90">
              {searchQ || category || tagParam
                ? "조건에 맞는 글이 없어요. 다른 검색어나 필터를 써 보세요."
                : feed === "notice"
                  ? "등록된 공지가 없어요."
                  : feed === "feedback"
                    ? "아직 피드백 글이 없어요. 첫 제안을 남겨 주세요."
                    : "아직 글이 없어요. 글쓰기로 첫 글을 남겨보세요."}
            </p>
            {!searchQ && !category && !tagParam && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {feed === "feedback" ? (
                  <Link
                    href="/feedback"
                    className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/55 focus-visible:ring-offset-2"
                  >
                    피드백 남기기
                  </Link>
                ) : feed === "choice" ? (
                  <Link
                    href="/write/ai"
                    className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-indigo-900/25 transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/55 focus-visible:ring-offset-2 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    글쓰기
                  </Link>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className={`hidden px-4 py-2 text-[11px] font-semibold cc-muted sm:block ${CARD_STRONG}`}>
              <div className={BOARD_DESKTOP_GRID}>
                <div className="truncate">카테고리</div>
                <div className="truncate text-left">제목</div>
                <div className="truncate text-right">글쓴이</div>
                <div className="truncate text-right">날짜</div>
                <div className="truncate text-right">조회</div>
                <div className="truncate text-right">좋아요</div>
                <div className="truncate text-right">투표</div>
              </div>
            </div>

            <ul className={`list-none p-0 ${LIST_PANEL}`}>
              {posts.map((post) => {
                const kind = (post.post_kind ?? "community") as string;
                const isAi = kind === "ai";
                const isNotice =
                  post.is_notice === true || isNoticeCategory(post.category);
                const isBoard =
                  post.is_board_post === true || isBoardCategory(post.category);
                return (
                  <li key={post.id}>
                    <Link
                      href={`/posts/${post.id}`}
                      title={post.title}
                      className={[
                        "group block px-4 py-3 transition",
                        "hover:bg-sky-50/75 focus-visible:bg-sky-50/75",
                        "dark:hover:bg-sky-950/30 dark:focus-visible:bg-sky-950/30",
                        "focus-visible:outline-none",
                      ].join(" ")}
                    >
                      {/* Mobile */}
                      <div className="sm:hidden">
                        <div className="flex min-w-0 flex-nowrap items-center gap-x-1.5 overflow-hidden text-[11px]">
                          <span className="min-w-0 flex-1 truncate font-medium text-zinc-600 dark:text-[#9bb3c7]">
                            <CategoryLabel category={post.category} />
                          </span>
                          {isNotice ? (
                            <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">
                              공지
                            </span>
                          ) : isSuggestionCategory(post.category) ? (
                            <span className="shrink-0 font-semibold text-violet-700 dark:text-violet-300">
                              건의
                            </span>
                          ) : null}
                          {isAi ? (
                            <span className="shrink-0 font-semibold text-indigo-600 dark:text-indigo-300">
                              AI
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-snug tracking-tight text-zinc-950 transition group-hover:text-sky-900 dark:text-white">
                          {post.title}
                          {(post.comment_count ?? 0) > 0 ? (
                            <span className="ml-1 text-[12px] font-semibold text-zinc-500 dark:text-[#9bb3c7] tabular-nums">
                              ({post.comment_count})
                            </span>
                          ) : null}
                        </h3>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500 dark:text-[#9bb3c7]">
                          <span className="font-medium text-zinc-700 dark:text-sky-200/90">
                            {authorLabel(post)}
                          </span>
                          <span className="text-zinc-300 dark:text-sky-800/80">·</span>
                          <span className="tabular-nums">{formatPostDateLabel(post.created_at)}</span>
                          <span className="text-zinc-300 dark:text-sky-800/80">·</span>
                          <span className="tabular-nums">
                            조회 {fmtNumber(post.view_count)} · ♥{" "}
                            {fmtNumber(post.like_count)}
                            {!isBoard ? (
                              <>
                                {" "}
                                · 투표 {fmtNumber(post.vote_count)}
                              </>
                            ) : null}
                          </span>
                        </div>

                        {!isBoard && post.options.trim() ? (
                          <p className="mt-1 line-clamp-1 text-[11px] text-sky-800/75 dark:text-sky-200/70">
                            <span className="font-semibold text-sky-600/90 dark:text-sky-300/90">
                              선택지
                            </span>{" "}
                            {post.options}
                          </p>
                        ) : null}
                      </div>

                      {/* Desktop row */}
                      <div className="hidden sm:block">
                        <div className={`${BOARD_DESKTOP_GRID} overflow-hidden`}>
                          <div className="min-w-0 overflow-hidden">
                            <div className="flex min-w-0 flex-nowrap items-center gap-x-1.5 text-[11px]">
                              <span className="shrink-0 whitespace-nowrap font-medium text-zinc-600 dark:text-[#9bb3c7]">
                                {categoryDisplayName(post.category)}
                              </span>
                              {isNotice ? (
                                <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">
                                  공지
                                </span>
                              ) : isSuggestionCategory(post.category) ? (
                                <span className="shrink-0 font-semibold text-violet-700 dark:text-violet-300">
                                  건의
                                </span>
                              ) : null}
                              {isAi ? (
                                <span className="shrink-0 font-semibold text-indigo-600 dark:text-indigo-300">
                                  AI
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="min-w-0 overflow-hidden">
                            <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                              {hasPostImage(post) ? (
                                <span
                                  className="shrink-0 text-amber-700/90 dark:text-amber-300/90"
                                  title="사진 포함"
                                  aria-label="사진 포함"
                                >
                                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
                                    <path
                                      d="M4 7.5A2.5 2.5 0 0 1 6.5 5h2.2c.43 0 .83-.2 1.07-.55l.86-1.3c.23-.35.63-.56 1.06-.56h.62c.43 0 .83.2 1.06.56l.86 1.3c.24.35.64.55 1.07.55h2.2A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10Z"
                                      stroke="currentColor"
                                      strokeWidth="1.6"
                                    />
                                    <path
                                      d="M9 13.5l1.7 1.7 3.8-3.8 3.5 3.5"
                                      stroke="currentColor"
                                      strokeWidth="1.6"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                    <path
                                      d="M15.5 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
                                      fill="currentColor"
                                    />
                                  </svg>
                                </span>
                              ) : null}
                              <span className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-zinc-950 transition group-hover:text-sky-900 dark:text-white">
                                {post.title}
                                {(post.comment_count ?? 0) > 0 ? (
                                  <span className="ml-1 text-[11px] font-semibold text-zinc-500 dark:text-[#9bb3c7] tabular-nums">
                                    [{post.comment_count}]
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          </div>

                          <div className="truncate text-right text-[11px] text-zinc-500 dark:text-[#9bb3c7]">
                            {authorLabel(post)}
                          </div>
                          <div className="truncate text-right text-[11px] tabular-nums text-zinc-500 dark:text-[#9bb3c7]">
                            {formatPostDateLabel(post.created_at)}
                          </div>
                          <div className="truncate text-right text-[11px] tabular-nums text-zinc-500 dark:text-[#9bb3c7]">
                            {fmtNumber(post.view_count)}
                          </div>
                          <div className="truncate text-right text-[11px] tabular-nums text-zinc-500 dark:text-[#9bb3c7]">
                            {fmtNumber(post.like_count)}
                          </div>
                          <div className="truncate text-right text-[11px] tabular-nums text-zinc-500 dark:text-[#9bb3c7]">
                            {isBoard ? "—" : fmtNumber(post.vote_count)}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
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

        {isLoading && (
          <p className="text-center text-xs text-sky-600/80 dark:text-sky-400/80" aria-live="polite">
            불러오는 중…
          </p>
        )}
      </section>
    </div>
  );
}

export default function BoardClient() {
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
      <BoardInner />
    </Suspense>
  );
}
