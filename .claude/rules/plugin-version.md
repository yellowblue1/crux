---
paths: "**/plugin.json"
---

# Plugin Version Management

When bumping plugin version, update the `version` field in `plugin.json`.

Claude Code reads the version from `plugin.json`, not `package.json`.

Example:
```json
{
  "name": "my-plugin",
  "version": "1.2.3",
  ...
}
```
