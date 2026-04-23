"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { fetchWithTimeout, isAbortError } from "@/lib/fetch-with-timeout";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          nickname: nickname.trim() || null,
        }),
        timeoutMs: 20000,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join(" ")
          : typeof detail === "string"
            ? detail
            : "회원가입에 실패했습니다.";
        throw new Error(msg);
      }
      router.push("/login?registered=1");
    } catch (err) {
      if (isAbortError(err)) {
        setError(
          "서버 응답이 없습니다. FastAPI(보통 8000번)가 켜져 있는지, PostgreSQL이 실행 중인지 확인해 주세요."
        );
      } else {
        setError(err instanceof Error ? err.message : "회원가입 실패");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          회원가입
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-[#AFC6D8]">
          이미 계정이 있으면{" "}
          <Link href="/login" className="text-indigo-700 hover:underline dark:text-indigo-200">
            로그인
          </Link>
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-zinc-700 dark:text-[#AFC6D8]">
            이메일
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700 dark:text-[#AFC6D8]">
            비밀번호 (8자 이상)
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700 dark:text-[#AFC6D8]">
            닉네임 (선택)
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={50}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
            />
          </label>

          {error && <p className="text-sm text-red-700 dark:text-red-200">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500/90 dark:hover:bg-emerald-400/90"
          >
            {loading ? "처리 중..." : "가입하기"}
          </button>
        </form>

        <p className="mt-5 text-sm text-zinc-600 dark:text-[#AFC6D8]">
          <Link href="/" className="text-zinc-600 hover:underline dark:text-sky-300/80">
            ← 홈으로
          </Link>
        </p>
      </div>
    </main>
  );
}
