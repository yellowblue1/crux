---
description: Interactive task decomposition and parallel delegation — from vague idea to structured workers
allowed-tools:
  - AskUserQuestion
  - Bash
  - mcp__plugin_crux-hive_crux__start_worktree_session
  - TeamCreate
  - SendMessage
  - TeamDelete
---

# Issue Mode

You are now in **Issue Mode**. Your role is to transform a vague idea into structured, well-defined tasks and delegate them to parallel Claude Code sessions — all in one continuous flow.

Unlike `/orchestrator-mode` (which expects pre-defined tasks), Issue Mode guides the user through requirements clarification and task decomposition before delegation.

## Prerequisites

1. **Default branch**: You must be on your repository's default branch. Worktrees cannot be created for the branch you are currently on. Detect it with: `git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'`
2. **tmux**: The session must be running inside tmux.
3. **git-gtr**: Worktree management depends on `git gtr`.
4. **Agent Teams**: The `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable must be set to `1`. This can be configured in `~/.claude/settings.json` under `env`. Detect with: `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`

If any prerequisite is not met, inform the user before proceeding.

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Issue Mode (this session)                                       │
│                                                                   │
│  Phase 1: HEAR                                                    │
│    AskUserQuestion → Clarify scope, goals, non-goals              │
│         │                                                         │
│  Phase 2: DECOMPOSE                                               │
│    Apply INVEST → Structured task cards                           │
│    Present to user → Get approval                                 │
│         │                                                         │
│  Phase 3: ORCHESTRATE                                             │
│    TeamCreate → start_worktree_session per task                   │
│    Workers run in plan mode → approve plans → PRs created         │
│         │                                                         │
│  Phase 4: REVIEW & CLEANUP                                        │
│    Review PRs → Merge with user approval → Clean worktrees        │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Hear

Goal: Transform the user's initial idea into a clear, shared understanding of what needs to be built.

Use `AskUserQuestion` to interactively gather requirements. This phase ends when you have enough clarity to decompose tasks.

### What to Clarify

| Category | Example Questions |
|----------|-------------------|
| Scope boundaries | "Should X include Y, or is that separate?" |
| Ambiguous terms | "When you say 'fast', do you mean < 100ms response time or something else?" |
| Non-goals | "Just to confirm — you do NOT want Z in this round?" |
| Priority order | "If we can only finish two of these, which two matter most?" |
| Acceptance criteria | "How would you verify this is working correctly?" |
| Technical constraints | "Are there specific libraries, patterns, or APIs you want to use (or avoid)?" |
| Dependencies | "Does any part of this need to be done before another part can start?" |

### Hearing Guidelines

- **Ask 2-4 focused questions per round** — do not overwhelm with a long list
- **Reflect back understanding** before moving to decomposition: summarize what you heard and confirm
- **Detect implicit assumptions** — if the user says "add auth," clarify: OAuth? Session-based? Which provider?
- **1-3 rounds is typical** — stop when diminishing returns; perfection is not the goal
- **Respect user impatience** — if the user says "just do it," move to Phase 2 with your best understanding
- **Preserve ambiguity that belongs to workers** — if a detail is implementation-specific (e.g., exact file structure), don't ask the user; let the worker decide

## Phase 2: Decompose

Goal: Break the clarified requirements into independent, well-structured task cards that can be delegated to parallel workers.

### INVEST Principles

Apply these principles as guidance — not rigid rules. The goal is practical task quality, not checklist compliance.

| Principle | Meaning | Practical Application |
|-----------|---------|----------------------|
| **I**ndependent | Tasks can be worked on in parallel | Minimize cross-task dependencies; if two tasks must touch the same file, note it as a constraint |
| **N**egotiable | Details can flex during implementation | Define WHAT, not HOW — workers choose implementation approach |
| **V**aluable | Each task delivers something useful | Every task should produce a reviewable PR with visible value |
| **E**stimable | Scope is clear enough to estimate | If you can't explain the task in 2-3 sentences, it's too vague — split or clarify further |
| **S**mall | Completable in a single worker session | One PR per task; if a task would need multiple PRs, split it |
| **T**estable | Success criteria are verifiable | Acceptance criteria must be concrete enough to verify in a PR review |

### Task Card Format

For each task, produce a structured card:

```
### Task N: <imperative title, under 60 chars>

**Objective**: <1-2 sentences — WHAT this task accomplishes, not HOW>

**Acceptance Criteria**:
- Given <context>, when <action>, then <expected result>
- Given <context>, when <action>, then <expected result>

**Technical Constraints** (if any):
- <specific library, API, or pattern requirements>
- <files that must/must not be modified>

**Non-goals**:
- <what this task explicitly does NOT include>

**Dependencies**:
- <other task numbers this depends on, or "None">
```

### Decomposition Guidelines

- **3-7 tasks is the sweet spot** — fewer than 3 suggests the idea may not need issue-mode; more than 7 means you should consider grouping related work
- **Title format**: imperative verb, under 60 characters (e.g., "Add JWT authentication middleware")
- **Objective says WHAT, not HOW**: "Support user login via OAuth" not "Create a passport.js strategy with Google provider"
- **Acceptance criteria use Given-When-Then**: concrete, verifiable conditions
- **Mark dependencies explicitly**: if Task 3 needs Task 1's output, say so — the orchestration phase will sequence them
- **Non-goals prevent scope creep**: explicitly state what each task does NOT include
- **Include technical constraints sparingly**: only when a specific file, pattern, or library must be used

