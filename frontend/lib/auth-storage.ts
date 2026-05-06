export const AUTH_TOKEN_STORAGE_KEY = "choice_community_access_token";

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

function getJwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadJson = decodeBase64Url(parts[1]);
    const payload = JSON.parse(payloadJson) as unknown;
    const exp =
      typeof payload === "object" && payload != null && "exp" in payload
        ? (payload as any).exp
        : null;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    // JWT exp is seconds since epoch
    return exp * 1000;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!token) return null;
  const expMs = getJwtExpMs(token);
  if (expMs != null && Date.now() >= expMs) {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    return null;
  }
  return token;
}

export function setStoredToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}
