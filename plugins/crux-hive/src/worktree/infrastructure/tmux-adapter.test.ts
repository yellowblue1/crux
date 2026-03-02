import { describe, expect, it } from "bun:test";
import { createTmuxAdapter } from "./tmux-adapter.js";

describe("createTmuxAdapter", () => {
  describe("isAvailable", () => {
    it("should return true when TMUX env is set", () => {
      const original = process.env.TMUX;
      process.env.TMUX = "/tmp/tmux-1000/default,123,0";
      try {
        const adapter = createTmuxAdapter();
        expect(adapter.isAvailable()).toBe(true);
      } finally {
        process.env.TMUX = original;
      }
    });

    it("should return false when TMUX env is not set", () => {
      const original = process.env.TMUX;
      delete process.env.TMUX;
      try {
        const adapter = createTmuxAdapter();
        expect(adapter.isAvailable()).toBe(false);
      } finally {
        process.env.TMUX = original;
      }
    });
  });
});
