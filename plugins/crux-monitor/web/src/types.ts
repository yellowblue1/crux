// Client-side type definitions for the Web UI
// Shared types are imported from shared/types

// Re-export shared types for convenience
export type {
  AuthStatusResponse,
  SessionResponse,
  SessionStatus,
  SessionsApiResponse,
} from "../../shared/types";

// Client-only types

export type ConnectionStatus = "connected" | "polling" | "disconnected";
