# CLAUDE.md

CRUX (Claude Running mUX) - community plugins for enhancing Claude Code workflow.

## Language Policy

IMPORTANT: All content in this repository MUST be in English. This includes code, comments, documentation, commit messages, issues, and pull requests. This is a public repository for the global community.

## Project Structure

- Monorepo using Bun workspaces
- Single `bun install` at root installs all workspace dependencies
- Single root `bun.lock` consolidates all dependencies
- `plugins/crux-hive`: Claude Code plugin with hooks and MCP server
- `tools/crux-monitor`: Standalone tmux-based monitoring tool

## Development Commands

```bash
# crux-monitor
bun test --cwd tools/crux-monitor              # Run tests
bun test --cwd tools/crux-monitor --watch      # Watch mode
bun run --cwd tools/crux-monitor/web start     # Start server
bun run --cwd tools/crux-monitor/web dev       # Dev server (Vite + API)
```

## Quality Standards

Pre-commit hooks enforce: Biome lint/format, TypeScript types, 95% type coverage, Knip dead code detection, security audit. Run `bun run lint:fix` before committing.

## Contributing

1. Create feature branch from main
2. Follow existing patterns in similar code
3. All tests must pass before PR
4. Require PR review for main branch
