/**
 * Build standalone binaries for crux-monitor-web
 *
 * This script orchestrates:
 * 1. Vite build (generates dist/)
 * 2. Embed file generation (generates embed.generated.ts)
 * 3. Bun compile for each target platform
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const WEB_DIR = join(import.meta.dir, "..");
const BIN_DIR = join(WEB_DIR, "bin");

interface BuildTarget {
  target: string;
  output: string;
}

const TARGETS: BuildTarget[] = [
  { target: "bun-darwin-arm64", output: "crux-monitor-web-darwin-arm64" },
  { target: "bun-darwin-x64", output: "crux-monitor-web-darwin-x64" },
  { target: "bun-linux-x64", output: "crux-monitor-web-linux-x64" },
];

async function run(cmd: string[], cwd: string): Promise<void> {
  console.log(`> ${cmd.join(" ")}`);
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}`);
  }
}

async function main() {
  console.log("=== Building crux-monitor-web binaries ===\n");

  // Step 1: Build Vite
  console.log("Step 1: Building Vite...");
  await run(["bun", "run", "build"], WEB_DIR);
  console.log();

  // Step 2: Generate embed file
  console.log("Step 2: Generating embed.generated.ts...");
  await run(["bun", "run", "scripts/generate-embed.ts"], WEB_DIR);
  console.log();

  // Step 3: Create bin directory
  console.log("Step 3: Preparing bin directory...");
  await rm(BIN_DIR, { recursive: true, force: true });
  await mkdir(BIN_DIR, { recursive: true });
  console.log();

  // Step 4: Compile for each target
  console.log("Step 4: Compiling binaries...");
  for (const { target, output } of TARGETS) {
    console.log(`\n  Building ${output}...`);
    const outPath = join(BIN_DIR, output);
    await run(
      [
        "bun",
        "build",
        "--compile",
        "--minify",
        "--target",
        target,
        "--outfile",
        outPath,
        "server-compiled.ts",
      ],
      WEB_DIR,
    );
  }

  console.log("\n=== Build complete ===");
  console.log(`Binaries available in: ${BIN_DIR}`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
