import { API_BASE_URL } from "@/lib/config";

export type OAuthProviders = {
  google: boolean;
  kakao: boolean;
};

export async function fetchOAuthProviders(): Promise<OAuthProviders> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/oauth/providers`, {
      cache: "no-store",
    });
    if (!res.ok) return { google: false, kakao: false };
    const data = (await res.json()) as OAuthProviders;
    return {
      google: Boolean(data.google),
      kakao: Boolean(data.kakao),
    };
  } catch {
    return { google: false, kakao: false };
  }
}

export function oauthStartUrl(provider: "google" | "kakao"): string {
  return `${API_BASE_URL}/auth/oauth/${provider}/start`;
}
