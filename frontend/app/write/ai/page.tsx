"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import { messageFromApiDetail } from "@/lib/api-message";
import { toast } from "@/lib/toast";
import { mergeContentWithImages } from "@/lib/post-content-images";
import { hasDuplicateOptions, normalizeOptionList } from "@/lib/post-options";
import { uploadPostImage } from "@/lib/upload-post-image";
import { formMessages } from "@/lib/form-messages";
import { FieldHint, fieldInputClass } from "@/components/FieldHint";
import { OptionInputs } from "@/components/OptionInputs";
import { CategoryPicker } from "@/components/CategoryPicker";
import { AiReasonDisplay } from "@/components/AiReasonDisplay";
import {
  ImageAttachments,
  tryPasteImageFile,
} from "@/components/ImageAttachments";
import { AI_MODE_DEFAULT_STEPS } from "@/lib/user-settings";
import {
  NOTICE_CATEGORY,
  SUGGESTION_CATEGORY,
  isNoticeCategory,
} from "@/lib/board-categories";
import {
  Brain,
  Dices,
  MessageCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";

type AITranscriptItem = {
  step: number;
  question: string;
  answer: string | null;
};

type AIFlowQuestion = {
  type: "question";
  step: number;
  question: string;
  suggested_answers?: string[];
  transcript?: AITranscriptItem[];
};

type AIFlowResult = {
  type: "result";
  recommended: string;
  reason: string;
  low_confidence?: boolean;
  transcript?: AITranscriptItem[];
  draft_post_id?: number | null;
};

type AIFlow = AIFlowQuestion | AIFlowResult;

type AISessionStartResponse =
  | (AIFlowQuestion & { session_id: string })
  | (AIFlowResult & { session_id: string });

type AiConversationStyle = "quick" | "deep" | "friend" | "random_fun";

const AI_STYLE_OPTIONS: {
  id: AiConversationStyle;
  icon: LucideIcon;
  title: string;
  lines: string[];
  defaultSteps: number;
}[] = [
  {
    id: "quick",
    icon: Zap,
    title: "빠른 결정 모드",
    lines: [
      "가장 대중적이고 기본에 가까워요",
      "질문 수는 적게, 빠르게 결론 쪽으로",
      "지금 당장 정해야 할 때",
      "템포 빠른 대화",
    ],
    defaultSteps: 3,
  },
  {
    id: "deep",
    icon: Brain,
    title: "깊은 분석 모드",
    lines: [
      "성향·우선순위가 잘 드러나게",
      "질문을 조금 더 파고들어요",
      "끝에 선택지별 비교 요약(마크다운)",
      "이유를 차분하게 길게",
    ],
    defaultSteps: 7,
  },
  {
    id: "friend",
    icon: MessageCircle,
    title: "친구 상담 모드",
    lines: [
      "친구랑 톡하듯 반말 톤(이모지 없음)",
      "공감은 살짝, 과한 심리분석은 피함",
      "부담 없이 이어가요",
      "딱딱한 설문 느낌 줄이기",
    ],
    defaultSteps: 5,
  },
  {
    id: "random_fun",
    icon: Dices,
    title: "랜덤 결정 모드",
    lines: [
      "AI 질문 없이 바로 진행",
      "선택지 중 하나가 무작위로 뽑혀요",
      "뽑힌 것만 짧게 이유(비교 없음)",
      "가볍게 정할 때",
    ],
    defaultSteps: 3,
  },
];

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

type WriteFormErrors = {
  title?: string;
  content?: string;
  category?: string;
  options?: string;
  submit?: string;
};

export default function WriteAIPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"draft" | "chat" | "preview">("draft");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [boardCategories, setBoardCategories] = useState<string[]>([]);
  const [choiceCategories, setChoiceCategories] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [hasToken, setHasToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [publishingWithoutAi, setPublishingWithoutAi] = useState(false);
  const [aiMode, setAiMode] = useState<AiConversationStyle>("quick");
  /** AI 질문 라운드 수 (백엔드 3~10) */
  const [aiQuestionSteps, setAiQuestionSteps] = useState(
    AI_MODE_DEFAULT_STEPS.quick
  );
  const [tagsText, setTagsText] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [tagSuggestLoading, setTagSuggestLoading] = useState(false);
  const [similarDraft, setSimilarDraft] = useState<SimilarDraftPost[]>([]);

  const uploadImage = useCallback(
    async (file: File) => {
      const token = getStoredToken();
      if (!token) {
        toast.info(formMessages.loginToAttachImage);
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

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draftPostId, setDraftPostId] = useState<number | null>(null);
  const [flow, setFlow] = useState<AIFlow | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [draftSuggestLoading, setDraftSuggestLoading] = useState(false);
  const [draftSuggestNotice, setDraftSuggestNotice] = useState("");
  const [draftSuggestError, setDraftSuggestError] = useState("");
  /** 카테고리: AI 추천 vs 직접 선택 */
  const [categoryPickerMode, setCategoryPickerMode] = useState<"auto" | "manual">(
    "auto"
  );
  const [categoryAutoLoading, setCategoryAutoLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<WriteFormErrors>({});

  useEffect(() => {
    const token = getStoredToken();
    setHasToken(!!token);
    if (!token) {
      setIsAdmin(false);
      setAuthChecked(true);
      return;
    }
    fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setIsAdmin(!!u?.is_admin))
      .catch(() => setIsAdmin(false))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    const token = getStoredToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${API_BASE_URL}/meta/categories`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: string[] = d?.categories ?? [];
        const board: string[] = d?.board_categories ?? [];
        const choice: string[] = d?.choice_categories ?? [];
        const adminFromApi = d?.can_write_notice === true;
        const effectiveAdmin = isAdmin || adminFromApi;

        setCategories(list);
        setBoardCategories(board);
        setChoiceCategories(
          choice.length ? choice : list.filter((c) => !board.includes(c))
        );

        const writableBoard = board.filter(
          (c) =>
            c !== SUGGESTION_CATEGORY &&
            (c !== NOTICE_CATEGORY || effectiveAdmin)
        );
        const writeCats = [
          ...writableBoard,
          ...choice.filter((c) => !writableBoard.includes(c)),
        ];

        const want =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("category")?.trim() ||
              ""
            : "";

        const pickDefault = () => {
          if (want && writeCats.includes(want)) return want;
          if (writeCats.includes("기타")) return "기타";
          return (writeCats.find((c) => choice.includes(c)) ?? writeCats[0]) || "";
        };

        setCategory((prev) => {
          if (prev && writeCats.includes(prev)) return prev;
          return pickDefault();
        });
      })
      .catch(() => {});
  }, [authChecked, isAdmin]);

  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("category")?.trim();
    if (want === SUGGESTION_CATEGORY) {
      router.replace("/feedback");
      return;
    }
    if (!isAdmin || !categories.includes(NOTICE_CATEGORY)) return;
    if (want === NOTICE_CATEGORY) {
      setCategory(NOTICE_CATEGORY);
    }
  }, [isAdmin, categories, router]);

  const isNoticeWrite = isNoticeCategory(category);
  const isBoardWrite = isNoticeWrite;
  const optionsDuplicate = hasDuplicateOptions(normalizeOptionList(options));
  const optionsFieldError =
    formErrors.options ??
    (optionsDuplicate ? formMessages.optionsDuplicate : null);

  const clearFormError = (field: keyof WriteFormErrors) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const writableBoardCategories = boardCategories.filter(
    (c) =>
      c !== SUGGESTION_CATEGORY && (c !== NOTICE_CATEGORY || isAdmin)
  );
  const writeCategories = [
    ...writableBoardCategories,
    ...choiceCategories.filter((c) => !writableBoardCategories.includes(c)),
  ];
  const aiCategories = choiceCategories.length ? choiceCategories : writeCategories;

  useEffect(() => {
    if (isAdmin || !isNoticeCategory(category)) return;
    const fallback =
      writeCategories.find((c) => c === "기타") ??
      writeCategories[0] ??
      "";
    if (fallback) setCategory(fallback);
  }, [isAdmin, category, writeCategories]);

  const handleCategoryChange = (next: string) => {
    if (next === NOTICE_CATEGORY && !isAdmin) return;
    clearFormError("category");
    setCategory(next);
  };

  useEffect(() => {
    if (isBoardWrite) {
      setCategoryPickerMode("manual");
    }
  }, [isBoardWrite]);

  useEffect(() => {
    if (isBoardWrite) return;
    if (categoryPickerMode !== "auto" || aiCategories.length === 0) return;
    const t = title.trim();
    const c = content.trim();
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
          if (
            typeof cat === "string" &&
            aiCategories.includes(cat) &&
            !(cat === NOTICE_CATEGORY && !isAdmin)
          ) {
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
  }, [title, content, categoryPickerMode, aiCategories, isAdmin, isBoardWrite]);

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
          const uniq = Array.from(new Map(items.map((p) => [p.id, p])).values());
          setSimilarDraft(uniq.slice(0, 5));
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

  const validateDraft = (requireOptions: boolean) => {
    const errors: WriteFormErrors = {};
    if (!getStoredToken()) {
      toast.info(formMessages.loginToWrite);
      router.push("/login");
      return null;
    }
    const finalContent = mergeContentWithImages(content, imageUrls);
    if (!title.trim()) errors.title = formMessages.titleRequired;
    if (!content.trim() && imageUrls.length === 0) {
      errors.content = formMessages.contentRequired;
    }
    if (!category) {
      errors.category = formMessages.categoryLoading;
    }
    if (isNoticeCategory(category) && !isAdmin) {
      errors.category = formMessages.noticeAdminOnly;
    }
    let optionList: string[] = [];
    if (requireOptions) {
      optionList = normalizeOptionList(options);
      if (optionList.length < 2) {
        errors.options = formMessages.optionsMin;
      } else if (hasDuplicateOptions(optionList)) {
        errors.options = formMessages.optionsDuplicate;
      }
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors((prev) => ({ ...prev, ...errors, submit: undefined }));
      return null;
    }
    setFormErrors({});
    return { finalContent, optionList, tags: parseTagsText(tagsText) };
  };

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
    setDraftSuggestNotice("");
    setDraftSuggestError("");
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

  const handlePublishWithoutAi = async () => {
    const draft = validateDraft(!isBoardWrite);
    if (!draft) return;

    setPublishingWithoutAi(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          content: draft.finalContent,
          category,
          options: draft.optionList,
          post_kind: "community",
          tags: draft.tags.length ? draft.tags : undefined,
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
        setFormErrors((prev) => ({
          ...prev,
          submit: msg || formMessages.checkInput,
        }));
      } else {
        toast.error(messageFromApiDetail(data.detail, "게시글 작성 실패"));
      }
    } finally {
      setPublishingWithoutAi(false);
    }
  };

  const handleSubmit = async () => {
    const draft = validateDraft(true);
    if (!draft) return;
    if (isBoardWrite) {
      setFormErrors((prev) => ({
        ...prev,
        submit: formMessages.noticeUsePublish,
      }));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/ai-sessions/start`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          content: draft.finalContent,
          category,
          options: draft.optionList,
          ai_mode: aiMode,
          ai_question_steps: aiQuestionSteps,
          tags: draft.tags.length ? draft.tags : undefined,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as AISessionStartResponse;
        setSessionId(data.session_id);
        if (data.type === "result") {
          setFlow({
            type: "result",
            recommended: data.recommended ?? "",
            reason: data.reason ?? "",
            low_confidence: data.low_confidence ?? false,
            transcript: data.transcript ?? [],
            draft_post_id: data.draft_post_id ?? null,
          });
          if (typeof data.draft_post_id === "number") {
            setDraftPostId(data.draft_post_id);
          }
          setPhase("preview");
        } else {
          setFlow({
            type: "question",
            step: data.step,
            question: data.question,
            suggested_answers: data.suggested_answers,
            transcript: data.transcript ?? [],
          });
          setAnswerDraft("");
          setPhase("chat");
        }
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
        setFormErrors((prev) => ({
          ...prev,
          submit: msg || formMessages.checkInput,
        }));
      } else {
        toast.error(messageFromApiDetail(data.detail, "AI 시작 실패"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuggestDraft = async () => {
    const finalContent = mergeContentWithImages(content, imageUrls);
    const t = title.trim();
    const c = finalContent.trim();
    if (t.length + c.length < 10) {
      setDraftSuggestError(
        "제목과 본문을 조금 더 작성해 주시면 자동 제안이 잘 나옵니다."
      );
      return;
    }
    setDraftSuggestLoading(true);
    setDraftSuggestNotice("");
    setDraftSuggestError("");
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
        setDraftSuggestError(
          "자동 제안을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
        );
        return;
      }
      const opts = Array.isArray(d.options)
        ? d.options.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (opts.length < 2) {
        setDraftSuggestError(
          "선택지를 자동으로 만들기 어렵습니다. 제목·본문을 조금 더 작성해 주세요."
        );
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

  const handleNext = async (payload?: {
    action?: "answer" | "skip_question" | "finish_here";
    presetAnswer?: string;
  }) => {
    if (!sessionId) return;
    const action = payload?.action ?? "answer";
    if (action === "finish_here") {
      const ok = window.confirm(
        "남은 질문 없이 지금 추천 결과로 넘어갈까요? (입력한 한 줄이 있으면 함께 전달돼요.)"
      );
      if (!ok) return;
    }
    const a = (payload?.presetAnswer ?? answerDraft).trim();
    if (action === "answer" && !a) return;
    setChatLoading(true);
    try {
      const body =
        action === "skip_question" || action === "finish_here"
          ? { action, answer: a }
          : { answer: a };
      const res = await fetch(`${API_BASE_URL}/ai-sessions/${sessionId}/next`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as AIFlow | null;
      if (!res.ok || !data) {
        toast.error("AI 응답을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setAnswerDraft("");
      setFlow(data);
      if (data.type === "result") {
        if (typeof data.draft_post_id === "number") {
          setDraftPostId(data.draft_post_id);
        }
        setPhase("preview");
      } else setPhase("chat");
    } finally {
      setChatLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!sessionId) return;
    setChatLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/ai-sessions/${sessionId}/publish`, {
        method: "POST",
        headers: jsonAuthHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) {
        const detail =
          data && typeof data === "object" && "detail" in data
            ? (data as Record<string, unknown>).detail
            : null;
        toast.error(messageFromApiDetail(detail, "게시 실패"));
        return;
      }
      setSessionId(null);
      setDraftPostId(null);
      setFlow(null);
      setPhase("draft");
      const id =
        data && typeof data === "object" && "id" in data
          ? (data as Record<string, unknown>).id
          : null;
      if (typeof id === "number") router.push(`/posts/${id}`);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-full px-3 text-zinc-900 sm:max-w-xl sm:px-4 md:max-w-2xl md:px-5 lg:max-w-3xl lg:px-6 xl:max-w-4xl xl:px-8 2xl:max-w-4xl 2xl:px-10 dark:text-sky-100">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">글쓰기</h1>

      {phase === "chat" && flow && flow.type === "question" ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-[#223141] dark:bg-[#16202A] sm:p-5 md:p-6 lg:p-7 xl:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-zinc-500 dark:text-[#AFC6D8]/80">
              AI 대화
            </p>
            <button
              type="button"
              onClick={() => setPhase("draft")}
              className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-[#223141] dark:bg-[#16202A] dark:text-[#AFC6D8] dark:hover:bg-sky-950/35"
            >
              입력으로 돌아가기
            </button>
          </div>

          {(() => {
            const optionList = options.map((o) => o.trim()).filter(Boolean);
            const mentioned = optionList.filter((o) => flow.question.includes(o));
            const compareOptions =
              mentioned.length >= 2 ? mentioned : optionList;
            const progressPct = Math.min(
              100,
              Math.round((flow.step / Math.max(aiQuestionSteps, 1)) * 100)
            );
            const modeLabel =
              AI_STYLE_OPTIONS.find((o) => o.id === aiMode)?.title ?? "AI 대화";
            return (
              <div className="mt-3 rounded-xl border border-indigo-200/70 bg-linear-to-br from-indigo-50/70 via-white to-sky-50/80 p-4 dark:border-indigo-900/40 dark:from-indigo-950/30 dark:via-[#16202A] dark:to-sky-950/20">
                <div className="min-w-0">
                  {title.trim() ? (
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                      {title.trim()}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-[#8fa3b8]">
                    {[
                      modeLabel,
                      category ? category : null,
                      `${flow.step}번째 질문`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_minmax(7.5rem,9rem)] sm:items-end">
                  {compareOptions.length > 0 ? (
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-600 dark:text-[#9bb3c7]">
                        비교 중인 선택지
                      </p>
                      {compareOptions.length === 2 ? (
                        <div className="mt-2 flex items-stretch gap-2">
                          {compareOptions.map((opt, i) => {
                            const active = mentioned.includes(opt);
                            return (
                              <span key={opt} className="flex min-w-0 flex-1 items-center gap-2">
                                {i === 1 ? (
                                  <span
                                    className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
                                    aria-hidden
                                  >
                                    vs
                                  </span>
                                ) : null}
                                <span
                                  className={[
                                    "flex min-w-0 flex-1 items-center justify-center rounded-lg border px-3 py-2.5 text-center text-sm font-semibold",
                                    active
                                      ? "border-sky-300/90 bg-sky-100/90 text-sky-900 shadow-sm dark:border-sky-700/60 dark:bg-sky-950/50 dark:text-sky-100"
                                      : "border-zinc-200/90 bg-white/90 text-zinc-700 dark:border-zinc-700/70 dark:bg-zinc-900/50 dark:text-zinc-200",
                                  ].join(" ")}
                                >
                                  {opt}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {compareOptions.map((opt) => {
                            const active = mentioned.includes(opt);
                            return (
                              <span
                                key={opt}
                                className={[
                                  "rounded-lg border px-3 py-2 text-sm font-semibold",
                                  active
                                    ? "border-sky-300/90 bg-sky-100/90 text-sky-900 dark:border-sky-700/60 dark:bg-sky-950/50 dark:text-sky-100"
                                    : "border-zinc-200/90 bg-white/90 text-zinc-700 dark:border-zinc-700/70 dark:bg-zinc-900/50 dark:text-zinc-200",
                                ].join(" ")}
                              >
                                {opt}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div />
                  )}

                  <div className="rounded-lg border border-white/80 bg-white/70 px-3 py-2.5 dark:border-zinc-700/50 dark:bg-zinc-900/40">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold text-zinc-600 dark:text-[#9bb3c7]">
                        진행률
                      </p>
                      <p className="text-lg font-bold tabular-nums text-sky-800 dark:text-sky-200">
                        {flow.step}
                        <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
                          {" "}
                          / {aiQuestionSteps}
                        </span>
                      </p>
                    </div>
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200/90 dark:bg-zinc-700/80"
                      role="progressbar"
                      aria-valuenow={flow.step}
                      aria-valuemin={1}
                      aria-valuemax={aiQuestionSteps}
                      aria-label={`AI 질문 진행 ${flow.step} / ${aiQuestionSteps}`}
                    >
                      <div
                        className="h-full rounded-full bg-sky-600 transition-[width] duration-300 dark:bg-sky-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 text-sm text-zinc-800 dark:border-[#223141] dark:bg-[#1B2733] dark:text-[#AFC6D8]">
            <p className="text-xs font-semibold text-zinc-500 dark:text-[#AFC6D8]/70">
              지금까지 대화
            </p>
            {(() => {
              const pastTranscript = (flow.transcript ?? []).filter(
                (t) => (t.answer ?? "").trim().length > 0
              );
              return pastTranscript.length > 0 ? (
                <ol className="mt-3 list-none space-y-2 p-0">
                  {pastTranscript.map((t) => (
                    <li key={t.step} className="space-y-1">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                        Q{t.step}. {t.question}
                      </p>
                      <p className="text-sm text-zinc-700 dark:text-[#AFC6D8]">
                        A{t.step}. {t.answer}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-xs text-zinc-500 dark:text-[#8fa3b8]">
                  아직 답한 질문이 없어요.
                </p>
              );
            })()}
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-sky-200/80 bg-sky-50/50 p-4 dark:border-sky-900/40 dark:bg-sky-950/25">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300/90">
              지금 질문
            </p>
            <p className="text-base font-semibold leading-snug text-zinc-900 dark:text-white">
              Q{flow.step}. {flow.question}
            </p>
            {flow.suggested_answers && flow.suggested_answers.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {flow.suggested_answers.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void handleNext({ presetAnswer: suggestion })}
                    disabled={chatLoading}
                    className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-sky-900 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-100 dark:hover:bg-sky-950/50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="block text-sm font-medium text-zinc-800 dark:text-white">
              직접 답변
              <input
                type="text"
                value={answerDraft}
                onChange={(e) => setAnswerDraft(e.target.value)}
                placeholder="직접 입력해 주세요"
                className={`mt-1 w-full ${fieldInputClass(false)}`}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleNext({ action: "answer" })}
                disabled={chatLoading || !answerDraft.trim()}
                className="rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-900/20 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-400"
              >
                {chatLoading ? "처리 중..." : "다음"}
              </button>
              <button
                type="button"
                onClick={() => void handleNext({ action: "skip_question" })}
                disabled={chatLoading}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#223141] dark:bg-[#1B2733] dark:text-[#cbd5e1] dark:hover:bg-sky-950/35"
              >
                질문 건너뛰기
              </button>
              <button
                type="button"
                onClick={() => void handleNext({ action: "finish_here" })}
                disabled={chatLoading}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
              >
                바로 추천 받기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {phase === "preview" && flow && flow.type === "result" ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-[#223141] dark:bg-[#16202A] sm:p-5 md:p-6 lg:p-7 xl:p-8">
          <p className="text-xs font-semibold text-zinc-500 dark:text-[#AFC6D8]/80">
            AI 결과 확인
          </p>
          <div className="mt-2 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-3 py-2.5 text-sm text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100">
            <p>
              결과가{" "}
              <Link href="/mypage" className="font-semibold underline underline-offset-2">
                마이페이지
              </Link>
              에 임시저장되었어요. 준비되면 게시하기를 눌러 공개할 수 있어요.
            </p>
            {draftPostId ? (
              <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-200/80">
                <Link
                  href={`/posts/${draftPostId}`}
                  className="font-medium underline underline-offset-2"
                >
                  저장된 글 미리보기
                </Link>
              </p>
            ) : null}
          </div>
          {(() => {
            const comparedOptions = options.map((o) => o.trim()).filter(Boolean);
            const recommended = flow.recommended.trim();
            if (comparedOptions.length === 0) return null;
            return (
              <div className="mt-3 rounded-lg border border-zinc-200/90 bg-zinc-50/80 px-3 py-3 dark:border-[#2a3544] dark:bg-[#141c26]">
                <p className="text-xs font-semibold text-zinc-600 dark:text-[#9bb3c7]">
                  비교한 선택지
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {comparedOptions.map((opt) => {
                    const isRecommended = opt === recommended;
                    return (
                      <span
                        key={opt}
                        className={[
                          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold",
                          isRecommended
                            ? "border-sky-300/90 bg-sky-100/90 text-sky-900 shadow-sm dark:border-sky-700/60 dark:bg-sky-950/50 dark:text-sky-100"
                            : "border-zinc-200/90 bg-white/90 text-zinc-600 dark:border-zinc-700/70 dark:bg-zinc-900/50 dark:text-zinc-300",
                        ].join(" ")}
                      >
                        {opt}
                        {isRecommended ? (
                          <span className="rounded-md bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-sky-500">
                            추천
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <h2 className="mt-3 text-xl font-semibold text-zinc-900 dark:text-white">
            추천: {flow.recommended}
          </h2>
          {flow.low_confidence ? (
            <p className="mt-2 text-sm text-amber-800/90 dark:text-amber-200/90">
              대화가 짧아 확신도가 낮을 수 있어요.
            </p>
          ) : null}
          <div className="mt-4">
            <AiReasonDisplay text={flow.reason} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={chatLoading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500/90 dark:hover:bg-indigo-400/90"
            >
              {chatLoading ? "게시 중..." : "게시하기"}
            </button>
          </div>
        </div>
      ) : null}

      {phase === "draft" && !isBoardWrite ? (
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-[#223141] dark:bg-[#16202A] sm:p-5 md:p-6 lg:p-7">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">대화 스타일</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {AI_STYLE_OPTIONS.map((opt) => {
            const selected = aiMode === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setAiMode(opt.id);
                  setAiQuestionSteps(opt.defaultSteps);
                }}
                className={[
                  "rounded-xl border p-3 text-left transition",
                  selected
                    ? "border-indigo-400 bg-indigo-50/90 ring-2 ring-indigo-300/50 dark:border-indigo-600/70 dark:bg-indigo-950/35 dark:ring-indigo-500/30"
                    : "border-zinc-200 hover:bg-zinc-50 dark:border-[#223141] dark:hover:bg-sky-950/30",
                ].join(" ")}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={[
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      selected
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300",
                    ].join(" ")}
                    aria-hidden
                  >
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      {opt.title}
                    </p>
                    {selected ? (
                      <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[11px] leading-snug text-zinc-600 dark:text-[#AFC6D8]/95">
                        {opt.lines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {aiMode !== "random_fun" ? (
          <>
            <p className="mt-5 text-sm font-semibold text-zinc-900 dark:text-white">
              질문 횟수
            </p>
            <label className="mt-2 block text-sm font-medium text-zinc-800 dark:text-white">
              <select
                value={aiQuestionSteps}
                onChange={(e) => setAiQuestionSteps(Number(e.target.value))}
                className="mt-1 w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
              >
                {Array.from({ length: 8 }, (_, i) => i + 3).map((n) => (
                  <option key={n} value={n}>
                    {n}회
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <p className="mt-5 text-xs text-zinc-600 dark:text-[#AFC6D8]/90">
            질문 없이 선택지 하나를 무작위로 고르고, 그 항목만 짧게 이유를 적어요.
          </p>
        )}
      </div>
      ) : null}

      {phase === "draft" ? (
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-[#223141] dark:bg-[#16202A] sm:p-5 md:p-6 lg:p-7 xl:p-8">
        {!hasToken ? (
          <p className="text-sm text-zinc-700 dark:text-[#AFC6D8]">
            글 작성은 로그인 후 이용할 수 있습니다.
          </p>
        ) : null}

        <div className={`space-y-4 ${hasToken ? "" : "mt-4"}`}>
          <div>
            <CategoryPicker
              categories={writeCategories}
              boardCategories={writableBoardCategories}
              choiceCategories={choiceCategories}
              value={
                writeCategories.includes(category)
                  ? category
                  : writeCategories[0] || ""
              }
              onChange={handleCategoryChange}
              mode={isBoardWrite ? "manual" : categoryPickerMode}
              onModeChange={setCategoryPickerMode}
              autoLoading={categoryAutoLoading}
              manualOnly={isBoardWrite}
            />
            <FieldHint message={formErrors.category} />
          </div>

          {isNoticeWrite ? (
            <p className="rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm text-amber-950 dark:border-amber-800/55 dark:bg-amber-950/35 dark:text-amber-100">
              <strong>공지 글</strong> — 관리자만 작성할 수 있습니다. 투표 없이 안내·공지용으로
              올라갑니다.
            </p>
          ) : null}
          <label className="block text-sm font-medium text-zinc-800 dark:text-white">
            제목
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                clearFormError("title");
              }}
              aria-invalid={!!formErrors.title}
              className={`mt-1 w-full ${fieldInputClass(!!formErrors.title)}`}
            />
            <FieldHint message={formErrors.title} />
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
              placeholder="고민을 적어 주세요. 사진은 아래에서 첨부할 수 있습니다."
              aria-invalid={!!formErrors.content}
              className={`mt-2 w-full ${fieldInputClass(!!formErrors.content)}`}
            />
            <FieldHint message={formErrors.content} />
            <ImageAttachments
              images={imageUrls}
              onChange={setImageUrls}
              onUpload={uploadImage}
            />
          </label>

          <label className="block text-sm font-medium text-zinc-700 dark:text-white">
            태그 (쉼표로 구분)
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

          {!isBoardWrite ? (
            <OptionInputs
              options={options}
              onChange={setOption}
              onAdd={addOption}
              onRemove={removeOption}
              errorMessage={optionsFieldError}
              aiSuggest={{
                onClick: () => void handleSuggestDraft(),
                loading: draftSuggestLoading,
                notice: draftSuggestNotice || undefined,
                error: draftSuggestError || undefined,
              }}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <FieldHint
              message={formErrors.submit}
              className="mb-0 w-full sm:mr-auto sm:w-auto"
            />
            {isBoardWrite ? (
              <button
                type="button"
                onClick={() => void handlePublishWithoutAi()}
                disabled={publishingWithoutAi || writeCategories.length === 0}
                className="rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-900/20 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-400"
              >
                {publishingWithoutAi ? "등록 중..." : "공지 등록"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={
                    submitting ||
                    writeCategories.length === 0 ||
                    !!optionsFieldError
                  }
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500/90 dark:hover:bg-indigo-400/90"
                >
                  {submitting
                    ? aiMode === "random_fun"
                      ? "뽑는 중..."
                      : "준비 중..."
                    : "AI와 함께 고민하기"}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePublishWithoutAi()}
                  disabled={
                    publishingWithoutAi ||
                    writeCategories.length === 0 ||
                    !!optionsFieldError
                  }
                  className="rounded-lg border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#223141] dark:bg-[#1B2733] dark:text-sky-100 dark:hover:bg-sky-950/35"
                >
                  {publishingWithoutAi ? "게시 중..." : "바로 게시하기"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      ) : null}
    </main>
  );
}
