import { resolveFrameworkRoot } from "./src/spinosa-core/framework/discovery.ts"
import { createWorkspace } from "./src/spinosa-core/commands/create.ts"

const root = resolveFrameworkRoot()
console.log("Framework root:", root)
const r = await createWorkspace({
  corpusPath: "/Users/tommasoprinetti/Downloads/TEST-VAULT",
  frameworkRoot: root!,
  workspaceName: "TEST-VAULT-6",
})
console.log("Success:", r.success, "at", r.workspacePath)
