export const THEME_STORAGE_KEY = "choice-theme";

export type ThemePreference = "light" | "dark";

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "light";
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  if (v === "light" || v === "dark") return v;
  return "light";
}

/** Toggle `.dark` on `<html>` to match preference. */
export function applyThemeToDocument(theme: ThemePreference): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function cycleTheme(current: ThemePreference): ThemePreference {
  if (current === "light") return "dark";
  return "light";
}

export function themePreferenceLabel(t: ThemePreference): string {
  if (t === "light") return "라이트";
  return "다크";
}
