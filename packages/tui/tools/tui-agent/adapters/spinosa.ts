import { mock } from "bun:test";
import { AppNodeBuilder } from "@spinosa/kernel-core/effect/app-node-builder";
import { Global } from "@spinosa/kernel-core/global";
import type { TuiPluginApi } from "@spinosa/plugin/tui";
import { Effect, Fiber } from "effect";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createWorkspaceID } from "@spinosa/core/workspace/identity";
import { createTuiResolvedConfig } from "../../../test/fixture/tui-runtime";
import {
  createEventSource,
  createFetch,
  json,
} from "../../../test/fixture/tui-sdk";
import type {
  AdapterInspection,
  AdapterPrepareContext,
  CapturedRequest,
  TuiAgentAdapter,
  TuiScenario,
} from "tui-agent-use";

type SpinosaFixture = {
  workspace?: {
    name?: string;
    setupStatus?: "not_started" | "importing" | "cli_started" | "workspace_started";
  };
  sessions?: Array<{
    id: string;
    title: string;
    directory: string;
    updated?: number;
    created?: number;
    parentID?: string;
    workspaceID?: string;
  }>;
  kv?: Record<string, unknown>;
  files?: Array<{ path: string; content: string }>;
  responses?: Array<{
    path: string;
    query?: Record<string, string>;
    status?: number;
    body: unknown;
  }>;
};

const adapter: TuiAgentAdapter = {
  name: "spinosa",
  async prepare(context) {
    const fixture = spinosaFixture(context.scenario);
    const workspace = fixture.workspace
      ? await createWorkspace(context, fixture.workspace)
      : undefined;
    if (fixture.kv) {
      const stateDirectory = path.join(context.home, ".local", "state", "opencode");
      mkdirSync(stateDirectory, { recursive: true });
      await Bun.write(
        path.join(stateDirectory, "kv.json"),
        `${JSON.stringify(fixture.kv, null, 2)}\n`,
      );
    }
    if (workspace) {
      for (const file of fixture.files ?? []) {
        const target = path.resolve(workspace, file.path);
        if (!target.startsWith(`${workspace}${path.sep}`))
          throw new Error(`Fixture file escapes workspace: ${file.path}`);
        mkdirSync(path.dirname(target), { recursive: true });
        await Bun.write(target, file.content);
      }
    }
    return {
      cwd: workspace,
      tokens: { WORKSPACE: workspace ?? "" },
      fixture: workspace ? { workspace } : undefined,
    };
  },

  async launch(context) {
    const fixture = spinosaFixture(context.scenario);
    const requests: CapturedRequest[] = [];
    const core = await import("@opentui/core");
    mock.module("@opentui/core", () => ({
      ...core,
      createCliRenderer: async () => context.setup.renderer,
    }));
    const previous = captureProcessState();
    process.env.HOME = context.home;
    process.env.SPINOSA_TEST_HOME = context.home;
    process.env.SPINOSA_HOME = path.join(context.home, ".spinosa");
    process.env.SPINOSA_FAST_BOOT = "1";
    if (context.scenario.route)
      process.env.SPINOSA_ROUTE = JSON.stringify(context.scenario.route);
    else delete process.env.SPINOSA_ROUTE;
    if (context.preparation.cwd) process.chdir(context.preparation.cwd);

    const events = createEventSource();
    const provider = {
      id: "test",
      name: "TUI Agent Test Provider",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          cost: { input: 0, output: 0 },
        },
      },
    };
    const sessions = (fixture.sessions ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      slug: item.id,
      projectID: "proj_tui_agent",
      directory: item.directory,
      version: "0.0.0-tui-agent",
      parentID: item.parentID,
      workspaceID: item.workspaceID,
      time: { created: item.created ?? 1, updated: item.updated ?? 1 },
    }));
    const base = createFetch((url) => {
      const custom = fixture.responses?.find(
        (response) =>
          response.path === url.pathname &&
          Object.entries(response.query ?? {}).every(
            ([key, value]) => url.searchParams.get(key) === value,
          ),
      );
      if (custom) return json(custom.body, { status: custom.status ?? 200 });
      if (url.pathname === "/session") {
        const directory = url.searchParams.get("directory");
        return json(
          directory
            ? sessions.filter((session) => session.directory === directory)
            : sessions,
        );
      }
      if (url.pathname === "/session/status") return json({});
      const sessionResource = url.pathname.match(/^\/session\/([^/]+)$/);
      if (sessionResource) {
        const session = sessions.find(
          (item) => item.id === decodeURIComponent(sessionResource[1]!),
        );
        return session
          ? json(session)
          : json({ message: "Session not found" }, { status: 404 });
      }
      if (/^\/session\/[^/]+\/message$/.test(url.pathname)) return json([]);
      if (/^\/session\/[^/]+\/(todo|diff)$/.test(url.pathname)) return json([]);
      if (url.pathname === "/config/providers")
        return json({ providers: [provider], default: { test: "test-model" } });
      if (url.pathname === "/provider")
        return json({
          all: [provider],
          default: { test: "test-model" },
          connected: ["test"],
        });
      if (url.pathname === "/path")
        return json({
          home: context.home,
          state: path.join(context.home, ".local", "state", "opencode"),
          config: path.join(context.home, ".config", "opencode"),
          worktree: context.fixtureRoot,
          directory: context.preparation.cwd ?? context.fixtureRoot,
        });
      if (url.pathname === "/api/location")
        return json({
          directory: context.preparation.cwd ?? context.fixtureRoot,
          project: {
            id: "proj_tui_agent",
            directory: context.preparation.cwd ?? context.fixtureRoot,
          },
        });
      if (/^\/project\/[^/]+\/directories$/.test(url.pathname))
        return json([{ directory: context.preparation.cwd ?? context.fixtureRoot }]);
    }, events);
    const fetch = captureFetch(base.fetch, requests);
    let api: TuiPluginApi | undefined;
    let disposeSlots: (() => void) | undefined;
    let markReady!: () => void;
    const ready = new Promise<void>((resolve) => (markReady = resolve));
    const { run } = await import("../../../src/app");
    const fiber = Effect.runFork(
      run({
        url: "http://tui-agent.test",
        directory: context.preparation.cwd,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch,
        events: events.source,
        args: {},
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
              routeState: plainRoute(api.route.current),
              dialog: {
                open: api.ui.dialog.open,
                depth: api.ui.dialog.depth,
                size: api.ui.dialog.size,
              },
              state: {
                ready: api.state.ready,
                sessionCount: api.state.session.count(),
                path: {
                  state: api.state.path.state,
                  config: api.state.path.config,
                  worktree: api.state.path.worktree,
                  directory: api.state.path.directory,
                },
              },
              mode: api.mode.current(),
            }
          : undefined,
      async dispose() {
        await Effect.runPromise(
          Fiber.interrupt(fiber).pipe(Effect.timeout("1 second")),
        ).catch(() => undefined);
        restoreProcessState(previous);
        mock.restore();
      },
    };
  },
};

