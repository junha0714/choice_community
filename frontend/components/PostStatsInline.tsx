import type { ReactNode } from "react";

function fmtNumber(n: number | null | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("ko-KR").format(v);
}

function IconEye({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconHeart({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function IconVote({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function IconComment({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

const ICON_CLASS = "h-3 w-3 shrink-0 text-zinc-400 dark:text-zinc-500";

type PostStats = {
  view_count?: number;
  like_count?: number;
  vote_count?: number;
  comment_count?: number;
};

type PostStatsInlineProps = PostStats & {
  className?: string;
  hideVotes?: boolean;
};

function StatItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | null | undefined;
}) {
  const text = fmtNumber(value);
  return (
    <span
      className="inline-flex items-center gap-0.5 tabular-nums"
      title={`${label} ${text}`}
      aria-label={`${label} ${text}`}
    >
      {icon}
      {text}
    </span>
  );
}

function Dot() {
  return (
    <span className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden>
      ·
    </span>
  );
}

export function PostStatsInline({
  view_count,
  like_count,
  vote_count,
  comment_count,
  className = "",
  hideVotes = false,
}: PostStatsInlineProps) {
  return (
    <span
      className={`inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 ${className}`}
    >
      <StatItem
        icon={<IconEye className={ICON_CLASS} />}
        label="조회"
        value={view_count}
      />
      <Dot />
      <StatItem
        icon={<IconHeart className={ICON_CLASS} />}
        label="좋아요"
        value={like_count}
      />
      {!hideVotes ? (
        <>
          <Dot />
          <StatItem
            icon={<IconVote className={ICON_CLASS} />}
            label="투표"
            value={vote_count}
          />
        </>
      ) : null}
      <Dot />
      <StatItem
        icon={<IconComment className={ICON_CLASS} />}
        label="댓글"
        value={comment_count}
      />
    </span>
  );
}
