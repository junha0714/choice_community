import {
  NOTICE_CATEGORY,
  SUGGESTION_CATEGORY,
} from "@/lib/board-categories";

export const BOARD_PATH = "/board";

export type HomeFeed = "choice" | "notice" | "feedback";

export const HOME_FEED_LABELS: Record<HomeFeed, string> = {
  choice: "고민",
  notice: "공지",
  feedback: "피드백",
};

export function resolveHomeFeed(
  feedParam: string | null,
  category: string | null
): HomeFeed {
  const f = (feedParam || "").trim().toLowerCase();
  const c = (category || "").trim();
  if (f === "notice" || c === NOTICE_CATEGORY) return "notice";
  if (f === "feedback" || c === SUGGESTION_CATEGORY) return "feedback";
  return "choice";
}

export function homeFeedApiParam(feed: HomeFeed): string | null {
  if (feed === "choice") return null;
  return feed;
}

type FeedHrefOpts = {
  category?: string | null;
  q?: string;
  sort?: string;
  tag?: string;
  page?: number;
};

export function homeFeedHref(feed: HomeFeed, opts: FeedHrefOpts = {}): string {
  const p = new URLSearchParams();
  if (feed !== "choice") p.set("feed", feed);
  if (feed === "choice" && opts.category) {
    p.set("category", opts.category);
  }
  if (opts.q) p.set("q", opts.q);
  if (opts.sort && opts.sort !== "latest") p.set("sort", opts.sort);
  if (opts.tag) p.set("tag", opts.tag);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return qs ? `${BOARD_PATH}?${qs}` : BOARD_PATH;
}

export function isChoiceFeed(feed: HomeFeed): boolean {
  return feed === "choice";
}
