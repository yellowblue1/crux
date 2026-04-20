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

const alwaysAlive = { isPidAlive: (_pid: number) => true };
const alwaysDead = { isPidAlive: (_pid: number) => false };

describe("createFileLiveSessionReader", () => {
  it("returns empty set when sessions dir does not exist", async () => {
    rmSync(sessionsDir, { recursive: true, force: true });
    const reader = createFileLiveSessionReader(alwaysAlive);
    expect(await reader.listLiveSessionIds()).toEqual(new Set());
  });

  it("collects sessionIds when their pids are alive", async () => {
    writeFileSync(
      join(sessionsDir, "1944.json"),
      JSON.stringify({ pid: 1944, sessionId: "uuid-a" }),
    );
    writeFileSync(
      join(sessionsDir, "2322.json"),
      JSON.stringify({ pid: 2322, sessionId: "uuid-b" }),
    );

    const reader = createFileLiveSessionReader(alwaysAlive);
    const ids = await reader.listLiveSessionIds();

    expect(ids).toEqual(new Set(["uuid-a", "uuid-b"]));
  });

  it("skips sessionIds whose pid is gone (stale session file)", async () => {
    writeFileSync(
      join(sessionsDir, "1944.json"),
      JSON.stringify({ pid: 1944, sessionId: "uuid-a" }),
    );

    const reader = createFileLiveSessionReader(alwaysDead);
    const ids = await reader.listLiveSessionIds();

    expect(ids).toEqual(new Set());
  });

  it("filters on a per-entry basis", async () => {
    writeFileSync(
      join(sessionsDir, "live.json"),
      JSON.stringify({ pid: 111, sessionId: "uuid-live" }),
    );
    writeFileSync(
      join(sessionsDir, "dead.json"),
      JSON.stringify({ pid: 999, sessionId: "uuid-dead" }),
    );

    const reader = createFileLiveSessionReader({
      isPidAlive: (pid) => pid === 111,
    });
    const ids = await reader.listLiveSessionIds();

    expect(ids).toEqual(new Set(["uuid-live"]));
  });

  it("skips malformed JSON and entries missing pid or sessionId", async () => {
    writeFileSync(join(sessionsDir, "broken.json"), "not json");
    writeFileSync(join(sessionsDir, "nosession.json"), JSON.stringify({ pid: 1 }));
    writeFileSync(join(sessionsDir, "nopid.json"), JSON.stringify({ sessionId: "x" }));
    writeFileSync(join(sessionsDir, "ok.json"), JSON.stringify({ pid: 3, sessionId: "uuid-ok" }));

    const reader = createFileLiveSessionReader(alwaysAlive);
    const ids = await reader.listLiveSessionIds();

    expect(ids).toEqual(new Set(["uuid-ok"]));
  });

  it("ignores non-json entries", async () => {
    writeFileSync(join(sessionsDir, "README.md"), "hello");
    writeFileSync(join(sessionsDir, "ok.json"), JSON.stringify({ pid: 1, sessionId: "uuid-ok" }));

    const reader = createFileLiveSessionReader(alwaysAlive);
    const ids = await reader.listLiveSessionIds();

    expect(ids).toEqual(new Set(["uuid-ok"]));
  });

  it("default factory uses real process.kill probe", async () => {
    writeFileSync(
      join(sessionsDir, "self.json"),
      JSON.stringify({ pid: process.pid, sessionId: "uuid-self" }),
    );
    writeFileSync(
      join(sessionsDir, "dead.json"),
      JSON.stringify({ pid: 2147483647, sessionId: "uuid-dead" }),
    );

    const reader = createFileLiveSessionReader();
    const ids = await reader.listLiveSessionIds();

    expect(ids.has("uuid-self")).toBe(true);
    expect(ids.has("uuid-dead")).toBe(false);
  });
});
