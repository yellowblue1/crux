import { RETENTION_DAYS } from "./config";
import { dbExists, getDb } from "./database";

export interface CleanupResult {
  deleted: number;
  vacuumed: boolean;
}

export function cleanup(): CleanupResult {
  if (!dbExists()) {
    return { deleted: 0, vacuumed: false };
  }

  const db = getDb();
  try {
    // Calculate cutoff date (platform-independent)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

    // Delete old records
    db.prepare("DELETE FROM events WHERE date_part < ?").run(cutoffDateStr);
    const changes = db.query("SELECT changes() as count").get() as { count: number };
    const deleted = changes.count;

    // Run VACUUM if 100+ records deleted
    let vacuumed = false;
    if (deleted >= 100) {
      db.exec("VACUUM");
      vacuumed = true;
    }

    if (deleted > 0) {
      console.log(`Deleted ${deleted} old records (before ${cutoffDateStr})`);
      if (vacuumed) {
        console.log("Ran VACUUM to reclaim space");
      }
    } else {
      console.log("No old records to delete");
    }

    return { deleted, vacuumed };
  } finally {
    db.close();
  }
}
