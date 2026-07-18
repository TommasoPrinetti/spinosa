export type Modifiers = {
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  super?: boolean;
  hyper?: boolean;
};

export type RequestExpectation = {
  path: string;
  method?: string;
  query?: Record<string, string>;
};

export type ScenarioAction =
  | { action: "waitForText"; text: string; timeoutMs?: number }
  | { action: "waitForAbsent"; text: string; timeoutMs?: number }
  | { action: "waitForFocus"; type?: string; id?: string; timeoutMs?: number }
  | { action: "key"; key: string; modifiers?: Modifiers; repeat?: number }
  | { action: "type"; text: string; delayMs?: number }
  | { action: "paste"; text: string }
  | { action: "click"; x: number; y: number }
  | { action: "doubleClick"; x: number; y: number }
  | { action: "clickText"; text: string; occurrence?: number }
  | { action: "move"; x: number; y: number }
  | { action: "drag"; from: [number, number]; to: [number, number] }
  | {
      action: "scroll";
      x: number;
      y: number;
      direction: "up" | "down" | "left" | "right";
    }
  | { action: "resize"; width: number; height: number }
  | { action: "wait"; ms: number }
  | { action: "capture"; name?: string }
  | {
      action: "assert";
      visible?: string[];
      absent?: string[];
      requests?: RequestExpectation[];
      cursor?: [number, number];
      focus?: { type?: string; id?: string };
      route?: string;
      dialog?: {
        open?: boolean;
        depth?: number;
        size?: "medium" | "large" | "xlarge";
      };
      state?: { ready?: boolean; sessionCount?: number };
    };

export type TuiScenario = {
  name: string;
  description: string;
  /** Trusted adapter module used by the CLI. Relative paths resolve from the scenario file. */
  adapter?: string;
  terminal?: { width?: number; height?: number };
  /** Adapter-owned fixture data. The generic runner deliberately does not interpret it. */
  fixture?: Record<string, unknown>;
  route?: Record<string, unknown>;
  steps: ScenarioAction[];
};

export type AdapterInspection = {
  route?: string;
  dialog?: {
    open?: boolean;
    depth?: number;
    size?: "medium" | "large" | "xlarge";
  };
  state?: {
    ready?: boolean;
    sessionCount?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type AdapterPreparation = {
  cwd?: string;
  tokens?: Record<string, string>;
  fixture?: Record<string, unknown>;
};

export type AdapterPrepareContext = {
  scenario: TuiScenario;
  source: string;
  fixtureRoot: string;
  home: string;
};

export type AdapterLaunchContext = AdapterPrepareContext & {
  scenario: TuiScenario;
  setup: import("@opentui/core/testing").TestRendererSetup;
  preparation: AdapterPreparation;
};

export type RunningTui = {
  requests?: CapturedRequest[];
  inspect?: () => AdapterInspection | undefined;
  dispose: () => void | Promise<void>;
};

/**
 * Integration boundary between the generic renderer driver and an application.
 * Adapters own app mounting, backend fixtures, and semantic state inspection.
 */
export type TuiAgentAdapter = {
  name: string;
  prepare?: (context: AdapterPrepareContext) => AdapterPreparation | Promise<AdapterPreparation>;
  launch: (context: AdapterLaunchContext) => RunningTui | Promise<RunningTui>;
};

export type CapturedRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  status?: number;
  durationMs?: number;
  error?: string;
};

export type LayoutDiagnostic = {
  code: "fully-offscreen" | "viewport-overflow" | "zero-size-focus-target";
  severity: "warning" | "error";
  id: string;
  type: string;
  bounds: { x: number; y: number; width: number; height: number };
  overflow?: { left: number; top: number; right: number; bottom: number };
  clippedFraction?: number;
};

export type StepResult = {
  index: number;
  action: string;
  label: string;
  durationMs: number;
  frame: string;
  spans: string;
  svg: string;
  tree: string;
  state: string;
  diagnostics: { layout: LayoutDiagnostic[] };
};

export type RunManifest = {
  schemaVersion: 1;
  scenario: { name: string; description: string; source: string };
  status: "passed" | "failed";
  startedAt: string;
  durationMs: number;
  terminal: { width: number; height: number };
  adapter: string;
  fixture: { root: string; home: string; cwd?: string; data?: Record<string, unknown> };
  steps: StepResult[];
  requests: CapturedRequest[];
  diagnostics: {
    layoutOccurrences: number;
    layout: Array<LayoutDiagnostic & { occurrences: number }>;
  };
  error?: string;
};
