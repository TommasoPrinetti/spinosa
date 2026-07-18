#!/usr/bin/env bun
import { createTwoFilesPatch } from "diff";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listScenarios, resolveScenario } from "./scenario";

const help = `TUI Agent Lab — drive the real TUI and capture inspectable evidence

Usage:
  tui-agent <command> [options]

Commands:
  list [--json]                       List built-in scenarios
  run <name|file> [options]           Replay a scenario against the real TUI
  interact <name|file> [options]      Live JSONL observe/act session for an agent
  show <run-directory> [--json]       Print a run summary and final text frame
  diff <frame-a> <frame-b>            Diff two captured text frames
  doctor [--json]                     Check harness prerequisites

Run/interact options:
  --artifacts <directory>             Exact output directory for this run
  --adapter <module>                  Trusted adapter module (overrides scenario)
  --keep-fixture                      Keep the temporary HOME and workspace
  --json                              Emit a machine-readable result

Examples:
  tui-agent doctor
  tui-agent run test/tui/smoke.json --json
  tui-agent interact test/tui/smoke.json
  tui-agent show .tui-agent/artifacts/<run>
  tui-agent diff /tmp/before.txt /tmp/after.txt
`;

export async function runCli(argv: string[]) {
  const command = argv[0];
  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    process.stdout.write(help);
    return;
  }
  if (command === "list") {
    assertOptions(argv.slice(1), ["--json"]);
    const items = await listScenarios();
    if (argv.includes("--json")) return printJson(items);
    process.stdout.write(
      items
        .map((item) => `${item.name.padEnd(24)} ${item.description}`)
        .join("\n") + "\n",
    );
    return;
  }
  if (command === "run") {
    const target = argv[1];
    if (!target || target.startsWith("--"))
      throw new Error(
        "Missing scenario name or file\nUsage: tui-agent run <name|file> [options]",
      );
    const json = argv.includes("--json");
    const keepFixture = argv.includes("--keep-fixture");
    const artifactFlag = argv.indexOf("--artifacts");
    const adapterFlag = argv.indexOf("--adapter");
    if (artifactFlag !== -1 && !argv[artifactFlag + 1])
      throw new Error("--artifacts requires a directory");
    if (adapterFlag !== -1 && !argv[adapterFlag + 1])
      throw new Error("--adapter requires a module");
    assertRunOptions(argv.slice(2));
    const resolved = await resolveScenario(target);
    const artifactDirectory = path.resolve(
      (artifactFlag === -1 ? undefined : argv[artifactFlag + 1]) ??
        defaultArtifactDirectory(resolved.scenario.name),
    );
    if (
      existsSync(artifactDirectory) &&
      readdirSync(artifactDirectory).length > 0
    ) {
      throw new Error(
        `Artifact directory is not empty: ${artifactDirectory}\nChoose an empty directory to preserve prior evidence.`,
      );
    }
    mkdirSync(artifactDirectory, { recursive: true });
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), "tui-agent-"));
    const home = path.join(fixtureRoot, "home");
    const stateDirectory = path.join(home, ".local", "state", "opencode");
    mkdirSync(stateDirectory, { recursive: true });
    await Bun.write(path.join(stateDirectory, "kv.json"), "{}");
    await Bun.write(path.join(stateDirectory, "model.json"), "{}");
    const isolatedEnv = {
      ...process.env,
      HOME: home,
      OPENCODE_TEST_HOME: home,
      SPINOSA_HOME: path.join(home, ".spinosa"),
      XDG_CONFIG_HOME: path.join(home, ".config"),
      XDG_DATA_HOME: path.join(home, ".local", "share"),
      XDG_STATE_HOME: path.join(home, ".local", "state"),
      XDG_CACHE_HOME: path.join(home, ".cache"),
    };
    const worker = Bun.spawn(
      [
        process.execPath,
        "--preload",
        "@opentui/solid/preload",
        workerEntry("worker"),
        resolved.source,
        artifactDirectory,
        fixtureRoot,
        String(keepFixture),
        adapterFlag === -1 ? "" : argv[adapterFlag + 1]!,
      ],
      {
        cwd: process.cwd(),
        env: isolatedEnv,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [exitCode, workerOutput, workerError] = await Promise.all([
      worker.exited,
      new Response(worker.stdout).text(),
      new Response(worker.stderr).text(),
    ]);
    if (!keepFixture) rmSync(fixtureRoot, { recursive: true, force: true });
    const workerLog = workerError
      ? path.join(artifactDirectory, "worker.log")
      : undefined;
    if (workerLog) await Bun.write(workerLog, workerError);
    if (!workerOutput.trim())
      throw new Error(
        `TUI worker exited ${exitCode}${workerLog ? `\nDiagnostics: ${workerLog}` : ""}`,
      );
    const manifest = JSON.parse(workerOutput);
    const result = { ...manifest, artifactDirectory, workerLog };
    if (json) printJson(result);
    else {
      process.stdout.write(
        `${manifest.status === "passed" ? "PASS" : "FAIL"} ${manifest.scenario.name}\n`,
      );
      process.stdout.write(`Artifacts: ${artifactDirectory}\n`);
      if (manifest.diagnostics.layout.length) {
        process.stdout.write(
          `Layout diagnostics: ${manifest.diagnostics.layout.length} unique (${manifest.diagnostics.layoutOccurrences} occurrences)\n`,
        );
        for (const issue of manifest.diagnostics.layout.slice(0, 5)) {
          process.stdout.write(
            `  ${issue.severity.toUpperCase()} ${issue.code} ${issue.type}#${issue.id}${issue.clippedFraction === undefined ? "" : ` clipped=${Math.round(issue.clippedFraction * 100)}%`}\n`,
          );
        }
      }
      if (manifest.error) process.stderr.write(`${manifest.error}\n`);
      if (workerLog) process.stdout.write(`Diagnostics: ${workerLog}\n`);
    }
    if (manifest.status === "failed" || exitCode !== 0) process.exitCode = 1;
    return;
  }
  if (command === "interact") {
    const target = argv[1];
    if (!target || target.startsWith("--")) {
      throw new Error(
        "Missing scenario name or file\nUsage: tui-agent interact <name|file> [options]",
      );
    }
    assertInteractOptions(argv.slice(2));
    const keepFixture = argv.includes("--keep-fixture");
    const artifactFlag = argv.indexOf("--artifacts");
    const adapterFlag = argv.indexOf("--adapter");
    if (artifactFlag !== -1 && !argv[artifactFlag + 1])
      throw new Error("--artifacts requires a directory");
    if (adapterFlag !== -1 && !argv[adapterFlag + 1])
      throw new Error("--adapter requires a module");
    const resolved = await resolveScenario(target);
    const artifactDirectory = path.resolve(
      (artifactFlag === -1 ? undefined : argv[artifactFlag + 1]) ??
        defaultArtifactDirectory(`${resolved.scenario.name}-interactive`),
    );
    prepareArtifactDirectory(artifactDirectory);
    const isolated = await createIsolatedEnvironment();
    const child = Bun.spawn(
      [
        process.execPath,
        workerEntry("interactive-worker"),
        resolved.source,
        artifactDirectory,
        isolated.fixtureRoot,
        String(keepFixture),
        adapterFlag === -1 ? "" : argv[adapterFlag + 1]!,
      ],
      {
        cwd: process.cwd(),
        env: isolated.env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "pipe",
      },
    );
    const [exitCode, diagnostics] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);
    if (!keepFixture)
      rmSync(isolated.fixtureRoot, { recursive: true, force: true });
    if (diagnostics)
      await Bun.write(path.join(artifactDirectory, "worker.log"), diagnostics);
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }
  if (command === "show") {
    assertOptions(argv.slice(2), ["--json"]);
    const directory = argv[1];
    if (!directory)
      throw new Error(
        "Missing run directory\nUsage: tui-agent show <run-directory>",
      );
    const manifest = await Bun.file(
      path.join(path.resolve(directory), "run.json"),
    ).json();
    if (argv.includes("--json")) return printJson(manifest);
    const last = manifest.steps?.at(-1);
    process.stdout.write(
      `${String(manifest.status).toUpperCase()} ${manifest.scenario.name} (${manifest.durationMs}ms)\n`,
    );
    process.stdout.write(
      `${manifest.steps.length} captured frames, ${manifest.requests.length} API requests\n`,
    );
    if (manifest.error) process.stdout.write(`\n${manifest.error}\n`);
    if (last?.frame)
      process.stdout.write(`\n${await Bun.file(last.frame).text()}`);
    return;
  }
  if (command === "diff") {
    if (argv.length > 3) throw new Error(`Unexpected argument: ${argv[3]}`);
    const [before, after] = argv.slice(1);
    if (!before || !after)
      throw new Error(
        "Two frame files are required\nUsage: tui-agent diff <frame-a> <frame-b>",
      );
    const patch = createTwoFilesPatch(
      before,
      after,
      await Bun.file(before).text(),
      await Bun.file(after).text(),
      "before",
      "after",
    );
    process.stdout.write(patch);
    return;
  }
  if (command === "doctor") {
    assertOptions(argv.slice(1), ["--json"]);
    const checks = await doctor();
    if (argv.includes("--json")) printJson(checks);
    else
      process.stdout.write(
        checks
          .map(
            (check) =>
              `${check.ok ? "PASS" : "FAIL"} ${check.name}${check.detail ? `: ${check.detail}` : ""}`,
          )
          .join("\n") + "\n",
      );
    if (checks.some((check) => !check.ok)) process.exitCode = 1;
    return;
  }
  throw new Error(
    `Unknown command: ${command}\nRun with --help to see valid commands.`,
  );
}

