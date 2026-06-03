import { homedir } from "node:os";
import { join } from "node:path";

function getClaudeDir(): string {
  const home = process.env.HOME || homedir();
  return join(home, ".claude");
}

export function getTeamsDir(): string {
  return join(getClaudeDir(), "teams");
}

export function getSessionsDir(): string {
  return join(getClaudeDir(), "sessions");
}

/**
 * Encodes a working directory into the directory name Claude Code uses under
 * ~/.claude/projects. Every non-alphanumeric character is replaced by "-".
 * Verified against the real CLI (e.g. "/tmp/enc.test_dir" -> "-tmp-enc-test-dir").
 */
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * Path to a session's transcript JSONL: ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl.
 * The transcript is what `claude --resume <sessionId>` reads; its presence is a
 * precondition for resuming a worker.
 */
export function getTranscriptPath(cwd: string, sessionId: string): string {
  return join(getClaudeDir(), "projects", encodeCwd(cwd), `${sessionId}.jsonl`);
}
