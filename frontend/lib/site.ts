/** 배포 시 Vercel 환경 변수 `NEXT_PUBLIC_SITE_URL=https://picktalk.vercel.app` */

export const SITE_NAME = "PickTalk";
export const SITE_TAGLINE = "혼자 고민하지 말고 PickTalk";
export const SITE_HOME_DESC = `${SITE_TAGLINE}. 메인에서 인기·최근 고민을 보고 게시판에서 더 찾아보세요.`;

/** 헤더·본문·푸터 공통 — 가운데 정렬 + 읽기 좋은 최대 너비 (일반 커뮤니티 레이아웃) */
export const SHELL_WIDTH_CLASS =
  "mx-auto w-full max-w-7xl px-4 sm:px-5 md:px-7 lg:max-w-[80rem] lg:px-8 xl:max-w-[90rem] xl:px-10 2xl:max-w-[96rem] 2xl:px-12";

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export function sitePageTitle(pageTitle: string): string {
  return `${pageTitle} · ${SITE_NAME}`;
}
