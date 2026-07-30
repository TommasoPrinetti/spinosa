/** @type {import('syncpack').RcFile} */
module.exports = {
  versionGroups: [
    {
      label: "Workspace-local packages use independent versions",
      packages: ["**"],
      dependencies: ["@spinosa/protocol", "@spinosa/schema", "@spinosa/script"],
      isIgnored: true,
    },
  ],
}
