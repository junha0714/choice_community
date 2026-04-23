"use client";

import { useEffect, useState } from "react";
import {
  applyThemeToDocument,
  cycleTheme,
  getStoredTheme,
  themePreferenceLabel,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme-storage";

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = getStoredTheme();
    setPreference(t);
    applyThemeToDocument(t);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      /* ignore */
    }
    applyThemeToDocument(preference);
  }, [preference, mounted]);

  const next = () => setPreference((p) => cycleTheme(p));
  const label = themePreferenceLabel(preference);

  const Icon = () => {
    if (!mounted) {
      return (
        <span className="h-4 w-4 rounded-full bg-sky-200/80 dark:bg-sky-800" />
      );
    }
    if (preference === "light") {
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 text-amber-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4" />
          <path
            strokeLinecap="round"
            d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
      );
    }
    if (preference === "dark") {
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 text-sky-300"
          fill="currentColor"
          aria-hidden
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    }
    return null;
  };

  return (
    <button
      type="button"
      onClick={next}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-200/90 bg-sky-50/90 px-2.5 py-1.5 text-xs font-medium text-sky-950 shadow-sm shadow-sky-900/10 transition hover:border-sky-300 hover:bg-sky-100/90 dark:border-sky-800/70 dark:bg-sky-950/50 dark:text-sky-100 dark:shadow-sky-950/30 dark:hover:border-sky-700 dark:hover:bg-sky-900/60"
      title={`테마: ${label} (클릭하여 전환)`}
      aria-label={`테마 ${label}, 클릭하면 전환됩니다`}
    >
      <span className="tabular-nums text-[11px] text-sky-700/90 dark:text-sky-300/90">
        {mounted ? label : "···"}
      </span>
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 ring-1 ring-sky-200/80 dark:bg-zinc-900 dark:ring-sky-700/60"
        aria-hidden
      >
        <Icon />
      </span>
    </button>
  );
}
