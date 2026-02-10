import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ClaudeProcess, ProcessInfo, TmuxPane } from "../types";
import { sanitizePaneContent } from "./sanitize.js";

/**
 * Escape a string for safe use in shell commands.
 * Uses single quotes and escapes any embedded single quotes.
 */
function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

type ExecFn = (command: string) => string;

const defaultExec: ExecFn = (command: string) => {
  const result = Bun.spawnSync(["sh", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  if (!result.success) {
    const stderr = result.stderr.toString().trim();
    throw new Error(stderr || `Command failed with exit code ${result.exitCode}`);
  }
  return result.stdout.toString().trim();
};

/**
 * Check if tmux is available and running
 */
export function isTmuxAvailable(exec: ExecFn = defaultExec): boolean {
  try {
    exec("tmux list-sessions");
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all tmux panes with their PIDs
 */
export function getAllTmuxPanes(exec: ExecFn = defaultExec): TmuxPane[] {
  try {
    const output = exec(
      "tmux list-panes -a -F '#{pane_id} #{pane_pid} #{session_name} #{window_index} #{pane_index}'",
    );
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(" ");
        if (parts.length < 5) return null;
        return {
          pane_id: parts[0],
          pane_pid: Number.parseInt(parts[1], 10),
          session_name: parts[2],
          window_index: Number.parseInt(parts[3], 10),
          pane_index: Number.parseInt(parts[4], 10),
        };
      })
      .filter((p): p is TmuxPane => p !== null && !Number.isNaN(p.pane_pid));
  } catch {
    return [];
  }
}

/**
 * Get the full process table from ps.
 * Returns all processes with PID, PPID, and command.
 */
export function getProcessTable(exec: ExecFn = defaultExec): ProcessInfo[] {
  try {
    const output = exec("ps -eo pid,ppid,command");
    return output
      .split("\n")
      .slice(1) // skip header line
      .filter(Boolean)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 3) return null;
        const pid = Number.parseInt(parts[0], 10);
        const ppid = Number.parseInt(parts[1], 10);
        if (Number.isNaN(pid) || Number.isNaN(ppid)) return null;
        return { pid, ppid, command: parts.slice(2).join(" ") };
      })
      .filter((p): p is ProcessInfo => p !== null);
  } catch {
    return [];
  }
}

/**
 * Check if a command string is a Claude CLI binary.
 * Matches only the actual `claude` binary name (case-sensitive),
 * not processes that happen to have "claude" in their arguments or paths.
 */
export function isClaudeBinary(command: string): boolean {
  const firstWord = command.split(/\s+/)[0] || "";
  const binaryName = firstWord.split("/").pop() || "";
  return binaryName === "claude";
}

/**
 * Find all Claude Code CLI processes from a process table.
 * Only matches the `claude` binary itself, filtering out Claude Desktop app,
 * editors with .claude/ paths, and other false positives.
 */
export function getClaudeProcesses(processTable: ProcessInfo[]): ClaudeProcess[] {
  return processTable
    .filter((p) => isClaudeBinary(p.command))
    .map((p) => ({ pid: p.pid, ppid: p.ppid }));
}

/**
 * Get the current working directory of a process via lsof
 */
