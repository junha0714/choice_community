import { getStoredToken } from "@/lib/auth-storage";

type AppRouter = { push: (href: string) => void };

/**
 * 투표/AI 글쓰기 진입 전 로그인 여부 확인. 비로그인이면 안내 후 /login 으로 보냄.
 */
export function tryNavigateToWrite(router: AppRouter, path: "/write" | "/write/ai"): void {
  if (!getStoredToken()) {
    const kind =
      path === "/write"
        ? "투표 고민 글을 등록하려면 먼저 로그인해 주세요."
        : "AI 고민 글을 등록하려면 먼저 로그인해 주세요.";
    alert(`${kind}\n계정이 없으면 회원가입 후 로그인해 주세요.`);
    router.push("/login");
    return;
  }
  router.push(path);
}
