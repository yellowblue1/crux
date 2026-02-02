import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
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
function generateId(prefix: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}_${id}`;
}

function generateUlid(): string {
  // Simple ULID-like ID: timestamp + random
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}${random}`;
}

function getOrchestratorDir(orchestratorId: string): string {
  return join(tmpdir(), orchestratorId);
}

function getSessionFile(orchestratorId: string): string {
  return join(getOrchestratorDir(orchestratorId), "session.json");
}

function getNotificationsDir(orchestratorId: string): string {
  return join(getOrchestratorDir(orchestratorId), "notifications");
}

function getNotificationsReadDir(orchestratorId: string): string {
  return join(getOrchestratorDir(orchestratorId), "notifications_read");
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
  ensureDir(getNotificationsReadDir(id));

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
 * Polls for unread notifications and marks them as read by moving to notifications_read
 */
export function pollNotifications(orchestratorId: string): Message[] {
  const notificationsDir = getNotificationsDir(orchestratorId);
  const readDir = getNotificationsReadDir(orchestratorId);

  if (!existsSync(notificationsDir)) {
    return [];
  }

  ensureDir(readDir);

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

      // Move to read directory
      const readPath = join(readDir, file);
      renameSync(filePath, readPath);
    } catch {}
  }

  return messages;
}

/**
 * Gets the count of unread notifications
 */
export function getNotificationCount(orchestratorId: string): { unread: number; total: number } {
  const notificationsDir = getNotificationsDir(orchestratorId);
  const readDir = getNotificationsReadDir(orchestratorId);

  let unread = 0;
  let read = 0;

  if (existsSync(notificationsDir)) {
    unread = readdirSync(notificationsDir).filter((f) => f.endsWith(".json")).length;
  }

  if (existsSync(readDir)) {
    read = readdirSync(readDir).filter((f) => f.endsWith(".json")).length;
  }

  return { unread, total: unread + read };
}
