/**
 * File system test utilities for isolated test environments
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const createdDirs: string[] = [];

function generateTempPath(prefix = "test"): string {
  const id = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now();
  return join(tmpdir(), `crux-monitor-${prefix}-${timestamp}-${id}`);
}

/**
 * Create an isolated temp directory for testing
 */
export function createTempDir(prefix = "test"): string {
  const dir = generateTempPath(prefix);
  mkdirSync(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

/**
 * Create a file in the specified directory with the given content
 */
export function createFile(dir: string, filename: string, content: string): string {
  const filePath = join(dir, filename);
  const parentDir = join(filePath, "..");

  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

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
