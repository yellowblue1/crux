# crux-monitor Web UI

Web dashboard for monitoring Claude Code sessions with real-time updates.

## Quick Start

```bash
bun run start
```

The server runs on port 3847 by default.

## Development

```bash
bun run dev
```

Starts Vite dev server (frontend) and Bun API server with watch mode.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | 3847 | HTTP server port |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | Get current sessions |
| GET | `/api/sessions/stream` | SSE for real-time updates |
| GET | `/api/auth/status` | GCP auth status |
| GET | `/*` | Static files (Vite build) |

## Architecture

```
Browser <-- SSE -- Server <-- SessionManager
                     |              |
                     |          fs.watch(JSONL)
                     |          tmux polling
                     |
                     +--> HTTP API
```

- SessionManager polls tmux/ps for session discovery (every 5s)
- Watches JSONL files for activity detection (idle after 3s)
- State changes broadcast to all SSE clients
