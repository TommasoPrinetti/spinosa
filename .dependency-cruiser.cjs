/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "product-core-not-upstream",
      severity: "error",
      from: { path: "^packages/spinosa-core/" },
      to: {
        path: "^packages/(spinosa-kernel|tui|spinosa-cli)/",
      },
    },
    {
      name: "kernel-core-not-executable-kernel",
      severity: "error",
      from: { path: "^packages/core/" },
      to: { path: "^packages/spinosa-kernel/" },
    },
    {
      name: "server-not-tui",
      severity: "error",
      from: { path: "^packages/server/" },
      to: { path: "^packages/tui/" },
    },
    {
      name: "release-scripts-not-product-ui",
      severity: "error",
      from: { path: "^script/" },
      to: {
        path: "^packages/tui/src/(app|routes)/",
      },
    },
    {
      name: "release-scripts-not-product-runtime",
      severity: "error",
      from: { path: "^script/" },
      to: {
        path: "^packages/(spinosa-core|tui|spinosa-kernel|spinosa-cli)/",
        pathNot: [
          "^packages/spinosa-core/src/utils/version",
          "^packages/spinosa-core/src/utils/yaml-config",
        ],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
  },
}
