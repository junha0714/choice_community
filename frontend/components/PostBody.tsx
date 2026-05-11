"use client";

import { API_BASE_URL } from "@/lib/config";

function resolveImageSrc(url: string): string {
  const u = url.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE_URL}${u}`;
  return `${API_BASE_URL}/${u}`;
}

/** 본문 내 `![alt](url)` 마크다운 이미지를 렌더링합니다. */
export function PostBody({ content }: { content: string }) {
  const parts = content.split(/(!\[[^\]]*\]\([^)]+\))/g);
  return (
    <div className="text-zinc-800">
      {parts.map((part, i) => {
        const m = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (m) {
          const src = resolveImageSrc(m[2]);
          const altRaw = m[1] || "";
          const alt = altRaw.replace(/\|w=\d+\s*$/i, "").trim();
          const widthMatch = altRaw.match(/\|w=(\d{2,4})\s*$/i);
          const width =
            widthMatch && widthMatch[1]
              ? Math.max(120, Math.min(960, Number(widthMatch[1]) || 0))
              : null;
          return (
            <img
              key={i}
              src={src}
              alt={alt}
              className="my-3 block max-h-[min(480px,80vh)] max-w-full rounded-lg border border-zinc-100 object-contain"
              loading="lazy"
              style={width ? { maxWidth: width } : undefined}
            />
          );
        }
        return (
          <span key={i} className="whitespace-pre-wrap">
            {part}
          </span>
        );
      })}
    </div>
  );
}
