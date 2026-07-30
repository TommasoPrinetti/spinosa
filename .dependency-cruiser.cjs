/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "core-not-upstream",
      severity: "error",
      from: { path: "^packages/spinosa-core/" },
      to: {
        path: "^packages/(spinosa-kernel|tui|spinosa-cli)/",
      },
    },
    {
      name: "release-scripts-not-product-ui",
      severity: "error",
      from: { path: "^script/" },
      to: {
        path: "^packages/tui/src/(app|routes)/",
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
