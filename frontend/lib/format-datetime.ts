function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 게시글·댓글 등 — 1분 미만: 방금 전, 오늘: 시각, 그 외: 날짜 */
export function formatPostDateLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const diffMs = now.getTime() - d.getTime();
  if (diffMs >= 0 && diffMs < 60_000) {
    return "방금 전";
  }

  if (isSameCalendarDay(d, now)) {
    return d.toLocaleTimeString("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return d.toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}