function plainRoute(route: TuiPluginApi["route"]["current"]) {
  const sessionID =
    "params" in route &&
    route.params &&
    "sessionID" in route.params &&
    typeof route.params.sessionID === "string"
      ? route.params.sessionID
      : undefined;
  return sessionID ? { name: route.name, params: { sessionID } } : { name: route.name };
}

export default adapter;

function spinosaFixture(scenario: TuiScenario) {
  return (scenario.fixture ?? {}) as SpinosaFixture;
}

function captureFetch(base: typeof globalThis.fetch, requests: CapturedRequest[]) {
  return (async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(request instanceof Request ? request.url : String(request));
    const record: CapturedRequest = {
      method: (request instanceof Request ? request.method : (init?.method ?? "GET")).toUpperCase(),
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
    };
    requests.push(record);
    const started = performance.now();
    try {
      const response = await base(request, init);
      record.status = response.status;
      record.durationMs = Math.round(performance.now() - started);
      return response;
    } catch (error) {
      record.durationMs = Math.round(performance.now() - started);
      record.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }) as typeof globalThis.fetch;
}

async function createWorkspace(
  context: AdapterPrepareContext,
  input: NonNullable<SpinosaFixture["workspace"]>,
) {
  const name = input.name ?? "agent-workspace";
  const workspace = path.join(context.fixtureRoot, name);
  const id = createWorkspaceID();
  for (const directory of [".spinosa", "raw", "maps", "logs", "agent_reports", "system"])
    mkdirSync(path.join(workspace, directory), { recursive: true });
  await Bun.write(
    path.join(workspace, ".spinosa", "workspace"),
    [
      `workspace_id: ${id}`,
      `project_name: ${name}`,
      `setup_status: ${input.setupStatus ?? "workspace_started"}`,
      "framework_version: 0.1.0",
    ].join("\n"),
  );
  const metadata = path.join(context.home, ".spinosa", "metadata");
  mkdirSync(metadata, { recursive: true });
  await Bun.write(
    path.join(metadata, "workspaces.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      workspaces: [
        {
          id,
          path: workspace,
          name,
          tags: [],
          state: {
            presence: "present",
            setupStatus: input.setupStatus ?? "workspace_started",
          },
          registration: { registeredAt: new Date().toISOString() },
        },
      ],
    }, null, 2)}\n`,
  );
  return workspace;
}

function captureProcessState() {
  return {
    cwd: process.cwd(),
    env: Object.fromEntries(
      ["HOME", "SPINOSA_TEST_HOME", "SPINOSA_HOME", "SPINOSA_ROUTE", "SPINOSA_FAST_BOOT"].map(
        (key) => [key, process.env[key]],
      ),
    ),
  };
}

function restoreProcessState(previous: ReturnType<typeof captureProcessState>) {
  for (const [key, value] of Object.entries(previous.env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (process.cwd() !== previous.cwd) process.chdir(previous.cwd);
}
