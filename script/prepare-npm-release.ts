#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  APPROVED_PUBLISH_PACKAGES,
  npmTagForVersion,
  platformPackageSetErrors,
  publishManifestErrors,
} from "./npm-release-config";
import { prepareKernelPackage } from "./prepare-kernel-package";

const root = path.resolve(import.meta.dir, "..");
const platformDist = path.join(root, "packages/spinosa-kernel/dist");
const version = (await Bun.file(path.join(root, "package.json")).json())
  .version;
const tag = npmTagForVersion(version);
const releaseDirectory = path.join(root, "dist/npm", `v${version}`);
const packagesDirectory = path.join(releaseDirectory, "packages");
const tarballDirectory = path.join(releaseDirectory, "tarballs");

function packageDirectory(name: string) {
  return name.slice("@spinosa/".length);
}

function tarballName(name: string) {
  return `${name.slice(1).replace("/", "-")}-${version}.tgz`;
}

async function run(command: string[], cwd: string) {
  const child = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0)
    throw new Error(
      `${command.join(" ")} failed with ${exitCode}\n${stdout}${stderr}`,
    );
}

async function pack(name: string, directory: string) {
  const tarball = path.join(tarballDirectory, tarballName(name));
  await run(
    ["bun", "pm", "pack", "--filename", tarball, "--ignore-scripts"],
    directory,
  );
  return tarball;
}

async function checksum(filepath: string) {
  const bytes = await Bun.file(filepath).arrayBuffer();
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

await rm(releaseDirectory, { recursive: true, force: true });
await Promise.all([
  mkdir(packagesDirectory, { recursive: true }),
  mkdir(tarballDirectory, { recursive: true }),
]);

const platformPackages = APPROVED_PUBLISH_PACKAGES.slice(1);
const platformErrors = platformPackageSetErrors(platformPackages);
if (platformErrors.length) throw new Error(platformErrors.join("; "));

const optionalDependencies: Record<string, string> = {};
const packageDirectories = new Map<string, string>();
for (const name of platformPackages) {
  const sourceDirectory = path.join(platformDist, packageDirectory(name));
  const directory = path.join(packagesDirectory, packageDirectory(name));
  await cp(sourceDirectory, directory, { recursive: true });
  const manifest = await Bun.file(path.join(directory, "package.json")).json();
  const errors = publishManifestErrors(manifest, version);
  if (errors.length) throw new Error(`${name}: ${errors.join("; ")}`);
  optionalDependencies[name] = version;
  packageDirectories.set(name, directory);
}

const kernelDirectory = path.join(packagesDirectory, "kernel");
await prepareKernelPackage(kernelDirectory, version, optionalDependencies);
packageDirectories.set("@spinosa/kernel", kernelDirectory);

const records = [];
for (const name of [...platformPackages, "@spinosa/kernel"]) {
  const tarball = await pack(name, packageDirectories.get(name)!);
  records.push({
    name,
    version,
    directory: path.relative(releaseDirectory, packageDirectories.get(name)!),
    tarball: path.relative(releaseDirectory, tarball),
    sha256: await checksum(tarball),
  });
}

await writeFile(
  path.join(releaseDirectory, "release.json"),
  `${JSON.stringify({ version, tag, packages: records }, null, 2)}\n`,
);
await writeFile(
  path.join(releaseDirectory, "SHA256SUMS"),
  `${records.map((record) => `${record.sha256}  ${record.tarball}`).join("\n")}\n`,
);
await writeFile(
  path.join(releaseDirectory, "publish-order.txt"),
  `${records.map((record) => record.directory).join("\n")}\n`,
);

console.log(
  `Prepared ${records.length} npm packages at ${path.relative(root, releaseDirectory)}`,
);
console.log(`npm dist-tag: ${tag}`);
