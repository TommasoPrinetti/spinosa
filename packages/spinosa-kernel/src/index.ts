import "@opentui/solid/preload"
// Must be above all other imports — registers a Bun plugin that transforms
// Solid JSX through babel-preset-solid with moduleName: "@opentui/solid".
// Without it, Bun's native JSX transform uses solid-js/h/jsx-runtime which
// creates standard DOM VNodes instead of OpenTUI Renderable nodes, producing
// a blank TUI. This only triggers when bunfig.toml is NOT loaded (i.e. when
// CWD ≠ packages/spinosa-kernel, which happens in the global spinosa command
// since bun loads bunfig.toml relative to CWD, not the entry file).
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { RunCommand } from "./cli/cmd/run"
import { GenerateCommand } from "./cli/cmd/generate"
import { ConsoleCommand } from "./cli/cmd/account"
import { ProvidersCommand } from "./cli/cmd/providers"
import { AgentCommand } from "./cli/cmd/agent"
import { UpgradeCommand } from "./cli/cmd/upgrade"
import { PreflightCommand } from "./cli/cmd/preflight"
import { UninstallCommand } from "./cli/cmd/uninstall"
import { ModelsCommand } from "./cli/cmd/models"
import { UI } from "./cli/ui"
import { InstallationVersion } from "@spinosa/kernel-core/installation/version"
import { FormatError } from "./cli/error"
import { ServeCommand } from "./cli/cmd/serve"
import { DebugCommand } from "./cli/cmd/debug"
import { StatsCommand } from "./cli/cmd/stats"
import { McpCommand } from "./cli/cmd/mcp"
import { ExportCommand } from "./cli/cmd/export"
import { ImportCommand } from "./cli/cmd/import"
import { AttachCommand } from "./cli/cmd/attach"
import { TuiThreadCommand } from "./cli/cmd/tui"
import { EOL } from "os"
import { WebCommand } from "./cli/cmd/web"
import { PrCommand } from "./cli/cmd/pr"
import { SessionCommand } from "./cli/cmd/session"
import { DbCommand } from "./cli/cmd/db"
import { errorMessage } from "./util/error"
import { PluginCommand } from "./cli/cmd/plug"
import { WorkspaceNewCommand } from "./cli/cmd/workspace-new"
import { WorkspaceAddCommand } from "./cli/cmd/workspace-add"
import { WorkspaceUpdateCommand } from "./cli/cmd/workspace-update"
import { WorkspaceStatusCommand } from "./cli/cmd/workspace-status"
import { WorkspaceListCommand } from "./cli/cmd/workspace-list"
import { DoctorCommand } from "./cli/cmd/doctor"
import { StartupAutocleanCommand } from "./cli/cmd/startup-autoclean"
import { VersionCommand } from "./cli/cmd/version"
import { Heap } from "./cli/heap"
import { bootLog } from "@spinosa/kernel-core/observability/boot-log"

const args = hideBin(process.argv)
const { pid, ppid } = process

bootLog("kernel.init", "kernel entry parsing args", {
  argv: args.join(" "),
  cwd: process.cwd(),
  pid,
  ppid,
  SPINOSA_TEMPLATE_ROOT: process.env.SPINOSA_TEMPLATE_ROOT ?? undefined,
  SPINOSA_PRODUCT: process.env.SPINOSA_PRODUCT ?? undefined,
  SPINOSA_HOME: process.env.SPINOSA_HOME ?? undefined,
  SPINOSA_PRINT_LOGS: process.env.SPINOSA_PRINT_LOGS ?? undefined,
  SPINOSA_LOG_LEVEL: process.env.SPINOSA_LOG_LEVEL ?? undefined,
  BUN_VERSION: process.env.BUN_VERSION ?? undefined,
})

function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("spinosa ")) {
    process.stderr.write(UI.logo() + EOL + EOL)
    process.stderr.write(text + EOL)
    return
  }
  process.stderr.write(out)
}

const cli = yargs(args)
  .parserConfiguration({ "populate--": true })
  .scriptName("spinosa")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .option("verbose", {
    describe: "print boot diagnostics to stderr",
    type: "boolean",
  })
  .option("pure", {
    describe: "run without external plugins",
    type: "boolean",
  })
  .middleware(async (opts) => {
    if (opts.printLogs) process.env.SPINOSA_PRINT_LOGS = "1"
    if (opts.logLevel) process.env.SPINOSA_LOG_LEVEL = opts.logLevel
    if (opts.verbose) process.env.SPINOSA_VERBOSE_BOOT = "1"
    if (opts.pure) {
      process.env.SPINOSA_PURE = "1"
    }

    Heap.start()

    process.env.AGENT = "1"
    process.env.SPINOSA = "1"
    process.env.SPINOSA_PID = String(process.pid)
  })
  .usage("")
  .completion("completion", "generate shell completion script")
  .command(McpCommand)
  .command(TuiThreadCommand)
  .command(AttachCommand)
  .command(RunCommand)
  .command(GenerateCommand)
  .command(DebugCommand)
  .command(ConsoleCommand)
  .command(ProvidersCommand)
  .command(AgentCommand)
  .command(UpgradeCommand)
  .command(PreflightCommand)
  .command(UninstallCommand)
  .command(ServeCommand)
  .command(WebCommand)
  .command(ModelsCommand)
  .command(StatsCommand)
  .command(ExportCommand)
  .command(ImportCommand)
  .command(PrCommand)
  .command(SessionCommand)
  .command(PluginCommand)
  .command(DbCommand)
  .command(WorkspaceNewCommand)
  .command(WorkspaceAddCommand)
  .command(WorkspaceUpdateCommand)
  .command(WorkspaceStatusCommand)
  .command(WorkspaceListCommand)
  .command(DoctorCommand)
  .command(StartupAutocleanCommand)
  .command(VersionCommand)
  .fail((msg, err) => {
    if (
      msg?.startsWith("Unknown argument") ||
      msg?.startsWith("Not enough non-option arguments") ||
      msg?.startsWith("Invalid values:")
    ) {
      if (err) throw err
      cli.showHelp(show)
    }
    if (err) throw err
    process.exit(1)
  })
  .strict()

try {
  if (args.includes("-h") || args.includes("--help")) {
    bootLog("kernel.help", "showing help")
    await cli.parse(args, (err: Error | undefined, _argv: unknown, out: string) => {
      if (err) throw err
      if (!out) return
      show(out)
    })
  } else {
    bootLog("kernel.parse", "parsing yargs command")
    await cli.parse()
    bootLog("kernel.parse.done", "yargs command finished")
  }
} catch (e) {
  bootLog("kernel.error", "unhandled error", { error: String(e) })
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  if (formatted === undefined) {
    UI.error("Unexpected error" + EOL)
    process.stderr.write(errorMessage(e) + EOL)
  }
  process.exitCode = 1
} finally {
  bootLog("kernel.exit", "exiting process")
  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit()
}
