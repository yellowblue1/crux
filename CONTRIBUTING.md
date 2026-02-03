# Contributing to CRUX

Thank you for your interest in contributing to CRUX! This document covers the development workflow, versioning policy, and release process.

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes following existing code patterns
3. Ensure all tests pass: `bun test`
4. Run linting: `bun run lint:fix`
5. Submit a pull request

## Plugin Version Policy

### Understanding Plugin Versions

Claude Code uses **Git commit SHA** as the true identifier for plugin code, not the version number. When users install a plugin:

- The version from `plugin.json` is displayed to users
- The actual Git commit SHA is stored in `~/.claude/plugins/installed_plugins.json`
- Two users can have "version 1.0.0" but different code if installed at different commits

**Important limitation**: Claude Code currently does not support installing plugins from specific git tags or commits. Users always get the HEAD of the main branch. This means user-side version pinning is not possible with the current Claude Code specification.

**Git tags are used for**:
- Maintainer release tracking
- CI version validation
- GitHub release automation

### When to Bump Versions

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking changes | Major (X.0.0) | Removing MCP tools, changing hook signatures |
| New features | Minor (x.Y.0) | Adding new MCP tools, new hooks |
| Bug fixes | Patch (x.y.Z) | Performance improvements, refactoring |

### Version Sync Requirement

Both `plugin.json` and `package.json` **must have matching versions**. This is enforced by CI.

```bash
# Check version sync locally
bun run scripts/check-version-sync.ts
```

### Files to Update

When bumping a plugin version, update both:

1. `plugins/<plugin-name>/.claude-plugin/plugin.json`
2. `plugins/<plugin-name>/package.json`

## Release Process

### 1. Create Release PR

Update versions in both files:

```json
// plugins/crux-hive/.claude-plugin/plugin.json
{ "version": "4.4.0" }

// plugins/crux-hive/package.json
{ "version": "4.4.0" }
```

### 2. Merge to Main

After PR approval and CI passes, merge to `main`.

### 3. Create Git Tag

Git tags provide immutable reference points for releases, useful for tracking release history and CI validation.

```bash
# Create annotated tag
git tag -a crux-hive-v4.4.0 -m "Release crux-hive 4.4.0"
git push origin crux-hive-v4.4.0
```

> **Note**: While git tags don't enable user-side version pinning (due to Claude Code limitations), they are valuable for maintainers to track releases and ensure CI validates version consistency.

### Tag Naming Convention

```
<plugin-name>-v<semver>
```

Examples:
- `crux-hive-v4.3.0`
- `crux-monitor-v2.0.0`

### 4. Automated Release

Pushing a tag triggers the release workflow which:

1. Validates tag version matches `plugin.json` and `package.json`
2. Runs version sync check
3. Creates a GitHub release with auto-generated notes

## Code Quality

Pre-commit and CI enforce:

- Biome lint and format
- TypeScript type checking
- 95% type coverage minimum
- Knip dead code detection
- Security audit
- Version sync validation

Run all checks locally:

```bash
bun run lint
bun run typecheck
bun run knip
bun run type-coverage
bun run scripts/check-version-sync.ts
```

## Questions?

Open an issue or discussion on GitHub.
