-- CRUX Monitor initial schema
CREATE TABLE IF NOT EXISTS events (
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

CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_date_part ON events(date_part);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
