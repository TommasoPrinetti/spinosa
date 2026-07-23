import { mkdirSync, existsSync, readFileSync, writeFileSync, createWriteStream } from "node:fs"
import path from "node:path"
import { homedir } from "node:os"
import { createCanvas, loadImage } from "@napi-rs/canvas"
import * as ort from "onnxruntime-node"

interface TrocrConfig {
  encoderPath: string
  decoderPath: string
}

let encoderSession: ort.InferenceSession | null = null
let decoderSession: ort.InferenceSession | null = null
let revVocab: Record<number, string> = {}

const MODEL_REPO = "https://huggingface.co/Xenova/trocr-small-handwritten/resolve/main/onnx"
const HF_HOME = process.env.HF_HOME ?? path.join(homedir(), ".cache", "huggingface")
const SNAPSHOT_DIR = path.join(HF_HOME, "hub", "models--Xenova--trocr-small-handwritten", "snapshots", "onnx")
const VOCAB_DIR = path.join(HF_HOME, "hub", "models--Xenova--trocr-small-handwritten", "snapshots")

const TROCR_MODEL = "Xenova/trocr-small-handwritten"
const MODEL_FILES = [
  "encoder_model.onnx",
  "decoder_model.onnx",
]

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`)
  const writer = createWriteStream(dest)
  if (res.body) {
    for await (const chunk of res.body as any) {
      writer.write(chunk)
    }
  }
  writer.close()
  await new Promise<void>((resolve, reject) => {
    writer.on("finish", resolve)
    writer.on("error", reject)
  })
}

function hfResolve(path: string): string {
  return `https://huggingface.co/${TROCR_MODEL}/resolve/main/${path}`
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

async function ensureModelFiles(): Promise<TrocrConfig> {
  ensureDir(SNAPSHOT_DIR)

  for (const file of MODEL_FILES) {
    const dest = path.join(SNAPSHOT_DIR, file)
    if (!existsSync(dest)) {
      console.error(`\nDownloading ${file} (~100MB, one-time)...`)
      await downloadFile(hfResolve(`onnx/${file}`), dest)
    }
  }

  return {
    encoderPath: path.join(SNAPSHOT_DIR, "encoder_model.onnx"),
    decoderPath: path.join(SNAPSHOT_DIR, "decoder_model.onnx"),
  }
}

async function loadTokenizer(): Promise<void> {
  const tokenizerPath = path.join(VOCAB_DIR, "tokenizer.json")
  if (!existsSync(tokenizerPath)) {
    ensureDir(path.dirname(tokenizerPath))
    console.error("Downloading tokenizer.json...")
    await downloadFile(hfResolve("tokenizer.json"), tokenizerPath)
  }

  const tk = JSON.parse(readFileSync(tokenizerPath, "utf-8"))
  const rawVocab: Record<string, number> = tk.model?.vocab ?? {}
  revVocab = {}
  // Unigram vocab stores scores as values; token ID is the insertion order index
  let idx = 0
  for (const token of Object.keys(rawVocab)) {
    revVocab[idx] = token
    idx++
  }
}

async function loadModel(): Promise<void> {
  if (encoderSession && decoderSession) return

  const cfg = await ensureModelFiles()

  encoderSession = await ort.InferenceSession.create(cfg.encoderPath)
  decoderSession = await ort.InferenceSession.create(cfg.decoderPath)

  await loadTokenizer()
}

function argmax(data: Float32Array | BigInt64Array): number {
  let maxIdx = 0
  let maxVal = -Infinity
  for (let i = 0; i < data.length; i++) {
    const v = Number(data[i])
    if (v > maxVal) {
      maxVal = v
      maxIdx = i
    }
  }
  return maxIdx
}

