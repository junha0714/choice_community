type CacheEntry<T> = { at: number; data: T };

const store = new Map<string, CacheEntry<unknown>>();

export function readClientCache<T>(key: string, ttlMs: number): T | null {
  const hit = store.get(key);
  if (!hit || Date.now() - hit.at > ttlMs) return null;
  return hit.data as T;
}

export function writeClientCache<T>(key: string, data: T): void {
  store.set(key, { at: Date.now(), data });
}

export function clearClientCache(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}