### User Approval Gate

After generating task cards, present them to the user and ask for approval:

1. Display all task cards in a numbered list
2. Summarize the dependency graph (if any)
3. Note the suggested execution order (parallel groups and sequential dependencies)
4. Ask: "Shall I proceed with these tasks, or would you like to adjust anything?"

The user may modify, merge, split, or reorder tasks. Iterate until they approve.

**Do NOT proceed to Phase 3 without explicit user approval.**

## Phase 3: Orchestrate

Goal: Launch parallel workers for the approved tasks.

### Step 1: Create Team

```
TeamCreate({ team_name: "<repo-name>" })
```

One team per conversation. Use the repository name as the team name.

### Step 2: Update Default Branch

```bash
git fetch origin && git pull origin <default-branch>
```

### Step 3: Launch Workers

For each approved task card, launch a worker using `start_worktree_session`.

**Construct the worker prompt from the task card:**

```
Objective: <task objective>

Acceptance Criteria:
<acceptance criteria from task card>

Technical Constraints:
<constraints from task card>

Non-goals:
<non-goals from task card>

Context:
<any additional context from the hearing phase relevant to this task>
```

| Parameter | Value |
|-----------|-------|
| branch | Derive from task title (e.g., `feat/add-jwt-auth`) |
| planMode | `true` |
| noFetch | `true` (orchestrator already fetched) |
| teamName | The team name from Step 1 |
| agentName | Descriptive name (e.g., `worker-auth`, `worker-api`) |
| prompt | Constructed from task card (see above) |

**Dependency handling:**
- Tasks with no dependencies → launch immediately (in parallel)
- Tasks with dependencies → launch after their dependencies' PRs are merged
- Inform the user about the sequencing plan before launching

### When a Worker Fails to Launch

If `start_worktree_session` fails, report the error to the user and ask how to proceed. Do not retry automatically.

### Communication

Send messages to workers as needed:

```
SendMessage({
  type: "message",
  recipient: "worker-auth",
  content: "Additional context: ...",
  summary: "Providing extra context"
})
```

## Phase 4: Review & Cleanup

### PR Review

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

3. **Verify against acceptance criteria** from the original task card
   - Check each Given-When-Then criterion
   - Note any criteria that were not met

4. **Report findings and ASK the user**
   - Summarize the PR changes
   - Report acceptance criteria status (met / not met)
   - **ALWAYS ask the user for confirmation before merging**

5. **Merge only after user approval**
   ```bash
   gh pr merge <number> --squash
   ```
   Note: Do NOT use `--delete-branch` here. The worktree still references the branch.

6. **Update default branch** and launch dependent tasks (if any)
   ```bash
   git fetch origin && git pull origin <default-branch>
   ```

### Cleanup

**After merging a PR:**

```bash
git gtr clean --merged -n
git gtr rm <branch> --yes
```

**After closing a PR (no merge):**

```bash
git gtr rm <branch> --yes
```

If removal fails with "has uncommitted changes":

```bash
git gtr run <branch> git status
git gtr rm <branch> --yes --force
```

**Delete remote branch:**

```bash
git push origin --delete <branch>
```

### About TeamDelete

`TeamDelete` only removes lightweight files (`~/.claude/teams/` and `~/.claude/tasks/`). It does **not** clean up actual resources — worktrees, tmux sessions, and branches are cleaned up individually in the steps above.

Workers are automatically deregistered from the team config when their worktrees are removed (via the cleanup hook), so `TeamDelete` should succeed without manual intervention.

Use `TeamDelete` only when you need to create a **new team** in the same conversation.

## Quick Reference

| Action | Tool / Command |
|--------|----------------|
| Clarify requirements | `AskUserQuestion` |
| Create team | `TeamCreate` |
| Create worktree + worker | `mcp__plugin_crux-hive_crux__start_worktree_session` |
| Send message to worker | `SendMessage` |
| List PRs | `gh pr list` |
| View PR | `gh pr view <number>` |
| Merge PR | `gh pr merge <number> --squash` |
| Update default branch | `git fetch origin && git pull origin <default-branch>` |
| List merged worktrees | `git gtr clean --merged -n` |
| Run command in worktree | `git gtr run <branch> <cmd>` |
| Remove worktree | `git gtr rm <branch> --yes` |
| Delete remote branch | `git push origin --delete <branch>` |
| Reset team (optional) | `TeamDelete` |

## Important Notes

- **One continuous flow**: Phases 1-4 happen in a single conversation — do not ask the user to restart or switch modes between phases
- **User approval gates**: Get explicit approval after Phase 2 (task cards) and before each merge (Phase 4)
- **Workers run in plan mode**: When `planMode: true` is used with Agent Teams, the worker's plan requires **team lead approval** before implementation begins (via `plan_approval_request`/`plan_approval_response`)
- **INVEST is guidance, not a checklist**: Apply principles pragmatically; a task that violates one principle but is clear and actionable is better than one that satisfies all principles but is overly constrained
- **Don't over-question in Phase 1**: 1-3 rounds of clarification is typical; if the user's intent is clear, move directly to decomposition
- **Delegate research too**: If a task requires codebase exploration or documentation lookup, delegate it as a worker task — don't do it yourself
- **Ambiguous but correct > Specific but wrong**: When in doubt, keep task descriptions flexible so workers can investigate and decide
