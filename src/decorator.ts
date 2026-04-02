import { formatAnnotation } from './annotation.js'
import { formatNetworkEntry, groupEntries } from './parser.js'
import { classifyDuration } from './perf.js'
import { formatValue } from './repl.js'
import { replayTo } from './delta.js'
import type { LogLineBuffer } from './log-buffer.js'
import type { LogEntry } from './types.js'

export interface InlineDecoration {
  line: number
  text: string
  level: LogEntry['level']
}

export function buildDecorationText(
  entries: LogEntry[],
  options?: { patternSummary?: string; buffer?: LogLineBuffer }
): string {
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
  const latestLens = entries.at(-1)?.lens
  if (latestLens) {
    const rendered = latestLens.error ? `Error: ${latestLens.error}` : formatValue(latestLens.result, 2)
    return `${prefix} (lens: ${latestLens.label ?? latestLens.expression}) → ${rendered}`
  }
  const bufferText = options?.buffer ? buildBufferDecorationText(prefix, options.buffer) : ''
  if (bufferText) {
    return bufferText
  }
  if (options?.patternSummary) {
    return `${prefix} ${options.patternSummary}`
  }
  const text = groupEntries(entries)
  return text ? `${prefix} ${text}` : prefix
}

function buildBufferDecorationText(prefix: string, buffer: LogLineBuffer): string {
  const deltas = buffer.deltas.toArray()
  const reconstructableEntries = buffer.deltas.size + 1
  const latestPreview = buffer.latest.raw
  const hotKeys = Object.entries(buffer.changeFrequency)
    .filter(([key]) => key !== '$')
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([key]) => key)

  if (buffer.totalReceived === 1) {
    return `${prefix} ${formatAnnotation(buffer.latest.full ?? buffer.base)}`
  }

  if (buffer.totalReceived > 1 && buffer.deltas.size === 0) {
    return `${prefix} ${formatAnnotation(buffer.latest.full ?? buffer.base)} ×${buffer.totalReceived.toLocaleString()}`
  }

  if (buffer.totalReceived <= 3 && buffer.totalDropped === 0) {
    const values = [buffer.base]
      .concat(deltas.map((delta) => replayTo(buffer.base, deltas, delta.seq)))
      .slice(0, buffer.totalReceived)
      .map((value) => formatAnnotation(value))
    return `${prefix} ${values.join(' \u2192 ')}`
  }

  const latestLabel =
    buffer.latest.full !== undefined ? formatAnnotation(buffer.latest.full) : latestPreview
  const hotKeysLabel = hotKeys.length > 0 ? ` [Δ ${hotKeys.join(',')}]` : ''
  const overflowLabel =
    buffer.totalDropped > 0 ? ` [last ${reconstructableEntries.toLocaleString()} entries]` : ''
  return `${prefix} ×${buffer.totalReceived.toLocaleString()}${overflowLabel} [${latestLabel}]${hotKeysLabel}`
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
