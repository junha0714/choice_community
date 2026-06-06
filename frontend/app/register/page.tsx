"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthField } from "@/components/auth/AuthField";
import { AuthFormShell } from "@/components/auth/AuthFormShell";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";
import { API_BASE_URL } from "@/lib/config";
import { AUTH_ACTION_LOGIN, AUTH_BTN_PRIMARY } from "@/lib/auth-form-classes";
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
          "서버에 연결할 수 없어요. 백엔드와 DB가 실행 중인지 확인해 주세요."
        );
      } else {
        setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormShell
      title="회원가입"
      lead="이메일 가입 또는 소셜 계정으로 바로 시작할 수 있어요."
    >
      <ul className="space-y-1.5 text-xs leading-relaxed text-zinc-600 dark:text-[#9bb3c7]">
        <li className="flex gap-2">
          <span className="font-semibold text-sky-600 dark:text-sky-400">1.</span>
          <span>이메일로 계정을 만들거나 Google·카카오로 빠르게 가입할 수 있어요</span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-sky-600 dark:text-sky-400">2.</span>
          <span>닉네임은 나중에 마이페이지에서도 바꿀 수 있어요</span>
        </li>
      </ul>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <AuthField
          id="register-email"
          label="이메일"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={setEmail}
          required
        />
        <AuthField
          id="register-password"
          label="비밀번호"
          type="password"
          autoComplete="new-password"
          placeholder="8자 이상"
          value={password}
          onChange={setPassword}
          required
          minLength={8}
          hint="영문·숫자를 섞어 8자 이상 입력해 주세요."
        />
        <AuthField
          id="register-nickname"
          label="닉네임 (선택)"
          type="text"
          autoComplete="nickname"
          placeholder="게시판에 표시될 이름"
          value={nickname}
          onChange={setNickname}
          maxLength={50}
          hint="비워 두면 닉네임 없이 활동할 수 있어요."
        />

        {error ? <AuthNotice variant="error">{error}</AuthNotice> : null}

        <button type="submit" disabled={loading} className={AUTH_BTN_PRIMARY}>
          {loading ? "가입 중..." : "가입하기"}
        </button>

        <p className="pt-1 text-center text-xs text-zinc-500 dark:text-[#9bb3c7]">
          이미 계정이 있으신가요?
        </p>
        <Link href="/login" className={AUTH_ACTION_LOGIN}>
          로그인하기
        </Link>
      </form>

      <div className="mt-6">
        <SocialLoginButtons />
      </div>
    </AuthFormShell>
  );
}
