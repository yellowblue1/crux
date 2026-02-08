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

## Prerequisites

1. **Main branch**: You must be on `main`. Worktrees cannot be created for the branch you are currently on.
2. **tmux**: The session must be running inside tmux.
3. **git-gtr**: Worktree management depends on `git gtr`.

If any prerequisite is not met, inform the user before proceeding.

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

Create a team before delegating any tasks.

```
TeamCreate({ team_name: "<repo-name>" })
```

This creates the team config at `~/.claude/teams/{name}/config.json` with your session as the team lead.

Use the repository name as the team name (e.g., `"crux"`). One team per conversation — do not create separate teams per task.

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

### When Delegation Fails

If `start_worktree_session` fails, report the error to the user and ask how to proceed. If the user asks you to work directly instead of delegating, you may do so.

## Phase 2: Communication

You can send messages to workers:
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

### Step 1: Shut Down the Worker

Send a shutdown request before removing the worktree:

```
SendMessage({
  type: "shutdown_request",
  recipient: "worker-auth",
  content: "Task complete, please shut down."
})
```

Wait for the `shutdown_approved` response. If no response, resend once. If still unresponsive, proceed to Step 2 — `git gtr rm` will terminate the worker process via the cleanup hook.

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

If removal fails with "has uncommitted changes", inspect and force-remove:

```bash
git gtr run <branch> git status   # Check what's left
git gtr rm <branch> --yes --force  # Safe after PR is merged/closed
```

Note: Always use `git gtr rm` instead of `git worktree remove`. The latter skips the cleanup hook and leaves orphaned tmux sessions.

### Step 3: Delete the Remote Branch

```bash
git push origin --delete <branch>
```

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

- Always use `planMode: true` when starting worker sessions
- When `planMode: true` is used with Agent Teams, the worker's plan requires **team lead approval** before implementation begins (via `plan_approval_request`/`plan_approval_response`)
- Workers should create PRs, not push directly to main
- Review PRs and ask user before merging
- **Delegate research tasks too**—don't execute WebSearch or exploration yourself
- **Ambiguous but correct > Specific but wrong**; workers can investigate
