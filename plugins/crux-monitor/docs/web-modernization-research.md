# CRUX Monitor Web UI Modernization Research

This document provides a comprehensive analysis of the modern Bun-based stack in `bun-hello-front` and compares it with the current crux-monitor Web UI implementation, offering recommendations for modernization.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Reference Repository Analysis](#reference-repository-analysis)
3. [Current Implementation Analysis](#current-implementation-analysis)
4. [Technology Comparison](#technology-comparison)
5. [Modernization Recommendations](#modernization-recommendations)
6. [Migration Path](#migration-path)
7. [Appendix](#appendix)

---

## Executive Summary

The crux-monitor Web UI is a functional dashboard with 672 lines of vanilla TypeScript. While it works well, modernizing it would address key pain points:

- **No HMR** - Manual browser refresh required during development
- **No testing** - Zero test coverage
- **Type duplication** - Same types defined in both server and client
- **Monolithic code** - Single 672-line file is hard to maintain

**Recommendation:** Phased modernization adopting Vite for build tooling, shared types, and modular code organization. Framework adoption (React/Preact) is optional and should be deferred.

---

## Reference Repository Analysis

### Repository: `bun-hello-front`

A modern, full-stack Todo application showcasing best practices for Bun-based web development.

### Project Structure

```
src/
├── client/          # React frontend (Vite-based)
│   ├── routes/      # TanStack Router file-based routing
│   ├── components/  # React components (UI, layout, todos)
│   ├── hooks/       # Custom React hooks (auth, todos, SSE)
│   ├── lib/         # Utilities (RPC client, auth, query keys, SSE)
│   ├── types/       # TypeScript type definitions
│   ├── test/        # Unit tests
│   ├── assets/      # Static assets
│   ├── main.tsx     # Entry point
│   └── index.css    # Tailwind CSS styling
├── server/          # Hono backend
│   ├── routes/      # API endpoints (todos, SSE)
│   ├── middleware/  # Auth middleware
│   ├── db/          # Database schema and migrations
│   ├── lib/         # Auth, errors, email, SSE manager
│   ├── types/       # Environment and SSE types
│   └── index.ts     # Server entry point
└── shared/          # Shared code between client/server
    ├── schemas.ts   # Valibot validation schemas
    └── types/       # Shared TypeScript types
```

### Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Runtime | Bun | Latest |
| Frontend Framework | React | 19 |
| Build Tool | Vite | 7.3.1 |
| Routing | TanStack Router | File-based |
| State Management | TanStack Query | 5min staleTime |
| Backend Framework | Hono | Latest |
| Database | Turso (SQLite) | Edge |
| ORM | Drizzle | Latest |
| Validation | Valibot | Shared schemas |
| Styling | Tailwind CSS | 4.0 |
| UI Components | shadcn/ui | Custom theme |
| Authentication | Better Auth | Passkey support |
| Testing | Vitest + Playwright | 95%+ coverage |
| Linting | Biome | Fast |

### Key Architectural Patterns

#### 1. Type-Safe RPC

Hono's chain-style API enables end-to-end type inference:

```typescript
// Server: Chain-style API definition
const app = new Hono()
  .get("/api/todos", async (c) => {
    return c.json({ todos: await getTodos() });
  })
  .post("/api/todos", vValidator("json", createTodoSchema), async (c) => {
    const data = c.req.valid("json");
    return c.json({ todo: await createTodo(data) });
  });

export type AppType = typeof app;

// Client: Type-safe RPC client
import { hc } from "hono/client";
const client = hc<AppType>("/");
const { todos } = await client.api.todos.$get().then(r => r.json());
// ^-- Full type inference!
```

#### 2. Shared Validation Schemas

Valibot schemas are shared between client and server:

```typescript
// shared/schemas.ts
import * as v from "valibot";

export const createTodoSchema = v.object({
  title: v.pipe(v.string(), v.nonEmpty(), v.maxLength(100)),
  description: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

export type CreateTodoInput = v.InferInput<typeof createTodoSchema>;
```

#### 3. SSE with Auto-Reconnect

Robust SSE client with exponential backoff:

```typescript
class SSEClient {
  private reconnectDelay = 1000;
  private maxDelay = 30000;

  connect() {
    this.eventSource = new EventSource("/api/events");
    this.eventSource.onopen = () => {
      this.reconnectDelay = 1000; // Reset on success
    };
    this.eventSource.onerror = () => {
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
  }
}
```

#### 4. Vite Configuration Highlights

```typescript
export default defineConfig({
  plugins: [
    tanstackRouterPlugin(),    // File-based routing
    react({ babel: { plugins: [["babel-plugin-react-compiler"]] } }),
    tailwindcss(),              // Tailwind v4 Vite plugin
    visualizer({ open: true }), // Bundle analysis
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          "vendor-auth": ["better-auth"],
          "vendor-validation": ["valibot"],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
```

#### 5. Testing Setup

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/client/test/setup.ts"],
    coverage: {
      provider: "v8",
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
```

---

## Current Implementation Analysis

### Repository: `plugins/crux-monitor/web/`

A functional monitoring dashboard built with vanilla TypeScript.

### Project Structure

```
plugins/crux-monitor/web/
├── public/
│   ├── index.html              # Static HTML entry
│   ├── app.js                  # Compiled output
│   ├── style.css               # Compiled Tailwind output
│   └── favicon.svg
├── src/
│   ├── app.ts                  # Main application (672 lines)
│   ├── types.ts                # Client-side types (duplicated)
│   └── styles/
│       └── input.css           # Tailwind source (390 lines)
├── server.ts                   # Bun HTTP server (250 lines)
├── package.json
└── bun.lock
```

### Technology Stack

| Category | Technology | Notes |
|----------|------------|-------|
| Runtime | Bun | Native build |
| Frontend | Vanilla TypeScript | 672 lines DOM manipulation |
| Backend | Native Bun HTTP | No framework |
| Styling | Tailwind CSS 4.0 | CLI compilation |
| Real-time | SSE + polling | Fallback architecture |
| Testing | None | - |
| Build | `bun build` | No HMR |

### Current Strengths

1. **Zero Runtime Dependencies**
   - No React, Vue, or other frameworks
   - Minimal attack surface
   - Fast initial load

2. **SSE + Polling Fallback**
   - Robust real-time updates
   - Graceful degradation when SSE fails
   - Smart client grouping by filter mode

3. **Tailwind v4**
   - Modern styling approach
   - GitHub Dark theme
   - Responsive design

4. **Type Safety**
   - Strict TypeScript configuration
   - 95% type coverage enforcement

### Current Pain Points

1. **No Hot Module Replacement**
   ```bash
   # Current workflow
   bun run dev  # Starts watchers + server
   # Edit code → save → manually refresh browser
   ```

2. **Type Duplication**
   ```typescript
   // web/src/types.ts (client)
   export interface EventResponse { /* ... */ }

   // src/types.ts (server)
   export interface EventResponse { /* ... */ }  // Same definition!
   ```

3. **Monolithic Application Code**
   ```typescript
   // web/src/app.ts - 672 lines including:
   // - DOM manipulation
   // - Event handlers
   // - API calls
   // - SSE management
   // - IndexedDB operations
   // - State management
   // - Rendering logic
   ```

4. **No Testing Infrastructure**
   - No unit tests
   - No integration tests
   - No E2E tests
   - Regression risk

5. **Inline SVG Icons**
   ```typescript
   const ICON_CLIPBOARD = `<svg width="16" height="16" viewBox="0 0 24 24" ...>
     <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
     <path d="M5 15H4a2 2 0 0 1-2-2V4..."></path>
   </svg>`;  // ~3KB per icon
   ```

---

## Technology Comparison

| Aspect | bun-hello-front | crux-monitor | Gap Analysis |
|--------|-----------------|-------------------|--------------|
| **Frontend Framework** | React 19 | Vanilla TS | Medium gap - component model would help maintainability |
| **Build Tool** | Vite 7 | Bun native | High gap - no HMR, no source maps |
| **Backend Framework** | Hono | Native Bun HTTP | Low gap - current approach is simple and works |
| **Styling** | Tailwind v4 + shadcn | Tailwind v4 + custom | Low gap - already modern |
| **State Management** | TanStack Query | Manual | Medium gap - depends on complexity growth |
| **Real-time** | SSE with reconnect | SSE + polling | Low gap - current is actually more robust |
| **Testing** | Vitest + Playwright | None | High gap - critical for maintenance |
| **Type Sharing** | Path aliases | Duplication | Medium gap - easy to fix |
| **Development** | Vite HMR | Manual refresh | High gap - affects productivity |

### Key Differences Explained

#### Build System

**bun-hello-front:**
- Vite 7 with full HMR support
- Source maps in development and production
- Smart code splitting (vendor chunks)
- CSS handled by Tailwind Vite plugin

**crux-monitor:**
- Bun's native bundler
- No source maps
- Single output file
- CSS compiled separately via Tailwind CLI

#### Component Architecture

**bun-hello-front:**
```tsx
// Declarative components with hooks
function TodoItem({ todo }: { todo: Todo }) {
  const { mutate: updateTodo } = useUpdateTodo();
  return (
    <li onClick={() => updateTodo({ id: todo.id, completed: !todo.completed })}>
      {todo.title}
    </li>
  );
}
```

**crux-monitor:**
```typescript
// Imperative DOM manipulation
function buildEventRow(event: EventResponse): string {
  return `
    <tr id="event-${event.event_id}" class="${event.isRead ? 'read' : ''}">
      <td>${escapeHtml(event.project_name)}</td>
      <!-- ... more template strings -->
    </tr>
  `;
}

function attachEventListeners() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', handleCopy);
  });
}
```

---

## Modernization Recommendations

### Priority Matrix

| Priority | Change | Effort | Impact | Risk |
|----------|--------|--------|--------|------|
| 1 | Vite migration | Low | High | Low |
| 2 | Type sharing | Low | High | Low |
| 3 | Testing setup | Medium | High | Low |
| 4 | Module extraction | Medium | Medium | Low |
| 5 | Icon optimization | Low | Low | Low |
| 6 | Framework adoption | High | Medium | Medium |
| 7 | Hono migration | Medium | Medium | Low |

### Detailed Recommendations

#### Priority 1: Migrate to Vite Build System

**Why:** Immediate developer experience improvement with minimal code changes.

**Changes Required:**

1. Create `vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 3847,
    proxy: {
      "/api": {
        target: "http://localhost:3848",
        changeOrigin: true,
      },
    },
  },
});
```

2. Update `package.json`:
```json
{
  "scripts": {
    "dev": "concurrently -k \"vite\" \"bun --watch run server.ts\"",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^7.3.1"
  }
}
```

3. Move and update `index.html`:
```html
<!-- src/index.html -->
<script type="module" src="./app.ts"></script>
```

**Benefits:**
- Instant HMR during development
- Source maps for debugging
- Modern ES modules handling
- No application code changes required

#### Priority 2: Implement Type Sharing

**Why:** Eliminate type duplication and ensure client-server type consistency.

**Changes Required:**

1. Create shared types directory:
```
plugins/crux-monitor/
├── shared/
│   └── types.ts      # Shared API types
├── src/
│   └── types.ts      # Server-only types (db schemas, etc.)
└── web/
    └── src/
        └── types.ts  # DELETE - use shared instead
```

2. Create `shared/types.ts`:
```typescript
// API response types shared between client and server
export interface EventResponse {
  id: number;
  event_id: string;
  session_id: string;
  event_type: string;
  created_at: string;
  project_name: string;
  git_branch: string | null;
  summary: string;
  tmux_command: string | null;
  tmux_window_id: string | null;
}

export type FilterMode = "waiting" | "active" | "all";
export type ConnectionStatus = "connected" | "polling" | "disconnected";

export interface ApiEventsResponse {
  events: EventResponse[];
  last_modified: number;
}

export interface CleanupPreviewResponse {
  sessions: Array<{
    session_id: string;
    project_name: string;
    git_branch: string | null;
    last_event: string;
  }>;
}
```

3. Update Vite config with path alias:
```typescript
resolve: {
  alias: {
    "@shared": resolve(__dirname, "../shared"),
  },
},
```

4. Update tsconfig.json:
```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  }
}
```

**Benefits:**
- Single source of truth
- Compile-time type checking across boundaries
- Refactoring safety

#### Priority 3: Add Testing Infrastructure

**Why:** Enable confident refactoring and prevent regressions.

**Changes Required:**

1. Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
```

