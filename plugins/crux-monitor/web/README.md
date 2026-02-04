# crux-monitor Web UI

A simple web interface for monitoring Claude Code sessions with real-time updates and additional features.

## Features

- **Real-time updates**: Automatically refreshes when new events occur (via SSE)
- **Browser notifications**: Native browser notifications for Stop and Notification events
- **Read tracking**: Mark events as read (persisted in browser localStorage)
- **Clipboard copy**: Click tmux commands to copy to clipboard
- **Responsive design**: Works on desktop and mobile

## Requirements

- [Bun](https://bun.sh/) runtime

## Quick Start

```bash
bun run --cwd plugins/crux-monitor/web server.ts
```

The server will:
1. Try port 3847 first
2. If port is in use, automatically find an available port

Stop with Ctrl+C.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | auto (prefers 3847) | HTTP server port. Set to force a specific port |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Web UI (index.html) |
| GET | `/api/events` | Get current active events |
| GET | `/api/events/stream` | SSE endpoint for real-time updates |
| GET | `/*` | Static files from `public/` |

## Development

Watch mode with auto-reload:

```bash
bun run dev
```

## Architecture

```
Browser <-- SSE -- Server <-- fs.watch -- SQLite DB
                      |
                      +--> HTTP API
```

- Server watches the SQLite database file for changes
- Changes are broadcasted to all connected clients via SSE
- If SSE connection fails, client falls back to 5-second polling
