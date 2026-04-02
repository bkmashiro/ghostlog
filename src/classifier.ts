export interface ValuePattern {
  signature: string
  count: number
  examples: unknown[]
  firstSeen: number
  lastSeen: number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export function detectPattern(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  const type = typeof value
  if (type !== 'object') {
    return type
  }

  if (Array.isArray(value)) {
    return 'Array'
  }

  const constructorName =
    (value as { constructor?: { name?: string } }).constructor?.name?.trim() ?? ''
  if (constructorName && constructorName !== 'Object') {
    return constructorName
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort()
    return `{${keys.join(',')}}`
  }

  return 'object'
}

export function classifyEntries(entries: unknown[]): Map<string, ValuePattern> {
  const patterns = new Map<string, ValuePattern>()

  for (const value of entries) {
    const signature = detectPattern(value)
    const now = Date.now()
    const current = patterns.get(signature)
    if (current) {
      current.count += 1
      current.lastSeen = now
      if (current.examples.length < 3) {
        current.examples.push(value)
      }
      continue
    }
    patterns.set(signature, {
      signature,
      count: 1,
      examples: [value],
      firstSeen: now,
      lastSeen: now
    })
  }

  return patterns
}

export function summarizePatterns(patterns: Map<string, ValuePattern>): string {
  const ordered = [...patterns.values()].sort((left, right) => right.count - left.count)
  if (ordered.length === 0) {
    return ''
  }

  const summary = ordered
    .map((pattern) => `${pattern.signature}×${pattern.count}`)
    .join(', ')
  if (ordered.length === 1) {
    return summary
  }
  return `[${ordered.length} patterns] ${summary}`
}
