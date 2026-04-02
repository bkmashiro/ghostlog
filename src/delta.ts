export interface SerializedValue {
  type: 'primitive' | 'object' | 'array' | 'null'
  raw: string
  full?: unknown
  size: number
}

export interface Delta {
  seq: number
  timestamp: number
  changes: Record<string, unknown>
  removed: string[]
  isFullReset: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function detectType(value: unknown): SerializedValue['type'] {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  if (typeof value === 'object') {
    return 'object'
  }
  return 'primitive'
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (value === undefined) {
    return 'undefined'
  }
  try {
    const serialized = JSON.stringify(value)
    return serialized ?? String(value)
  } catch {
    return String(value)
  }
}

function cloneIfPossible<T>(value: T): T {
  if (value === undefined) {
    return value
  }
  try {
    return structuredClone(value)
  } catch {
    return value
  }
}

function getComparableType(value: unknown): 'array' | 'object' | 'primitive' | 'null' {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  if (isPlainObject(value)) {
    return 'object'
  }
  return 'primitive'
}

function applyDeltaInternal(current: unknown, delta: Delta): unknown {
  if (delta.isFullReset) {
    return cloneIfPossible(delta.changes.$)
  }

  if (Array.isArray(current)) {
    const next = [...current]
    for (const key of delta.removed) {
      const index = Number(key)
      if (Number.isInteger(index) && index >= 0) {
        delete next[index]
      }
    }
    for (const [key, value] of Object.entries(delta.changes)) {
      const index = Number(key)
      if (Number.isInteger(index) && index >= 0) {
        next[index] = cloneIfPossible(value)
      }
    }
    return next
  }

  const base =
    current !== null && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {}
  for (const key of delta.removed) {
    delete base[key]
  }
  for (const [key, value] of Object.entries(delta.changes)) {
    base[key] = cloneIfPossible(value)
  }
  return base
}

export function serializeValue(value: unknown, maxBytes = 10_240): SerializedValue {
  const fullRaw = stringifyValue(value)
  const size = Buffer.byteLength(fullRaw, 'utf8')
  return {
    type: detectType(value),
    raw: fullRaw.length > 200 ? `${fullRaw.slice(0, 197)}...` : fullRaw,
    full: size <= maxBytes ? cloneIfPossible(value) : undefined,
    size
  }
}

export function computeDelta(prev: unknown, next: unknown, seq: number): Delta | null {
  if (prev === next) {
    return null
  }

  const prevType = getComparableType(prev)
  const nextType = getComparableType(next)
  if (prevType !== nextType || nextType === 'primitive' || nextType === 'null') {
    return {
      seq,
      timestamp: Date.now(),
      changes: { $: cloneIfPossible(next) },
      removed: [],
      isFullReset: true
    }
  }

  const prevRecord = Array.isArray(prev)
    ? Object.fromEntries(prev.map((value, index) => [String(index), value]))
    : (prev as Record<string, unknown>)
  const nextRecord = Array.isArray(next)
    ? Object.fromEntries(next.map((value, index) => [String(index), value]))
    : (next as Record<string, unknown>)

  const changes: Record<string, unknown> = {}
  const removed: string[] = []
  const keys = new Set([...Object.keys(prevRecord), ...Object.keys(nextRecord)])

  for (const key of keys) {
    const inPrev = Object.prototype.hasOwnProperty.call(prevRecord, key)
    const inNext = Object.prototype.hasOwnProperty.call(nextRecord, key)
    if (inPrev && !inNext) {
      removed.push(key)
      continue
    }
    if (!inPrev || prevRecord[key] !== nextRecord[key]) {
      changes[key] = cloneIfPossible(nextRecord[key])
    }
  }

  if (removed.length === 0 && Object.keys(changes).length === 0) {
    return null
  }

  return {
    seq,
    timestamp: Date.now(),
    changes,
    removed,
    isFullReset: false
  }
}

export function replayTo(base: unknown, deltas: Delta[], targetSeq: number): unknown {
  let current = cloneIfPossible(base)
  for (const delta of deltas) {
    if (delta.seq > targetSeq) {
      break
    }
    current = applyDeltaInternal(current, delta)
  }
  return current
}

export function analyzeChanges(deltas: Delta[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const delta of deltas) {
    for (const key of Object.keys(delta.changes)) {
      counts[key] = (counts[key] ?? 0) + 1
    }
    for (const key of delta.removed) {
      counts[key] = (counts[key] ?? 0) + 1
    }
  }
  return counts
}

export function applyDelta(base: unknown, delta: Delta): unknown {
  return applyDeltaInternal(base, delta)
}
