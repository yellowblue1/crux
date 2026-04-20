/**
 * Run a Claude Code hook's main() and swallow any error so the hook cannot
 * block the user's session. When CRUX_HIVE_DEBUG=1 is set, the error's
 * message and stack are logged to stderr before exiting cleanly so that
 * hook regressions are discoverable.
 */
export function runHook(main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    if (process.env.CRUX_HIVE_DEBUG === "1") {
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
      process.stderr.write(`[crux-hive] hook error: ${message}\n`);
    }
    // Always exit cleanly — a hook failure must never interrupt Claude Code.
  });
}
