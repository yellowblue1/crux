import { describe, expect, it } from "bun:test";
import { buildInheritedEnvVars } from "./env-vars.js";

describe("buildInheritedEnvVars", () => {
  it("should return empty string when no relevant env vars are set", () => {
    const result = buildInheritedEnvVars({});
    expect(result).toBe("");
  });

  it("should return export string for set variables", () => {
    const result = buildInheritedEnvVars({
      CLAUDE_CODE_USE_BEDROCK: "1",
      AWS_REGION: "us-east-1",
    });
    expect(result).toBe("export CLAUDE_CODE_USE_BEDROCK='1' AWS_REGION='us-east-1';");
  });

  it("should skip variables that are not set", () => {
    const result = buildInheritedEnvVars({
      CLAUDE_CODE_USE_BEDROCK: "1",
      UNRELATED_VAR: "ignored",
    });
    expect(result).toBe("export CLAUDE_CODE_USE_BEDROCK='1';");
  });

  it("should handle values with special characters", () => {
    const result = buildInheritedEnvVars({
      ANTHROPIC_BASE_URL: "https://proxy.corp.example.com/v1",
      HTTPS_PROXY: "http://user:p@ss'word@proxy:8080",
    });
    expect(result).toContain("ANTHROPIC_BASE_URL='https://proxy.corp.example.com/v1'");
    expect(result).toContain("HTTPS_PROXY='http://user:p@ss'\\''word@proxy:8080'");
  });

  it("should include all proxy-related variables when set", () => {
    const env = {
      HTTPS_PROXY: "http://proxy:8080",
      HTTP_PROXY: "http://proxy:8080",
      NO_PROXY: "localhost,127.0.0.1",
      https_proxy: "http://proxy:8080",
      http_proxy: "http://proxy:8080",
      no_proxy: "localhost",
    };
    const result = buildInheritedEnvVars(env);
    expect(result).toContain("HTTPS_PROXY=");
    expect(result).toContain("HTTP_PROXY=");
    expect(result).toContain("NO_PROXY=");
    expect(result).toContain("https_proxy=");
    expect(result).toContain("http_proxy=");
    expect(result).toContain("no_proxy=");
  });

  it("should not include undefined variables", () => {
    const result = buildInheritedEnvVars({
      CLAUDE_CODE_USE_BEDROCK: undefined,
      AWS_REGION: "us-west-2",
    });
    expect(result).toBe("export AWS_REGION='us-west-2';");
    expect(result).not.toContain("CLAUDE_CODE_USE_BEDROCK");
  });
});
