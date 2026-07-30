/** OpenTUI Solid transform — required or the TUI paints a blank black screen. */
export const OPENTUI_SOLID_PRELOAD = "@opentui/solid/preload"

export type KernelBunLaunch = {
  /** Absolute path to the Bun binary (or `process.execPath`). */
  bunPath: string
  /**
   * Framework / install root that owns `node_modules` and package resolution
   * (e.g. `~/.spinosa/versions/1.0.3-beta.2` or the monorepo root).
   */
  frameworkRoot: string
  /** Absolute path to `packages/spinosa-kernel/src/index.ts`. */
  kernelEntry: string
  /** CLI args forwarded to the kernel (`version`, TUI project path, …). */
  args?: readonly string[]
}

/**
 * Build a Bun argv that loads the OpenTUI Solid preload reliably.
 *
 * Intentionally avoids `bun run`:
 * - `bun --preload X run file` is misparsed and dumps Bun's package-script help
 * - `bun run --preload X file` works, but is easy to reorder wrong
 *
 * Prefer: `bun --cwd <frameworkRoot> --preload <opentui> <kernelEntry> …args`
 * `--cwd` resolves `@opentui/solid/preload` from the install/monorepo root (and
 * avoids a hostile project bunfig). It changes `process.cwd()` to the framework
 * root; the TUI must still open the caller's project via `PWD` (see
 * `resolveThreadDirectory` in the kernel). Shell `PWD` is left as the caller.
 */
export function buildKernelBunArgv(input: KernelBunLaunch): string[] {
  const frameworkRoot = input.frameworkRoot.trim()
  const kernelEntry = input.kernelEntry.trim()
  const bunPath = input.bunPath.trim()
  if (!bunPath) throw new Error("buildKernelBunArgv: bunPath is required")
  if (!frameworkRoot) throw new Error("buildKernelBunArgv: frameworkRoot is required")
  if (!kernelEntry) throw new Error("buildKernelBunArgv: kernelEntry is required")

  const argv = [
    bunPath,
    "--cwd",
    frameworkRoot,
    "--preload",
    OPENTUI_SOLID_PRELOAD,
    kernelEntry,
    ...(input.args ?? []),
  ]

  assertSafeKernelBunArgv(argv)
  return argv
}

/**
 * Guardrail for launchers: reject the argv shape that makes Bun print its
 * interactive `bun run` help menu instead of starting Spinosa.
 */
export function assertSafeKernelBunArgv(argv: readonly string[]): void {
  const runIdx = argv.indexOf("run")
  const preloadIdx = argv.indexOf("--preload")
  if (runIdx !== -1 && preloadIdx !== -1 && preloadIdx < runIdx) {
    throw new Error(
      "Invalid Bun argv: `--preload` before `run` makes Bun print its help menu. " +
        "Use `bun --cwd <root> --preload @opentui/solid/preload <kernelEntry>` " +
        "(or `bun run --preload … <entry>` with `run` before `--preload`).",
    )
  }
  if (preloadIdx === -1) {
    throw new Error(
      "Invalid Bun argv: missing `--preload @opentui/solid/preload` " +
        "(without it the TUI often renders a blank black screen).",
    )
  }
  if (argv[preloadIdx + 1] !== OPENTUI_SOLID_PRELOAD) {
    throw new Error(
      `Invalid Bun argv: --preload must be followed by ${JSON.stringify(OPENTUI_SOLID_PRELOAD)}`,
    )
  }
}
