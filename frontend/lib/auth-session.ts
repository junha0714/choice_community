import { API_BASE_URL } from "@/lib/config";
import {
  AUTH_SESSION_EVENT,
  clearStoredToken,
  getJwtExpMs,
  getStoredTokenRaw,
  notifyAuthSessionChanged,
  setStoredToken,
} from "@/lib/auth-storage";

const REFRESH_SOON_MS = 24 * 60 * 60 * 1000;

export async function refreshAccessToken(): Promise<boolean> {
  const raw = getStoredTokenRaw();
  if (!raw) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${raw}` },
    });
    if (!res.ok) {
      clearStoredToken();
      notifyAuthSessionChanged();
      return false;
    }
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) {
      clearStoredToken();
      notifyAuthSessionChanged();
      return false;
    }
    setStoredToken(json.access_token);
    notifyAuthSessionChanged();
    return true;
  } catch {
    return false;
  }
}

/** 만료됐거나 곧 만료되면 조용히 토큰 갱신 */
export async function refreshAccessTokenIfNeeded(): Promise<boolean> {
  const raw = getStoredTokenRaw();
  if (!raw) return false;
  const expMs = getJwtExpMs(raw);
  const now = Date.now();
  const expired = expMs != null && now >= expMs;
  const expiringSoon = expMs != null && now >= expMs - REFRESH_SOON_MS;
  if (!expired && !expiringSoon) return true;
  return refreshAccessToken();
}
