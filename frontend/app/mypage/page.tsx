"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";

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
};

export default function MyPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserMe | null>(null);
  const [nickname, setNickname] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

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
      const me = await resMe.json();
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

  useEffect(() => {
    void load();
  }, []);

  const handleSaveNickname = async (e: FormEvent) => {
    e.preventDefault();
    const token = getStoredToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setSaving(true);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    const token = getStoredToken();
    if (!token) {
      router.push("/login");
      return;
    }
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
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : "변경 실패");
    } finally {
      setPwSaving(false);
    }
  };

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

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 text-zinc-900 dark:text-sky-100">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">마이페이지</h1>
        <Link href="/" className="text-sm text-zinc-600 hover:underline dark:text-sky-300/85">
          ← 홈
        </Link>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
        <h2 className="text-base font-semibold dark:text-white">프로필</h2>
        <p className="mt-3 text-sm text-zinc-800 dark:text-[#AFC6D8]">
          <strong>이메일:</strong> {user.email}
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-[#AFC6D8]/80">
          가입일: {new Date(user.created_at).toLocaleString("ko-KR")}
        </p>

        <form onSubmit={handleSaveNickname} className="mt-5 flex flex-col gap-3">
          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            닉네임
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임 (비우면 표시 안 함)"
              maxLength={50}
              className="mt-1 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
            />
          </label>
          <div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-900/20 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-400"
            >
              {saving ? "저장 중..." : "닉네임 저장"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
        <h2 className="text-base font-semibold dark:text-white">비밀번호 변경</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-[#AFC6D8]/85">
          로그인한 상태에서 현재 비밀번호를 알고 있을 때만 변경할 수 있어요.{" "}
          <Link href="/forgot-password" className="text-sky-700 hover:underline dark:text-sky-300">
            비밀번호를 잊었다면
          </Link>
        </p>
        <form
          onSubmit={handlePasswordChange}
          className="mt-4 flex max-w-md flex-col gap-3"
        >
          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            현재 비밀번호
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
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
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
            />
          </label>
          {pwMsg && (
            <p
              className={
                pwMsg.includes("실패") || pwMsg.includes("올바르지")
                  ? "text-sm text-red-700"
                  : "text-sm text-emerald-800"
              }
            >
              {pwMsg}
            </p>
          )}
          <button
            type="submit"
            disabled={pwSaving}
            className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-sky-500 dark:text-white dark:hover:bg-sky-400"
          >
            {pwSaving ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>
      </section>

      {user.is_admin ? (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-indigo-950">관리자</h2>
          <p className="mt-1 text-sm text-indigo-900/80">
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

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
        <h2 className="text-base font-semibold dark:text-white">내가 쓴 고민 글</h2>
        {posts.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-[#AFC6D8]/85">아직 작성한 글이 없어요.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 transition hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#1B2733] dark:hover:bg-sky-950/35"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-zinc-900 dark:text-white">{post.title}</span>
                  {(post.post_kind ?? "community") === "ai" ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-900 dark:bg-[#2b1f4a] dark:text-white">
                      AI
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 dark:bg-[#16283a] dark:text-[#4A90E2]">
                      투표
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-zinc-700 dark:text-[#AFC6D8]">
                  {post.category} · {post.options}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
