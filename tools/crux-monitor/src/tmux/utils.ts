import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ClaudeProcess, ProcessInfo, TmuxPane } from "../types";

/**
 * Escape a string for safe use in shell commands.
 * Uses single quotes and escapes any embedded single quotes.
 */
function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

type ExecFn = (command: string) => string;

const defaultExec: ExecFn = (command: string) =>
  execSync(command, {
    encoding: "utf-8",
    timeout: 5000,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

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
