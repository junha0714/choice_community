"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

function AiTranscriptBlock({ items }: { items: AITranscriptItem[] }) {
  if (!items.length) return null;
  return (
    <ol className="mt-3 list-none space-y-3 p-0">
      {items.map((row) => (
        <li
          key={row.step}
          className="rounded-lg border border-indigo-100 bg-white/90 px-4 py-3 text-sm text-zinc-800 shadow-sm dark:border-indigo-900/40 dark:bg-[#16202A] dark:text-sky-100"
        >
          <p>
            <strong className="text-indigo-950 dark:text-sky-100">
              Q{row.step}.
            </strong>{" "}
            {row.question}
          </p>
          {row.answer != null && String(row.answer).trim() !== "" ? (
            <p className="mt-2 text-zinc-600 dark:text-[#cbd5e1]">
              <strong className="text-zinc-800 dark:text-sky-100">A.</strong>{" "}
              {row.answer}
            </p>
          ) : (
            <p className="mt-2 text-amber-900/85 dark:text-amber-200">
              답변 대기 중
            </p>
          )}
        </li>
      ))}
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
      const data = await res.json();
      setAiState(data);
      setAiAnswer("");
      if (Array.isArray(data.transcript)) {
        setAiTranscript(data.transcript);
      }
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 질문 시작 실패";
      setAiError(message);
    } finally {
      setAiLoading(false);
    }
  };

  const AI_UNSURE_ANSWER =
    "잘 모르겠어요. 이 질문에는 아직 뚜렷한 생각이 없어요.";

  const handleNextAI = async (presetAnswer?: string) => {
    if (!params?.id) return;
    const answerToSend = (presetAnswer ?? aiAnswer).trim();
    if (!answerToSend) {
      alert("답변을 입력해줘");
      return;
    }

    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${params.id}/next-ai`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ answer: answerToSend }),
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
      <main className="mx-auto w-full max-w-4xl">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          불러오는 중...
        </div>
      </main>
    );
  }

  if (postError) {
    return (
      <main className="mx-auto w-full max-w-4xl">
        <div className="rounded-xl border border-red-200 bg-white p-6 text-red-700 shadow-sm">
          오류: {postError}
        </div>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="mx-auto w-full max-w-4xl">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
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

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">게시글 상세</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/"
            className="text-zinc-600 hover:underline dark:text-sky-300/80"
          >
            ← 목록
          </Link>
          <button
            type="button"
            onClick={() => tryNavigateToWrite(router, "/write")}
            className="cursor-pointer text-zinc-700 hover:underline dark:text-sky-100/90"
          >
            투표 고민 쓰기
          </button>
          <button
            type="button"
            onClick={() => tryNavigateToWrite(router, "/write/ai")}
            className="cursor-pointer text-indigo-700 hover:underline dark:text-indigo-200"
          >
            AI 고민 쓰기
          </button>
        </div>
      </div>

      <section
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]"
      >
        {post.is_hidden ? (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-900/20 dark:text-amber-100">
            관리자에 의해 목록에서 숨겨진 글입니다. 작성자와 관리자만 이 페이지를 볼 수
            있어요.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
            {post.title}
          </h2>
          {(post.tags ?? []).length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {(post.tags ?? []).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-[#1B2733] dark:text-sky-200"
                >
                  #{t}
                </span>
              ))}
            </span>
          ) : null}
          {(post.post_kind ?? "community") === "ai" ? (
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200">
              AI 고민 글
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
              커뮤니티 투표
            </span>
          )}
        </div>
        <div className="mt-3">
          <PostBody content={post.content} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-600 dark:text-[#cbd5e1]">
          <span>
            <strong>조회</strong> {post.view_count ?? 0}
          </span>
          <span className="text-zinc-300">·</span>
          <button
            type="button"
            onClick={handleToggleLike}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-zinc-800 hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#0f1720] dark:text-sky-100 dark:hover:bg-sky-950/35"
          >
            <span aria-hidden>{post.liked_by_me ? "♥" : "♡"}</span>
            좋아요 {post.like_count ?? 0}
          </button>
        </div>
        <div className="mt-3 text-sm text-zinc-600 dark:text-[#cbd5e1]">
          <div>
            <strong>카테고리:</strong> {post.category}
          </div>
          <div className="mt-1">
            <strong>선택지:</strong> {post.options}
          </div>
          <div className="mt-1">
            <strong>작성자:</strong> {postAuthorLabel(post)}
          </div>
        </div>
        {meResolved && (isAuthor || isAdmin) ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 text-sm dark:border-[#223141]">
            {isAuthor ? (
              <Link
                href={`/posts/${post.id}/edit`}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-zinc-800 hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#0f1720] dark:text-sky-100 dark:hover:bg-sky-950/35"
              >
                수정
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void handleDeletePost()}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#0f1720] dark:text-red-200 dark:hover:bg-red-950/25"
            >
              삭제
            </button>
          </div>
        ) : null}
        {meResolved &&
        hasToken &&
        !isAuthor &&
        post.user_id != null &&
        post.user_id !== meId ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 text-sm">
            <button
              type="button"
              onClick={() => void handleReportPost()}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
            >
              글 신고
            </button>
            <button
              type="button"
              onClick={() => void handleBlockUser(post.user_id!)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
            >
              작성자 차단
            </button>
          </div>
        ) : null}
      </section>

      {isAiPost && !meResolved && (
      <section className="rounded-xl border border-indigo-100 bg-white p-4 text-sm text-zinc-500 shadow-sm">
        AI 영역 확인 중…
      </section>
      )}

      {isAiPost && meResolved && (
      <section
        className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm dark:border-indigo-900/50 dark:bg-indigo-500/10"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-indigo-950 dark:text-sky-100">
            AI 추천 결과
          </h2>
          {post.ai_mode === "detailed" ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-500/15 dark:text-violet-100">
              상세 비교
            </span>
          ) : post.ai_mode === "simple" ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-500/15 dark:text-slate-200">
              간단
            </span>
          ) : null}
        </div>

        {showPublicAiUi ? (
          <>
            <p className="mt-1 text-sm text-indigo-900/85">
              {showPublicAiTranscript
                ? "작성자가 공개한 AI 질문·답변과 추천이에요."
                : "질문·답변 과정은 작성자만 볼 수 있어요. 최종 추천만 아래에 공개돼요."}
            </p>
            {showPublicAiTranscript ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-indigo-950">
                  AI 질문·답변
                </h3>
                <AiTranscriptBlock items={aiTranscript} />
              </div>
            ) : null}
            {post.ai_recommended ? (
              <div
                className="mt-4 rounded-lg border border-indigo-100 bg-white p-4 text-zinc-800 dark:border-indigo-900/40 dark:bg-[#16202A] dark:text-sky-100"
              >
                <p className="font-medium text-indigo-950 dark:text-sky-100">
                  추천: {post.ai_recommended}
                </p>
                {post.ai_reason ? (
                  <div className="mt-2 text-sm text-zinc-700 dark:text-[#cbd5e1]">
                    <strong className="text-zinc-800 dark:text-sky-100">
                      이유·비교
                    </strong>
                    <div className="mt-2">
                      <AiReasonDisplay text={post.ai_reason} />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-600 dark:text-[#cbd5e1]">
                작성자가 아직 AI 추천을 완료하지 않았어요.
              </p>
            )}
          </>
        ) : showAuthorAiUi ? (
          <>
            <p className="mt-1 text-sm text-indigo-900/85">
              AI가 고민 본문을 바탕으로 질문을 이어 가요. 진행한 질문·답변은 아래에 계속 쌓여 보여요.
              다른 사람에게는 완료 후 &quot;질문·답변 공개&quot;를 켠 경우에만 보입니다.
              {post.ai_mode === "detailed"
                ? " 상세 모드는 질문 5번 후, 선택지마다 비교 분석이 붙습니다."
                : " 간단 모드는 질문 3번 후 추천이에요."}
            </p>
            <div className="mt-4 border-t border-indigo-100 pt-4">
              {aiTranscript.length > 0 ? (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-indigo-950">
                    나와 AI의 대화
                  </h3>
                  <AiTranscriptBlock items={aiTranscript} />
                </div>
              ) : null}

              {(!!(post.ai_recommended ?? "").trim() ||
                aiState?.type === "result") && (
                <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                  <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-800">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300"
                      checked={!!post.ai_transcript_public}
                      disabled={aiVisibilitySaving}
                      onChange={(e) =>
                        void handleAiTranscriptPublicChange(e.target.checked)
                      }
                    />
                    <span>
                      <strong className="text-indigo-950">
                        질문·답변 과정을 다른 사람에게도 공개하기
                      </strong>
                      <span className="mt-1 block text-zinc-600">
                        끄면 방문자는 최종 추천만 보고, 대화 로그는 나만 볼 수 있어요.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {!aiState && !post.ai_recommended && (
                <button
                  type="button"
                  onClick={handleStartAI}
                  disabled={aiLoading}
                  className="rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-900/20 hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-500/90 dark:hover:bg-red-400/90"
                >
                  {aiLoading ? "AI 시작 중..." : "AI 질문 시작"}
                </button>
              )}

              {!aiState && post.ai_recommended && (
                <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
                  <p className="mb-2 text-sm text-zinc-800 dark:text-sky-100">
                    <strong>AI 추천:</strong> {post.ai_recommended}
                  </p>
                  {post.ai_reason ? (
                    <div className="mt-2 text-sm text-zinc-700 dark:text-[#cbd5e1]">
                      <strong className="text-zinc-900 dark:text-sky-100">
                        이유·비교
                      </strong>
                      <div className="mt-2 text-sm">
                        <AiReasonDisplay text={post.ai_reason} />
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleRestartAI}
                    disabled={aiLoading}
                    className="mt-3 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-900/20 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500/90 dark:hover:bg-indigo-400/90"
                  >
                    AI 다시 실행
                  </button>
                </div>
              )}

              {aiError && (
                <p className="mt-3 text-sm text-red-700 dark:text-red-200">
                  <strong>오류:</strong> {aiError}
                </p>
              )}

              {aiState?.type === "question" && (
                <div>
                  {aiTranscript.length === 0 ? (
                    <p className="mb-3 text-sm text-zinc-800 dark:text-sky-100">
                      <strong>질문 {aiState.step}:</strong> {aiState.question}
                    </p>
                  ) : (
                    <p className="mb-3 text-sm text-zinc-700 dark:text-[#cbd5e1]">
                      위 목록의 마지막 질문에 답해 주세요.
                    </p>
                  )}

                  <p className="mb-2 text-sm text-zinc-600 dark:text-[#94a3b8]">
                    생각이 정리되지 않았거나 대답하기 어려우면 &quot;모르겠어요&quot;를 눌러도 돼요.
                  </p>

                  <textarea
                    value={aiAnswer}
                    onChange={(e) => setAiAnswer(e.target.value)}
                    placeholder="답변을 입력하세요"
                    className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
                    style={{ minHeight: 96 }}
                  />

                  <button
                    type="button"
                    onClick={() => handleNextAI(AI_UNSURE_ANSWER)}
                    disabled={aiLoading}
                    className="mb-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#223141] dark:bg-[#1B2733] dark:text-[#cbd5e1] dark:hover:bg-sky-950/35"
                  >
                    모르겠어요
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNextAI()}
                    disabled={aiLoading}
                    className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-900/15 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-500/90 dark:hover:bg-amber-400/90"
                  >
                    {aiLoading ? "다음 질문 생성 중..." : "다음"}
                  </button>
                  <button
                    type="button"
                    onClick={handleRestartAI}
                    disabled={aiLoading}
                    className="ml-2 rounded-lg bg-zinc-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-zinc-900/10 hover:bg-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-600/90 dark:hover:bg-zinc-500/90"
                  >
                    다시 시작
                  </button>
                </div>
              )}

              {aiState?.type === "result" && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 shadow-sm dark:border-[#223141] dark:bg-[#1B2733]">
                  <p className="mb-2 text-sm text-zinc-800 dark:text-sky-100">
                    <strong>AI 추천:</strong> {aiState.recommended}
                  </p>
                  {aiState.reason ? (
                    <div className="mb-2 text-sm text-zinc-700 dark:text-[#cbd5e1]">
                      <strong className="text-zinc-900 dark:text-sky-100">
                        이유·비교
                      </strong>
                      <div className="mt-2 text-sm">
                        <AiReasonDisplay text={aiState.reason} />
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleRestartAI}
                    disabled={aiLoading}
                    className="mt-3 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-900/20 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500/90 dark:hover:bg-indigo-400/90"
                  >
                    AI 다시 실행
                  </button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>
      )}

      <section
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
          커뮤니티 투표
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-[#94a3b8]">
          선택지에 투표해 다른 사람들의 의견을 모아요. AI 추천과는 다른 방식이에요.
        </p>
        {post.vote_deadline_at ? (
          <p className="mt-2 text-sm text-zinc-700 dark:text-[#cbd5e1]">
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
        ) : (
          <p className="mt-2 text-sm text-zinc-500 dark:text-[#94a3b8]">
            투표 마감 일시 없음 (계속 투표 가능)
          </p>
        )}

        {!meResolved && hasToken ? (
          <p className="mb-3 text-sm text-zinc-500 dark:text-[#94a3b8]">
            투표 가능 여부 확인 중…
          </p>
        ) : isAuthorForVote ? (
          <p className="mb-3 text-sm text-zinc-500 dark:text-[#94a3b8]">
            본인이 쓴 글에는 투표할 수 없어요.
          </p>
        ) : !hasToken ? (
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

        <div className="mb-4 flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={
                !!myVote || isAuthorForVote || !meResolved || voteClosed
              }
              onClick={() => handleVote(option)}
              className={[
                "rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm",
                myVote?.selected_option === option
                  ? "bg-emerald-700 ring-2 ring-amber-300"
                  : "bg-emerald-600 hover:bg-emerald-500",
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

        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
          현재 투표 결과
        </h3>

        {voteCounts.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-[#94a3b8]">
            아직 투표가 없습니다.
          </p>
        ) : (
          voteCounts.map((vote) => (
            <div
              key={vote.option}
              className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-[#223141] dark:bg-[#0f1720] dark:text-[#cbd5e1]"
            >
              <span className="font-semibold text-zinc-900 dark:text-white">
                {vote.option}
              </span>
              <span className="font-medium">{vote.count}표</span>
            </div>
          ))
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              비슷한 고민
            </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-[#cbd5e1]">
              같은 주제의 글을 모아 더 빠르게 결정해 보세요.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300"
          >
            더 보기
          </Link>
        </div>

        {similarLoading ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="h-20 rounded-xl border border-sky-200/60 bg-sky-50/60 dark:border-[#223141] dark:bg-[#1B2733]" />
            <div className="h-20 rounded-xl border border-sky-200/60 bg-sky-50/60 dark:border-[#223141] dark:bg-[#1B2733]" />
          </div>
        ) : similarPosts.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-[#94a3b8]">
            아직 비슷한 글을 찾지 못했어요.
          </p>
        ) : (
          <ul className="mt-4 grid list-none gap-2 p-0 sm:grid-cols-2">
            {similarPosts.map((sp) => (
              <li key={sp.id}>
                <Link
                  href={`/posts/${sp.id}`}
                  className="block rounded-xl border border-sky-200/60 bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:border-sky-400/80 hover:shadow-[0_14px_44px_-26px_rgba(14,165,233,0.28)] dark:border-[#223141] dark:bg-[#1B2733] dark:hover:bg-sky-950/25"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      {sp.title}
                    </span>
                    {(sp.post_kind ?? "community") === "ai" ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900 dark:bg-[#2b1f4a] dark:text-white">
                        AI
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-[#16283a] dark:text-[#4A90E2]">
                        투표
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-[#94a3b8]">
                    <span className="font-medium text-sky-700 dark:text-sky-300">
                      {sp.category}
                    </span>
                    <span>조회 {sp.view_count ?? 0}</span>
                    <span>♥ {sp.like_count ?? 0}</span>
                  </div>
                  {(sp.tags ?? []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(sp.tags ?? []).slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-[#2a3642] dark:text-[#6B7C8F]"
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

      <section
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
          댓글 작성
        </h2>

        {!hasToken && (
          <p className="mb-3 text-sm text-zinc-600 dark:text-[#cbd5e1]">
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
          <p className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            <span>
              답글 작성 중 · #
              {comments.find((x) => x.id === replyToId)?.id ?? replyToId}
            </span>
            <button
              type="button"
              className="text-indigo-600 underline"
              onClick={() => setReplyToId(null)}
            >
              취소
            </button>
          </p>
        )}

        <textarea
          value={commentInput}
          onChange={(e) => setCommentInput(e.target.value)}
          placeholder={
            replyToId != null
              ? "답글 내용을 입력하세요"
              : "댓글을 입력하세요"
          }
          className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
          style={{ minHeight: 96 }}
        />

        <button
          onClick={handleCreateComment}
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-900/20 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500/90 dark:hover:bg-indigo-400/90"
        >
          댓글 등록
        </button>
      </section>

      <section
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
          댓글 목록
        </h2>

        {comments.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-[#94a3b8]">
            아직 댓글이 없습니다.
          </p>
        ) : (
          (commentsByParent.get(null) ?? []).map((comment) => (
            <div
              key={comment.id}
              className="border-b border-zinc-100 py-3 last:border-0 dark:border-[#223141]"
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