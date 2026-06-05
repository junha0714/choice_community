export const AUTH_TOKEN_STORAGE_KEY = "choice_community_access_token";
export const AUTH_SESSION_EVENT = "choice-auth-session";

/** 브라우저(탭)를 닫으면 사라지는 sessionStorage — PC/브라우저 껐다 켜면 다시 로그인 */
function authStore(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

/** 예전 localStorage 토큰(30일 유지) 제거 */
export function purgeLegacyLocalToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

export function getJwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadJson = decodeBase64Url(parts[1]);
    const payload = JSON.parse(payloadJson) as unknown;
    const exp =
      typeof payload === "object" &&
      payload != null &&
      "exp" in payload &&
      typeof (payload as Record<string, unknown>).exp === "number"
        ? (payload as Record<string, unknown>).exp
        : null;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    // JWT exp is seconds since epoch
    return exp * 1000;
  } catch {
    return null;
  }
}

export function getStoredTokenRaw(): string | null {
  const store = authStore();
  if (!store) return null;
  return store.getItem(AUTH_TOKEN_STORAGE_KEY);
}

/** API 호출용 — 만료 토큰은 null (삭제는 refresh 실패 시에만) */
export function getStoredToken(): string | null {
  const token = getStoredTokenRaw();
  if (!token) return null;
  const expMs = getJwtExpMs(token);
  if (expMs != null && Date.now() >= expMs) return null;
  return token;
}

export function hasStoredSession(): boolean {
  return !!getStoredTokenRaw();
}

export function notifyAuthSessionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

export function setStoredToken(token: string): void {
  purgeLegacyLocalToken();
  const store = authStore();
  if (!store) return;
  store.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  purgeLegacyLocalToken();
  const store = authStore();
  if (!store) return;
  store.removeItem(AUTH_TOKEN_STORAGE_KEY);
}