async function doctor() {
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [
    {
      name: "Bun runtime",
      ok: typeof Bun.version === "string",
      detail: Bun.version,
    },
  ];
  for (const module of ["@opentui/core/testing", "diff"]) {
    try {
      Bun.resolveSync(module, import.meta.dir);
      checks.push({ name: module, ok: true });
    } catch (error) {
      checks.push({
        name: module,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const directory = mkdtempSync(path.join(tmpdir(), "tui-agent-doctor-"));
  try {
    const file = path.join(directory, "write-test");
    await Bun.write(file, "ok");
    checks.push({
      name: "artifact filesystem",
      ok: (await Bun.file(file).text()) === "ok",
    });
  } catch (error) {
    checks.push({
      name: "artifact filesystem",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return checks;
}

function defaultArtifactDirectory(name: string) {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const directory = path.join(
    process.cwd(),
    ".tui-agent",
    "artifacts",
    `${name}-${timestamp}`,
  );
  mkdirSync(directory, { recursive: true });
  return directory;
}

function assertOptions(values: string[], allowed: string[]) {
  const unexpected = values.find((value) => !allowed.includes(value));
  if (unexpected)
    throw new Error(
      `Unknown option or argument: ${unexpected}\nRun with --help to see valid options.`,
    );
}

function assertRunOptions(values: string[]) {
  for (let index = 0; index < values.length; index++) {
    const value = values[index]!;
    if (value === "--json" || value === "--keep-fixture") continue;
    if (value === "--artifacts" || value === "--adapter") {
      index++;
      continue;
    }
    throw new Error(
      `Unknown option or argument: ${value}\nRun with --help to see valid options.`,
    );
  }
}

function assertInteractOptions(values: string[]) {
  for (let index = 0; index < values.length; index++) {
    const value = values[index]!;
    if (value === "--keep-fixture") continue;
    if (value === "--artifacts" || value === "--adapter") {
      index++;
      continue;
    }
    throw new Error(
      `Unknown option or argument: ${value}\nRun with --help to see valid options.`,
    );
  }
}

function prepareArtifactDirectory(directory: string) {
  if (existsSync(directory) && readdirSync(directory).length > 0) {
    throw new Error(
      `Artifact directory is not empty: ${directory}\nChoose an empty directory to preserve prior evidence.`,
    );
  }
  mkdirSync(directory, { recursive: true });
}

async function createIsolatedEnvironment() {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "tui-agent-"));
  const home = path.join(fixtureRoot, "home");
  const stateDirectory = path.join(home, ".local", "state", "opencode");
  mkdirSync(stateDirectory, { recursive: true });
  await Bun.write(path.join(stateDirectory, "kv.json"), "{}");
  await Bun.write(path.join(stateDirectory, "model.json"), "{}");
  return {
    fixtureRoot,
    env: {
      ...process.env,
      HOME: home,
      OPENCODE_TEST_HOME: home,
      SPINOSA_HOME: path.join(home, ".spinosa"),
      XDG_CONFIG_HOME: path.join(home, ".config"),
      XDG_DATA_HOME: path.join(home, ".local", "share"),
      XDG_STATE_HOME: path.join(home, ".local", "state"),
      XDG_CACHE_HOME: path.join(home, ".cache"),
    },
  };
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function workerEntry(name: "worker" | "interactive-worker") {
  const extension = import.meta.path.endsWith(".js") ? "js" : "ts";
  return path.join(import.meta.dir, `${name}.${extension}`);
}

if (import.meta.main) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
