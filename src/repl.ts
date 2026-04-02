import * as vm from 'node:vm'

export interface ReplContext {
  $last: unknown
  [key: string]: unknown
}

export interface ReplResult {
  input: string
  output: string
  error?: string
  timestamp: number
}

export function reviveCapturedValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (trimmed === 'undefined') {
    return undefined
  }
  if (trimmed === 'null') {
    return null
  }
  if (trimmed === 'true') {
    return true
  }
  if (trimmed === 'false') {
    return false
  }
  if (/^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
    return Number(trimmed)
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    // Fall through to expression evaluation for object literals and arrays.
  }

  try {
    return vm.runInNewContext(`(${trimmed})`, Object.create(null), { timeout: 50 })
  } catch {
    return trimmed
  }
}

export class GhostlogRepl {
  private context: ReplContext = { $last: undefined }
  private history: ReplResult[] = []

  updateContext(entries: Map<string, unknown>): void {
    const nextContext: ReplContext = { $last: undefined }
    let index = 0

    for (const [key, value] of entries) {
      nextContext[`$${index}`] = value
      nextContext[key] = value
      nextContext.$last = value
      index += 1
    }

    this.context = nextContext
  }

  updateFromCaptured(values: Array<{ key: string; raw: string }>): void {
    const entries = new Map<string, unknown>()
    for (const value of values) {
      entries.set(value.key, reviveCapturedValue(value.raw))
    }
    this.updateContext(entries)
  }

  evaluate(expression: string): ReplResult {
    try {
      const sandbox = {
        ...this.context,
        JSON,
        Math,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Date,
        RegExp
      }
      const result = vm.runInNewContext(expression, sandbox, { timeout: 1000 })
      const entry = {
        input: expression,
        output: formatValue(result),
        timestamp: Date.now()
      }
      this.history.push(entry)
      return entry
    } catch (error) {
      const entry = {
        input: expression,
        output: '',
        error: String(error),
        timestamp: Date.now()
      }
      this.history.push(entry)
      return entry
    }
  }

  getHistory(): ReplResult[] {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }

  getContext(): ReplContext {
    return { ...this.context }
  }
}

export function formatValue(value: unknown, maxDepth = 3): string {
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }
    if (maxDepth <= 0) {
      return `[ ...${value.length} items ]`
    }
    if (value.length > 10) {
      return `[ ...${value.length} items ]`
    }
    const preview = value
      .slice(0, 5)
      .map((entry) => formatValue(entry, maxDepth - 1))
      .join(', ')
    return `[ ${preview}${value.length > 5 ? ', ...' : ''} ]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object)
    if (keys.length === 0) {
      return '{}'
    }
    if (maxDepth <= 0) {
      return `{ ...${keys.length} keys }`
    }
    const preview = keys
      .slice(0, 4)
      .map((key) => `${key}: ${formatValue((value as Record<string, unknown>)[key], maxDepth - 1)}`)
      .join(', ')
    return `{ ${preview}${keys.length > 4 ? ', ...' : ''} }`
  }
  return String(value)
}
