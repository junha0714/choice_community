"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import { OptionInputs } from "@/components/OptionInputs";
import { CategorySelect } from "@/components/CategorySelect";

export default function WriteAIPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [options, setOptions] = useState(["", ""]);
  const [hasToken, setHasToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiMode, setAiMode] = useState<"simple" | "detailed">("simple");

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
          post_kind: "ai",
          ai_mode: aiMode,
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
    <main className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          AI와 함께 고민하기
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/write" className="text-zinc-600 hover:underline">
            ← 투표만 받기
          </Link>
          <Link href="/" className="text-zinc-500 hover:underline">
            목록
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 text-sm text-indigo-950">
        <p className="font-medium">이 경로로 쓴 글에서만 AI가 질문을 이어 가며 추천을 도와줘요.</p>
        <p className="mt-1 text-indigo-900/90">
          커뮤니티의 의견은 아래 선택지 <strong>투표</strong>로 받을 수 있어요. 투표와 AI 추천은 서로 다른 방식이에요.
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-zinc-800">AI 대화 스타일</p>
        <div className="mt-3 space-y-3">
          <label
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 hover:bg-zinc-50 ${
              aiMode === "simple"
                ? "border-indigo-300 bg-indigo-50/60"
                : "border-zinc-200"
            }`}
          >
            <input
              type="radio"
              name="ai-mode"
              checked={aiMode === "simple"}
              onChange={() => setAiMode("simple")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-zinc-900">간단</span>
              <span className="mt-0.5 block text-xs text-zinc-600">
                질문 3번 후 짧은 추천·이유 (지금까지와 비슷한 분량)
              </span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 hover:bg-zinc-50 ${
              aiMode === "detailed"
                ? "border-violet-300 bg-violet-50/60"
                : "border-zinc-200"
            }`}
          >
            <input
              type="radio"
              name="ai-mode"
              checked={aiMode === "detailed"}
              onChange={() => setAiMode("detailed")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-zinc-900">상세 비교</span>
              <span className="mt-0.5 block text-xs text-zinc-600">
                질문 5번 후, 각 선택지마다 장단점·상황별 비교가 길게 붙는 추천
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-600">
          {!hasToken
            ? "글 작성은 로그인 후 이용할 수 있어요."
            : "등록 후 상세 페이지에서 AI 질문을 시작할 수 있어요. 카테고리는 아래에서 직접 고르세요."}
        </p>

        <div className="mt-5 space-y-4">
          <CategorySelect
            categories={categories}
            value={category}
            onChange={setCategory}
          />

          <label className="block text-sm font-medium text-zinc-700">
            제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-700">
            고민 내용
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="고민 내용"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              style={{ minHeight: 160 }}
            />
          </label>

          <OptionInputs
            options={options}
            onChange={setOption}
            onAdd={addOption}
            onRemove={removeOption}
          />

          <div className="pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || categories.length === 0}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "등록 중..." : "등록하고 AI 시작할 글 만들기"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
