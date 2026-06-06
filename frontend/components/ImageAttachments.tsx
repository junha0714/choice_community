"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/config";

function resolveImageSrc(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE_URL}${u}`;
  return `${API_BASE_URL}/${u}`;
}

type ImageAttachmentsProps = {
  images: string[];
  onChange: (urls: string[]) => void;
  onUpload: (file: File) => Promise<string>;
  maxImages?: number;
  disabled?: boolean;
};

export function ImageAttachments({
  images,
  onChange,
  onUpload,
  maxImages = 10,
  disabled = false,
}: ImageAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const canAdd = images.length < maxImages && !disabled && !uploading;

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files?.length || !canAdd) return;
    setUploading(true);
    try {
      const next = [...images];
      for (const file of Array.from(files)) {
        if (next.length >= maxImages) break;
        if (!file.type.startsWith("image/")) continue;
        const url = await onUpload(file);
        next.push(url);
      }
      onChange(next);
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {images.map((url, index) => (
            <li
              key={`${url}-${index}`}
              className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-[#223141] dark:bg-zinc-900/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageSrc(url)}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={disabled || uploading}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 disabled:opacity-50"
                aria-label="사진 삭제"
              >
                <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!canAdd}
          className="inline-flex min-h-[2rem] items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#223141] dark:bg-[#1B2733] dark:text-[#AFC6D8] dark:hover:bg-sky-950/35"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          )}
          {uploading ? "업로드 중…" : "사진"}
          <span className="font-normal text-zinc-500 dark:text-[#8fa3b8]">
            {images.length}/{maxImages}
          </span>
        </button>
        <span className="text-[11px] text-zinc-500 dark:text-[#8fa3b8]">
          JPG·PNG·GIF·WEBP, 5MB 이하
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          disabled={!canAdd}
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/** textarea 붙여넣기용 — 이미지 파일이면 true */
export async function tryPasteImageFile(
  e: React.ClipboardEvent,
  onUpload: (file: File) => Promise<string>,
  onAdded: (url: string) => void,
  maxReached: boolean
): Promise<boolean> {
  if (maxReached) return false;
  const items = Array.from(e.clipboardData?.items ?? []);
  const imgItem = items.find((it) => it.kind === "file" && /^image\//i.test(it.type));
  if (!imgItem) return false;
  const file = imgItem.getAsFile();
  if (!file) return false;
  e.preventDefault();
  const url = await onUpload(file);
  onAdded(url);
  return true;
}
