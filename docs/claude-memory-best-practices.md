# Claude Code Memory Best Practices Guide

A comprehensive guide on managing Claude Code memory files based on official documentation and community best practices.

## Overview

Claude Code uses a hierarchical memory system to provide persistent context across sessions. Memory files are markdown documents that Claude automatically reads at session start, eliminating the need to repeat project context in every conversation.

## Memory Hierarchy

Claude Code's memory system has five levels, loaded in order of precedence (highest first):

### 1. Managed Policy (Organization-wide)

| Platform | Location |
|----------|----------|
| macOS | `/Library/Application Support/ClaudeCode/CLAUDE.md` |
| Linux | `/etc/claude-code/CLAUDE.md` |
| Windows | `C:\Program Files\ClaudeCode\CLAUDE.md` |

- **Purpose**: Company standards, security policies, compliance requirements
- **Shared with**: All users in organization
- **Managed by**: IT/DevOps via configuration management (MDM, Ansible, etc.)

### 2. Project Memory (CLAUDE.md)

- **Location**: `./CLAUDE.md` or `./.claude/CLAUDE.md`
- **Purpose**: Team-shared project instructions
- **Shared with**: Team via source control
- **Best practice**: Check into git for team collaboration

### 3. Project Rules (.claude/rules/)

- **Location**: `./.claude/rules/*.md`
- **Purpose**: Modular, topic-specific instructions
- **Supports**: Path filtering via YAML frontmatter
- **Discovery**: Recursive, including subdirectories

### 4. User Memory

- **Location**: `~/.claude/CLAUDE.md`
- **Purpose**: Personal preferences for all projects
- **Shared with**: Just you (all projects)

### 5. Project Local Memory

- **Location**: `./CLAUDE.local.md`
- **Purpose**: Personal project-specific preferences
- **Note**: Automatically added to .gitignore

## CLAUDE.md vs Rules: When to Use Each

### Use CLAUDE.md for Universal Content

- Project context and overview
- Essential commands (test, build, deploy)
- Architecture fundamentals
- Global policies (language, quality standards)
- Contributing guidelines

### Use Rules for Specialized Content

- Domain-specific patterns
- Path-scoped conventions (TypeScript, testing)
- File-type guidelines
- Technology-specific details

### Decision Matrix

| Content Type | Location | Reason |
|--------------|----------|--------|
| "All code must be in English" | CLAUDE.md | Universal policy |
| "TypeScript error handling patterns" | rules/typescript.md | Path-scoped |
| "How to run tests" | CLAUDE.md | Universal command |
| "Test file naming conventions" | rules/testing.md | Path-scoped |
| "Project architecture overview" | CLAUDE.md | Universal context |
| "API endpoint patterns" | rules/api.md | Path-scoped |

## Key Principles

### 1. The Relevance Filter

Claude Code injects this system reminder with every CLAUDE.md:

> "IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task."

**Implications**:
- Irrelevant content gets IGNORED
- Keep CLAUDE.md focused on universally-applicable content
- Use path-scoped rules for specialized content

### 2. Guidance Over Information

| Approach | Example |
|----------|---------|
| **Guidance** (preferred) | "Format with Biome before committing" |
| **Information** (avoid) | "Pre-commit hooks run Biome check" |

Tell Claude what to DO, not what EXISTS.

### 3. Config Files as Source of Truth

Reference config files, don't duplicate their content:

| Approach | Example |
|----------|---------|
| **Reference** (preferred) | "See biome.json for lint rules" |
| **Duplicate** (avoid) | Listing all Biome rules in CLAUDE.md |

Benefits:
- Single source of truth
- Doesn't go stale
- Fewer tokens consumed

### 4. Path Scope Everything in Rules

If a rule doesn't benefit from path filtering, it belongs in CLAUDE.md.

```yaml
---
paths:
  - "src/**/*.ts"
  - "lib/**/*.ts"
---

# TypeScript Conventions
...
```

Rules without `paths` frontmatter load unconditionally for every task.

### 5. Prune Ruthlessly

