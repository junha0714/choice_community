/**
 * FastAPI 호출 기준 URL
 *
 * - NEXT_PUBLIC_API_URL 이 있으면 그 값을 사용
 * - 없으면 항상 `/api` (Next rewrites로 백엔드로 전달 → 브라우저는 같은 출처만 호출, CORS 불필요)
 *
 * 로컬: next.config 의 rewrite 가 BACKEND_URL 없을 때 `http://127.0.0.1:8000` 으로 붙습니다.
 * 다른 포트/호스트면 frontend/.env.local 에 예: BACKEND_URL=http://127.0.0.1:9000
 */
const configuredApiUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim();
const defaultApiUrl = "/api";

export const API_BASE_URL = (configuredApiUrl || defaultApiUrl).replace(/\/$/, "");
