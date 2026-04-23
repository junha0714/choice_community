/** 배포 시 `NEXT_PUBLIC_SITE_URL`에 실제 도메인(https://...) 설정 */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
