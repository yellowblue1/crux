# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
