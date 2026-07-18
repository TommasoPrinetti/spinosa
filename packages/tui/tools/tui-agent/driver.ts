import {
  createTestRenderer,
  type KeyInput,
  type TestRendererSetup,
} from "@opentui/core/testing";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureArtifacts, captureState, normalizeFrame } from "./artifacts";
import { substituteScenario } from "./scenario";
import type {
  AdapterInspection,
  CapturedRequest,
  RequestExpectation,
  RunManifest,
  ScenarioAction,
  StepResult,
  TuiAgentAdapter,
  TuiScenario,
} from "./types";

export type InteractiveObservation = {
  step: StepResult;
  frame: string;
  state: ReturnType<typeof captureState>;
  requests: CapturedRequest[];
};

export type InteractiveController = {
  current(): InteractiveObservation;
  execute(action: ScenarioAction): Promise<InteractiveObservation>;
  capture(label?: string): Promise<InteractiveObservation>;
};

export async function runScenario(input: {
  scenario: TuiScenario;
  source: string;
  artifactDirectory: string;
  keepFixture?: boolean;
  fixtureRoot?: string;
  adapter: TuiAgentAdapter;
  interact?: (controller: InteractiveController) => Promise<void>;
}): Promise<RunManifest> {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const fixtureRoot = realpathSync(
    input.fixtureRoot ?? mkdtempSync(path.join(tmpdir(), "tui-agent-")),
  );
  const home = path.join(fixtureRoot, "home");
  mkdirSync(home, { recursive: true });
  const preparation =
    (await input.adapter.prepare?.({
      scenario: input.scenario,
      source: input.source,
      fixtureRoot,
      home,
    })) ?? {};
  const scenario = substituteScenario(input.scenario, {
    FIXTURE_ROOT: fixtureRoot,
    HOME: home,
    ...(preparation.cwd ? { CWD: preparation.cwd } : {}),
    ...(preparation.tokens ?? {}),
  });
  const width = scenario.terminal?.width ?? 100;
  const height = scenario.terminal?.height ?? 32;
  mkdirSync(input.artifactDirectory, { recursive: true });
  let requests: CapturedRequest[] = [];
  const steps: RunManifest["steps"] = [];
  const setup = await createTestRenderer({
    width,
    height,
    useThread: false,
    useMouse: true,
  });
  let running: Awaited<ReturnType<TuiAgentAdapter["launch"]>> | undefined;
  let manifest: RunManifest;

  try {
    running = await input.adapter.launch({
      scenario,
      source: input.source,
      fixtureRoot,
      home,
      setup,
      preparation,
    });
    requests = running.requests ?? [];
    await settle(setup, 3);
    steps.push(
      await captureArtifacts({
        setup,
        directory: input.artifactDirectory,
        index: 0,
        label: "initial",
        action: "launch",
        durationMs: Math.round(performance.now() - started),
        inspection: running.inspect?.(),
      }),
    );

    const current = () => makeObservation(steps.at(-1)!);
    const execute = async (action: ScenarioAction) => {
      const stepStarted = performance.now();
      await performAction(setup, action, requests, running?.inspect?.());
      await settle(setup, action.action === "wait" ? 1 : 2);
      const step = await captureArtifacts({
        setup,
        directory: input.artifactDirectory,
        index: steps.length,
        label: actionLabel(action),
        action: action.action,
        durationMs: Math.round(performance.now() - stepStarted),
        inspection: running?.inspect?.(),
      });
      steps.push(step);
      return makeObservation(step);
    };
    const capture = async (label = "observe") => {
      await settle(setup, 1);
      const step = await captureArtifacts({
        setup,
        directory: input.artifactDirectory,
        index: steps.length,
        label,
        action: "observe",
        durationMs: 0,
        inspection: running?.inspect?.(),
      });
      steps.push(step);
      return makeObservation(step);
    };
    if (input.interact) {
      await input.interact({ current, execute, capture });
    } else {
      for (const action of scenario.steps) await execute(action);
    }
    manifest = makeManifest("passed");
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    try {
      steps.push(
        await captureArtifacts({
          setup,
          directory: input.artifactDirectory,
          index: steps.length,
          label: "failure",
          action: "failure",
          durationMs: 0,
          inspection: running?.inspect?.(),
        }),
      );
    } catch {}
    manifest = makeManifest("failed", message);
  } finally {
    await running?.dispose();
    if (!setup.renderer.isDestroyed) setup.renderer.destroy();
    if (!input.keepFixture)
      rmSync(fixtureRoot, { recursive: true, force: true });
  }
  await Bun.write(
    path.join(input.artifactDirectory, "run.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;

  function makeManifest(
    status: "passed" | "failed",
    error?: string,
  ): RunManifest {
    return {
      schemaVersion: 1,
      scenario: {
        name: scenario.name,
        description: scenario.description,
        source: input.source,
      },
      adapter: input.adapter.name,
      status,
      startedAt,
      durationMs: Math.round(performance.now() - started),
      terminal: { width, height },
      fixture: {
        root: fixtureRoot,
        home,
        cwd: preparation.cwd,
        data: preparation.fixture,
      },
      steps,
      requests,
      diagnostics: summarizeDiagnostics(steps),
      error,
    };
  }

  function makeObservation(step: StepResult): InteractiveObservation {
    return {
      step,
      frame: normalizeFrame(setup.captureCharFrame()),
      state: captureState(setup, running?.inspect?.()),
      requests: requests.map((request) => ({
        ...request,
        query: { ...request.query },
      })),
    };
  }
}

function summarizeDiagnostics(steps: StepResult[]): RunManifest["diagnostics"] {
  const all = steps.flatMap((step) => step.diagnostics.layout);
  const unique = new Map<string, LayoutDiagnosticSummary>();
  for (const issue of all) {
    const key = `${issue.code}:${issue.id}:${issue.type}`;
    const current = unique.get(key);
    if (!current) {
      unique.set(key, { ...issue, occurrences: 1 });
      continue;
    }
    current.occurrences++;
    if ((issue.clippedFraction ?? 0) > (current.clippedFraction ?? 0))
      Object.assign(current, issue);
  }
  return { layoutOccurrences: all.length, layout: [...unique.values()] };
}

type LayoutDiagnosticSummary = RunManifest["diagnostics"]["layout"][number];

async function performAction(
  setup: TestRendererSetup,
  action: ScenarioAction,
  requests: CapturedRequest[],
  inspection?: AdapterInspection,
) {
  switch (action.action) {
    case "waitForText":
      return waitForFrame(
        setup,
        (frame) => frame.includes(action.text),
        `text "${action.text}"`,
        action.timeoutMs,
      );
    case "waitForAbsent":
      return waitForFrame(
        setup,
        (frame) => !frame.includes(action.text),
        `text "${action.text}" to disappear`,
        action.timeoutMs,
      );
    case "waitForFocus":
      return waitUntil(
        setup,
        () => {
          const focused = setup.renderer.currentFocusedRenderable;
          return Boolean(
            focused &&
              (!action.type || focused.constructor.name === action.type) &&
              (!action.id || focused.id === action.id),
          );
        },
        `focus ${action.type ?? ""}${action.id ? `#${action.id}` : ""}`,
        action.timeoutMs,
      );
    case "key":
      for (let index = 0; index < (action.repeat ?? 1); index++)
        setup.mockInput.pressKey(action.key as KeyInput, action.modifiers);
      return;
    case "type":
      return setup.mockInput.typeText(action.text, action.delayMs);
    case "paste":
      return setup.mockInput.pasteBracketedText(action.text);
    case "click":
      return setup.mockMouse.click(action.x, action.y);
    case "doubleClick":
      return setup.mockMouse.doubleClick(action.x, action.y);
    case "clickText": {
      const point = findText(
        setup.captureCharFrame(),
        action.text,
        action.occurrence ?? 1,
      );
      if (!point)
        throw new Error(
          `Cannot click text "${action.text}": it is not visible`,
        );
      return setup.mockMouse.click(point.x, point.y);
    }
    case "move":
      return setup.mockMouse.moveTo(action.x, action.y);
    case "drag":
      return setup.mockMouse.drag(
        action.from[0],
        action.from[1],
        action.to[0],
        action.to[1],
      );
    case "scroll":
      return setup.mockMouse.scroll(action.x, action.y, action.direction);
    case "resize":
      setup.resize(action.width, action.height);
      return;
    case "wait":
      await Bun.sleep(action.ms);
      return;
    case "capture":
      return;
    case "assert": {
      const frame = setup.captureCharFrame();
      for (const text of action.visible ?? []) {
        if (!frame.includes(text))
          throw new Error(`Assertion failed: expected visible text "${text}"`);
      }
      for (const text of action.absent ?? []) {
        if (frame.includes(text))
          throw new Error(
            `Assertion failed: expected text "${text}" to be absent`,
          );
      }
      for (const expectation of action.requests ?? [])
        assertRequest(requests, expectation);
      if (action.cursor) {
        const cursor = setup.captureSpans().cursor;
        if (cursor[0] !== action.cursor[0] || cursor[1] !== action.cursor[1]) {
          throw new Error(
            `Assertion failed: expected cursor ${action.cursor.join(",")}, got ${cursor.join(",")}`,
          );
        }
      }
      if (action.focus) {
        const focused = setup.renderer.currentFocusedRenderable;
        if (
          !focused ||
          (action.focus.type &&
            focused.constructor.name !== action.focus.type) ||
          (action.focus.id && focused.id !== action.focus.id)
        ) {
          throw new Error(
            `Assertion failed: expected focus ${JSON.stringify(action.focus)}, got ${focused ? `${focused.constructor.name}#${focused.id}` : "none"}`,
          );
        }
      }
      if (action.route && inspection?.route !== action.route) {
        throw new Error(
          `Assertion failed: expected route "${action.route}", got "${inspection?.route ?? "unavailable"}"`,
        );
      }
      if (action.dialog) {
        if (!inspection?.dialog)
          throw new Error(
            "Assertion failed: adapter inspection unavailable for dialog assertion",
          );
        for (const [key, value] of Object.entries(action.dialog)) {
          if (inspection.dialog[key as keyof typeof action.dialog] !== value) {
            throw new Error(
              `Assertion failed: expected dialog.${key}=${JSON.stringify(value)}, got ${JSON.stringify(inspection.dialog[key as keyof typeof action.dialog])}`,
            );
          }
        }
      }
      if (action.state) {
        if (!inspection?.state)
          throw new Error(
            "Assertion failed: adapter inspection unavailable for state assertion",
          );
        for (const [key, value] of Object.entries(action.state)) {
          if (inspection.state[key] !== value) {
            throw new Error(
              `Assertion failed: expected state.${key}=${JSON.stringify(value)}, got ${JSON.stringify(inspection.state[key])}`,
            );
          }
        }
      }
      return;
    }
  }
}

async function waitUntil(
  setup: TestRendererSetup,
  predicate: () => boolean,
  description: string,
  timeoutMs = 3_000,
) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() <= deadline) {
    await setup.renderOnce();
    if (predicate()) return;
    await Bun.sleep(25);
  }
  throw new Error(
    `Timed out waiting for ${description}\nLast frame:\n${setup.captureCharFrame()}`,
  );
}

