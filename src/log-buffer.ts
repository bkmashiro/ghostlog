import { analyzeChanges, applyDelta, computeDelta, replayTo, serializeValue, type Delta, type SerializedValue } from './delta.js'
import { RingBuffer } from './ring-buffer.js'

export interface LogLineBuffer {
  file: string
  line: number
  base: unknown
  baseSeq: number
  deltas: RingBuffer<Delta>
  totalReceived: number
  totalDropped: number
  latest: SerializedValue
  changeFrequency: Record<string, number>
}

export interface BufferConfig {
  deltaCapacity: number
  maxValueBytes: number
}

const DEFAULT_CONFIG: BufferConfig = {
  deltaCapacity: 200,
  maxValueBytes: 10_240
}

function toKey(file: string, line: number): string {
  return `${file}:${line}`
}

function cloneValue<T>(value: T): T {
  if (value === undefined) {
    return value
  }
  try {
    return structuredClone(value)
  } catch {
    return value
  }
}

export class LogBufferManager {
  private buffers = new Map<string, LogLineBuffer>()
  private config: BufferConfig

  constructor(config?: Partial<BufferConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  add(file: string, line: number, value: unknown, timestamp = Date.now()): 'stored' | 'deduplicated' {
    const key = toKey(file, line)
    const existing = this.buffers.get(key)
    if (!existing) {
      this.buffers.set(key, {
        file,
        line,
        base: cloneValue(value),
        baseSeq: 0,
        deltas: new RingBuffer<Delta>(this.config.deltaCapacity),
        totalReceived: 1,
        totalDropped: 0,
        latest: serializeValue(value, this.config.maxValueBytes),
        changeFrequency: {}
      })
      return 'stored'
    }

    const nextSeq = existing.totalReceived
    const previousValue = this.reconstruct(file, line, existing.totalReceived - 1)
    existing.totalReceived += 1
    existing.latest = serializeValue(value, this.config.maxValueBytes)

    const delta = computeDelta(previousValue, value, nextSeq)
    if (!delta) {
      return 'deduplicated'
    }
    delta.timestamp = timestamp

    const evicted = existing.deltas.push(delta)
    if (evicted) {
      existing.base = applyDelta(existing.base, evicted)
      existing.baseSeq = evicted.seq
      existing.totalDropped += 1
    }

    for (const [changedKey, count] of Object.entries(analyzeChanges([delta]))) {
      existing.changeFrequency[changedKey] = (existing.changeFrequency[changedKey] ?? 0) + count
    }

    return 'stored'
  }

  get(file: string, line: number): LogLineBuffer | undefined {
    return this.buffers.get(toKey(file, line))
  }

  reconstruct(file: string, line: number, seq: number): unknown {
    const buffer = this.get(file, line)
    if (!buffer) {
      return undefined
    }
    if (seq < buffer.baseSeq || seq >= buffer.totalReceived) {
      return undefined
    }
    if (seq === buffer.baseSeq) {
      return cloneValue(buffer.base)
    }
    return replayTo(cloneValue(buffer.base), buffer.deltas.toArray(), seq)
  }

  getAll(file: string, line: number): Array<{ seq: number; timestamp: number; value: unknown }>
  getAll(): LogLineBuffer[]
  getAll(file?: string, line?: number): Array<{ seq: number; timestamp: number; value: unknown }> | LogLineBuffer[] {
    if (typeof file === 'string' && typeof line === 'number') {
      const buffer = this.get(file, line)
      if (!buffer) {
        return []
      }
      const entries: Array<{ seq: number; timestamp: number; value: unknown }> = [
        { seq: buffer.baseSeq, timestamp: 0, value: cloneValue(buffer.base) }
      ]
      let current = cloneValue(buffer.base)
      for (const delta of buffer.deltas) {
        current = applyDelta(current, delta)
        entries.push({ seq: delta.seq, timestamp: delta.timestamp, value: cloneValue(current) })
      }
      return entries
    }
    return [...this.buffers.values()]
  }

  clear(file?: string): void {
    if (typeof file !== 'string') {
      this.buffers.clear()
      return
    }
    for (const key of [...this.buffers.keys()]) {
      if (key.startsWith(`${file}:`)) {
        this.buffers.delete(key)
      }
    }
  }
}
