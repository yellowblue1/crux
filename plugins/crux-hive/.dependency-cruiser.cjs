/** @type {import('dependency-cruiser').IConfiguration} */
const SRC = "plugins/crux-hive/src";

module.exports = {
  forbidden: [
    {
      name: "no-domain-to-infrastructure",
      comment: "Domain layer must not import from infrastructure layer",
      severity: "error",
      from: { path: `^${SRC}/[^/]+/domain/` },
      to: { path: `^${SRC}/[^/]+/infrastructure/` },
    },
    {
      name: "no-domain-to-application",
      comment: "Domain layer must not import from application layer",
      severity: "error",
      from: { path: `^${SRC}/[^/]+/domain/` },
      to: { path: `^${SRC}/[^/]+/application/` },
    },
    {
      name: "no-application-to-infrastructure",
      comment: "Application layer must not import from infrastructure layer",
      severity: "error",
      from: { path: `^${SRC}/[^/]+/application/` },
      to: { path: `^${SRC}/[^/]+/infrastructure/` },
    },
    {
      name: "no-application-to-mcp",
      comment: "Application layer must not import from MCP interface layer",
      severity: "error",
      from: { path: `^${SRC}/[^/]+/application/` },
      to: { path: `^${SRC}/mcp/` },
    },
    {
      name: "no-infrastructure-to-application",
      comment: "Infrastructure must not import from application layer",
      severity: "error",
      from: { path: `^${SRC}/[^/]+/infrastructure/` },
      to: { path: `^${SRC}/[^/]+/application/` },
    },
    {
      name: "no-cross-context-infrastructure",
      comment:
        "Infrastructure in one bounded context must not import from infrastructure in another",
      severity: "error",
      from: { path: `^${SRC}/(?<ctx>[^/]+)/infrastructure/` },
      to: {
        path: `^${SRC}/([^/]+)/infrastructure/`,
        pathNot: `^${SRC}/$<ctx>/infrastructure/`,
      },
    },
    {
      name: "shared-is-leaf",
      comment: "shared/ must not import from any bounded context",
      severity: "error",
      from: { path: `^${SRC}/shared/` },
      to: { path: `^${SRC}/(team|worktree|hooks|mcp)/` },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    exclude: { path: "\\.test\\.ts$" },
  },
};
