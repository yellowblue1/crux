# Sandboxing Strategies Research for Claude Code Worker Workflows

This research investigates solutions to the permission prompt problem in parallel Claude Code worker workflows. The goal is to enable workers to operate autonomously without constant user interruption while maintaining security.

**Key Finding**: Multiple viable solutions exist, ranging from Claude Code's built-in sandboxing (84% permission reduction) to full Docker microVM isolation. The recommended approach depends on the security vs. convenience tradeoff acceptable for your use case.

---

## 1. Claude Code Built-in Options

### 1.1 `--dangerously-skip-permissions` Flag

Enables "Safe YOLO mode" - fully unattended execution bypassing all permission prompts.

**Intended use**: "Only for Docker containers with no internet" per Anthropic documentation.

**Usage**:
```bash
claude -p "task description" --dangerously-skip-permissions --output-format stream-json
```

**Risks**:
- Claude can execute any command including destructive ones
- File modifications outside intended scope
- Data exfiltration (if network access exists)

**Source**: [Claude Code Dangerous Skip Permissions Guide](https://pasqualepillitteri.it/en/news/141/claude-code-dangerously-skip-permissions-guide-autonomous-mode)

### 1.2 Native Sandboxing (Recommended)

Claude Code includes **native sandboxing** that reduces permission prompts by 84% while maintaining security.

**How to enable**:
```bash
/sandbox  # Opens sandbox mode menu
```

**Two sandbox modes**:
1. **Auto-allow mode**: Sandboxed commands run without prompts; unsandboxable commands fall back to permission flow
2. **Regular mode**: All commands require approval but benefit from isolation

**How it works**:
- **Filesystem isolation**: Read/write to CWD only; blocked outside
- **Network isolation**: Domain allowlist via proxy server
- **OS-level enforcement**: macOS Seatbelt / Linux bubblewrap

**Configuration** (`settings.json`):
```json
{
  "sandbox": {
    "mode": "auto-allow",
    "filesystem": {
      "allowWrite": [".", "/tmp"],
      "denyRead": ["~/.ssh", "~/.aws"]
    },
    "network": {
      "allowedDomains": ["github.com", "*.npmjs.org", "registry.yarnpkg.com"]
    }
  }
}
```

**Prerequisites**:
- macOS: Works out of the box (Seatbelt)
- Linux/WSL2: `sudo apt-get install bubblewrap socat`

**Source**: [Claude Code Sandboxing Docs](https://code.claude.com/docs/en/sandboxing)

### 1.3 Permission Configuration Options

**allowedTools** - Whitelist specific tools:
```bash
claude --allowedTools "Bash(npm run test:*)" --allowedTools "Edit"
```

**disallowedTools** - Blacklist tools (works correctly with bypassPermissions):
```bash
claude --disallowedTools "Bash(rm *)"
```

**Permission modes** (cycle with shift+tab):
- `default` - Allows reads, asks before other operations
- `plan` - Read-only, no modifications
- `acceptEdits` - Auto-approve file edits
- `bypassPermissions` - No prompts at all

**Known issue**: `--allowedTools` may be ignored with `bypassPermissions`; use `--disallowedTools` instead.

---

## 2. Docker-based Solutions

### 2.1 Docker Sandboxes (Official - Recommended for Full Isolation)

Docker's official solution using **microVMs** for AI agents.

**Key features**:
- MicroVM isolation (not containers)
- Private Docker daemon per sandbox
- Network allow/deny lists
- macOS and Windows support (Linux: legacy container mode)

**Setup**:
```bash
# Create and run sandbox
docker sandbox create claude ~/my-project
docker sandbox run <sandbox-name>

# Or combined
docker sandbox run claude ~/my-project
```

**Important**: Claude launches with `--dangerously-skip-permissions` by default in sandboxes.

**Authentication**:
```bash
# Add to ~/.bashrc or ~/.zshrc
export ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
# Restart Docker Desktop after changing env vars
```

**Managing sandboxes**:
```bash
docker sandbox ls        # List sandboxes (not docker ps!)
docker sandbox rm <name> # Remove sandbox
```

**Source**: [Docker Sandboxes Docs](https://docs.docker.com/ai/sandboxes/claude-code/)

### 2.2 textcortex/claude-code-sandbox

Third-party solution for running Claude in Docker with full autonomy.

**Setup**:
```bash
npm install -g @textcortex/claude-code-sandbox
# OR
git clone https://github.com/textcortex/claude-code-sandbox.git
cd claude-code-sandbox && npm install && npm link
```

**Usage**:
```bash
claude-sandbox <project-directory>
```

**Default container includes**: Ubuntu 22.04, Git, GitHub CLI, Node.js, Python, Claude Code

**Source**: [textcortex/claude-code-sandbox](https://github.com/textcortex/claude-code-sandbox)

---

## 3. Other Isolation Technologies

### 3.1 Comparison Table

| Technology | Isolation Level | Startup Time | Memory Overhead | macOS | Linux | GPU Support |
|------------|-----------------|--------------|-----------------|-------|-------|-------------|
| Claude Native Sandbox | Medium | Instant | ~0 | Yes | Yes | N/A |
| Docker Sandboxes | High (microVM) | 100-200ms | ~50MB | Yes | Limited | No |
| Firecracker | Very High | 100-200ms | ~5MB | No | Yes | No |
| Kata Containers | Very High | 150-300ms | ~50MB | No | Yes | Yes |
| gVisor | High | 50-100ms | Low | No | Yes | Limited |
| macOS Seatbelt (sx) | Medium | Instant | ~0 | Yes | No | N/A |

### 3.2 Firecracker MicroVMs

AWS's lightweight VMM - strongest isolation but Linux-only.

**Best for**: Multi-tenant, high-density deployments

**Limitations**: No GPU, basic networking only, requires orchestration

### 3.3 gVisor

Google's container runtime with user-space kernel.

**Best for**: Container-compatible workloads needing extra isolation

**Limitations**: ~70-80% syscall compatibility, no low-level system calls

### 3.4 Kata Containers

VM-level isolation with Kubernetes compatibility.

**Best for**: Kubernetes environments needing strong isolation

### 3.5 sandbox-shell (sx) - macOS Only

Lightweight Seatbelt wrapper with deny-by-default policies.

**Installation**:
```bash
brew tap agentic-dev3o/sx
brew install sx
```

**Usage with Claude**:
```bash
sx claude -- claude --dangerously-skip-permissions --continue
```

**Key benefit**: Protects credentials (`~/.ssh`, `~/.aws`) even from dependencies

**Source**: [agentic-dev3o/sandbox-shell](https://github.com/agentic-dev3o/sandbox-shell)

### 3.6 sandbox-runtime (srt) - Anthropic Official

Anthropic's open-source sandbox runtime, extracted from Claude Code.

**Installation**:
```bash
npm install -g @anthropic-ai/sandbox-runtime
```

**Usage**:
```bash
srt "command to sandbox"
srt --settings /path/to/srt-settings.json npm install
```

**Can sandbox MCP servers**:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "srt",
      "args": ["npx", "-y", "@modelcontextprotocol/server-filesystem"]
    }
  }
}
```

**Source**: [anthropic-experimental/sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime)

---

## 4. Approaches for crux-hive Parallel Workers

### 4.1 Option A: Native Sandboxing with Auto-Allow (Recommended Short-term)

Enable Claude Code's native sandboxing in auto-allow mode for each worker.

**Implementation**:
1. Configure sandbox settings in worker worktree's `.claude/settings.local.json`
2. Pre-configure allowed network domains for common tools (npm, pip, etc.)
3. Workers operate autonomously within sandbox boundaries

**Pros**:
- No additional infrastructure
- 84% permission reduction
- Security maintained
- Works on macOS and Linux

**Cons**:
- Still some prompts for unsandboxable operations
- Network domain approval needed for new services

### 4.2 Option B: Docker Sandboxes (Recommended Long-term)

Run each worker in a Docker Sandbox with full autonomy.

**Implementation**:
1. Create sandbox per worktree: `docker sandbox create worker-${branch} ${worktree_path}`
2. Workers run with `--dangerously-skip-permissions` (default in sandboxes)
3. Configure network allow/deny lists per project

**Pros**:
- Full autonomy (zero prompts)
- Strong isolation (microVM)
- Official Docker support

**Cons**:
- Docker Desktop required
- Linux support limited
- More resource overhead

### 4.3 Option C: sandbox-shell (sx) Wrapper (macOS Quick Win)

Wrap Claude invocation with sx for credential protection.

**Implementation**:
```bash
sx claude -- claude --dangerously-skip-permissions --prompt "${task}"
```

**Pros**:
- Very lightweight
- Protects sensitive credentials
- Easy to integrate

**Cons**:
- macOS only
- Full network access by default

### 4.4 Option D: Enhanced PreToolUse Hooks (Current Approach)

Enhance PreToolUse hooks to auto-approve known-safe patterns.

**Current state**: Already partially implemented in crux-hive with `auto-approve-watcher.ts`.

**Pros**:
- No new dependencies
- Fine-grained control
- Works everywhere

**Cons**:
- Maintenance burden
- Pattern coverage gaps
- Security depends on rule quality

---

## 5. Recommendation for crux-hive

### Short-term (Implement Now)

**Enable Native Sandboxing with Auto-Allow Mode**

1. Add sandbox configuration to worker initialization:
```json
{
  "sandbox": {
    "mode": "auto-allow",
    "network": {
      "allowedDomains": [
        "github.com", "*.github.com",
        "registry.npmjs.org", "registry.yarnpkg.com",
        "pypi.org", "files.pythonhosted.org"
      ]
    }
  }
}
```

2. Document prerequisites (bubblewrap for Linux users)

3. Provide escape hatch documentation for when sandbox fails

**Expected result**: ~84% reduction in permission prompts with maintained security.

### Long-term (Future Enhancement)

**Docker Sandboxes Integration**

1. Add option to spawn workers in Docker Sandboxes
2. Create custom container image with project dependencies
3. Implement sandbox lifecycle management (create/destroy)
4. Add network policy configuration per project

---

## 6. Security Considerations

### Risks to Mitigate

1. **Data exfiltration**: Always combine filesystem + network isolation
2. **Credential theft**: Deny read access to `~/.ssh`, `~/.aws`, `~/.docker`
3. **Domain fronting**: Be cautious with broad domain allowlists
4. **Unix socket exploits**: Don't allow Docker socket access in sandbox

### Security Recommendations

1. Start with restrictive policies, expand as needed
2. Never allow `github.com` write access without understanding implications
3. Monitor sandbox violation attempts
4. Use different sandbox configs for trusted vs. untrusted repos

---

## 7. Sources

- [Claude Code Sandboxing Documentation](https://code.claude.com/docs/en/sandboxing)
- [Anthropic Engineering: Claude Code Sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Docker Sandboxes Documentation](https://docs.docker.com/ai/sandboxes)
- [Docker Sandboxes Claude Code Config](https://docs.docker.com/ai/sandboxes/claude-code/)
- [textcortex/claude-code-sandbox](https://github.com/textcortex/claude-code-sandbox)
- [anthropic-experimental/sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime)
- [agentic-dev3o/sandbox-shell](https://github.com/agentic-dev3o/sandbox-shell)
- [Firecracker vs gVisor vs Kata Comparison](https://dev.to/agentsphere/choosing-a-workspace-for-ai-agents-the-ultimate-showdown-between-gvisor-kata-and-firecracker-b10)
- [Claude Code GitHub Issues on Permissions](https://github.com/anthropics/claude-code/issues/4963)
- [Running Claude Code Dangerously (Safely)](https://blog.emilburzo.com/2026/01/running-claude-code-dangerously-safely/)

---

## 8. Getting Started

Native sandboxing is **available now** in crux-hive. No code changes required.

### Immediate Setup

1. Copy the template to your project:
   ```bash
   cp plugins/crux-hive/templates/sandbox-settings.example.json .claude/settings.local.json
   ```

2. Customize allowed network domains for your project

3. Start using orchestrator mode - workers automatically inherit sandbox settings via existing symlink mechanism

### Optional Future Enhancements

- Evaluate Docker Sandboxes for even stronger isolation
- Add project-specific sandbox profiles
- Create automated sandbox configuration based on detected dependencies
