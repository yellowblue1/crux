import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createInbox, getLeadSessionId, registerTeamMember } from "../utils/agent-teams.js";
import { getMcpServersFromProject, updateClaudeConfig } from "../utils/claude-config.js";
import { exec, execOrThrow, shellEscape } from "../utils/exec.js";
import { createWindow, isTmuxAvailable, sendKeys, waitForShellInit } from "../utils/tmux.js";

export interface StartWorktreeSessionArgs {
  branch: string;
  fromRef?: string;
  planMode?: boolean;
  prompt?: string;
  pluginDir?: string;
  teamName?: string;
  agentName?: string;
  agentColor?: string;
  model?: string;
}

/**
 * Validates a git branch name or ref against safe characters.
 * Allows alphanumeric, slashes, hyphens, underscores, and dots.
 * This prevents command injection via shell metacharacters.
 */
function isValidGitRef(ref: string): boolean {
  const safeRefPattern = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;
  if (!safeRefPattern.test(ref)) {
    return false;
  }
  if (ref.includes("..") || ref.endsWith(".lock") || ref.includes("@{")) {
    return false;
  }
  return true;
}

/**
 * Builds the Agent Teams CLI flags for launching a teammate.
 * Returns an empty string if teamName is not provided.
 */
function buildAgentTeamsFlags(args: {
  teamName: string;
  agentName: string;
  leadSessionId: string;
  agentColor?: string;
  model?: string;
  planMode?: boolean;
}): string {
  const { teamName, agentName, leadSessionId, agentColor, model, planMode } = args;
  const agentId = `${agentName}@${teamName}`;

  const flags = [
    `--agent-id ${shellEscape(agentId)}`,
    `--agent-name ${shellEscape(agentName)}`,
    `--team-name ${shellEscape(teamName)}`,
    `--parent-session-id ${shellEscape(leadSessionId)}`,
    `--agent-type Bash`,
  ];

  if (agentColor) {
    flags.push(`--agent-color ${shellEscape(agentColor)}`);
  }

  if (model) {
    flags.push(`--model ${shellEscape(model)}`);
  }

  if (planMode) {
    flags.push("--plan-mode-required");
  }

  return flags.join(" ");
}

/**
 * Creates a git worktree and starts Claude Code in a new tmux window
 */
export async function startWorktreeSession(
  args: StartWorktreeSessionArgs,
): Promise<CallToolResult> {
  const { branch, fromRef, planMode, prompt, pluginDir, teamName, agentName, agentColor, model } =
    args;

  // Validate branch parameter
  if (!branch || typeof branch !== "string") {
    return {
      content: [{ type: "text", text: "Error: branch parameter is required" }],
      isError: true,
    };
  }

  // Validate branch name to prevent command injection
  if (!isValidGitRef(branch)) {
    return {
      content: [
        {
          type: "text",
          text: "Error: Invalid branch name. Branch names must contain only alphanumeric characters, slashes, hyphens, underscores, and dots.",
        },
      ],
      isError: true,
    };
  }

  // Validate fromRef if provided
  if (fromRef && !isValidGitRef(fromRef)) {
    return {
      content: [
        {
          type: "text",
          text: "Error: Invalid fromRef. Ref names must contain only alphanumeric characters, slashes, hyphens, underscores, and dots.",
        },
      ],
      isError: true,
    };
  }

  // Validate pluginDir if provided
  if (pluginDir !== undefined) {
    if (typeof pluginDir !== "string" || pluginDir.length === 0) {
      return {
        content: [{ type: "text", text: "Error: pluginDir must be a non-empty string" }],
        isError: true,
      };
    }
  }

  // Validate teamName requires agentName
  if (teamName && !agentName) {
    return {
      content: [{ type: "text", text: "Error: agentName is required when teamName is provided" }],
      isError: true,
    };
  }

  // Check if running inside a tmux session
  if (!isTmuxAvailable()) {
    return {
      content: [{ type: "text", text: "Error: Must be run inside a tmux session" }],
      isError: true,
    };
  }

  // Resolve Agent Teams config before creating the worktree
  let agentTeamsFlags = "";
  if (teamName && agentName) {
    const leadSessionId = await getLeadSessionId(teamName);
    if (!leadSessionId) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Team '${teamName}' not found or missing leadSessionId. Create the team with TeamCreate first.`,
          },
        ],
        isError: true,
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
  const gtrNewCommand = fromRef
    ? `git gtr new "${branch}" --from "${fromRef}"`
    : `git gtr new "${branch}"`;

  const createResult = exec(gtrNewCommand);
  if (!createResult.success) {
    return {
      content: [
        {
          type: "text",
          text: `Error: Failed to create worktree for branch '${branch}': ${createResult.error}`,
        },
      ],
      isError: true,
    };
  }

  // Get worktree path
  let worktreePath: string;
  try {
    worktreePath = execOrThrow(`git gtr go "${branch}"`);
  } catch (e) {
    return {
      content: [
        {
          type: "text",
          text: `Error: Failed to get worktree path: ${(e as Error).message}`,
        },
      ],
      isError: true,
    };
  }

  if (!worktreePath) {
    return {
      content: [{ type: "text", text: "Error: Failed to get worktree path" }],
      isError: true,
    };
  }

  // Get MCP servers from the current project's .mcp.json
  const mcpServers = await getMcpServersFromProject(process.cwd());

  // Update ~/.claude.json to trust the worktree and enable MCP servers
  await updateClaudeConfig(worktreePath, mcpServers);

  // Register teammate and create inbox if Agent Teams is enabled
  if (teamName && agentName) {
    try {
      await registerTeamMember(teamName, {
        agentId: `${agentName}@${teamName}`,
        name: agentName,
        agentType: "Bash",
        model: model,
        color: agentColor,
        isActive: true,
        cwd: worktreePath,
      });
      await createInbox(teamName, agentName);
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Failed to register teammate: ${(e as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Window name (remove branch prefix like feat/, fix/, etc.)
  const windowName = branch.includes("/") ? branch.split("/").pop() || branch : branch;

  // Create new tmux window
  let windowId: string;
  try {
    windowId = createWindow(windowName, worktreePath);
  } catch (e) {
    return {
      content: [
        {
          type: "text",
          text: `Error: Failed to create tmux window: ${(e as Error).message}`,
        },
      ],
      isError: true,
    };
  }

  // Wait for shell initialization
  await waitForShellInit();

  // Build claude command
  const pluginDirFlag = pluginDir ? `--plugin-dir ${shellEscape(pluginDir)}` : "";
  const planModeFlag = planMode ? "--permission-mode plan" : "";

  if (prompt) {
    const encoded = Buffer.from(prompt).toString("base64");
    await sendKeys(
      windowId,
      `claude ${agentTeamsFlags} ${pluginDirFlag} ${planModeFlag} "$(echo '${encoded}' | base64 -d)"`,
    );
  } else {
    await sendKeys(windowId, `claude ${agentTeamsFlags} ${pluginDirFlag} ${planModeFlag}`);
  }

  return {
    content: [
      {
        type: "text",
        text: `Started Claude Code in worktree: ${worktreePath}`,
      },
    ],
  };
}
