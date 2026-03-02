# MCP vs Scripts Best Practices for Claude Code Plugins

This document provides a comprehensive analysis of when to use MCP tools, scripts, or hooks in Claude Code plugins, with specific recommendations based on real-world implementations in the CRUX monorepo.

## Executive Summary

| Mechanism | Use When | Token Cost | Example |
|-----------|----------|------------|---------|
| **MCP Tools** | Claude needs to call directly with structured I/O | ~100-500 tokens/call | `send_message`, `start_worktree_session` |
| **Scripts** | Background operations, polling, complex control flow | 0 tokens while waiting | `poll-notifications.ts`, `cleanup` |
| **Hooks** | Lifecycle events, context injection, permission control | Minimal injection only | `SessionStart`, `PreToolUse` |

**Key Insight:** Background operations as scripts rather than MCP tools can reduce token usage by up to 98.7% (Anthropic Engineering).

## 1. Technical Comparison

### 1.1 MCP Tools (Model Context Protocol)

MCP is Anthropic's official protocol for AI-tool integrations. Tools communicate via JSON-RPC over stdio.

**Characteristics:**
- Claude calls the tool explicitly in conversation
- Structured JSON input/output
- Each call consumes context window tokens
- Plugin-provided MCP servers start automatically when enabled
- Tool Search activates when tools exceed 10% of context window

**Token Overhead:**
```
Each MCP call includes:
├── Tool name in context
├── Parameter schema
├── Input parameters (user-provided)
└── Output response (server-provided)
≈ 100-500 tokens per invocation
```

### 1.2 Scripts (Bash/Bun Execution)

Scripts run as external processes, independent of Claude's context window.

**Characteristics:**
- Execute in background or foreground
- No token cost while waiting/polling
- Full programming language capabilities
- File system access for inter-process communication
- Can use `fs.watch()` for efficient event-driven polling

**Background Execution Pattern:**
```
Claude's context          Script process
┌─────────────┐           ┌─────────────┐
│ Starts      │──────────▶│ Runs in     │
│ script      │           │ background  │
└─────────────┘           └──────┬──────┘
      │                          │
      │ (0 tokens while          │ fs.watch()
      │  script runs)            │ polling
      │                          │
      ▼                          ▼
┌─────────────┐           ┌─────────────┐
│ Checks      │◀──────────│ Writes to   │
│ output      │  (file)   │ output file │
└─────────────┘           └─────────────┘
```

### 1.3 Hooks (Event-Driven)

Hooks fire at specific lifecycle points, enabling reactive behavior.

**Available Hook Types:**
| Hook | Trigger | Use Case |
|------|---------|----------|
| `PreToolUse` | Before any tool call | Auto-approve, modify params |
| `PostToolUse` | After tool completion | Log results, trigger actions |
| `Notification` | Claude sends notification | Monitor idle, permissions |
| `Stop` | Session stopping | Cleanup, save state |
| `SessionStart` | Session begins | Context injection, setup |
| `SessionEnd` | Session terminates | Final cleanup |

**Context Injection Pattern:**
```json
{
  "hooks": {
    "SessionStart": [{
      "command": "echo 'Injected context'",
      "blocking": true
    }]
  }
}
```

## 2. Decision Framework

### 2.1 When to Use MCP Tools

✅ **Use MCP when:**
- Claude needs to call the operation directly
- Structured input validation is required
- Single request-response pattern fits
- Real-time response needed in conversation
- Operation is deterministic and quick

**Examples from crux-hive:**
```
send_message        → Claude explicitly notifies orchestrator
start_worktree      → Claude creates worker sessions
create_orchestrator → Claude initializes coordination
```

### 2.2 When to Use Scripts

✅ **Use scripts when:**
- Operation runs in background
- Polling or watching for changes
- Complex control flow logic
- Large data processing
- Long-running processes
- Zero token cost is critical

**Examples from crux-hive:**
```
poll-notifications.ts → Background fs.watch() polling
cleanup               → Process management (kill tmux)
setup-symlinks        → File system operations
```

