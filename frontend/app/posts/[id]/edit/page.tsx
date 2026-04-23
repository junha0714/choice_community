"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import { OptionInputs } from "@/components/OptionInputs";
import { CategorySelect } from "@/components/CategorySelect";

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const [tagsText, setTagsText] = useState("");
  const [voteDeadlineLocal, setVoteDeadlineLocal] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

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
            setTagsText((post.tags ?? []).join(", "));
            setVoteDeadlineLocal(isoToDatetimeLocal(post.vote_deadline_at));
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

  const insertIntoContent = (snippet: string) => {
    const el = contentRef.current;
    if (!el) {
      setContent((c) => (c ? `${c}\n\n${snippet}` : snippet));
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const sep = before && !before.endsWith("\n") ? "\n\n" : "";
    const ins = sep + snippet;
    const next = before + ins + after;
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + ins.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleImagePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const token = getStoredToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE_URL}/upload/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.detail === "string" ? data.detail : "업로드 실패");
        return;
      }
      const url = typeof data.url === "string" ? data.url : "";
      if (url) insertIntoContent(`![img](${url})`);
    } finally {
      setUploadingImage(false);
    }
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
    const tags = tagsText
      .split(/[,，]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

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
          tags,
          vote_deadline_at: voteDeadlineLocal
            ? new Date(voteDeadlineLocal).toISOString()
            : null,
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
        <p className="text-sm text-zinc-500 dark:text-[#AFC6D8]/80">
          불러오는 중...
        </p>
      </main>
    );
  }

  if (error && !title) {
    return (
      <main className="mx-auto w-full max-w-3xl">
        <div className="rounded-xl border border-red-200 bg-white p-6 text-red-800 dark:border-red-900/50 dark:bg-[#16202A] dark:text-red-200">
          {error}
        </div>
        <Link href="/" className="mt-4 inline-block text-sm text-zinc-600 hover:underline dark:text-sky-300/80">
          ← 홈
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          글 수정
        </h1>
        <Link
          href={`/posts/${params?.id}`}
          className="text-sm text-zinc-600 hover:underline dark:text-sky-300/80"
        >
          취소
        </Link>
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-200">{error}</p>}

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
        <label className="block text-sm font-medium text-zinc-700 dark:text-[#AFC6D8]">
          제목
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-700 dark:text-[#AFC6D8]">
          고민 내용
          <textarea
            ref={contentRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-[#223141] dark:bg-[#1B2733] dark:text-[#AFC6D8] dark:hover:bg-sky-950/35">
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => void handleImagePick(e)}
              disabled={uploadingImage}
            />
            {uploadingImage ? "업로드 중…" : "본문에 사진 넣기"}
          </label>
        </div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-[#AFC6D8]">
          태그 (쉼표로 구분)
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
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
        <label className="block text-sm font-medium text-zinc-700 dark:text-[#AFC6D8]">
          투표 마감 (비우면 마감 없음)
          <input
            type="datetime-local"
            value={voteDeadlineLocal}
            onChange={(e) => setVoteDeadlineLocal(e.target.value)}
            className="mt-1 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500/90 dark:hover:bg-indigo-400/90"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </main>
  );
}
