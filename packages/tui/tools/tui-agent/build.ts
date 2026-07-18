import { chmod, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = import.meta.dir;
const outdir = path.join(root, "dist");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [
    path.join(root, "index.ts"),
    path.join(root, "cli.ts"),
    path.join(root, "worker.ts"),
    path.join(root, "interactive-worker.ts"),
  ],
  outdir,
  target: "bun",
  format: "esm",
  sourcemap: "linked",
  external: ["@opentui/core", "@opentui/core/testing", "diff"],
});
if (!result.success) {
  for (const log of result.logs) process.stderr.write(`${log}\n`);
  process.exit(1);
}

const types = Bun.spawn(
  [process.execPath, "x", "tsc", "-p", path.join(root, "tsconfig.json")],
  { cwd: root, stdout: "inherit", stderr: "inherit" },
);
if ((await types.exited) !== 0) process.exit(1);

await cp(path.join(root, "scenario.schema.json"), path.join(outdir, "scenario.schema.json"));
await chmod(path.join(outdir, "cli.js"), 0o755);
