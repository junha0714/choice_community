"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import { PostBody } from "@/components/PostBody";
import { tryNavigateToWrite } from "@/lib/require-login-for-write";
import { AiReasonDisplay } from "@/components/AiReasonDisplay";

type Post = {
  id: number;
  title: string;
  content: string;
  category: string;
  options: string;
  post_kind?: string;
  ai_mode?: string | null;
  ai_question_steps?: number | null;
  view_count?: number;
  like_count?: number;
  liked_by_me?: boolean | null;
  ai_recommended?: string | null;
  ai_reason?: string | null;
  ai_transcript_public?: boolean;
  user_id?: number | null;
  author_nickname?: string | null;
  created_at: string;
  is_hidden?: boolean;
  tags?: string[];
  vote_deadline_at?: string | null;
};

function normalizeAiModeSlug(raw: string | null | undefined): string {
  const x = (raw || "quick").trim().toLowerCase();
  if (x === "simple") return "quick";
  if (x === "detailed") return "deep";
  if (x === "balance_game") return "quick";
  if (x === "quick" || x === "deep" || x === "friend" || x === "random_fun") {
    return x;
  }
  return "quick";
}

function aiStyleBadge(slug: string | null | undefined): {
  label: string;
  className: string;
} | null {
  const s = normalizeAiModeSlug(slug);
  const map: Record<string, { label: string; className: string }> = {
    quick: {
      label: "빠른 결정",
      className:
        "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-900/35 dark:text-amber-100",
    },
    deep: {
      label: "깊은 분석",
      className:
        "rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-500/15 dark:text-violet-100",
    },
    friend: {
      label: "친구 상담",
      className:
        "rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900 dark:bg-sky-950/45 dark:text-sky-100",
    },
    random_fun: {
      label: "랜덤 결정",
      className:
        "rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-medium text-fuchsia-900 dark:bg-fuchsia-900/35 dark:text-fuchsia-100",
    },
  };
  return map[s] ?? null;
}

function aiReasonSectionLabel(aiMode: string | null | undefined): string {
  return normalizeAiModeSlug(aiMode) === "deep" ? "이유·비교" : "이유";
}

type Comment = {
  id: number;
  content: string;
  post_id: number;
  user_id?: number | null;
  author_nickname?: string | null;
  parent_id?: number | null;
  reply_count?: number;
  created_at: string;
};

type MyVote = {
  id: number;
  post_id: number;
  user_id: number | null;
  selected_option: string;
  created_at: string;
};

type VoteCount = {
  option: string;
  count: number;
};

type SimilarPostBrief = {
  id: number;
  title: string;
  category: string;
  post_kind?: string;
  view_count?: number;
  like_count?: number;
  created_at: string;
  tags?: string[];
};

type AITranscriptItem = {
  step: number;
  question: string;
  answer: string | null;
};

type AIFlowResponse = {
  type: "question" | "result";
  step?: number;
  question?: string;
  recommended?: string;
  reason?: string;
  transcript?: AITranscriptItem[];
};

function postAuthorLabel(post: Post): string {
  if (post.author_nickname) return post.author_nickname;
  if (post.user_id != null) return `사용자 #${post.user_id}`;
  return "익명";
}

function commentAuthorLabel(c: Comment): string {
  if (c.author_nickname) return c.author_nickname;
  if (c.user_id != null) return `사용자 #${c.user_id}`;
  return "익명";
}

function formatCommentTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function stripMdLite(s: string): string {
  return s
    .replace(/\*+/g, "")
    .replace(/#{1,6}\s?/g, "")
    .replace(/`+/g, "")
    .trim();
}

function firstSummaryFromReason(
  reason: string | null | undefined,
  recommended: string
): string {
  if (!reason?.trim()) {
    return recommended
      ? `이번 추천은 「${recommended}」 쪽이에요.`
      : "추천 요약을 준비 중이에요.";
  }
  const plain = stripMdLite(reason).replace(/\s+/g, " ");
  const line = (plain.split(/[.\n]/)[0] ?? plain).trim();
  if (line.length > 140) return line.slice(0, 137) + "…";
  return line || recommended;
}

function IconEye({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconHeart({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function IconFolder({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function IconList({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function AiRecommendationHero({
  recommended,
  reason,
  aiMode,
  footer,
}: {
  recommended: string;
  reason: string | null | undefined;
  aiMode: string | null | undefined;
  footer?: ReactNode;
}) {
  const summary = firstSummaryFromReason(reason, recommended);
  return (
    <div className="relative overflow-hidden rounded-xl border border-sky-200/55 bg-gradient-to-br from-sky-50/90 via-white to-indigo-50/70 p-4 shadow-sm shadow-sky-900/5 sm:p-5 dark:border-sky-900/25 dark:from-[#152535] dark:via-[#141c28] dark:to-indigo-950/40">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-400/15 blur-3xl dark:bg-sky-500/10" />
      <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-indigo-400/10 blur-3xl dark:bg-indigo-600/10" />
      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300/90">
          AI 추천
        </p>
        <h3 className="mt-1.5 text-lg font-bold leading-snug tracking-tight text-zinc-900 sm:text-xl md:text-2xl dark:text-white">
          {recommended}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-[#b4c4d4]">
          {summary}
        </p>
        {reason ? (
          <div className="mt-3 rounded-lg border border-white/70 bg-white/85 p-3 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-black/25 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {aiReasonSectionLabel(aiMode)}
            </p>
            <div className="mt-2 text-sm leading-relaxed text-zinc-800 dark:text-[#d8e4ef]">
              <AiReasonDisplay text={reason} />
            </div>
          </div>
        ) : null}
        {footer ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-sky-200/40 pt-3 dark:border-sky-900/30">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PostActionOverflow({
  postId,
  isAuthor,
  isAdmin,
  onDelete,
}: {
  postId: number;
  isAuthor: boolean;
  isAdmin: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = () => setOpen(false);
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  if (!isAuthor && !isAdmin) return null;
  return (
    <div
      className="relative shrink-0"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="글 메뉴"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-zinc-500 transition hover:border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-[#2a3544] dark:hover:bg-white/10 dark:hover:text-white"
      >
        <span className="text-lg leading-none">⋯</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-zinc-200/90 bg-white py-1 text-sm shadow-lg shadow-zinc-900/10 dark:border-[#2a3544] dark:bg-[#1B2733]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {isAuthor ? (
            <Link
              href={`/posts/${postId}/edit`}
              className="block px-3 py-2 text-zinc-700 transition hover:bg-zinc-50 dark:text-[#e8f0f7] dark:hover:bg-white/5"
              onClick={() => setOpen(false)}
            >
              수정
            </Link>
          ) : null}
          {isAuthor || isAdmin ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              삭제
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CollapsibleAiLog({
  summary,
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-zinc-200/90 bg-zinc-50/50 dark:border-[#2a3544] dark:bg-[#151f2a]/90">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-zinc-800 outline-none transition hover:bg-zinc-100/80 marker:content-none [&::-webkit-details-marker]:hidden dark:text-sky-100 dark:hover:bg-white/5">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-200 bg-white text-xs text-zinc-500 transition-transform duration-200 group-open:rotate-90 dark:border-[#2a3544] dark:bg-[#1B2733] dark:text-sky-400"
          >
            ›
          </span>
          <span className="truncate">{summary}</span>
        </span>
        <span className="shrink-0 text-[11px] font-normal text-zinc-500 group-open:text-sky-600 dark:text-zinc-500 dark:group-open:text-sky-400">
          <span className="group-open:hidden">펼치기</span>
          <span className="hidden group-open:inline">접기</span>
        </span>
      </summary>
      <div className="border-t border-zinc-200/80 px-2.5 pb-3 pt-2 dark:border-[#2a3544]">
        {children}
      </div>
    </details>
  );
}

const AI_TRANSCRIPT_PREVIEW = 2;

function AiTranscriptBlock({ items }: { items: AITranscriptItem[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return null;
  const hasMore = items.length > AI_TRANSCRIPT_PREVIEW;
  const collapsed = hasMore && !showAll;
  const visible = collapsed
    ? items.slice(0, AI_TRANSCRIPT_PREVIEW)
    : items;
  const hiddenCount = items.length - AI_TRANSCRIPT_PREVIEW;

  return (
    <ol className="mt-0.5 list-none space-y-2 p-0">
      {visible.map((row) => (
        <li
          key={row.step}
          className="rounded-lg border border-zinc-200/90 bg-white p-2.5 shadow-sm transition-shadow hover:border-zinc-300 hover:shadow dark:border-[#2a3544] dark:bg-[#111922] dark:hover:border-[#3d4d60]"
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
              질문 {row.step}
            </span>
          </div>
          <p
            className={`mt-1.5 text-[13px] font-medium leading-snug text-zinc-900 dark:text-white ${collapsed ? "line-clamp-2" : ""}`}
          >
            {row.question}
          </p>
          <div className="mt-2 rounded-md border border-sky-100/90 bg-sky-50/45 p-2 dark:border-sky-900/30 dark:bg-sky-950/20">
            <span className="text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
              답변
            </span>
            {row.answer != null && String(row.answer).trim() !== "" ? (
              <p
                className={`mt-1 text-[13px] leading-relaxed text-zinc-700 dark:text-[#cbd5e1] ${collapsed ? "line-clamp-3" : ""}`}
              >
                {row.answer}
              </p>
            ) : (
              <p className="mt-1 text-[13px] text-amber-800 dark:text-amber-200/90">
                답변 대기 중
              </p>
            )}
          </div>
        </li>
      ))}
      {hasMore ? (
        <li className="list-none pt-0.5">
          {!showAll ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full rounded-lg border border-dashed border-zinc-300/90 bg-zinc-50/80 py-2 text-[12px] font-medium text-zinc-700 transition hover:border-sky-300 hover:bg-sky-50/60 hover:text-sky-800 dark:border-[#3d4d60] dark:bg-[#1a2330] dark:text-zinc-300 dark:hover:border-sky-700 dark:hover:bg-sky-950/30 dark:hover:text-sky-200"
            >
              나머지 {hiddenCount}턴 더 보기
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="text-[12px] font-medium text-zinc-500 underline-offset-2 transition hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              대화 접기
            </button>
          )}
        </li>
      ) : null}
    </ol>
  );
}

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [postError, setPostError] = useState("");
  const [similarPosts, setSimilarPosts] = useState<SimilarPostBrief[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [voteCounts, setVoteCounts] = useState<VoteCount[]>([]);
  const [myVote, setMyVote] = useState<MyVote | null>(null);
  const [hasToken, setHasToken] = useState(false);

  const [aiState, setAiState] = useState<AIFlowResponse | null>(null);
  const [aiTranscript, setAiTranscript] = useState<AITranscriptItem[]>([]);
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiVisibilitySaving, setAiVisibilitySaving] = useState(false);
  const [meId, setMeId] = useState<number | null>(null);
  const [meResolved, setMeResolved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState("");
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [voteCloseLoading, setVoteCloseLoading] = useState(false);

  const commentsByParent = useMemo(() => {
    const m = new Map<number | null, Comment[]>();
    for (const c of comments) {
      const pid = c.parent_id ?? null;
      const arr = m.get(pid) ?? [];
      arr.push(c);
      m.set(pid, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.id - b.id);
    }
    return m;
  }, [comments]);

  const fetchPost = async () => {
    if (!params?.id) return;
    setPostLoading(true);
    setPostError("");
    try {
      const token = getStoredToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/posts/${params.id}`, {
        headers,
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "게시글을 불러오지 못했습니다.");
      }
      const data = await res.json();
      setPost(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "게시글 조회 실패";
      setPostError(message);
      setPost(null);
    } finally {
      setPostLoading(false);
    }
  };

  const fetchComments = async () => {
    if (!params?.id) return;
    const token = getStoredToken();
    const headers: HeadersInit = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/posts/${params.id}/comments`, {
      headers,
    });
    const data = await res.json();
    setComments(data);
  };

  const fetchVotes = async () => {
    if (!params?.id) return;
    const token = getStoredToken();
    const headers: HeadersInit = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/posts/${params.id}/votes`, {
      headers,
    });
    const data = await res.json();
    setVoteCounts(data);
  };

  const fetchSimilar = async () => {
    if (!params?.id) return;
    setSimilarLoading(true);
    try {
      const token = getStoredToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(
        `${API_BASE_URL}/posts/${params.id}/similar?limit=8`,
        { headers }
      );
      const data = await res.json().catch(() => []);
      if (res.ok && Array.isArray(data)) {
        setSimilarPosts(data as SimilarPostBrief[]);
      } else {
        setSimilarPosts([]);
      }
    } catch {
      setSimilarPosts([]);
    } finally {
      setSimilarLoading(false);
    }
  };

  const fetchMyVote = async () => {
    if (!params?.id) return;
    const token = getStoredToken();
    if (!token) {
      setMyVote(null);
      return;
    }
    const res = await fetch(`${API_BASE_URL}/posts/${params.id}/votes/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      setMyVote(null);
      return;
    }
    if (!res.ok) {
      setMyVote(null);
      return;
    }
    const data = await res.json();
    setMyVote(data);
  };

  const handleCreateComment = async () => {
    if (!getStoredToken()) {
      alert("댓글은 로그인 후 작성할 수 있어요.");
      router.push("/login");
      return;
    }
    if (!commentInput.trim()) {
      alert("댓글 내용을 입력해줘");
      return;
    }

    const res = await fetch(`${API_BASE_URL}/posts/${params.id}/comments`, {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({
        content: commentInput,
        parent_id: replyToId ?? undefined,
      }),
    });

    if (res.ok) {
      setCommentInput("");
      setReplyToId(null);
      fetchComments();
    } else {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        alert("로그인이 필요해요.");
        router.push("/login");
      } else {
        alert(
          typeof data.detail === "string" ? data.detail : "댓글 작성 실패"
        );
      }
    }
  };

  const handleVote = async (selectedOption: string) => {
    if (!getStoredToken()) {
      alert("투표는 로그인 후 할 수 있어요.");
      router.push("/login");
      return;
    }
    if (
      meResolved &&
      post?.user_id != null &&
      meId != null &&
      post.user_id === meId
    ) {
      alert("본인이 쓴 글에는 투표할 수 없어요.");
      return;
    }
    if (myVote) {
      alert("이미 이 글에 투표했어요. 투표는 변경할 수 없습니다.");
      return;
    }
    const res = await fetch(`${API_BASE_URL}/posts/${params.id}/votes`, {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ selected_option: selectedOption }),
    });

    if (res.ok) {
      fetchVotes();
      fetchMyVote();
      alert(`${selectedOption}에 투표했어요.`);
    } else {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        alert("로그인이 필요해요.");
        router.push("/login");
      } else {
        alert(
          typeof data.detail === "string" ? data.detail : "투표 실패"
        );
      }
    }
  };

  const handleCloseCommunityVote = async () => {
    if (!params?.id || !post) return;
    if (!getStoredToken()) {
      alert("로그인이 필요해요.");
      router.push("/login");
      return;
    }
    const ok = window.confirm(
      "지금 시각을 기준으로 투표를 마감할까요? 마감 후에는 새로 투표할 수 없어요."
    );
    if (!ok) return;
    setVoteCloseLoading(true);
    try {
      const pastIso = new Date(Date.now() - 2000).toISOString();
      const res = await fetch(`${API_BASE_URL}/posts/${params.id}`, {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ vote_deadline_at: pastIso }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPost(data as Post);
        alert("투표를 마감했어요.");
      } else {
        alert(
          typeof data.detail === "string"
            ? data.detail
            : "투표 마감에 실패했어요."
        );
      }
    } finally {
      setVoteCloseLoading(false);
    }
  };

  const handleStartAI = async () => {
    if (!params?.id) return;
    if (!getStoredToken()) {
      alert("AI 질문은 로그인한 작성자만 진행할 수 있어요.");
      router.push("/login");
      return;
    }
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${params.id}/start-ai`, {
        method: "POST",
        headers: jsonAuthHeaders(),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "AI 질문을 시작하지 못했습니다.");
      }
      const data = (await res.json()) as AIFlowResponse;
      setAiState(data);
      setAiAnswer("");
      if (Array.isArray(data.transcript)) {
        setAiTranscript(data.transcript);
      } else {
        setAiTranscript([]);
      }
      if (data.type === "result") {
        setPost((p) =>
          p
            ? {
                ...p,
                ai_recommended: data.recommended ?? null,
                ai_reason: data.reason ?? null,
                ai_transcript_public: false,
              }
            : p
        );
      } else {
        setPost((p) =>
          p
            ? {
                ...p,
                ai_recommended: null,
                ai_reason: null,
                ai_transcript_public: false,
              }
            : p
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 질문 시작 실패";
      setAiError(message);
    } finally {
      setAiLoading(false);
    }
  };

  const AI_UNSURE_ANSWER =
    "잘 모르겠어요. 이 질문에는 아직 뚜렷한 생각이 없어요.";

  const handleNextAI = async (payload?: {
    presetAnswer?: string;
    action?: "answer" | "skip_question" | "finish_here";
  }) => {
    if (!params?.id) return;
    const action = payload?.action ?? "answer";
    if (action === "finish_here") {
      const ok = window.confirm(
        "남은 질문 없이 지금 추천 결과로 넘어갈까요? (입력한 한 줄이 있으면 함께 전달돼요.)"
      );
      if (!ok) return;
    }
    const answerToSend = (payload?.presetAnswer ?? aiAnswer).trim();
    if (action === "answer" && !answerToSend) {
      alert("답변을 입력해줘");
      return;
    }

    setAiLoading(true);
    setAiError("");
    try {
      const body =
        action === "skip_question" || action === "finish_here"
          ? { action, answer: answerToSend }
          : { answer: answerToSend };
      const res = await fetch(`${API_BASE_URL}/posts/${params.id}/next-ai`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "AI 다음 단계를 진행하지 못했습니다.");
      }

      const data = await res.json();
      setAiState(data);
      setAiAnswer("");
      if (Array.isArray(data.transcript)) {
        setAiTranscript(data.transcript);
      }
      if (data.type === "result" && data.recommended != null) {
        setPost((p) =>
          p
            ? {
                ...p,
                ai_recommended: data.recommended,
                ai_reason: data.reason ?? null,
              }
            : p
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 다음 단계 진행 실패";
      setAiError(message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleRestartAI = async () => {
    setAiState(null);
    setAiAnswer("");
    setAiTranscript([]);
    await handleStartAI();
  };

  const handleAiTranscriptPublicChange = async (next: boolean) => {
    if (!params?.id || !getStoredToken()) return;
    setAiVisibilitySaving(true);
    setAiError("");
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${params.id}`, {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ ai_transcript_public: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "공개 설정을 저장하지 못했습니다."
        );
      }
      setPost(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "공개 설정 저장 실패";
      setAiError(message);
    } finally {
      setAiVisibilitySaving(false);
    }
  };

  const handleToggleLike = async () => {
    if (!getStoredToken()) {
      alert("좋아요는 로그인 후 할 수 있어요.");
      router.push("/login");
      return;
    }
    if (!params?.id) return;
    const res = await fetch(`${API_BASE_URL}/posts/${params.id}/like`, {
      method: "POST",
      headers: jsonAuthHeaders(),
    });
    if (res.ok) {
      const d = await res.json();
      setPost((p) =>
        p ? { ...p, like_count: d.like_count, liked_by_me: d.liked } : p
      );
    } else {
      const data = await res.json().catch(() => ({}));
      alert(
        typeof data.detail === "string" ? data.detail : "좋아요 처리 실패"
      );
    }
  };

  useEffect(() => {
    setHasToken(!!getStoredToken());
    setAiState(null);
    setAiAnswer("");
    setAiError("");
    fetchPost();
    fetchComments();
    fetchVotes();
    fetchMyVote();
    fetchSimilar();
  }, [params?.id]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setMeId(null);
      setIsAdmin(false);
      setMeResolved(true);
      return;
    }
    setMeResolved(false);
    fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        setMeId(u?.id ?? null);
        setIsAdmin(!!u?.is_admin);
      })
      .catch(() => {
        setMeId(null);
        setIsAdmin(false);
      })
      .finally(() => setMeResolved(true));
  }, [params?.id]);

  const shouldLoadAiTranscript =
    !!post &&
    meResolved &&
    (post.post_kind ?? "community") === "ai" &&
    (Boolean(
      meId != null &&
        post.user_id != null &&
        post.user_id === meId
    ) ||
      Boolean(
        post.ai_transcript_public &&
          (post.ai_recommended ?? "").trim().length > 0 &&
          !(meId != null && post.user_id != null && post.user_id === meId)
      ));

  useEffect(() => {
    if (!params?.id || !shouldLoadAiTranscript) {
      setAiTranscript([]);
      return;
    }
    const headers: HeadersInit = {};
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch(`${API_BASE_URL}/posts/${params.id}/ai-transcript`, {
      headers,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: AITranscriptItem[]) => {
        setAiTranscript(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setAiTranscript([]));
  }, [params?.id, shouldLoadAiTranscript]);

  const isAuthorForAi =
    meResolved &&
    meId != null &&
    post != null &&
    post.user_id != null &&
    post.user_id === meId;

  useEffect(() => {
    if (!isAuthorForAi || !(post && (post.post_kind ?? "community") === "ai")) {
      return;
    }
    if (aiLoading) return;
    if (aiState != null) return;
    if ((post.ai_recommended ?? "").trim().length > 0) return;
    const t = aiTranscript;
    if (!t.length) return;
    const last = t[t.length - 1];
    const pending =
      last.answer == null || String(last.answer).trim().length === 0;
    if (pending) {
      setAiState({
        type: "question",
        step: last.step,
        question: last.question,
      });
    }
  }, [
    isAuthorForAi,
    post?.id,
    post?.post_kind,
    post?.ai_recommended,
    aiTranscript,
    aiLoading,
    aiState,
  ]);

  const handleDeletePost = async () => {
    if (!params?.id) return;
    if (!getStoredToken()) {
      router.push("/login");
      return;
    }
    if (!confirm("이 글을 삭제할까요? 삭제 후에는 목록에 보이지 않아요.")) return;
    const res = await fetch(`${API_BASE_URL}/posts/${params.id}`, {
      method: "DELETE",
      headers: jsonAuthHeaders(),
    });
    if (res.ok) {
      router.push("/");
      return;
    }
    const data = await res.json().catch(() => ({}));
    alert(typeof data.detail === "string" ? data.detail : "삭제 실패");
  };

  const handleReportPost = async () => {
    if (!params?.id || !post) return;
    if (!getStoredToken()) {
      router.push("/login");
      return;
    }
    const reason = window.prompt("신고 사유를 입력해 주세요.")?.trim();
    if (!reason) return;
    const res = await fetch(`${API_BASE_URL}/reports`, {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({
        target_type: "post",
        target_id: post.id,
        reason,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      alert("신고가 접수되었습니다.");
    } else {
      alert(typeof data.detail === "string" ? data.detail : "신고 실패");
    }
  };

  const handleBlockUser = async (userId: number) => {
    if (!getStoredToken()) {
      router.push("/login");
      return;
    }
    if (!confirm("이 사용자를 차단할까요? 목록에서 해당 사용자 글이 보이지 않아요."))
      return;
    const res = await fetch(`${API_BASE_URL}/users/blocks`, {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ blocked_user_id: userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      alert("차단했습니다.");
      fetchPost();
      fetchComments();
    } else {
      alert(typeof data.detail === "string" ? data.detail : "차단 실패");
    }
  };

  const handleReportComment = async (commentId: number) => {
    if (!getStoredToken()) {
      router.push("/login");
      return;
    }
    const reason = window.prompt("신고 사유를 입력해 주세요.")?.trim();
    if (!reason) return;
    const res = await fetch(`${API_BASE_URL}/reports`, {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({
        target_type: "comment",
        target_id: commentId,
        reason,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      alert("신고가 접수되었습니다.");
    } else {
      alert(typeof data.detail === "string" ? data.detail : "신고 실패");
    }
  };

  const startEditComment = (c: Comment) => {
    setEditingCommentId(c.id);
    setEditCommentDraft(c.content);
  };

  const handleSaveCommentEdit = async () => {
    if (!params?.id || editingCommentId == null) return;
    const t = editCommentDraft.trim();
    if (!t) {
      alert("댓글 내용을 입력해 주세요.");
      return;
    }
    const res = await fetch(
      `${API_BASE_URL}/posts/${params.id}/comments/${editingCommentId}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ content: t }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setEditingCommentId(null);
      fetchComments();
    } else {
      alert(typeof data.detail === "string" ? data.detail : "수정 실패");
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!params?.id) return;
    if (!confirm("이 댓글을 삭제할까요?")) return;
    const res = await fetch(
      `${API_BASE_URL}/posts/${params.id}/comments/${commentId}`,
      { method: "DELETE", headers: jsonAuthHeaders() }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (editingCommentId === commentId) setEditingCommentId(null);
      fetchComments();
    } else {
      alert(typeof data.detail === "string" ? data.detail : "삭제 실패");
    }
  };

  if (postLoading) {
    return (
      <main className="mx-auto w-full max-w-full px-3 pb-6 pt-4 sm:px-4">
        <div className="rounded-xl border border-sky-300/60 bg-white/92 p-4 shadow-sm shadow-sky-900/5 backdrop-blur-sm dark:border-sky-800/55 dark:bg-[#1B2733]/82 dark:shadow-sky-950/25">
          불러오는 중...
        </div>
      </main>
    );
  }

  if (postError) {
    return (
      <main className="mx-auto w-full max-w-full px-3 pb-6 pt-4 sm:px-4">
        <div className="rounded-xl border border-red-200 bg-white p-4 text-red-700 shadow-sm dark:border-red-900/40 dark:bg-[#16202A]">
          오류: {postError}
        </div>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="mx-auto w-full max-w-full px-3 pb-6 pt-4 sm:px-4">
        <div className="rounded-xl border border-sky-300/60 bg-white/92 p-4 shadow-sm shadow-sky-900/5 backdrop-blur-sm dark:border-sky-800/55 dark:bg-[#1B2733]/82 dark:shadow-sky-950/25">
          게시글이 없습니다.
        </div>
      </main>
    );
  }

  const options = post.options
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);

  const isAuthor =
    meId != null && post.user_id != null && post.user_id === meId;
  /** 투표·작성자 판별은 프로필 로드 후에만 (깜빡임·오투표 방지) */
  const isAuthorForVote =
    meResolved &&
    meId != null &&
    post.user_id != null &&
    post.user_id === meId;
  const isAiPost = (post.post_kind ?? "community") === "ai";
  const showAuthorAiUi = isAiPost && meResolved && isAuthor;
  const showPublicAiUi = isAiPost && meResolved && !isAuthor;
  const showPublicAiTranscript =
    showPublicAiUi &&
    !!post.ai_transcript_public &&
    !!(post.ai_recommended ?? "").trim();

  const voteClosed =
    post.vote_deadline_at != null &&
    Date.now() >= new Date(post.vote_deadline_at).getTime();

  const effectiveAiRecommended =
    (post.ai_recommended ?? "").trim() ||
    (aiState?.type === "result" ? (aiState.recommended ?? "").trim() : "") ||
    "";
  const effectiveAiReason =
    post.ai_reason ||
    (aiState?.type === "result" ? aiState.reason : null) ||
    null;

  const cardClass =
    "rounded-xl border border-sky-300/60 bg-white/92 p-3.5 shadow-sm shadow-sky-900/5 backdrop-blur-sm sm:p-4 md:p-4 dark:border-sky-800/55 dark:bg-[#1B2733]/82 dark:shadow-sky-950/25";

  return (
    <main className="mx-auto w-full max-w-[min(100%,88rem)] space-y-3 px-2 pb-6 pt-3 sm:space-y-3.5 sm:px-3 sm:pb-7 sm:pt-4 md:space-y-4 md:px-4 lg:max-w-none lg:px-1 xl:px-2 2xl:px-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <span aria-hidden>←</span> 목록
        </Link>
        <button
          type="button"
          onClick={() => tryNavigateToWrite(router, "/write/ai")}
          className="rounded-full px-3 py-1 font-medium text-sky-700 transition hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
        >
          고민 글쓰기
        </button>
      </div>

      <article className={cardClass}>
        {post.is_hidden ? (
          <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:bg-amber-900/20 dark:text-amber-100">
            관리자에 의해 목록에서 숨겨진 글입니다. 작성자와 관리자만 이 페이지를 볼 수
            있어요.
          </p>
        ) : null}

        <div className="flex items-start justify-between gap-2.5">
          <h1 className="min-w-0 flex-1 text-lg font-bold leading-snug tracking-tight text-zinc-900 sm:text-xl md:text-2xl dark:text-white">
            {post.title}
          </h1>
          <PostActionOverflow
            postId={post.id}
            isAuthor={isAuthor}
            isAdmin={isAdmin}
            onDelete={() => void handleDeletePost()}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          {(post.tags ?? []).map((t) => (
            <span
              key={t}
              className="rounded bg-zinc-100/90 px-1.5 py-px text-[10px] font-normal text-zinc-600 dark:bg-white/5 dark:text-zinc-400"
            >
              #{t}
            </span>
          ))}
          {(post.post_kind ?? "community") === "ai" ? (
            <span className="rounded-full bg-indigo-100/90 px-1.5 py-px text-[10px] font-medium text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200">
              AI
            </span>
          ) : (
            <span className="rounded-full bg-sky-100/90 px-1.5 py-px text-[10px] font-medium text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
              투표
            </span>
          )}
        </div>

        <div className="mt-4 border-t border-zinc-100/90 pt-4 dark:border-[#283548]">
          <PostBody content={post.content} />
        </div>

        <div className="mt-3 flex min-w-0 flex-nowrap items-center gap-x-2 gap-y-1 overflow-x-auto border-t border-zinc-100/90 pt-3 text-[11px] text-zinc-600 dark:border-[#283548] dark:text-zinc-400 sm:text-xs">
          <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
            <IconEye className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
            조회 {post.view_count ?? 0}
          </span>
          <span className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
          <button
            type="button"
            onClick={handleToggleLike}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200/90 bg-zinc-50/95 px-2 py-0.5 font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-white dark:border-[#2a3544] dark:bg-[#1a2330] dark:text-[#c5d4e3] dark:hover:border-[#3d4d60]"
          >
            <IconHeart
              filled={!!post.liked_by_me}
              className={
                post.liked_by_me
                  ? "h-3.5 w-3.5 text-rose-500"
                  : "h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500"
              }
            />
            {post.like_count ?? 0}
          </button>
          <span className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
          <span className="inline-flex shrink-0 items-center gap-1">
            <IconFolder className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
            {post.category}
          </span>
          <span className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
          <span className="inline-flex min-w-0 shrink-0 max-w-[14rem] items-center gap-1 truncate sm:max-w-[18rem]">
            <IconUser className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
            <span className="truncate">{postAuthorLabel(post)}</span>
          </span>
          <span className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
          <span
            className="inline-flex min-w-0 max-w-[min(40vw,12rem)] shrink-0 items-center gap-1 truncate sm:max-w-[20rem]"
            title={post.options}
          >
            <IconList className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
            <span className="truncate">{post.options}</span>
          </span>
        </div>

        {meResolved &&
        hasToken &&
        !isAuthor &&
        post.user_id != null &&
        post.user_id !== meId ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100/90 pt-3 dark:border-[#283548]">
            <button
              type="button"
              onClick={() => void handleReportPost()}
              className="rounded-full border border-zinc-200/90 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-[#2a3544] dark:bg-[#141c26] dark:text-zinc-300 dark:hover:bg-white/5"
            >
              글 신고
            </button>
            <button
              type="button"
              onClick={() => void handleBlockUser(post.user_id!)}
              className="rounded-full border border-zinc-200/90 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-[#2a3544] dark:bg-[#141c26] dark:text-zinc-300 dark:hover:bg-white/5"
            >
              작성자 차단
            </button>
          </div>
        ) : null}
      </article>

      {isAiPost && !meResolved && (
        <section className={`${cardClass} text-sm text-zinc-500 dark:text-zinc-400`}>
          AI 영역 확인 중…
        </section>
      )}

      {isAiPost && meResolved && showPublicAiUi ? (
        <section className={cardClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 pb-2.5 dark:border-[#334155]">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              AI 추천
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const b = aiStyleBadge(post.ai_mode);
                return b ? (
                  <span className={b.className}>{b.label}</span>
                ) : null;
              })()}
            </div>
          </div>
          {post.ai_recommended ? (
            <>
              <AiRecommendationHero
                recommended={post.ai_recommended}
                reason={post.ai_reason}
                aiMode={post.ai_mode}
              />
              {showPublicAiTranscript ? (
                <div className="mt-3">
                  <CollapsibleAiLog summary="AI와의 대화 보기">
                    <AiTranscriptBlock items={aiTranscript} />
                  </CollapsibleAiLog>
                </div>
              ) : (
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
                  질문·답변 과정은 작성자만 볼 수 있어요.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-[#b8c4d0]">
              작성자가 아직 AI 추천을 완료하지 않았어요.
            </p>
          )}
        </section>
      ) : null}

      {isAiPost && meResolved && showAuthorAiUi ? (
        <section className={cardClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 pb-2.5 dark:border-[#334155]">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              AI 추천
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const b = aiStyleBadge(post.ai_mode);
                return b ? (
                  <span className={b.className}>{b.label}</span>
                ) : null;
              })()}
            </div>
          </div>

          {effectiveAiRecommended ? (
            <>
              <AiRecommendationHero
                recommended={effectiveAiRecommended}
                reason={effectiveAiReason}
                aiMode={post.ai_mode}
                footer={
                  !aiState || aiState.type === "result" ? (
                    <button
                      type="button"
                      onClick={handleRestartAI}
                      disabled={aiLoading}
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#2a3544] dark:bg-[#1B2733] dark:text-sky-100 dark:hover:bg-sky-950/30"
                    >
                      AI 다시 실행
                    </button>
                  ) : null
                }
              />
              {(!!(post.ai_recommended ?? "").trim() ||
                aiState?.type === "result") && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200/90 bg-zinc-50/70 px-2.5 py-2 dark:border-[#2a3544] dark:bg-[#141c26]">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-sky-100">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-[#223141]"
                      checked={!post.ai_transcript_public}
                      disabled={aiVisibilitySaving}
                      onChange={(e) =>
                        void handleAiTranscriptPublicChange(!e.target.checked)
                      }
                    />
                    <span>비공개</span>
                  </label>
                  {aiVisibilitySaving ? (
                    <span className="text-xs text-zinc-500">저장 중…</span>
                  ) : null}
                </div>
              )}
            </>
          ) : null}

          {aiTranscript.length > 0 && aiState?.type !== "question" ? (
            <div className={effectiveAiRecommended ? "mt-3" : "mt-2"}>
              <CollapsibleAiLog summary="AI와의 대화 보기">
                <AiTranscriptBlock items={aiTranscript} />
              </CollapsibleAiLog>
            </div>
          ) : null}

          {!aiState && !post.ai_recommended ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={handleStartAI}
                disabled={aiLoading}
                className="rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-900/15 transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                {aiLoading
                  ? normalizeAiModeSlug(post.ai_mode) === "random_fun"
                    ? "뽑는 중..."
                    : "AI 시작 중..."
                  : normalizeAiModeSlug(post.ai_mode) === "random_fun"
                    ? "무작위로 정하기"
                    : "AI 대화 시작"}
              </button>
            </div>
          ) : null}

          {aiError ? (
            <p className="mt-4 text-sm text-red-700 dark:text-red-200">
              <strong>오류:</strong> {aiError}
            </p>
          ) : null}

          {aiState?.type === "question" ? (
            <div className="mt-4 rounded-xl border border-zinc-200/90 bg-zinc-50/50 p-3 shadow-inner dark:border-[#2a3544] dark:bg-[#141c26]/80 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-[#8fa3b8]">
                    진행 중
                  </p>
                  {aiTranscript.length === 0 ? (
                    <p className="mt-2 text-base font-semibold leading-snug text-zinc-900 dark:text-white">
                      Q{aiState.step}. {aiState.question}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-700 dark:text-[#AFC6D8]">
                      아래 대화 중 마지막 질문에 답해 주세요.
                    </p>
                  )}
                </div>
              </div>

              {aiTranscript.length > 0 ? (
                <div className="mt-3 text-[13px] text-zinc-800 dark:text-[#AFC6D8]">
                  <CollapsibleAiLog summary="AI와의 대화 보기">
                    <ol className="mt-1 list-none space-y-2 p-0">
                      {aiTranscript.map((t) => (
                        <li
                          key={t.step}
                          className="rounded-lg border border-zinc-200/90 bg-white p-2.5 dark:border-[#2a3544] dark:bg-[#111922]"
                        >
                          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-900 dark:text-white">
                            Q{t.step}. {t.question}
                          </p>
                          {t.answer ? (
                            <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-zinc-700 dark:text-[#AFC6D8]">
                              A{t.step}. {t.answer}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </CollapsibleAiLog>
                </div>
              ) : null}

              <div className="mt-4 space-y-2.5">
                <p className="text-xs text-zinc-500 dark:text-[#8fa3b8]">
                  어려우면 &quot;모르겠어요&quot;, 질문 건너뛰기, 바로 추천만 받기를 써도 돼요.
                </p>
                <label className="block text-sm font-medium text-zinc-800 dark:text-white">
                  답변
                  <textarea
                    value={aiAnswer}
                    onChange={(e) => setAiAnswer(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200/60 dark:border-[#2a3544] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-500 dark:focus:ring-sky-500/20"
                    style={{ minHeight: 72 }}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleNextAI({ action: "answer" })}
                    disabled={aiLoading || !aiAnswer.trim()}
                    className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
                  >
                    {aiLoading ? "처리 중..." : "다음"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleNextAI({ presetAnswer: AI_UNSURE_ANSWER })
                    }
                    disabled={aiLoading}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#2a3544] dark:bg-[#1B2733] dark:text-[#cbd5e1] dark:hover:bg-sky-950/35"
                  >
                    모르겠어요
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleNextAI({ action: "skip_question" })}
                    disabled={aiLoading}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#2a3544] dark:bg-[#1B2733] dark:text-[#cbd5e1] dark:hover:bg-sky-950/35"
                  >
                    이 질문 넘기기
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleNextAI({ action: "finish_here" })}
                    disabled={aiLoading}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
                  >
                    여기서 끝내고 추천만
                  </button>
                  <button
                    type="button"
                    onClick={handleRestartAI}
                    disabled={aiLoading}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#223141] dark:bg-[#16202A] dark:text-[#AFC6D8] dark:hover:bg-sky-950/35"
                  >
                    처음부터 다시
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-200/80 pb-2.5 dark:border-[#334155]">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
              커뮤니티 투표
            </h2>
            {post.vote_deadline_at ? (
              <p className="mt-1 text-xs text-zinc-700 dark:text-[#cbd5e1] sm:text-sm">
                <strong>투표 마감: </strong>
                {new Date(post.vote_deadline_at).toLocaleString("ko-KR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {voteClosed ? (
                  <span className="ml-2 font-medium text-amber-800 dark:text-amber-200">
                    (마감됨)
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          {isAuthor && meResolved && !voteClosed ? (
            <button
              type="button"
              onClick={() => void handleCloseCommunityVote()}
              disabled={voteCloseLoading}
              className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70"
              aria-label="투표 마감"
              title="투표 마감"
            >
              {voteCloseLoading ? "…" : "마감"}
            </button>
          ) : null}
        </div>

        <div className="mt-3 space-y-3">
        {!meResolved && hasToken ? (
          <p className="mb-2 text-sm text-zinc-500 dark:text-[#94a3b8]">
            투표 가능 여부 확인 중…
          </p>
        ) : isAuthorForVote ? null : !hasToken ? (
          <p className="mb-3 text-sm text-zinc-600 dark:text-[#cbd5e1]">
            투표는{" "}
            <Link
              href="/login"
              className="font-semibold text-indigo-700 hover:underline dark:text-indigo-200"
            >
              로그인
            </Link>
            후에 할 수 있어요. (계정당 이 글에 한 번만, 변경 불가)
          </p>
        ) : voteClosed && !myVote ? (
          <p className="mb-3 text-sm text-amber-800 dark:text-amber-200">
            투표 마감 시간이 지나 새로 투표할 수 없어요.
          </p>
        ) : myVote ? (
          <p className="mb-3 text-sm text-zinc-700 dark:text-[#cbd5e1]">
            <strong>내 투표:</strong> {myVote.selected_option}{" "}
            <span className="text-xs text-zinc-500 dark:text-[#94a3b8]">
              · 이미 투표했어요
            </span>
          </p>
        ) : (
          <p className="mb-3 text-sm text-zinc-600 dark:text-[#cbd5e1]">
            하나만 선택할 수 있어요. (투표 후에는 바꿀 수 없어요)
          </p>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={
                !!myVote || isAuthorForVote || !meResolved || voteClosed
              }
              onClick={() => handleVote(option)}
              className={[
                "rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-sm",
                myVote?.selected_option === option
                  ? "bg-sky-900 ring-2 ring-sky-400 shadow-sky-950/25 dark:bg-sky-800 dark:ring-sky-400/70"
                  : "bg-sky-800 hover:bg-sky-700 dark:bg-sky-800 dark:hover:bg-sky-700",
                myVote && myVote.selected_option !== option ? "opacity-60" : "",
                myVote || isAuthorForVote || !meResolved || voteClosed
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer",
              ].join(" ")}
            >
              {option}
            </button>
          ))}
        </div>

        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          현재 투표 결과
        </h3>

        {voteCounts.length === 0 ? (
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-[#94a3b8]">
            아직 투표가 없습니다.
          </p>
        ) : (
          voteCounts.map((vote) => (
            <div
              key={vote.option}
              className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200/90 bg-white px-2.5 py-1.5 text-sm text-zinc-700 dark:border-[#223141] dark:bg-[#0f1720] dark:text-[#cbd5e1]"
            >
              <span className="font-semibold text-zinc-900 dark:text-white">
                {vote.option}
              </span>
              <span className="font-medium">{vote.count}표</span>
            </div>
          ))
        )}
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-200/80 pb-2.5 dark:border-[#334155]">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
              비슷한 고민
            </h2>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-sky-700 transition hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
          >
            더 보기
          </Link>
        </div>

        {similarLoading ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-2.5">
            <div className="h-[6.75rem] rounded-lg border border-zinc-200/80 bg-zinc-50/80 dark:border-[#223141] dark:bg-[#1B2733]" />
            <div className="h-[6.75rem] rounded-lg border border-zinc-200/80 bg-zinc-50/80 dark:border-[#223141] dark:bg-[#1B2733]" />
          </div>
        ) : similarPosts.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-[#94a3b8]">
            아직 비슷한 글을 찾지 못했어요.
          </p>
        ) : (
          <ul className="mt-3 grid list-none gap-2 p-0 sm:grid-cols-2 sm:gap-2.5">
            {similarPosts.map((sp) => (
              <li key={sp.id}>
                <Link
                  href={`/posts/${sp.id}`}
                  className="group flex min-h-[6.75rem] flex-col rounded-lg border border-zinc-200/90 bg-white p-3 shadow-sm transition-all duration-150 hover:-translate-y-px hover:border-sky-400/70 hover:shadow-md dark:border-[#2a3544] dark:bg-[#16202A] dark:hover:border-sky-600/50 dark:hover:bg-[#1a2330]"
                >
                  <div className="flex min-h-0 flex-1 items-start gap-2">
                    <p className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 transition-colors group-hover:text-sky-800 dark:text-white dark:group-hover:text-sky-200">
                      {sp.title}
                    </p>
                    {(sp.post_kind ?? "community") === "ai" ? (
                      <span className="shrink-0 rounded-full bg-indigo-100/90 px-1.5 py-px text-[10px] font-semibold text-indigo-800 dark:bg-[#2b1f4a] dark:text-indigo-100">
                        AI
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-sky-100/90 px-1.5 py-px text-[10px] font-semibold text-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
                        투표
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-2 text-[11px] text-zinc-600 dark:text-[#94a3b8]">
                    <span className="font-medium text-sky-700 dark:text-sky-300">
                      {sp.category}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
                      ·
                    </span>
                    <span>조회 {sp.view_count ?? 0}</span>
                    <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
                      ·
                    </span>
                    <span>♥ {sp.like_count ?? 0}</span>
                  </div>
                  {(sp.tags ?? []).length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(sp.tags ?? []).slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-zinc-100 px-1.5 py-px text-[10px] font-medium text-zinc-600 dark:bg-[#2a3642] dark:text-[#94a3b8]"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 pb-2.5 dark:border-[#334155]">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
            댓글
          </h2>
          <span className="tabular-nums text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {comments.length}개
          </span>
        </div>

        <div className="mt-3 space-y-3">
          {!hasToken && (
            <p className="text-sm text-zinc-600 dark:text-[#cbd5e1]">
              댓글은{" "}
              <Link
                href="/login"
                className="font-semibold text-indigo-700 hover:underline dark:text-indigo-200"
              >
                로그인
              </Link>
              후 작성할 수 있어요.
            </p>
          )}

          {replyToId != null && (
            <p className="flex flex-wrap items-center gap-2 rounded-md border border-indigo-200/80 bg-indigo-50/90 px-2.5 py-1.5 text-xs text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-100">
              <span>
                답글 작성 중 · #
                {comments.find((x) => x.id === replyToId)?.id ?? replyToId}
              </span>
              <button
                type="button"
                className="text-indigo-600 underline dark:text-indigo-300"
                onClick={() => setReplyToId(null)}
              >
                취소
              </button>
            </p>
          )}

          <textarea
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            aria-label={replyToId != null ? "답글" : "댓글"}
            className="w-full rounded-lg border border-zinc-300/90 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-[#2a3544] dark:bg-zinc-950/40 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
            style={{ minHeight: 72 }}
          />

          <button
            type="button"
            onClick={handleCreateComment}
            className="rounded-lg bg-sky-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            댓글 등록
          </button>
        </div>

        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-[#283548]">
          {comments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300/90 bg-zinc-50/50 px-4 py-8 text-center dark:border-[#3d4d60] dark:bg-[#141c26]/80">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                아직 댓글이 없어요
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                첫 댓글을 남겨 대화를 시작해 보세요.
              </p>
            </div>
          ) : (
            (commentsByParent.get(null) ?? []).map((comment) => (
            <div
              key={comment.id}
              className="border-b border-zinc-100 py-3 last:border-0 dark:border-[#283548]"
            >
              <CommentThreadBlock
                comment={comment}
                depth={0}
                byParent={commentsByParent}
                meId={meId}
                meResolved={meResolved}
                hasToken={hasToken}
                editingCommentId={editingCommentId}
                editCommentDraft={editCommentDraft}
                setEditCommentDraft={setEditCommentDraft}
                onStartEdit={startEditComment}
                onSaveEdit={() => void handleSaveCommentEdit()}
                onCancelEdit={() => setEditingCommentId(null)}
                onDelete={handleDeleteComment}
                onReport={handleReportComment}
                onBlock={handleBlockUser}
                onReply={(c) => {
                  setReplyToId(c.id);
                  setCommentInput("");
                }}
              />
            </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function CommentThreadBlock({
  comment,
  depth,
  byParent,
  meId,
  meResolved,
  hasToken,
  editingCommentId,
  editCommentDraft,
  setEditCommentDraft,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onReport,
  onBlock,
  onReply,
}: {
  comment: Comment;
  depth: number;
  byParent: Map<number | null, Comment[]>;
  meId: number | null;
  meResolved: boolean;
  hasToken: boolean;
  editingCommentId: number | null;
  editCommentDraft: string;
  setEditCommentDraft: (s: string) => void;
  onStartEdit: (c: Comment) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
  onReport: (id: number) => void;
  onBlock: (uid: number) => void;
  onReply: (c: Comment) => void;
}) {
  const isCommentAuthor =
    meId != null && comment.user_id != null && comment.user_id === meId;
  const replies = byParent.get(comment.id) ?? [];
  return (
    <div className={depth > 0 ? "mt-2 border-l-2 border-zinc-100 pl-3" : ""}>
      {editingCommentId === comment.id ? (
        <div className="space-y-2">
          <textarea
            value={editCommentDraft}
            onChange={(e) => setEditCommentDraft(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onSaveEdit()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => onCancelEdit()}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-zinc-800">{comment.content}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span>{commentAuthorLabel(comment)}</span>
            <span className="tabular-nums text-zinc-400">
              {formatCommentTime(comment.created_at)}
            </span>
            {(comment.reply_count ?? 0) > 0 ? (
              <span className="text-zinc-400">· 답글 {comment.reply_count}</span>
            ) : null}
            {hasToken && meResolved ? (
              <button
                type="button"
                onClick={() => onReply(comment)}
                className="text-indigo-600 hover:underline"
              >
                답글
              </button>
            ) : null}
            {meResolved && isCommentAuthor ? (
              <>
                <button
                  type="button"
                  onClick={() => onStartEdit(comment)}
                  className="text-indigo-600 hover:underline"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(comment.id)}
                  className="text-red-600 hover:underline"
                >
                  삭제
                </button>
              </>
            ) : null}
            {meResolved &&
            hasToken &&
            !isCommentAuthor &&
            comment.user_id != null &&
            comment.user_id !== meId ? (
              <>
                <button
                  type="button"
                  onClick={() => void onReport(comment.id)}
                  className="text-zinc-600 hover:underline"
                >
                  신고
                </button>
                <button
                  type="button"
                  onClick={() => void onBlock(comment.user_id!)}
                  className="text-zinc-600 hover:underline"
                >
                  차단
                </button>
              </>
            ) : null}
          </div>
        </>
      )}
      {replies.map((r) => (
        <CommentThreadBlock
          key={r.id}
          comment={r}
          depth={depth + 1}
          byParent={byParent}
          meId={meId}
          meResolved={meResolved}
          hasToken={hasToken}
          editingCommentId={editingCommentId}
          editCommentDraft={editCommentDraft}
          setEditCommentDraft={setEditCommentDraft}
          onStartEdit={onStartEdit}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onDelete={onDelete}
          onReport={onReport}
          onBlock={onBlock}
          onReply={onReply}
        />
      ))}
    </div>
  );
}