export function getProcessCwd(pid: number, exec: ExecFn = defaultExec): string | null {
  try {
    const output = exec(`lsof -a -p ${pid} -d cwd -Fn`);
    // lsof -Fn outputs lines starting with 'n' for the name field
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.startsWith("n") && line.length > 1) {
        return line.slice(1);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Encode a CWD path to the Claude projects directory format.
 * Replaces / with - and . with - (keeps leading -)
 * Example: /Users/test/my.project -> -Users-test-my-project
 */
export function encodeCwdPath(cwd: string): string {
  return cwd.replace(/\//g, "-").replace(/\./g, "-");
}

/**
 * Find the most recently modified JSONL file for a Claude session.
 * Looks in ~/.claude/projects/<encoded-cwd>/ for *.jsonl files.
 */
export function findSessionJsonlPath(cwd: string): string | null {
  const encoded = encodeCwdPath(cwd);
  const projectDir = join(homedir(), ".claude", "projects", encoded);

  if (!existsSync(projectDir)) return null;

  try {
    const entries = readdirSync(projectDir);
    let newest: { path: string; mtime: number } | null = null;

    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const fullPath = join(projectDir, entry);
      try {
        const stat = statSync(fullPath);
        if (!newest || stat.mtimeMs > newest.mtime) {
          newest = { path: fullPath, mtime: stat.mtimeMs };
        }
      } catch {
        // Skip files we can't stat
      }
    }

    return newest?.path ?? null;
  } catch {
    return null;
  }
}

const JSONL_TAIL_LINES = 200;
const JSONL_MAX_CHARS = 8000;

interface JsonlContentBlock {
  type?: string;
  text?: string;
}

interface JsonlMessage {
  role?: string;
  content?: string | JsonlContentBlock[];
}

interface JsonlEntry {
  type?: string;
  message?: JsonlMessage;
}

/**
 * Extract conversation text from the tail of a JSONL file.
 * Reads last N lines and extracts text from user/assistant messages.
 */
export function extractJsonlConversation(jsonlPath: string): string | null {
  try {
    const content = readFileSync(jsonlPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const tailLines = lines.slice(-JSONL_TAIL_LINES);

    const messages: string[] = [];
    let totalChars = 0;

    // Process from newest to oldest, then reverse
    for (let i = tailLines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(tailLines[i]) as JsonlEntry;
        if (entry.type !== "user" && entry.type !== "assistant") continue;

        const text = extractTextFromMessage(entry.message);
        if (!text) continue;

        if (totalChars + text.length > JSONL_MAX_CHARS) break;
        messages.unshift(`[${entry.type}]: ${text}`);
        totalChars += text.length;
      } catch {
        // Skip malformed lines
      }
    }

    return messages.length > 0 ? messages.join("\n\n") : null;
  } catch {
    return null;
  }
}

function extractTextFromMessage(message: JsonlMessage | undefined): string | null {
  if (!message?.content) return null;

  if (typeof message.content === "string") {
    return message.content.trim() || null;
  }

  if (Array.isArray(message.content)) {
    const textParts: string[] = [];
    for (const block of message.content) {
      if (block.type === "text" && block.text) {
        textParts.push(block.text);
      }
    }
    const joined = textParts.join("\n").trim();
    return joined || null;
  }

  return null;
}

/**
 * Get project name from CWD using git remote
 */
export function getProjectName(cwd: string, exec: ExecFn = defaultExec): string {
  try {
    const remoteUrl = exec(`git -C ${shellEscape(cwd)} remote get-url origin`);

    // Parse SSH URL: git@github.com:user/repo.git -> repo
    const sshMatch = remoteUrl.match(/[:/]([^/]+?)(?:\.git)?$/);
    if (sshMatch) {
      return sshMatch[1].replace(/\.git$/, "");
    }

    // Parse HTTPS URL: https://github.com/user/repo.git -> repo
    const httpsMatch = remoteUrl.match(/\/([^/]+?)(?:\.git)?$/);
    if (httpsMatch) {
      return httpsMatch[1].replace(/\.git$/, "");
    }
  } catch {
    // Fall through to basename
  }

  // Fallback: basename of cwd
  return cwd.split("/").pop() || cwd;
}

/**
 * Get current git branch
 */
export function getGitBranch(cwd: string, exec: ExecFn = defaultExec): string | null {
  try {
    return exec(`git -C ${shellEscape(cwd)} rev-parse --abbrev-ref HEAD`) || null;
  } catch {
    return null;
  }
}

/**
 * Build tmux target string from pane info
 */
export function buildTmuxTarget(pane: TmuxPane): string {
  return `${pane.session_name}:${pane.window_index}.${pane.pane_index}`;
}

/**
 * Switch tmux client to a specific pane
 */
export function switchToPane(paneId: string, exec: ExecFn = defaultExec): boolean {
  try {
    exec(`tmux switch-client -t ${shellEscape(paneId)}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send text to a tmux pane followed by Enter key press.
 * Uses -l flag to send text literally (avoiding key-name interpretation),
 * then sends Enter as a separate command to ensure proper submission.
 */
export function sendKeys(paneId: string, text: string, exec: ExecFn = defaultExec): boolean {
  try {
    const target = shellEscape(paneId);
    exec(`tmux send-keys -t ${target} -l ${shellEscape(text)}`);
    exec(`tmux send-keys -t ${target} Enter`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a raw tmux key name to a pane (e.g. Escape, Enter, C-c).
 * Unlike sendKeys(), this does NOT use -l (literal) mode and does NOT append Enter.
 */
export function sendRawKey(paneId: string, key: string, exec: ExecFn = defaultExec): boolean {
  try {
    exec(`tmux send-keys -t ${shellEscape(paneId)} ${shellEscape(key)}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Capture the current visible content of a tmux pane.
 * Used for diff-based idle detection — if content doesn't change between
 * two consecutive captures, the pane is considered static.
 */
export function capturePaneContent(paneId: string, exec: ExecFn = defaultExec): string | null {
  try {
    return exec(`tmux capture-pane -p -t ${shellEscape(paneId)}`);
  } catch {
    return null;
  }
}

/**
 * Capture pane content with ANSI escape sequences preserved.
 * Uses -e flag to include color/style codes for terminal rendering.
 */
export function capturePaneContentEscaped(
  paneId: string,
  exec: ExecFn = defaultExec,
): string | null {
  try {
    return exec(`tmux capture-pane -p -e -t ${shellEscape(paneId)}`);
  } catch {
    return null;
  }
}

/**
 * Capture pane content with ANSI escape sequences, then sanitize:
 * strips dim/faint suggestion text, remaining ANSI codes, and the
 * Claude Code prompt input area. Returns clean text suitable for
 * Gemini summarization.
 */
export function capturePaneContentSanitized(
  paneId: string,
  exec: ExecFn = defaultExec,
): string | null {
  try {
    const raw = exec(`tmux capture-pane -p -e -t ${shellEscape(paneId)}`);
    return sanitizePaneContent(raw);
  } catch {
    return null;
  }
}

/**
 * Start piping a tmux pane's output to a target (e.g., a FIFO).
 * Uses -o flag for output-only mode (excludes keyboard input).
 * Calling this again on the same pane replaces the existing pipe.
 */
export function startPipePane(paneId: string, target: string, exec: ExecFn = defaultExec): boolean {
  try {
    exec(`tmux pipe-pane -o -t ${shellEscape(paneId)} ${shellEscape(`cat > ${target}`)}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop piping a tmux pane's output.
 * Calling pipe-pane with no command argument cancels the existing pipe.
 */
export function stopPipePane(paneId: string, exec: ExecFn = defaultExec): boolean {
  try {
    exec(`tmux pipe-pane -t ${shellEscape(paneId)}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the modification time (in milliseconds) of a JSONL file.
 * Used by the summary change guard to skip Gemini calls when content hasn't changed.
 */
export function getJsonlMtime(jsonlPath: string): number | null {
  try {
    return statSync(jsonlPath).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Match Claude processes to tmux panes by walking the process tree.
 * For each Claude process, walks up the PPID chain to find an ancestor
 * that is a tmux pane's initial process (pane_pid).
 * This handles cases where claude is launched through intermediate processes
 * (e.g., shell → wrapper script → claude).
 */
export function matchProcessesToPanes(
  processes: ClaudeProcess[],
  panes: TmuxPane[],
  processTable: ProcessInfo[] = [],
): Map<string, { process: ClaudeProcess; pane: TmuxPane }> {
  const paneByPid = new Map<number, TmuxPane>();
  for (const pane of panes) {
    paneByPid.set(pane.pane_pid, pane);
  }

  // Build PID → ProcessInfo lookup for ancestor walking
  const processById = new Map<number, ProcessInfo>();
  for (const p of processTable) {
    processById.set(p.pid, p);
  }

  const result = new Map<string, { process: ClaudeProcess; pane: TmuxPane }>();

  for (const proc of processes) {
    // Walk up the process tree from claude's parent
    let currentPid = proc.ppid;
    const visited = new Set<number>();

    while (currentPid > 1 && !visited.has(currentPid)) {
      visited.add(currentPid);

      const pane = paneByPid.get(currentPid);
      if (pane) {
        result.set(pane.pane_id, { process: proc, pane });
        break;
      }

      const parent = processById.get(currentPid);
      if (!parent) break;
      currentPid = parent.ppid;
    }
  }

  return result;
}
