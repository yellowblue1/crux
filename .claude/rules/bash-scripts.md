---
paths: "**/scripts/**"
---

# Bash Script Conventions

- Always use `set -euo pipefail` at script start
- Background execution for non-blocking hooks: `(command) </dev/null >/dev/null 2>&1 & disown`
- Include explicit timeouts for subprocess calls: `timeout 5 command`
- Graceful degradation: capture stderr to `/dev/null` in hooks
