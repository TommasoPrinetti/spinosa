# ppu-paddle-ocr Usage Notes

## Critical Configuration

```typescript
const service = new PaddleOcrService({
  processing: { engine: "canvas-native" }
})
```

`engine: "canvas-native"` is required for Node.js/Bun. The default `"opencv"` engine loads `@techstark/opencv-js` (via `ppu-ocv`), which is browser-only and throws `document is not defined` in server runtimes.

## Only Pass ArrayBuffer — Never File Paths

The compiled `recognize()` override in `processor/paddle-ocr.service.js` drops the `string` input handler from the base class. It only accepts:

- `ArrayBuffer` — correct for server use
- Canvas object — browser only
- Object with `.toBuffer()` — wrapped canvas

```typescript
// CORRECT:
const buf = readFileSync("./image.jpg")
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const result = await service.recognize(ab)

// WRONG — throws on getContext("2d"):
const result = await service.recognize("./image.jpg")
```

## Dependencies Needed

`ppu-paddle-ocr` v6.0.0 declares `@napi-rs/canvas` as a hard dep via `ppu-ocv`, but Bun doesn't resolve optional platform bindings (`@napi-rs/canvas-darwin-arm64`) from nested transitive deps. Add as direct deps:

```
@napi-rs/canvas: 1.0.2
@napi-rs/canvas-darwin-arm64: 1.0.2
```

(Other platforms need their own `@napi-rs/canvas-{platform}-{arch}` variant.)

## Known Bugs (v6.0.0)

1. **`recognize()` input type gap** — doesn't accept file path strings despite documentation
2. **OpenCV.js forced load** — even with `canvas-native`, `@techstark/opencv-js` is imported at module level (harmless once routed away from opencv code path)
3. **Bun cache resolution** — `@napi-rs/canvas` resolves from Bun's global cache in some setups; project-level direct deps fix this

## Accuracy Trade-off

per ppu-paddle-ocr docs: `canvas-native` is ~4% slower (242ms vs 233ms on M1) than `opencv` but produces identical recognition accuracy (same ONNX inference pipeline). Only the preprocessing/detection differs slightly.
