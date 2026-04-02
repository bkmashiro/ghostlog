import type { LogEntry } from './parser.js'
import { groupEntries } from './parser.js'

export interface InlineDecoration {
  line: number
  text: string
  level: LogEntry['level']
}

export function buildDecorationText(entries: LogEntry[]): string {
  if (entries.length === 0) {
    return ''
  }
  const highestLevel =
    entries.find((entry) => entry.level === 'error')?.level ??
    entries.find((entry) => entry.level === 'warn')?.level ??
    entries[0].level
  const prefix = highestLevel === 'error' ? '⚠' : highestLevel === 'warn' ? '👻 !' : '👻'
  const text = groupEntries(entries)
  return text ? `${prefix} ${text}` : prefix
}

export function getDecorationOptions(level: LogEntry['level']): object {
  const colorByLevel: Record<LogEntry['level'], string> = {
    log: 'rgba(120, 120, 120, 0.95)',
    info: 'rgba(80, 120, 180, 0.95)',
    warn: 'rgba(180, 120, 40, 0.95)',
    error: 'rgba(196, 68, 68, 0.98)'
  }

  return {
    after: {
      color: colorByLevel[level],
      margin: '0 0 0 1.5rem',
      fontStyle: 'italic'
    },
    rangeBehavior: 1
  }
}
