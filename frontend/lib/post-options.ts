/** 선택지 목록 정규화 (trim + 빈 값 제거) */
export function normalizeOptionList(raw: string[]): string[] {
  return raw.map((o) => o.trim()).filter(Boolean);
}

/** 중복 선택지 여부 (대소문자 무시, 빈 값 제외) */
export function hasDuplicateOptions(options: string[]): boolean {
  return duplicateOptionIndexes(options).size > 0;
}

/** 중복된 선택지 입력칸 인덱스 */
export function duplicateOptionIndexes(options: string[]): Set<number> {
  const seen = new Map<string, number>();
  const dupes = new Set<number>();
  options.forEach((o, i) => {
    const key = o.trim().toLocaleLowerCase();
    if (!key) return;
    const prev = seen.get(key);
    if (prev !== undefined) {
      dupes.add(prev);
      dupes.add(i);
    } else {
      seen.set(key, i);
    }
  });
  return dupes;
}
