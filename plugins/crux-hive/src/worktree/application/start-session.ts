import { shellEscape } from "../../shared/exec.js";
import type { TeamRepository } from "../../team/domain/ports.js";
import { buildAgentTeamsFlags } from "../domain/agent-teams-flags.js";
import type { ConfigAdapter, GitAdapter, TmuxAdapter } from "../domain/ports.js";
import type { SessionResult, StartWorktreeSessionArgs } from "../domain/types.js";
import { isValidGitRef } from "../domain/validators.js";

interface StartSessionDeps {
  git: GitAdapter;
  tmux: TmuxAdapter;
  config: ConfigAdapter;
  teamRepo: TeamRepository;
  cwd: string;
}

/**
 * Creates a git worktree and starts Claude Code in a new tmux window
 */
export async function startSession(
  args: StartWorktreeSessionArgs,
  deps: StartSessionDeps,
): Promise<SessionResult> {
  const {
    branch,
    fromRef,
    noFetch,
    planMode,
    prompt,
    pluginDir,
    teamName,
    agentName,
    agentColor,
    model,
  } = args;

  // Validate branch parameter
  if (!branch || typeof branch !== "string") {
    return { success: false, error: "branch parameter is required" };
  }

  // Validate branch name to prevent command injection
  if (!isValidGitRef(branch)) {
    return {
      success: false,
      error:
        "Invalid branch name. Branch names must contain only alphanumeric characters, slashes, hyphens, underscores, and dots.",
    };
  }

  // Validate fromRef if provided
  if (fromRef && !isValidGitRef(fromRef)) {
    return {
      success: false,
      error:
        "Invalid fromRef. Ref names must contain only alphanumeric characters, slashes, hyphens, underscores, and dots.",
    };
  }

  // Validate pluginDir if provided
  if (pluginDir !== undefined) {
    if (typeof pluginDir !== "string" || pluginDir.length === 0) {
      return { success: false, error: "pluginDir must be a non-empty string" };
    }
  }

  // Validate teamName requires agentName
  if (teamName && !agentName) {
    return { success: false, error: "agentName is required when teamName is provided" };
  }

  // Check if running inside a tmux session
  if (!deps.tmux.isAvailable()) {
    return { success: false, error: "Must be run inside a tmux session" };
  }

  // Resolve Agent Teams config before creating the worktree
  let agentTeamsFlags = "";
  if (teamName && agentName) {
    const leadSessionId = await deps.teamRepo.getLeadSessionId(teamName);
    if (!leadSessionId) {
      return {
        success: false,
        error: `Team '${teamName}' not found or missing leadSessionId. Create the team with TeamCreate first.`,
      };
    }

    agentTeamsFlags = buildAgentTeamsFlags({
      teamName,
      agentName,
      leadSessionId,
      agentColor,
      model,
      planMode,
    });
  }

  // Create worktree
  const createResult = await deps.git.createWorktree(branch, fromRef, noFetch);
  if (!createResult.success) {
    return {
      success: false,
      error: `Failed to create worktree for branch '${branch}': ${createResult.error}`,
    };
  }

  // Get worktree path
  let worktreePath: string;
  try {
    worktreePath = await deps.git.getWorktreePath(branch);
  } catch (e) {
    return { success: false, error: `Failed to get worktree path: ${(e as Error).message}` };
  }

  if (!worktreePath) {
    return { success: false, error: "Failed to get worktree path" };
  }

  // Get MCP servers from the current project's .mcp.json
  const mcpServers = await deps.config.getMcpServersFromProject(deps.cwd);

  // Update ~/.claude.json to trust the worktree and enable MCP servers
  await deps.config.updateClaudeConfig(worktreePath, mcpServers);

  // Register teammate and create inbox if Agent Teams is enabled
  if (teamName && agentName) {
    try {
      await deps.teamRepo.registerMember(teamName, {
        agentId: `${agentName}@${teamName}`,
        name: agentName,
        agentType: "Bash",
        model,
        color: agentColor,
        isActive: true,
        cwd: worktreePath,
      });
      await deps.teamRepo.createInbox(teamName, agentName);
    } catch (e) {
      return { success: false, error: `Failed to register teammate: ${(e as Error).message}` };
    }
  }

  // Window name (remove branch prefix like feat/, fix/, etc.)
  const windowName = branch.includes("/") ? branch.split("/").pop() || branch : branch;

  // Create new tmux window
  let windowId: string;
  try {
    windowId = await deps.tmux.createWindow(windowName, worktreePath);
  } catch (e) {
    return { success: false, error: `Failed to create tmux window: ${(e as Error).message}` };
  }

  // Wait for shell initialization
  await deps.tmux.waitForShellInit();

  // Build claude command
  const pluginDirFlag = pluginDir ? `--plugin-dir ${shellEscape(pluginDir)}` : "";
  const planModeFlag = planMode ? "--permission-mode plan" : "";

  if (prompt) {
    const encoded = Buffer.from(prompt).toString("base64");
    await deps.tmux.sendKeys(
      windowId,
      `claude ${agentTeamsFlags} ${pluginDirFlag} ${planModeFlag} "$(echo '${encoded}' | base64 -d)"`,
    );
  } else {
    await deps.tmux.sendKeys(
      windowId,
      `claude ${agentTeamsFlags} ${pluginDirFlag} ${planModeFlag}`,
    );
  }

  return { success: true, worktreePath };
}