function assertRequest(
  requests: CapturedRequest[],
  expectation: RequestExpectation,
) {
  const found = requests.some(
    (request) =>
      request.path === expectation.path &&
      (!expectation.method ||
        request.method === expectation.method.toUpperCase()) &&
      Object.entries(expectation.query ?? {}).every(
        ([key, value]) => request.query[key] === value,
      ),
  );
  if (found) return;
  throw new Error(
    `Assertion failed: expected request ${expectation.method ?? "GET"} ${expectation.path} ${JSON.stringify(expectation.query ?? {})}`,
  );
}

async function waitForFrame(
  setup: TestRendererSetup,
  predicate: (frame: string) => boolean,
  description: string,
  timeoutMs = 3_000,
) {
  const deadline = performance.now() + timeoutMs;
  let frame = "";
  while (performance.now() <= deadline) {
    await setup.renderOnce();
    frame = setup.captureCharFrame();
    if (predicate(frame)) return;
    await Bun.sleep(25);
  }
  throw new Error(
    `Timed out waiting for ${description}\nLast frame:\n${frame}`,
  );
}

async function settle(setup: TestRendererSetup, passes: number) {
  for (let pass = 0; pass < passes; pass++) {
    await setup.renderOnce();
    await Bun.sleep(5);
  }
}

function findText(frame: string, text: string, occurrence: number) {
  let seen = 0;
  for (const [y, line] of frame.split("\n").entries()) {
    let from = 0;
    while (from <= line.length) {
      const index = line.indexOf(text, from);
      if (index === -1) break;
      seen++;
      if (seen === occurrence) {
        const prefix = line.slice(0, index);
        return {
          x: Bun.stringWidth(prefix) + Math.floor(Bun.stringWidth(text) / 2),
          y,
        };
      }
      from = index + text.length;
    }
  }
}

function actionLabel(action: ScenarioAction) {
  if (action.action === "capture" && action.name) return action.name;
  if ("text" in action) return `${action.action}-${action.text}`;
  if (action.action === "key") return `key-${action.key}`;
  if (action.action === "resize")
    return `resize-${action.width}x${action.height}`;
  return action.action;
}
