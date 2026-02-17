# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [5.3.2] - 2026-02-17

### Changed

- refactor: migrate Node.js APIs to Bun native APIs in crux-hive ([#148](https://github.com/yellowblue1/crux/pull/148))
- refactor: migrate execSync to Bun.spawnSync across codebase ([#124](https://github.com/yellowblue1/crux/pull/124))

### Fixed

- fix: restrict temp file permissions to owner-only in sendKeys ([#147](https://github.com/yellowblue1/crux/pull/147))
- fix: use temp file in sendKeys to avoid shell argument length limit ([#146](https://github.com/yellowblue1/crux/pull/146))

### Docs

- docs: add Agent Teams env var requirement to crux-hive README ([#145](https://github.com/yellowblue1/crux/pull/145))

## [5.3.1] - 2026-02-08

### Fixed

- fix: Replace hardcoded "main" with generic default branch in orchestrator-mode ([#78](https://github.com/yellowblue1/crux/pull/78))

## [5.3.0] - 2026-02-08

### Added

- feat: Add `--plan-mode-required` flag support for Agent Teams workers ([#72](https://github.com/yellowblue1/crux/pull/72))

### Changed

- refactor: Simplify worker cleanup by removing `shutdown_request` step from orchestrator workflow ([#72](https://github.com/yellowblue1/crux/pull/72))
- refactor: Replace `.crux-hive-worker.json` with team config cwd lookup ([#74](https://github.com/yellowblue1/crux/pull/74))

## [5.2.0] - 2026-02-08

### Changed

- docs: Improve orchestrator-mode clarity, add prerequisites and delegation-failure guidance ([#62](https://github.com/yellowblue1/crux/pull/62))

## [5.1.0] - 2026-02-08

### Added

- feat: Auto-deregister Agent Teams members on worktree removal ([#62](https://github.com/yellowblue1/crux/pull/62))

## [5.0.0] - 2026-02-08

### Changed

- feat: Replace custom file-based messaging with Agent Teams built-in tools ([#62](https://github.com/yellowblue1/crux/pull/62))
- Remove 9 obsolete files (orchestrator sessions, poll-notifications, send_message MCP tool)
- Workers launched as Agent Teams teammates via `--agent-id`, `--team-name`, `--parent-session-id` flags

## [4.5.0] - 2026-02-06

### Changed

- feat: Switch orchestrator watcher from Task to Bash background execution ([#58](https://github.com/yellowblue1/crux/pull/58))

### Fixed

- fix: Update @modelcontextprotocol/sdk to 1.26.0 to fix CVE-2026-25536 ([#57](https://github.com/yellowblue1/crux/pull/57))

## [4.4.2] - 2026-02-04

### Fixed

- fix: Sync crux-hive version in bun.lock ([#55](https://github.com/yellowblue1/crux/pull/55))
- fix: Override @isaacs/brace-expansion to 5.0.1 for security patch ([#51](https://github.com/yellowblue1/crux/pull/51))

## [4.4.1] - 2026-02-03

### Fixed

- fix: Use load-buffer + paste-buffer for long tmux prompts ([#47](https://github.com/yellowblue1/crux/pull/47))
- fix: Prevent tmux window from stealing focus when creating worker sessions ([#45](https://github.com/yellowblue1/crux/pull/45))

## [4.4.0] - 2026-02-03

Initial tagged release of crux-hive plugin.
