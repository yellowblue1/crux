# crux-hive Plugin

Git worktree workflow with tmux integration for parallel Claude Code sessions.

## Overview

Delegate tasks to parallel Claude Code sessions running in separate git worktrees. Workers are launched as Agent Teams teammates with built-in `SendMessage` for bidirectional communication.

## Prerequisites

- **tmux**: Must be running inside a tmux session
- **[git-gtr](https://github.com/coderabbitai/git-worktree-runner)**: Git worktree runner tool
- **Claude Code**: Installed and configured
- **Agent Teams enabled**: Add the following to `~/.claude/settings.json` (user-global) or `.claude/settings.local.json` (project-local, gitignored):
  ```json
  {
    "env": {
      "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
    }
  }
  ```

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

## Debugging hooks

Hooks swallow errors by default so a misbehaving hook cannot block Claude Code. To surface the underlying error on stderr during development, set:

```bash
export CRUX_HIVE_DEBUG=1
```

Only the exact string `1` enables logging; other truthy-looking values (`true`, `yes`) are ignored.

## Uninstalling

```bash
claude plugin uninstall crux-hive
```
