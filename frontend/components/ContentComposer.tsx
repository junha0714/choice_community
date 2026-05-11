"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { PostBody } from "@/components/PostBody";

export type ComposerBlock =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image"; url: string; width: number };

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export type ContentComposerHandle = {
  insertImageAtCursor: (url: string) => void;
};

export function createInitialBlocks(): ComposerBlock[] {
  return [{ id: uid("t"), type: "text", text: "" }];
}

export function serializeBlocks(blocks: ComposerBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text") {
      const t = b.text;
      if (t && t.trim()) parts.push(t.trim());
      continue;
    }
    const alt = `img|w=${Math.max(120, Math.min(960, Math.round(b.width || 420)))}`;
    parts.push(`![${alt}](${b.url})`);
  }
  return parts.join("\n\n").trim();
}

export function composerPlainText(blocks: ComposerBlock[]): string {
  return blocks
    .filter((b): b is Extract<ComposerBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export const ContentComposer = forwardRef<
  ContentComposerHandle,
  {
    blocks: ComposerBlock[];
    onChange: (next: ComposerBlock[]) => void;
  }
>(function ContentComposer({ blocks, onChange }, ref) {
  const textRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const lastFocus = useRef<{ id: string; start: number; end: number } | null>(null);
  const pendingFocusId = useRef<string | null>(null);

  useEffect(() => {
    const id = pendingFocusId.current;
    if (!id) return;
    const el = textRefs.current.get(id);
    if (!el) return;
    pendingFocusId.current = null;
    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = el.value.length;
        el.setSelectionRange(pos, pos);
      } catch {
        // ignore
      }
    });
  }, [blocks]);

  useImperativeHandle(
    ref,
    () => ({
      insertImageAtCursor: (url: string) => {
        const u = url.trim();
        if (!u) return;

        const focus = lastFocus.current;
        const fallbackIdx = Math.max(0, blocks.findIndex((b) => b.type === "text"));
        const idx =
          focus?.id != null ? blocks.findIndex((b) => b.id === focus.id) : fallbackIdx;
        const target = idx >= 0 ? blocks[idx] : null;

        if (!target || target.type !== "text") {
          const nextBlocks = appendImageBlock(blocks, u, 420);
          onChange(nextBlocks);
          return;
        }

        const start = Math.max(0, focus?.start ?? target.text.length);
        const end = Math.max(start, focus?.end ?? start);
        const before = target.text.slice(0, start);
        const after = target.text.slice(end);
        const leftId = target.id;
        const rightId = uid("t");
        const imageId = uid("i");

        const next: ComposerBlock[] = [];
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          if (i !== idx) {
            next.push(b);
            continue;
          }
          next.push({ id: leftId, type: "text", text: before });
          next.push({ id: imageId, type: "image", url: u, width: 420 });
          next.push({ id: rightId, type: "text", text: after });
        }

        pendingFocusId.current = rightId;
        onChange(next);
      },
    }),
    [blocks, onChange]
  );

  return (
    <div className="space-y-3">
      {blocks.map((b) => {
        if (b.type === "text") {
          return (
            <textarea
              key={b.id}
              value={b.text}
              onChange={(e) =>
                onChange(
                  blocks.map((x) =>
                    x.id === b.id && x.type === "text"
                      ? { ...x, text: e.target.value }
                      : x
                  )
                )
              }
              onFocus={(e) => {
                lastFocus.current = {
                  id: b.id,
                  start: e.currentTarget.selectionStart ?? 0,
                  end: e.currentTarget.selectionEnd ?? 0,
                };
              }}
              onSelect={(e) => {
                const el = e.currentTarget;
                lastFocus.current = {
                  id: b.id,
                  start: el.selectionStart ?? 0,
                  end: el.selectionEnd ?? 0,
                };
              }}
              onKeyUp={(e) => {
                const el = e.currentTarget;
                lastFocus.current = {
                  id: b.id,
                  start: el.selectionStart ?? 0,
                  end: el.selectionEnd ?? 0,
                };
              }}
              aria-label="고민 내용"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-300/70 dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30"
              style={{ minHeight: 140 }}
              ref={(el) => {
                if (!el) {
                  textRefs.current.delete(b.id);
                  return;
                }
                textRefs.current.set(b.id, el);
              }}
            />
          );
        }

        const setWidth = (w: number) =>
          onChange(
            blocks.map((x) =>
              x.id === b.id && x.type === "image" ? { ...x, width: w } : x
            )
          );

        return (
          <div key={b.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-[#223141] dark:bg-[#16202A]">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-1 text-xs dark:border-[#223141] dark:bg-[#1B2733]">
                <button
                  type="button"
                  className={`rounded px-2 py-1 font-semibold ${
                    b.width <= 360
                      ? "bg-white text-zinc-900 dark:bg-[#16202A] dark:text-white"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-[#AFC6D8] dark:hover:text-white"
                  }`}
                  onClick={() => setWidth(320)}
                  title="작게"
                >
                  S
                </button>
                <button
                  type="button"
                  className={`rounded px-2 py-1 font-semibold ${
                    b.width > 360 && b.width <= 540
                      ? "bg-white text-zinc-900 dark:bg-[#16202A] dark:text-white"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-[#AFC6D8] dark:hover:text-white"
                  }`}
                  onClick={() => setWidth(480)}
                  title="보통"
                >
                  M
                </button>
                <button
                  type="button"
                  className={`rounded px-2 py-1 font-semibold ${
                    b.width > 540
                      ? "bg-white text-zinc-900 dark:bg-[#16202A] dark:text-white"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-[#AFC6D8] dark:hover:text-white"
                  }`}
                  onClick={() => setWidth(720)}
                  title="크게"
                >
                  L
                </button>
              </div>
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-[#223141] dark:bg-[#16202A] dark:text-[#AFC6D8] dark:hover:bg-sky-950/35 dark:hover:text-white"
                onClick={() => onChange(blocks.filter((x) => x.id !== b.id))}
              >
                삭제
              </button>
            </div>

            <div className="mt-2">
              <PostBody content={`![img|w=${b.width}](${b.url})`} />
            </div>
          </div>
        );
      })}
    </div>
  );
});

export function appendTextBlock(blocks: ComposerBlock[], text = ""): ComposerBlock[] {
  return [...blocks, { id: uid("t"), type: "text", text }];
}

export function appendImageBlock(
  blocks: ComposerBlock[],
  url: string,
  width = 420
): ComposerBlock[] {
  const u = url.trim();
  if (!u) return blocks;
  return [...blocks, { id: uid("i"), type: "image", url: u, width }];
}

