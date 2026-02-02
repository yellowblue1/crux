import { homedir } from "node:os";
import { join } from "node:path";

export const DB_DIR = join(homedir(), ".local/share/crux-monitor");
export const DB_FILE = join(DB_DIR, "events.db");
export const RETENTION_DAYS = 30;
