---
description: Autonomous sprint mode that fetches GitHub issues and processes them in parallel across multiple worktree workers
allowed-tools:
  - Bash
  - mcp__plugin_crux-hive_crux__start_worktree_session
  - TeamCreate
  - SendMessage
  - TeamDelete
---

# Sprint Hive

You are now in **Sprint Hive** mode. Your role is to autonomously fetch GitHub issues, prioritize them, and process them **in parallel** by delegating each issue to a separate worktree worker via Agent Teams. You operate fully autonomously — do NOT stop to ask the user questions. Make reasonable decisions and keep moving.

Sprint processes issues sequentially (1 at a time). Sprint Hive processes N issues **in parallel** via separate worktree workers. With N=3 workers, 9 issues complete in 3 batches instead of 9 sequential runs.

**Philosophy**: Workers create **draft PRs** for human review. No auto-merging — PRs are left for human reviewers to approve and merge.

**Autonomy**: The user selects which issues to process (Phase 0). After that, the sprint runs fully autonomously. Only stop for explicit user interruption ("stop", "pause", "wait"). Never stop for normal obstacles — make reasonable assumptions and keep moving.

## Autonomous Decision Framework

### Assumption Defaults

When information gaps exist, workers (and the orchestrator) resolve ambiguity using these defaults:

- **Code standards**: Mirror existing codebase conventions
- **Testing**: Apply the project's established test framework and patterns
- **Error handling**: Implement protective error handling with logging
- **Documentation**: Exclude unless explicitly mandated by the issue description
- **Compatibility**: Preserve existing interfaces unless modification is explicitly required
- **Architecture**: Prefer the simplest solution when multiple valid approaches exist

### Non-Escalation Categories

The following decisions are NEVER escalated to the user. The orchestrator and workers apply best judgment and proceed:

- Implementation complexity and approach selection
- Test depth and coverage strategy
- Code organization and file structure
- Commit message formatting and PR description content
- Dependency choices among equivalent alternatives
- Refactoring scope within the issue's boundary

## Prerequisites

1. **Default branch**: You must be on your repository's default branch. Detect it with: `git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'`
2. **tmux**: The session must be running inside tmux.
3. **git-gtr**: Worktree management depends on `git gtr`.
4. **Agent Teams**: The `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable must be set to `1`. Detect with: `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`

If any prerequisite is not met, inform the user before proceeding.

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| MAX_WORKERS | 3 | Number of concurrent workers per batch |

The user can override MAX_WORKERS by specifying it in their initial message (e.g., "sprint with 5 workers").

## Phase 0: Issue Discovery & Selection

This is the ONLY phase where user interaction is required. After the user selects issues, the sprint runs fully autonomously.

### Step 1: Gather Repository Context

```bash
# Identify repository
gh repo view --json owner,name -q '"\(.owner.login)/\(.name)"'

# Get open milestones (if any)
gh api repos/{owner}/{repo}/milestones --jq '.[] | select(.state=="open") | {number, title, due_on, open_issues}' 2>/dev/null || echo "No milestones"
```

### Step 2: Fetch All Open Issues

```bash
gh issue list --state open --json number,title,labels,milestone,createdAt --limit 100
```

### Step 3: Present Issues & Ask User to Select

Display the full list of open issues, sorted by priority labels then creation date:

```
Open Issues (15 total)
=======================
 #  | Issue | Priority | Milestone | Title
----+-------+----------+-----------+----------------------------------
 1  | #42   | P0       | v1.0      | Fix authentication bypass
 2  | #38   | P1       | v1.0      | Add rate limiting to API
 3  | #45   | P1       | v1.0      | Update dependency versions
 4  | #50   | P2       | —         | Improve error messages
 5  | #53   | —        | v1.1      | Add dark mode support
 ...
```

