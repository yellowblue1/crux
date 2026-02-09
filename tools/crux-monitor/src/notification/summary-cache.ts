interface CacheEntry {
  summary: string;
  createdAt: number;
}

const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();

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

/** Clear all cached entries. Used for test isolation. */
export function clearSummaryCache(): void {
  cache.clear();
}

/** Get the number of cached entries. Used for test assertions. */
export function getSummaryCacheSize(): number {
  return cache.size;
}
