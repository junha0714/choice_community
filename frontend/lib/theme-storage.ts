export const THEME_STORAGE_KEY = "choice-theme";

export type ThemePreference = "light" | "dark" | "system";

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

/** Toggle `.dark` on `<html>` to match preference. */
export function applyThemeToDocument(theme: ThemePreference): void {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function cycleTheme(current: ThemePreference): ThemePreference {
  if (current === "light") return "dark";
  if (current === "dark") return "system";
  return "light";
}

export function themePreferenceLabel(t: ThemePreference): string {
  if (t === "light") return "라이트";
  if (t === "dark") return "다크";
  return "시스템";
}
