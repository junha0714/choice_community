import { getStoredToken } from "@/lib/auth-storage";
import { toast } from "@/lib/toast";

type AppRouter = { push: (href: string) => void };

/**
 * 글쓰기 진입 전 로그인 여부 확인. 비로그인이면 안내 후 /login 으로 보냄.
 */
export function tryNavigateToWrite(router: AppRouter): void {
  if (!getStoredToken()) {
    toast.info("글쓰기를 이용하려면 먼저 로그인해 주세요.\n계정이 없으면 회원가입 후 로그인해 주세요.");
    router.push("/login");
    return;
  }
  router.push("/write/ai");
}
