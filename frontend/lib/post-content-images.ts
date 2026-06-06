const IMAGE_MARKDOWN_RE = /!\[[^\]]*\]\(([^)]+)\)/g;

/** 본문에서 이미지 마크다운을 분리 (텍스트 / URL 목록) */
export function splitContentImages(content: string): {
  text: string;
  images: string[];
} {
  const images: string[] = [];
  const text = (content || "")
    .replace(IMAGE_MARKDOWN_RE, (_, url: string) => {
      const u = String(url || "").trim();
      if (u) images.push(u);
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, images };
}

/** 텍스트 + 첨부 이미지 → 저장용 본문 (이미지는 본문 끝에 순서대로) */
export function mergeContentWithImages(text: string, images: string[]): string {
  const body = (text || "").trim();
  const imgs = images
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url) => `![img](${url})`);
  if (imgs.length === 0) return body;
  if (!body) return imgs.join("\n\n");
  return `${body}\n\n${imgs.join("\n\n")}`;
}
