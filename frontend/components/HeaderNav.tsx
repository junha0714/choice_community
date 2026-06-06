"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AUTH_SESSION_EVENT,
  AUTH_TOKEN_STORAGE_KEY,
  clearStoredToken,
  getStoredToken,
  hasStoredSession,
  notifyAuthSessionChanged,
} from "@/lib/auth-storage";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications-events";
import { API_BASE_URL } from "@/lib/config";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { BTN_NAV } from "@/lib/ui-classes";
import { tryNavigateToWrite } from "@/lib/require-login-for-write";
import { BOARD_PATH } from "@/lib/home-feed";

function IconBell({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function HeaderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [hasToken, setHasToken] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userNickname, setUserNickname] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const syncToken = useCallback(() => {
    setHasToken(!!getStoredToken() || hasStoredSession());
  }, []);

  const isWritePage = useMemo(() => {
    return pathname === "/write" || pathname === "/write/ai";
  }, [pathname]);

  const isBoardPage = pathname === BOARD_PATH;

  useEffect(() => {
    syncToken();
  }, [pathname, syncToken]);

  useEffect(() => {
    const t = getStoredToken();
    if (!t) {
      setIsAdmin(false);
      setUserNickname(null);
      setUserEmail(null);
      return;
    }
    fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        setIsAdmin(!!u?.is_admin);
        setUserNickname(typeof u?.nickname === "string" ? u.nickname : null);
        setUserEmail(typeof u?.email === "string" ? u.email : null);
      })
      .catch(() => {
        setIsAdmin(false);
        setUserNickname(null);
        setUserEmail(null);
      });
  }, [hasToken]);

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
    const onChanged = () => tick();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    const id = window.setInterval(tick, 45_000);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    };
  }, [hasToken]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_TOKEN_STORAGE_KEY) {
        syncToken();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [syncToken]);

  useEffect(() => {
    const onSession = () => syncToken();
    window.addEventListener(AUTH_SESSION_EVENT, onSession);
    return () => window.removeEventListener(AUTH_SESSION_EVENT, onSession);
  }, [syncToken]);

  const displayName =
    userNickname?.trim() ||
    (userEmail ? userEmail.split("@")[0] : null) ||
    "회원";
  const isMyPage = pathname === "/mypage";

  const handleLogout = () => {
    clearStoredToken();
    notifyAuthSessionChanged();
    setHasToken(false);
    setIsAdmin(false);
    setUserNickname(null);
    setUserEmail(null);
    router.refresh();
    router.push("/");
  };

  return (
    <nav
      className="flex min-w-0 flex-wrap items-center justify-end gap-x-1 gap-y-2 text-sm sm:gap-x-2"
      aria-label="주요 메뉴"
    >
      <Link
        href={BOARD_PATH}
        className={[
          BTN_NAV,
          isBoardPage
            ? "bg-sky-600 font-semibold text-white shadow-sm hover:bg-sky-500 focus-visible:ring-sky-300/70 dark:bg-sky-500 dark:hover:bg-sky-400"
            : "text-zinc-600 hover:bg-sky-100/90 hover:text-sky-950 focus-visible:ring-sky-300/70 dark:text-sky-200/90 dark:hover:bg-sky-950/55 dark:hover:text-white",
        ].join(" ")}
      >
        게시판
      </Link>
      <button
        type="button"
        onClick={() => tryNavigateToWrite(router)}
        className={[
          BTN_NAV,
          "cursor-pointer font-semibold shadow-sm shadow-indigo-900/15 focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-0",
          isWritePage
            ? "bg-indigo-600 text-white ring-2 ring-indigo-300/80 hover:bg-indigo-500 focus-visible:ring-indigo-200/80 dark:bg-indigo-500 dark:ring-indigo-400/50 dark:hover:bg-indigo-400/90 dark:focus-visible:ring-indigo-500/30"
            : "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-200/80 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:ring-indigo-500/30",
        ].join(" ")}
      >
        글쓰기
      </button>
      <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-sky-200/80 pl-2 dark:border-sky-800/60 sm:ml-2 sm:gap-1.5 sm:pl-3">
        {hasToken ? (
          <Link
            href="/notifications"
            className="relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-zinc-600 transition-colors hover:bg-sky-100/90 hover:text-sky-950 focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-2 dark:text-sky-200/90 dark:hover:bg-sky-950/55 dark:hover:text-white dark:focus-visible:ring-sky-500/35 dark:focus-visible:ring-offset-0"
            aria-label={`알림${unreadNotifications > 0 ? ` ${unreadNotifications}건 읽지 않음` : ""}`}
          >
            <IconBell className="h-4 w-4 shrink-0" />
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
        {hasToken ? (
          <Link
            href="/mypage"
            aria-label={`마이페이지, ${displayName}`}
            className={[
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-2 dark:focus-visible:ring-sky-500/35 dark:focus-visible:ring-offset-0",
              isMyPage
                ? "bg-sky-100/90 font-medium text-sky-950 dark:bg-sky-950/50 dark:text-sky-50"
                : "text-zinc-600 hover:bg-sky-100/90 hover:text-sky-950 dark:text-sky-200/90 dark:hover:bg-sky-950/55 dark:hover:text-white",
            ].join(" ")}
          >
            <ProfileAvatar size="sm" />
            <span className="max-w-22 truncate font-medium sm:max-w-30">
              {displayName}
            </span>
          </Link>
        ) : null}
        {hasToken ? (
          <Link
            href="/settings"
            className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-zinc-600 transition-colors hover:bg-sky-100/90 hover:text-sky-950 focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-2 dark:text-sky-200/90 dark:hover:bg-sky-950/55 dark:hover:text-white dark:focus-visible:ring-sky-500/35 dark:focus-visible:ring-offset-0"
          >
            설정
          </Link>
        ) : null}
        {hasToken ? (
          <button
            type="button"
            onClick={handleLogout}
            className="whitespace-nowrap rounded-full border border-sky-200/90 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-2 dark:border-sky-800/70 dark:bg-zinc-900/90 dark:text-sky-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/60 dark:focus-visible:ring-sky-500/35 dark:focus-visible:ring-offset-0"
          >
            로그아웃
          </button>
        ) : (
          <Link
            href="/login"
            className={`${BTN_NAV} bg-sky-700 font-semibold text-white shadow-sm shadow-sky-900/20 hover:bg-sky-600 focus-visible:ring-sky-300/70 dark:bg-sky-500 dark:hover:bg-sky-400 dark:focus-visible:ring-sky-500/35`}
          >
            로그인
          </Link>
        )}
      </div>
    </nav>
  );
}
