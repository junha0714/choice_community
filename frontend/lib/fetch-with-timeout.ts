/**
 * fetch가 끝없이 대기하지 않도록 타임아웃을 걸고,
 * 실패 시 사용자에게 원인을 알리기 쉽게 합니다.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 15000, signal: outerSignal, ...rest } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  if (outerSignal) {
    if (outerSignal.aborted) {
      clearTimeout(id);
      throw new DOMException("Aborted", "AbortError");
    }
    outerSignal.addEventListener("abort", () => {
      clearTimeout(id);
      controller.abort();
    });
  }

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
