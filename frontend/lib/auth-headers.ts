import { getStoredToken } from "@/lib/auth-storage";

/** JSON 요청 + 로그인 시 Bearer 토큰 */
export function jsonAuthHeaders(): HeadersInit {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
