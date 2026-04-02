import { formatValue } from './repl.js'

export type AnnotationStyle = 'auto' | 'raw' | 'count' | 'table' | 'chart'

const SPARK_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function truncate(text: string, max = 40): string {
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max)}...`
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'number')
}

function isHomogeneousObjectArray(value: unknown): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => isPlainObject(entry)) &&
    new Set(value.flatMap((entry) => Object.keys(entry))).size > 0
  )
}

function formatCount(value: number): string {
  return `×${Math.round(value).toLocaleString()}`
}

function formatError(error: Error): string {
  const stackLine = error.stack?.split('\n').map((line) => line.trim()).find((line) => line && line !== error.toString())
  return stackLine ? `${error.message} · ${stackLine}` : error.message
}

function formatTable(value: Array<Record<string, unknown>>): string {
  const columns = [...new Set(value.flatMap((entry) => Object.keys(entry)))].slice(0, 3)
  const rows = value.slice(0, 2).map((entry) => columns.map((column) => formatAnnotation(entry[column], 'raw')).join(' | '))
  return `${columns.join(' | ')} :: ${rows.join(' ; ')}`
}

export function detectAnnotationStyle(value: unknown): AnnotationStyle {
  if (isNumberArray(value)) {
    return 'chart'
  }
  if (isHomogeneousObjectArray(value)) {
    return 'table'
  }
  if (isPlainObject(value) && typeof value.count === 'number') {
    return 'count'
  }
  return 'raw'
}

export function sparkline(values: number[]): string {
  if (values.length === 0) {
    return ''
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    const block = max <= 0 ? SPARK_BLOCKS[0] : SPARK_BLOCKS.at(-1)!
    return block.repeat(values.length)
  }
  return values
    .map((value) => {
      const ratio = (value - min) / (max - min)
      const index = Math.max(0, Math.min(SPARK_BLOCKS.length - 1, Math.round(ratio * (SPARK_BLOCKS.length - 1))))
      return SPARK_BLOCKS[index]
    })
    .join('')
}

export function formatAnnotation(value: unknown, style: AnnotationStyle = 'auto'): string {
  const resolvedStyle = style === 'auto' ? detectAnnotationStyle(value) : style

  if (value === null || value === undefined) {
    return '∅'
  }
  if (typeof value === 'boolean') {
    return value ? '✓' : '✗'
  }
  if (value instanceof Error) {
    return formatError(value)
  }
  if (typeof value === 'string') {
    return truncate(JSON.stringify(value))
  }

  if (resolvedStyle === 'count' && isPlainObject(value) && typeof value.count === 'number') {
    return formatCount(value.count)
  }
  if (resolvedStyle === 'chart' && isNumberArray(value)) {
    return sparkline(value)
  }
  if (resolvedStyle === 'table' && isHomogeneousObjectArray(value)) {
    return truncate(formatTable(value), 60)
  }

  return truncate(formatValue(value, 2), 60)
}
