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
          return (
            <img
              key={i}
              src={src}
              alt={m[1] || ""}
              className="my-3 block max-h-[min(480px,80vh)] max-w-full rounded-lg border border-zinc-100 object-contain"
              loading="lazy"
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
