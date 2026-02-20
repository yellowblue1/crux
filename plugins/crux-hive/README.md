# crux-hive Plugin

Git worktree workflow with tmux integration for parallel Claude Code sessions.

## Overview

Delegate tasks to parallel Claude Code sessions running in separate git worktrees. Workers are launched as Agent Teams teammates with built-in `SendMessage` for bidirectional communication.

## Prerequisites

- **tmux**: Must be running inside a tmux session
- **[git-gtr](https://github.com/coderabbitai/git-worktree-runner)**: Git worktree runner tool
- **Claude Code**: Installed and configured
- **Agent Teams enabled**: Add the following to `.claude/settings.local.json`:
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
/orchestrator-mode    # Delegate pre-defined tasks to parallel workers
/issue-mode           # From vague idea → task decomposition → parallel workers
```

### orchestrator-mode

For when you already know what tasks to delegate:
1. Creates a team with `TeamCreate`
2. Delegates tasks to worker sessions in separate worktrees
3. Workers communicate via built-in `SendMessage` (auto-delivered)
4. Reviews and merges PRs

### issue-mode

For when you start from a vague idea:
1. Interactively clarifies requirements with the user
2. Decomposes into structured task cards (INVEST principles)
3. Gets user approval on the task breakdown
4. Delegates all tasks to parallel workers (same as orchestrator-mode)

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