2. Create `src/test/setup.ts`:
```typescript
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock IndexedDB
const indexedDBMock = {
  open: vi.fn(() => ({
    result: {
      objectStoreNames: { contains: () => false },
      createObjectStore: vi.fn(),
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
        })),
      })),
    },
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  })),
};
vi.stubGlobal("indexedDB", indexedDBMock);

// Mock EventSource
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = MockEventSource.CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  close() {
    this.readyState = MockEventSource.CLOSED;
  }
}
vi.stubGlobal("EventSource", MockEventSource);
```

3. Add dependencies to `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "vitest": "^4.0.18",
    "@vitest/coverage-v8": "^4.0.18",
    "@testing-library/jest-dom": "^6.9.1",
    "jsdom": "^27.4.0"
  }
}
```

**Benefits:**
- Catch regressions early
- Safe refactoring
- Documentation through tests

#### Priority 4: Extract Modules from app.ts

**Why:** Improve maintainability and enable focused testing.

**Proposed Structure:**
```
web/src/
├── app.ts          # (~100 lines) Initialization and orchestration
├── utils.ts        # Pure utility functions
├── api.ts          # API client functions
├── sse.ts          # SSE connection management
├── storage.ts      # IndexedDB wrapper
├── render.ts       # DOM rendering functions
├── state.ts        # Application state management
├── icons.ts        # SVG icon definitions
└── test/
    ├── setup.ts
    ├── utils.test.ts
    ├── api.test.ts
    └── sse.test.ts
```

