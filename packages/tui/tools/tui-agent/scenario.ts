import path from "node:path";
import { existsSync } from "node:fs";
import type { ScenarioAction, TuiScenario } from "./types";

export const scenarioDirectory = path.join(import.meta.dir, "scenarios");

export async function listScenarios() {
  if (!existsSync(scenarioDirectory)) return [];
  const glob = new Bun.Glob("*.json");
  const result: Array<{ name: string; description: string; path: string }> = [];
  for await (const file of glob.scan({
    cwd: scenarioDirectory,
    absolute: true,
  })) {
    const scenario = await loadScenarioFile(file);
    result.push({
      name: scenario.name,
      description: scenario.description,
      path: file,
    });
  }
  return result.toSorted((a, b) => a.name.localeCompare(b.name));
}

export async function resolveScenario(input: string) {
  const builtIn = path.join(scenarioDirectory, `${input}.json`);
  const source = (await Bun.file(builtIn).exists())
    ? builtIn
    : path.resolve(input);
  if (!(await Bun.file(source).exists())) {
    const names = (await listScenarios()).map((item) => item.name).join(", ");
    throw new Error(
      `Scenario not found: ${input}\nBuilt-in scenarios: ${names || "none"}`,
    );
  }
  return { scenario: await loadScenarioFile(source), source };
}

export function resolveScenarioAdapter(
  scenario: TuiScenario,
  source: string,
  override?: string,
) {
  const specifier = override ?? scenario.adapter;
  if (!specifier) {
    throw new Error(
      `Scenario ${JSON.stringify(scenario.name)} does not declare an adapter\n` +
        `Add "adapter" to the scenario or pass --adapter <module>.`,
    );
  }
  return {
    specifier,
    baseDirectory: path.dirname(source),
  };
}

async function loadScenarioFile(file: string): Promise<TuiScenario> {
  let value: unknown;
  try {
    value = await Bun.file(file).json();
  } catch (error) {
    throw new Error(
      `Invalid scenario JSON at ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return validateScenario(value, file);
}

export function validateScenario(
  value: unknown,
  source = "scenario",
): TuiScenario {
  if (!isRecord(value)) throw new Error(`${source}: expected a JSON object`);
  if (!nonEmpty(value.name))
    throw new Error(`${source}: "name" must be a non-empty string`);
  if (!nonEmpty(value.description))
    throw new Error(`${source}: "description" must be a non-empty string`);
  if (value.adapter !== undefined && !nonEmpty(value.adapter))
    throw new Error(`${source}: "adapter" must be a non-empty string`);
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    throw new Error(`${source}: "steps" must contain at least one action`);
  }
  value.steps.forEach((step, index) =>
    validateAction(step, `${source}: steps[${index}]`),
  );
  const terminal = value.terminal;
  if (terminal !== undefined) {
    if (!isRecord(terminal))
      throw new Error(`${source}: "terminal" must be an object`);
    for (const key of ["width", "height"] as const) {
      if (
        terminal[key] !== undefined &&
        (!Number.isInteger(terminal[key]) || Number(terminal[key]) <= 0)
      ) {
        throw new Error(
          `${source}: terminal.${key} must be a positive integer`,
        );
      }
    }
  }
  if (value.fixture !== undefined && !isRecord(value.fixture))
    throw new Error(`${source}: "fixture" must be an object`);
  if (isRecord(value.fixture)) {
    if (
      value.fixture.sessions !== undefined &&
      !Array.isArray(value.fixture.sessions)
    ) {
      throw new Error(`${source}: fixture.sessions must be an array`);
    }
    if (
      value.fixture.files !== undefined &&
      !Array.isArray(value.fixture.files)
    ) {
      throw new Error(`${source}: fixture.files must be an array`);
    }
    if (
      value.fixture.responses !== undefined &&
      !Array.isArray(value.fixture.responses)
    ) {
      throw new Error(`${source}: fixture.responses must be an array`);
    }
  }
  return value as TuiScenario;
}

export function validateAction(
  value: unknown,
  source: string,
): asserts value is ScenarioAction {
  if (!isRecord(value) || !nonEmpty(value.action))
    throw new Error(`${source}: missing string "action"`);
  const supported = new Set([
    "waitForText",
    "waitForAbsent",
    "waitForFocus",
    "key",
    "type",
    "paste",
    "click",
    "doubleClick",
    "clickText",
    "move",
    "drag",
    "scroll",
    "resize",
    "wait",
    "capture",
    "assert",
  ]);
  if (!supported.has(value.action))
    throw new Error(`${source}: unsupported action "${value.action}"`);
  if (
    ["waitForText", "waitForAbsent", "type", "paste", "clickText"].includes(
      value.action,
    ) &&
    !nonEmpty(value.text)
  ) {
    throw new Error(
      `${source}: action "${value.action}" requires non-empty "text"`,
    );
  }
  if (value.action === "key" && !nonEmpty(value.key))
    throw new Error(`${source}: key action requires "key"`);
  if (
    value.action === "waitForFocus" &&
    !nonEmpty(value.type) &&
    !nonEmpty(value.id)
  ) {
    throw new Error(`${source}: waitForFocus requires "type" or "id"`);
  }
  if (
    value.action === "assert" &&
    !value.visible &&
    !value.absent &&
    !value.requests &&
    !value.cursor &&
    !value.focus &&
    !value.route &&
    !value.dialog &&
    !value.state
  ) {
    throw new Error(`${source}: assert requires at least one expectation`);
  }
}

export function substituteScenario(
  scenario: TuiScenario,
  values: Record<string, string>,
): TuiScenario {
  function visit(value: unknown): unknown {
    if (typeof value === "string") {
      return Object.entries(values).reduce(
        (result, [token, replacement]) =>
          result.replaceAll(`$${token}`, replacement),
        value,
      );
    }
    if (Array.isArray(value)) return value.map(visit);
    if (isRecord(value))
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, visit(item)]),
      );
    return value;
  }
  return visit(scenario) as TuiScenario;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
