"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";

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
    void load();
  };

  const markAll = async () => {
    const token = getStoredToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}/notifications/read-all`, {
      method: "POST",
      headers: jsonAuthHeaders(),
    });
    void load();
  };

  const items = data?.items ?? [];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          알림
        </h1>
        <div className="flex gap-2 text-sm">
          <Link href="/" className="text-zinc-600 hover:underline dark:text-sky-300/80">
            ← 홈
          </Link>
          {items.some((n) => !n.read_at) ? (
            <button
              type="button"
              onClick={() => void markAll()}
              className="text-indigo-700 hover:underline dark:text-indigo-200"
            >
              모두 읽음
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-[#94a3b8]">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-10 text-center text-sm text-zinc-500 dark:border-[#223141] dark:bg-[#1B2733] dark:text-[#cbd5e1]">
          알림이 없어요.
        </p>
      ) : (
        <ul className="list-none space-y-2 p-0">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  void markRead(n.id);
                  if (n.post_id != null) {
                    router.push(`/posts/${n.post_id}`);
                  }
                }}
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition hover:border-indigo-200 hover:bg-indigo-50/40 dark:hover:border-indigo-900/50 dark:hover:bg-indigo-500/10 ${
                  n.read_at
                    ? "border-zinc-100 bg-white text-zinc-600 dark:border-[#223141] dark:bg-[#16202A] dark:text-[#cbd5e1]"
                    : "border-indigo-100 bg-indigo-50/30 text-zinc-900 dark:border-indigo-900/40 dark:bg-indigo-500/10 dark:text-sky-100"
                }`}
              >
                <div className="font-medium text-zinc-900 dark:text-white">{n.title}</div>
                <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-[#cbd5e1]">{n.body}</p>
                <div className="mt-2 text-xs text-zinc-400 dark:text-[#94a3b8]">
                  {new Date(n.created_at).toLocaleString("ko-KR")}
                  {n.post_id != null ? (
                    <span className="ml-2 text-indigo-700 dark:text-indigo-200">글로 이동 →</span>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
