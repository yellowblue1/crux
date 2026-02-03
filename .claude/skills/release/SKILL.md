---
name: release
description: This skill should be used when the user asks to "release", "bump version", "create a release", "tag a version", "publish crux-hive", or "publish crux-monitor".
---

# Release Skill

Guide for releasing CRUX plugins with proper versioning and automated marketplace updates.

## Quick Reference

| Change Type | Version Bump | Examples |
|-------------|--------------|----------|
| Breaking changes | Major (X.0.0) | API changes, removed features, incompatible updates |
| New features | Minor (0.X.0) | New commands, new options, backward-compatible additions |
| Bug fixes, docs | Patch (0.0.X) | Fixes, performance improvements, documentation |

## Prerequisites

Before starting a release:

1. **Check working directory** - Ensure no uncommitted changes exist
2. **Verify branch** - Be on `main` or a dedicated release branch
3. **Review changes** - Understand what changed since last release

## Release Procedure

### Step 1: Determine Version

Analyze changes since the last release to determine the appropriate version bump:

```bash
# Find the latest tag for the plugin
git tag --list "crux-<plugin-name>-v*" --sort=-v:refname | head -1

# View changes since last tag
git log <last-tag>..HEAD --oneline -- plugins/<plugin-name>/
```

Apply semantic versioning rules from the quick reference table above.

### Step 2: Bump Version

Update version in **both** files (they must match):

| File | Location |
|------|----------|
| `plugins/<plugin-name>/.claude-plugin/plugin.json` | `"version"` field |
| `plugins/<plugin-name>/package.json` | `"version"` field |

Example for crux-hive v4.5.0:

```json
// plugin.json
{
  "name": "crux-hive",
  "version": "4.5.0",
  ...
}

// package.json
{
  "name": "crux-hive",
  "version": "4.5.0",
  ...
}
```

### Step 3: Validate Version Sync

Run the version sync check to ensure both files match:

```bash
bun run scripts/check-version-sync.ts
```

This script validates that `plugin.json` and `package.json` versions are identical. The release workflow will fail if versions don't match.

### Step 4: Create and Merge PR

1. **Create a commit** with the version bump:
   ```bash
   git add plugins/<plugin-name>/
   git commit -m "chore(<plugin-name>): bump version to X.Y.Z"
   ```

2. **Push and create PR**:
   ```bash
   git push origin <branch>
   gh pr create --title "chore(<plugin-name>): bump version to X.Y.Z" --body "Release preparation for crux-<plugin-name> vX.Y.Z"
   ```

3. **Wait for CI** to pass, then merge the PR

### Step 5: Create Release Tag

After the PR is merged:

1. **Pull latest main**:
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Create and push the tag**:
   ```bash
   git tag crux-<plugin-name>-vX.Y.Z
   git push origin crux-<plugin-name>-vX.Y.Z
   ```

The tag push triggers the release workflow automatically.

### Step 6: Verify Release

Monitor the release process:

1. **Watch workflow**: `gh run watch` or check GitHub Actions
2. **Verify GitHub Release**: Confirm release appears at repository releases page
3. **Check marketplace.json**: Verify `ref` field updated to new tag

```bash
# Check the marketplace.json ref
cat marketplace.json | grep -A5 "<plugin-name>"
```

## Plugin Paths

| Plugin | plugin.json | package.json |
|--------|-------------|--------------|
| crux-hive | `plugins/crux-hive/.claude-plugin/plugin.json` | `plugins/crux-hive/package.json` |
| crux-monitor | `plugins/crux-monitor/.claude-plugin/plugin.json` | `plugins/crux-monitor/package.json` |

## Notes

- **Tag format**: Must be `crux-<plugin-name>-v<semver>` (e.g., `crux-hive-v4.4.1`)
- **Automated marketplace update**: The release workflow automatically updates `marketplace.json` with the new tag reference
- **Version sync requirement**: Both `plugin.json` and `package.json` must have identical versions; the CI validates this

## References

For detailed workflow information and troubleshooting, see [workflow-details.md](references/workflow-details.md).
