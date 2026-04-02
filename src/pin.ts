export interface PinnedPath {
  id: string
  file: string
  line: number
  path: string
  history: Array<{
    value: unknown
    timestamp: number
    changed: boolean
  }>
  maxHistory: number
}

function tokenizePath(path: string): string[] {
  const tokens: string[] = []
  const pattern = /([^[.\]]+)|\[(\d+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\]/g

  for (const match of path.matchAll(pattern)) {
    const bare = match[1]
    const bracket = match[2]
    if (bare) {
      tokens.push(bare)
      continue
    }
    if (!bracket) {
      continue
    }
    if (/^\d+$/.test(bracket)) {
      tokens.push(bracket)
      continue
    }
    tokens.push(bracket.slice(1, -1))
  }

  return tokens
}

function isEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function extractPath(obj: unknown, path: string): { value: unknown; found: boolean } {
  const tokens = tokenizePath(path)
  let current: unknown = obj

  for (const token of tokens) {
    if (current === null || current === undefined) {
      return { value: undefined, found: false }
    }
    if (Array.isArray(current) && /^\d+$/.test(token)) {
      const index = Number(token)
      if (index >= current.length) {
        return { value: undefined, found: false }
      }
      current = current[index]
      continue
    }
    if (typeof current === 'object' && token in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[token]
      continue
    }
    return { value: undefined, found: false }
  }

  return { value: current, found: true }
}

export function formatPinHistory(pin: PinnedPath): string {
  if (pin.history.length === 0) {
    return `${pin.path}\n  (waiting for updates...)`
  }

  return [
    pin.path,
    ...pin.history.map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString()
      const marker = entry.changed ? '  <- changed' : ''
      return `  ${time}  ${JSON.stringify(entry.value)}${marker}`
    })
  ].join('\n')
}

export class PinStore {
  private pins: Map<string, PinnedPath> = new Map()

  add(file: string, line: number, path: string): PinnedPath {
    const pin: PinnedPath = {
      id: `${file}:${line}:${path}`,
      file,
      line,
      path,
      history: [],
      maxHistory: 50
    }
    this.pins.set(pin.id, pin)
    return pin
  }

  remove(id: string): void {
    this.pins.delete(id)
  }

  getForLine(file: string, line: number): PinnedPath[] {
    return this.list().filter((pin) => pin.file === file && pin.line === line)
  }

  list(): PinnedPath[] {
    return [...this.pins.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  onNewValue(file: string, line: number, value: unknown): void {
    for (const pin of this.getForLine(file, line)) {
      const extracted = extractPath(value, pin.path)
      if (!extracted.found) {
        continue
      }
      const previous = pin.history.at(-1)
      pin.history.push({
        value: extracted.value,
        timestamp: Date.now(),
        changed: previous ? !isEqual(previous.value, extracted.value) : false
      })
      if (pin.history.length > pin.maxHistory) {
        pin.history.splice(0, pin.history.length - pin.maxHistory)
      }
    }
  }
}
