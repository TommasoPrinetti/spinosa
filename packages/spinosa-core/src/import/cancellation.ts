export class SpinosaCancellationError extends Error {
  constructor(message = "Spinosa operation cancelled.") {
    super(message)
    this.name = "SpinosaCancellationError"
  }
}

export function isSpinosaCancellationError(error: unknown): error is SpinosaCancellationError {
  return error instanceof SpinosaCancellationError || (
    error instanceof Error && error.name === "SpinosaCancellationError"
  )
}

export function throwIfSpinosaCancelled(shouldAbort?: () => boolean, message?: string): void {
  if (!shouldAbort?.()) return
  throw new SpinosaCancellationError(message)
}
