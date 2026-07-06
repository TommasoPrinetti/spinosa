export interface ProgressEvent {
  phase: string
  current: number
  total: number
  relPath: string
}

export type ProgressListener = (e: ProgressEvent) => void

export class ProgressEmitter {
  private listeners = new Set<ProgressListener>()

  on(cb: ProgressListener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  emit(e: ProgressEvent): void {
    for (const cb of this.listeners) cb(e)
  }

  file(phase: string, current: number, total: number, relPath: string): void {
    this.emit({ phase, current, total, relPath })
  }
}
