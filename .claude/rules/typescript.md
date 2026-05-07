---
paths: plugins/**/*.ts
---

# TypeScript Conventions

## Runtime & Tooling
- Bun runtime (fast startup, native APIs)
- Prefer Bun native APIs for file I/O: `Bun.file().json()`, `Bun.file().text()`, `Bun.file().exists()`, `Bun.write()`, `crypto.randomUUID()`. Keep `node:fs` only where no Bun equivalent exists (e.g. `mkdirSync`, `unlinkSync`, `readdirSync`, `renameSync`, `writeFileSync` with `{ flag: "wx" }`)
- Biome for lint/format (see biome.json)

## Error Handling
- Try-catch with graceful fallbacks
- Return `null` instead of throwing for recoverable errors

## Async Patterns
- Use `Promise.race` for timeout protection

## Code Organization
- Import directly from source files (no barrel exports)
- Dependency injection for testability — applies to non-trivial mechanism only; see [docs/adr/0001-di-for-non-trivial-mechanism.md](../../docs/adr/0001-di-for-non-trivial-mechanism.md) for the applicability bar
