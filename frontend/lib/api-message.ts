/** FastAPI `detail` 필드를 사용자 메시지로 변환 */
export function messageFromApiDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msg = detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          const m = (item as { msg?: unknown }).msg;
          return typeof m === "string" ? m : "";
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
    if (msg) return msg;
  }
  return fallback;
}
