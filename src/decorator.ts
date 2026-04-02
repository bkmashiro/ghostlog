import { formatNetworkEntry, groupEntries } from './parser.js'
import { classifyDuration } from './perf.js'
import type { LogEntry } from './types.js'

export interface InlineDecoration {
  line: number
  text: string
  level: LogEntry['level']
}

export function buildDecorationText(entries: LogEntry[]): string {
  if (entries.length === 0) {
    return ''
  }
  if (entries.every((entry) => entry.kind === 'network' && entry.network)) {
    return entries
      .map((entry) => formatNetworkEntry(entry.network!))
      .join('  ')
  }
  if (entries.every((entry) => entry.kind === 'timing' && entry.timing?.duration !== undefined)) {
    return entries
      .map((entry) => {
        const duration = entry.timing?.duration ?? 0
        const prefix =
          classifyDuration(duration) === 'slow'
            ? '⏱'
            : classifyDuration(duration) === 'medium'
              ? '⏱'
              : '⏱'
        return `${prefix} ${duration}ms`
      })
      .join('  ')
  }
  if (entries.every((entry) => entry.kind === 'logpoint')) {
    return entries
      .map((entry) => `📍 ${entry.expression ?? 'expr'} = ${entry.values.join(' ') || entry.raw}`)
      .join('  ')
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
