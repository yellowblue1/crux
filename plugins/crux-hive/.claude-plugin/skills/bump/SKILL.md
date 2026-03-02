---
name: bump
description: This skill should be used when the user asks to "bump version", "bump new version", "release new version", "update version", "create a release", or any task involving incrementing the crux-hive plugin version, updating the changelog, and creating a release PR.
---

# Version Bump Workflow

Automate the full version bump workflow for crux-hive: determine the appropriate semver increment from commit history, update version files, generate a CHANGELOG entry, and create a pull request.

## Workflow

### Step 1: Determine Version Increment

1. Read the current version from `plugins/crux-hive/package.json`.
2. Find the last bump commit with: `git log --oneline --all -- plugins/crux-hive/package.json | head -5`
3. List commits since the last bump: `git log <last-bump-commit>..HEAD --oneline --no-merges -- plugins/crux-hive/`
4. Determine the semver increment based on conventional commit prefixes:
   - **patch**: only `fix:` and `chore:` commits
   - **minor**: at least one `feat:` commit
   - **major**: any commit containing `BREAKING CHANGE` or `!:` in the message
5. If uncertain, ask the user to choose between patch, minor, or major.

### Step 2: Update Version Files

Update the `"version"` field in **both** files to the new version:

- `plugins/crux-hive/package.json`
- `plugins/crux-hive/.claude-plugin/plugin.json`

### Step 3: Update CHANGELOG

1. Read `CHANGELOG.md` to understand the existing format.
2. Collect commits since the last bump commit (from Step 1).
3. Group commits under [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) sections:
   - `### Added` for `feat:` commits
   - `### Changed` for `refactor:` commits
   - `### Fixed` for `fix:` commits
   - `### Docs` for `docs:` commits
   - Omit `chore:` commits (version bumps, dependency updates)
4. Insert the new version entry directly above the previous version entry.
5. Format each entry as: `- <commit message> ([#<PR>](https://github.com/yellowblue1/crux/pull/<PR>))`

### Step 4: Commit, Push, and Create PR

1. Create a new branch: `chore/bump-crux-hive-<version>`
2. Stage the three modified files: `package.json`, `plugin.json`, `CHANGELOG.md`
3. Commit with message: `chore: bump crux-hive version to <version>`
4. Push and create a PR with title: `chore: bump crux-hive version to <version>`
