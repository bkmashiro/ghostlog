export type LogLevel = 'log' | 'info' | 'warn' | 'error'

export type EntryKind = 'log' | 'network' | 'logpoint' | 'timing'

export interface NetworkEntry {
  url: string
  method: string
  status?: number
  error?: string
  duration: number
  timestamp: number
  line?: number
}

export interface TimingEntry {
  label: string
  startTime: number
  endTime?: number
  duration?: number
  file: string
  startLine: number
  endLine?: number
}

export interface LogEntry {
  raw: string
  level: LogLevel
  values: string[]
  label?: string
  timestamp: number
  kind?: EntryKind
  file?: string
  line?: number
  network?: NetworkEntry
  timing?: {
    label: string
    phase: 'start' | 'end'
    startTime?: number
    endTime?: number
    duration?: number
  }
  logpointId?: string
  expression?: string
}
