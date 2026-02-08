---
paths: plugins/**/*.ts
---

# TypeScript Conventions

## Runtime & Tooling
- Bun runtime (fast startup, native APIs)
- Biome for lint/format (see biome.json)

## Error Handling
- Try-catch with graceful fallbacks
- Return `null` instead of throwing for recoverable errors

## Async Patterns
- Use `Promise.race` for timeout protection

## Code Organization
- Import directly from source files (no barrel exports)
- Dependency injection for testability