### 2.3 When to Use Hooks

✅ **Use hooks when:**
- Responding to lifecycle events
- Injecting context at session start
- Auto-approving specific commands
- Logging/monitoring events
- Controlling permissions

**Examples from crux-hive:**
```
SessionStart  → Configure git-gtr, inject worker mode
PreToolUse    → Auto-approve watcher command
```

## 3. Case Study: crux-hive Plugin

The crux-hive plugin demonstrates a well-architected hybrid approach.

### 3.1 Architecture Analysis

```
crux-hive Plugin Architecture
═══════════════════════════════════════════════════════

MCP Tools (3)                     Scripts (3)
┌─────────────────────┐           ┌─────────────────────┐
│ create_orchestrator │           │ poll-notifications  │
│ start_worktree      │           │ cleanup             │
│ send_message        │           │ setup-symlinks      │
└─────────────────────┘           └─────────────────────┘
         │                                 │
         │ Called by Claude                │ Run by Bash
         ▼                                 ▼
┌───────────────────────────────────────────────────────┐
│               File-based IPC (/tmp)                   │
│  orchestrator-{id}.json  ◄──►  notification-*.json    │
└───────────────────────────────────────────────────────┘
         ▲                                 ▲
         │                                 │
Hooks (2)│                                 │
┌────────┴────────────┐                    │
│ SessionStart        │────────────────────┘
│ PreToolUse (Bash)   │ Enables auto-approve
└─────────────────────┘   for poll command
```

### 3.2 Design Decisions Explained

**Why `poll-notifications.ts` is a script (not MCP):**
1. Runs continuously in background
2. Uses `fs.watch()` for efficient polling
3. Zero token cost while waiting
4. Would consume context with each poll if MCP

**Why `send_message` is MCP (not script):**
1. Claude needs to call it explicitly
2. Requires structured input (message_type, content)
3. Returns confirmation to Claude
4. Single request-response pattern

**Why auto-approve uses PreToolUse hook:**
1. Triggered automatically before Bash tool
2. Pattern matches specific command
3. No user interaction needed
4. Security: only approves documented command

### 3.3 Token Efficiency Comparison

```
Scenario: Orchestrator waiting for worker notifications

❌ MCP Polling Approach (NOT used):
   - Poll every 2 seconds
   - 10 minute wait = 300 polls
   - ~150 tokens per poll
   - Total: 45,000 tokens

✅ Script Approach (USED):
   - Start background script: ~50 tokens
   - fs.watch() waits: 0 tokens
   - Read result: ~50 tokens
   - Total: ~100 tokens

   Token savings: 99.8%
```

## 4. Anti-Patterns to Avoid

### ❌ MCP for Polling Operations

```typescript
// BAD: Wastes tokens on each poll
const tool = {
  name: "poll_notifications",
  handler: async () => {
    return await checkForNotifications(); // Called repeatedly
  }
};

// GOOD: Background script with fs.watch()
fs.watch(notificationsDir, (event, filename) => {
  if (filename) handleNotification(filename);
});
```

### ❌ Scripts for Structured Input

```typescript
// BAD: Parsing command-line args is error-prone
// $ bun script.ts '{"type":"complete","pr":"..."}'

// GOOD: MCP with schema validation
const tool = {
  name: "send_message",
  inputSchema: {
    type: "object",
    properties: {
      message_type: { enum: ["task_complete", "task_failed", "question"] },
      content: { type: "object" }
    },
    required: ["message_type", "content"]
  }
};
```

### ❌ Hooks for Long-Running Operations

```typescript
// BAD: Blocking hook delays session start
{
  "hooks": {
    "SessionStart": [{
      "command": "bun expensive-setup.ts", // Takes 30 seconds
      "blocking": true
    }]
  }
}

// GOOD: Non-blocking hook or background script
{
  "hooks": {
    "SessionStart": [{
      "command": "bun quick-setup.ts &", // Background
      "blocking": false
    }]
  }
}
```

### ❌ Too Many MCP Tools

