import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createFileLiveSessionReader } from "./file-live-session-reader.js";

const testHome = join(import.meta.dir, "__test_home__");
const originalHomedir = process.env.HOME;
const sessionsDir = join(testHome, ".claude", "sessions");

beforeEach(() => {
  process.env.HOME = testHome;
  mkdirSync(sessionsDir, { recursive: true });
});

afterEach(() => {
  process.env.HOME = originalHomedir;
  if (existsSync(testHome)) {
    rmSync(testHome, { recursive: true, force: true });
  }
});

describe("createFileLiveSessionReader", () => {
  it("returns empty set when sessions dir does not exist", async () => {
    rmSync(sessionsDir, { recursive: true, force: true });
    const reader = createFileLiveSessionReader();
    expect(await reader.listLiveSessionIds()).toEqual(new Set());
  });

  it("collects sessionIds from every well-formed session file", async () => {
    writeFileSync(
      join(sessionsDir, "1944.json"),
      JSON.stringify({ pid: 1944, sessionId: "uuid-a", cwd: "/x" }),
    );
    writeFileSync(
      join(sessionsDir, "2322.json"),
      JSON.stringify({ pid: 2322, sessionId: "uuid-b" }),
    );

    const reader = createFileLiveSessionReader();
    const ids = await reader.listLiveSessionIds();

    expect(ids.has("uuid-a")).toBe(true);
    expect(ids.has("uuid-b")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("skips malformed JSON and entries without a string sessionId", async () => {
    writeFileSync(join(sessionsDir, "broken.json"), "not json");
    writeFileSync(join(sessionsDir, "nosession.json"), JSON.stringify({ pid: 1 }));
    writeFileSync(join(sessionsDir, "wrongtype.json"), JSON.stringify({ pid: 2, sessionId: 123 }));
    writeFileSync(join(sessionsDir, "ok.json"), JSON.stringify({ pid: 3, sessionId: "uuid-ok" }));

    const reader = createFileLiveSessionReader();
    const ids = await reader.listLiveSessionIds();

    expect(ids.size).toBe(1);
    expect(ids.has("uuid-ok")).toBe(true);
  });

  it("ignores non-json entries", async () => {
    writeFileSync(join(sessionsDir, "README.md"), "hello");
    writeFileSync(join(sessionsDir, "ok.json"), JSON.stringify({ pid: 1, sessionId: "uuid-ok" }));

    const reader = createFileLiveSessionReader();
    const ids = await reader.listLiveSessionIds();

    expect(ids).toEqual(new Set(["uuid-ok"]));
  });
});
