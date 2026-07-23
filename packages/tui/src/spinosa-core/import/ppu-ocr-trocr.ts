import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { createCanvas, loadImage } from "@napi-rs/canvas"

let pipe: any = null

async function getPipe() {
  if (!pipe) {
    const { pipeline } = await import("@huggingface/transformers")
    pipe = await pipeline("image-to-text", "Xenova/trocr-small-handwritten", { device: "cpu" })
  }
  return pipe
}

async function decodeCrop(
  imageBuffer: Buffer,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<string> {
  const full = await loadImage(imageBuffer)
  const pad = 8
  const cx = Math.max(0, Math.floor(x - pad))
  const cy = Math.max(0, Math.floor(y - pad))
  const cw = Math.min(full.width - cx, Math.ceil(w + pad * 2))
  const ch = Math.min(full.height - cy, Math.ceil(h + pad * 2))

  const cropCanvas = createCanvas(cw, ch)
  const cropCtx = cropCanvas.getContext("2d")
  cropCtx.drawImage(full, cx, cy, cw, ch, 0, 0, cw, ch)

  const tmpFile = path.join(tmpdir(), `trocr-crop-${randomUUID()}.png`)
  writeFileSync(tmpFile, cropCanvas.toBuffer("image/png"))
  let text = ""
  try {
    const p = await getPipe()
    const result = await p(tmpFile)
    text = result[0]?.generated_text ?? ""
  } finally {
    try { rmSync(tmpFile, { force: true }) } catch {}
  }
  return text
}

export interface TrocrBatchResult {
  converted: number
  skipped: number
}

export async function trocrHybridBatch(
  files: { src: string; rel: string; dest: string }[],
  options?: { onLog?: (msg: string) => void },
): Promise<TrocrBatchResult> {
  let converted = 0
  let skipped = 0

  try {
    await getPipe()
  } catch (err) {
    options?.onLog?.(`TrOCR init failed: ${err instanceof Error ? err.message : String(err)}`)
    return { converted: 0, skipped: files.length }
  }

  for (const file of files) {
    try {
      const imageData = readFileSync(file.src)

      const { PaddleOcrService, V6_MEDIUM_MODEL } = await import("ppu-paddle-ocr")
      const svc = new PaddleOcrService({ model: V6_MEDIUM_MODEL, processing: { engine: "canvas-native" } })
      await svc.initialize()
      const result = await svc.recognize(
        imageData.buffer.slice(imageData.byteOffset, imageData.byteOffset + imageData.byteLength),
      ) as any
      await (svc as any).dispose?.()

      const allLines: string[] = []
      const ppuResult = result as { lines: { box: { x: number; y: number; width: number; height: number }; text: string }[][] }

      for (const lineGroup of ppuResult.lines ?? []) {
        const lineTexts: string[] = []
        for (const item of lineGroup) {
          try {
            const trocrText = await decodeCrop(imageData, item.box.x, item.box.y, item.box.width, item.box.height)
            if (trocrText.trim()) {
              lineTexts.push(trocrText)
            } else {
              lineTexts.push(item.text)
            }
          } catch {
            lineTexts.push(item.text)
          }
        }
        allLines.push(lineTexts.join(" "))
      }

      const text = allLines.join("\n")
      const title = path.basename(file.rel, path.extname(file.rel))
      mkdirSync(path.dirname(file.dest), { recursive: true })
      writeFileSync(file.dest, `# ${title}\n\n${text}\n`)
      converted++
    } catch (err) {
      options?.onLog?.(`TrOCR hybrid failed: ${file.rel} — ${err instanceof Error ? err.message : String(err)}`)
      skipped++
    }
  }

  return { converted, skipped }
}

export async function trocrBatch(
  files: { src: string; rel: string; dest: string }[],
  options?: { onLog?: (msg: string) => void },
): Promise<TrocrBatchResult> {
  if (process.env.SPINOSA_OCR_ENGINE === "trocr-hybrid") {
    return trocrHybridBatch(files, options)
  }

  let converted = 0
  let skipped = 0

  try {
    await getPipe()
  } catch (err) {
    options?.onLog?.(`TrOCR init failed: ${err instanceof Error ? err.message : String(err)}`)
    return { converted: 0, skipped: files.length }
  }

  for (const file of files) {
    try {
      const p = await getPipe()
      const result = await p(file.src)
      const text = result[0]?.generated_text ?? ""
      const title = path.basename(file.rel, path.extname(file.rel))
      mkdirSync(path.dirname(file.dest), { recursive: true })
      writeFileSync(file.dest, `# ${title}\n\n${text}\n`)
      converted++
    } catch (err) {
      options?.onLog?.(`TrOCR failed: ${file.rel} — ${err instanceof Error ? err.message : String(err)}`)
      skipped++
    }
  }

  return { converted, skipped }
}
