"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";

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
  user_id?: number | null;
  author_nickname?: string | null;
  created_at: string;
  is_hidden?: boolean;
};

type Comment = {
  id: number;
  content: string;
  post_id: number;
  user_id?: number | null;
  author_nickname?: string | null;
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

type AIFlowResponse = {
  type: "question" | "result";
  step?: number;
  question?: string;
  recommended?: string;
  reason?: string;
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

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [postError, setPostError] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [voteCounts, setVoteCounts] = useState<VoteCount[]>([]);
  const [myVote, setMyVote] = useState<MyVote | null>(null);
  const [hasToken, setHasToken] = useState(false);

  const [aiState, setAiState] = useState<AIFlowResponse | null>(null);
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [meId, setMeId] = useState<number | null>(null);
  const [meResolved, setMeResolved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState("");

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
      body: JSON.stringify({ content: commentInput }),
    });

    if (res.ok) {
      setCommentInput("");
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
      setPost((p) =>
        p ? { ...p, ai_recommended: null, ai_reason: null } : p
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 질문 시작 실패";
      setAiError(message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleNextAI = async () => {
    if (!params?.id) return;
    if (!aiAnswer.trim()) {
      alert("답변을 입력해줘");
      return;
    }

    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${params.id}/next-ai`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ answer: aiAnswer }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "AI 다음 단계를 진행하지 못했습니다.");
      }

      const data = await res.json();
      setAiState(data);
      setAiAnswer("");
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
    fetchPost();
    fetchComments();
    fetchVotes();
    fetchMyVote();
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

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">게시글 상세</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/" className="text-zinc-500 hover:underline">
            ← 목록
          </Link>
          <Link href="/write" className="text-zinc-700 hover:underline">
            투표 고민 쓰기
          </Link>
          <Link href="/write/ai" className="text-indigo-600 hover:underline">
            AI 고민 쓰기
          </Link>
        </div>
      </div>

      <section
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        {post.is_hidden ? (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            관리자에 의해 목록에서 숨겨진 글입니다. 작성자와 관리자만 이 페이지를 볼 수
            있어요.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{post.title}</h2>
          {(post.post_kind ?? "community") === "ai" ? (
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
              AI 고민 글
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              커뮤니티 투표
            </span>
          )}
        </div>
        <p className="mt-3 whitespace-pre-wrap text-zinc-800">{post.content}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
          <span>
            <strong>조회</strong> {post.view_count ?? 0}
          </span>
          <span className="text-zinc-300">·</span>
          <button
            type="button"
            onClick={handleToggleLike}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-zinc-800 hover:bg-zinc-50"
          >
            <span aria-hidden>{post.liked_by_me ? "♥" : "♡"}</span>
            좋아요 {post.like_count ?? 0}
          </button>
        </div>
        <div className="mt-3 text-sm text-zinc-600">
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
          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 text-sm">
            {isAuthor ? (
              <Link
                href={`/posts/${post.id}/edit`}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-zinc-800 hover:bg-zinc-50"
              >
                수정
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void handleDeletePost()}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-red-700 hover:bg-red-50"
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
        className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-indigo-950">AI 추천 결과</h2>
          {post.ai_mode === "detailed" ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">
              상세 비교
            </span>
          ) : post.ai_mode === "simple" ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              간단
            </span>
          ) : null}
        </div>

        {showPublicAiUi ? (
          <>
            <p className="mt-1 text-sm text-indigo-900/85">
              질문 과정은 작성자만 볼 수 있어요. 완료된 추천만 공개됩니다.
            </p>
            {post.ai_recommended ? (
              <div
                className="mt-4 rounded-lg border border-indigo-100 bg-white p-4 text-zinc-800"
              >
                <p className="font-medium text-indigo-950">
                  추천: {post.ai_recommended}
                </p>
                {post.ai_reason ? (
                  <div className="mt-2 text-sm text-zinc-700">
                    <strong className="text-zinc-800">이유·비교</strong>
                    <div className="mt-1 whitespace-pre-wrap leading-relaxed">
                      {post.ai_reason}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-600">
                작성자가 아직 AI 추천을 완료하지 않았어요.
              </p>
            )}
          </>
        ) : showAuthorAiUi ? (
          <>
            <p className="mt-1 text-sm text-indigo-900/85">
              AI가 고민 본문을 바탕으로 질문을 이어 가요. 이 화면은 작성자(나)만 볼 수 있어요.
              {post.ai_mode === "detailed"
                ? " 상세 모드는 질문 5번 후, 선택지마다 비교 분석이 붙습니다."
                : " 간단 모드는 질문 3번 후 추천이에요."}
            </p>
            <div className="mt-4 border-t border-indigo-100 pt-4">
              {!aiState && !post.ai_recommended && (
                <button
                  type="button"
                  onClick={handleStartAI}
                  disabled={aiLoading}
                  style={{
                    padding: "10px 16px",
                    backgroundColor: "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  {aiLoading ? "AI 시작 중..." : "AI 질문 시작"}
                </button>
              )}

              {!aiState && post.ai_recommended && (
                <div
                  style={{
                    padding: 16,
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    backgroundColor: "#fff",
                  }}
                >
                  <p style={{ marginBottom: 8 }}>
                    <strong>AI 추천:</strong> {post.ai_recommended}
                  </p>
                  {post.ai_reason ? (
                    <div style={{ marginTop: 8 }}>
                      <strong>이유·비교</strong>
                      <div
                        className="mt-1 whitespace-pre-wrap text-sm leading-relaxed"
                        style={{ color: "#374151" }}
                      >
                        {post.ai_reason}
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleRestartAI}
                    disabled={aiLoading}
                    style={{
                      marginTop: 12,
                      padding: "10px 16px",
                      backgroundColor: "#4f46e5",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    AI 다시 실행
                  </button>
                </div>
              )}

              {aiError && (
                <p style={{ marginTop: 10, color: "#b91c1c" }}>
                  <strong>오류:</strong> {aiError}
                </p>
              )}

              {aiState?.type === "question" && (
                <div>
                  <p style={{ marginBottom: 12 }}>
                    <strong>질문 {aiState.step}:</strong> {aiState.question}
                  </p>

                  <textarea
                    value={aiAnswer}
                    onChange={(e) => setAiAnswer(e.target.value)}
                    placeholder="답변을 입력하세요"
                    style={{ width: "100%", minHeight: 80, padding: 10, marginBottom: 10 }}
                  />

                  <button
                    type="button"
                    onClick={handleNextAI}
                    disabled={aiLoading}
                    style={{
                      padding: "10px 16px",
                      backgroundColor: "#f59e0b",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    {aiLoading ? "다음 질문 생성 중..." : "다음"}
                  </button>
                  <button
                    type="button"
                    onClick={handleRestartAI}
                    disabled={aiLoading}
                    style={{
                      marginLeft: 10,
                      padding: "10px 16px",
                      backgroundColor: "#6b7280",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    다시 시작
                  </button>
                </div>
              )}

              {aiState?.type === "result" && (
                <div
                  style={{
                    padding: 16,
                    border: "1px solid #eee",
                    borderRadius: 8,
                    backgroundColor: "#f9fafb",
                  }}
                >
                  <p style={{ marginBottom: 8 }}>
                    <strong>AI 추천:</strong> {aiState.recommended}
                  </p>
                  {aiState.reason ? (
                    <div style={{ marginBottom: 8 }}>
                      <strong>이유·비교</strong>
                      <div
                        className="whitespace-pre-wrap text-sm leading-relaxed"
                        style={{ marginTop: 4, color: "#374151" }}
                      >
                        {aiState.reason}
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleRestartAI}
                    disabled={aiLoading}
                    style={{
                      marginTop: 12,
                      padding: "10px 16px",
                      backgroundColor: "#4f46e5",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
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
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">커뮤니티 투표</h2>
        <p className="mt-1 text-sm text-zinc-500">
          선택지에 투표해 다른 사람들의 의견을 모아요. AI 추천과는 다른 방식이에요.
        </p>

        {!meResolved && hasToken ? (
          <p style={{ marginBottom: 12, color: "#6b7280", fontSize: 14 }}>
            투표 가능 여부 확인 중…
          </p>
        ) : isAuthorForVote ? (
          <p style={{ marginBottom: 12, color: "#6b7280", fontSize: 14 }}>
            본인이 쓴 글에는 투표할 수 없어요.
          </p>
        ) : !hasToken ? (
          <p style={{ marginBottom: 12, color: "#666" }}>
            투표는{" "}
            <Link href="/login" style={{ color: "#4f46e5" }}>
              로그인
            </Link>
            후에 할 수 있어요. (계정당 이 글에 한 번만, 변경 불가)
          </p>
        ) : myVote ? (
          <p style={{ marginBottom: 12, color: "#374151" }}>
            <strong>내 투표:</strong> {myVote.selected_option}{" "}
            <span style={{ color: "#6b7280", fontSize: 14 }}>
              · 이미 투표했어요
            </span>
          </p>
        ) : (
          <p style={{ marginBottom: 12, color: "#666", fontSize: 14 }}>
            하나만 선택할 수 있어요. (투표 후에는 바꿀 수 없어요)
          </p>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={!!myVote || isAuthorForVote || !meResolved}
              onClick={() => handleVote(option)}
              style={{
                padding: "10px 16px",
                backgroundColor: myVote?.selected_option === option ? "#047857" : "#059669",
                color: "white",
                border:
                  myVote?.selected_option === option
                    ? "2px solid #fbbf24"
                    : "2px solid transparent",
                borderRadius: 8,
                cursor:
                  myVote || isAuthorForVote || !meResolved
                    ? "not-allowed"
                    : "pointer",
                opacity: myVote && myVote.selected_option !== option ? 0.55 : 1,
              }}
            >
              {option}
            </button>
          ))}
        </div>

        <h3 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>
          현재 투표 결과
        </h3>

        {voteCounts.length === 0 ? (
          <p>아직 투표가 없습니다.</p>
        ) : (
          voteCounts.map((vote) => (
            <div key={vote.option} style={{ marginBottom: 8 }}>
              <strong>{vote.option}</strong>: {vote.count}표
            </div>
          ))
        )}
      </section>

      <section
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">댓글 작성</h2>

        {!hasToken && (
          <p style={{ marginBottom: 10, color: "#666", fontSize: 14 }}>
            댓글은{" "}
            <Link href="/login" style={{ color: "#4f46e5" }}>
              로그인
            </Link>
            후 작성할 수 있어요.
          </p>
        )}

        <textarea
          value={commentInput}
          onChange={(e) => setCommentInput(e.target.value)}
          placeholder="댓글을 입력하세요"
          style={{ width: "100%", minHeight: 80, padding: 10, marginBottom: 10 }}
        />

        <button
          onClick={handleCreateComment}
          style={{
            padding: "10px 16px",
            backgroundColor: "#4f46e5",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          댓글 등록
        </button>
      </section>

      <section
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">댓글 목록</h2>

        {comments.length === 0 ? (
          <p>아직 댓글이 없습니다.</p>
        ) : (
          comments.map((comment) => {
            const isCommentAuthor =
              meId != null &&
              comment.user_id != null &&
              comment.user_id === meId;
            return (
              <div
                key={comment.id}
                className="border-b border-zinc-100 py-3 last:border-0"
              >
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
                        onClick={() => void handleSaveCommentEdit()}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCommentId(null)}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-zinc-800">{comment.content}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <span>{commentAuthorLabel(comment)}</span>
                      {meResolved && isCommentAuthor ? (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditComment(comment)}
                            className="text-indigo-600 hover:underline"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteComment(comment.id)}
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
                            onClick={() => void handleReportComment(comment.id)}
                            className="text-zinc-600 hover:underline"
                          >
                            신고
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleBlockUser(comment.user_id!)
                            }
                            className="text-zinc-600 hover:underline"
                          >
                            차단
                          </button>
                        </>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}