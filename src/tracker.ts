import { classifyEntries, summarizePatterns } from './classifier.js'
import type { LogEntry, NetworkEntry } from './types.js'

export interface LogLocation {
  file: string
  line: number
  column: number
  callText: string
  kind: 'console' | 'network'
}

const CONSOLE_METHODS = ['log', 'warn', 'error', 'info', 'time', 'timeEnd'] as const
const NETWORK_PATTERNS = [/fetch\s*\(/g, /axios(?:\.[a-zA-Z]+)?\s*\(/g]

function indexToLineColumn(content: string, index: number): { line: number; column: number } {
  let line = 0
  let column = 0
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content[cursor] === '\n') {
      line += 1
      column = 0
    } else {
      column += 1
    }
  }
  return { line, column }
}

function scanCallEnd(content: string, openParenIndex: number): number {
  let quote: '"' | "'" | '`' | null = null
  let escape = false
  let depth = 0

  for (let index = openParenIndex; index < content.length; index += 1) {
    const char = content[index]

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
      depth += 1
      continue
    }

    if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function extractFirstStringLiteral(callText: string): string | null {
  const match = callText.match(/console\.(?:log|warn|error|info|time|timeEnd)\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/s)
  if (!match) {
    return null
  }
  return match[2]
}

function labelSimilarity(label: string, callText: string): number {
  const literal = extractFirstStringLiteral(callText)
  if (!literal) {
    return 0
  }
  if (literal === label) {
    return 100
  }
  if (literal.startsWith(label)) {
    return 80
  }
  if (literal.includes(label)) {
    return 50
  }
  return 0
}

export function findLogLocations(fileContent: string, filePath: string): LogLocation[] {
  const locations: LogLocation[] = []

  for (const method of CONSOLE_METHODS) {
    const pattern = new RegExp(`console\\.${method}\\s*\\(`, 'g')
    for (const match of fileContent.matchAll(pattern)) {
      const start = match.index ?? -1
      if (start < 0) {
        continue
      }
      const openParenIndex = fileContent.indexOf('(', start)
      const end = scanCallEnd(fileContent, openParenIndex)
      if (end < 0) {
        continue
      }
      const { line, column } = indexToLineColumn(fileContent, start)
      locations.push({
        file: filePath,
        line,
        column,
        callText: fileContent.slice(start, end + 1),
        kind: 'console'
      })
    }
  }

  return locations.sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line
    }
    return left.column - right.column
  })
}

export function findNetworkLocations(fileContent: string, filePath: string): LogLocation[] {
  const locations: LogLocation[] = []

  for (const pattern of NETWORK_PATTERNS) {
    for (const match of fileContent.matchAll(pattern)) {
      const start = match.index ?? -1
      if (start < 0) {
        continue
      }
      const openParenIndex = fileContent.indexOf('(', start)
      const end = scanCallEnd(fileContent, openParenIndex)
      if (end < 0) {
        continue
      }
      const { line, column } = indexToLineColumn(fileContent, start)
      locations.push({
        file: filePath,
        line,
        column,
        callText: fileContent.slice(start, end + 1),
        kind: 'network'
      })
    }
  }

  return locations.sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line
    }
    return left.column - right.column
  })
}

export function matchOutputToLocation(
  output: LogEntry,
  locations: LogLocation[]
): LogLocation | null {
  if (locations.length === 0) {
    return null
  }

  if (output.label) {
    const ranked = locations
      .map((location) => ({
        location,
        score: labelSimilarity(output.label!, location.callText)
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score
        }
        if (left.location.line !== right.location.line) {
          return left.location.line - right.location.line
        }
        return left.location.column - right.location.column
      })

    return ranked[0]?.location ?? null
  }

  return locations.length === 1 ? locations[0] : null
}

function networkSimilarity(url: string, callText: string): number {
  if (!url) {
    return 0
  }
  if (callText.includes(url)) {
    return 100
  }
  const pathname = url.split('?')[0]
  if (pathname && callText.includes(pathname)) {
    return 80
  }
  return 0
}

export function matchNetworkToLocation(
  output: NetworkEntry,
  locations: LogLocation[]
): LogLocation | null {
  if (locations.length === 0) {
    return null
  }

  const ranked = locations
    .map((location) => ({
      location,
      score: networkSimilarity(output.url, location.callText)
    }))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score
      }
      return left.location.line - right.location.line
    })

  return ranked[0]?.location ?? null
}

export function summarizeEntryPatterns(entries: LogEntry[]): string | undefined {
  if (entries.length < 10) {
    return undefined
  }

  const values = entries
    .map((entry) => entry.parsedValue)
    .filter((value) => value !== undefined)
  if (values.length < 10) {
    return undefined
  }

  const patterns = classifyEntries(values)
  if (patterns.size <= 1) {
    return undefined
  }

  return summarizePatterns(patterns)
}
