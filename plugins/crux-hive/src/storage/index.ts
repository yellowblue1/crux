import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Types
export type MessageType = "task_complete" | "task_failed" | "question";

export interface MessageContent {
  summary: string;
  details?: string;
  pr_url?: string;
  branch?: string;
  error?: string;
  question?: string;
}

export interface OrchestratorSession {
  id: string;
  project_dir: string;
  created_at: string;
}

export interface Message {
  id: string;
  orchestrator_id: string;
  worker_id: string | null;
  message_type: MessageType;
  content: MessageContent;
  created_at: string;
}

// Helper functions

/**
 * Generates a cryptographically secure random ID.
 * Uses crypto.randomBytes() instead of Math.random() for security.
 */
function generateId(prefix: string): string {
  // Generate 6 random bytes = 48 bits of entropy
  // Encode as hex (12 characters) for a total ID like "orch_a1b2c3d4e5f6"
  const randomHex = randomBytes(6).toString("hex");
  return `${prefix}_${randomHex}`;
}

/**
 * Validates an orchestrator ID to prevent path traversal attacks.
 * Supports both old (8-char alphanumeric) and new (12-char hex) formats
 * for backward compatibility during the transition period.
 */
function isValidOrchestratorId(id: string): boolean {
  // New format: orch_ + 12 hex characters
  // Old format: orch_ + 8 alphanumeric characters (for backward compatibility)
  return /^orch_[a-f0-9]{12}$/.test(id) || /^orch_[a-z0-9]{8}$/.test(id);
}

function generateUlid(): string {
  // Simple ULID-like ID: timestamp + random
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}${random}`;
}

function getOrchestratorDir(orchestratorId: string): string {
  // Validate ID format to prevent path traversal
  if (!isValidOrchestratorId(orchestratorId)) {
    throw new Error(`Invalid orchestrator ID format: ${orchestratorId}`);
  }
  return join(tmpdir(), orchestratorId);
}

function getSessionFile(orchestratorId: string): string {
  return join(getOrchestratorDir(orchestratorId), "session.json");
}

function getNotificationsDir(orchestratorId: string): string {
  return join(getOrchestratorDir(orchestratorId), "notifications");
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Storage operations

/**
 * Creates a new orchestrator session with file-based storage
 */
export function createOrchestratorSession(projectDir: string): OrchestratorSession {
  const id = generateId("orch");
  const now = new Date().toISOString();
  const session: OrchestratorSession = {
    id,
    project_dir: projectDir,
    created_at: now,
  };

  const orchestratorDir = getOrchestratorDir(id);
  ensureDir(orchestratorDir);
  ensureDir(getNotificationsDir(id));

  writeFileSync(getSessionFile(id), JSON.stringify(session, null, 2));

  return session;
}

/**
 * Gets an orchestrator session by ID
 */
export function getOrchestratorSession(orchestratorId: string): OrchestratorSession | null {
  const sessionFile = getSessionFile(orchestratorId);
  if (!existsSync(sessionFile)) {
    return null;
  }

  try {
    const content = readFileSync(sessionFile, "utf-8");
    return JSON.parse(content) as OrchestratorSession;
  } catch {
    return null;
  }
}

/**
 * Writes a notification (message) to the orchestrator's notifications directory
 */
export function writeNotification(
  orchestratorId: string,
  workerId: string | undefined,
  messageType: MessageType,
  content: MessageContent,
): Message {
  const notificationsDir = getNotificationsDir(orchestratorId);
  ensureDir(notificationsDir);

  const messageId = `msg_${generateUlid()}`;
  const now = new Date().toISOString();

  const message: Message = {
    id: messageId,
    orchestrator_id: orchestratorId,
    worker_id: workerId || null,
    message_type: messageType,
    content,
    created_at: now,
  };

  const messageFile = join(notificationsDir, `${messageId}.json`);
  writeFileSync(messageFile, JSON.stringify(message, null, 2));

  return message;
}

/**
 * Reads all notifications from the orchestrator's notifications directory.
 * Optionally deletes files after reading (cleanup).
 * Returns notifications sorted chronologically (ULID-based filenames ensure order).
 */
export function readNotifications(orchestratorId: string, cleanup = true): Message[] {
  const notificationsDir = getNotificationsDir(orchestratorId);

  if (!existsSync(notificationsDir)) {
    return [];
  }

  const files = readdirSync(notificationsDir)
    .filter((f) => f.endsWith(".json"))
    .sort(); // ULID-based names sort chronologically

  const messages: Message[] = [];

  for (const file of files) {
    const filePath = join(notificationsDir, file);
    try {
      const content = readFileSync(filePath, "utf-8");
      const message = JSON.parse(content) as Message;
      messages.push(message);

      if (cleanup) {
        unlinkSync(filePath);
      }
    } catch {
      // Skip malformed files
    }
  }

  return messages;
}
