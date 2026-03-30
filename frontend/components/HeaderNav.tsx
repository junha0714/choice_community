"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AUTH_TOKEN_STORAGE_KEY,
  clearStoredToken,
  getStoredToken,
} from "@/lib/auth-storage";
import { API_BASE_URL } from "@/lib/config";

export function HeaderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [hasToken, setHasToken] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const syncToken = useCallback(() => {
    setHasToken(!!getStoredToken());
  }, []);

  useEffect(() => {
    syncToken();
  }, [pathname, syncToken]);

  useEffect(() => {
    const t = getStoredToken();
    if (!t) {
      setIsAdmin(false);
      return;
    }
    fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setIsAdmin(!!u?.is_admin))
      .catch(() => setIsAdmin(false));
  }, [pathname, hasToken]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_TOKEN_STORAGE_KEY) {
        syncToken();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [syncToken]);

  const handleLogout = () => {
    clearStoredToken();
    setHasToken(false);
    setIsAdmin(false);
    router.refresh();
    router.push("/");
  };

  return (
    <nav className="flex min-w-0 flex-wrap items-center justify-end gap-x-1 gap-y-2 text-sm sm:gap-x-2">
      <Link
        href="/write"
        className="shrink-0 rounded-full px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100/90 hover:text-zinc-900"
      >
        투표 고민
      </Link>
      <Link
        href="/write/ai"
        className="shrink-0 rounded-full bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700 transition-colors hover:bg-indigo-100/90"
      >
        AI 고민
      </Link>
      <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-zinc-200/80 pl-2 sm:ml-2 sm:gap-1.5 sm:pl-3">
        {hasToken && isAdmin ? (
          <Link
            href="/admin"
            className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-50 sm:text-sm"
          >
            관리자
          </Link>
        ) : null}
        <Link
          href="/mypage"
          className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100/90 hover:text-zinc-900"
        >
          마이페이지
        </Link>
        {hasToken ? (
          <button
            type="button"
            onClick={handleLogout}
            className="whitespace-nowrap rounded-full border border-zinc-200/90 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 sm:text-sm"
          >
            로그아웃
          </button>
        ) : (
          <Link
            href="/login"
            className="whitespace-nowrap rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm shadow-zinc-900/20 transition hover:bg-zinc-800 sm:text-sm"
          >
            로그인
          </Link>
        )}
      </div>
    </nav>
  );
}
