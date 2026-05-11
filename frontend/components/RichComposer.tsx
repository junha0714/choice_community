"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { API_BASE_URL } from "@/lib/config";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export type RichComposerHandle = {
  insertImageAtCursor: (url: string) => void;
  focus: () => void;
};

function clampWidth(w: number) {
  return Math.max(160, Math.min(960, Math.round(w || 420)));
}

function resolveImageSrc(url: string): string {
  const u = (url || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE_URL}${u}`;
  return `${API_BASE_URL}/${u}`;
}

export const RichComposer = forwardRef<
  RichComposerHandle,
  {
    value: string;
    onChange: (next: string) => void;
    onPasteImage?: (file: File) => Promise<string>;
  }
>(function RichComposer({ value, onChange, onPasteImage }, ref) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [hasFocus, setHasFocus] = useState(false);

  const setCaretAfterNode = (node: Node) => {
    try {
      const sel = window.getSelection();
      if (!sel) return;
      const r = document.createRange();
      r.setStartAfter(node);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch {
      // ignore
    }
  };

  const insertNodesAtSelection = (nodes: Node[]) => {
    const host = rootRef.current;
    if (!host) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!host.contains(range.commonAncestorContainer)) {
      host.focus();
      return;
    }
    range.deleteContents();
    const frag = document.createDocumentFragment();
    for (const n of nodes) frag.appendChild(n);
    const last = frag.lastChild;
    range.insertNode(frag);
    if (last) setCaretAfterNode(last);
  };

  const insertImageInline = (url: string) => {
    const u = url.trim();
    if (!u) return;

    const wrap = document.createElement("div");
    wrap.setAttribute("contenteditable", "false");
    wrap.dataset.type = "img";
    wrap.dataset.url = u;
    wrap.dataset.w = "420";
    wrap.className =
      "my-2 block max-w-full resize-x overflow-auto rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-[#223141] dark:bg-[#16202A]";
    wrap.style.width = "420px";
    wrap.style.marginLeft = "auto";
    wrap.style.marginRight = "auto";

    const img = document.createElement("img");
    img.src = resolveImageSrc(u);
    img.alt = "";
    img.loading = "lazy";
    img.className = "block h-auto w-full max-w-full object-contain";
    wrap.appendChild(img);

    // 리사이즈 후 width 저장 (mouseup으로 충분)
    wrap.addEventListener("mouseup", () => {
      const w = clampWidth(wrap.getBoundingClientRect().width);
      wrap.style.width = `${w}px`;
      wrap.dataset.w = String(w);
      onChange(rootRef.current?.innerHTML ?? "");
    });

    // 클릭 시 삭제(간단 UX)
    wrap.addEventListener("dblclick", () => {
      wrap.remove();
      onChange(rootRef.current?.innerHTML ?? "");
    });

    const br1 = document.createElement("br");
    const br2 = document.createElement("br");
    insertNodesAtSelection([br1, wrap, br2]);
    onChange(rootRef.current?.innerHTML ?? "");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    const host = rootRef.current;
    if (!host) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;

    const node = range.startContainer;
    const offset = range.startOffset;
    const candidate =
      e.key === "Backspace"
        ? (node.childNodes?.[offset - 1] as Node | undefined)
        : (node.childNodes?.[offset] as Node | undefined);

    const el =
      candidate && candidate.nodeType === Node.ELEMENT_NODE
        ? (candidate as HTMLElement)
        : candidate?.parentElement;
    const imgWrap = el?.closest?.('[data-type="img"]') as HTMLElement | null;
    if (imgWrap && host.contains(imgWrap)) {
      e.preventDefault();
      const after = imgWrap.nextSibling;
      imgWrap.remove();
      if (after) setCaretAfterNode(after);
      onChange(host.innerHTML);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!onPasteImage) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imgItem = items.find((it) => it.kind === "file" && /^image\//i.test(it.type));
    if (!imgItem) return;
    const file = imgItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    try {
      const url = await onPasteImage(file);
      if (url) insertImageInline(url);
    } catch {
      // ignore (caller can alert)
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      insertImageAtCursor: (url: string) => {
        rootRef.current?.focus();
        insertImageInline(url);
      },
      focus: () => rootRef.current?.focus(),
    }),
    [onChange]
  );

  useEffect(() => {
    // contentEditable 동기화 (외부 변경 시)
    const el = rootRef.current;
    if (!el) return;
    if (hasFocus) return;
    if (el.innerHTML !== value) el.innerHTML = value || "";
  }, [hasFocus, value]);

  return (
    <div
      className={[
        "rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm",
        "outline-none focus-within:border-sky-600 focus-within:ring-2 focus-within:ring-sky-300/70",
        "dark:border-[#223141] dark:bg-zinc-950/40 dark:text-white dark:focus-within:border-sky-400 dark:focus-within:ring-sky-500/30",
      ].join(" ")}
    >
      <div
        ref={rootRef}
        contentEditable
        suppressContentEditableWarning
        className="min-h-[160px] whitespace-pre-wrap outline-none"
        onFocus={() => setHasFocus(true)}
        onBlur={(e) => {
          setHasFocus(false);
          onChange(e.currentTarget.innerHTML ?? "");
        }}
        onInput={(e) => onChange(e.currentTarget.innerHTML ?? "")}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
    </div>
  );
});

export function richHtmlToPlainText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    // 이미지 wrapper 제거 후 textContent 사용
    doc.querySelectorAll('[data-type="img"]').forEach((el) => el.remove());
    return (doc.body.textContent || "").trim();
  } catch {
    return "";
  }
}

export function richHtmlToMarkdown(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    const out: string[] = [];

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent || "").replace(/\u00A0/g, " ");
        out.push(t);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      if (el.matches('[data-type="img"]')) {
        const url = el.dataset.url || "";
        const w = clampWidth(Number(el.dataset.w) || el.getBoundingClientRect?.().width || 420);
        if (url) out.push(`\n\n![img|w=${w}](${url})\n\n`);
        return;
      }
      if (el.tagName === "BR" || el.tagName === "DIV" || el.tagName === "P") {
        for (const c of Array.from(el.childNodes)) walk(c);
        out.push("\n");
        return;
      }
      for (const c of Array.from(el.childNodes)) walk(c);
    };

    walk(doc.body);
    return out
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return "";
  }
}

