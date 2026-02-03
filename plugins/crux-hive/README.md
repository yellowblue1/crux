# crux-hive Plugin

Git worktree workflow with tmux integration for parallel Claude Code sessions.

## Overview

Delegate tasks to parallel Claude Code sessions running in separate git worktrees. When a worker completes a task, the orchestrator is notified via the `send_message` tool.

## Prerequisites

- **tmux**: Must be running inside a tmux session
- **[git-gtr](https://github.com/coderabbitai/git-worktree-runner)**: Git worktree runner tool
- **Claude Code**: Installed and configured

## Installation

```bash
claude plugin install /path/to/crux-hive
```

## Usage

```
/orchestrator-mode
```

That's it. The orchestrator handles everything:
1. Creates orchestrator session
2. Starts background polling for notifications
3. Delegates tasks to worker sessions in separate worktrees
4. Receives notification when workers complete tasks
5. Reviews and merges PRs

## How it works

```
You (human)
    │
    └─► /orchestrator-mode
            │
            ▼
        Orchestrator (Claude)
            │
            ├─► Creates worktree + worker session
            │
            └─► Polls for messages
                    ▲
                    │ notification via send_message
                    │
        Worker (Claude in worktree)
            │
            └─► Completes task (creates PR, etc.)
                    │
                    ▼
                SessionStart hook injects instructions → Claude calls send_message
```

## Architecture Details

### Why the PreToolUse Auto-Approve Hook Exists

The orchestrator uses a background notification watcher that must restart periodically (every 10 minutes due to timeout). Without the PreToolUse hook, users would be prompted to approve Bash commands every 10 minutes, breaking the unattended workflow.

**Why simpler alternatives don't work:**

| Approach | Why It Doesn't Work |
|----------|---------------------|
| `permissionMode: "bypassPermissions"` | Dangerous - approves ALL tools without validation |
| One-time user approval | Doesn't persist across Task restarts |
| `--dangerously-skip-permissions` | Inappropriate for plugins - affects entire session |

The hook (`scripts/hooks/auto-approve-watcher.ts`) follows [Claude Code's recommended approach](https://code.claude.com/docs/en/hooks) for conditional tool approval:

1. **Strict regex validation** - Only approves exact command patterns
2. **ID format validation** - Ensures orchestrator ID is properly formatted  
3. **Dangerous pattern detection** - Blocks command injection attempts
4. **Graceful passthrough** - Non-matching commands proceed to normal permission flow

This aligns with the official documentation which explicitly recommends PreToolUse hooks when you need to "allow some operations of a tool while blocking others."

## Note

The plugin creates `.claude/.orchestrator-id` in worktrees. Ensure your `.gitignore` includes `.claude/*` (with appropriate exceptions) to avoid committing this file.

## Uninstalling

```bash
claude plugin uninstall crux-hive
```
