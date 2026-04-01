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

### Continue vs. Spawn Decision

When a follow-up task relates to a running worker, decide whether to continue or spawn fresh:

| Situation | Action | Reason |
|-----------|--------|--------|
| High context overlap | `SendMessage` to existing worker | Worker already has the codebase context and findings |
| Low context overlap | Spawn a fresh worker | Clean slate avoids confusion from unrelated prior work |
| Verification task | Always spawn fresh | Verifier must not share assumptions with the implementer |

**Examples:**
- Worker implemented auth → you need rate limiting on the same endpoints → **continue** (high overlap)
- Worker implemented auth → you need a CI pipeline change → **spawn fresh** (low overlap)
- Worker implemented a feature → you need to verify it works → **spawn fresh** (verification)

### Worker Prompt Quality Rules

Worker prompts must be **self-contained and precise**. A worker has no access to the orchestrator's conversation history.

**Do:**
- Include file paths, line numbers, and error messages when known
- State what "done" looks like (e.g., "PR with passing tests", "research summary sent via SendMessage")
- Require the worker to self-verify before reporting (e.g., "run tests before creating the PR")
- Provide concrete context: "The function `parseConfig` at `src/config.ts:42` throws when the input is empty"

**Never:**
- "Based on your findings, fix the bug" — the worker has no findings yet
- "Fix the bug we discussed" — the worker was not part of the discussion
- "Implement what's needed" — too vague to act on
- Any reference to prior conversation context the worker cannot see

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

## Synthesis Phase

For multi-step workflows (e.g., research then implement), the orchestrator synthesizes worker findings before crafting the next delegation prompt.

### When to Use

Use the synthesis pattern when a worker's output informs the next task. Common scenarios:
- **Research → Implementation**: Worker investigates a bug and reports findings; orchestrator reads findings, then delegates a precise fix to the same or a different worker.
- **Analysis → Action**: Worker audits dependencies and reports risks; orchestrator crafts targeted upgrade tasks from the report.
- **Prototype → Production**: Worker creates a proof-of-concept; orchestrator evaluates it and delegates the production implementation.

### How It Works

```
1. Delegate research/investigation task → Worker A
2. Worker A reports findings via SendMessage
3. Orchestrator reads and synthesizes findings
4. Orchestrator crafts a precise implementation prompt using the synthesized knowledge
5. Delegate implementation task → Worker A (continue) or Worker B (spawn fresh)
```

### Synthesis Guidelines

- **Read the full worker report** before crafting the next prompt — do not forward raw findings
- **Distill to actionable specifics**: file paths, root causes, recommended approaches
- **Add orchestrator-level decisions**: which approach to take, what to prioritize, what to skip
- **Apply the Worker Prompt Quality Rules** — the implementation prompt must be self-contained

### Example

Worker A reports: "Found 3 places where auth tokens are stored insecurely: `src/auth.ts:15`, `src/session.ts:42`, `src/api/middleware.ts:8`. The root cause is using localStorage instead of httpOnly cookies."

Orchestrator synthesizes and delegates: "Objective: Replace localStorage token storage with httpOnly cookies in `src/auth.ts:15`, `src/session.ts:42`, and `src/api/middleware.ts:8`. The root cause is that tokens are stored in localStorage, making them vulnerable to XSS. Replace with httpOnly cookie storage using the existing `setCookie` utility in `src/utils/cookies.ts`. Run existing auth tests after changes."

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

### Task Completion Notification Format

When workers report completion, the orchestrator should expect (and can request) a structured notification for tracking:

```
Task: <task description>
Status: completed | failed | blocked
PR: <URL or "N/A">
Files changed: <count>
Tests: passed | failed | skipped
Summary: <1-2 sentence description of what was done>
```

This format enables the orchestrator to quickly assess status and report to the user without reading PR diffs for routine completions.

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

## Circuit Breaker Pattern

When repeated failures occur, halt and escalate rather than retrying indefinitely.

**Rule**: 3 consecutive failures of the same operation → stop and report to the user.

**Applicable to:**

| Operation | Example failures |
|-----------|-----------------|
| Worker creation | `start_worktree_session` fails repeatedly (e.g., git conflicts, tmux issues) |
| Git operations | `git fetch`, `git pull`, or `git push` fail (e.g., network, auth) |
| PR operations | `gh pr create` or `gh pr merge` fail (e.g., CI blocks, permission issues) |

**Behavior:**
1. First failure: retry once after addressing the obvious cause
2. Second failure: try an alternative approach if available
3. Third failure: **halt** — report the pattern to the user and ask how to proceed

Do not continue retrying in a loop. Persistent failures indicate a systemic issue that requires user intervention.

## Scratchpad (Future Consideration)

> **Note**: This section documents a design pattern for future implementation. No tooling exists for this yet.

In complex multi-worker workflows, workers may need to share intermediate findings without going through the orchestrator. A **shared scratchpad directory** could enable this:

**Concept:**
- A designated directory (e.g., `.crux/scratch/`) where workers write intermediate findings
- Workers read from the scratchpad to build on each other's work
- The orchestrator can reference scratchpad contents when crafting prompts
- Scratchpad files are ephemeral — cleaned up after the session

**Use cases:**
- Worker A discovers API response schemas → writes to scratchpad → Worker B reads them when implementing the client
- Worker A maps out a dependency graph → writes to scratchpad → Worker B uses it to plan refactoring order

**Why not implement now:** The current `SendMessage`-based flow handles most coordination needs. The scratchpad pattern is most valuable when 3+ workers collaborate on tightly coupled tasks, which is uncommon in current usage.
