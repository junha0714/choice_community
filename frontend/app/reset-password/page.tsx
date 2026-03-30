"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { API_BASE_URL } from "@/lib/config";

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromQuery = searchParams.get("token")?.trim() || "";

  const [token, setToken] = useState(tokenFromQuery);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== password2) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "재설정 실패"
        );
      }
      alert(data.message || "비밀번호가 재설정되었습니다.");
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "재설정 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">비밀번호 재설정</h1>
        <p className="mt-2 text-sm text-zinc-600">
          이메일로 받은 토큰(또는 개발 모드에서 표시된 토큰)과 새 비밀번호를
          입력하세요.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-zinc-700">
            재설정 토큰
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            새 비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            새 비밀번호 확인
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "처리 중..." : "비밀번호 변경"}
          </button>
        </form>

        <p className="mt-6 text-sm">
          <Link href="/login" className="text-indigo-600 hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-md">
          <p className="text-sm text-zinc-500">불러오는 중...</p>
        </main>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
