# CRUX (Claude Running mUX)

Orchestrate multiple Claude Code sessions in parallel.

[![asciicast](https://asciinema.org/a/wkgEfTf5N1a1sblC.svg)](https://asciinema.org/a/wkgEfTf5N1a1sblC)

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

# Install plugin
claude plugin install crux-hive
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

## Components

| Component | Type | Description | Requirements |
|-----------|------|-------------|--------------|
| [crux-hive](./plugins/crux-hive/) | Plugin | Orchestrate parallel Claude Code sessions—delegate tasks to workers that create PRs automatically | tmux, [git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner) |
| [panopticon](./tools/panopticon/) | Standalone tool | Real-time tmux-based session monitoring with browser notifications | tmux |

## Panopticon (Optional)

panopticon is a standalone tool (not a Claude Code plugin) that monitors Claude Code sessions running in tmux.

```bash
git clone https://github.com/yellowblue1/crux
cd crux && bun install
bun run --cwd tools/panopticon/web start  # starts on port 3847
```

## Tips

**Serena users**: Include `.serena` in worktrees: `git config --global --add gtr.copy.includeDirs .serena`

## Uninstalling

```bash
claude plugin uninstall crux-hive
claude plugin marketplace remove crux
```
