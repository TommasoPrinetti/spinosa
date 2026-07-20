import { mock } from "bun:test";
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder";
import { Global } from "@opencode-ai/core/global";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { Effect, Fiber } from "effect";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { AdapterInspection, AdapterLaunchContext, AdapterPrepareContext, CapturedRequest, TuiAgentAdapter } from "tui-agent-use/types";

const OPENCODE_URL = (process.env.OPENCODE_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");

/**
 * Quick health check — verifies the OpenCode server is reachable.
 * Throws a clear error if not, avoiding a silent hang.
 */
async function checkServer() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${OPENCODE_URL}/session?limit=1`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot connect to OpenCode at ${OPENCODE_URL}\n  ${msg}\n\n` +
        `Make sure the OpenCode daemon is running:\n  spinosa  (or opencode serve)\n\n` +
        `Override the URL with OPENCODE_URL env var if using a different port.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live Spinosa adapter.
 *
 * Connects to YOUR real OpenCode instance at OPENCODE_URL (default 127.0.0.1:8787).
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
    return { cwd: context.fixtureRoot };
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
    process.env.OPENCODE_TEST_HOME = context.home;
    process.env.OPENCODE_FAST_BOOT = "1";
    if (process.env.OPENCODE_ROUTE) delete process.env.OPENCODE_ROUTE;

    // Real fetch proxy — request goes to your real OpenCode instance
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const target = new URL(url.pathname + url.search, OPENCODE_URL);
      const request = new Request(target, init);

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
    const ready = new Promise<void>((resolve) => (markReady = resolve));

    const { run } = await import("../../../src/app");
    const fiber = Effect.runFork(
      run({
        url: OPENCODE_URL,
        directory: context.preparation.cwd ?? context.fixtureRoot,
        fetch,
        events: {
          subscribe: async () => () => {},
        },
        args: {},
        config: {
          plugin_enabled: {},
        } as any,
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

    await ready;

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
