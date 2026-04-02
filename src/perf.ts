import type { LogEntry, TimingEntry } from './types.js'

function parseDuration(value: string): number | undefined {
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)ms/)
  return match ? Number(match[1]) : undefined
}

export function parseTimingEntries(logs: LogEntry[]): TimingEntry[] {
  const active = new Map<string, TimingEntry>()
  const completed: TimingEntry[] = []

  for (const entry of logs) {
    const timing = entry.timing
    if (timing?.phase === 'start') {
      active.set(timing.label, {
        label: timing.label,
        startTime: timing.startTime ?? entry.timestamp,
        file: entry.file ?? '',
        startLine: entry.line ?? 0
      })
      continue
    }

    const endLabel =
      timing?.phase === 'end'
        ? timing.label
        : entry.label?.endsWith(':') && entry.values.some((value) => /ms/.test(value))
          ? entry.label.slice(0, -1)
          : undefined
    if (!endLabel) {
      continue
    }

    const start = active.get(endLabel)
    const duration =
      timing?.duration ??
      (typeof start?.startTime === 'number' ? entry.timestamp - start.startTime : undefined) ??
      parseDuration(entry.values.join(' '))
    if (!start) {
      continue
    }

    const completedEntry: TimingEntry = {
      ...start,
      endTime: timing?.endTime ?? entry.timestamp,
      duration,
      endLine: entry.line ?? start.startLine
    }
    completed.push(completedEntry)
    active.delete(endLabel)
  }

  return completed
}

export function classifyDuration(ms: number): 'fast' | 'medium' | 'slow' {
  if (ms < 10) {
    return 'fast'
  }
  if (ms < 100) {
    return 'medium'
  }
  return 'slow'
}
