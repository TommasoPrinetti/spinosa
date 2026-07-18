import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  resolveScenario,
  substituteScenario,
  validateScenario,
} from "./scenario";

const portableScenario = path.join(import.meta.dir, "test-fixtures", "simple-scenario.json");

test("loads built-in scenarios and substitutes adapter fixture tokens", async () => {
  const { scenario } = await resolveScenario("workspace-session");
  const resolved = substituteScenario(scenario, {
    WORKSPACE: "/tmp/workspace",
    HOME: "/tmp/home",
    FIXTURE_ROOT: "/tmp/fixture",
  });
  const fixture = resolved.fixture as { sessions?: Array<{ directory: string }> };
  expect(fixture.sessions?.[0]?.directory).toBe("/tmp/workspace");
  expect(resolved.adapter).toBe("../adapters/spinosa.ts");
  expect(resolved.steps.at(-1)).toMatchObject({ action: "assert" });
});

test("rejects unsupported actions with their location", () => {
  expect(() =>
    validateScenario({
      name: "broken",
      description: "broken scenario",
      steps: [{ action: "teleport" }],
    }),
  ).toThrow("steps[0]");
});

test("the package CLI drives an adapter without product imports", async () => {
  const artifacts = mkdtempSync(path.join(tmpdir(), "tui-agent-test-"));
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        path.join(import.meta.dir, "cli.ts"),
        "run",
        portableScenario,
        "--artifacts",
        artifacts,
        "--json",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode, stderr).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      status: "passed",
      adapter: "portable-example",
      scenario: { name: "portable-example" },
    });
    expect(await Bun.file(path.join(artifacts, "run.json")).exists()).toBe(true);
    expect(await Bun.file(result.steps.at(-1).frame).text()).toContain("hello");
  } finally {
    rmSync(artifacts, { recursive: true, force: true });
  }
}, 30_000);

test("interactive ready/observe/quit emits only serializable adapter state", async () => {
  const artifacts = mkdtempSync(path.join(tmpdir(), "tui-agent-interactive-test-"));
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        path.join(import.meta.dir, "cli.ts"),
        "interact",
        portableScenario,
        "--artifacts",
        artifacts,
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    child.stdin.write(
      [
        { command: "observe" },
        { command: "quit" },
      ].map((command) => JSON.stringify(command)).join("\n") + "\n",
    );
    child.stdin.end();
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode, stderr).toBe(0);
    const events = stdout.trim().split("\n").map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({
      event: "ready",
      protocolVersion: 1,
      state: {
        adapter: {
          route: "demo",
          state: { ready: true },
        },
      },
    });
    expect(events[1]).toMatchObject({
      event: "observation",
      ok: true,
      state: { adapter: { route: "demo" } },
    });
    expect(events.at(-1)).toMatchObject({ event: "closed", status: "passed" });
  } finally {
    rmSync(artifacts, { recursive: true, force: true });
  }
}, 30_000);
