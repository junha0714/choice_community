"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import { OptionInputs } from "@/components/OptionInputs";
import { CategorySelect } from "@/components/CategorySelect";

export default function EditPostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE_URL}/meta/categories`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: string[] = d?.categories ?? [];
        setCategories(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!params?.id) return;
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setError("");
    setLoading(true);
    fetch(`${API_BASE_URL}/posts/${params.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          router.replace("/login");
          return null;
        }
        if (!r.ok) throw new Error("글을 불러오지 못했습니다.");
        return r.json();
      })
      .then((post) => {
        if (!post) return;
        fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((me) => {
            if (!me || post.user_id !== me.id) {
              setError("작성자만 수정할 수 있습니다.");
              return;
            }
            setTitle(post.title ?? "");
            setContent(post.content ?? "");
            setCategory(post.category ?? "");
            const opts = (post.options ?? "")
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean);
            setOptions(opts.length >= 2 ? opts : ["", ""]);
          });
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "오류가 발생했습니다.")
      )
      .finally(() => setLoading(false));
  }, [params?.id, router]);

  const setOption = (index: number, value: string) => {
    const next = [...options];
    next[index] = value;
    setOptions(next);
  };

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions([...options, ""]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, j) => j !== index));
  };

  const handleSubmit = async () => {
    if (!params?.id) return;
    const token = getStoredToken();
    if (!token) {
      router.push("/login");
      return;
    }
    if (!title.trim() || !content.trim()) {
      alert("제목과 내용을 입력해줘");
      return;
    }
    if (!category) {
      alert("카테고리를 선택해줘");
      return;
    }
    const optionList = options.map((o) => o.trim()).filter(Boolean);
    if (optionList.length < 2) {
      alert("선택지를 비어 있지 않게 최소 2개 이상 입력해줘");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${params.id}`, {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          category,
          options: optionList,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "저장 실패"
        );
      }
      router.push(`/posts/${params.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-3xl">
        <p className="text-sm text-zinc-500">불러오는 중...</p>
      </main>
    );
  }

  if (error && !title) {
    return (
      <main className="mx-auto w-full max-w-3xl">
        <div className="rounded-xl border border-red-200 bg-white p-6 text-red-800">
          {error}
        </div>
        <Link href="/" className="mt-4 inline-block text-sm text-zinc-600 hover:underline">
          ← 홈
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">글 수정</h1>
        <Link
          href={`/posts/${params?.id}`}
          className="text-sm text-zinc-500 hover:underline"
        >
          취소
        </Link>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-zinc-700">
          제목
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-700">
          고민 내용
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <CategorySelect
          categories={categories}
          value={category}
          onChange={setCategory}
        />
        <OptionInputs
          options={options}
          onChange={setOption}
          onAdd={addOption}
          onRemove={removeOption}
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </main>
  );
}
