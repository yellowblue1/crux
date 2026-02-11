interface CacheEntry {
  summary: string;
  createdAt: number;
}

const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

function computeCacheKey(conversationTail: string): string {
  return Bun.hash(conversationTail).toString(36);
}

/**
 * Look up a cached summary by conversation tail content.
 * Returns null if not cached or if the entry has expired.
 */
export function getCachedSummary(
  conversationTail: string,
  nowFn: () => number = Date.now,
): string | null {
  const key = computeCacheKey(conversationTail);
  const entry = cache.get(key);
  if (!entry) return null;

  if (nowFn() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.summary;
}

/**
 * Store a summary in the cache, keyed by conversation tail content.
 * Evicts the oldest entry if cache exceeds MAX_CACHE_SIZE.
 */
export function setCachedSummary(conversationTail: string, summary: string): void {
  const key = computeCacheKey(conversationTail);

  if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }

  cache.set(key, { summary, createdAt: Date.now() });
}

/**
 * Get an in-flight request promise for the given conversation tail.
 * Returns null if no request is currently in-flight for this content.
 */
export function getInflightRequest(conversationTail: string): Promise<string | null> | null {
  const key = computeCacheKey(conversationTail);
  return inflight.get(key) ?? null;
}

/**
 * Register an in-flight request promise, keyed by conversation tail content.
 * The caller must call deleteInflightRequest in a .finally() block.
 */
export function setInflightRequest(
  conversationTail: string,
  promise: Promise<string | null>,
): void {
  const key = computeCacheKey(conversationTail);
  inflight.set(key, promise);
}

/** Remove an in-flight request entry after the request completes or fails. */
export function deleteInflightRequest(conversationTail: string): void {
  const key = computeCacheKey(conversationTail);
  inflight.delete(key);
}

/** Clear all cached entries and in-flight requests. Used for test isolation. */
export function clearSummaryCache(): void {
  cache.clear();
  inflight.clear();
}

/** Get the number of cached entries. Used for test assertions. */
export function getSummaryCacheSize(): number {
  return cache.size;
}

/** Get the number of in-flight requests. Used for test assertions. */
export function getInflightSize(): number {
  return inflight.size;
}
