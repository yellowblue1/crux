#!/usr/bin/env bun

const USAGE = `
Usage: crux-monitor <command>

Commands:
  web     Start the monitoring web server (default)
  help    Show this help message
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || "web";

  switch (command) {
    case "web":
      await import("../web/server");
      break;

    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
