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

## Note

The plugin creates `.claude/.orchestrator-id` in worktrees. Ensure your `.gitignore` includes `.claude/*` (with appropriate exceptions) to avoid committing this file.

## Uninstalling

```bash
claude plugin uninstall crux-hive
```
