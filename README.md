# CRUX (Claude Running mUX)

Orchestrate multiple Claude Code sessions in parallel.

## What You Can Do

CRUX enables a powerful orchestrator-worker pattern for Claude Code:

- **Run an orchestrator session** that delegates tasks to worker sessions
- **Workers run simultaneously** in isolated git worktrees
- **Each worker creates a PR** when their task completes
- **Complete multiple features or fixes** in parallel

## Prerequisites

- [Bun](https://bun.sh/) - Required to run plugin scripts

## Quick Start

```bash
# Add marketplace
claude plugin marketplace add https://github.com/akirasosa/crux

# Install plugins
claude plugin install crux-hive

# Optional: Install companion monitoring plugin
claude plugin install crux-monitor
```

Then in any Claude Code session, use the `/orchestrator-mode` command to start delegating tasks to parallel workers.

## Available Plugins

| Plugin | Description | Requirements |
|--------|-------------|--------------|
| [crux-hive](./plugins/crux-hive/) | Orchestrate parallel Claude Code sessions—delegate tasks to workers that create PRs automatically | tmux, [git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner) |
| [crux-monitor](./plugins/crux-monitor/) | (Optional) Get browser notifications when tasks complete and monitor all sessions | - |

## Crux Monitor Web UI (Optional)

```bash
git clone https://github.com/akirasosa/crux
cd crux && bun install
bun run --cwd plugins/crux-monitor/web start  # starts on port 3847
```

Or download pre-built binary from [Releases](https://github.com/akirasosa/crux/releases).

## Tips

**Serena users**: Include `.serena` in worktrees: `git config --global --add gtr.copy.includeDirs .serena`

## Uninstalling

```bash
claude plugin uninstall crux-hive
claude plugin uninstall crux-monitor  # if installed
claude plugin marketplace remove crux
```
