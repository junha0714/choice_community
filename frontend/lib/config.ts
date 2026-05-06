/**
 * FastAPI 백엔드 기본 URL
 *
 * - NEXT_PUBLIC_API_URL이 있으면 그 값을 우선 사용
 * - 배포(프로덕션)에서는 기본으로 /api(Next rewrite 프록시) 사용
 * - 로컬 개발에서는 기본으로 http://127.0.0.1:8000 사용
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production" ? "/api" : "http://127.0.0.1:8000");
