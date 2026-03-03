# crux-hive Plugin

Git worktree workflow with tmux integration for parallel Claude Code sessions.

## Overview

Delegate tasks to parallel Claude Code sessions running in separate git worktrees. Workers are launched as Agent Teams teammates with built-in `SendMessage` for bidirectional communication.

## Prerequisites

- **tmux**: Must be running inside a tmux session
- **[git-gtr](https://github.com/coderabbitai/git-worktree-runner)**: Git worktree runner tool
- **Claude Code**: Installed and configured
- **Agent Teams enabled**: The `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable must be set to `1` in any Claude settings file. Recommended: add to `~/.claude/settings.json` (user-global, applies to all projects) or `.claude/settings.local.json` (project-local, gitignored):
  ```json
  {
    "env": {
      "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
    }
  }
  ```
  > **Note**: This plugin includes a `settings.json` with this env var pre-configured, but Claude Code plugin settings currently only support the `agent` key. The `env` key is silently ignored. You must set it manually until Claude Code adds support.

## Installation

```bash
claude plugin install /path/to/crux-hive
```

## Usage

```
/orchestrator-mode
```

That's it. The orchestrator handles everything:
1. Creates a team with `TeamCreate`
2. Delegates tasks to worker sessions in separate worktrees
3. Workers communicate via built-in `SendMessage` (auto-delivered)
4. Reviews and merges PRs

## How it works

```
You (human)
    │
    └─► /orchestrator-mode
            │
            ▼
        Orchestrator (Claude)
            │
            ├─► TeamCreate → team config
            │
            ├─► start_worktree_session (with teamName)
            │       → Worker launched as Agent Teams teammate
            │
            └─► SendMessage (bidirectional, auto-delivered)
                    ▲
                    │
        Worker (Claude in worktree)
            │
            └─► Completes task (creates PR, etc.)
                    │
                    ▼
                Uses built-in SendMessage to notify orchestrator
```

## Uninstalling

```bash
claude plugin uninstall crux-hive
```