**Example Extraction:**

```typescript
// utils.ts
export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface ParsedEventType {
  baseType: string;
  subType: string | null;
}

export function parseEventType(eventType: string): ParsedEventType {
  const [baseType, subType] = eventType.split(":");
  return { baseType, subType: subType || null };
}
```

```typescript
// utils.test.ts
import { describe, expect, it } from "vitest";
import { escapeHtml, formatTime, parseEventType } from "./utils";

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("parseEventType", () => {
  it("parses simple event type", () => {
    expect(parseEventType("Stop")).toEqual({
      baseType: "Stop",
      subType: null,
    });
  });

  it("parses compound event type", () => {
    expect(parseEventType("Notification:error")).toEqual({
      baseType: "Notification",
      subType: "error",
    });
  });
});
```

#### Priority 5: Icon Optimization (Optional)

**Why:** Reduce bundle size and simplify icon management.

**Option A - Lucide Icons CDN:**
```html
<script src="https://unpkg.com/lucide@latest"></script>
```

```typescript
// After rendering
lucide.createIcons();
```

**Option B - Separate Icon Module:**
```typescript
// icons.ts
export const icons = {
  clipboard: `<svg>...</svg>`,
  trash: `<svg>...</svg>`,
  sparkle: `<svg>...</svg>`,
} as const;
```

