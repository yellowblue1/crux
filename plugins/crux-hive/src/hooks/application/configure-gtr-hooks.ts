import type { GitConfigAdapter } from "../domain/ports.js";

export function configureGtrHooks(pluginRoot: string, deps: { gitConfig: GitConfigAdapter }): void {
  const { gitConfig } = deps;

  // Configure preRemove hook (cleanup tmux windows)
  const preRemoveHookPath = `${pluginRoot}/scripts/cleanup`;
  const currentPreRemove = gitConfig.getLocal("gtr.hook.preRemove");

  if (currentPreRemove !== preRemoveHookPath) {
    gitConfig.setLocal("gtr.hook.preRemove", preRemoveHookPath);
    console.log("Configured gtr.hook.preRemove in .git/config");
  }

  // Configure postCreate hook (setup symlinks)
  const postCreateHookPath = `${pluginRoot}/scripts/setup-symlinks`;
  const currentPostCreate = gitConfig.getLocal("gtr.hook.postCreate");

  if (currentPostCreate !== postCreateHookPath) {
    gitConfig.setLocal("gtr.hook.postCreate", postCreateHookPath);
    console.log("Configured gtr.hook.postCreate in .git/config");
  }
}
