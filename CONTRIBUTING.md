# Contributing to CRUX

Thank you for your interest in contributing to CRUX! All content in this repository must be in English.

## How to Contribute

1. **Report bugs** or **suggest features** by opening a GitHub issue
2. **Fork the repository** and create a feature branch from `main`
3. Follow existing code patterns and conventions
4. Submit a pull request targeting the `main` branch

Branch naming conventions:
- `feature/*` for new features
- `fix/*` for bug fixes

## Development Setup

CRUX is a multi-plugin monorepo using [Bun](https://bun.sh/) workspaces.

```bash
# Install all dependencies (run from project root)
bun install

# Run linting and auto-fix
bun run lint:fix

# Run TypeScript type checking
bun run typecheck

# Run tests for a specific plugin
bun test --cwd plugins/crux-monitor
bun test --cwd plugins/crux-hive

# Check dead code and type coverage
bun run knip
bun run type-coverage
```

## Pull Request Process

1. Create a feature branch from `main`
2. Ensure all quality checks pass locally (`bun run lint`, `bun run typecheck`, `bun run knip`)
3. If your PR includes code changes, bump the version in both `plugin.json` and `package.json`
4. Submit your PR targeting `main` - CI will run lint, type checks, tests, and security audit
5. A maintainer will review your PR before merging

Pre-commit hooks enforce code quality automatically. Run `bun run lint:fix` before committing to avoid issues.

## Questions?

Open an issue or discussion on GitHub.
