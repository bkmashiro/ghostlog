export interface LogEntry {
  raw: string
  level: 'log' | 'warn' | 'error' | 'info'
  values: string[]
  label?: string
  timestamp: number
}

function splitTopLevelValues(input: string): string[] {
  const values: string[] = []
  let current = ''
  let quote: '"' | "'" | '`' | null = null
  let escape = false
  let depthParen = 0
  let depthBrace = 0
  let depthBracket = 0

  const pushCurrent = () => {
    const trimmed = current.trim()
    if (trimmed) {
      values.push(trimmed)
    }
    current = ''
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (quote) {
      current += char
      if (escape) {
        escape = false
        continue
      }
      if (char === '\\') {
        escape = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      current += char
      continue
    }

    if (char === '(') {
      depthParen += 1
      current += char
      continue
    }
    if (char === ')') {
      depthParen = Math.max(0, depthParen - 1)
      current += char
      continue
    }
    if (char === '{') {
      depthBrace += 1
      current += char
      continue
    }
    if (char === '}') {
      depthBrace = Math.max(0, depthBrace - 1)
      current += char
      continue
    }
    if (char === '[') {
      depthBracket += 1
      current += char
      continue
    }
    if (char === ']') {
      depthBracket = Math.max(0, depthBracket - 1)
      current += char
      continue
    }

    const isTopLevel =
      depthParen === 0 && depthBrace === 0 && depthBracket === 0 && !quote
    if (isTopLevel && /\s/.test(char)) {
      const next = input[index + 1] ?? ''
      if (current.trim() && next && !/\s/.test(next)) {
        pushCurrent()
      }
      continue
    }

    current += char
  }

  pushCurrent()
  return values
}

function extractLabel(line: string): { label?: string; rest: string } {
  let quote: '"' | "'" | '`' | null = null
  let escape = false
  let depthParen = 0
  let depthBrace = 0
  let depthBracket = 0

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (quote) {
      if (escape) {
        escape = false
        continue
      }
      if (char === '\\') {
        escape = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '(') {
      depthParen += 1
      continue
    }
    if (char === ')') {
      depthParen = Math.max(0, depthParen - 1)
      continue
    }
    if (char === '{') {
      depthBrace += 1
      continue
    }
    if (char === '}') {
      depthBrace = Math.max(0, depthBrace - 1)
      continue
    }
    if (char === '[') {
      depthBracket += 1
      continue
    }
    if (char === ']') {
      depthBracket = Math.max(0, depthBracket - 1)
      continue
    }

    const isTopLevel =
      depthParen === 0 && depthBrace === 0 && depthBracket === 0 && !quote
    if (isTopLevel && char === ':') {
      const candidate = line.slice(0, index + 1).trim()
      if (candidate && !candidate.includes(' ')) {
        return {
          label: candidate,
          rest: line.slice(index + 1).trim()
        }
      }
    }
    if (isTopLevel && /\s/.test(char)) {
      break
    }
  }

  return { rest: line.trim() }
}

export function parseLogLine(line: string, level: LogEntry['level']): LogEntry {
  const raw = line.trim()
  const looksLikeRuntimeError = /^([A-Z][A-Za-z0-9]*Error|Error):/.test(raw)
  const { label, rest } = extractLabel(raw)
  const values =
    level === 'error' && (!label || looksLikeRuntimeError)
      ? raw
        ? [raw]
        : []
      : splitTopLevelValues(rest)

  return {
    raw,
    level,
    values,
    label,
    timestamp: Date.now()
  }
}

export function truncateValue(value: string, maxLen = 60): string {
  if (value.length <= maxLen) {
    return value
  }
  return `${value.slice(0, Math.max(0, maxLen - 3))}...`
}

export function formatValues(values: string[]): string {
  return values.join('  ')
}

export function groupEntries(entries: LogEntry[], maxShow = 5): string {
  const flattened = entries.flatMap((entry) => entry.values)
  if (flattened.length === 0) {
    return ''
  }

  const visible = flattened.slice(0, maxShow)
  const base = formatValues(visible)
  const remaining = flattened.length - visible.length
  if (remaining <= 0) {
    return base
  }
  return `${base}  ... (+${remaining} more)`
}
