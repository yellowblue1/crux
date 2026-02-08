import { describe, expect, it } from "bun:test";
import { formatFailureMessage, runQualityGates } from "./quality-gate.js";

describe("runQualityGates", () => {
  it("should pass when all commands succeed", () => {
    const result = runQualityGates({
      commands: [
        { name: "echo-test", command: "echo hello" },
        { name: "true-test", command: "true" },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("should fail when a command fails", () => {
    const result = runQualityGates({
      commands: [{ name: "fail-test", command: "echo 'lint error' >&2 && exit 1" }],
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].name).toBe("fail-test");
    expect(result.failures[0].exitCode).toBe(1);
    expect(result.failures[0].stderr).toBe("lint error");
  });

  it("should collect all failures without short-circuiting", () => {
    const result = runQualityGates({
      commands: [
        { name: "pass", command: "true" },
        { name: "fail-1", command: "echo 'lint error' >&2 && exit 1" },
        { name: "fail-2", command: "echo 'type error' >&2 && exit 1" },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0].name).toBe("fail-1");
    expect(result.failures[0].stderr).toBe("lint error");
    expect(result.failures[1].name).toBe("fail-2");
    expect(result.failures[1].stderr).toBe("type error");
  });

  it("should capture stdout when stderr is empty", () => {
    const result = runQualityGates({
      commands: [{ name: "stdout-fail", command: "echo 'stdout output' && exit 1" }],
    });

    expect(result.passed).toBe(false);
    expect(result.failures[0].stdout).toBe("stdout output");
  });

  it("should return passed for empty commands array", () => {
    const result = runQualityGates({ commands: [] });

    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("should handle command timeout", () => {
    const result = runQualityGates({
      commands: [{ name: "slow", command: "sleep 10" }],
      timeout: 500,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].name).toBe("slow");
  });

  it("should preserve exit codes", () => {
    const result = runQualityGates({
      commands: [{ name: "exit-42", command: "exit 42" }],
    });

    expect(result.passed).toBe(false);
    expect(result.failures[0].exitCode).toBe(42);
  });
});

describe("formatFailureMessage", () => {
  it("should format a single failure with stderr", () => {
    const message = formatFailureMessage([
      {
        name: "lint",
        command: "bun run lint",
        exitCode: 1,
        stderr: "Error: unused variable",
        stdout: "",
      },
    ]);

    expect(message).toContain("Quality gate checks failed:");
    expect(message).toContain("--- lint (exit code 1) ---");
    expect(message).toContain("Error: unused variable");
    expect(message).toContain("Please fix the issues above before proceeding.");
  });

  it("should use stdout when stderr is empty", () => {
    const message = formatFailureMessage([
      {
        name: "test",
        command: "bun test",
        exitCode: 1,
        stderr: "",
        stdout: "1 test failed",
      },
    ]);

    expect(message).toContain("1 test failed");
  });

  it("should format multiple failures", () => {
    const message = formatFailureMessage([
      { name: "lint", command: "lint", exitCode: 1, stderr: "lint error", stdout: "" },
      { name: "test", command: "test", exitCode: 1, stderr: "test error", stdout: "" },
    ]);

    expect(message).toContain("--- lint (exit code 1) ---");
    expect(message).toContain("lint error");
    expect(message).toContain("--- test (exit code 1) ---");
    expect(message).toContain("test error");
  });

  it("should truncate long messages", () => {
    const longStderr = "x".repeat(5000);
    const message = formatFailureMessage([
      { name: "lint", command: "lint", exitCode: 1, stderr: longStderr, stdout: "" },
    ]);

    expect(message.length).toBeLessThanOrEqual(4000);
    expect(message).toEndWith("...");
  });
});
