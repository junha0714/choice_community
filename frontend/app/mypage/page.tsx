"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import {
  AUTH_SESSION_EVENT,
  clearStoredToken,
  getStoredToken,
  notifyAuthSessionChanged,
} from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import { ProfileAvatar } from "@/components/ProfileAvatar";

type UserMe = {
  id: number;
  email: string;
  nickname: string | null;
  created_at: string;
  is_admin?: boolean;
};

type Post = {
  id: number;
  title: string;
  content: string;
  category: string;
  options: string;
  post_kind?: string;
  user_id?: number | null;
  author_nickname?: string | null;
  created_at: string;
  is_published?: boolean;
  ai_recommended?: string | null;
};

type MyConcernTab = "published" | "drafts" | "commented";
type AccountEdit = null | "nickname" | "password" | "delete";

const MY_CONCERN_TABS: { id: MyConcernTab; label: string }[] = [
  { id: "published", label: "공개한 글" },
  { id: "drafts", label: "임시저장" },
  { id: "commented", label: "댓글 단 글" },
];

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30";

function profileDisplayName(user: UserMe): string {
  const nick = user.nickname?.trim();
  if (nick) return nick;
  const local = user.email.split("@")[0]?.trim();
  return local || "회원";
}

function PostKindBadge({ postKind }: { postKind?: string }) {
  if ((postKind ?? "community") === "ai") {
    return (
      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-900 dark:bg-[#2b1f4a] dark:text-white">
        AI
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 dark:bg-[#16283a] dark:text-[#4A90E2]">
      투표
    </span>
  );
}

function ConcernPostCard({
  post,
  variant,
  showAuthor,
}: {
  post: Post;
  variant: "published" | "draft" | "commented";
  showAuthor?: boolean;
}) {
  const isDraft = variant === "draft";
  return (
    <Link
      href={`/posts/${post.id}`}
      className={[
        "block rounded-lg border px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-sky-950/35",
        isDraft
          ? "border-amber-200/90 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20"
          : "border-zinc-200 bg-white dark:border-[#223141] dark:bg-[#1B2733]",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-zinc-900 dark:text-white">{post.title}</span>
        {isDraft ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            임시저장
          </span>
        ) : null}
        <PostKindBadge postKind={post.post_kind} />
      </div>
      <div className="mt-1 text-sm text-zinc-700 dark:text-[#AFC6D8]">
        {showAuthor && post.author_nickname ? (
          <span>{post.author_nickname} · </span>
        ) : null}
        {post.category}
        {post.options ? ` · ${post.options}` : ""}
        {isDraft && (post.ai_recommended ?? "").trim()
          ? ` · 추천 ${post.ai_recommended}`
          : ""}
      </div>
    </Link>
  );
}

function AccountRow({
  label,
  value,
  onEdit,
  editing,
}: {
  label: string;
  value: string;
  onEdit?: () => void;
  editing?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-500 dark:text-[#8fa3b8]">{label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-zinc-900 dark:text-white">
          {value}
        </p>
      </div>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className={[
            "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
            editing
              ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#1B2733] dark:text-sky-100 dark:hover:bg-sky-950/35",
          ].join(" ")}
        >
          {editing ? "닫기" : "변경"}
        </button>
      ) : null}
    </div>
  );
}

export default function MyPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserMe | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [commentedPosts, setCommentedPosts] = useState<Post[]>([]);
  const [concernTab, setConcernTab] = useState<MyConcernTab>("published");
  const [loading, setLoading] = useState(true);
  const [commentedLoading, setCommentedLoading] = useState(false);
  const [commentedLoaded, setCommentedLoaded] = useState(false);
  const [error, setError] = useState("");

  const [accountEdit, setAccountEdit] = useState<AccountEdit>(null);
  const [nickname, setNickname] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [deletePw, setDeletePw] = useState("");
  const [deleteSaving, setDeleteSaving] = useState(false);

  const publishedPosts = useMemo(
    () => posts.filter((p) => p.is_published !== false),
    [posts]
  );
  const draftPosts = useMemo(
    () => posts.filter((p) => p.is_published === false),
    [posts]
  );

  const load = async () => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setError("");
    try {
      const [resMe, resPosts] = await Promise.all([
        fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/posts/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (resMe.status === 401) {
        router.replace("/login");
        return;
      }
      if (!resMe.ok) {
        throw new Error("프로필을 불러오지 못했습니다.");
      }
      const me = (await resMe.json()) as UserMe;
      setUser(me);
      setNickname(me.nickname ?? "");
      if (resPosts.ok) {
        setPosts(await resPosts.json());
      } else {
        setPosts([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  };

  const loadCommentedPosts = async () => {
    const token = getStoredToken();
    if (!token) return;
    setCommentedLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts/me/commented`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCommentedPosts(await res.json());
      } else {
        setCommentedPosts([]);
      }
      setCommentedLoaded(true);
    } finally {
      setCommentedLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (concernTab === "commented" && !commentedLoaded && !commentedLoading) {
      void loadCommentedPosts();
    }
  }, [concernTab, commentedLoaded, commentedLoading]);

  const toggleAccountEdit = (field: Exclude<AccountEdit, null>) => {
    setAccountEdit((prev) => (prev === field ? null : field));
    setPwMsg("");
    setError("");
  };

  const handleSaveNickname = async (e: FormEvent) => {
    e.preventDefault();
    setNicknameSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "저장 실패"
        );
      }
      setUser(data);
      setNickname(data.nickname ?? "");
      setAccountEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setNicknameSaving(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) {
      setPwMsg("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    setPwSaving(true);
    setPwMsg("");
    try {
      const res = await fetch(`${API_BASE_URL}/auth/password`, {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          current_password: currentPw,
          new_password: newPw,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "변경 실패"
        );
      }
      setPwMsg(typeof data.message === "string" ? data.message : "변경되었습니다.");
      setCurrentPw("");
      setNewPw("");
      setAccountEdit(null);
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : "변경 실패");
    } finally {
      setPwSaving(false);
    }
  };

  const handleLogout = () => {
    clearStoredToken();
    notifyAuthSessionChanged();
    window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
    router.push("/");
    router.refresh();
  };

  const handleDeleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm("정말 탈퇴할까요? 작성한 글과 데이터는 복구할 수 없어요.")) {
      return;
    }
    setDeleteSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "DELETE",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ password: deletePw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "탈퇴 실패"
        );
      }
      clearStoredToken();
      notifyAuthSessionChanged();
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "탈퇴 실패");
    } finally {
      setDeleteSaving(false);
    }
  };

  const activePosts =
    concernTab === "published"
      ? publishedPosts
      : concernTab === "drafts"
        ? draftPosts
        : commentedPosts;

  const emptyMessage =
    concernTab === "published"
      ? "아직 공개한 글이 없어요."
      : concernTab === "drafts"
        ? "임시저장된 글이 없어요."
        : commentedLoading
          ? "불러오는 중..."
          : "댓글을 단 글이 없어요.";

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-3xl text-zinc-900 dark:text-sky-100">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
          불러오는 중...
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-3xl text-zinc-900 dark:text-sky-100">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
          <p className="text-sm text-zinc-700 dark:text-[#AFC6D8]">
            {error || "로그인이 필요합니다."}
          </p>
          <Link href="/login" className="mt-3 inline-block text-sky-700 hover:underline dark:text-sky-300">
            로그인
          </Link>
        </div>
      </main>
    );
  }

  const displayName = profileDisplayName(user);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 text-zinc-900 dark:text-sky-100">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">마이페이지</h1>
        {user.is_admin ? (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">
            관리자
          </span>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-[#223141] dark:bg-[#16202A] sm:p-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">계정</h2>

        <div className="mt-4 flex items-center gap-4 border-b border-zinc-100 pb-4 dark:border-[#223141]">
          <ProfileAvatar size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-zinc-900 dark:text-white">
              {displayName}
            </p>
            <p className="mt-0.5 truncate text-sm text-zinc-600 dark:text-[#9bb3c7]">
              {user.email}
            </p>
            <button
              type="button"
              disabled
              title="프로필 사진 변경은 곧 추가될 예정이에요"
              className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-400 dark:border-[#223141] dark:bg-zinc-900/50 dark:text-zinc-500"
            >
              프로필 사진 변경 (준비 중)
            </button>
          </div>
        </div>

        <div className="mt-3 divide-y divide-zinc-100 dark:divide-[#223141]">
          <AccountRow
            label="닉네임"
            value={user.nickname?.trim() || "닉네임 없음"}
            onEdit={() => toggleAccountEdit("nickname")}
            editing={accountEdit === "nickname"}
          />
          {accountEdit === "nickname" ? (
            <form onSubmit={handleSaveNickname} className="py-3">
              <label className="block text-sm font-medium text-zinc-800 dark:text-white">
                새 닉네임
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="닉네임 (비우면 표시 안 함)"
                  maxLength={50}
                  className={inputClass}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={nicknameSaving}
                  className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-400"
                >
                  {nicknameSaving ? "저장 중..." : "저장"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNickname(user.nickname ?? "");
                    setAccountEdit(null);
                  }}
                  className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#1B2733] dark:text-sky-100 dark:hover:bg-sky-950/35"
                >
                  취소
                </button>
              </div>
            </form>
          ) : null}

          <AccountRow label="이메일" value={user.email} />

          <AccountRow
            label="비밀번호"
            value="••••••••"
            onEdit={() => toggleAccountEdit("password")}
            editing={accountEdit === "password"}
          />
          {accountEdit === "password" ? (
            <form onSubmit={handlePasswordChange} className="space-y-3 py-3">
              <label className="block text-sm font-medium text-zinc-800 dark:text-white">
                현재 비밀번호
                <input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  autoComplete="current-password"
                  className={inputClass}
                />
              </label>
              <label className="block text-sm font-medium text-zinc-800 dark:text-white">
                새 비밀번호 (8자 이상)
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  className={inputClass}
                />
              </label>
              {pwMsg ? (
                <p
                  className={
                    pwMsg.includes("실패") || pwMsg.includes("올바르지")
                      ? "text-sm text-red-700 dark:text-red-300"
                      : "text-sm text-emerald-800 dark:text-emerald-300"
                  }
                >
                  {pwMsg}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-400"
                >
                  {pwSaving ? "변경 중..." : "비밀번호 변경"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentPw("");
                    setNewPw("");
                    setPwMsg("");
                    setAccountEdit(null);
                  }}
                  className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#1B2733] dark:text-sky-100 dark:hover:bg-sky-950/35"
                >
                  취소
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-[#223141]">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#1B2733] dark:text-sky-100 dark:hover:bg-sky-950/35"
          >
            로그아웃
          </button>
          <button
            type="button"
            onClick={() => toggleAccountEdit("delete")}
            className="rounded-lg border border-red-200/80 bg-red-50/50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100/60 dark:border-red-900/40 dark:bg-red-950/25 dark:text-red-200 dark:hover:bg-red-950/40"
          >
            {accountEdit === "delete" ? "회원 탈퇴 닫기" : "회원 탈퇴"}
          </button>
        </div>

        {accountEdit === "delete" ? (
          <form
            onSubmit={handleDeleteAccount}
            className="mt-4 rounded-lg border border-red-200/80 bg-red-50/50 p-4 dark:border-red-900/40 dark:bg-red-950/20"
          >
            <p className="text-xs text-red-800/90 dark:text-red-200/80">
              탈퇴하면 작성 글·댓글·AI 기록이 삭제되며 복구할 수 없어요.
            </p>
            <label className="mt-3 block text-sm font-medium text-red-950 dark:text-red-100">
              비밀번호 확인
              <input
                type="password"
                value={deletePw}
                onChange={(e) => setDeletePw(e.target.value)}
                autoComplete="current-password"
                className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200/70 dark:border-red-900/50 dark:bg-zinc-950/40 dark:text-white"
              />
            </label>
            <button
              type="submit"
              disabled={deleteSaving || !deletePw}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteSaving ? "처리 중..." : "탈퇴하기"}
            </button>
          </form>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
        <h2 className="text-base font-semibold dark:text-white">내 고민</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-[#AFC6D8]/85">
          공개한 글, 임시저장, 댓글 단 글을 나눠서 볼 수 있어요.
        </p>

        <div
          className="mt-4 flex flex-wrap gap-1.5 rounded-xl border border-zinc-200/90 bg-zinc-100/80 p-1.5 dark:border-[#223141] dark:bg-zinc-900/50"
          role="tablist"
          aria-label="내 고민 목록"
        >
          {MY_CONCERN_TABS.map((tab) => {
            const selected = concernTab === tab.id;
            const count =
              tab.id === "published"
                ? publishedPosts.length
                : tab.id === "drafts"
                  ? draftPosts.length
                  : commentedPosts.length;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setConcernTab(tab.id)}
                className={[
                  "inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition sm:flex-none",
                  selected
                    ? "bg-white text-indigo-900 shadow-sm dark:bg-[#1B2733] dark:text-indigo-100"
                    : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-[#AFC6D8] dark:hover:bg-[#16202A] dark:hover:text-white",
                ].join(" ")}
              >
                {tab.label}
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    selected
                      ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"
                      : "bg-zinc-200/80 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                  ].join(" ")}
                >
                  {tab.id === "commented" && commentedLoading ? "…" : count}
                </span>
              </button>
            );
          })}
        </div>

        {concernTab === "drafts" ? (
          <p className="mt-3 text-xs text-amber-800/90 dark:text-amber-200/80">
            AI 결과는 먼저 임시저장되고, 게시하기를 누르면 공개한 글 탭으로 옮겨져요.
          </p>
        ) : null}

        {activePosts.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-[#AFC6D8]/85">{emptyMessage}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {activePosts.map((post) => (
              <ConcernPostCard
                key={post.id}
                post={post}
                variant={concernTab === "drafts" ? "draft" : concernTab === "commented" ? "commented" : "published"}
                showAuthor={concernTab === "commented"}
              />
            ))}
          </div>
        )}
      </section>

      {user.is_admin ? (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm dark:border-indigo-900/40 dark:bg-indigo-950/25">
          <h2 className="text-base font-semibold text-indigo-950 dark:text-indigo-100">관리자</h2>
          <p className="mt-1 text-sm text-indigo-900/80 dark:text-indigo-200/80">
            신고 처리·사용자 제한·글 숨김은 관리자 페이지에서 할 수 있어요.
          </p>
          <Link
            href="/admin"
            className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            관리자 페이지
          </Link>
        </section>
      ) : null}
    </main>
  );
}
