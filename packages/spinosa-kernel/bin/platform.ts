export type PlatformInput = {
  platform: string
  arch: string
  musl: boolean
  avx2: boolean
}

export function packageNameForPlatform(input: PlatformInput) {
  if (input.platform !== "darwin" && input.platform !== "linux") {
    throw new Error(`Unsupported Spinosa platform: ${input.platform}`)
  }
  if (input.arch !== "arm64" && input.arch !== "x64") {
    throw new Error(`Unsupported Spinosa architecture: ${input.arch}`)
  }

  const parts = ["@spinosa/kernel", input.platform, input.arch]
  if (input.arch === "x64" && !input.avx2) parts.push("baseline")
  if (input.platform === "linux" && input.musl) parts.push("musl")
  return parts.join("-")
}
