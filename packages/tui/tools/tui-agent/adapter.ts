import path from "node:path";
import { pathToFileURL } from "node:url";
import type { TuiAgentAdapter } from "./types";

export async function loadAdapter(specifier: string, baseDirectory: string): Promise<TuiAgentAdapter> {
  const target = specifier.startsWith("file:")
    ? specifier
    : isPath(specifier)
      ? pathToFileURL(path.resolve(baseDirectory, specifier)).href
      : specifier;
  const module = await import(target);
  const adapter = module.default ?? module.adapter;
  if (!isAdapter(adapter)) {
    throw new Error(
      `Adapter ${JSON.stringify(specifier)} must default-export { name, launch() }`,
    );
  }
  return adapter;
}

function isPath(value: string) {
  return value.startsWith(".") || value.startsWith("/");
}

function isAdapter(value: unknown): value is TuiAgentAdapter {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "launch" in value &&
    typeof value.launch === "function"
  );
}
