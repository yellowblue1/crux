/// <reference lib="dom" />
import { describe, expect, it } from "bun:test";
import { MockEventSource, mockIndexedDBOpen } from "./setup";

describe("Test Setup", () => {
  describe("happy-dom globals", () => {
    it("should provide document global", () => {
      expect(document).toBeDefined();
      expect(typeof document.createElement).toBe("function");
    });

    it("should provide window global", () => {
      expect(window).toBeDefined();
    });

    it("should provide EventSource global", () => {
      expect(EventSource).toBeDefined();
      expect(EventSource).toBe(MockEventSource);
    });

    it("should provide fetch global", () => {
      expect(fetch).toBeDefined();
    });
  });

  describe("IndexedDB mock", () => {
    it("should be available globally", () => {
      expect(indexedDB).toBeDefined();
      expect(indexedDB.open).toBe(mockIndexedDBOpen);
    });

    it("should return mock request on open", () => {
      const request = indexedDB.open("test-db");
      expect(request).toBeDefined();
      expect(request.result).toBeDefined();
    });
  });
});
