import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { runHook } from "./run-hook.js";

const originalDebug = process.env.CRUX_HIVE_DEBUG;
const originalStderrWrite = process.stderr.write.bind(process.stderr);

function captureStderr(): string[] {
  const writes: string[] = [];
  const spy = mock((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  });
  process.stderr.write = spy as unknown as typeof process.stderr.write;
  return writes;
}

beforeEach(() => {
  delete process.env.CRUX_HIVE_DEBUG;
});

afterEach(() => {
  if (originalDebug === undefined) {
    delete process.env.CRUX_HIVE_DEBUG;
  } else {
    process.env.CRUX_HIVE_DEBUG = originalDebug;
  }
  process.stderr.write = originalStderrWrite;
  mock.restore();
});

function waitForSettled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("runHook", () => {
  it("invokes the main function", async () => {
    let called = false;
    runHook(async () => {
      called = true;
    });
    await waitForSettled();
    expect(called).toBe(true);
  });

  it("swallows errors silently when debug flag is unset", async () => {
    const writes = captureStderr();

    runHook(async () => {
      throw new Error("boom");
    });
    await waitForSettled();

    expect(writes).toEqual([]);
  });

  it("writes error details to stderr when CRUX_HIVE_DEBUG=1", async () => {
    process.env.CRUX_HIVE_DEBUG = "1";
    const writes = captureStderr();

    runHook(async () => {
      throw new Error("kaboom");
    });
    await waitForSettled();

    expect(writes.length).toBe(1);
    expect(writes[0]).toContain("[crux-hive] hook error:");
    expect(writes[0]).toContain("kaboom");
  });

  it("handles non-Error throws when debug flag is set", async () => {
    process.env.CRUX_HIVE_DEBUG = "1";
    const writes = captureStderr();

    const nonError: unknown = "string-reason";
    runHook(async () => {
      throw nonError;
    });
    await waitForSettled();

    expect(writes[0]).toContain("string-reason");
  });

  it("ignores unrelated debug flag values", async () => {
    process.env.CRUX_HIVE_DEBUG = "true"; // only "1" enables
    const writes = captureStderr();

    runHook(async () => {
      throw new Error("boom");
    });
    await waitForSettled();

    expect(writes).toEqual([]);
  });
});
