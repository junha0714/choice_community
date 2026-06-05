"use client";

import { useEffect } from "react";
import { refreshAccessTokenIfNeeded } from "@/lib/auth-session";
import { purgeLegacyLocalToken } from "@/lib/auth-storage";

/** 탭 복귀·최초 로드 시 만료 임박/만료 토큰을 자동 갱신 */
export function AuthSessionKeeper() {
  useEffect(() => {
    purgeLegacyLocalToken();
    const sync = () => {
      void refreshAccessTokenIfNeeded();
    };
    sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return null;
}
