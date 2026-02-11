# CRUX Hooks Analysis

This document provides a comprehensive inventory and analysis of all Claude Code plugin hooks and git-gtr integration hooks in the CRUX monorepo.

## Summary

All 8 hooks in the CRUX monorepo serve distinct, active purposes. No unnecessary or redundant hooks were identified.

## Hooks Inventory

### crux-hive Plugin (2 hooks)

| Hook Type | File | Purpose |
|-----------|------|---------|
| SessionStart | `src/ensure-gtrconfig.ts` | Configures git-gtr hooks (preRemove/postCreate) and injects worker mode instructions when running under an orchestrator |
| PreToolUse (Bash) | `scripts/hooks/auto-approve-watcher.ts` | Auto-approves the documented notification watcher Bash command (Step 2 of orchestrator-mode.md) |

### panopticon Plugin (4 hooks)

| Hook Type | File | Purpose |
|-----------|------|---------|
| SessionStart | `src/cli.ts notification sessionstart` | Logs session start event to SQLite with tmux window ID and process PID |
| Notification | `src/cli.ts notification notification` | Logs notification events (idle prompt, permission dialogs) |
| Stop | `src/cli.ts notification stop` | Logs session stop event |
| SessionEnd | `src/cli.ts notification sessionend` | Logs session end event with termination reason |

### Git-gtr Integration Hooks (configured by crux-hive SessionStart)

| Hook | File | Purpose |
|------|------|---------|
| preRemove | `scripts/cleanup` | Kills tmux window when worktree is removed via `git gtr rm` |
| postCreate | `scripts/setup-symlinks` | Creates symlinks for `.claude/settings.local.json` and `CLAUDE.local.md` in new worktrees |

## Detailed Analysis

### PreToolUse auto-approve-watcher Hook

**Location:** `plugins/crux-hive/scripts/hooks/auto-approve-watcher.ts`

**Initially suspected as obsolete** due to commit 60a8a16 removing `poll_messages` and `get_orchestrator_status` MCP tools.

**Finding: NECESSARY**

The notification watcher is still documented in `orchestrator-mode.md` Step 2 (lines 88-104). The removed MCP tools were an alternative approach; the file-based watcher with this auto-approve hook remains the current mechanism for orchestrators to receive worker notifications.

The hook auto-approves the `bun run poll-notifications.ts` command that watches for notification files, preventing manual approval prompts during orchestrator operation.

### Git-gtr Hooks

**Location:** `plugins/crux-hive/scripts/`

**Finding: NECESSARY**

Both hooks are actively used and documented:

1. **cleanup (preRemove):** Documented in orchestrator-mode.md line 258-260 stating "NEVER use `git worktree remove` directly". This hook ensures the associated tmux window is killed when a worktree is removed via `git gtr rm`.

2. **setup-symlinks (postCreate):** Essential for sharing user configuration across worktrees. Creates symlinks for:
   - `.claude/settings.local.json` - User's local Claude settings
   - `CLAUDE.local.md` - User's personal project instructions

### Redundancy Check: crux-hive vs panopticon SessionStart

**Finding: NO REDUNDANCY**

Both plugins have SessionStart hooks but serve completely different purposes:

- **crux-hive SessionStart:** Git-gtr configuration + orchestrator context injection (worker mode setup)
- **panopticon SessionStart:** Event logging to SQLite database for the monitoring dashboard

These hooks are complementary, not redundant.

## Hook Flow Diagram

```
Session Lifecycle:
┌─────────────────┐
│  Session Start  │
└────────┬────────┘
         │
         ├── crux-hive: Configure git-gtr, inject worker mode
         └── panopticon: Log session start event
         │
┌────────▼────────┐
│  Tool Use       │
└────────┬────────┘
         │
         └── crux-hive PreToolUse: Auto-approve watcher command
         │
┌────────▼────────┐
│  Notifications  │
└────────┬────────┘
         │
         └── panopticon: Log notification events
         │
┌────────▼────────┐
│  Session Stop   │
└────────┬────────┘
         │
         └── panopticon: Log stop event
         │
┌────────▼────────┐
│  Session End    │
└─────────────────┘
         │
         └── panopticon: Log session end with reason

Worktree Lifecycle (via git-gtr):
┌─────────────────┐
│ git gtr add     │
└────────┬────────┘
         │
         └── postCreate: Setup symlinks for config files
         │
┌────────▼────────┐
│ git gtr rm      │
└─────────────────┘
         │
         └── preRemove: Kill associated tmux window
```

## Conclusion

All hooks in the CRUX monorepo are necessary and actively used. The investigation confirms:

1. **No hooks should be removed** - Each hook serves a distinct purpose
2. **No redundancy exists** - Hooks with similar types (e.g., SessionStart) serve different plugins with different responsibilities
3. **Documentation is current** - The orchestrator-mode.md correctly documents the watcher mechanism that relies on the PreToolUse hook

## References

- [orchestrator-mode.md](../plugins/crux-hive/docs/orchestrator-mode.md) - Orchestrator workflow documentation
- [crux-hive plugin.json](../plugins/crux-hive/.claude-plugin/plugin.json) - Hook configuration
- [panopticon plugin.json](../tools/panopticon/.claude-plugin/plugin.json) - Hook configuration
