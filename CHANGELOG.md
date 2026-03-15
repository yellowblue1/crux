# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [5.5.4] - 2026-03-15

### Fixed

- fix: remove bash-specific syntax from Agent Teams env check ([#194](https://github.com/yellowblue1/crux/pull/194))

## [5.5.3] - 2026-03-05

### Fixed

- fix: remove redundant --permission-mode plan from worker launch ([#188](https://github.com/yellowblue1/crux/pull/188))

## [5.5.2] - 2026-03-03

### Fixed

- fix: replace env var tmux detection with direct tmux server query ([#183](https://github.com/yellowblue1/crux/pull/183))
- fix: replace unreliable env var detection and add plugin settings.json ([#184](https://github.com/yellowblue1/crux/pull/184))

## [5.5.1] - 2026-03-03

### Changed

- refactor: migrate orchestrator-mode from commands/ to skills/ ([#179](https://github.com/yellowblue1/crux/pull/179))

### Fixed

- fix: move bump skill to .claude/skills/ for project-level discovery ([#181](https://github.com/yellowblue1/crux/pull/181))
- fix: move bump skill to correct discovery directory ([#180](https://github.com/yellowblue1/crux/pull/180))

## [5.5.0] - 2026-03-02

### Added

- feat: restore orchestrator mode context after context compaction ([#167](https://github.com/yellowblue1/crux/pull/167))

### Fixed

- fix: eliminate tmux shell init race with shell-level sequencing ([#174](https://github.com/yellowblue1/crux/pull/174))
- fix: improve MCP server resilience against connection drops ([#162](https://github.com/yellowblue1/crux/pull/162))
- fix: use bunx for depcruise script to fix Knip and PATH resolution ([#159](https://github.com/yellowblue1/crux/pull/159))

## [5.3.5] - 2026-02-18

### Added

- feat: add noFetch option to start_worktree_session MCP tool ([#157](https://github.com/yellowblue1/crux/pull/157))

## [5.3.4] - 2026-02-18

### Added

- feat: add Agent Teams env var prerequisite check to orchestrator mode ([#150](https://github.com/yellowblue1/crux/pull/150))

### Changed

- refactor: migrate crux-hive to DDD architecture with dependency-cruiser ([#151](https://github.com/yellowblue1/crux/pull/151))

### Fixed

- fix: increase default exec timeout from 30s to 60s ([#153](https://github.com/yellowblue1/crux/pull/153))

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
