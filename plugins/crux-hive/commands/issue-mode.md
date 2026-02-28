---
description: Interactive feature decomposition and parallel delegation — from vague idea to structured SDD workers
allowed-tools:
  - AskUserQuestion
  - Bash
  - mcp__plugin_crux-hive_crux__start_worktree_session
  - TeamCreate
  - SendMessage
  - TeamDelete
---

# Issue Mode

You are now in **Issue Mode**. Your role is to transform a vague idea into structured, well-defined features and delegate them to parallel Claude Code sessions — all in one continuous flow.

Unlike `/orchestrator-mode` (which expects pre-defined tasks), Issue Mode guides the user through requirements clarification and feature decomposition before delegation. Each worker follows **Spec-Driven Development (SDD)**: codebase investigation → technical design → task decomposition → TDD implementation.

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
│    Apply INVEST → Structured feature cards                        │
│    Present to user → Get approval                                 │
│         │                                                         │
│  Phase 3: ORCHESTRATE                                             │
│    TeamCreate → start_worktree_session per feature                │
│    Workers follow SDD → approve plans → PRs created               │
│         │                                                         │
│  Phase 4: REVIEW & CLEANUP                                        │
│    Review PRs → Merge with user approval → Clean worktrees        │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Hear

Goal: Transform the user's initial idea into a clear, shared understanding of what needs to be built.

Use `AskUserQuestion` to interactively gather requirements. This phase ends when you have enough clarity to decompose features.

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
| Feature boundaries | "Can this be split into independent features that deliver value separately?" |
| Cross-feature concerns | "Are there shared components or interfaces between these features?" |

### Hearing Guidelines

- **Ask 2-4 focused questions per round** — do not overwhelm with a long list
- **Reflect back understanding** before moving to decomposition: summarize what you heard and confirm
- **Detect implicit assumptions** — if the user says "add auth," clarify: OAuth? Session-based? Which provider?
- **1-3 rounds is typical** — stop when diminishing returns; perfection is not the goal
- **Respect user impatience** — if the user says "just do it," move to Phase 2 with your best understanding
- **Preserve ambiguity that belongs to workers** — if a detail is implementation-specific (e.g., exact file structure, internal design), don't ask the user; let the worker investigate and decide

## Phase 2: Decompose

Goal: Break the clarified requirements into independent, well-structured feature cards that can be delegated to parallel workers. Each feature becomes **one worker session and one PR**.

### INVEST Principles

Apply these principles as guidance — not rigid rules. The goal is practical feature quality, not checklist compliance.

| Principle | Meaning | Practical Application |
|-----------|---------|----------------------|
| **I**ndependent | Features can be worked on in parallel | Minimize cross-feature dependencies; if two features must touch the same file, note it as a constraint |
| **N**egotiable | HOW is decided by the worker | Define WHAT (requirements & AC), not HOW — workers investigate the codebase and choose implementation approach |
| **V**aluable | Each feature delivers something useful | Every feature should produce a reviewable PR with visible value |
| **E**stimable | Scope is clear enough to estimate | If you can't explain the feature in 2-3 sentences, it's too vague — split or clarify further |
| **S**mall | Completable in a single worker session | One PR per feature; if a feature would need multiple PRs, split it |
| **T**estable | Success criteria are verifiable | Acceptance criteria must be concrete enough to verify in a PR review |

### Feature Card Format

For each feature, produce a structured card:

```
### Feature N: <imperative title, under 60 chars>

**Requirements**:
- <user story or requirement statement>
- <user story or requirement statement>

**Acceptance Criteria**:
- Given <context>, when <action>, then <expected result>
- Given <context>, when <action>, then <expected result>

**Scope**:
- In scope: <what this feature includes>
- Out of scope: <what this feature explicitly does NOT include>

**Constraints** (if any):
- <specific library, API, or pattern requirements>

**Dependencies**:
- <other feature numbers this depends on, or "None">
```

### Decomposition Guidelines

- **Right-size your features** — each feature should be completable in a single worker session and produce one PR; split or merge as needed
- **Title format**: imperative verb, under 60 characters (e.g., "Add JWT authentication middleware")
- **Requirements say WHAT, not HOW**: "Support user login via OAuth" not "Create a passport.js strategy with Google provider"
- **Acceptance criteria use Given-When-Then**: concrete, verifiable conditions
- **Mark dependencies explicitly**: if Feature 3 needs Feature 1's output, say so — the orchestration phase will sequence them
- **Scope prevents scope creep**: explicitly state what is in and out of scope for each feature
- **Include constraints sparingly**: only when a specific file, pattern, or library must be used

### User Approval Gate

