"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import { toast } from "@/lib/toast";
import {
  mergeContentWithImages,
  splitContentImages,
} from "@/lib/post-content-images";
import { hasDuplicateOptions, normalizeOptionList } from "@/lib/post-options";
import { formMessages } from "@/lib/form-messages";
import { FieldHint, fieldInputClass } from "@/components/FieldHint";
import { uploadPostImage } from "@/lib/upload-post-image";
import { OptionInputs } from "@/components/OptionInputs";
import { CategorySelect } from "@/components/CategorySelect";
import {
  ImageAttachments,
  tryPasteImageFile,
} from "@/components/ImageAttachments";

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type EditFormErrors = {
  title?: string;
  content?: string;
  category?: string;
  options?: string;
};

export default function EditPostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [voteDeadlineLocal, setVoteDeadlineLocal] = useState("");
  const [formErrors, setFormErrors] = useState<EditFormErrors>({});
  const uploadImage = useCallback(
    async (file: File) => {
      const token = getStoredToken();
      if (!token) {
        router.push("/login");
        throw new Error("no token");
      }
      try {
        return await uploadPostImage(file, token);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "업로드 실패");
        throw e;
      }
    },
    [router]
  );

  const optionsDuplicate = hasDuplicateOptions(normalizeOptionList(options));
  const optionsFieldError =
    formErrors.options ??
    (optionsDuplicate ? formMessages.optionsDuplicate : null);

  const clearFormError = (field: keyof EditFormErrors) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    const token = getStoredToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${API_BASE_URL}/meta/categories`, { headers })
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
    fetch(`${API_BASE_URL}/posts/${params.id}?count_view=false`, {
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
            const split = splitContentImages(post.content ?? "");
            setContent(split.text);
            setImageUrls(split.images);
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
    clearFormError("options");
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
    const errors: EditFormErrors = {};
    if (!title.trim()) errors.title = formMessages.titleRequired;
    if (!content.trim() && imageUrls.length === 0) {
      errors.content = formMessages.contentRequired;
    }
    if (!category) errors.category = formMessages.categoryRequired;
    const optionList = normalizeOptionList(options);
    if (optionList.length < 2) {
      errors.options = formMessages.optionsMin;
    } else if (hasDuplicateOptions(optionList)) {
      errors.options = formMessages.optionsDuplicate;
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
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
          content: mergeContentWithImages(content, imageUrls),
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
            onChange={(e) => {
              setTitle(e.target.value);
              clearFormError("title");
            }}
            aria-invalid={!!formErrors.title}
            className={`mt-1 w-full ${fieldInputClass(!!formErrors.title, "focus:border-indigo-500 focus:ring-indigo-200 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30")}`}
          />
          <FieldHint message={formErrors.title} />
        </label>
        <label className="block text-sm font-medium text-zinc-700 dark:text-[#AFC6D8]">
          고민 내용
          <textarea
            value={content}
            spellCheck={false}
            autoCorrect="off"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            onChange={(e) => {
              setContent(e.target.value);
              clearFormError("content");
            }}
            onPaste={(e) => {
              void tryPasteImageFile(
                e,
                uploadImage,
                (url) => setImageUrls((prev) => [...prev, url]),
                imageUrls.length >= 10
              );
            }}
            rows={8}
            aria-invalid={!!formErrors.content}
            className={`mt-1 w-full ${fieldInputClass(!!formErrors.content, "focus:border-indigo-500 focus:ring-indigo-200 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30")}`}
          />
          <FieldHint message={formErrors.content} />
          <ImageAttachments
            images={imageUrls}
            onChange={setImageUrls}
            onUpload={uploadImage}
          />
        </label>
        <label className="block text-sm font-medium text-zinc-700 dark:text-[#AFC6D8]">
          태그 (쉼표로 구분)
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
          />
        </label>
        <div>
          <CategorySelect
            categories={categories}
            value={category}
            onChange={(v) => {
              setCategory(v);
              clearFormError("category");
            }}
          />
          <FieldHint message={formErrors.category} />
        </div>
        <OptionInputs
          options={options}
          onChange={setOption}
          onAdd={addOption}
          onRemove={removeOption}
          errorMessage={optionsFieldError}
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || !!optionsFieldError}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500/90 dark:hover:bg-indigo-400/90"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </main>
  );
}
