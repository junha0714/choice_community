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
import { AppNotice } from "@/components/AppNotice";
import { CategoryLabel } from "@/components/CategoryLabel";
import { messageFromApiDetail } from "@/lib/api-message";
import { isBoardCategory, isNoticeCategory } from "@/lib/board-categories";
import { categoryDisplayName } from "@/lib/categories";
import { formatPostDateLabel } from "@/lib/format-datetime";
import { CARD_STRONG, LIST_PANEL } from "@/lib/ui-classes";
import { toast } from "@/lib/toast";

type UserMe = {
  id: number;
  email: string;
  nickname: string | null;
  created_at: string;
  is_admin?: boolean;
  auth_provider?: string;
  has_password?: boolean;
};

function authProviderLabel(provider: string | undefined): string {
  switch ((provider || "email").trim().toLowerCase()) {
    case "google":
      return "Google";
    case "kakao":
      return "카카오";
    default:
      return "이메일";
  }
}

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
  is_published?: boolean;
  ai_recommended?: string | null;
};

type BlockedUser = {
  id: number;
  blocked_id: number;
  blocked_nickname: string | null;
  created_at: string;
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

const MYPAGE_OWNED_GRID =
  "grid grid-cols-[minmax(6.25rem,6.75rem)_minmax(0,1fr)_minmax(3.5rem,4rem)_minmax(2.5rem,3rem)_minmax(2.25rem,2.75rem)_minmax(2.25rem,2.75rem)] items-center gap-1.5 md:gap-2";

const MYPAGE_COMMENTED_GRID =
  "grid grid-cols-[minmax(6.25rem,6.75rem)_minmax(0,1fr)_minmax(3.5rem,4.5rem)_minmax(3.5rem,4rem)_minmax(2.5rem,3rem)_minmax(2.25rem,2.75rem)_minmax(2.25rem,2.75rem)] items-center gap-1.5 md:gap-2";

function fmtNumber(n: number | null | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("ko-KR").format(v);
}

function hasPostImage(post: Pick<Post, "content">): boolean {
  return /!\[[^\]]*]\([^)]+\)/.test(post.content);
}

function authorLabel(post: Post): string {
  if (post.author_nickname) return post.author_nickname;
  if (post.user_id != null) return `사용자 #${post.user_id}`;
  return "익명";
}

