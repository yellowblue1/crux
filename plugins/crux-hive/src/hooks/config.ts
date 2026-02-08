import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface QualityGateCommand {
  name: string;
  command: string;
}

export interface QualityGateConfig {
  commands: QualityGateCommand[];
  timeout?: number;
}

export interface CruxHiveConfig {
  qualityGates?: {
    teammateIdle?: QualityGateConfig;
    taskCompleted?: QualityGateConfig;
  };
}

/**
 * Load .crux-hive.json from the current working directory.
 * Returns null if the file does not exist or is invalid.
 */
export function loadConfig(cwd?: string): CruxHiveConfig | null {
  const configPath = join(cwd ?? process.cwd(), ".crux-hive.json");

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content) as CruxHiveConfig;
  } catch {
    return null;
  }
}