```
If tools exceed 10% of context window:
├── Tool Search activates
├── Claude may miss relevant tools
├── Context efficiency drops
└── Consider consolidating or using scripts
```

## 5. Design Guidelines

### 6.1 Decision Tree

```
                    ┌─────────────────────┐
                    │  New Plugin Feature │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Does Claude need to │
                    │ call it directly?   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │ Yes            │                │ No
              ▼                │                ▼
    ┌─────────────────┐        │      ┌─────────────────┐
    │ Is it request/  │        │      │ Is it triggered │
    │ response?       │        │      │ by lifecycle?   │
    └────────┬────────┘        │      └────────┬────────┘
             │                 │               │
    ┌────────┼────────┐        │      ┌────────┼────────┐
    │Yes     │        │No      │      │Yes     │        │No
    ▼        │        ▼        │      ▼        │        ▼
┌───────┐    │   ┌─────────┐   │  ┌───────┐    │   ┌─────────┐
│  MCP  │    │   │Consider │   │  │ Hook  │    │   │ Script  │
│ Tool  │    │   │ Script  │   │  │       │    │   │         │
└───────┘    │   └─────────┘   │  └───────┘    │   └─────────┘
             │                 │               │
             │                 │               │
             └─────────────────┴───────────────┘
```

### 6.2 Token Efficiency Guidelines

| Pattern | Token Cost | Recommendation |
|---------|------------|----------------|
| MCP tool call | ~100-500/call | Use for essential operations |
| Background script | ~50 start + 0 wait | Use for polling/long-running |
| Hook injection | ~50-200/session | Use for setup/permissions |
| Frequent polling via MCP | Scales with frequency | **Avoid** |

### 6.3 Security Guidelines

1. **MCP Tools:** Validate all inputs with JSON schema
2. **Scripts:** Auto-approve only documented commands
3. **Hooks:** Use specific pattern matching for PreToolUse
4. **File IPC:** Use `/tmp` with appropriate permissions

### 6.4 Testing Guidelines

```
MCP Tools:
├── Test input validation
├── Test error responses
└── Test with Claude integration

Scripts:
├── Test CLI interface
├── Test background execution
└── Test file system operations

Hooks:
├── Test pattern matching
├── Test blocking behavior
└── Test context injection
```

## 6. Recommendations for crux-hive

### 7.1 Current Design Assessment

**Verdict: Well-Architected** ✅

The current crux-hive architecture correctly applies the decision framework:

| Component | Type | Reasoning | Correct? |
|-----------|------|-----------|----------|
| `create_orchestrator_session` | MCP | Claude initiates | ✅ |
| `start_worktree_session` | MCP | Claude initiates, structured input | ✅ |
| `send_message` | MCP | Worker notifies orchestrator | ✅ |
| `poll-notifications.ts` | Script | Background polling | ✅ |
| `cleanup` | Script | Process management | ✅ |
| `setup-symlinks` | Script | File operations at worktree creation | ✅ |
| SessionStart hook | Hook | Lifecycle + context injection | ✅ |
| PreToolUse hook | Hook | Auto-approve specific command | ✅ |

### 7.2 Potential Enhancements (Optional)

These are not required but could be considered for future iterations:

1. **Consolidate MCP tools:** If context becomes constrained, `create_orchestrator_session` could be merged into `start_worktree_session` with an optional `create_orchestrator: true` parameter.

2. **Async hook for cleanup:** The preRemove cleanup script could use the async hook pattern if tmux window termination is slow.

3. **Notification batching:** For high-volume scenarios, batch multiple notifications into single reads.

## 7. References

### Official Anthropic Documentation
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Anthropic Engineering: Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)

### Related CRUX Documentation
- [hooks-analysis.md](./hooks-analysis.md) - Comprehensive hooks inventory
- [orchestrator-mode skill](../plugins/crux-hive/skills/orchestrator-mode/SKILL.md) - Orchestrator workflow

### Plugin Implementations
- [crux-hive plugin.json](../plugins/crux-hive/.claude-plugin/plugin.json) - MCP + Hooks configuration
