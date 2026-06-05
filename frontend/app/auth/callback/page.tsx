"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { notifyAuthSessionChanged, setStoredToken } from "@/lib/auth-storage";

function parseHashToken(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const token = params.get("access_token");
  return token?.trim() || null;
}

function OAuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("로그인 처리 중...");

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      setMessage(decodeURIComponent(error));
      return;
    }

    const token = parseHashToken();
    if (!token) {
      setMessage("로그인 토큰을 받지 못했어요. 다시 시도해 주세요.");
      return;
    }

    setStoredToken(token);
    notifyAuthSessionChanged();
    router.replace("/");
    router.refresh();
  }, [router, searchParams]);

  const errorParam = searchParams.get("error");
  const showBackLink = errorParam != null || message.includes("받지 못했");

  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
      {showBackLink ? (
        <Link
          href="/login"
          className="mt-4 text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300"
        >
          로그인으로 돌아가기
        </Link>
      ) : null}
    </main>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto py-16 text-center text-sm text-zinc-500">
          로그인 처리 중...
        </main>
      }
    >
      <OAuthCallbackInner />
    </Suspense>
  );
}
