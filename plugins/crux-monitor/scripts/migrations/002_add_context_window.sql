-- Add context window tracking columns
ALTER TABLE events ADD COLUMN context_window_used REAL;
ALTER TABLE events ADD COLUMN context_window_remaining REAL;
