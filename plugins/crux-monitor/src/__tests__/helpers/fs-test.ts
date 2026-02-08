/**
 * File system test utilities for isolated test environments
 */

import { existsSync, rmSync } from "node:fs";

const createdDirs: string[] = [];

/**
 * Clean up all temp directories created during tests
 */
export function cleanupAll(): void {
  for (const dir of [...createdDirs]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  createdDirs.length = 0;
}
