export class DecorationDebouncer {
  private pending = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(
    private readonly debounceMs: number,
    private readonly onFlush: (files: Set<string>) => void
  ) {}

  mark(file: string): void {
    if (this.disposed) {
      return
    }
    this.pending.add(file)
    if (this.timer) {
      return
    }
    this.timer = setTimeout(() => {
      this.flush()
    }, this.debounceMs)
  }

  flush(): void {
    if (this.disposed) {
      return
    }
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending.size === 0) {
      return
    }
    const files = new Set(this.pending)
    this.pending.clear()
    this.onFlush(files)
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending.clear()
  }
}
