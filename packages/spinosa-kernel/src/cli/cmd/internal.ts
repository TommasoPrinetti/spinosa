import type { Argv } from "yargs"
import {
  ensureEmbeddedTemplateCache,
  verifyEmbeddedTemplateCache,
  isCompiledBinaryDistribution,
  compiledVersion,
  compiledTemplatePackId,
} from "@spinosa/core/distribution/bootstrap"
import { getFormat, emitResult } from "../output"

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

export const InternalCommand = {
  command: "internal",
  describe: false as const,
  builder: (yargs: Argv) =>
    yargs
      .command("template", "Template pack helpers", (inner) =>
        inner
          .command(
            "ensure",
            "Ensure the embedded template cache exists",
            (y) =>
              y
                .option("force", {
                  type: "boolean",
                  default: false,
                  describe: "Rebuild cache even if complete",
                })
                .option("json", { type: "boolean", default: false }),
            async (args) => {
              const result = ensureEmbeddedTemplateCache({ force: Boolean(args.force) })
              const payload = {
                ok: result.ok,
                version: result.version,
                templatePackId: result.templatePackId,
                templateRoot: result.templateRoot,
                repaired: result.repaired ?? false,
                error: result.error,
                distribution: isCompiledBinaryDistribution() ? "binary" : "dev",
              }
              if (args.json || getFormat(args) === "json") printJson(payload)
              else emitResult("human", "template-ensure", payload, result.ok ? "ok" : result.error ?? "failed")
              if (!result.ok) process.exitCode = 1
            },
          )
          .command(
            "verify",
            "Verify the embedded template cache",
            (y) => y.option("json", { type: "boolean", default: false }),
            async (args) => {
              const result = verifyEmbeddedTemplateCache()
              const payload = {
                ok: result.ok,
                version: result.version || compiledVersion(),
                templatePackId: result.templatePackId || compiledTemplatePackId(),
                templateRoot: result.templateRoot,
                error: result.error,
                distribution: isCompiledBinaryDistribution() ? "binary" : "dev",
              }
              if (args.json || getFormat(args) === "json") printJson(payload)
              else emitResult("human", "template-verify", payload, result.ok ? "ok" : result.error ?? "failed")
              if (!result.ok) process.exitCode = 1
            },
          )
          .demandCommand(1),
      )
      .command({
        command: "ocr-worker [payload]",
        describe: false,
        builder: (y: Argv) =>
          y.positional("payload", {
            type: "string",
            describe: "JSON payload { files: [{ src, rel, dest }] }",
          }),
        handler: async (args: { payload?: string }) => {
          // Machine protocol on stdout (NDJSON). Do not mix human UI.
          const raw = typeof args.payload === "string" ? args.payload : ""
          if (!raw) {
            process.stdout.write(`${JSON.stringify({ type: "error", message: "missing ocr-worker payload" })}\n`)
            process.exit(1)
          }
          let input: { files?: unknown }
          try {
            input = JSON.parse(raw) as { files?: unknown }
          } catch (err) {
            process.stdout.write(
              `${JSON.stringify({
                type: "error",
                message: `invalid ocr-worker JSON: ${err instanceof Error ? err.message : String(err)}`,
              })}\n`,
            )
            process.exit(1)
          }
          if (!Array.isArray(input.files)) {
            process.stdout.write(
              `${JSON.stringify({ type: "error", message: "ocr-worker payload.files must be an array" })}\n`,
            )
            process.exit(1)
          }
          const { runOcrWorkerMain } = await import("@spinosa/core/import/ppu-ocr-worker")
          try {
            await runOcrWorkerMain({ files: input.files as never })
            process.exit(0)
          } catch (err) {
            process.stdout.write(
              `${JSON.stringify({
                type: "error",
                message: err instanceof Error ? err.message : String(err),
              })}\n`,
            )
            process.exit(1)
          }
        },
      })
      .demandCommand(1),
  handler: () => undefined,
}
