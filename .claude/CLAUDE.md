# CLAUDE.md

CRUX (Claude Running mUX) - community plugins for enhancing Claude Code workflow.

## Language Policy

IMPORTANT: All content in this repository MUST be in English. This includes code, comments, documentation, commit messages, issues, and pull requests. This is a public repository for the global community.

## Project Structure

- Multi-plugin monorepo under `plugins/` using Bun workspaces
- Single `bun install` at root installs all workspace dependencies
- Single root `bun.lock` consolidates all dependencies
- Each plugin has `.claude-plugin/plugin.json` manifest
- Plugins integrate via Claude Code hooks: SessionStart, Stop, Notification, SessionEnd
- `${CLAUDE_PLUGIN_ROOT}` substituted at runtime for plugin paths

## Development Commands

```bash
# crux-monitor plugin
cd plugins/crux-monitor && bun test              # Run tests
cd plugins/crux-monitor && bun test --watch      # Watch mode
cd plugins/crux-monitor/web && bun run start     # Start server
cd plugins/crux-monitor/web && bun run dev       # Dev server (TS watch + server)
bun run plugins/crux-monitor/src/cli.ts <cmd>    # CLI execution
```

## Quality Standards

Pre-commit hooks enforce: Biome lint/format, TypeScript types, 95% type coverage, Knip dead code detection, security audit. Run `bun run lint:fix` before committing.

## Contributing

1. Create feature branch from main
2. Follow existing patterns in similar code
3. All tests must pass before PR
4. Require PR review for main branch
