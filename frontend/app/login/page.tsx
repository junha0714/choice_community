"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { AuthField } from "@/components/auth/AuthField";
import { AuthFormShell } from "@/components/auth/AuthFormShell";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";
import { API_BASE_URL } from "@/lib/config";
import { notifyAuthSessionChanged, setStoredToken } from "@/lib/auth-storage";
import {
  AUTH_ACTION_FORGOT,
  AUTH_ACTION_REGISTER,
  AUTH_BTN_PRIMARY,
} from "@/lib/auth-form-classes";
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
        throw new Error(data.detail || "이메일 또는 비밀번호를 확인해 주세요.");
      }
      setStoredToken(data.access_token);
      notifyAuthSessionChanged();
      router.push("/");
      router.refresh();
    } catch (err) {
      if (isAbortError(err)) {
        setError(
          "서버에 연결할 수 없어요. 백엔드가 실행 중인지 확인해 주세요."
        );
      } else {
        setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormShell
      title="로그인"
      lead="고민 글쓰기, 투표, AI 대화를 이어가려면 로그인해 주세요."
      banner={
        registered ? (
          <AuthNotice variant="success">
            회원가입이 완료되었어요. 이제 로그인하면 됩니다.
          </AuthNotice>
        ) : null
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          id="login-email"
          label="이메일"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={setEmail}
          required
        />

        <div>
          <label htmlFor="login-password" className="text-sm font-medium text-zinc-800 dark:text-[#d8e4ef]">
            비밀번호
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호 입력"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-300/60 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/50 dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
          />
        </div>

        {error ? <AuthNotice variant="error">{error}</AuthNotice> : null}

        <button type="submit" disabled={loading} className={AUTH_BTN_PRIMARY}>
          {loading ? "로그인 중..." : "로그인"}
        </button>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <Link href="/forgot-password" className={AUTH_ACTION_FORGOT}>
            비밀번호 찾기
          </Link>
          <Link href="/register" className={AUTH_ACTION_REGISTER}>
            회원가입
          </Link>
        </div>
      </form>

      <div className="mt-6">
        <SocialLoginButtons />
      </div>
    </AuthFormShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-[26rem] py-8 text-center text-sm text-zinc-500 dark:text-[#9bb3c7]">
          불러오는 중...
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
