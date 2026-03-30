"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { API_BASE_URL } from "@/lib/config";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setDevToken(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(
        typeof data.message === "string"
          ? data.message
          : "요청을 처리했습니다."
      );
      if (typeof data.reset_token === "string" && data.reset_token) {
        setDevToken(data.reset_token);
      }
    } catch {
      setMessage("요청에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">비밀번호 찾기</h1>
        <p className="mt-2 text-sm text-zinc-600">
          가입한 이메일을 입력하면 재설정 안내를 보냅니다. (실제 메일 발송은 서버
          설정에 따릅니다.)
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-zinc-700">
            이메일
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "처리 중..." : "재설정 링크 요청"}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-zinc-700">{message}</p>
        )}
        {devToken && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
            <strong>개발 모드 토큰</strong>
            <p className="mt-1 break-all font-mono">{devToken}</p>
            <p className="mt-2">
              <Link href="/reset-password" className="text-indigo-700 underline">
                비밀번호 재설정 페이지
              </Link>
              에서 위 토큰을 입력하세요.
            </p>
          </div>
        )}

        <p className="mt-6 text-sm">
          <Link href="/login" className="text-indigo-600 hover:underline">
            로그인
          </Link>
          {" · "}
          <Link href="/" className="text-zinc-500 hover:underline">
            홈
          </Link>
        </p>
      </div>
    </main>
  );
}
