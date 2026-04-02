import type { LogEntry } from './types.js'

export interface LogSnapshot {
  id: string
  name?: string
  timestamp: number
  entries: LogEntry[]
}

export interface LogDiff {
  added: LogEntry[]
  removed: LogEntry[]
  changed: Array<{ before: LogEntry; after: LogEntry }>
}

function createFingerprint(entry: LogEntry): string {
  return JSON.stringify({
    file: entry.file ?? '',
    line: entry.line ?? -1,
    kind: entry.kind ?? 'log',
    raw: entry.raw,
    level: entry.level,
    values: entry.values
  })
}

function createLineKey(entry: LogEntry): string {
  return `${entry.file ?? ''}:${entry.line ?? -1}:${entry.kind ?? 'log'}`
}

export class LogDiffManager {
  private readonly snapshots: LogSnapshot[] = []

  saveSnapshot(entries: LogEntry[], name?: string): LogSnapshot {
    const snapshot: LogSnapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      timestamp: Date.now(),
      entries: entries.map((entry) => ({ ...entry }))
    }
    this.snapshots.push(snapshot)
    return snapshot
  }

  listSnapshots(): LogSnapshot[] {
    return [...this.snapshots]
  }

  getLastSnapshot(): LogSnapshot | undefined {
    return this.snapshots.at(-1)
  }

  diff(snap1: LogSnapshot, snap2: LogSnapshot): LogDiff {
    const snap1Fingerprints = new Map<string, LogEntry>()
    const snap2Fingerprints = new Map<string, LogEntry>()
    const snap1ByLine = new Map<string, LogEntry>()
    const snap2ByLine = new Map<string, LogEntry>()

    for (const entry of snap1.entries) {
      snap1Fingerprints.set(createFingerprint(entry), entry)
      snap1ByLine.set(createLineKey(entry), entry)
    }
    for (const entry of snap2.entries) {
      snap2Fingerprints.set(createFingerprint(entry), entry)
      snap2ByLine.set(createLineKey(entry), entry)
    }

    const added = snap2.entries.filter((entry) => !snap1Fingerprints.has(createFingerprint(entry)))
    const removed = snap1.entries.filter((entry) => !snap2Fingerprints.has(createFingerprint(entry)))
    const changed: Array<{ before: LogEntry; after: LogEntry }> = []

    for (const [lineKey, before] of snap1ByLine.entries()) {
      const after = snap2ByLine.get(lineKey)
      if (!after) {
        continue
      }
      if (createFingerprint(before) !== createFingerprint(after)) {
        changed.push({ before, after })
      }
    }

    return { added, removed, changed }
  }
}
