"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { AuthField } from "@/components/auth/AuthField";
import { AuthFormShell } from "@/components/auth/AuthFormShell";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { API_BASE_URL } from "@/lib/config";
import { AUTH_BTN_PRIMARY, AUTH_LINK } from "@/lib/auth-form-classes";
import { fetchWithTimeout, isAbortError } from "@/lib/fetch-with-timeout";

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
      setError("새 비밀번호가 서로 일치하지 않아요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 해요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
        timeoutMs: 20000,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "비밀번호를 재설정하지 못했어요."
        );
      }
      router.push("/login?registered=1");
    } catch (err) {
      if (isAbortError(err)) {
        setError("서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
      } else {
        setError(err instanceof Error ? err.message : "재설정에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormShell
      title="비밀번호 재설정"
      lead="이메일로 받은 토큰과 새 비밀번호를 입력해 주세요."
      footer={
        <p className="text-center text-sm text-zinc-600 dark:text-[#AFC6D8]">
          토큰이 없으신가요?{" "}
          <Link href="/forgot-password" className={AUTH_LINK}>
            비밀번호 찾기
          </Link>
          {" · "}
          <Link href="/login" className={AUTH_LINK}>
            로그인
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          id="reset-token"
          label="재설정 토큰"
          type="text"
          autoComplete="off"
          placeholder="메일 또는 안내에 적힌 토큰"
          value={token}
          onChange={setToken}
          required
          hint="개발 환경에서는 비밀번호 찾기 화면에 토큰이 표시돼요."
        />
        <AuthField
          id="reset-password"
          label="새 비밀번호"
          type="password"
          autoComplete="new-password"
          placeholder="8자 이상"
          value={password}
          onChange={setPassword}
          required
          minLength={8}
        />
        <AuthField
          id="reset-password-confirm"
          label="새 비밀번호 확인"
          type="password"
          autoComplete="new-password"
          placeholder="한 번 더 입력"
          value={password2}
          onChange={setPassword2}
          required
          minLength={8}
        />

        {error ? <AuthNotice variant="error">{error}</AuthNotice> : null}

        <button type="submit" disabled={loading} className={AUTH_BTN_PRIMARY}>
          {loading ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>
    </AuthFormShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-104 py-8 text-center text-sm text-zinc-500 dark:text-[#9bb3c7]">
          불러오는 중...
        </main>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
