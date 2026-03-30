"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { setStoredToken } from "@/lib/auth-storage";
import { fetchWithTimeout, isAbortError } from "@/lib/fetch-with-timeout";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        timeoutMs: 20000,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "로그인에 실패했습니다.");
      }
      setStoredToken(data.access_token);
      router.push("/");
      router.refresh();
    } catch (err) {
      if (isAbortError(err)) {
        setError(
          "서버 응답이 없습니다. 백엔드(8000)와 DB 연결을 확인해 주세요."
        );
      } else {
        setError(err instanceof Error ? err.message : "로그인 실패");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">로그인</h1>
        <p className="mt-2 text-sm text-zinc-600">
        계정이 없으면{" "}
          <Link href="/register" className="text-indigo-600 hover:underline">
            회원가입
          </Link>
        </p>

      {registered && (
        <p
          className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          회원가입이 완료되었습니다. 로그인해 주세요.
        </p>
      )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-zinc-700">
            이메일
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            비밀번호
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </label>

        {error && (
            <p className="text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "처리 중..." : "로그인"}
        </button>
        </form>

        <p className="mt-5 text-sm text-zinc-600">
          <Link href="/forgot-password" className="text-indigo-600 hover:underline">
            비밀번호를 잊었나요?
          </Link>
          {" · "}
          <Link href="/" className="text-zinc-500 hover:underline">
            ← 홈으로
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-md">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            로딩 중...
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
