/// <reference lib="dom" />
import { describe, expect, it } from "bun:test";
import { MockEventSource } from "./setup";

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
});
