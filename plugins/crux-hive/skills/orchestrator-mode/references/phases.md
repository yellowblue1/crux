# Orchestrator Mode — Phase Details

Detailed procedures for each phase of the orchestrator workflow.

## Phase 1: Task Delegation

When the user describes what to accomplish:

1. **Update default branch** before creating any worktree to ensure workers start from the latest code:
   ```bash
   git fetch origin && git pull origin <default-branch>
   ```
2. **Delegate immediately** once the theme/topic is clear — do not wait for full planning
3. **One task per worker** — each task gets its own worktree and PR; do not add unrelated work to a running worker
4. **Never assume specifics when unsure** — keep ambiguity intact or ask briefly
5. **Include what is known** in the handoff prompt; workers handle the rest
6. **Hand off with a complete prompt** containing:
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

**Key principle**: If the theme is identifiable, delegate it. Do not execute it directly.

### Start Worktree Session (via MCP tool)

Use the `mcp__plugin_crux-hive_crux__start_worktree_session` tool:

| Parameter | Description |
|-----------|-------------|
| branch | Branch name (required) |
| planMode | true for plan mode (default: false) |
| prompt | Initial prompt for Claude Code |
| fromRef | Base branch to create from |
| noFetch | Skip git fetch in worktree creation — always use `true` since the orchestrator already fetches (default: false) |
| teamName | **Required** — The team name from TeamCreate |
| agentName | **Required** when teamName is set — Unique name for this worker |
| agentColor | Optional display color (e.g., 'blue', 'green', 'red') |
| model | Optional model override (e.g., 'sonnet', 'haiku') |

**Examples:**

```
# Standard task
mcp__plugin_crux-hive_crux__start_worktree_session({
  branch: "feat/add-auth",
  noFetch: true,
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
  noFetch: true,
  planMode: true,
  teamName: "my-project",
  agentName: "worker-metrics",
  agentColor: "green",
  prompt: "Objective: Add metrics collection..."
})
```

This creates a worktree, opens a new tmux window, and starts Claude Code as a teammate.

### When Delegation Fails

If `start_worktree_session` fails, report the error to the user and ask how to proceed. If the user asks to work directly instead of delegating, proceed directly.

## Phase 2: Communication

Send messages to workers via `SendMessage`:

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
   - Do NOT merge automatically — wait for explicit user approval

5. **Merge only after user approval**
   ```bash
   gh pr merge <number> --squash
   ```
   Note: Do NOT use `--delete-branch` here. The worktree still references the branch.

6. **Update default branch**
   ```bash
   git fetch origin && git pull origin <default-branch>
   ```

## Phase 4: Cleanup

### Step 1: Remove the Worktree

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

### Step 2: Delete the Remote Branch

```bash
git push origin --delete <branch>
```

### About TeamDelete

`TeamDelete` only removes lightweight files (`~/.claude/teams/` and `~/.claude/tasks/`). It does **not** clean up any actual resources — worktrees, tmux sessions, and branches are all cleaned up individually in the steps above.

Workers are automatically deregistered from the team config when their worktrees are removed (via the cleanup hook), so `TeamDelete` should succeed without manual intervention.

Use `TeamDelete` only when creating a **new team** in the same conversation (since `TeamCreate` requires no existing team). At the end of a conversation, leftover team files are harmless and will not affect future sessions.

### Reusing a Team Across Sessions

Claude Code's built-in `TeamCreate` is not idempotent: calling it with an existing team name silently skips and leaves the previous session's `leadSessionId` in place, which breaks inbound teammate -> lead auto-delivery in the new session.

crux-hive works around this with a `UserPromptSubmit` hook that detects the stale state and refreshes `leadSessionId` to the current session. The refresh only fires when no team already points at the current session AND exactly one team's lead cwd matches the current cwd — ambiguous cases are left untouched. No action is required from the orchestrator.

If the workaround does not trigger (e.g. different cwd, multiple candidate teams), fall back to `TeamDelete` followed by `TeamCreate` to reset state. Upstream tracking: anthropics/claude-code#45686 and #49642.