#### Priority 6: Framework Adoption (Defer)

**Recommendation:** Stay with vanilla TypeScript for now.

**Rationale:**
- Dashboard is read-heavy with simple interactions
- Zero runtime dependencies is a security advantage
- Module extraction addresses maintainability concerns
- Framework adds complexity and bundle size

**If framework is needed later, consider:**
- **Preact** (3KB) - React-compatible, minimal footprint
- **Lit** (5KB) - Web Components, good encapsulation
- **Alpine.js** (15KB) - Declarative without virtual DOM

#### Priority 7: Hono Migration (Optional)

**When to consider:**
- Need type-safe RPC client
- Adding more API endpoints
- Want middleware ecosystem

**Example migration:**
```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";

const app = new Hono()
  .use("/*", cors())
  .get("/api/events", async (c) => {
    const mode = c.req.query("mode") || "waiting";
    return c.json({
      events: getActiveEvents(mode as FilterMode),
      last_modified: getDbLastModified(),
    });
  })
  .delete("/api/sessions/:id", async (c) => {
    const sessionId = c.req.param("id");
    const success = await deleteSession(sessionId);
    return success
      ? c.json({ success: true })
      : c.json({ success: false, error: "Failed" }, 500);
  })
  .get("/api/events/stream", (c) => {
    // SSE implementation
  })
  .use("/*", serveStatic({ root: "./dist" }));

export type AppType = typeof app;
export default app;
```

