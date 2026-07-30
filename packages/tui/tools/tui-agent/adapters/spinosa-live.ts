import { mock } from "bun:test";
import { AppNodeBuilder } from "@spinosa/kernel-core/effect/app-node-builder";
import { Global } from "@spinosa/kernel-core/global";
import type { TuiPluginApi } from "@spinosa/plugin/tui";
import { readWorkspaceMeta } from "@spinosa/core/workspace/meta";
import { Cause, Effect, Exit, Fiber } from "effect";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createTuiResolvedConfig } from "../../../test/fixture/tui-runtime";
import type { AdapterInspection, AdapterLaunchContext, AdapterPrepareContext, CapturedRequest, TuiAgentAdapter } from "tui-agent-use";

const SPINOSA_URL = (process.env.SPINOSA_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");

/**
 * Quick health check — verifies the Spinosa server is reachable.
 * Throws a clear error if not, avoiding a silent hang.
 */
async function checkServer() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${SPINOSA_URL}/session?limit=1`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot connect to Spinosa at ${SPINOSA_URL}\n  ${msg}\n\n` +
        `Make sure the Spinosa daemon is running:\n  spinosa serve\n\n` +
        `Override the URL with SPINOSA_URL env var if using a different port.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live Spinosa adapter.
 *
 * Connects to YOUR real Spinosa instance at SPINOSA_URL (default 127.0.0.1:8787).
 * The TUI runs headless in the test renderer (no terminal pollution),
 * but all data — sessions, workspaces, chat — is REAL.
 *
 * This lets you test the full flow including:
 *   - Typing a prompt and getting a real LLM response
 *   - Your actual workspaces and sessions
 *   - /session, /new, /fork, /compact with real data
 *   - Chat submission and response rendering
 */
const adapter: TuiAgentAdapter = {
  name: "spinosa-live",

  async prepare(context: AdapterPrepareContext) {
    await checkServer();
    const stateDirectory = path.join(context.home, ".local", "state", "opencode");
    mkdirSync(stateDirectory, { recursive: true });
    const cwd = process.env.SPINOSA_LIVE_DIRECTORY ?? context.fixtureRoot;
    if (process.env.SPINOSA_LIVE_DIRECTORY) {
      const meta = await readWorkspaceMeta(cwd);
      if (!meta?.workspaceID) throw new Error(`Invalid Spinosa workspace: ${cwd}`);
      const metadataDirectory = path.join(context.home, ".spinosa", "metadata");
      mkdirSync(metadataDirectory, { recursive: true });
      await Bun.write(path.join(metadataDirectory, "workspaces.json"), `${JSON.stringify({
        schemaVersion: 1,
        workspaces: [{
          id: meta.workspaceID,
          path: cwd,
          name: meta.projectName,
          tags: [],
          state: { presence: "present", setupStatus: meta.setupStatus },
          registration: { registeredAt: new Date().toISOString().slice(0, 10) },
        }],
      }, null, 2)}\n`);
    }
    return { cwd };
  },

  async launch(context: AdapterLaunchContext) {
    const requests: CapturedRequest[] = [];

    // Mock createCliRenderer to use the test renderer (still need headless rendering)
    const core = await import("@opentui/core");
    mock.module("@opentui/core", () => ({
      ...core,
      createCliRenderer: async () => context.setup.renderer,
    }));

    // Point HOME to an isolated temp dir so the TUI doesn't touch your real config
    process.env.HOME = context.home;
    process.env.SPINOSA_TEST_HOME = context.home;
    process.env.SPINOSA_HOME = path.join(context.home, ".spinosa");
    process.env.SPINOSA_FAST_BOOT = "1";
    if (process.env.SPINOSA_ROUTE) delete process.env.SPINOSA_ROUTE;

    // Real fetch proxy — request goes to your real Spinosa instance
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const source = input instanceof Request ? input : new Request(input, init);
      const url = new URL(source.url);
      const target = new URL(url.pathname + url.search, SPINOSA_URL);
      const request = new Request(target, source);

      const record: CapturedRequest = {
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
      };
      requests.push(record);

      const started = performance.now();
      try {
        const response = await globalThis.fetch(request);
        record.status = response.status;
        record.durationMs = Math.round(performance.now() - started);
        return response;
      } catch (error) {
        record.durationMs = Math.round(performance.now() - started);
        record.error = error instanceof Error ? error.message : String(error);
        throw error;
      }
    }) as typeof globalThis.fetch;

    let api: TuiPluginApi | undefined;
    let disposeSlots: (() => void) | undefined;
    let markReady!: () => void;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      markReady = resolve;
      readyTimer = setTimeout(() => reject(new Error(
        "TUI launch timed out after 15s.\n" +
        "The server at " + SPINOSA_URL + " is responding, but the TUI couldn't boot.\n" +
        "This typically means a fetch to the server returned unexpected data.\n" +
        "Check the server logs or try running with SPINOSA_FAST_BOOT=1"
      )), 15000);
    });

    const { run } = await import("../../../src/app");
    const fiber = Effect.runFork(
      run({
        url: SPINOSA_URL,
        directory: context.preparation.cwd ?? context.fixtureRoot,
        fetch,
        args: {},
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        pluginHost: {
          async start(input) {
            api = input.api;
            const slots = input.runtime.setupSlots(input.api);
            disposeSlots = () => slots.dispose();
            markReady();
          },
          async dispose() {
            disposeSlots?.();
          },
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    );

    const stopped = Effect.runPromise(Fiber.await(fiber)).then((exit) => {
      if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
      throw new Error("TUI stopped before startup completed");
    });
    await Promise.race([ready, stopped]).finally(() => {
      if (readyTimer) clearTimeout(readyTimer);
    });

    return {
      requests,
      inspect: (): AdapterInspection | undefined =>
        api
          ? {
              route: api.route.current.name,
              state: {
                ready: api.state.ready,
                sessionCount: api.state.session.count(),
              },
              mode: api.mode.current(),
            }
          : undefined,
      async dispose() {
        await Effect.runPromise(
          Fiber.interrupt(fiber).pipe(Effect.timeout("1 second")),
        ).catch(() => undefined);
        mock.restore();
      },
    };
  },
};

export default adapter;
