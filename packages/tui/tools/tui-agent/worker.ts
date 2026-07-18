#!/usr/bin/env bun
import { runScenario } from "./driver";
import { loadAdapter } from "./adapter";
import { resolveScenario, resolveScenarioAdapter } from "./scenario";

async function main() {
  const [source, artifactDirectory, fixtureRoot, keep, adapterOverride] = process.argv.slice(2);
  if (!source || !artifactDirectory || !fixtureRoot)
    throw new Error(
      "worker requires scenario, artifact directory, and fixture root",
    );
  const resolved = await resolveScenario(source);
  const adapterInput = resolveScenarioAdapter(
    resolved.scenario,
    resolved.source,
    adapterOverride || undefined,
  );
  const adapter = await loadAdapter(adapterInput.specifier, adapterInput.baseDirectory);
  const manifest = await runScenario({
    ...resolved,
    adapter,
    artifactDirectory,
    fixtureRoot,
    keepFixture: keep === "true",
  });
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
  if (manifest.status === "failed") process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