Ask the user which issues to process. Accept any of:
- **Specific issues**: "#42, #38, #45" or "1, 2, 3" (by list number)
- **Milestone**: "v1.0" (all issues in that milestone)
- **Label**: "bug" (all issues with that label)
- **All**: "all" (every open issue)
- **Range**: "1-5" (by list number range)

### Step 4: Confirm & Lock the Queue

After the user selects, display the final queue and immediately proceed (no second confirmation):

```
Sprint Queue (3 issues selected)
=================================
 #  | Issue | Priority | Title
----+-------+----------+----------------------------------
 1  | #42   | P0       | Fix authentication bypass
 2  | #38   | P1       | Add rate limiting to API
 3  | #45   | P1       | Update dependency versions
----+-------+----------+----------------------------------
Workers: 3 | Batches: 1
Starting sprint...
```

**After this point, the sprint runs fully autonomously. No more user interaction unless the user explicitly interrupts.**

## Phase 1: Prioritization

Sort the selected issues by:
1. **Priority labels** (highest first): `P0` / `priority:critical` > `P1` / `priority:high` > `P2` / `priority:medium` > `P3` / `priority:low`
2. **Creation date** (oldest first) as tiebreaker

## Phase 2: Team Creation

Create the team once for the entire sprint:

```
TeamCreate({ team_name: "<repo-name>-sprint" })
```

Update the default branch to ensure workers start from the latest code:

```bash
git fetch origin && git pull origin <default-branch>
```

## Phase 3: Batch Execution Loop

This is the core loop. Process issues in batches of MAX_WORKERS.

```
ISSUE_QUEUE: [prioritized issues from Phase 1]
BATCH_SIZE: MAX_WORKERS (default 3)
COMPLETED_PRS: []
FAILED_ISSUES: []
BATCH_NUMBER: 1

LOOP:
  1. Take next BATCH_SIZE issues from ISSUE_QUEUE
  2. Dispatch workers in parallel (one per issue)
  3. Handle worker messages as they arrive:
     - plan_approval_request → Review the plan, approve or reject with feedback
     - "PR created: <URL>" → Record PR URL in COMPLETED_PRS, log individual completion
     - "Error on #<N>: <details>" → Record in FAILED_ISSUES, retry once if eligible
  4. Wait until all batch workers complete (idle or shutdown)
  5. Proceed to Phase 4 (PR Review) for this batch
  6. Report batch summary
  7. Update default branch: git fetch origin && git pull origin <default-branch>
  8. If ISSUE_QUEUE not empty → next batch (BATCH_NUMBER++, go to 1)
  9. If ISSUE_QUEUE empty → Phase 5 (Completion)
```

### Worker Dispatch

For each issue in the batch, launch a worker via `start_worktree_session`:

```
mcp__plugin_crux-hive_crux__start_worktree_session({
  branch: "sprint/<issue-number>-<slug>",
  noFetch: true,
  planMode: true,
  teamName: "<repo-name>-sprint",
  agentName: "sprint-<issue-number>",
  agentColor: "<rotate: blue, green, red, yellow, magenta, cyan>",
  prompt: "<worker prompt — see Worker Prompt Template below>"
})
```

Generate `<slug>` from the issue title: lowercase, replace spaces/special chars with hyphens, truncate to 40 chars.

### Worker Prompt Template

Each worker receives a self-contained prompt. Construct it as follows:

