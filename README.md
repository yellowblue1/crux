# CRUX (Claude Running mUX)

A collection of plugins for Claude Code.

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

## Available Plugins

| Plugin | Description | Requirements |
|--------|-------------|--------------|
| [crux-hive](./plugins/crux-hive/) | Git worktree workflow with tmux integration | tmux, [git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner) |
| [crux-monitor](./plugins/crux-monitor/) | (Optional) Event monitoring with desktop notifications and DB logging | - |

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
