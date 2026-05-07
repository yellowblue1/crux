import { exec, execOrThrow, shellEscape } from "../shared/exec.js";

export function configureGtrHooks(pluginRoot: string): void {
  ensureLocalConfig("gtr.hook.preRemove", `${pluginRoot}/scripts/cleanup`);
  ensureLocalConfig("gtr.hook.postCreate", `${pluginRoot}/scripts/setup-symlinks`);
}

function ensureLocalConfig(key: string, expected: string): void {
  const result = exec(`git config --local ${shellEscape(key)}`, { timeout: 1000 });
  const current = result.success ? result.stdout : null;
  if (current === expected) return;
  execOrThrow(`git config --local ${shellEscape(key)} ${shellEscape(expected)}`, {
    timeout: 1000,
  });
  console.log(`Configured ${key} in .git/config`);
}
