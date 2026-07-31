import { readFileSync } from "node:fs"

declare const SPINOSA_VERSION: string
declare const SPINOSA_CHANNEL: string
declare const SPINOSA_DISTRIBUTION: string
declare const SPINOSA_TEMPLATE_PACK_ID: string
declare const SPINOSA_TEMPLATE_PACK_VERSION: string

function readPackageVersion(): string {
  try {
    const metadataUrl = new URL("../../../../metadata/version", import.meta.url)
    return readFileSync(metadataUrl, "utf-8").trim()
  } catch {
    try {
      const url = new URL("../../../../package.json", import.meta.url)
      const parsed = JSON.parse(readFileSync(url, "utf-8"))
      return typeof parsed.version === "string" ? parsed.version : "local"
    } catch {
      return "local"
    }
  }
}

export const InstallationVersion = typeof SPINOSA_VERSION === "string" ? SPINOSA_VERSION : readPackageVersion()
export const InstallationChannel = typeof SPINOSA_CHANNEL === "string" ? SPINOSA_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
export const InstallationDistribution =
  typeof SPINOSA_DISTRIBUTION === "string" ? SPINOSA_DISTRIBUTION : "dev"
export const InstallationTemplatePackId =
  typeof SPINOSA_TEMPLATE_PACK_ID === "string" ? SPINOSA_TEMPLATE_PACK_ID : ""
export const InstallationTemplatePackVersion =
  typeof SPINOSA_TEMPLATE_PACK_VERSION === "string" ? SPINOSA_TEMPLATE_PACK_VERSION : InstallationVersion