---

## Migration Path

### Phase 1: Foundation (Week 1)

1. **Day 1-2:** Vite migration
   - Create vite.config.ts
   - Update package.json scripts
   - Move index.html to src/
   - Test HMR works

2. **Day 3-4:** Type sharing
   - Create shared/types.ts
   - Update imports in server and client
   - Delete web/src/types.ts
   - Verify compilation

3. **Day 5:** Testing setup
   - Create vitest.config.ts
   - Create test/setup.ts with mocks
   - Add test dependencies

### Phase 2: Refactoring (Week 2)

4. **Day 1-2:** Extract utils.ts
   - Move pure functions
   - Write unit tests
   - Verify no regressions

5. **Day 3-4:** Extract api.ts and sse.ts
   - Move API client code
   - Move SSE connection logic
   - Write tests

6. **Day 5:** Extract remaining modules
   - storage.ts (IndexedDB)
   - render.ts (DOM functions)
   - state.ts (state management)
   - icons.ts (SVG icons)

### Phase 3: Polish (Week 3)

7. Clean up app.ts as thin orchestrator
8. Achieve target test coverage
9. Update documentation
10. Create PR for review

### Verification Checklist

- [ ] `bun run dev` starts Vite with HMR
- [ ] Browser auto-refreshes on TypeScript changes
- [ ] Browser auto-refreshes on CSS changes
- [ ] Source maps work in browser devtools
- [ ] Shared types import correctly in client
- [ ] Shared types import correctly in server
- [ ] `bun test` runs Vitest successfully
- [ ] All utility function tests pass
- [ ] Coverage report generates
- [ ] SSE real-time updates work
- [ ] Filter modes (waiting/active/all) work
- [ ] Copy tmux command works
- [ ] Session deletion works
- [ ] Cleanup preview/execute works
- [ ] Production build succeeds
- [ ] Production build serves correctly

---

## Appendix

### A. Full File Tree Comparison

**bun-hello-front (Reference):**
```
src/
├── client/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── header.tsx
│   │   │   └── footer.tsx
│   │   ├── todos/
│   │   │   ├── todo-item.tsx
│   │   │   ├── todo-list.tsx
│   │   │   └── todo-form.tsx
│   │   └── ui/
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       └── ...shadcn components
│   ├── hooks/
│   │   ├── use-todos.ts
│   │   ├── use-auth.ts
│   │   └── use-sse.ts
│   ├── lib/
│   │   ├── rpc-client.ts
│   │   ├── auth-client.ts
│   │   ├── query-keys.ts
│   │   └── sse-client.ts
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   └── login.tsx
│   ├── test/
│   │   └── setup.ts
│   ├── types/
│   │   └── index.ts
│   ├── main.tsx
│   └── index.css
├── server/
│   ├── routes/
│   │   ├── todos.ts
│   │   └── sse.ts
│   ├── middleware/
│   │   └── auth.ts
│   ├── db/
│   │   ├── schema.ts
│   │   └── migrations/
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── errors.ts
│   │   ├── email.ts
│   │   └── sse-manager.ts
│   ├── types/
│   │   └── env.ts
│   └── index.ts
└── shared/
    ├── schemas.ts
    └── types/
        └── index.ts
```

