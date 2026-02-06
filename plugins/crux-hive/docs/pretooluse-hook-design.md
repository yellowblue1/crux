# PreToolUse Auto-Approve Hook Design

This document explains the design rationale for the PreToolUse hook that auto-approves the notification watcher command.

## Why the Hook Exists

The orchestrator uses a background notification watcher that runs indefinitely until a notification arrives, then restarts. Without the PreToolUse hook, users would be prompted to approve Bash commands each time the watcher restarts, breaking the unattended workflow.

## Why Simpler Alternatives Don't Work

| Approach | Why It Doesn't Work |
|----------|---------------------|
| `permissionMode: "bypassPermissions"` | Dangerous - approves ALL tools without validation |
| One-time user approval | Doesn't persist across watcher restarts |
| `--dangerously-skip-permissions` | Inappropriate for plugins - affects entire session |

## Implementation

The hook (`scripts/hooks/auto-approve-watcher.ts`) follows [Claude Code's recommended approach](https://code.claude.com/docs/en/hooks) for conditional tool approval:

1. **Strict regex validation** - Only approves exact command patterns
2. **ID format validation** - Ensures orchestrator ID is exactly 12 lowercase hex characters
3. **Graceful passthrough** - Non-matching commands proceed to normal permission flow

## Security Considerations

The regex pattern is intentionally strict:

```
^bun run ([\w./-]+)/scripts/poll-notifications\.ts (orch_[a-f0-9]{12})$
```

- Path characters limited to `\w`, `.`, `/`, `-`
- No shell metacharacters allowed
- Orchestrator ID must match exact format
- No trailing arguments permitted

## References

- [Claude Code Hooks Documentation](https://code.claude.com/docs/en/hooks)
- [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents)