async function decodeText(imageBuffer: Buffer): Promise<string> {
  await loadModel()

  const image = await loadImage(imageBuffer)
  const canvas = createCanvas(384, 384)
  const ctx = canvas.getContext("2d")
  ctx.drawImage(image, 0, 0, 384, 384)
  const imageData = ctx.getImageData(0, 0, 384, 384)

  const pixelValues = new Float32Array(3 * 384 * 384)
  for (let y = 0; y < 384; y++) {
    for (let x = 0; x < 384; x++) {
      const idx = (y * 384 + x) * 4
      for (let c = 0; c < 3; c++) {
        pixelValues[c * 384 * 384 + y * 384 + x] = (imageData.data[idx + c] / 255 - 0.5) / 0.5
      }
    }
  }

  const encoderFeeds: Record<string, ort.Tensor> = {
    pixel_values: new ort.Tensor("float32", pixelValues, [1, 3, 384, 384]),
  }
  const encoderResults = await encoderSession!.run(encoderFeeds)
  const encoderOutputName = encoderSession!.outputNames[0]
  const encoderHidden = encoderResults[encoderOutputName]

  const decoderStartTokenId = 2
  const eosTokenId = 2
  const maxLength = 96
  const tokens: number[] = [decoderStartTokenId]

  for (let i = 0; i < maxLength; i++) {
    const inputIds = BigInt64Array.from(tokens.map((t) => BigInt(t)))
    const decoderFeeds: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor("int64", inputIds, [1, tokens.length]),
      encoder_hidden_states: encoderHidden,
    }
    const decoderResults = await decoderSession!.run(decoderFeeds)
    const logits = decoderResults["logits"] as ort.Tensor
    const lastDim = logits.dims[logits.dims.length - 1]
    const offset = (tokens.length - 1) * lastDim
    const lastLogits = (logits.data as Float32Array).slice(offset, offset + lastDim)
    const nextToken = argmax(lastLogits)

    if (nextToken === eosTokenId) break
    tokens.push(nextToken)
  }

  const text = tokens
    .slice(1)
    .filter((id) => id !== eosTokenId)
    .map((id) => revVocab[id] ?? "")
    .join("")
    .replace(/\u2581/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return text
}

export interface TrocrBatchResult {
  converted: number
  skipped: number
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
  const cw = Math.min(full.width() - cx, Math.ceil(w + pad * 2))
  const ch = Math.min(full.height() - cy, Math.ceil(h + pad * 2))

  const canvas = createCanvas(cw, ch)
  const ctx = canvas.getContext("2d")
  ctx.drawImage(full, cx, cy, cw, ch, 0, 0, cw, ch)
  const buf = canvas.toBuffer("image/png")

  return decodeText(buf)
}

export async function trocrHybridBatch(
  files: { src: string; rel: string; dest: string }[],
  options?: { onLog?: (msg: string) => void },
): Promise<TrocrBatchResult> {
  let converted = 0
  let skipped = 0

  try {
    await loadModel()
  } catch (err) {
    options?.onLog?.(`TrOCR init failed: ${err instanceof Error ? err.message : String(err)}`)
    return { converted: 0, skipped: files.length }
  }

  for (const file of files) {
    try {
      const imageData = readFileSync(file.src)
      const fullImage = await loadImage(imageData)

      const { PaddleOcrService, V6_MEDIUM_MODEL } = await import("ppu-paddle-ocr")
      const svc = new PaddleOcrService({ model: V6_MEDIUM_MODEL, processing: { engine: "canvas-native" } })
      await svc.initialize()
      const result = await svc.recognize(imageData.buffer.slice(imageData.byteOffset, imageData.byteOffset + imageData.byteLength)) as any
      await (svc as any).dispose?.()

      const allLines: string[] = []
      const ppuResult = result as { lines: { box: { x: number; y: number; width: number; height: number }; text: string }[][] }
      let ppuLines = 0

      for (const lineGroup of ppuResult.lines ?? []) {
        const lineTexts: string[] = []
        for (const item of lineGroup) {
          ppuLines++
          try {
            const trocrText = await decodeCrop(imageData, item.box.x, item.box.y, item.box.width, item.box.height)
            lineTexts.push(trocrText)
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
  // If engine is set to "trocr-hybrid", use the hybrid pipeline
  if (process.env.SPINOSA_OCR_ENGINE === "trocr-hybrid") {
    return trocrHybridBatch(files, options)
  }

  let converted = 0
  let skipped = 0

  let loaded = false
  try {
    await loadModel()
    loaded = true
  } catch (err) {
    options?.onLog?.(`TrOCR init failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!loaded) return { converted: 0, skipped: files.length }

  for (const file of files) {
    try {
      const imageData = readFileSync(file.src)
      const text = await decodeText(imageData)
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