**crux-monitor (Current):**
```
plugins/crux-monitor/
├── src/
│   ├── db.ts
│   ├── types.ts
│   └── ...other server files
└── web/
    ├── public/
    │   ├── index.html
    │   ├── app.js
    │   └── style.css
    ├── src/
    │   ├── app.ts        # 672 lines
    │   ├── types.ts      # Duplicated types
    │   └── styles/
    │       └── input.css
    ├── server.ts
    └── package.json
```

**crux-monitor (Proposed):**
```
plugins/crux-monitor/
├── shared/
│   └── types.ts          # NEW: Shared API types
├── src/
│   ├── db.ts
│   └── types.ts          # Server-only types
└── web/
    ├── dist/              # NEW: Vite output
    │   ├── index.html
    │   ├── assets/
    │   └── ...
    ├── public/
    │   └── favicon.svg
    ├── src/
    │   ├── index.html     # MOVED from public/
    │   ├── app.ts         # Reduced to ~100 lines
    │   ├── utils.ts       # NEW: Pure functions
    │   ├── api.ts         # NEW: API client
    │   ├── sse.ts         # NEW: SSE management
    │   ├── storage.ts     # NEW: IndexedDB wrapper
    │   ├── render.ts      # NEW: DOM rendering
    │   ├── state.ts       # NEW: State management
    │   ├── icons.ts       # NEW: SVG icons
    │   ├── styles/
    │   │   └── input.css
    │   └── test/
    │       ├── setup.ts   # NEW: Test setup
    │       ├── utils.test.ts
    │       └── api.test.ts
    ├── server.ts
    ├── package.json
    ├── vite.config.ts     # NEW
    ├── vitest.config.ts   # NEW
    └── tsconfig.json      # UPDATED with path aliases
```

### B. Package.json Comparison

**bun-hello-front:**
```json
{
  "scripts": {
    "dev": "concurrently -k \"bun run dev:server\" \"bun run dev:client\"",
    "dev:server": "bun --watch run src/server/index.ts",
    "dev:client": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest",
    "test:run": "vitest run",
    "e2e": "playwright test",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-router": "^1.x.x",
    "@tanstack/react-query": "^5.x.x",
    "hono": "^4.x.x",
    "drizzle-orm": "^0.x.x",
    "better-auth": "^1.x.x",
    "valibot": "^1.x.x"
  },
  "devDependencies": {
    "vite": "^7.3.1",
    "@vitejs/plugin-react": "^4.x.x",
    "vitest": "^4.0.x",
    "playwright": "^1.x.x",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.x.x",
    "biome": "^1.x.x"
  }
}
```

**crux-monitor (Current):**
```json
{
  "scripts": {
    "postinstall": "bun run build",
    "build": "bun run build:css && bun run build:js",
    "build:js": "bun build ./src/app.ts --outfile ./public/app.js --target browser",
    "build:css": "bunx @tailwindcss/cli -i ./src/styles/input.css -o ./public/style.css --minify",
    "start": "bun run server.ts",
    "dev": "concurrently -k \"bun run build:js:watch\" \"bun run build:css:watch\" \"bun --watch run server.ts\""
  },
  "devDependencies": {
    "@types/bun": "latest",
    "concurrently": "^9.1.2",
    "@tailwindcss/cli": "^4.0.0",
    "tailwindcss": "^4.0.0"
  }
}
```

**crux-monitor (Proposed):**
```json
{
  "scripts": {
    "dev": "concurrently -k \"vite\" \"bun --watch run server.ts\"",
    "build": "vite build",
    "preview": "vite preview",
    "start": "bun run server.ts",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "concurrently": "^9.1.2",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^7.3.1",
    "vitest": "^4.0.18",
    "@vitest/coverage-v8": "^4.0.18",
    "@testing-library/jest-dom": "^6.9.1",
    "jsdom": "^27.4.0"
  }
}
```

### C. References

- [Vite Documentation](https://vite.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Hono Documentation](https://hono.dev/)
- [TanStack Router](https://tanstack.com/router/)
- [TanStack Query](https://tanstack.com/query/)
- [Bun Documentation](https://bun.sh/)
