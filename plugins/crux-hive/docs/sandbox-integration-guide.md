# Sandbox Integration Guide for crux-hive Workers

This guide provides implementation details for integrating sandboxing strategies into crux-hive parallel workers.

## Quick Start

### Enable Native Sandboxing (Recommended)

Add to your `.claude/settings.local.json`:

```json
{
  "sandbox": {
    "mode": "auto-allow",
    "network": {
      "allowedDomains": [
        "github.com",
        "*.github.com",
        "api.github.com",
        "registry.npmjs.org",
        "registry.yarnpkg.com",
        "pypi.org",
        "files.pythonhosted.org"
      ]
    }
  }
}
```

Workers will automatically inherit these settings via symlinks created by `postCreate` hook.

## Prerequisites

### macOS

Native sandboxing works out of the box using Seatbelt.

### Linux/WSL2

Install bubblewrap and socat:

```bash
# Debian/Ubuntu
sudo apt-get install bubblewrap socat

# Fedora/RHEL
sudo dnf install bubblewrap socat

# Arch
sudo pacman -S bubblewrap socat
```

## Configuration Templates

### Web Development (Node.js/TypeScript)

```json
{
  "sandbox": {
    "mode": "auto-allow",
    "network": {
      "allowedDomains": [
        "github.com", "*.github.com",
        "registry.npmjs.org",
        "registry.yarnpkg.com",
        "cdn.jsdelivr.net",
        "unpkg.com",
        "esm.sh"
      ]
    }
  }
}
```

### Python Development

```json
{
  "sandbox": {
    "mode": "auto-allow",
    "network": {
      "allowedDomains": [
        "github.com", "*.github.com",
        "pypi.org",
        "files.pythonhosted.org",
        "conda.anaconda.org"
      ]
    }
  }
}
```

### Full-Stack with API Services

```json
{
  "sandbox": {
    "mode": "auto-allow",
    "network": {
      "allowedDomains": [
        "github.com", "*.github.com",
        "registry.npmjs.org",
        "api.anthropic.com",
        "api.openai.com",
        "*.supabase.co"
      ]
    }
  }
}
```

## Integration with crux-hive

### Current Architecture

crux-hive spawns workers in git worktrees using tmux:

```
Orchestrator
    └── Worker 1 (worktree: feat/task-1)
    └── Worker 2 (worktree: feat/task-2)
    └── Worker 3 (worktree: fix/bug-123)
```

Each worker inherits settings via symlinks from the main repository's `.claude/settings.local.json`.

### Sandbox Settings Flow

```
Main Repo
├── .claude/settings.local.json  (sandbox config here)
└── worktrees/
    ├── feat-task-1/
    │   └── .claude/settings.local.json → ../../.claude/settings.local.json
    ├── feat-task-2/
    │   └── .claude/settings.local.json → ../../.claude/settings.local.json
    └── fix-bug-123/
        └── .claude/settings.local.json → ../../.claude/settings.local.json
```

The `setup-symlinks` hook (postCreate) automatically creates these symlinks.

### Verifying Sandbox is Active

When sandbox is active, you'll see the sandbox indicator in Claude Code's status bar. Commands that are sandboxed will run without permission prompts.

To verify:
1. Start a Claude Code session
2. Run `/sandbox` to see current status
3. Check that sandbox mode shows "auto-allow"

## Troubleshooting

### "bubblewrap not found" on Linux

Install bubblewrap:
```bash
sudo apt-get install bubblewrap
```

### Network requests failing in sandbox

Add the required domain to `allowedDomains`. Check Claude Code logs for blocked domain names:
```bash
# View recent logs
tail -f ~/.claude/logs/claude.log | grep -i sandbox
```

### Sandbox mode not inherited by workers

Verify symlinks exist:
```bash
ls -la worktree-path/.claude/settings.local.json
```

If missing, re-run the postCreate hook:
```bash
cd worktree-path
../scripts/setup-symlinks
```

### Commands still prompting despite sandbox

Some commands cannot be sandboxed (e.g., those requiring elevated privileges). These will fall back to normal permission flow even in auto-allow mode.

## Security Notes

### What sandbox protects against

- File access outside working directory
- Network access to unauthorized domains
- Accidental credential exposure (blocked by default)

### What sandbox does NOT protect against

- Malicious prompts designed to exfiltrate data via allowed domains
- Time-of-check-time-of-use attacks within the sandbox
- Vulnerabilities in bubblewrap/seatbelt themselves

### Recommended security practices

1. Use narrow domain allowlists
2. Never add `*` or overly broad patterns
3. Review sandbox violations in logs
4. Keep bubblewrap/OS security patches up to date

## Comparison: Sandbox vs PreToolUse Hooks

| Aspect | Native Sandbox | PreToolUse Hooks |
|--------|----------------|------------------|
| Permission reduction | ~84% | Varies by patterns |
| Setup complexity | Low | Medium |
| Maintenance | None | Pattern updates needed |
| Security model | OS-enforced | Regex-based |
| Cross-platform | macOS + Linux | Universal |
| Network control | Domain-based | Not supported |

**Recommendation**: Use native sandbox for general permission reduction. Keep PreToolUse hooks for specific auto-approval patterns (like the notification watcher).

## Future: Docker Sandboxes

For even stronger isolation, Docker Sandboxes can be used:

```bash
# Create sandbox for worker
docker sandbox create worker-${branch} ${worktree_path}

# Worker runs with full autonomy in microVM
docker sandbox run worker-${branch}
```

This requires Docker Desktop and provides microVM-level isolation. See the main research document for details.
