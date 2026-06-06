"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import { messageFromApiDetail } from "@/lib/api-message";
import { formatPostDateLabel } from "@/lib/format-datetime";
import { notifyNotificationsChanged } from "@/lib/notifications-events";
import { toast } from "@/lib/toast";

type NotificationItem = {
  id: number;
  kind: string;
  title: string;
  body: string;
  post_id: number | null;
  comment_id: number | null;
  report_id: number | null;
  read_at: string | null;
  created_at: string;
};

type Paginated = {
  items: NotificationItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [data, setData] = useState<Paginated | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const load = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    const res = await fetch(`${API_BASE_URL}/notifications?page=1&page_size=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const json = (await res.json()) as Paginated;
    setData(json);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: number) => {
    const token = getStoredToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
      method: "PATCH",
      headers: jsonAuthHeaders(),
    });
    notifyNotificationsChanged();
    void load();
  };

  const markAll = async () => {
    const token = getStoredToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}/notifications/read-all`, {
      method: "POST",
      headers: jsonAuthHeaders(),
    });
    notifyNotificationsChanged();
    void load();
  };

  const deleteOne = async (id: number) => {
    const token = getStoredToken();
    if (!token) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/${id}`, {
        method: "DELETE",
        headers: jsonAuthHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(messageFromApiDetail(body.detail, "알림 삭제에 실패했습니다."));
        return;
      }
      notifyNotificationsChanged();
      void load();
    } finally {
      setDeletingId(null);
    }
  };

  const deleteAll = async () => {
    if (
      !window.confirm(
        "모든 알림을 삭제할까요? 삭제 후에는 복구할 수 없습니다."
      )
    ) {
      return;
    }
    const token = getStoredToken();
    if (!token) return;
    setClearingAll(true);
    try {
      const res = await fetch(`${API_BASE_URL}/notifications`, {
        method: "DELETE",
        headers: jsonAuthHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(messageFromApiDetail(body.detail, "알림 삭제에 실패했습니다."));
        return;
      }
      notifyNotificationsChanged();
      void load();
    } finally {
      setClearingAll(false);
    }
  };

  const items = data?.items ?? [];
  const hasUnread = items.some((n) => !n.read_at);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          알림
        </h1>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {hasUnread ? (
            <button
              type="button"
              onClick={() => void markAll()}
              className="text-indigo-700 hover:underline dark:text-indigo-200"
            >
              모두 읽음
            </button>
          ) : null}
          {items.length > 0 ? (
            <button
              type="button"
              onClick={() => void deleteAll()}
              disabled={clearingAll}
              className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-300"
            >
              {clearingAll ? "삭제 중…" : "전체 삭제"}
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-[#94a3b8]">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-10 text-center text-sm text-zinc-500 dark:border-[#223141] dark:bg-[#1B2733] dark:text-[#cbd5e1]">
          알림이 없습니다.
        </p>
      ) : (
        <ul className="list-none space-y-2 p-0">
          {items.map((n) => (
            <li
              key={n.id}
              className={`flex overflow-hidden rounded-xl border transition hover:border-indigo-200 dark:hover:border-indigo-900/50 ${
                n.read_at
                  ? "border-zinc-100 bg-white dark:border-[#223141] dark:bg-[#16202A]"
                  : "border-indigo-100 bg-indigo-50/30 dark:border-indigo-900/40 dark:bg-indigo-500/10"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  void markRead(n.id);
                  if (n.post_id != null) {
                    router.push(`/posts/${n.post_id}`);
                  }
                }}
                className={`min-w-0 flex-1 px-4 py-3 text-left text-sm transition hover:bg-indigo-50/40 dark:hover:bg-indigo-500/10 ${
                  n.read_at
                    ? "text-zinc-600 dark:text-[#cbd5e1]"
                    : "text-zinc-900 dark:text-sky-100"
                } ${n.post_id != null ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="font-medium text-zinc-900 dark:text-white">{n.title}</div>
                <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-[#cbd5e1]">
                  {n.body}
                </p>
                <div className="mt-2 text-xs text-zinc-400 dark:text-[#94a3b8]">
                  {formatPostDateLabel(n.created_at)}
                </div>
              </button>
              <button
                type="button"
                onClick={() => void deleteOne(n.id)}
                disabled={deletingId === n.id}
                aria-label="알림 삭제"
                className="flex shrink-0 items-start border-l border-zinc-100 px-3 py-3 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-[#223141] dark:hover:bg-red-950/30 dark:hover:text-red-300"
              >
                <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
