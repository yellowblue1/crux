---
paths: plugins/**/*.ts
---

# TypeScript Conventions

## Runtime & Tooling
- Bun runtime (native SQLite, fast startup)
- Biome for lint/format (see biome.json)

## Error Handling
- Try-catch with graceful fallbacks
- Return `null` instead of throwing for recoverable errors

## Async Patterns
- Use `Promise.race` for timeout protection

## Database
- SQLite with `PRAGMA user_version` for migrations
- In-memory databases for testing (`:memory:`)

## Exports
- Single `index.ts` re-exports all public functions per module (barrel exports)
