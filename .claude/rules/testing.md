---
paths: plugins/**/*.test.ts, plugins/**/__tests__/**
---

# Testing Conventions

## Test Runner
- Bun test runner (built-in, fast)
- Commands:
  ```bash
  bun test --cwd tools/panopticon        # Run all tests
  bun test --cwd tools/panopticon --watch  # Watch mode
  ```

## Test Structure
```
tools/panopticon/src/
├── __tests__/
│   ├── index.ts           # Barrel export for test utilities
│   └── helpers/
│       └── fetch-mock.ts  # Fetch mocking for Gemini API
├── tmux/
│   └── utils.test.ts      # Co-located unit tests
├── session/
│   └── manager.test.ts    # Co-located unit tests
└── notification/
    └── *.test.ts          # Co-located unit tests
```

## Test Utilities
Import from `../__tests__`:
- `mockGeminiSuccess/Error/Empty()` - Fetch mocking for Gemini API tests
- `mockFetchNetworkError()` - Simulate network failures

## Test Pattern
```typescript
import { describe, expect, it } from "bun:test";

describe("feature", () => {
  it("should do something", () => {
    // Test logic with dependency injection
    expect(result).toBe(expected);
  });
});
```

## Key Practices
- Use dependency injection for testability (exec functions, watchers, etc.)
- Mock external APIs (Gemini) to avoid network calls
- Use `MockFSWatcher` pattern for fs.watch testing
