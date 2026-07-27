import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["SPINOSA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["SPINOSA_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("SPINOSA_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  SPINOSA_AUTO_HEAP_SNAPSHOT: truthy("SPINOSA_AUTO_HEAP_SNAPSHOT"),
  SPINOSA_GIT_BASH_PATH: process.env["SPINOSA_GIT_BASH_PATH"],
  SPINOSA_CONFIG: process.env["SPINOSA_CONFIG"],
  SPINOSA_CONFIG_CONTENT: process.env["SPINOSA_CONFIG_CONTENT"],
  SPINOSA_DISABLE_AUTOUPDATE: truthy("SPINOSA_DISABLE_AUTOUPDATE"),
  SPINOSA_ALWAYS_NOTIFY_UPDATE: truthy("SPINOSA_ALWAYS_NOTIFY_UPDATE"),
  SPINOSA_DISABLE_PRUNE: truthy("SPINOSA_DISABLE_PRUNE"),
  SPINOSA_DISABLE_TERMINAL_TITLE: truthy("SPINOSA_DISABLE_TERMINAL_TITLE"),
  SPINOSA_SHOW_TTFD: truthy("SPINOSA_SHOW_TTFD"),
  SPINOSA_DISABLE_AUTOCOMPACT: truthy("SPINOSA_DISABLE_AUTOCOMPACT"),
  SPINOSA_DISABLE_MODELS_FETCH: truthy("SPINOSA_DISABLE_MODELS_FETCH"),
  SPINOSA_DISABLE_MOUSE: truthy("SPINOSA_DISABLE_MOUSE"),
  SPINOSA_FAKE_VCS: process.env["SPINOSA_FAKE_VCS"],
  SPINOSA_SERVER_PASSWORD: process.env["SPINOSA_SERVER_PASSWORD"],
  SPINOSA_SERVER_USERNAME: process.env["SPINOSA_SERVER_USERNAME"],
  SPINOSA_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("SPINOSA_DISABLE_FFF"),

  // Experimental
  SPINOSA_EXPERIMENTAL_FILEWATCHER: Config.boolean("SPINOSA_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  SPINOSA_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("SPINOSA_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  SPINOSA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("SPINOSA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  SPINOSA_MODELS_URL: process.env["SPINOSA_MODELS_URL"],
  SPINOSA_MODELS_PATH: process.env["SPINOSA_MODELS_PATH"],
  SPINOSA_DB: process.env["SPINOSA_DB"],

  SPINOSA_WORKSPACE_ID: process.env["SPINOSA_WORKSPACE_ID"],
  SPINOSA_EXPERIMENTAL_WORKSPACES: enabledByExperimental("SPINOSA_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get SPINOSA_DISABLE_PROJECT_CONFIG() {
    return truthy("SPINOSA_DISABLE_PROJECT_CONFIG")
  },
  get SPINOSA_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("SPINOSA_EXPERIMENTAL_REFERENCES")
  },
  get SPINOSA_TUI_CONFIG() {
    return process.env["SPINOSA_TUI_CONFIG"]
  },
  get SPINOSA_CONFIG_DIR() {
    return process.env["SPINOSA_CONFIG_DIR"]
  },
  get SPINOSA_PURE() {
    return truthy("SPINOSA_PURE")
  },
  get SPINOSA_PERMISSION() {
    return process.env["SPINOSA_PERMISSION"]
  },
  get SPINOSA_PLUGIN_META_FILE() {
    return process.env["SPINOSA_PLUGIN_META_FILE"]
  },
  get SPINOSA_CLIENT() {
    return process.env["SPINOSA_CLIENT"] ?? "cli"
  },
}
