---
paths: plugins/**/*.test.ts, plugins/**/__tests__/**
---

# Testing Conventions

## Test Runner
- Bun test runner (built-in, fast)

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
- Mock external APIs to avoid network calls
