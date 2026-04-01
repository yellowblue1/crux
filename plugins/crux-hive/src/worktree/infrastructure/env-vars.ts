import { shellEscape } from "../../shared/exec.js";

/**
 * Environment variables to inherit from the parent process when spawning
 * worker Claude Code sessions. Mirrors Claude Code's own spawnUtils.ts
 * buildInheritedEnvVars() list.
 */
export const INHERITED_ENV_VARS = [
  // API provider selection
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  // API configuration
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_API_KEY",
  // Proxy settings
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
  "https_proxy",
  "http_proxy",
  "no_proxy",
  // SSL / TLS certificates
  "SSL_CERT_FILE",
  "NODE_EXTRA_CA_CERTS",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  // AWS (Bedrock)
  "AWS_PROFILE",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  // GCP (Vertex)
  "GOOGLE_APPLICATION_CREDENTIALS",
  "CLOUD_ML_REGION",
  // Claude configuration
  "CLAUDE_CONFIG_DIR",
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
] as const;

/**
 * Build an export prefix string for environment variables that should be
 * inherited by worker sessions. Only includes variables that are actually
 * set in the current process environment.
 *
 * @returns A string like `export KEY1='val1' KEY2='val2';` or empty string
 */
export function buildInheritedEnvVars(env: Record<string, string | undefined> = process.env): string {
  const parts: string[] = [];
  for (const name of INHERITED_ENV_VARS) {
    const value = env[name];
    if (value !== undefined) {
      parts.push(`${name}=${shellEscape(value)}`);
    }
  }
  return parts.length > 0 ? `export ${parts.join(" ")};` : "";
}
