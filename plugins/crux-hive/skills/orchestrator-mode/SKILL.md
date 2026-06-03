---
name: orchestrator-mode
description: >
  Orchestrate tasks by delegating to parallel Claude Code sessions via git worktrees.
  Activate with "start orchestrator mode", "delegate tasks to workers", "parallel claude code sessions",
  "git worktrees with teams", "orchestrate work", or "/orchestrator-mode".
allowed-tools: Bash, SendMessage, TeamCreate, TeamDelete, mcp__plugin_crux-hive_crux__start_worktree_session, mcp__plugin_crux-hive_crux__resume_team
version: 0.1.0
---

# Orchestrator Mode

Orchestrate ALL tasks — implementation, research, investigation, or any other work — by delegating them to separate Claude Code sessions running in git worktrees.

## Trigger

`/orchestrator-mode`

## Overview

The orchestrator delegates every task to workers. Each worker runs in an isolated git worktree as an Agent Teams teammate with built-in `SendMessage` for bidirectional communication. The orchestrator never executes tasks directly.

## Reference Files

Read these files for detailed procedural steps:

- `references/phases.md` — Full Phase 1–4 procedures with examples and parameter tables
- `references/quick-reference.md` — Quick reference table, delegation troubleshooting, and start_worktree_session examples

## Prerequisites

1. **Default branch**: Must be on the repository's default branch. Worktrees cannot be created for the branch currently checked out. Detect with: `git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'`
2. **tmux**: The session must be running inside tmux. Detect with: `tmux display-message -p '#S'` (returns session name if inside tmux, fails otherwise). Do not use `echo $TMUX` — Bash subshells may not inherit the environment variable.
3. **git-gtr**: Worktree management depends on `git gtr`.
4. **jq**: Required for reliable detection of Agent Teams configuration in settings files.
5. **Agent Teams**: The `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable must be set to `1`. Configure in any Claude settings file (`~/.claude/settings.json`, `~/.claude/settings.local.json`, `.claude/settings.json`, or `.claude/settings.local.json`) under `env`. Detect with:
   ```bash
   jq -r '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS // empty' ~/.claude/settings.json ~/.claude/settings.local.json .claude/settings.json .claude/settings.local.json 2>/dev/null | grep -q 1 && echo "enabled" || echo "not found"
   ```

Inform the user before proceeding if any prerequisite is not met.

## Custom Settings

After verifying prerequisites, check for orchestrator customization files:

1. Read `~/.crux/orchestrator.md` (global settings) if it exists
2. Read `.crux/orchestrator.md` (project-specific settings) if it exists
3. Merge: global first, then project-specific (project takes precedence on conflict)
4. Apply merged content as additional behavioral guidelines for this session

If neither file exists, proceed with default behavior.

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator Mode (this session)                           │
│                                                             │
│  1. TeamCreate → creates team (once per conversation)        │
│  2. Discuss task with user → start_worktree_session          │
│     (with teamName → worker joins as teammate)               │
│  3. Worker uses built-in SendMessage → auto-delivered         │
│  4. Review PR → Merge/Close → Cleanup                        │
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

## Prohibited Actions

The orchestrator MUST NOT perform work directly. The only job is to delegate to workers and coordinate their output. If tempted to investigate before delegating — delegate instead. Pass the ambiguity to the worker; an ambiguous but correctly scoped delegation is better than a detailed but self-executed analysis.

Exception: If `start_worktree_session` fails and the user explicitly instructs direct work, proceed directly. See `references/phases.md` "When Delegation Fails".

1. **NEVER use `EnterPlanMode`** — The orchestrator does not plan; it delegates. To clarify requirements, ask the user directly.
2. **NEVER launch `Agent` subagents** (`Explore`, `Plan`, `general-purpose`, etc.) — Workers handle all investigation, research, and planning.
3. **NEVER use `WebSearch` or `WebFetch`** — Delegate research tasks to a worker.
4. **NEVER use `Read`, `Grep`, `Glob` for codebase investigation** — Exception: single-file lookups for writing the worker prompt (e.g., verifying a file path exists or reading a GitHub issue body). Do not read multiple files or analyze code.

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

