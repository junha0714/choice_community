import { API_BASE_URL } from "@/lib/config";
import { messageFromApiDetail } from "@/lib/api-message";

export async function uploadPostImage(
  file: File,
  token: string
): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE_URL}/upload/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(messageFromApiDetail(data.detail, "업로드 실패"));
  }
  const url = typeof data.url === "string" ? data.url.trim() : "";
  if (!url) throw new Error("업로드 실패");
  return url;
}
