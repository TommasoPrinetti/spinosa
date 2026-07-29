import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { createKernelPackageManifest, publishManifestErrors } from "./npm-release-config"

const root = path.resolve(import.meta.dir, "..")
const kernelRoot = path.join(root, "packages/spinosa-kernel")

export async function prepareKernelPackage(
  outputDirectory: string,
  version: string,
  optionalDependencies: Record<string, string>,
) {
  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(path.join(outputDirectory, "bin"), { recursive: true })
  await Promise.all([
    cp(path.join(kernelRoot, "bin"), path.join(outputDirectory, "bin"), { recursive: true }),
    cp(path.join(kernelRoot, "README.md"), path.join(outputDirectory, "README.md")),
    cp(path.join(root, "LICENSE"), path.join(outputDirectory, "LICENSE")),
  ])
  const manifest = createKernelPackageManifest(version, optionalDependencies)
  const errors = publishManifestErrors(manifest, version)
  if (errors.length) throw new Error(`@spinosa/kernel: ${errors.join("; ")}`)
  await writeFile(path.join(outputDirectory, "package.json"), JSON.stringify(manifest, null, 2))
  return manifest
}
