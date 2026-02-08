# crux-monitor

Real-time Claude Code session monitoring via tmux polling.

## Overview

crux-monitor is a standalone tool that detects Claude Code sessions running in tmux panes, monitors their activity status, and provides a web dashboard with browser notifications. It works by polling tmux and process tables to discover sessions, then watches Claude Code's JSONL session files for activity.

## Prerequisites

- **bun**: TypeScript runtime
- **tmux**: Terminal multiplexer (sessions must run in tmux)
- **gcloud**: Gemini API authentication (optional - for AI summaries)

## How It Works

1. **Session Discovery**: Polls `tmux list-panes` and `ps` every 5 seconds to find Claude Code processes
2. **Activity Detection**: Watches each session's JSONL file (`~/.claude/projects/`) via `fs.watch()`
3. **Idle Detection**: When a JSONL file hasn't changed for 3 seconds, the session transitions to WAITING
4. **AI Summaries**: On WAITING transition, sends recent conversation to Gemini for a brief summary
5. **Real-time UI**: SSE pushes state changes to the browser dashboard

## Usage

Start the monitoring dashboard:

```bash
bun run --cwd tools/crux-monitor/web start
```

The server runs on port 3847 by default (auto-selects next available port if busy).

Open http://localhost:3847 in your browser.

### Features

- **Real-time updates** via Server-Sent Events (SSE)
- **Browser notifications** when sessions transition to WAITING
- **Tmux integration**: Click to jump to a session's tmux pane
- **AI summaries**: Brief description of what Claude is waiting for (requires Gemini API)

## Configuration

### GCP Project (for Gemini API summaries)

Summary generation uses Gemini API via Google Cloud (`gemini-2.5-flash`). Configure in one of two ways:

**Option 1: Environment variable**
```bash
export GEMINI_GCP_PROJECT=your-project-id
export GEMINI_GCP_LOCATION=asia-northeast1  # optional, defaults to asia-northeast1
```

**Option 2: Settings file** (`~/.claude/crux-monitor.local.md`)
```yaml
---
gcp_project: your-project-id
gcp_location: asia-northeast1
---
```

If no GCP project is configured, summaries will not be generated.

## Development

### Running Tests

```bash
bun test --cwd tools/crux-monitor              # Run all tests
bun test --cwd tools/crux-monitor --watch      # Watch mode
```

### Web UI Development

```bash
bun run --cwd tools/crux-monitor/web dev       # Vite + API server with auto-reload
```
