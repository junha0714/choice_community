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
  const [writeMenuOpen, setWriteMenuOpen] = useState(false);

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
    setWriteMenuOpen(false);
  }, [pathname]);

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

  useEffect(() => {
    if (!writeMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWriteMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [writeMenuOpen]);

  return (
    <nav
      className="flex min-w-0 flex-wrap items-center justify-end gap-x-1 gap-y-2 text-sm sm:gap-x-2"
      aria-label="주요 메뉴"
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => setWriteMenuOpen((v) => !v)}
          className={[
            "shrink-0 cursor-pointer rounded-full px-3 py-1.5 font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-0",
            isWritePage
              ? "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-200/80 dark:bg-indigo-500/90 dark:hover:bg-indigo-400/90 dark:focus-visible:ring-indigo-500/30"
              : "bg-sky-50 text-zinc-800 hover:bg-sky-100 focus-visible:ring-sky-300/70 dark:bg-sky-950/45 dark:text-sky-100 dark:hover:bg-sky-900/60 dark:focus-visible:ring-sky-500/35",
          ].join(" ")}
          aria-haspopup="menu"
          aria-expanded={writeMenuOpen}
          aria-label="글쓰기 메뉴 열기"
        >
          글쓰기
          <span aria-hidden className="ml-1 inline-block text-[10px] opacity-80">
            ▾
          </span>
        </button>

        {writeMenuOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="글쓰기 메뉴 닫기"
              onClick={() => setWriteMenuOpen(false)}
            />
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg shadow-sky-900/10 dark:border-[#223141] dark:bg-[#16202A]"
            >
              <button
                type="button"
                role="menuitem"
                className="w-full px-4 py-3 text-left text-sm text-zinc-800 hover:bg-sky-50 dark:text-sky-100 dark:hover:bg-sky-950/35"
                onClick={() => {
                  setWriteMenuOpen(false);
                  tryNavigateToWrite(router, "/write");
                }}
              >
                <div className="font-semibold">커뮤니티 투표만</div>
                <div className="mt-0.5 text-xs text-zinc-500 dark:text-[#94a3b8]">
                  댓글·투표로 의견 모으기
                </div>
              </button>
              <div className="h-px bg-zinc-100 dark:bg-[#223141]" />
              <button
                type="button"
                role="menuitem"
                className="w-full px-4 py-3 text-left text-sm text-zinc-800 hover:bg-indigo-50/60 dark:text-sky-100 dark:hover:bg-indigo-500/10"
                onClick={() => {
                  setWriteMenuOpen(false);
                  tryNavigateToWrite(router, "/write/ai");
                }}
              >
                <div className="font-semibold">AI도 같이 사용</div>
                <div className="mt-0.5 text-xs text-zinc-500 dark:text-[#94a3b8]">
                  질문 흐름 + 최종 추천까지
                </div>
              </button>
            </div>
          </>
        ) : null}
      </div>
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
