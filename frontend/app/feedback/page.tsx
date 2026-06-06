"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import { messageFromApiDetail } from "@/lib/api-message";
import { toast } from "@/lib/toast";
import { formMessages } from "@/lib/form-messages";
import { FieldHint, fieldInputClass } from "@/components/FieldHint";
import { CARD, PAGE_STACK } from "@/lib/ui-classes";
import { SUGGESTION_CATEGORY } from "@/lib/board-categories";

export default function FeedbackPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [formErrors, setFormErrors] = useState<{ title?: string; content?: string; submit?: string }>({});

  useEffect(() => {
    if (!getStoredToken()) {
      toast.info("피드백을 남기려면 먼저 로그인해 주세요.\n계정이 없으면 회원가입 후 로그인해 주세요.");
      router.replace("/login");
      return;
    }
    setAuthChecked(true);
  }, [router]);

  const handleSubmit = async () => {
    if (!getStoredToken()) {
      router.push("/login");
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const errors: { title?: string; content?: string } = {};
    if (!trimmedTitle) errors.title = formMessages.titleRequired;
    if (!trimmedContent) errors.content = formMessages.contentRequired;
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          title: trimmedTitle,
          content: trimmedContent,
          category: SUGGESTION_CATEGORY,
          options: [],
          post_kind: "community",
        }),
      });

      if (res.ok) {
        const post = await res.json();
        router.push(`/posts/${post.id}`);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        toast.info(formMessages.loginRequired);
        router.push("/login");
      } else if (res.status === 422 && Array.isArray(data.detail)) {
        const msg = data.detail
          .map((e: { msg?: string }) => e.msg)
          .filter(Boolean)
          .join(" ");
        setFormErrors({ submit: msg || formMessages.checkInput });
      } else {
        toast.error(messageFromApiDetail(data.detail, "피드백 등록에 실패했습니다."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!authChecked) {
    return (
      <div className={PAGE_STACK}>
        <main className={`${CARD} mx-auto max-w-xl text-center text-sm text-zinc-600 dark:text-[#9bb3c7]`}>
          로그인 확인 중…
        </main>
      </div>
    );
  }

  return (
    <div className={PAGE_STACK}>
    <main className="mx-auto w-full max-w-xl text-zinc-900 dark:text-sky-100">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">피드백 남기기</h1>

      <div className={`${CARD}`}>
        <p className="text-sm text-violet-950 dark:text-violet-100/95">
          서비스 개선·버그 제보·아이디어를 자유롭게 남겨 주세요. 투표나 AI 대화 없이 바로
          등록됩니다.
        </p>

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            제목
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setFormErrors((prev) => ({ ...prev, title: undefined }));
              }}
              placeholder="예: 다크모드에서 글 목록이 잘 안 보여요"
              aria-invalid={!!formErrors.title}
              className={`mt-1 w-full ${fieldInputClass(!!formErrors.title, "focus:border-violet-500 focus:ring-violet-300/60 dark:focus:border-violet-400 dark:focus:ring-violet-500/30")}`}
            />
            <FieldHint message={formErrors.title} />
          </label>

          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            내용
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setFormErrors((prev) => ({ ...prev, content: undefined }));
              }}
              rows={10}
              placeholder="어떤 점이 불편했는지, 어떻게 개선되면 좋을지 적어 주세요."
              aria-invalid={!!formErrors.content}
              className={`mt-1 w-full resize-y ${fieldInputClass(!!formErrors.content, "leading-relaxed focus:border-violet-500 focus:ring-violet-300/60 dark:focus:border-violet-400 dark:focus:ring-violet-500/30")}`}
            />
            <FieldHint message={formErrors.content} />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <FieldHint message={formErrors.submit} className="mb-0 w-full sm:mr-auto sm:w-auto" />
            <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-violet-500 dark:hover:bg-violet-400"
          >
            {submitting ? "등록 중..." : "피드백 등록"}
          </button>
          </div>
        </div>
      </div>
    </main>
    </div>
  );
}
