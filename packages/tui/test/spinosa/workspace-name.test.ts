import { expect, test } from "bun:test"
import { workspaceAsciiBannerText } from "../../src/spinosa/workspace-name"

test("workspaceAsciiBannerText strips -spinosa suffix for home ASCII", () => {
  expect(workspaceAsciiBannerText("/data/corpus-spinosa")).toBe("CORPUS")
  expect(workspaceAsciiBannerText("/data/Vault-Spinosa")).toBe("VAULT")
  expect(workspaceAsciiBannerText("/data/research")).toBe("RESEARCH")
  expect(workspaceAsciiBannerText("/data/spinosa")).toBe("SPINOSA")
})