function MyPostsBoardList({
  posts,
  mode,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  posts: Post[];
  mode: "owned" | "commented";
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
}) {
  const allSelected = posts.length > 0 && posts.every((p) => selectedIds.has(p.id));
  const desktopGrid =
    mode === "owned" ? MYPAGE_OWNED_GRID : MYPAGE_COMMENTED_GRID;

  const headerCells = (
    <>
      <div className="truncate">카테고리</div>
      <div className="truncate text-left">제목</div>
      {mode === "commented" ? (
        <div className="truncate text-right">글쓴이</div>
      ) : null}
      <div className="truncate text-right">날짜</div>
      <div className="truncate text-right">조회</div>
      <div className="truncate text-right">좋아요</div>
      <div className="truncate text-right">투표</div>
    </>
  );

  return (
    <>
      <div
        className={`hidden px-4 py-2 text-[11px] font-semibold text-zinc-500 dark:text-[#94a3b8] sm:block ${CARD_STRONG}`}
      >
        {mode === "owned" ? (
          <div className="flex items-center gap-2">
            <div className="flex w-9 shrink-0 justify-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label="전체 선택"
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500/40 dark:border-[#334155]"
              />
            </div>
            <div className={`min-w-0 flex-1 ${desktopGrid}`}>{headerCells}</div>
          </div>
        ) : (
          <div className={desktopGrid}>{headerCells}</div>
        )}
      </div>

      <ul className={`list-none p-0 ${LIST_PANEL}`}>
        {posts.map((post) => {
          const kind = (post.post_kind ?? "community") as string;
          const isAi = kind === "ai";
          const isDraft = post.is_published === false;
          const isNotice =
            post.is_notice === true || isNoticeCategory(post.category);
          const isBoard =
            post.is_board_post === true || isBoardCategory(post.category);
          const selected = selectedIds.has(post.id);

          return (
            <li key={post.id}>
              <div
                className={[
                  "flex items-stretch px-4 py-3.5 transition sm:py-3",
                  "hover:bg-sky-50/75 dark:hover:bg-sky-950/30",
                  selected ? "bg-sky-50/50 dark:bg-sky-950/20" : "",
                ].join(" ")}
              >
                {mode === "owned" ? (
                  <label className="mr-3 flex shrink-0 items-center self-center sm:mr-2">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleSelect(post.id)}
                      aria-label={`${post.title} 선택`}
                      className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500/40 dark:border-[#334155]"
                    />
                  </label>
                ) : null}

                <Link
                  href={`/posts/${post.id}`}
                  className={[
                    "group min-w-0 focus-visible:outline-none",
                    mode === "owned" ? "flex-1" : "w-full",
                  ].join(" ")}
                >
                  <div className="sm:hidden">
                    <div className="flex min-w-0 flex-nowrap items-center gap-x-1.5 overflow-hidden text-[11px]">
                      <span className="min-w-0 flex-1 truncate font-medium text-zinc-600 dark:text-[#9bb3c7]">
                        <CategoryLabel category={post.category} />
                      </span>
                      {isDraft ? (
                        <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">
                          임시저장
                        </span>
                      ) : null}
                      {isNotice ? (
                        <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">
                          공지
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
                      {mode === "commented" ? (
                        <>
                          <span className="font-medium text-zinc-700 dark:text-sky-200/90">
                            {authorLabel(post)}
                          </span>
                          <span className="text-zinc-300 dark:text-sky-800/80">·</span>
                        </>
                      ) : null}
                      <span className="tabular-nums">
                        {formatPostDateLabel(post.created_at)}
                      </span>
                      <span className="text-zinc-300 dark:text-sky-800/80">·</span>
                      <span className="tabular-nums">
                        조회 {fmtNumber(post.view_count)} · ♥ {fmtNumber(post.like_count)}
                        {!isBoard ? (
                          <> · 투표 {fmtNumber(post.vote_count)}</>
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

                  <div className="hidden sm:block">
                    <div className={`${desktopGrid} overflow-hidden`}>
                      <div className="min-w-0 overflow-hidden">
                        <div className="flex min-w-0 flex-nowrap items-center gap-x-1.5 text-[11px]">
                          <span className="shrink-0 whitespace-nowrap font-medium text-zinc-600 dark:text-[#9bb3c7]">
                            {categoryDisplayName(post.category)}
                          </span>
                          {isDraft ? (
                            <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">
                              임시저장
                            </span>
                          ) : null}
                          {isNotice ? (
                            <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">
                              공지
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
                              <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                aria-hidden
                              >
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
                              <span className="ml-1 text-[11px] font-semibold text-zinc-500 dark:text-[#9bb3c8] tabular-nums">
                                [{post.comment_count}]
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </div>

                      {mode === "commented" ? (
                        <div className="truncate text-right text-[11px] text-zinc-500 dark:text-[#9bb3c7]">
                          {authorLabel(post)}
                        </div>
                      ) : null}
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
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function AccountRow({
  label,
  value,
  onEdit,
  editing,
  editActionLabel,
}: {
  label: string;
  value: string;
  onEdit?: () => void;
  editing?: boolean;
  editActionLabel?: string;
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
          {editing ? "닫기" : editActionLabel ?? "변경"}
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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
      const [resMe, resPosts, resBlocks] = await Promise.all([
        fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/posts/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/users/blocks`, {
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
      if (resBlocks.ok) {
        const rows = (await resBlocks.json()) as BlockedUser[];
        setBlockedUsers(Array.isArray(rows) ? rows : []);
      } else {
        setBlockedUsers([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
      setBlocksLoading(false);
    }
  };

  const handleUnblock = async (blockedUserId: number) => {
    if (!confirm("차단을 해제할까요? 이 사용자의 글이 다시 보여요.")) return;
    setUnblockingId(blockedUserId);
    try {
      const res = await fetch(`${API_BASE_URL}/users/blocks/${blockedUserId}`, {
        method: "DELETE",
        headers: jsonAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(messageFromApiDetail(data.detail, "차단 해제에 실패했습니다."));
        return;
      }
      setBlockedUsers((prev) => prev.filter((b) => b.blocked_id !== blockedUserId));
      toast.success("차단을 해제했습니다.");
    } finally {
      setUnblockingId(null);
    }
  };

  const blockedUserLabel = (row: BlockedUser) => {
    const nick = row.blocked_nickname?.trim();
    if (nick) return nick;
    return `사용자 #${row.blocked_id}`;
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

  useEffect(() => {
    setSelectedPostIds(new Set());
  }, [concernTab]);

  const canBulkDelete = concernTab === "published" || concernTab === "drafts";

  const togglePostSelect = (id: number) => {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      toast.success("닉네임을 저장했어요.");
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
      setUser((u) => (u ? { ...u, has_password: true } : u));
      setCurrentPw("");
      setNewPw("");
      setAccountEdit(null);
      toast.success(
        typeof data.message === "string" ? data.message : "비밀번호를 저장했어요."
      );
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
    if (user?.has_password && !deletePw.trim()) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    if (!user?.has_password && !deleteConfirm) {
      setError("탈퇴 확인에 체크해 주세요.");
      return;
    }
    if (!window.confirm("정말 탈퇴할까요? 작성한 글과 데이터는 복구할 수 없어요.")) {
      return;
    }
    setDeleteSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "DELETE",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ password: user?.has_password ? deletePw : "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "탈퇴 실패"
        );
      }
      clearStoredToken();
      notifyAuthSessionChanged();
      toast.success("회원 탈퇴가 완료되었어요.");
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

  const toggleSelectAllPosts = () => {
    setSelectedPostIds((prev) => {
      if (activePosts.length > 0 && activePosts.every((p) => prev.has(p.id))) {
        return new Set();
      }
      return new Set(activePosts.map((p) => p.id));
    });
  };

  const handleBulkDeletePosts = async () => {
    if (selectedPostIds.size === 0) return;
    const ids = [...selectedPostIds];
    if (
      !confirm(
        `선택한 ${ids.length}개 글을 삭제할까요?\n삭제한 글은 복구할 수 없어요.`
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`${API_BASE_URL}/posts/${id}`, {
            method: "DELETE",
            headers: jsonAuthHeaders(),
          });
          return { id, ok: res.ok };
        })
      );
      const deleted = results.filter((r) => r.ok).map((r) => r.id);
      const failed = results.length - deleted.length;
      if (deleted.length > 0) {
        setPosts((prev) => prev.filter((p) => !deleted.includes(p.id)));
        setSelectedPostIds((prev) => {
          const next = new Set(prev);
          for (const id of deleted) next.delete(id);
          return next;
        });
      }
      if (failed === 0) {
        toast.success(`${deleted.length}개 글을 삭제했습니다.`);
      } else if (deleted.length > 0) {
        toast.warning(`${deleted.length}개 삭제, ${failed}개 실패했습니다.`);
      } else {
        toast.error("글 삭제에 실패했습니다.");
      }
    } finally {
      setBulkDeleting(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl text-zinc-900 dark:text-sky-100">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
          불러오는 중...
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-5xl text-zinc-900 dark:text-sky-100">
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
    <main className="mx-auto w-full max-w-5xl space-y-6 text-zinc-900 dark:text-sky-100">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">마이페이지</h1>
        {user.is_admin ? (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">
            관리자
          </span>
        ) : null}
      </div>

      {error ? <AppNotice variant="error">{error}</AppNotice> : null}

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
            <p className="mt-1 text-xs text-zinc-500 dark:text-[#8fa3b8]">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300">
                {authProviderLabel(user.auth_provider)} 로그인
              </span>
            </p>
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
            label="로그인 방식"
            value={`${authProviderLabel(user.auth_provider)} 로그인`}
          />

          <AccountRow
            label="비밀번호"
            value={user.has_password ? "••••••••" : "아직 설정하지 않음"}
            onEdit={() => toggleAccountEdit("password")}
            editing={accountEdit === "password"}
            editActionLabel={user.has_password ? "변경" : "설정"}
          />
          {accountEdit === "password" ? (
            <form onSubmit={handlePasswordChange} className="space-y-3 py-3">
              {user.has_password ? (
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
              ) : (
                <p className="text-xs leading-relaxed text-zinc-600 dark:text-[#9bb3c7]">
                  소셜 로그인 계정에도 비밀번호를 설정하면 이메일로 로그인할 수 있어요.
                </p>
              )}
              <label className="block text-sm font-medium text-zinc-800 dark:text-white">
                {user.has_password ? "새 비밀번호 (8자 이상)" : "비밀번호 (8자 이상)"}
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
                  {pwSaving
                    ? "저장 중..."
                    : user.has_password
                      ? "비밀번호 변경"
                      : "비밀번호 설정"}
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
            {user.has_password ? (
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
            ) : (
              <label className="mt-3 flex items-start gap-2 text-sm text-red-950 dark:text-red-100">
                <input
                  type="checkbox"
                  checked={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-400"
                />
                <span>탈퇴에 동의하며, 데이터가 삭제됨을 이해했어요.</span>
              </label>
            )}
            <button
              type="submit"
              disabled={
                deleteSaving || (user.has_password ? !deletePw : !deleteConfirm)
              }
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteSaving ? "처리 중..." : "탈퇴하기"}
            </button>
          </form>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-[#223141] dark:bg-[#16202A] sm:p-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
          차단한 사용자
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-[#AFC6D8]/85">
          차단한 사용자의 글과 댓글은 게시판·글 상세에서 보이지 않아요.
        </p>
        {blocksLoading ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-[#94a3b8]">불러오는 중...</p>
        ) : blockedUsers.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-[#AFC6D8]/85">
            차단한 사용자가 없어요.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-[#223141]">
            {blockedUsers.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900 dark:text-white">
                    {blockedUserLabel(row)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-[#8fa3b8]">
                    차단일 {formatPostDateLabel(row.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleUnblock(row.blocked_id)}
                  disabled={unblockingId === row.blocked_id}
                  className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#223141] dark:bg-[#1B2733] dark:text-sky-100 dark:hover:bg-sky-950/35"
                >
                  {unblockingId === row.blocked_id ? "해제 중…" : "차단 해제"}
                </button>
              </li>
            ))}
          </ul>
        )}
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

        {canBulkDelete && activePosts.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500 dark:text-[#8fa3b8]">
              {selectedPostIds.size > 0
                ? `${selectedPostIds.size}개 선택됨`
                : "삭제할 글을 선택해 주세요."}
            </p>
            <button
              type="button"
              onClick={() => void handleBulkDeletePosts()}
              disabled={selectedPostIds.size === 0 || bulkDeleting}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/45 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
            >
              {bulkDeleting ? "삭제 중…" : "선택 삭제"}
            </button>
          </div>
        ) : null}

        {activePosts.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-[#AFC6D8]/85">{emptyMessage}</p>
        ) : (
          <div className="mt-4">
            <MyPostsBoardList
              posts={activePosts}
              mode={concernTab === "commented" ? "commented" : "owned"}
              selectedIds={selectedPostIds}
              onToggleSelect={togglePostSelect}
              onToggleSelectAll={toggleSelectAllPosts}
            />
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
