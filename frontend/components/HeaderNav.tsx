"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AUTH_TOKEN_STORAGE_KEY,
  clearStoredToken,
  getStoredToken,
} from "@/lib/auth-storage";
import { API_BASE_URL } from "@/lib/config";
import { tryNavigateToWrite } from "@/lib/require-login-for-write";

export function HeaderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [hasToken, setHasToken] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const syncToken = useCallback(() => {
    setHasToken(!!getStoredToken());
  }, []);

  const isWritePage = useMemo(() => {
    return pathname === "/write" || pathname === "/write/ai";
  }, [pathname]);

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
    const t = getStoredToken();
    if (!t) {
      setUnreadNotifications(0);
      return;
    }
    const tick = () => {
      fetch(`${API_BASE_URL}/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${t}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setUnreadNotifications(typeof d?.count === "number" ? d.count : 0))
        .catch(() => setUnreadNotifications(0));
    };
    tick();
    const id = window.setInterval(tick, 45_000);
    return () => window.clearInterval(id);
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
    <nav
      className="flex min-w-0 flex-wrap items-center justify-end gap-x-1 gap-y-2 text-sm sm:gap-x-2"
      aria-label="주요 메뉴"
    >
      <button
        type="button"
        onClick={() => tryNavigateToWrite(router, "/write/ai")}
        className={[
          "shrink-0 cursor-pointer rounded-full px-3 py-1.5 font-semibold shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-0",
          isWritePage
            ? "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-200/80 dark:bg-indigo-500/90 dark:hover:bg-indigo-400/90 dark:focus-visible:ring-indigo-500/30"
            : "bg-sky-50 text-zinc-800 hover:bg-sky-100 focus-visible:ring-sky-300/70 dark:bg-sky-950/45 dark:text-sky-100 dark:hover:bg-sky-900/60 dark:focus-visible:ring-sky-500/35",
        ].join(" ")}
      >
        글쓰기
      </button>
      <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-sky-200/80 pl-2 dark:border-sky-800/60 sm:ml-2 sm:gap-1.5 sm:pl-3">
        {hasToken ? (
          <Link
            href="/notifications"
            className="relative whitespace-nowrap rounded-full px-2.5 py-1.5 text-zinc-600 transition-colors hover:bg-sky-100/90 hover:text-sky-950 focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-2 dark:text-sky-200/90 dark:hover:bg-sky-950/55 dark:hover:text-white dark:focus-visible:ring-sky-500/35 dark:focus-visible:ring-offset-0"
            aria-label={`알림${unreadNotifications > 0 ? ` ${unreadNotifications}건 읽지 않음` : ""}`}
          >
            알림
            {unreadNotifications > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            ) : null}
          </Link>
        ) : null}
        {hasToken && isAdmin ? (
          <Link
            href="/admin"
            className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100/90 focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-2 dark:text-sky-300 dark:hover:bg-sky-950/55 dark:hover:text-white dark:focus-visible:ring-sky-500/35 dark:focus-visible:ring-offset-0 sm:text-sm"
          >
            관리자
          </Link>
        ) : null}
        <Link
          href="/mypage"
          className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-zinc-600 transition-colors hover:bg-sky-100/90 hover:text-sky-950 focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-2 dark:text-sky-200/90 dark:hover:bg-sky-950/55 dark:hover:text-white dark:focus-visible:ring-sky-500/35 dark:focus-visible:ring-offset-0"
        >
          마이페이지
        </Link>
        {hasToken ? (
          <button
            type="button"
            onClick={handleLogout}
            className="whitespace-nowrap rounded-full border border-sky-200/90 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-2 dark:border-sky-800/70 dark:bg-zinc-900/90 dark:text-sky-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/60 dark:focus-visible:ring-sky-500/35 dark:focus-visible:ring-offset-0 sm:text-sm"
          >
            로그아웃
          </button>
        ) : (
          <Link
            href="/login"
            className="whitespace-nowrap rounded-full bg-sky-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-sky-900/25 transition hover:bg-sky-600 focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-2 dark:bg-sky-500 dark:hover:bg-sky-400 dark:focus-visible:ring-sky-500/35 dark:focus-visible:ring-offset-0 sm:text-sm"
          >
            로그인
          </Link>
        )}
      </div>
    </nav>
  );
}
