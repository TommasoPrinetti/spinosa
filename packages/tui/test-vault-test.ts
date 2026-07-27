import { resolveFrameworkRoot } from "@spinosa/core/framework/discovery"
import { createWorkspace } from "@spinosa/core/commands/create"

const root = resolveFrameworkRoot()
console.log("Framework root:", root)
const r = await createWorkspace({
  corpusPath: "~/Downloads/TEST-VAULT",
  frameworkRoot: root!,
  workspaceName: "TEST-VAULT-6",
})
console.log("Success:", r.success, "at", r.workspacePath)
