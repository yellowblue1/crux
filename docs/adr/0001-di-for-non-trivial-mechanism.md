# ADR 0001: Dependency injection applies to non-trivial mechanism only

- **Status**: Accepted
- **Date**: 2026-05-07

## Context

`.claude/rules/typescript.md` states:

> Dependency injection for testability

Read uniformly, the rule produces a port + adapter for every infrastructure
boundary, regardless of whether the wrapped operation has any behaviour worth
isolating. The first concrete case was `hooks/GitConfigAdapter`: a two-method
interface whose entire implementation was a pair of one-line `git config`
shell calls. It had no test, no alternate implementation, and no invariant
beyond what `shared/exec.ts` already provides.

Applying the deletion test: removing the port and inlining the two shell
calls into the policy function did not concentrate complexity anywhere — it
just removed one layer of indirection. The "seam" was hypothetical.

The other ports in the codebase do not have this problem:

| Port | Mechanism | Test |
| --- | --- | --- |
| `worktree/GitAdapter` | multi-step `git gtr` flow + error mapping | — |
| `worktree/TmuxAdapter` | long-arg temp file dance | yes |
| `worktree/ConfigAdapter` | JSON read/merge/write | yes |
| `team/TeamRepository` | on-disk team layout invariants | yes |
| `hooks/GitConfigAdapter` | `git config` (one line × 2) | no |

The first four wrap mechanism with its own behaviour. The fifth wraps
nothing.

## Decision

Dependency injection separates **policy** from **non-trivial mechanism**:

- multi-step flows
- error mapping or recovery
- format handling, parsing, merging
- retry, timeout policy beyond a single call
- on-disk or on-wire invariants

Single-line wrappers around `exec`, `Bun.file()`, or other low-level
primitives belong inline in the policy that calls them. Those primitives
(`shared/exec.ts`, `Bun.file()`) are themselves the substitution seam: tests
that need to stub subprocesses or filesystem calls do so at that layer, not
through a per-call port.

A port earns its keep when at least one of the following is true:

1. The implementation has its own behaviour (per the list above).
2. A test exists, or a concrete reason to expect one, that benefits from
   substitution at this layer rather than at `shared/exec.ts`.

If neither is true, the port is shallow and should be inlined.

## Consequences

- `hooks/GitConfigAdapter` and the surrounding `hooks/{domain,infrastructure}/`
  layering are removed. The remaining `configureGtrHooks` function lives at
  `hooks/configure-gtr-hooks.ts` and calls `shared/exec.ts` directly.
- The DDD layering (`domain/`, `application/`, `infrastructure/`) is applied
  per slice when the slice has non-trivial mechanism worth isolating. A slice
  with only policy can be a flat file.
- Future architectural reviews should not re-suggest re-introducing a port
  for the `git config` calls. If a real test arrives that needs to substitute
  git-config behaviour specifically (not just subprocess execution), revisit
  this ADR.
- The `.claude/rules/typescript.md` "Dependency injection for testability"
  line stays as the guiding principle. This ADR refines its applicability.
