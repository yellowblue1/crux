import { beforeEach, describe, expect, it } from "bun:test";
import {
  clearSummaryCache,
  getCachedSummary,
  getSummaryCacheSize,
  setCachedSummary,
} from "./summary-cache";

describe("summary-cache", () => {
  beforeEach(() => {
    clearSummaryCache();
  });

  describe("getCachedSummary / setCachedSummary", () => {
    it("returns null for uncached content", () => {
      expect(getCachedSummary("some conversation")).toBeNull();
    });

    it("returns cached summary for same content", () => {
      setCachedSummary("conversation A", "Summary A");
      expect(getCachedSummary("conversation A")).toBe("Summary A");
    });

    it("returns null for different content", () => {
      setCachedSummary("conversation A", "Summary A");
      expect(getCachedSummary("conversation B")).toBeNull();
    });

    it("returns null after TTL expires", () => {
      setCachedSummary("conversation A", "Summary A");

      const fiveMinutesLater = () => Date.now() + 5 * 60 * 1000 + 1;
      expect(getCachedSummary("conversation A", fiveMinutesLater)).toBeNull();
    });

    it("returns cached summary before TTL expires", () => {
      setCachedSummary("conversation A", "Summary A");

      const fourMinutesLater = () => Date.now() + 4 * 60 * 1000;
      expect(getCachedSummary("conversation A", fourMinutesLater)).toBe("Summary A");
    });

    it("removes expired entry from cache", () => {
      setCachedSummary("conversation A", "Summary A");
      expect(getSummaryCacheSize()).toBe(1);

      const expired = () => Date.now() + 5 * 60 * 1000 + 1;
      getCachedSummary("conversation A", expired);
      expect(getSummaryCacheSize()).toBe(0);
    });
  });

  describe("eviction", () => {
    it("evicts oldest entry when cache exceeds max size", () => {
      for (let i = 0; i < 50; i++) {
        setCachedSummary(`conversation-${i}`, `summary-${i}`);
      }
      expect(getSummaryCacheSize()).toBe(50);

      // Adding one more should evict the oldest (conversation-0)
      setCachedSummary("conversation-new", "summary-new");
      expect(getSummaryCacheSize()).toBe(50);
      expect(getCachedSummary("conversation-0")).toBeNull();
      expect(getCachedSummary("conversation-new")).toBe("summary-new");
    });

    it("preserves most recent entries after eviction", () => {
      for (let i = 0; i < 50; i++) {
        setCachedSummary(`conversation-${i}`, `summary-${i}`);
      }

      setCachedSummary("conversation-new", "summary-new");

      // conversation-1 through conversation-49 should still be cached
      expect(getCachedSummary("conversation-1")).toBe("summary-1");
      expect(getCachedSummary("conversation-49")).toBe("summary-49");
    });

    it("does not evict when updating existing key", () => {
      for (let i = 0; i < 50; i++) {
        setCachedSummary(`conversation-${i}`, `summary-${i}`);
      }

      // Updating existing key should not evict
      setCachedSummary("conversation-0", "updated-summary-0");
      expect(getSummaryCacheSize()).toBe(50);
      expect(getCachedSummary("conversation-0")).toBe("updated-summary-0");
    });
  });

  describe("clearSummaryCache", () => {
    it("removes all cached entries", () => {
      setCachedSummary("a", "summary-a");
      setCachedSummary("b", "summary-b");
      expect(getSummaryCacheSize()).toBe(2);

      clearSummaryCache();
      expect(getSummaryCacheSize()).toBe(0);
      expect(getCachedSummary("a")).toBeNull();
    });
  });

  describe("getSummaryCacheSize", () => {
    it("returns 0 for empty cache", () => {
      expect(getSummaryCacheSize()).toBe(0);
    });

    it("returns correct count after insertions", () => {
      setCachedSummary("a", "summary-a");
      expect(getSummaryCacheSize()).toBe(1);

      setCachedSummary("b", "summary-b");
      expect(getSummaryCacheSize()).toBe(2);
    });
  });
});
