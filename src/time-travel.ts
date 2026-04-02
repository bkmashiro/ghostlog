import type { Delta } from './delta.js'
import { LogBufferManager } from './log-buffer.js'

export interface TimelineFrame {
  seq: number
  timestamp: number
  file: string
  line: number
  value: unknown
  deltaKeys: string[]
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

function keysForBase(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((_, index) => String(index))
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
  }
  return ['$']
}

function keysForDelta(delta?: Delta): string[] {
  if (!delta) {
    return []
  }
  return [...new Set([...Object.keys(delta.changes), ...delta.removed])].sort()
}

export class TimeTravel {
  private currentSeq = new Map<string, number>()

  constructor(private readonly bufferManager: LogBufferManager) {}

  getTimeline(file: string, line: number): TimelineFrame[] {
    const buffer = this.bufferManager.get(file, line)
    if (!buffer) {
      return []
    }

    const deltaBySeq = new Map(buffer.deltas.toArray().map((delta) => [delta.seq, delta]))
    const frames: TimelineFrame[] = []
    for (let seq = buffer.baseSeq; seq < buffer.totalReceived; seq += 1) {
      const value = this.bufferManager.reconstruct(file, line, seq)
      if (value === undefined && buffer.base !== undefined) {
        continue
      }
      frames.push({
        seq,
        timestamp: seq === buffer.baseSeq ? buffer.baseTimestamp : deltaBySeq.get(seq)?.timestamp ?? buffer.baseTimestamp,
        file,
        line,
        value: cloneValue(value),
        deltaKeys: seq === buffer.baseSeq ? keysForBase(buffer.base) : keysForDelta(deltaBySeq.get(seq))
      })
    }
    return frames
  }

  seekTo(file: string, line: number, seq: number): TimelineFrame | null {
    const frame = this.getTimeline(file, line).find((entry) => entry.seq === seq) ?? null
    if (frame) {
      this.currentSeq.set(toKey(file, line), seq)
    }
    return frame
  }

  stepForward(file: string, line: number): TimelineFrame | null {
    const timeline = this.getTimeline(file, line)
    if (timeline.length === 0) {
      return null
    }
    const key = toKey(file, line)
    const current = this.currentSeq.get(key)
    if (current === undefined) {
      this.currentSeq.set(key, timeline[0].seq)
      return timeline[0]
    }
    const next = timeline.find((frame) => frame.seq > current) ?? null
    if (next) {
      this.currentSeq.set(key, next.seq)
    }
    return next
  }

  stepBackward(file: string, line: number): TimelineFrame | null {
    const timeline = this.getTimeline(file, line)
    if (timeline.length === 0) {
      return null
    }
    const key = toKey(file, line)
    const current = this.currentSeq.get(key)
    if (current === undefined) {
      return null
    }
    const previous = [...timeline].reverse().find((frame) => frame.seq < current) ?? null
    if (previous) {
      this.currentSeq.set(key, previous.seq)
    }
    return previous
  }

  currentFrame(file: string, line: number): TimelineFrame | null {
    const current = this.currentSeq.get(toKey(file, line))
    if (current === undefined) {
      return null
    }
    return this.getTimeline(file, line).find((frame) => frame.seq === current) ?? null
  }
}
