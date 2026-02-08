// Register Lit components (side-effect imports)
// Components are registered via @customElement decorator

import "./session-row";
import "./status-badge";

// Re-export types for use in app.ts
export type { SessionRow } from "./session-row";
