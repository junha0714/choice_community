"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import { OptionInputs } from "@/components/OptionInputs";
import { CategorySelect } from "@/components/CategorySelect";
import {
  RichComposer,
  type RichComposerHandle,
  richHtmlToMarkdown,
  richHtmlToPlainText,
} from "@/components/RichComposer";
import { tryNavigateToWrite } from "@/lib/require-login-for-write";

type SimilarDraftPost = {
  id: number;
  title: string;
  category: string;
  post_kind?: string;
  view_count?: number;
  like_count?: number;
  created_at: string;
  tags?: string[];
};

export default function WritePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [composerHtml, setComposerHtml] = useState("");
  const composerRef = useRef<RichComposerHandle | null>(null);
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [options, setOptions] = useState(["", ""]);
  const [hasToken, setHasToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tagsText, setTagsText] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [tagSuggestLoading, setTagSuggestLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [similarDraft, setSimilarDraft] = useState<SimilarDraftPost[]>([]);
  const [draftSuggestLoading, setDraftSuggestLoading] = useState(false);
  const [draftSuggestNotice, setDraftSuggestNotice] = useState("");
  const [categoryPickerMode, setCategoryPickerMode] = useState<"auto" | "manual">(
    "auto"
  );
  const [categoryAutoLoading, setCategoryAutoLoading] = useState(false);

  useEffect(() => {
    setHasToken(!!getStoredToken());
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/meta/categories`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: string[] = d?.categories ?? [];
        setCategories(list);
        setCategory((prev) => prev || (list.includes("기타") ? "기타" : list[0] || ""));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (categoryPickerMode !== "auto" || categories.length === 0) return;
    const t = title.trim();
    const c = richHtmlToMarkdown(composerHtml).trim();
    if (t.length + c.length < 10) {
      setCategoryAutoLoading(false);
      return;
    }
    setCategoryAutoLoading(true);
    let cancelled = false;
    const id = window.setTimeout(() => {
      void fetch(`${API_BASE_URL}/meta/suggest-category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, content: c }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d) return;
          const cat = (d as { category?: string }).category;
          if (typeof cat === "string" && categories.includes(cat)) {
            setCategory(cat);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setCategoryAutoLoading(false);
        });
    }, 650);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      setCategoryAutoLoading(false);
    };
  }, [title, composerHtml, categoryPickerMode, categories]);

  useEffect(() => {
    const q = title.trim();
    if (q.length < 2) {
      setSimilarDraft([]);
      return;
    }
    const id = window.setTimeout(() => {
      const token = getStoredToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      void fetch(
        `${API_BASE_URL}/posts?q=${encodeURIComponent(q)}&page=1&page_size=5`,
        { headers }
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const items = (d && Array.isArray(d.items) ? d.items : []) as SimilarDraftPost[];
          setSimilarDraft(items);
        })
        .catch(() => setSimilarDraft([]));
    }, 450);
    return () => window.clearTimeout(id);
  }, [title]);

  const parseTagsText = (raw: string) =>
    raw
      .split(/[,，]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

  useEffect(() => {
    const t = title.trim();
    const c = richHtmlToPlainText(composerHtml);
    const selected = parseTagsText(tagsText);
    if (t.length + c.length < 8) {
      setTagSuggestions([]);
      setTagSuggestLoading(false);
      return;
    }
    setTagSuggestLoading(true);
    const id = window.setTimeout(() => {
      void fetch(`${API_BASE_URL}/meta/tag-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          content: c,
          category,
          selected,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const tags = (d && Array.isArray(d.tags) ? d.tags : []) as string[];
          setTagSuggestions(
            tags.filter((x) => x && !selected.includes(x.toLowerCase()))
          );
        })
        .catch(() => setTagSuggestions([]))
        .finally(() => setTagSuggestLoading(false));
    }, 550);
    return () => window.clearTimeout(id);
  }, [title, composerHtml, category, tagsText]);

  const toggleTagFromSuggestion = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    const selected = parseTagsText(tagsText);
    const next = selected.includes(t)
      ? selected.filter((x) => x !== t)
      : [...selected, t];
    setTagsText(next.join(", "));
  };

  const setOption = (index: number, value: string) => {
    setDraftSuggestNotice("");
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
      if (url) {
        const h = composerRef.current;
        if (h) h.insertImageAtCursor(url);
      }
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSuggestDraft = async () => {
    const finalContent = richHtmlToMarkdown(composerHtml);
    const t = title.trim();
    const c = finalContent.trim();
    if (t.length + c.length < 10) {
      alert("제목과 본문을 조금 더 써 주면 자동 제안이 잘 나와요.");
      return;
    }
    setDraftSuggestLoading(true);
    setDraftSuggestNotice("");
    try {
      const res = await fetch(`${API_BASE_URL}/meta/suggest-options-category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, content: c }),
      });
      const d = (await res.json().catch(() => null)) as {
        options?: string[];
        category?: string;
        disclaimer?: string;
      } | null;
      if (!res.ok || !d) {
        alert("자동 제안을 불러오지 못했어요.");
        return;
      }
      const opts = Array.isArray(d.options)
        ? d.options.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (opts.length < 2) {
        alert("선택지를 자동으로 만들기 어려워요. 제목·본문을 조금 더 적어 보세요.");
        return;
      }
      setOptions(opts.slice(0, 6));
      if (typeof d.disclaimer === "string" && d.disclaimer.trim()) {
        setDraftSuggestNotice(d.disclaimer.trim());
      }
    } finally {
      setDraftSuggestLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!getStoredToken()) {
      alert("로그인한 뒤에 글을 작성할 수 있어요.");
      router.push("/login");
      return;
    }
    const finalContent = richHtmlToMarkdown(composerHtml);
    if (!title.trim() || !finalContent.trim()) {
      alert("제목과 고민 내용을 입력해줘");
      return;
    }
    if (!category) {
      alert("카테고리를 불러오는 중이거나 비어 있어요. 잠시 후 다시 시도해줘.");
      return;
    }
    const optionList = options.map((o) => o.trim()).filter(Boolean);
    if (optionList.length < 2) {
      alert("선택지를 비어 있지 않게 최소 2개 이상 입력해줘");
      return;
    }
    const tags = parseTagsText(tagsText);

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          content: finalContent,
          category,
          options: optionList,
          post_kind: "community",
          tags: tags.length ? tags : undefined,
        }),
      });

      if (res.ok) {
        const post = await res.json();
        router.push(`/posts/${post.id}`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        alert("로그인이 필요해요.");
        router.push("/login");
      } else if (res.status === 422 && Array.isArray(data.detail)) {
        const msg = data.detail
          .map((e: { msg?: string }) => e.msg)
          .filter(Boolean)
          .join(" ");
        alert(msg || "입력을 확인해줘");
      } else {
        alert(
          typeof data.detail === "string" ? data.detail : "게시글 작성 실패"
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-full px-3 text-zinc-900 sm:max-w-xl sm:px-4 md:max-w-2xl md:px-5 lg:max-w-3xl lg:px-6 xl:max-w-4xl xl:px-8 2xl:max-w-4xl 2xl:px-10 dark:text-sky-100">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">커뮤니티 투표 고민</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-zinc-600 hover:underline dark:text-sky-300/80">
            ← 목록
          </Link>
        </div>
      </div>

      <div
        className="mb-4 flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1.5 dark:border-[#223141] dark:bg-zinc-900/50"
        role="tablist"
        aria-label="글쓰기 방식"
      >
        <button
          type="button"
          onClick={() => tryNavigateToWrite(router, "/write/ai")}
          className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 text-center text-sm font-medium text-zinc-700 transition hover:bg-white/90 hover:text-zinc-900 dark:text-[#AFC6D8] dark:hover:bg-[#16202A] dark:hover:text-white"
        >
          AI와 대화
        </button>
        <span
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-white px-3 text-center text-sm font-semibold text-sky-900 shadow-sm dark:bg-[#1B2733] dark:text-sky-100"
          aria-current="page"
        >
          AI 없이 · 투표만
        </span>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-[#223141] dark:bg-[#16202A] sm:p-5 md:p-6 lg:p-7 xl:p-8">
        {!hasToken ? (
          <p className="text-sm text-zinc-700 dark:text-[#AFC6D8]">
            글 작성은 로그인 후 이용할 수 있어요.
          </p>
        ) : null}

        <div className={`space-y-4 ${hasToken ? "" : "mt-4"}`}>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2.5 dark:border-[#223141] dark:bg-zinc-900/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-sm">
                <span className="font-semibold text-zinc-800 dark:text-white">
                  카테고리
                </span>
                {categoryPickerMode === "auto" ? (
                  <span className="ml-2 text-zinc-700 dark:text-[#AFC6D8]">
                    {category || "…"}
                    {categoryAutoLoading ? " · 맞추는 중" : ""}
                  </span>
                ) : null}
              </div>
              {categoryPickerMode === "auto" ? (
                <button
                  type="button"
                  onClick={() => setCategoryPickerMode("manual")}
                  className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#16202A] dark:text-[#AFC6D8] dark:hover:bg-sky-950/35"
                >
                  직접
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCategoryPickerMode("auto")}
                  className="shrink-0 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-950/80"
                >
                  자동
                </button>
              )}
            </div>
            {categoryPickerMode === "manual" ? (
              <div className="mt-2">
                <CategorySelect
                  categories={categories}
                  value={category}
                  onChange={setCategory}
                />
              </div>
            ) : null}
          </div>

          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
            />
          </label>

          {similarDraft.length > 0 ? (
            <div className="rounded-xl border border-sky-200/70 bg-sky-50/70 p-3 shadow-sm shadow-sky-900/5 dark:border-[#223141] dark:bg-[#1B2733]">
              <ul className="list-none space-y-2 p-0">
                {similarDraft.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/posts/${p.id}`}
                      className="block rounded-lg border border-sky-200/60 bg-white px-3 py-2 text-sm text-zinc-900 transition hover:border-sky-400 hover:shadow-sm dark:border-[#223141] dark:bg-[#16202A] dark:text-white dark:hover:bg-sky-950/25"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{p.title}</span>
                        {(p.post_kind ?? "community") === "ai" ? (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900 dark:bg-[#2b1f4a] dark:text-white">
                            AI
                          </span>
                        ) : null}
                        <span className="text-xs text-sky-700 dark:text-sky-300">
                          {p.category}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            고민 내용
            <div className="mt-2">
              <RichComposer
                ref={composerRef}
                value={composerHtml}
                onChange={setComposerHtml}
                onPasteImage={async (file) => {
                  const token = getStoredToken();
                  if (!token) {
                    router.push("/login");
                    throw new Error("no token");
                  }
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
                    throw new Error("upload failed");
                  }
                  return typeof data.url === "string" ? data.url : "";
                }}
              />
            </div>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-100 dark:border-[#223141] dark:bg-[#1B2733] dark:text-[#AFC6D8] dark:hover:bg-sky-950/35"
              title="jpg·png·gif·webp, 최대 5MB"
            >
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

          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            태그 (쉼표로 구분, 최대 10개)
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-600 dark:text-[#AFC6D8]/80">
                추천 태그
                {tagSuggestLoading ? " (불러오는 중…)" : ""}
              </span>
              {tagSuggestions.length === 0 && !tagSuggestLoading ? (
                <span className="text-xs text-zinc-500 dark:text-[#AFC6D8]/60">
                  아직 추천이 없어요.
                </span>
              ) : null}
            </div>
            {tagSuggestions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {tagSuggestions.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTagFromSuggestion(t)}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:border-sky-400 hover:text-sky-800 dark:border-[#223141] dark:bg-[#16202A] dark:text-[#AFC6D8] dark:hover:border-sky-500/70"
                    title="클릭해서 태그에 추가/제거"
                  >
                    #{t}
                  </button>
                ))}
              </div>
            ) : null}
          </label>

          <OptionInputs
            options={options}
            onChange={setOption}
            onAdd={addOption}
            onRemove={removeOption}
            aiSuggest={{
              onClick: () => void handleSuggestDraft(),
              loading: draftSuggestLoading,
              notice: draftSuggestNotice || undefined,
            }}
          />

          <div className="pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || categories.length === 0}
              className="rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-900/20 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-400"
            >
              {submitting ? "등록 중..." : "등록하기"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
