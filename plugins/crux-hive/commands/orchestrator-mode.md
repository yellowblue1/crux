---
description: Orchestrator mode for delegating tasks to parallel Claude Code sessions via git worktrees
allowed-tools:
  - Bash
  - mcp__plugin_crux-hive_crux__start_worktree_session
  - TeamCreate
  - SendMessage
  - TeamDelete
---

# Orchestrator Mode

You are now in **Orchestrator Mode**. Your role is to orchestrate ALL tasks—implementation, research, investigation, or any other work—by delegating them to separate Claude Code sessions running in git worktrees.

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator Mode (this session)                           │
│                                                             │
│  1. TeamCreate → creates team (once per conversation)        │
│  2. Discuss task with user → start_worktree_session          │
│     (with teamName → worker joins as teammate)               │
│  3. Worker uses built-in SendMessage → auto-delivered         │
│  4. Review PR → Merge/Close → Shutdown worker → Cleanup      │
│  (repeat 2-4 for additional tasks)                           │
└─────────────────────────────────────────────────────────────┘
         │                          ▲
         │ delegate                 │ SendMessage (built-in, auto-delivered)
         ▼                          │
┌─────────────────────────────────────────────────────────────┐
│  Worker Session (separate tmux window + git worktree)        │
│                                                             │
│  - Launched as Agent Teams teammate                          │
│  - Runs in plan mode                                        │
│  - Executes the task (implementation, research, etc.)        │
│  - Creates pull request                                      │
│  - Uses built-in SendMessage to notify orchestrator           │
└─────────────────────────────────────────────────────────────┘
```

## How It Works

Workers are launched as **Agent Teams teammates** using Claude Code's built-in team coordination:

1. **TeamCreate** creates a team with a shared config at `~/.claude/teams/{name}/`
2. **start_worktree_session** (with `teamName`) launches the worker with Agent Teams flags
3. The worker automatically has access to **SendMessage** (built-in) for bidirectional communication
4. Messages are **auto-delivered** — no polling or watcher needed

## Phase 0: Create Team

**CRITICAL: Do this FIRST before delegating any tasks.**

```
TeamCreate({ team_name: "my-project" })
```

This creates the team config at `~/.claude/teams/my-project/config.json` with your session as the team lead.

**One team per conversation is sufficient.** You don't need to delete and recreate teams between tasks. Workers can be added and removed independently while the team persists. Think of the team as a lightweight session context, not a per-task resource.

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
| teamName | **Required** — The team name from TeamCreate |
| agentName | **Required** when teamName is set — Unique name for this worker |
| agentColor | Optional display color (e.g., 'blue', 'green', 'red') |
| model | Optional model override (e.g., 'sonnet', 'haiku') |

**IMPORTANT**: Always pass `teamName` and `agentName` so the worker is registered as a teammate with SendMessage access.

**Examples:**

```
# Standard task
mcp__plugin_crux-hive_crux__start_worktree_session({
  branch: "feat/add-auth",
  planMode: true,
  teamName: "my-project",
  agentName: "worker-auth",
  agentColor: "blue",
  prompt: "Objective: Add user authentication..."
})

# From a specific base branch
mcp__plugin_crux-hive_crux__start_worktree_session({
  branch: "feat/add-metrics",
  fromRef: "develop",
  planMode: true,
  teamName: "my-project",
  agentName: "worker-metrics",
  agentColor: "green",
  prompt: "Objective: Add metrics collection..."
})
```

This creates a worktree, opens a new tmux window, and starts Claude Code as a teammate.

## Phase 2: Communication

Workers automatically have access to **SendMessage** (built-in). Messages are delivered to you automatically — no polling needed.

You can also send messages to workers:
```
SendMessage({
  type: "message",
  recipient: "worker-auth",
  content: "Please also add rate limiting to the login endpoint",
  summary: "Add rate limiting request"
})
```

## Phase 3: PR Review and Merge

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

## Phase 4: Worker Shutdown and Cleanup

**IMPORTANT**: Always shut down workers before removing worktrees. This ensures clean process termination.

### Step 1: Shut Down the Worker

Send a shutdown request and **wait for approval** before proceeding:

```
SendMessage({
  type: "shutdown_request",
  recipient: "worker-auth",
  content: "Task complete, please shut down."
})
```

Wait for the `shutdown_approved` message. If the worker doesn't respond (e.g., it was busy monitoring CI), resend the request.

### Step 2: Remove the Worktree

When a worktree is removed via `git gtr rm`, the cleanup hook automatically deregisters the worker from the Agent Teams config (`~/.claude/teams/{teamName}/config.json`). This means `TeamDelete` will not fail due to stale active members.

**After merging a PR:**

```bash
# Verify the worktree is eligible for cleanup
git gtr clean --merged -n

# Remove individually (do NOT use `git gtr clean --merged` directly)
git gtr rm <branch> --yes
```

**After closing a PR (no merge):**

```bash
# Directly remove — `git gtr clean --merged` won't detect closed PRs
git gtr rm <branch> --yes
```

### Step 3: Delete the Remote Branch

```bash
git push origin --delete <branch>
```

### Handling Uncommitted Changes

If `git gtr rm` or `git gtr clean --merged -n` shows `[!] Skipping <branch> (has uncommitted changes)`:

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

### About TeamDelete

`TeamDelete` only removes lightweight files (`~/.claude/teams/` and `~/.claude/tasks/`). It does **not** clean up any actual resources — worktrees, tmux sessions, and branches are all cleaned up individually in the steps above.

Workers are automatically deregistered from the team config when their worktrees are removed (via the cleanup hook), so `TeamDelete` should succeed without manual intervention.

Use `TeamDelete` only when you need to create a **new team** in the same conversation (since `TeamCreate` requires no existing team). At the end of a conversation, leftover team files are harmless and will not affect future sessions.

## Quick Reference

| Action | Tool/Command |
|--------|--------------|
| Create team | `TeamCreate` |
| Create worktree + worker | `mcp__plugin_crux-hive_crux__start_worktree_session` |
| Send message to worker | `SendMessage` |
| Request worker shutdown | `SendMessage` (type: `shutdown_request`) |
| List PRs | `gh pr list` |
| View PR | `gh pr view <number>` |
| Merge PR | `gh pr merge <number> --squash` |
| Update main | `git fetch origin && git pull origin main` |
| List merged worktrees | `git gtr clean --merged -n` |
| Run command in worktree | `git gtr run <branch> <cmd>` |
| Remove worktree | `git gtr rm <branch> --yes` |
| Delete remote branch | `git push origin --delete <branch>` |
| Reset team (optional) | `TeamDelete` |

## Important Notes

- **Create team once**: Call `TeamCreate` once at the start of a conversation. One team is sufficient for all tasks.
- **Always pass `teamName` + `agentName`**: This registers the worker as a teammate
- **No watcher needed**: Messages are auto-delivered via Agent Teams
- **Bidirectional**: You can send messages to workers using `SendMessage`
- **Shutdown before cleanup**: Always send a shutdown request and wait for approval before removing worktrees
- Always use `planMode: true` when starting worker sessions
- Workers should create PRs, not push directly to main
- Review PRs and ask user before merging
- Clean up worktrees after merging to avoid clutter
- The orchestrator session stays on the main branch
- **Delegate research tasks too**—don't execute WebSearch or exploration yourself
- **Ambiguous but correct > Specific but wrong**; workers can investigate
- `TeamDelete` is optional—only needed if you want to create a new team in the same conversation
