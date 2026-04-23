"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import { OptionInputs } from "@/components/OptionInputs";
import { CategorySelect } from "@/components/CategorySelect";

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
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [options, setOptions] = useState(["", ""]);
  const [hasToken, setHasToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tagsText, setTagsText] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [tagSuggestLoading, setTagSuggestLoading] = useState(false);
  const [voteDeadlineLocal, setVoteDeadlineLocal] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [similarDraft, setSimilarDraft] = useState<SimilarDraftPost[]>([]);
  const [similarDraftLoading, setSimilarDraftLoading] = useState(false);

  useEffect(() => {
    setHasToken(!!getStoredToken());
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/meta/categories`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: string[] = d?.categories ?? [];
        setCategories(list);
        setCategory((prev) => prev || list[0] || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = title.trim();
    if (q.length < 2) {
      setSimilarDraft([]);
      setSimilarDraftLoading(false);
      return;
    }
    setSimilarDraftLoading(true);
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
        .catch(() => setSimilarDraft([]))
        .finally(() => setSimilarDraftLoading(false));
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
    const c = content.trim();
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
  }, [title, content, category, tagsText]);

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
    if (!getStoredToken()) {
      alert("로그인한 뒤에 글을 작성할 수 있어요.");
      router.push("/login");
      return;
    }
    if (!title.trim() || !content.trim()) {
      alert("제목과 고민 내용을 입력해줘");
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
    const tags = parseTagsText(tagsText);

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          category,
          options: optionList,
          post_kind: "community",
          tags: tags.length ? tags : undefined,
          vote_deadline_at: voteDeadlineLocal
            ? new Date(voteDeadlineLocal).toISOString()
            : undefined,
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
    <main className="mx-auto w-full max-w-3xl text-zinc-900 dark:text-sky-100">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">커뮤니티 투표 고민</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/write/ai"
            className="text-sky-700 hover:underline dark:text-sky-300"
          >
            AI와 고민하기 →
          </Link>
          <Link href="/" className="text-zinc-600 hover:underline dark:text-sky-300/80">
            ← 목록
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
        <p className="text-sm text-zinc-700 dark:text-[#AFC6D8]">
        {!hasToken
          ? "글 작성은 로그인 후 이용할 수 있어요."
          : "다른 사람들이 선택지에 투표하고 댓글로 반응해요. 카테고리는 아래에서 직접 고르세요."}
        </p>

        <div className="mt-5 space-y-4">
          <CategorySelect
            categories={categories}
            value={category}
            onChange={setCategory}
          />

          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
            />
          </label>

          <div className="rounded-xl border border-sky-200/70 bg-sky-50/70 p-4 shadow-sm shadow-sky-900/5 dark:border-[#223141] dark:bg-[#1B2733]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-sky-950 dark:text-white">
                비슷한 고민이 이미 있을지도 몰라요
              </p>
              {similarDraftLoading ? (
                <span className="text-xs text-sky-700/80 dark:text-[#AFC6D8]">
                  찾는 중…
                </span>
              ) : null}
            </div>
            {similarDraft.length === 0 ? (
              <p className="mt-1 text-sm text-sky-900/70 dark:text-[#AFC6D8]/85">
                제목을 2자 이상 입력하면 비슷한 글을 보여줘요.
              </p>
            ) : (
              <ul className="mt-3 list-none space-y-2 p-0">
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
            )}
          </div>

          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            고민 내용
            <textarea
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="고민 내용 (이미지는 아래에서 업로드하면 본문에 삽입됩니다)"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
              style={{ minHeight: 160 }}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-100 dark:border-[#223141] dark:bg-[#1B2733] dark:text-[#AFC6D8] dark:hover:bg-sky-950/35">
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(e) => void handleImagePick(e)}
                disabled={uploadingImage}
              />
              {uploadingImage ? "업로드 중…" : "본문에 사진 넣기"}
            </label>
            <span className="text-xs text-zinc-600 dark:text-[#AFC6D8]/80">
              jpg·png·gif·webp, 최대 5MB
            </span>
          </div>

          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            태그 (쉼표로 구분, 최대 10개)
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="예: 연애, 직장"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-sky-500/70 dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
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
          />

          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            투표 마감 (선택)
            <input
              type="datetime-local"
              value={voteDeadlineLocal}
              onChange={(e) => setVoteDeadlineLocal(e.target.value)}
              className="mt-1 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
            />
            <span className="mt-1 block text-xs font-normal text-zinc-600 dark:text-[#AFC6D8]/80">
              비워 두면 마감 없이 계속 투표할 수 있어요. 이 기기에서 보이는 로컬 시각으로
              저장됩니다.
            </span>
          </label>

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
