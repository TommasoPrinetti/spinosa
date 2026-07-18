#!/usr/bin/env bun
import { runScenario, type InteractiveObservation } from "./driver";
import { loadAdapter } from "./adapter";
import { resolveScenario, resolveScenarioAdapter, validateAction } from "./scenario";
import type { ScenarioAction } from "./types";

const PROTOCOL_VERSION = 1;

async function main() {
  const [source, artifactDirectory, fixtureRoot, keep, adapterOverride] = process.argv.slice(2);
  if (!source || !artifactDirectory || !fixtureRoot) {
    throw new Error(
      "interactive worker requires scenario, artifact directory, and fixture root",
    );
  }
  const resolved = await resolveScenario(source);
  const adapterInput = resolveScenarioAdapter(
    resolved.scenario,
    resolved.source,
    adapterOverride || undefined,
  );
  const adapter = await loadAdapter(adapterInput.specifier, adapterInput.baseDirectory);
  let turn = 0;
  let requestCursor = 0;
  let previousFrame = "";
  const manifest = await runScenario({
    ...resolved,
    adapter,
    artifactDirectory,
    fixtureRoot,
    keepFixture: keep === "true",
    interact: async (controller) => {
      const ready = controller.current();
      requestCursor = ready.requests.length;
      previousFrame = ready.frame;
      write({
        event: "ready",
        protocolVersion: PROTOCOL_VERSION,
        turn,
        ...ready,
        requestCount: requestCursor,
        requests: ready.requests.filter((request) => request.error),
      });
      for await (const line of lines(Bun.stdin.stream())) {
        if (!line.trim()) continue;
        let value: unknown;
        try {
          value = JSON.parse(line);
        } catch (error) {
          write({
            event: "error",
            turn,
            error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          });
          continue;
        }
        if (isCommand(value, "quit")) {
          write({ event: "closing", turn });
          return;
        }
        if (isCommand(value, "help")) {
          write({
            event: "help",
            turn,
            commands: ["observe", "help", "quit"],
            actions: [
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
            ],
          });
          continue;
        }
        turn++;
        try {
          if (isCommand(value, "observe")) {
            emitObservation(
              "observation",
              turn,
              await controller.capture("manual-observation"),
              undefined,
              true,
            );
            continue;
          }
          validateAction(value, `interactive turn ${turn}`);
          emitObservation(
            "observation",
            turn,
            await controller.execute(value as ScenarioAction),
          );
        } catch (error) {
          const observation = await controller.capture("action-error");
          emitObservation(
            "action-error",
            turn,
            observation,
            error instanceof Error ? error.message : String(error),
            true,
          );
        }
      }
    },
  });
  write({
    event: "closed",
    protocolVersion: PROTOCOL_VERSION,
    status: manifest.status,
    artifactDirectory,
  });
  if (manifest.status === "failed") process.exitCode = 1;

  function emitObservation(
    event: "observation" | "action-error",
    nextTurn: number,
    value: InteractiveObservation,
    error?: string,
    fullFrame = false,
  ) {
    const requestCount = value.requests.length;
    const requests = value.requests.slice(requestCursor);
    requestCursor = requestCount;
    const frameDelta = changedRows(previousFrame, value.frame);
    previousFrame = value.frame;
    const { frame, ...observation } = value;
    write({
      event,
      turn: nextTurn,
      ok: !error,
      error,
      ...observation,
      ...(fullFrame ? { frame } : { frameDelta }),
      requestCount,
      requests,
    });
  }
}

function changedRows(before: string, after: string) {
  const previous = before.split("\n");
  const current = after.split("\n");
  const length = Math.max(previous.length, current.length);
  return Array.from({ length }, (_, row) => ({
    row,
    text: current[row] ?? "",
  })).filter((item) => previous[item.row] !== item.text);
}

function write(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function isCommand(
  value: unknown,
  command: string,
): value is { command: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "command" in value &&
    value.command === command
  );
}

async function* lines(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        yield buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
