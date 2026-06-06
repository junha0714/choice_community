"use client";

import { useEffect, useState } from "react";
import { fetchOAuthProviders, oauthStartUrl } from "@/lib/oauth";
import { toast } from "@/lib/toast";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
      <path
        fill="currentColor"
        d="M12 3C7.03 3 3 6.13 3 9.75c0 2.28 1.52 4.27 3.8 5.4-.15.54-.55 1.96-.63 2.27-.1.38.14.37.29.27.12-.08 1.93-1.31 2.72-1.84.55.08 1.12.12 1.71.12 4.97 0 9-3.13 9-6.75S16.97 3 12 3z"
      />
    </svg>
  );
}

type SocialLoginButtonsProps = {
  onUnavailable?: (provider: "google" | "kakao") => void;
};

export function SocialLoginButtons({ onUnavailable }: SocialLoginButtonsProps) {
  const [providers, setProviders] = useState({ google: false, kakao: false });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchOAuthProviders().then((data) => {
      if (!cancelled) {
        setProviders(data);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = (provider: "google" | "kakao") => {
    if (!providers[provider]) {
      if (onUnavailable) {
        onUnavailable(provider);
        return;
      }
      toast.warning(provider === "google" ? "Google 로그인 설정이 필요해요. backend/.env에 GOOGLE_* 값을 추가해 주세요." : "카카오 로그인 설정이 필요해요. backend/.env에 KAKAO_* 값을 추가해 주세요.");
      return;
    }
    window.location.href = oauthStartUrl(provider);
  };

  return (
    <div>
      <div className="flex items-center gap-3 text-xs font-medium text-zinc-500 dark:text-[#9bb3c7]">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-[#223141]" />
        <span>또는</span>
        <span className="h-px flex-1 bg-zinc-200 dark:bg-[#223141]" />
      </div>

      <div className="mt-3 space-y-2.5">
        <button
          type="button"
          onClick={() => handleClick("google")}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 hover:shadow-md dark:border-[#223141] dark:bg-[#1B2733] dark:text-zinc-100 dark:hover:bg-[#223141]"
        >
          <GoogleIcon />
          <span>Google로 계속하기</span>
          {loaded && !providers.google ? (
            <span className="ml-0.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              설정 필요
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => handleClick("kakao")}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#e5c200] bg-[#FEE500] px-4 py-3 text-sm font-semibold text-[#191919] shadow-sm transition hover:bg-[#f5dc00] hover:shadow-md dark:border-[#c9a800] dark:bg-[#FEE500] dark:text-[#191919] dark:hover:bg-[#f5dc00]"
        >
          <KakaoIcon />
          <span>카카오로 계속하기</span>
          {loaded && !providers.kakao ? (
            <span className="ml-0.5 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold text-[#191919]/70">
              설정 필요
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