For each line, ask: "Would removing this cause Claude to make mistakes?"

Claude already knows:
- Standard programming patterns
- Common async patterns
- How to use try-catch
- Git workflow basics

Only document:
- Project-specific deviations from standard practice
- Non-obvious conventions
- Critical gotchas

## Best Practices

### Content Guidelines

| Guideline | Recommendation |
|-----------|----------------|
| File length | Under 300 lines (ideal: <60 essential lines) |
| Instruction count | ~150-200 instructions reliably followed |
| Specificity | "2-space indent" > "format code properly" |
| Emphasis | Use IMPORTANT/MUST sparingly |

### Organization

- **One concern per rule file**: `testing.md`, `api-design.md`, `security.md`
- **Descriptive filenames**: `react-component-patterns.md` > `rules1.md`
- **Subdirectories for structure**: `frontend/`, `backend/`, `shared/`
- **Version control everything**: Rules are code

### Path Filtering Patterns

```yaml
# Single pattern
paths: "src/api/**/*.ts"

# Multiple patterns
paths:
  - "src/**/*.ts"
  - "lib/**/*.ts"

# Brace expansion
paths: "src/**/*.{ts,tsx}"
```

| Pattern | Matches |
|---------|---------|
| `**/*.ts` | All TypeScript files |
| `src/**/*` | All files under src/ |
| `*.md` | Markdown files in root |
| `**/*.test.ts` | All test files |

### File Imports

CLAUDE.md files can import additional files:

```markdown
See @README for project overview and @package.json for npm commands.

# Additional Instructions
- git workflow @docs/git-instructions.md
```

- Both relative and absolute paths allowed
- Max import depth: 5 hops
- Not evaluated inside code blocks

## Common Anti-Patterns

### 1. Over-specified CLAUDE.md

**Problem**: Too long = Claude ignores half
**Fix**: Ruthlessly prune, move specialized content to path-scoped rules

### 2. No Path Scoping

**Problem**: All rules load for every task
**Fix**: Add `paths` frontmatter to rules that apply to specific file types

### 3. Duplicating Config Files

**Problem**: Redundant, goes stale, wastes tokens
**Fix**: Reference config files instead ("see biome.json")

### 4. Style Rules in CLAUDE.md

**Problem**: Claude is not a linter
**Fix**: Use Biome/ESLint for deterministic formatting

### 5. Everything Marked IMPORTANT

**Problem**: If everything is important, nothing is
**Fix**: Reserve emphasis for truly critical rules

### 6. Auto-generated CLAUDE.md

**Problem**: Generic content, not optimized for your project
**Fix**: Start from `/init` but heavily customize

## Example Structures

### Minimal Project

```
project/
├── CLAUDE.md           # All instructions (~30-50 lines)
└── ...
```

### Medium Project

```
project/
├── .claude/
│   ├── CLAUDE.md       # Universal rules
│   └── rules/
│       ├── typescript.md
│       └── testing.md
└── ...
```

### Large Project

```
project/
├── .claude/
│   ├── CLAUDE.md       # Universal rules (~50 lines)
│   └── rules/
│       ├── frontend/
│       │   ├── react.md
│       │   └── styles.md
│       ├── backend/
│       │   ├── api.md
│       │   └── database.md
│       └── shared/
│           ├── typescript.md
│           └── testing.md
└── ...
```

## Useful Commands

| Command | Purpose |
|---------|---------|
| `/memory` | View loaded memory files |
| `/init` | Generate starter CLAUDE.md |
| `#` key | Quick-add to CLAUDE.md during session |

## Sources

- [Official Memory Documentation](https://code.claude.com/docs/en/memory)
- [Anthropic Engineering: Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Builder.io: Complete Guide to CLAUDE.md](https://www.builder.io/blog/claude-md-guide)
- [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- [Claude Fast: Rules Directory](https://claudefa.st/blog/guide/mechanics/rules-directory)
- [Setec: Modular Rules in Claude Code](https://claude-blog.setec.rs/blog/claude-code-rules-directory)
