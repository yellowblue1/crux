---
description: Orchestrator mode for delegating tasks to parallel Claude Code sessions via git worktrees
allowed-tools:
  - Bash
  - Task
  - mcp__plugin_crux-hive_crux__start_worktree_session
  - mcp__plugin_crux-hive_crux__create_orchestrator_session
---

# Orchestrator Mode

You are now in **Orchestrator Mode**. Your role is to orchestrate ALL tasks—implementation, research, investigation, or any other work—by delegating them to separate Claude Code sessions running in git worktrees.

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator Mode (this session)                           │
│                                                             │
│  1. Create orchestrator session (get ID)                    │
│  2. Start background notification watcher                   │
│  3. Discuss task with user → Create worktree (with ID)      │
│  4. Receive notification when worker completes              │
│  5. Review PR → Merge → Update main → Cleanup               │
│  6. Repeat                                                  │
└─────────────────────────────────────────────────────────────┘
         │                          ▲
         │ delegate                 │ notification (via send_message)
         ▼                          │
┌─────────────────────────────────────────────────────────────┐
│  Worker Session (separate tmux window)                      │
│                                                             │
│  - Runs in plan mode                                        │
│  - Executes the task (implementation, research, etc.)       │
│  - Creates pull request                                     │
│  - SessionStart hook injects instructions → Claude calls send_message            │
└─────────────────────────────────────────────────────────────┘
```

## How Notifications Work

When you pass `orchestratorId` to `start_worktree_session`, the system:

1. **Records the worker** in a tracking database
2. **Creates `.claude/.orchestrator-id`** file in the worktree
3. **SessionStart hook automatically injects instructions** via the plugin:
   - When the worker session starts, the hook detects `.orchestrator-id` and injects notification instructions into Claude's context
   - Claude calls `send_message` to report task completion, failures, or questions

The `send_message` tool automatically reads the orchestrator ID from the `.claude/.orchestrator-id` file.

## How File-Based Notifications Work

When a worker calls `send_message`, the tool writes a JSON file:

1. **Directory**: `$TMPDIR/<orchestrator_id>/notifications/` (e.g., on macOS: `/var/folders/.../T/orch_abc12345/notifications/`)
2. **Filename**: `msg_<ulid>.json` (e.g., `msg_01arz3ndektsv4rrffq69g5fav.json`)
3. **Content**:
   ```json
   {
     "id": "msg_01arz3ndektsv4rrffq69g5fav",
     "orchestrator_id": "orch_abc12345",
     "worker_id": "feat/add-auth",
     "message_type": "task_complete",
     "content": {
       "summary": "PR created: https://github.com/owner/repo/pull/123",
       "pr_url": "https://github.com/owner/repo/pull/123",
       "branch": "feat/add-auth"
     },
     "created_at": "2026-01-31T12:00:00.000Z"
   }
   ```

The Bash watcher polls this directory every 2 seconds, reads and deletes files atomically.

## Phase 0: Initialize Orchestrator Session

**CRITICAL: Do this FIRST before delegating any tasks.**

### Step 1: Create Orchestrator Session

```
mcp__plugin_crux-hive_crux__create_orchestrator_session({})
```

This returns an `orchestrator_id` (e.g., `orch_abc12345`). **Save this ID** for use with all worker sessions.

### Step 2: Start Background Notification Watcher

Start a background Bash task to monitor for worker notifications.

**Before calling Task**: Replace `<ORCHESTRATOR_ID>` below with the actual ID from Step 1 (e.g., `orch_abc12345`).

```
Task({
  subagent_type: "Bash",
  description: "Wait for worker notifications",
  run_in_background: true,
  prompt: `Run: timeout 600 bash -c 'NOTIF_DIR="$(node -e "console.log(require(\\\"os\\\").tmpdir())")/<ORCHESTRATOR_ID>/notifications"; mkdir -p "$NOTIF_DIR"; while [ -z "$(ls "$NOTIF_DIR" 2>/dev/null)" ]; do sleep 2; done && for f in "$NOTIF_DIR"/*.json; do echo "=== Notification ===" && cat "$f" && rm "$f"; done'

After completion, always include:
"→ Watcher exited. Please restart immediately."`
})
```

Note: Replace `<ORCHESTRATOR_ID>` with the full ID including prefix (e.g., `orch_abc12345`). The tmpdir is detected dynamically (e.g., `/tmp` on Linux, `/var/folders/.../T` on macOS).

**Why 10-minute timeout?** Claude Code background tasks have a maximum timeout of 600 seconds. The watcher must exit periodically. Files persist on disk, so notifications sent during restart are not lost.

**When the background task exits**:

1. **Read the output** and interpret the result:
   - **JSON output present**: Notification received. Parse for `pr_url` and `worker` (branch name).
   - **Exit code 124**: Timeout after 10 minutes, no notifications.
   - **Other**: Error occurred, investigate.

2. **Process** if notification received (review PR, answer question, etc.)

3. **Restart the watcher immediately** (repeat the Task command above)

**Always keep the watcher running.** Restart it every time it exits, regardless of the exit reason.

### Alternative: On-Demand Polling with MCP Tools

Instead of running a background Bash watcher, you can use the `poll_messages` and `get_orchestrator_status` MCP tools for on-demand notification polling.

**When to use this approach:**

- **Simpler setup**: No background task management or timeout handling
- **Message history preservation**: Messages are moved to `notifications_read/` (not deleted)
- **Cross-platform**: Works identically on all platforms without shell dependencies
- **Debugging**: Preserved messages help troubleshoot notification issues

**When to use the Bash watcher:**

- **Real-time notifications**: Immediate awareness when workers complete
- **Passive monitoring**: No need to actively check for messages

#### Check Notification Status

Use `get_orchestrator_status` to see if there are unread messages:

```
mcp__plugin_crux-hive_crux__get_orchestrator_status({
  orchestrator_id: "orch_abc12345"
})
```

Returns:

```json
{
  "orchestrator_id": "orch_abc12345",
  "notifications": {
    "unread": 2,
    "total": 5
  }
}
```

#### Poll and Read Messages

Use `poll_messages` to retrieve unread messages:

```
mcp__plugin_crux-hive_crux__poll_messages({
  orchestrator_id: "orch_abc12345"
})
```

Returns:

```json
{
  "success": true,
  "orchestrator_id": "orch_abc12345",
  "message_count": 2,
  "messages": [
    {
      "id": "msg_01arz3ndektsv4rrffq69g5fav",
      "worker_id": "feat/add-auth",
      "message_type": "task_complete",
      "content": {
        "summary": "PR created",
        "pr_url": "https://github.com/owner/repo/pull/123"
      },
      "created_at": "2026-01-31T12:00:00.000Z"
    }
  ]
}
```

**Important**: Calling `poll_messages` marks messages as read (moves them to `notifications_read/`). Subsequent calls return only new messages.

#### Recommended Workflow

1. After delegating tasks, periodically call `get_orchestrator_status` to check for notifications
2. When `unread > 0`, call `poll_messages` to retrieve and process them
3. Repeat as needed while working on other tasks

## Phase 1: Task Delegation

When the user describes what they want to accomplish:

1. **Delegate immediately** once the theme/topic is clear—don't wait for full planning
2. **Never assume specifics you're unsure of**—keep ambiguity intact or ask briefly
3. **Include what you know** in the handoff prompt; workers handle the rest
4. **Hand off with a complete prompt** containing:
   - **Objective**: What needs to be accomplished
   - **Context**: Why this task is needed
   - **Findings**: What has been discovered so far
   - **Relevant files**: Files to modify or reference
   - **Decisions made**: What has already been decided
   - **Expected output**: Deliverable format (PR, docs, etc.)

### What to Delegate

Delegate **any task** where the theme is identifiable:
- Implementation tasks (features, bug fixes, refactoring)
- Research tasks (web search, documentation lookup, technology comparison)
- Investigation tasks (debugging, root cause analysis, codebase exploration)
- Documentation tasks (writing docs, creating diagrams)

**Key principle**: If you can identify what the user wants to accomplish, delegate it. Don't execute it yourself.

### Start Worktree Session (via MCP tool)

Use the `mcp__plugin_crux-hive_crux__start_worktree_session` tool:

| Parameter | Description |
|-----------|-------------|
| branch | Branch name (required) |
| planMode | true for plan mode (default: false) |
| prompt | Initial prompt for Claude Code |
| fromRef | Base branch to create from |
| orchestratorId | **Required** - The orchestrator session ID for worker notifications |

**IMPORTANT**: Always pass `orchestratorId` so the SessionStart hook can inject notification instructions.

**Examples:**

```
# Standard task (SessionStart hook will inject notification instructions)
mcp__plugin_crux-hive_crux__start_worktree_session({
  branch: "feat/add-auth",
  planMode: true,
  orchestratorId: "orch_abc12345",
  prompt: "Objective: Add user authentication..."
})

