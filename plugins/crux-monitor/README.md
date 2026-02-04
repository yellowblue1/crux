# crux-monitor Plugin

Claude Code event monitoring plugin with browser notifications and database logging.

## Overview

This plugin tracks Claude Code events and provides browser notifications via the Web UI when tasks complete or require input. All events are logged to a SQLite database for session tracking and querying.

## Prerequisites

- **bun**: TypeScript runtime
- **gcloud**: Gemini API authentication (optional - only for summaries)

## Installation

```bash
claude plugin install /path/to/crux-monitor
```

For development:

```bash
claude --plugin-dir /path/to/crux-monitor
```

## What it does

- **Event Logging**: Records all Claude Code events to SQLite database
- **Browser Notifications**: Alerts via Web UI when tasks complete or require input
- **Session Tracking**: Monitor active sessions via Web UI
- **Tmux Integration**: Quick jump to Claude Code sessions running in tmux
- **Auto Cleanup**: Records older than 30 days are automatically deleted

## Events Tracked

| Event | Notification | Description |
|-------|--------------|-------------|
| `Stop` | Yes | Task completed |
| `Notification` | Yes | Waiting for user input |
| `SessionStart` | No | Session started |
| `SessionEnd` | No | Session ended |

## Web UI

Start the monitoring dashboard:

```bash
bun run --cwd plugins/crux-monitor/web start
```

The server runs on port 3847 by default (auto-selects next available port if busy).

### Features

- **Real-time updates**: Automatically refreshes via Server-Sent Events (SSE)
- **Browser notifications**: Native notifications for Stop and Notification events
- **Session pruning**: Delete sessions where the Claude process is no longer running
- **Tmux integration**: Click to jump to tmux sessions

For development setup and API details, see [web/README.md](./web/README.md).

## CLI Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize database (run migrations) |
| `migrate` | Run pending database migrations |
| `migrate:check` | Check for pending migrations (exit 1 if pending) |
| `cleanup` | Delete old records based on retention policy |
| `help` | Show usage information |

Example:
```bash
bun run plugins/crux-monitor/src/cli.ts init
bun run plugins/crux-monitor/src/cli.ts cleanup
```

> **Note**: `event-log` and `notification` commands are used internally by plugin hooks.

## Configuration

### GCP Project (for Gemini API summaries)

Summary generation uses Gemini API via Google Cloud (using the `gemini-2.5-flash` model). Configure in one of two ways:

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

If neither is configured, the gcloud default project (`gcloud config get-value project`) will be used. If no project is available at all, notifications will show default messages ("Task completed", "Waiting for input") instead of AI-generated summaries.

**Note**: Add `crux-monitor.local.md` to `.gitignore` as it may contain project-specific settings.

## Data Storage

- **Database**: `~/.local/share/crux-monitor/events.db`
- **Retention**: 30 days (older records are automatically deleted)

## Database Schema

```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    project_dir TEXT,
    project_name TEXT,
    summary TEXT,
    date_part TEXT NOT NULL,
    git_branch TEXT,
    tmux_window_id TEXT,
    process_pid INTEGER
);
```

## Migration from Existing Setup

If you were using the scripts from dotfiles (`~/.claude/hooks/notification.sh`), remove the hook configuration from `~/.claude/settings.json` after installing this plugin to avoid duplicate notifications.

**Database Migration**: If you have an existing database at `~/.local/share/claude-monitoring/events.db`, you can migrate it manually:

```bash
mkdir -p ~/.local/share/crux-monitor
mv ~/.local/share/claude-monitoring/events.db ~/.local/share/crux-monitor/events.db
```

## Development

### Running Tests

```bash
bun test --cwd plugins/crux-monitor              # Run all tests
bun test --cwd plugins/crux-monitor --watch      # Watch mode
```

### Web UI Development

```bash
bun run --cwd plugins/crux-monitor/web dev       # Start dev server with auto-reload
```

## Uninstalling

```bash
claude plugin uninstall crux-monitor
```