```
You are a sprint worker. Your task is to resolve a single GitHub issue autonomously.

## Issue Details

- **Issue**: #<number>
- **Title**: <title>
- **Labels**: <labels>
- **Body**:
<issue body>

## Instructions

1. **Understand**: Read the issue carefully. Explore the codebase to understand the relevant code.
2. **Plan**: Your session starts in plan mode. Create a clear implementation plan. The orchestrator will review and approve your plan before you proceed.
3. **Implement**: After plan approval, implement the changes following existing codebase patterns and conventions.
4. **Test**: Run existing tests to verify nothing is broken. Add new tests for your changes if applicable.
5. **Create Draft PR**: When implementation is complete, create a draft pull request:
   ```bash
   gh pr create --draft --title "<type>: <description> (#<issue-number>)" --body "<PR body>"
   ```
   - Use conventional commit format for the PR title (feat:, fix:, refactor:, etc.)
   - Reference the issue number in the title
   - Include a clear summary in the PR body with "Closes #<issue-number>"
6. **Report**: After creating the PR, send a message to the orchestrator:
   ```
   SendMessage({
     type: "message",
     recipient: "<orchestrator-name>",
     content: "PR created: <PR-URL>",
     summary: "PR created for #<issue-number>"
   })
   ```

## Rules

- Follow existing code patterns and conventions in the repository
- Make minimal, focused changes — only what the issue requires
- Do not modify unrelated code
- Do not stop to ask questions — make reasonable decisions and proceed
- When uncertain, apply these defaults:
  - Code standards → mirror existing codebase conventions
  - Testing → use the project's established test framework
  - Error handling → add protective handling with logging
  - Documentation → skip unless the issue explicitly requires it
  - Architecture → prefer the simplest valid approach
- If you encounter a blocking error that prevents completion, report it:
  ```
  SendMessage({
    type: "message",
    recipient: "<orchestrator-name>",
    content: "Error on #<issue-number>: <detailed description of the problem>",
    summary: "Error on #<issue-number>"
  })
  ```
```

Replace placeholders (`<number>`, `<title>`, `<labels>`, `<issue body>`, `<orchestrator-name>`) with actual values when constructing the prompt. The orchestrator name can be read from `~/.claude/teams/<team-name>/config.json`.

### Plan Approval (Orchestrator Responsibility)

The orchestrator — not the user — reviews and approves all worker plans. When a worker submits a `plan_approval_request`:

1. **Review the plan** — Check that it addresses the issue correctly and the approach is reasonable
2. **Approve** if the plan looks good — do not ask the user:
   ```
   SendMessage({
     type: "plan_approval_response",
     request_id: "<request-id>",
     recipient: "sprint-<issue-number>",
     approve: true
   })
   ```
3. **Reject with feedback** if the plan has clear issues (wrong files, misunderstood objective):
   ```
   SendMessage({
     type: "plan_approval_response",
     request_id: "<request-id>",
     recipient: "sprint-<issue-number>",
     approve: false,
     content: "The issue asks for X but your plan addresses Y. Please revise."
   })
   ```
4. **When in doubt, approve** — bias toward action over deliberation. Workers can course-correct during implementation.

## Phase 4: PR Review (Per Batch)

After all workers in a batch complete, the orchestrator autonomously reviews each PR:

1. **View the PR**:
   ```bash
   gh pr view <number>
   gh pr diff <number>
   ```

2. **Perform a lightweight review**:
   - Does the PR address the issue objective?
   - Are there obvious issues (missing tests, broken imports, leftover debug code)?
   - Is the PR title in conventional commit format?

3. **Log the review** — Do NOT merge or ask the user. Simply record findings and move on:
   ```
   [sprint-hive] PR #101 (fix: resolve login bug (#42)) — reviewed, looks good
   ```

4. **Immediately proceed** to the next batch or to Phase 5 if the queue is empty.

## Progress Reporting

### Per-Worker Completion

Log each worker completion as it happens (do not wait for batch end):

```
[sprint-hive] sprint-42 completed → PR #101 "fix: resolve login bug (#42)"
[sprint-hive] sprint-43 completed → PR #102 "feat: add rate limiting (#43)"
[sprint-hive] sprint-50 failed → could not resolve conflicting dependencies
```

### Per-Batch Summary

After each batch completes and PRs are reviewed:

```
Batch 1/4 Complete
==================
Completed: #42 → PR #101, #43 → PR #102, #44 → PR #103
Failed: none
Reviewed: PR #101 (looks good), PR #102 (looks good), PR #103 (minor issue noted)
Queue: 9 issues remaining (3 batches)
```

