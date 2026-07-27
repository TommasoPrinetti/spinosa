declare global {
  const SPINOSA_VERSION: string
  const SPINOSA_CHANNEL: string
}

export const InstallationVersion = typeof SPINOSA_VERSION === "string" ? SPINOSA_VERSION : "local"
export const InstallationChannel = typeof SPINOSA_CHANNEL === "string" ? SPINOSA_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
