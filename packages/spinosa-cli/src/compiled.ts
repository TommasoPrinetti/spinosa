// Native builds evaluate this entry as part of Bun's bundle, avoiding the
// workspace-specific live TypeScript loader used by the development launcher.
process.env.SPINOSA_PRODUCT = "1"
await import("../../spinosa-kernel/src/index.ts")