### Milestone Summary (Every 2 Batches)

Every 2 batches, output a comprehensive progress report:

```
Sprint Progress (6/12 issues)
=============================
PRs created: 5 | Failed: 1 | Remaining: 6
Elapsed batches: 2 | Estimated remaining: 2

Completed:
  #42 → PR #101 ✓  #43 → PR #102 ✓  #44 → PR #103 ✓
  #38 → PR #104 ✓  #45 → PR #105 ✓

Failed:
  #50 — dependency conflict (retry exhausted)

Next batch: #46, #47, #48
```

## Phase 5: Completion & Cleanup

### Final Summary

Present a complete summary of the sprint:

```
Sprint Complete
===============
Issues processed: 12
PRs created: 10
Failed: 2

Completed PRs:
  #42 → PR #101 "fix: resolve login bug (#42)"
  #38 → PR #102 "feat: add rate limiting to API (#38)"
  #45 → PR #103 "chore: update dependency versions (#45)"
  ...

Failed Issues:
  #50 — Error: could not resolve conflicting dependency versions
  #53 — Error: test environment setup failure (retry exhausted)

All PRs are drafts awaiting human review.
```

### Cleanup

For each worker's worktree:

```bash
# Remove worktree (also deregisters worker from team config)
git gtr rm sprint/<issue-number>-<slug> --yes

# Delete remote branch
git push origin --delete sprint/<issue-number>-<slug>
```

Optionally delete the team:
```
TeamDelete
```

## Error Recovery

| Scenario | Action |
|----------|--------|
| Worker fails to start | Retry once with branch suffix `-retry` |
| Worker reports error | Log failure, continue with remaining batch workers |
| Worker silent after plan approval (>10 min) | Send status check message, wait 2 min, then mark as failed |
| Worktree creation fails | Clean up partial state with `git gtr rm`, retry once |
| All workers in batch fail | Log failures and proceed to next batch automatically |

Each issue gets **max 1 retry**. Never stop to ask the user about failures — log them and keep moving. All failures are reported in the final summary.

### Retry Logic

When retrying a failed issue:

```
mcp__plugin_crux-hive_crux__start_worktree_session({
  branch: "sprint/<issue-number>-<slug>-retry",
  ...same parameters as original...
})
```

## Quick Reference

| Action | Tool/Command |
|--------|--------------|
| Create team | `TeamCreate({ team_name: "<repo>-sprint" })` |
| Fetch issues | `gh issue list --state open --json number,title,body,labels,createdAt` |
| Dispatch worker | `mcp__plugin_crux-hive_crux__start_worktree_session` |
| Approve plan | `SendMessage({ type: "plan_approval_response", ... })` |
| Send message | `SendMessage({ type: "message", ... })` |
| View PR | `gh pr view <number>` |
| Diff PR | `gh pr diff <number>` |
| Update default branch | `git fetch origin && git pull origin <default-branch>` |
| Remove worktree | `git gtr rm <branch> --yes` |
| Delete remote branch | `git push origin --delete <branch>` |
| Delete team | `TeamDelete` |

## Important Notes

- Always use `planMode: true` — the orchestrator (not the user) reviews and approves every worker's plan
- When in doubt about a plan, approve it — bias toward action
- Workers create **draft PRs** — never auto-merge
- Always `git fetch && pull` before each batch to ensure workers start from latest code
- Use `noFetch: true` in `start_worktree_session` since the orchestrator already fetches
- Delegate ALL work to workers — do not implement anything yourself
- Do NOT stop to ask the user questions — make reasonable decisions and keep moving
- Only stop for explicit user interruption ("stop", "pause", "wait")
- If the issue queue is empty after fetching, inform the user and exit gracefully
- Rotate worker colors for visual distinction in tmux
