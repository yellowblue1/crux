# TypeScript 5.x Features Report

This report documents the investigation of TypeScript 5.x feature adoption in the CRUX project.

## Current Configuration Analysis

### tsconfig.json

The project uses a well-configured TypeScript setup:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "types": ["bun-types"],
    "lib": ["ESNext", "DOM"]
  }
}
```

**Strengths:**
- `strict: true` enables all strict type-checking options
- `ESNext` target allows usage of latest JavaScript features
- `bundler` moduleResolution is the modern approach for bundled applications
- `bun-types` integration provides full Bun API type support

### Biome Configuration

The project enforces strict type safety through Biome linting:
- `noExplicitAny: error` - Prevents use of `any` type
- `noNonNullAssertion: error` - Prevents non-null assertions (`!`)

### Quality Gates

- **95% type coverage minimum** enforced via pre-commit hooks
- **ESM-only** module system (no CommonJS)

## TypeScript 5.x Features Available

### 1. `using` Declarations (TypeScript 5.2+)

**Feature:** Explicit resource management via the `using` keyword for objects implementing `Disposable`.

**Status:** ⚠️ Not recommended for Bun SQLite

**Investigation:** While Bun's `Database` class implements `Disposable`, there is a compatibility issue with prepared statement caching. When using `db.query()` or `db.prepare()` without explicit finalization, the `using` declaration's disposal fails with "database is locked" errors.

**Example that fails:**
```typescript
using db = getDb();
db.prepare("DELETE FROM events WHERE date_part < ?").run(cutoffDateStr);
const changes = db.query("SELECT changes() as count").get();
// Error: database is locked at [Symbol.dispose]
```

**Root cause:** Bun's `query()` method caches prepared statements internally without providing a way to finalize them. The `dispose()` method cannot close the database while cached statements exist.

**Workaround:** Use explicit `prepare()` + `finalize()` calls, but this is more verbose than the existing try/finally pattern.

**Recommendation:** Continue using the established try/finally pattern for Bun SQLite operations until this issue is resolved upstream in Bun.

### 2. `satisfies` Operator (TypeScript 4.9+)

**Feature:** Type validation without widening, preserving literal types while ensuring structural compliance.

**Status:** ✅ Implemented in this PR

**Location:** `plugins/crux-hive/src/mcp/server.ts`

**Benefit:** Validates that `TOOL_DEFINITIONS` conforms to the MCP `Tool[]` interface while preserving const narrowing for type inference in the switch statement.

**Before:**
```typescript
const TOOL_DEFINITIONS = [
  {
    name: "start_worktree_session",
    inputSchema: {
      type: "object" as const,
      // ...
    }
  },
];
```

**After:**
```typescript
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const TOOL_DEFINITIONS = [
  // ...
] as const satisfies readonly Tool[];
```

### 3. ES2024 Target Option (TypeScript 5.7+)

**Feature:** New compilation target supporting ES2024 features.

**Status:** ⏸️ Not implemented

**Reason:** The project already uses `target: "ESNext"` which includes all ES2024 features. Changing to a specific target would only be beneficial for compatibility constraints, which don't apply here since Bun supports modern JavaScript natively.

## Deferred Items

The following patterns were identified but deliberately not changed:

### 1. `as unknown as T` Type Assertions

**Locations:** MCP request handlers in `server.ts`

```typescript
return startWorktreeSession(args as unknown as StartWorktreeSessionArgs);
```

**Reason:** This is an idiomatic pattern for MCP servers where the SDK provides loosely-typed `args`. The MCP SDK doesn't provide type-safe argument extraction, making this assertion necessary. Runtime validation could be added but adds complexity without clear benefit for an internal tool.

### 2. JSON.parse Type Assertions

**Locations:** Various configuration file readers

**Reason:** These files are written by the application itself. Adding Zod schemas for runtime validation would be over-engineering for this use case.

### 3. Database Query Result Assertions

**Location:** `plugins/crux-monitor/src/db/cleanup.ts`

```typescript
const changes = db.query("SELECT changes() as count").get() as { count: number };
```

**Reason:** This is idiomatic for Bun SQLite. The query is a known SQLite built-in function with a predictable return type.

## Recommendations

### Implemented in This PR

1. **Use `satisfies`** for type validation of constant arrays that need to conform to interfaces

### Not Implemented (With Rationale)

1. **`using` declarations for Bun Database**: Not recommended due to Bun SQLite's prepared statement caching causing "database is locked" errors on disposal. The existing try/finally pattern remains the best approach.

### Future Considerations

1. **Consider `const` type parameters (TS 5.0)** if generic functions need to infer literal types from arguments
2. **Monitor decorator support** - The project doesn't use decorators, but if adopted, TypeScript 5.0+ provides stable decorator support

## Verification

All changes were verified with:
- `bun run typecheck` - TypeScript compilation
- `bun test` - Unit tests
- `bun run lint` - Biome linting
- `bun run type-coverage` - Type coverage check

## Summary

The project already has excellent TypeScript configuration with strict mode and high type coverage. This investigation identified one practical improvement:

- **`satisfies`**: Provides compile-time validation while preserving type inference for MCP tool definitions

The investigation also revealed that `using` declarations are not yet suitable for Bun SQLite due to prepared statement caching issues - a useful finding that prevents potential runtime errors.
