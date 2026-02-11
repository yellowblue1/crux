import type { PaneAction } from "../../shared/types";

interface CacheEntry {
  action: PaneAction;
  createdAt: number;
}

const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PaneAction>>();

function computeCacheKey(contentTail: string): string {
  return Bun.hash(contentTail).toString(36);
}

/**
 * Look up a cached action by content tail.
 * Returns null if not cached or if the entry has expired.
 */
export function getCachedAction(
  contentTail: string,
  nowFn: () => number = Date.now,
): PaneAction | null {
  const key = computeCacheKey(contentTail);
  const entry = cache.get(key);
  if (!entry) return null;

  if (nowFn() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.action;
}

/**
 * Store an action in the cache, keyed by content tail.
 * Evicts the oldest entry if cache exceeds MAX_CACHE_SIZE.
 */
export function setCachedAction(contentTail: string, action: PaneAction): void {
  const key = computeCacheKey(contentTail);

  if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }

  cache.set(key, { action, createdAt: Date.now() });
}

/**
 * Get an in-flight request promise for the given content tail.
 * Returns null if no request is currently in-flight for this content.
 */
export function getInflightRequest(contentTail: string): Promise<PaneAction> | null {
  const key = computeCacheKey(contentTail);
  return inflight.get(key) ?? null;
}

/**
 * Register an in-flight request promise, keyed by content tail.
 * The caller must call deleteInflightRequest in a finally block.
 */
export function setInflightRequest(contentTail: string, promise: Promise<PaneAction>): void {
  const key = computeCacheKey(contentTail);
  inflight.set(key, promise);
}

/** Remove an in-flight request entry after the request completes or fails. */
export function deleteInflightRequest(contentTail: string): void {
  const key = computeCacheKey(contentTail);
  inflight.delete(key);
}

/** Clear all cached entries and in-flight requests. Used for test isolation. */
export function clearActionCache(): void {
  cache.clear();
  inflight.clear();
}

/** Get the number of cached entries. Used for test assertions. */
export function getActionCacheSize(): number {
  return cache.size;
}

/** Get the number of in-flight requests. Used for test assertions. */
export function getInflightSize(): number {
  return inflight.size;
}
