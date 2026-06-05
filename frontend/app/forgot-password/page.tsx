"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthField } from "@/components/auth/AuthField";
import { AuthFormShell } from "@/components/auth/AuthFormShell";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { API_BASE_URL } from "@/lib/config";
import { AUTH_ACTION_FORGOT, AUTH_BTN_PRIMARY, AUTH_LINK } from "@/lib/auth-form-classes";
import { fetchWithTimeout, isAbortError } from "@/lib/fetch-with-timeout";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);
    setDevToken(null);
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        timeoutMs: 20000,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "요청을 처리하지 못했어요."
        );
      }
      setMessage(
        typeof data.message === "string"
          ? data.message
          : "요청을 접수했어요. 메일함을 확인해 주세요."
      );
      if (typeof data.reset_token === "string" && data.reset_token) {
        setDevToken(data.reset_token);
      }
    } catch (err) {
      setIsError(true);
      if (isAbortError(err)) {
        setMessage("서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
      } else {
        setMessage(
          err instanceof Error ? err.message : "요청에 실패했습니다."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormShell
      title="비밀번호 찾기"
      lead="가입할 때 사용한 이메일을 입력하면 재설정 안내를 보내 드려요."
    >
      <AuthNotice variant="info">
        메일 발송은 서버 설정에 따라 달라질 수 있어요. 개발 환경에서는 아래에
        재설정 토큰이 표시될 수 있습니다.
      </AuthNotice>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <AuthField
          id="forgot-email"
          label="이메일"
          type="email"
          autoComplete="email"
          placeholder="가입한 이메일 주소"
          value={email}
          onChange={setEmail}
          required
        />

        {message ? (
          <AuthNotice variant={isError ? "error" : "success"}>{message}</AuthNotice>
        ) : null}

        {devToken ? (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-3.5 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
            <p className="font-semibold text-amber-950 dark:text-amber-100">
              개발 모드 재설정 토큰
            </p>
            <p className="mt-2 break-all rounded-lg bg-white/80 px-2.5 py-2 font-mono text-xs text-amber-950 dark:bg-black/20 dark:text-amber-100">
              {devToken}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
              <Link href="/reset-password" className={AUTH_LINK}>
                비밀번호 재설정
              </Link>
              페이지에서 위 토큰을 붙여 넣으세요.
            </p>
          </div>
        ) : null}

        <button type="submit" disabled={loading} className={AUTH_BTN_PRIMARY}>
          {loading ? "요청 중..." : "재설정 안내 받기"}
        </button>

        <p className="pt-1 text-center text-xs text-zinc-500 dark:text-[#9bb3c7]">
          비밀번호가 기억나셨나요?
        </p>
        <Link href="/login" className={AUTH_ACTION_FORGOT}>
          로그인하기
        </Link>
      </form>
    </AuthFormShell>
  );
}
