# Quick Reference

## Command Table

| Action | Tool/Command |
|--------|--------------|
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

## Start Worktree Session

### Parameter Table

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

### Examples

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

## When Delegation Fails

If `start_worktree_session` fails, report the error to the user and ask how to proceed. If the user asks to work directly instead of delegating, proceed directly.
