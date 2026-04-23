"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";

type ReportRow = {
  id: number;
  reporter_id: number;
  target_type: string;
  target_id: number;
  reason: string;
  status: string;
  admin_note: string | null;
  created_at: string;
};

type PaginatedReports = {
  items: ReportRow[];
  total: number;
  page: number;
  total_pages: number;
};

type UserRow = {
  id: number;
  email: string;
  nickname: string | null;
  is_admin: boolean;
  is_banned: boolean;
  created_at: string;
};

type PaginatedUsers = {
  items: UserRow[];
  total: number;
  page: number;
  total_pages: number;
};

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"reports" | "users">("reports");
  const [reports, setReports] = useState<PaginatedReports | null>(null);
  const [users, setUsers] = useState<PaginatedUsers | null>(null);
  const [reportPage, setReportPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");

  const loadReports = useCallback(async (page: number) => {
    const t = getStoredToken();
    if (!t) return;
    const res = await fetch(
      `${API_BASE_URL}/admin/reports?page=${page}&page_size=20`,
      { headers: { Authorization: `Bearer ${t}` } }
    );
    if (res.status === 403) return;
    if (res.ok) setReports(await res.json());
  }, []);

  const loadUsers = useCallback(async (page: number) => {
    const t = getStoredToken();
    if (!t) return;
    const res = await fetch(
      `${API_BASE_URL}/admin/users?page=${page}&page_size=20`,
      { headers: { Authorization: `Bearer ${t}` } }
    );
    if (res.status === 403) return;
    if (res.ok) setUsers(await res.json());
  }, []);

  useEffect(() => {
    const t = getStoredToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    void (async () => {
      const me = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!me.ok) {
        router.replace("/login");
        return;
      }
      const u = await me.json();
      if (!u?.is_admin) {
        setError("관리자 계정으로 로그인한 경우에만 이용할 수 있습니다.");
        setLoading(false);
        return;
      }
      setAllowed(true);
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    void loadReports(reportPage);
  }, [allowed, reportPage, loadReports]);

  useEffect(() => {
    if (!allowed) return;
    void loadUsers(userPage);
  }, [allowed, userPage, loadUsers]);

  const patchReport = async (id: number, status: "resolved" | "dismissed") => {
    const res = await fetch(`${API_BASE_URL}/admin/reports/${id}`, {
      method: "PATCH",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ status, admin_note: null }),
    });
    if (res.ok) void loadReports(reportPage);
    else alert("처리 실패");
  };

  const toggleBan = async (userId: number, isBanned: boolean) => {
    if (
      !confirm(
        isBanned
          ? "이 사용자의 이용 제한을 해제할까요?"
          : "이 사용자를 이용 제한할까요?"
      )
    )
      return;
    const res = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
      method: "PATCH",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ is_banned: !isBanned }),
    });
    if (res.ok) void loadUsers(userPage);
    else alert("변경 실패");
  };

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4">
        <p className="text-sm text-zinc-500 dark:text-[#94a3b8]">불러오는 중...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4">
        <p className="text-red-700 dark:text-red-200">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-zinc-600 hover:underline dark:text-sky-300/80">
          홈으로
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">관리자</h1>
        <Link href="/" className="text-sm text-zinc-600 hover:underline dark:text-sky-300/80">
          ← 홈
        </Link>
      </div>

      <p className="text-sm text-zinc-500 dark:text-[#94a3b8]">
        글 삭제는 해당 글 상세 페이지에서 작성자와 동일하게 &quot;삭제&quot; 버튼으로
        할 수 있어요.
      </p>

      <div className="flex gap-2 border-b border-zinc-200 text-sm dark:border-[#223141]">
        <button
          type="button"
          onClick={() => setTab("reports")}
          className={`border-b-2 px-3 py-2 ${
            tab === "reports"
              ? "border-indigo-600 font-medium text-indigo-800 dark:text-indigo-200"
              : "border-transparent text-zinc-500 dark:text-[#94a3b8]"
          }`}
        >
          신고
        </button>
        <button
          type="button"
          onClick={() => setTab("users")}
          className={`border-b-2 px-3 py-2 ${
            tab === "users"
              ? "border-indigo-600 font-medium text-indigo-800 dark:text-indigo-200"
              : "border-transparent text-zinc-500 dark:text-[#94a3b8]"
          }`}
        >
          사용자
        </button>
      </div>

      {tab === "reports" && reports && (
        <section className="space-y-3">
          {reports.items.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-[#94a3b8]">신고가 없습니다.</p>
          ) : (
            reports.items.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-[#223141] dark:bg-[#16202A]"
              >
                <div className="font-medium text-zinc-900 dark:text-white">
                  #{r.id} · {r.target_type} #{r.target_id} · {r.status}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-zinc-700 dark:text-[#cbd5e1]">{r.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void patchReport(r.id, "resolved")}
                        className="rounded bg-emerald-600 px-3 py-1 text-xs text-white"
                      >
                        처리 완료
                      </button>
                      <button
                        type="button"
                        onClick={() => void patchReport(r.id, "dismissed")}
                        className="rounded border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-800 dark:border-[#223141] dark:bg-[#0f1720] dark:text-sky-100"
                      >
                        기각
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
          {reports.total_pages > 1 && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={reportPage <= 1}
                onClick={() => setReportPage((p) => Math.max(1, p - 1))}
                className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-800 disabled:opacity-40 dark:border-[#223141] dark:bg-[#0f1720] dark:text-sky-100"
              >
                이전
              </button>
              <span className="text-sm text-zinc-600 dark:text-[#cbd5e1]">
                {reportPage} / {reports.total_pages}
              </span>
              <button
                type="button"
                disabled={reportPage >= reports.total_pages}
                onClick={() =>
                  setReportPage((p) => Math.min(reports.total_pages, p + 1))
                }
                className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-800 disabled:opacity-40 dark:border-[#223141] dark:bg-[#0f1720] dark:text-sky-100"
              >
                다음
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "users" && users && (
        <section className="space-y-2">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-[#223141] dark:text-[#94a3b8]">
                <th className="py-2 pr-2">ID</th>
                <th className="py-2 pr-2">이메일</th>
                <th className="py-2 pr-2">닉네임</th>
                <th className="py-2 pr-2">상태</th>
                <th className="py-2">동작</th>
              </tr>
            </thead>
            <tbody>
              {users.items.map((u) => (
                <tr key={u.id} className="border-b border-zinc-100 dark:border-[#223141]">
                  <td className="py-2 pr-2">{u.id}</td>
                  <td className="py-2 pr-2">{u.email}</td>
                  <td className="py-2 pr-2">{u.nickname ?? "—"}</td>
                  <td className="py-2 pr-2">
                    {u.is_admin ? "관리자 " : ""}
                    {u.is_banned ? (
                      <span className="text-red-600 dark:text-red-200">제한</span>
                    ) : (
                      <span className="text-zinc-400 dark:text-[#94a3b8]">정상</span>
                    )}
                  </td>
                  <td className="py-2">
                    {!u.is_admin ? (
                      <button
                        type="button"
                        onClick={() => void toggleBan(u.id, u.is_banned)}
                        className="text-xs text-indigo-700 hover:underline dark:text-indigo-200"
                      >
                        {u.is_banned ? "제한 해제" : "이용 제한"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.total_pages > 1 && (
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={userPage <= 1}
                onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                className="rounded border px-3 py-1 text-sm disabled:opacity-40"
              >
                이전
              </button>
              <span className="text-sm text-zinc-600">
                {userPage} / {users.total_pages}
              </span>
              <button
                type="button"
                disabled={userPage >= users.total_pages}
                onClick={() =>
                  setUserPage((p) => Math.min(users.total_pages, p + 1))
                }
                className="rounded border px-3 py-1 text-sm disabled:opacity-40"
              >
                다음
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
