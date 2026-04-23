"use client";

function flattenValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    return v.map(flattenValue).filter(Boolean).join(" ");
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => {
        const inner = flattenValue(x);
        return inner ? `${k}: ${inner}` : k;
      })
      .join(" · ");
  }
  return String(v);
}

/** 이미 DB에 저장된 JSON 덩어리(레거시)를 마크다운 형태로 바꿈 */
function dictToMarkdown(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [title, body] of Object.entries(obj)) {
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      parts.push(`## ${title}`);
      for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
        parts.push(`- **${k}:** ${flattenValue(v)}`);
      }
      parts.push("");
    } else {
      parts.push(`## ${title}`, flattenValue(body), "");
    }
  }
  return parts.join("\n").trim();
}

export function preprocessAiReasonText(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const sep = /\n-{3,}\n/;
  const chunks = t.split(sep);
  const head = (chunks[0] ?? "").trim();
  const tail = chunks.slice(1).join("\n---\n").trim();

  const tryJson = (block: string): string | null => {
    const b = block.trim();
    if (!b.startsWith("{") || !b.endsWith("}")) return null;
    try {
      const parsed = JSON.parse(b) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return dictToMarkdown(parsed as Record<string, unknown>);
      }
    } catch {
      return null;
    }
    return null;
  };

  if (!tail) {
    const converted = tryJson(head);
    return converted ?? t;
  }
  const tailOut = tryJson(tail) ?? tail;
  return `${head}\n\n---\n\n${tailOut}`.trim();
}

function splitByH2(md: string): { title: string; body: string }[] {
  const lines = md.split("\n");
  const sections: { title: string; body: string[] }[] = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { title: line.slice(3).trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    } else {
      if (line.trim()) {
        if (!current) current = { title: "", body: [] };
        current.body.push(line);
      }
    }
  }
  if (current) sections.push(current);
  const out = sections.map((s) => ({
    title: s.title || "상세 비교",
    body: s.body.join("\n").trim(),
  }));
  return out.filter((s) => s.title || s.body);
}

function BodyLines({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const labeled = trimmed.match(/^- \*\*([^*]+)\*\*:\s*([\s\S]*)$/);
        if (labeled) {
          return (
            <div
              key={i}
              className="rounded-lg border border-zinc-100 bg-zinc-50/90 px-3 py-2.5"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900/90">
                {labeled[1]}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">
                {labeled[2]}
              </p>
            </div>
          );
        }
        if (trimmed.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2 text-sm leading-relaxed text-zinc-700">
              <span className="shrink-0 text-indigo-400">•</span>
              <span>{trimmed.slice(2)}</span>
            </div>
          );
        }
        if (trimmed.startsWith("  ") && trimmed.length > 2) {
          return (
            <p
              key={i}
              className="ml-2 border-l-2 border-indigo-100 pl-3 text-sm text-zinc-600"
            >
              {trimmed}
            </p>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-zinc-700">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

type Props = { text: string };

export function AiReasonDisplay({ text }: Props) {
  const processed = preprocessAiReasonText(text);
  let summary = "";
  let comparison = "";
  if (/\n-{3,}\n/.test(processed)) {
    const parts = processed.split(/\n-{3,}\n/);
    summary = (parts[0] ?? "").trim();
    comparison = parts.slice(1).join("\n---\n").trim();
  } else if (/^## /m.test(processed)) {
    comparison = processed.trim();
  } else {
    summary = processed.trim();
  }
  const sections = comparison ? splitByH2(comparison) : [];

  return (
    <div className="space-y-5">
      {summary ? (
        <div className="rounded-xl border border-zinc-200/80 bg-linear-to-br from-white to-zinc-50/80 p-4 shadow-sm">
          <p className="text-xs font-semibold text-zinc-500">요약</p>
          <div className="mt-2">
            <BodyLines body={summary} />
          </div>
        </div>
      ) : null}

      {sections.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-indigo-900/80">
            선택지별 비교
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-1">
            {sections.map((sec, idx) => (
              <div
                key={`${sec.title}-${idx}`}
                className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm shadow-indigo-950/5"
              >
                <h4 className="text-base font-semibold text-indigo-950">
                  {sec.title}
                </h4>
                <div className="mt-3">
                  <BodyLines body={sec.body} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : comparison ? (
        <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-indigo-900/80">상세</p>
          <div className="mt-2">
            <BodyLines body={comparison} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