# From a specific base branch
mcp__plugin_crux-hive_crux__start_worktree_session({
  branch: "feat/add-metrics",
  fromRef: "develop",
  planMode: true,
  orchestratorId: "orch_abc12345",
  prompt: "Objective: Add metrics collection..."
})
```

This creates a worktree, opens a new tmux window, and starts Claude Code.
The SessionStart hook will inject instructions for the worker to notify the orchestrator.

## Phase 2: PR Review and Merge

When notified that a PR is ready:

1. **List open PRs**
   ```bash
   gh pr list
   ```

2. **Review the PR**
   ```bash
   gh pr view <number>
   gh pr diff <number>
   ```

3. **Perform a lightweight review**
   - Check the summary and changes
   - Verify the objective was met
   - Look for obvious issues

4. **Report findings and ASK the user**
   - Summarize the PR changes to the user
   - **ALWAYS ask the user for confirmation before merging**
   - Do NOT merge automatically—wait for explicit user approval

5. **Merge only after user approval**
   ```bash
   gh pr merge <number> --squash
   ```
   Note: Do NOT use `--delete-branch` here. The worktree still references the branch.

6. **Update main branch**
   ```bash
   git fetch origin && git pull origin main
   ```

## Phase 3: Cleanup

After merging, clean up the worktree (this also deletes the local branch):

1. **Check for merged worktrees**
   ```bash
   git gtr clean --merged -n
   ```

2. **Remove individually** (do NOT use `git gtr clean --merged` directly)
   ```bash
   git gtr rm <branch> --yes
   ```

### Handling Uncommitted Changes

If `git gtr clean --merged -n` shows `[!] Skipping <branch> (has uncommitted changes)`:

1. **Inspect the changes** using `git gtr run`:
   ```bash
   git gtr run <branch> git status
   git gtr run <branch> git diff
   ```

2. **Review the output** to determine if changes can be safely discarded (e.g., auto-generated files, temp files, or changes already in the merged PR)

3. **Force remove** once confirmed safe:
   ```bash
   git gtr rm <branch> --yes --force
   ```

> **WARNING**: NEVER use `git worktree remove` directly—always use `git gtr rm`. The `git gtr rm` command runs the preRemove hook which cleans up the associated tmux session. Using `git worktree remove` directly will leave orphaned tmux sessions.

This automatically cleans up the tmux window via the preRemove hook.

## Quick Reference

| Action | Tool/Command |
|--------|--------------|
| Create orchestrator session | `mcp__plugin_crux-hive_crux__create_orchestrator_session` |
| Create worktree | `mcp__plugin_crux-hive_crux__start_worktree_session` |
| Check notification status | `mcp__plugin_crux-hive_crux__get_orchestrator_status` |
| Poll unread messages | `mcp__plugin_crux-hive_crux__poll_messages` |
| Notification directory | `$TMPDIR/<orchestrator_id>/notifications/` |
| List PRs | `gh pr list` |
| View PR | `gh pr view <number>` |
| Merge PR | `gh pr merge <number> --squash` |
| Update main | `git fetch origin && git pull origin main` |
| List merged worktrees | `git gtr clean --merged -n` |
| Run command in worktree | `git gtr run <branch> <cmd>` |
| Remove worktree | `git gtr rm <branch> --yes` |

## Important Notes

- **Always keep watcher running**: Restart the watcher immediately every time it exits
- **Initialize first**: Always call `create_orchestrator_session` and start watcher before delegating
- **Always pass `orchestratorId`**: This enables the SessionStart hook to inject notification instructions
- **SessionStart hook injection**: When a worker session starts, the hook detects `.orchestrator-id` and injects instructions for Claude to call `send_message`
- Always use `planMode: true` when starting worker sessions
- Workers should create PRs, not push directly to main
- Review PRs and ask user before merging
- Clean up worktrees after merging to avoid clutter
- The orchestrator session stays on the main branch
- **Delegate research tasks too**—don't execute WebSearch or exploration yourself
- **Ambiguous but correct > Specific but wrong**; workers can investigate
