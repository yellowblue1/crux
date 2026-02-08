import { generateSummary } from "./gemini";

export type EventType =
  | "stop"
  | "notification"
  | "sessionstart"
  | "sessionend"
  | "subagentstart"
  | "subagentstop"
  | "posttoolusefailure";

export interface NotificationInput {
  session_id?: string;
  cwd?: string;
  transcript_path?: string;
  reason?: string;
  notification_type?: string;
  // SubagentStart/SubagentStop fields
  agent_id?: string;
  agent_type?: string;
  // PostToolUseFailure fields
  tool_name?: string;
  error?: string;
  is_interrupt?: boolean;
}

/**
 * Handle a stop event: generate summary and log to DB
 */
async function handleStop(
  input: NotificationInput,
  logToDb: (eventType: string, summary: string) => void,
): Promise<void> {
  const transcriptPath = input.transcript_path || "";

  const summary = await generateSummary(transcriptPath, "stop");
  const displaySummary = summary || "Task completed";

  logToDb("Stop", displaySummary);
}

/**
 * Handle a notification event: generate summary and log to DB
 */
async function handleNotification(
  input: NotificationInput,
  logToDb: (eventType: string, summary: string) => void,
): Promise<void> {
  const transcriptPath = input.transcript_path || "";
  const notificationType = input.notification_type || "unknown";

  const summary = await generateSummary(transcriptPath, "notification");
  const displaySummary = summary || "Waiting for input";

  // Include notification type in the event type for better tracking
  // notification_type can be: idle_prompt, permission_prompt, elicitation_dialog, auth_success
  const eventType = `Notification:${notificationType}`;

  logToDb(eventType, displaySummary);
}

/**
 * Handle a session start event: log to DB only
 */
async function handleSessionStart(
  _input: NotificationInput,
  logToDb: (eventType: string, summary: string) => void,
): Promise<void> {
  logToDb("SessionStart", "Session started");
}

/**
 * Handle a session end event: log to DB with reason
 */
async function handleSessionEnd(
  input: NotificationInput,
  logToDb: (eventType: string, summary: string) => void,
): Promise<void> {
  const reason = input.reason || "unknown";
  const summary = `reason=${reason}`;

  logToDb("SessionEnd", summary);
}

/**
 * Handle a subagent start event: log agent type and ID to DB
 */
async function handleSubagentStart(
  input: NotificationInput,
  logToDb: (eventType: string, summary: string) => void,
): Promise<void> {
  const agentType = input.agent_type || "unknown";
  const agentId = input.agent_id || "unknown";
  const summary = `Started: ${agentType} agent (${agentId})`;

  logToDb("SubagentStart", summary);
}

/**
 * Handle a subagent stop event: log agent type and ID to DB
 */
async function handleSubagentStop(
  input: NotificationInput,
  logToDb: (eventType: string, summary: string) => void,
): Promise<void> {
  const agentType = input.agent_type || "unknown";
  const agentId = input.agent_id || "unknown";
  const summary = `Finished: ${agentType} agent (${agentId})`;

  logToDb("SubagentStop", summary);
}

/**
 * Handle a post tool use failure event: log tool name and error to DB
 */
async function handlePostToolUseFailure(
  input: NotificationInput,
  logToDb: (eventType: string, summary: string) => void,
): Promise<void> {
  const toolName = input.tool_name || "unknown";
  const error = input.error || "unknown error";
  const truncatedError = error.length > 100 ? `${error.substring(0, 100)}...` : error;
  const summary = `${toolName} failed: ${truncatedError}`;

  logToDb("PostToolUseFailure", summary);
}

/**
 * Main event handler that dispatches to specific handlers
 */
export async function handleEvent(
  eventType: EventType,
  input: NotificationInput,
  logToDb: (eventType: string, summary: string) => void,
): Promise<void> {
  switch (eventType) {
    case "stop":
      return handleStop(input, logToDb);
    case "notification":
      return handleNotification(input, logToDb);
    case "sessionstart":
      return handleSessionStart(input, logToDb);
    case "sessionend":
      return handleSessionEnd(input, logToDb);
    case "subagentstart":
      return handleSubagentStart(input, logToDb);
    case "subagentstop":
      return handleSubagentStop(input, logToDb);
    case "posttoolusefailure":
      return handlePostToolUseFailure(input, logToDb);
    default:
      // Unknown event type, log as-is
      logToDb(eventType, "Unknown event");
  }
}