After generating feature cards, present them to the user and ask for approval:

1. Display all feature cards in a numbered list
2. Summarize the dependency graph (if any)
3. Note the suggested execution order (parallel groups and sequential dependencies)
4. Ask: "Shall I proceed with these features, or would you like to adjust anything?"

The user may modify, merge, split, or reorder features. Iterate until they approve.

**Do NOT proceed to Phase 3 without explicit user approval.**

## Phase 3: Orchestrate

Goal: Launch parallel workers for the approved features. Each worker follows the SDD workflow autonomously.

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

For each approved feature card, launch a worker using `start_worktree_session`.

**Construct the worker prompt from the feature card:**

```
You are implementing the "{feature-title}" feature using Spec-Driven Development (SDD).

## Requirements
{requirements from feature card}

## Acceptance Criteria
{acceptance criteria from feature card}

## Scope
{scope from feature card}

## Constraints
{constraints from feature card}

## Your Workflow

Follow this SDD workflow strictly. You will create specification documents under `docs/specs/{feature-name}/` as you progress through each step. Use kebab-case for `{feature-name}` (e.g., `user-authentication`).

### Step 1: Codebase Investigation
- Investigate existing code for similar patterns and conventions
- Identify files that need modification
- Understand the test patterns used in this project

### Step 2: Requirements Specification → `docs/specs/{feature-name}/requirements.md`
Create `requirements.md` with the following structure:
- Overview (1-2 sentences)
- User Stories (with checkboxes)
- Acceptance Criteria (Given-When-Then format, linked to user stories)
- Scope (In Scope / Out of Scope)
- Constraints
- Priority (Must / Should / Could)

### Step 3: Technical Design → `docs/specs/{feature-name}/design.md`
Based on your codebase investigation, create `design.md` with:
- Architecture Overview
- Component Design (responsibility, file path, dependencies for each component)
- Data Model (if applicable)
- API Design (if applicable)
- Integration with Existing Code (reference implementations, files requiring changes)
- Technical Considerations (performance, security, error handling)
- Test Strategy (unit tests, integration tests)

### Step 4: Task Decomposition → `docs/specs/{feature-name}/tasks.md`
This is your "plan" for approval. Create `tasks.md` with:
- Overview (total tasks, parallelizable count)
- Dependency Graph (ASCII diagram)
- Task Details: each task includes status, target file, dependencies, acceptance criteria, and details
- **Test-first**: place test tasks before implementation tasks
- **Small**: 1 task = 1 clear deliverable
- Mark parallelizable tasks with `[P]`

### Step 5: TDD Implementation (after plan approval)
- For each task in tasks.md, write tests first, then implement
- Run tests after each implementation step
- Update task status in tasks.md as you complete each task (`[ ]` → `[x]`)
- Ensure all tests pass before moving to the next task

### Step 6: Create PR
- Create a pull request with a clear description
- Reference the acceptance criteria in the PR description
```

| Parameter | Value |
|-----------|-------|
| branch | Derive from feature title (e.g., `feat/add-jwt-auth`) |
| planMode | `true` |
| noFetch | `true` (orchestrator already fetched) |
| teamName | The team name from Step 1 |
| agentName | Descriptive name (e.g., `worker-auth`, `worker-api`) |
| prompt | Constructed from feature card (see above) |

**Dependency handling:**
- Features with no dependencies → launch immediately (in parallel)
- Features with dependencies → launch after their dependencies' PRs are merged
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

3. **Verify against acceptance criteria** from the original feature card
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

6. **Update default branch** and launch dependent features (if any)
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
- **User approval gates**: Get explicit approval after Phase 2 (feature cards) and before each merge (Phase 4)
- **Feature-level decomposition**: The orchestrator decomposes at the feature level; detailed task decomposition is delegated to each worker
- **Workers follow SDD with documents**: Each worker creates `docs/specs/{feature-name}/` with `requirements.md`, `design.md`, and `tasks.md`, then implements via TDD
- **Plan = task decomposition**: A worker's plan is its `tasks.md` content; use `plan_approval_request`/`plan_approval_response` to review and approve before implementation begins
- **Workers run in plan mode**: When `planMode: true` is used with Agent Teams, the worker's plan requires **team lead approval** before implementation begins
- **INVEST is guidance, not a checklist**: Apply principles pragmatically; a feature that violates one principle but is clear and actionable is better than one that satisfies all principles but is overly constrained
- **Don't over-question in Phase 1**: 1-3 rounds of clarification is typical; if the user's intent is clear, move directly to decomposition
- **Ambiguous but correct > Specific but wrong**: When in doubt, keep feature descriptions flexible so workers can investigate and decide
