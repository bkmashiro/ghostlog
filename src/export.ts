import * as path from 'node:path'
import { applyDelta } from './delta.js'
import type { LogLineBuffer } from './log-buffer.js'
import { formatAnnotation } from './annotation.js'
import type { NetworkEntry } from './types.js'

export type ExportFormat = 'json' | 'csv' | 'har' | 'markdown'

export interface ExportOptions {
  format: ExportFormat
  files?: string[]
  levels?: string[]
  since?: number
  maxEntries?: number
}

interface ExportEntry {
  timestamp: number
  file: string
  line: number
  level: string
  value: unknown
  kind: 'log' | 'network'
}

function csvEscape(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function toLogEntries(buffers: LogLineBuffer[]): ExportEntry[] {
  const entries: ExportEntry[] = []
  for (const buffer of buffers) {
    const deltaBySeq = new Map(buffer.deltas.toArray().map((delta) => [delta.seq, delta]))
    let current = buffer.base
    entries.push({
      timestamp: buffer.baseTimestamp,
      file: buffer.file,
      line: buffer.line,
      level: buffer.level ?? 'log',
      value: current,
      kind: 'log'
    })
    for (let seq = buffer.baseSeq + 1; seq < buffer.totalReceived; seq += 1) {
      const delta = deltaBySeq.get(seq)
      if (delta) {
        current = applyDelta(current, delta)
      }
      entries.push({
        timestamp: delta?.timestamp ?? buffer.baseTimestamp,
        file: buffer.file,
        line: buffer.line,
        level: buffer.level ?? 'log',
        value: current,
        kind: 'log'
      })
    }
  }
  return entries
}

function toNetworkEntries(networkEntries: NetworkEntry[]): ExportEntry[] {
  return networkEntries.map((entry) => ({
    timestamp: entry.timestamp,
    file: entry.url,
    line: entry.line ?? 0,
    level: entry.error ? 'error' : 'info',
    value: entry,
    kind: 'network'
  }))
}

function applyFilters(entries: ExportEntry[], options: ExportOptions): ExportEntry[] {
  const fileSet = options.files ? new Set(options.files) : undefined
  const levelSet = options.levels ? new Set(options.levels) : undefined
  const filtered = entries
    .filter((entry) => (fileSet ? fileSet.has(entry.file) : true))
    .filter((entry) => (levelSet ? levelSet.has(entry.level) : true))
    .filter((entry) => (typeof options.since === 'number' ? entry.timestamp >= options.since : true))
    .sort((left, right) => left.timestamp - right.timestamp)
  if (typeof options.maxEntries === 'number') {
    return filtered.slice(0, options.maxEntries)
  }
  return filtered
}

function renderJson(entries: ExportEntry[]): string {
  return JSON.stringify(entries, null, 2)
}

function renderCsv(entries: ExportEntry[]): string {
  const header = 'timestamp,file,line,level,value'
  const rows = entries.map((entry) =>
    [entry.timestamp, entry.file, entry.line + 1, entry.level, csvEscape(formatAnnotation(entry.value, 'raw'))].join(',')
  )
  return [header, ...rows].join('\n')
}

function renderMarkdown(entries: ExportEntry[]): string {
  const header = '| Timestamp | File | Line | Level | Value |'
  const separator = '| --- | --- | --- | --- | --- |'
  const rows = entries.map((entry) => {
    const value = formatAnnotation(entry.value, 'raw').replaceAll('|', '\\|')
    return `| ${entry.timestamp} | ${entry.file} | ${entry.line + 1} | ${entry.level} | ${value} |`
  })
  return [header, separator, ...rows].join('\n')
}

function renderHar(networkEntries: NetworkEntry[]): string {
  return JSON.stringify(
    {
      log: {
        version: '1.2',
        creator: { name: 'GhostLog', version: '0.4.0' },
        entries: networkEntries.map((entry) => ({
          startedDateTime: new Date(entry.timestamp).toISOString(),
          time: entry.duration,
          request: {
            method: entry.method,
            url: entry.url,
            httpVersion: 'HTTP/1.1',
            headers: [],
            queryString: [],
            headersSize: -1,
            bodySize: -1
          },
          response: {
            status: entry.status ?? 0,
            statusText: entry.error ?? '',
            httpVersion: 'HTTP/1.1',
            headers: [],
            content: { size: 0, mimeType: 'application/json' },
            redirectURL: '',
            headersSize: -1,
            bodySize: -1
          },
          timings: { send: 0, wait: entry.duration, receive: 0 }
        }))
      }
    },
    null,
    2
  )
}

export function exportLogs(
  buffers: LogLineBuffer[],
  networkEntries: NetworkEntry[],
  options: ExportOptions
): string {
  if (buffers.length === 0 && networkEntries.length === 0) {
    return ''
  }

  if (options.format === 'har') {
    const filteredNetworkEntries = applyFilters(toNetworkEntries(networkEntries), options)
      .filter((entry) => entry.kind === 'network')
      .map((entry) => entry.value as NetworkEntry)
    return filteredNetworkEntries.length > 0 ? renderHar(filteredNetworkEntries) : ''
  }

  const entries = applyFilters([...toLogEntries(buffers), ...toNetworkEntries(networkEntries)], options)
  if (entries.length === 0) {
    return ''
  }

  switch (options.format) {
    case 'json':
      return renderJson(entries)
    case 'csv':
      return renderCsv(entries)
    case 'markdown':
      return renderMarkdown(entries)
    case 'har':
      return renderHar(entries.map((entry) => entry.value as NetworkEntry))
  }
}

export async function saveExport(content: string, format: ExportFormat): Promise<void> {
  const vscode = await import('vscode')
  const extension = format === 'markdown' ? 'md' : format
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(), `ghostlog-export.${extension}`)),
    filters: {
      [format.toUpperCase()]: [extension]
    }
  })
  if (!uri) {
    return
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'))
  vscode.window.showInformationMessage(`GhostLog export saved: ${path.basename(uri.fsPath)}`)
}
