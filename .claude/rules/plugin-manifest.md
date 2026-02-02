---
paths: "**/.claude-plugin/**"
---

# Plugin Manifest Structure

## plugin.json Fields
- `name`: Plugin identifier
- `version`: Semver version
- `description`: Short description
- `hooks`: Array of hook configurations

## Hook Configuration
```json
{
  "event": "SessionStart|Stop|Notification|SessionEnd",
  "script": "${CLAUDE_PLUGIN_ROOT}/scripts/hook-name.sh"
}
```

## Component Types
- **Hooks**: Event-driven shell scripts
- **Skills**: Non-invocable knowledge (SKILL.md with YAML frontmatter)
- **Commands**: User-invocable actions (Markdown with YAML frontmatter)

## Process Tracking
Hooks can capture process PID via `$PPID` for session management.