This creates the team config at `~/.claude/teams/{name}/config.json` with the current session as team lead.

Use the repository name as the team name (e.g., `"crux"`). One team per conversation — do not create separate teams per task.

## Phase 1: Task Delegation (Summary)

When the user describes what to accomplish:

1. **Update default branch** before creating any worktree: `git fetch origin && git pull origin <default-branch>`
2. **Delegate immediately** once the theme/topic is clear — do not wait for full planning
3. **One task per worker** — each task gets its own worktree and PR; do not add unrelated work to a running worker
4. **Never assume specifics when unsure** — keep ambiguity intact or ask briefly
5. **Include what is known** in the handoff prompt; workers handle the rest
6. **Hand off with a complete prompt** containing: Objective, Context, Findings, Relevant files, Decisions made, Expected output

Delegate **any task** where the theme is identifiable: implementation, research, investigation, documentation.

**Key principle**: If the theme is identifiable, delegate it. Do not execute it directly.

See `references/phases.md` for full Phase 1 details including the parameter table, examples, and "When Delegation Fails".

## Phase 2: Communication (Summary)

Send messages to workers via `SendMessage`:

```
SendMessage({
  type: "message",
  recipient: "worker-auth",
  content: "Please also add rate limiting to the login endpoint",
  summary: "Add rate limiting request"
})
```

## Phase 3–4: PR Review, Merge, and Cleanup (Summary)

When notified that a PR is ready:

1. List and review the PR (`gh pr list`, `gh pr view <n>`, `gh pr diff <n>`)
2. Perform lightweight review — check summary, verify objective, look for obvious issues
3. **ALWAYS ask the user for confirmation before merging** — never merge automatically
4. Merge after user approval: `gh pr merge <n> --squash` (no `--delete-branch`)
5. Update default branch: `git fetch origin && git pull origin <default-branch>`
6. Cleanup: `git gtr rm <branch> --yes` then `git push origin --delete <branch>`

See `references/phases.md` for full Phase 3–4 procedures and `references/quick-reference.md` for the command table.

## Recovery: Resume a Team After a Restart

When the machine/instance restarts, every Claude Code session dies. To bring a
team back without resuming each worker by hand:

1. Start a single team-lead session on the default branch, inside tmux, by
   **resuming the previous lead session**: `claude --resume <leadSessionId>`
   (find it in `~/.claude/teams/<repo-name>/config.json`). Resuming keeps the
   lead's session id, so the workers' `--parent-session-id` stays valid and
   messages route to this session. Do NOT start a fresh lead session before
   calling `resume_team` — workers would re-attach to the dead lead and routing
   would silently break until the next prompt triggers the refresh hook.
2. Call `resume_team` with the same team name:

   ```
   resume_team({ teamName: "<repo-name>" })
   ```

   Each worker is relaunched in its tmux window with its conversation history
   intact (`claude --resume <sessionId>`) and re-attached to the team.

The tool reports a breakdown of `resumed` / `skipped` / `failed` workers:

- **skipped — `already-running`**: the worker's window is already alive. Safe;
  `resume_team` is idempotent and can be re-run.
- **skipped — `no-session-id`**: the worker predates session-id recording.
  Cannot restore history; relaunch it fresh with `start_worktree_session` if
  still needed.
- **skipped — `worktree-missing` / `no-transcript`**: the worktree directory or
  the transcript is gone. The worker cannot be resumed; decide whether to
  recreate the work.
- **failed**: the relaunch errored (e.g. tmux issue). Inspect the error and
  retry.

The lead's own session id is reconciled automatically on the next prompt by the
`refresh-lead-session-id` hook, so workers route messages to this session.

## Important Notes

- Always use `planMode: true` when starting worker sessions
- When `planMode: true` is used with Agent Teams, the worker's plan requires **team lead approval** before implementation begins (via `plan_approval_request`/`plan_approval_response`)
- Workers should create PRs, not push directly to the default branch
- Review PRs and ask user before merging
- **Delegate research tasks too** — do not execute WebSearch or exploration directly
- **Ambiguous but correct > Specific but wrong**; workers can investigate
