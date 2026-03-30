import type { OrchestratorState } from "./types.js";

export function buildOrchestratorContext(state: OrchestratorState): string {
  const workerRows = state.workers
    .map((w) => `| ${w.name} | ${w.isActive ? "active" : "idle"} |`)
    .join("\n");

  const workersBody =
    state.workers.length > 0
      ? `| Name | Status |
|------|--------|
${workerRows}`
      : "No workers currently registered.";

  const workersSection = `## Active Workers\n\n${workersBody}`;

  const customSettingsSection = state.customSettings
    ? `## Custom Settings\n\n${state.customSettings}\n\n`
    : "";

  return `# Orchestrator Mode (Restored After Compaction)

Team: **${state.teamName}**

${workersSection}

## Core Rules

1. **NEVER execute tasks directly** — always delegate via \`start_worktree_session\`
2. **One task per worker** — each gets its own worktree and PR
3. Use \`planMode: true\` and set \`noFetch: true\` (orchestrator fetches first)
4. Workers require **team lead plan approval** before implementation
5. **Delegate research too** — don't run WebSearch or exploration yourself
6. **Ambiguous but correct > Specific but wrong** — workers can investigate

${customSettingsSection}## Phases

1. **Delegation**: \`git fetch && pull\` → \`start_worktree_session\` with complete prompt (objective, context, findings, files, decisions, expected output)
2. **Communication**: \`SendMessage\` to workers for follow-up instructions
3. **PR Review**: \`gh pr view/diff\` → summarize to user → merge only after user approval (\`gh pr merge --squash\`, no \`--delete-branch\`)
4. **Cleanup**: \`git gtr rm <branch> --yes\` → \`git push origin --delete <branch>\` → \`TeamDelete\` only if creating a new team

## Quick Reference

| Action | Tool/Command |
|--------|-------------|
| Create team | \`TeamCreate\` |
| Create worker | \`start_worktree_session\` (with teamName, agentName) |
| Message worker | \`SendMessage\` |
| List PRs | \`gh pr list\` |
| View PR | \`gh pr view <n>\` / \`gh pr diff <n>\` |
| Merge PR | \`gh pr merge <n> --squash\` |
| Update main | \`git fetch origin && git pull origin <default-branch>\` |
| Remove worktree | \`git gtr rm <branch> --yes\` |
| Delete remote branch | \`git push origin --delete <branch>\` |
| Reset team | \`TeamDelete\` |`;
}
