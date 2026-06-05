"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Brain, MessageCircle, Zap } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";
import { SITE_NAME } from "@/lib/site";
import { getStoredToken } from "@/lib/auth-storage";
import { jsonAuthHeaders } from "@/lib/auth-headers";
import {
  AI_MODE_OPTIONS,
  DEFAULT_USER_SETTINGS,
  type UserSettings,
} from "@/lib/user-settings";
import {
  applyThemeToDocument,
  getStoredTheme,
  themePreferenceLabel,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme-storage";

const AI_MODE_ICONS = {
  quick: Zap,
  deep: Brain,
  friend: MessageCircle,
} as const;

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-[#223141] dark:bg-[#16202A] sm:p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-white">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-zinc-600 dark:text-[#AFC6D8]/85">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200/90 px-3 py-3 dark:border-[#2a3544]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "bg-sky-600 dark:bg-sky-500" : "bg-zinc-300 dark:bg-zinc-600",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [themeHydrated, setThemeHydrated] = useState(false);
  const [error, setError] = useState("");

  const patchSettings = useCallback(async (patch: Partial<UserSettings>) => {
    const token = getStoredToken();
    if (!token) return;
    setSettingsSaving(true);
    setSettingsMsg("");
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me/settings`, {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "설정 저장 실패"
        );
      }
      setSettings(data as UserSettings);
      setSettingsMsg("저장되었어요.");
      window.setTimeout(() => setSettingsMsg(""), 2000);
    } catch (e) {
      setSettingsMsg(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSettingsSaving(false);
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    Promise.all([
      fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${API_BASE_URL}/auth/me/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ])
      .then(async ([resMe, resSettings]) => {
        if (resMe.status === 401) {
          router.replace("/login");
          return;
        }
        if (!resMe.ok) throw new Error("프로필을 불러오지 못했습니다.");
        setAuthenticated(true);
        if (resSettings.ok) {
          setSettings((await resSettings.json()) as UserSettings);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "오류"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    setTheme(getStoredTheme());
    setThemeHydrated(true);
  }, []);

  useEffect(() => {
    if (!themeHydrated) return;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
    applyThemeToDocument(theme);
  }, [theme, themeHydrated]);

  useEffect(() => {
    if (!themeHydrated || theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeToDocument("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, themeHydrated]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-2xl text-zinc-900 dark:text-sky-100">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
          불러오는 중...
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="mx-auto w-full max-w-2xl text-zinc-900 dark:text-sky-100">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#223141] dark:bg-[#16202A]">
          <p className="text-sm">{error || "로그인이 필요합니다."}</p>
        </div>
      </main>
    );
  }

  const themeOptions: ThemePreference[] = ["light", "dark", "system"];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 text-zinc-900 dark:text-sky-100 sm:space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">설정</h1>

      {error ? <p className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}

      <SettingsCard
        title="AI 설정"
        description={`글쓰기할 때 기본으로 적용되는 ${SITE_NAME} AI 옵션이에요.`}
      >
        <p className="text-sm font-medium text-zinc-900 dark:text-white">기본 AI 모드</p>
        <div className="mt-2 space-y-2">
          {AI_MODE_OPTIONS.map((opt) => {
            const selected = settings.default_ai_mode === opt.id;
            const Icon = AI_MODE_ICONS[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  setSettings((s) => ({ ...s, default_ai_mode: opt.id }));
                  void patchSettings({ default_ai_mode: opt.id });
                }}
                className={[
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition disabled:opacity-60",
                  selected
                    ? "border-indigo-400 bg-indigo-50/90 ring-2 ring-indigo-300/40 dark:border-indigo-600/70 dark:bg-indigo-950/35 dark:ring-indigo-500/25"
                    : "border-zinc-200 hover:bg-zinc-50 dark:border-[#223141] dark:hover:bg-sky-950/30",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    selected
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-white">
                    {opt.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                    {opt.description}
                  </span>
                </span>
                <span
                  className={[
                    "h-4 w-4 shrink-0 rounded-full border-2",
                    selected
                      ? "border-indigo-600 bg-indigo-600 dark:border-indigo-400 dark:bg-indigo-400"
                      : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-transparent",
                  ].join(" ")}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <ToggleRow
            label="AI 대화 공개 기본값"
            description="새 AI 글 임시저장 시 질문·답변을 다른 사람에게도 보이게 해요."
            checked={settings.default_ai_transcript_public}
            disabled={settingsSaving}
            onChange={(next) => {
              setSettings((s) => ({ ...s, default_ai_transcript_public: next }));
              void patchSettings({ default_ai_transcript_public: next });
            }}
          />
        </div>
        {settingsMsg ? (
          <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">{settingsMsg}</p>
        ) : null}
      </SettingsCard>

      <SettingsCard title="알림 설정" description="받고 싶은 알림만 골라요.">
        <div className="space-y-2">
          <ToggleRow
            label="댓글 알림"
            description="내 글에 댓글이 달리면 알려줘요."
            checked={settings.notify_comment}
            disabled={settingsSaving}
            onChange={(next) => {
              setSettings((s) => ({ ...s, notify_comment: next }));
              void patchSettings({ notify_comment: next });
            }}
          />
          <ToggleRow
            label="답글 알림"
            description="내 댓글에 답글이 달리면 알려줘요."
            checked={settings.notify_reply}
            disabled={settingsSaving}
            onChange={(next) => {
              setSettings((s) => ({ ...s, notify_reply: next }));
              void patchSettings({ notify_reply: next });
            }}
          />
          <ToggleRow
            label="좋아요 알림"
            description="내 글에 좋아요가 달리면 알려줘요."
            checked={settings.notify_like}
            disabled={settingsSaving}
            onChange={(next) => {
              setSettings((s) => ({ ...s, notify_like: next }));
              void patchSettings({ notify_like: next });
            }}
          />
          <ToggleRow
            label="투표 종료 알림"
            description="투표 마감 시점에 알려줘요."
            checked={settings.notify_vote_end}
            disabled={settingsSaving}
            onChange={(next) => {
              setSettings((s) => ({ ...s, notify_vote_end: next }));
              void patchSettings({ notify_vote_end: next });
            }}
          />
        </div>
      </SettingsCard>

      <SettingsCard title="테마" description="화면 밝기를 선택해요.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {themeOptions.map((opt) => {
            const selected = theme === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setTheme(opt)}
                className={[
                  "rounded-xl border px-3 py-3 text-sm font-semibold transition",
                  selected
                    ? "border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100"
                    : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-[#223141] dark:text-[#AFC6D8] dark:hover:bg-sky-950/30",
                ].join(" ")}
              >
                {themePreferenceLabel(opt)} 모드
              </button>
            );
          })}
        </div>
      </SettingsCard>
    </main>
  );
}
