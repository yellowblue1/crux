# Security Policy

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Report privately via [GitHub Security Advisories](https://github.com/yellowblue1/crux/security/advisories/new).

We aim to acknowledge reports within 7 days.

## Scope

This policy covers the `crux` repository and all plugins shipped under it
(currently: `crux-hive`). The plugins run inside Claude Code on end-user
machines, so any vulnerability that could allow code execution, secret
exfiltration, or arbitrary file access is in scope.

Out of scope:

- Issues that require an already-compromised local machine
- Social-engineering attacks against plugin users
- Vulnerabilities in upstream dependencies (please report those upstream)

## Supported Versions

Only the latest version on `main` is supported. Claude Code installs plugins
from the default branch, so older tags receive no security updates — to pick
up a fix, users reinstall from `main`.

## Supply-Chain Protections

The repository applies the following baseline protections:

- `minimumReleaseAge` in `bunfig.toml` blocks installation of dependency
  versions published in the last 3 days, limiting exposure to compromised
  releases that have not yet been detected and unpublished.
- All third-party GitHub Actions are pinned to commit SHAs.
- CI workflows declare least-privilege `permissions:`.
- Dependabot raises weekly PRs for both `bun` and `github-actions` ecosystems.
