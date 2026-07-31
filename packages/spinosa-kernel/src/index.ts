/**
 * Product entry — stage onnxruntime companion libs before the rest of the CLI
 * graph loads (Bun --compile extracts `.node` without `@rpath` dylibs/so/dll).
 */
import { ensureOnnxRuntimeSharedLibs } from "./native/onnx-runtime-libs"
import { installDomMatrixPolyfill } from "./native/dom-matrix-polyfill"

ensureOnnxRuntimeSharedLibs()
installDomMatrixPolyfill()
// Force the per-target `@napi-rs/canvas-*` package into the compile graph (stub in dev).
await import("./generated/napi-canvas-force.gen.ts")
await import("./cli-main.ts")
