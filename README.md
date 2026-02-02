# CRUX (Claude Running mUX)

Orchestrate multiple Claude Code sessions in parallel.

[![asciicast](https://asciinema.org/a/lZ2Wrmw8wzsI4wyj.svg)](https://asciinema.org/a/lZ2Wrmw8wzsI4wyj)

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
claude plugin marketplace add git@github.com:yellowblue1/crux.git

# Install plugins
claude plugin install crux-hive

# Optional: Install companion monitoring plugin
claude plugin install crux-monitor
```

## Usage

1. **Start Claude Code** in your project directory
2. **Enter orchestrator mode** by running:
   ```
   /orchestrator-mode
   ```
3. **Describe your tasks** - the orchestrator will delegate them to parallel worker sessions
4. **Workers create PRs** when their tasks complete, and the orchestrator reviews and merges them

Example: "Add a login page and also fix the header layout bug" → The orchestrator spins up two workers, each handling one task in parallel.

## Available Plugins

| Plugin | Description | Requirements |
|--------|-------------|--------------|
| [crux-hive](./plugins/crux-hive/) | Orchestrate parallel Claude Code sessions—delegate tasks to workers that create PRs automatically | tmux, [git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner) |
| [crux-monitor](./plugins/crux-monitor/) | (Optional) Get browser notifications when tasks complete and monitor all sessions | - |

## Crux Monitor Web UI (Optional)

```bash
git clone https://github.com/yellowblue1/crux
cd crux && bun install
bun run --cwd plugins/crux-monitor/web start  # starts on port 3847
```

Or download pre-built binary from [Releases](https://github.com/yellowblue1/crux/releases).

## Tips

**Serena users**: Include `.serena` in worktrees: `git config --global --add gtr.copy.includeDirs .serena`

## Uninstalling

```bash
claude plugin uninstall crux-hive
claude plugin uninstall crux-monitor  # if installed
claude plugin marketplace remove crux
```
