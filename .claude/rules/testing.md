---
paths: plugins/**/*.test.ts, plugins/**/__tests__/**
---

# Testing Conventions

## Test Runner
- Bun test runner (built-in, fast)
- Commands:
  ```bash
  cd plugins/crux-monitor && bun test        # Run all tests
  cd plugins/crux-monitor && bun test --watch  # Watch mode
  ```

## Test Structure
```
plugins/crux-monitor/src/
├── __tests__/
│   ├── index.ts           # Barrel export for test utilities
│   ├── fixtures/          # Test data
│   └── helpers/           # Test utilities
├── db/
│   └── database.test.ts   # Co-located unit tests
└── notification/
    └── *.test.ts          # Co-located unit tests
```

## Test Utilities
Import from `../__tests__`:
- `createTestDatabase()` - In-memory SQLite for isolation
- `seedEvent()` - Insert test events with defaults
- `seedSessionEvents()` - Create session lifecycle data
- `clearEvents()` - Reset database between tests
- `mockGeminiSuccess/Error()` - Fetch mocking for API tests
- `createTempDir/File()` - File system test helpers

## Test Pattern
```typescript
import { afterEach, describe, expect, it } from "bun:test";
import { createTestDatabase, seedEvent } from "../__tests__";

describe("feature", () => {
  let db: Database;

  afterEach(() => {
    if (db) db.close();
  });

  it("should do something", () => {
    db = createTestDatabase();
    seedEvent(db, { eventType: "Stop" });

    // Test logic
    expect(result).toBe(expected);
  });
});
```

## Key Practices
- Always close database in `afterEach`
- Use in-memory databases for test isolation
- Prefer `seedEvent` over manual SQL for consistency
- Mock external APIs (Gemini) to avoid network calls
