import assert from 'node:assert'
import test from 'node:test'
import { exportLogs } from '../src/export.js'
import { LogBufferManager } from '../src/log-buffer.js'
import type { NetworkEntry } from '../src/types.js'

function makeBuffers(): ReturnType<LogBufferManager['getAll']> {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { count: 1 }, 100, 'log')
  manager.add('/tmp/a.ts', 1, { count: 2 }, 101, 'log')
  manager.add('/tmp/b.ts', 2, 'warn text', 102, 'warn')
  return manager.getAll()
}

function makeNetworkEntries(): NetworkEntry[] {
  return [
    {
      url: 'https://api.example.com/users',
      method: 'GET',
      status: 200,
      duration: 32,
      timestamp: 103,
      line: 4
    }
  ]
}

test('exportLogs JSON contains all entries', () => {
  const content = exportLogs(makeBuffers(), makeNetworkEntries(), { format: 'json' })
  const parsed = JSON.parse(content) as Array<{ file: string }>
  assert.equal(parsed.length, 4)
})

test('exportLogs CSV has correct header row', () => {
  const content = exportLogs(makeBuffers(), [], { format: 'csv' })
  assert.equal(content.split('\n')[0], 'timestamp,file,line,level,value')
})

test('exportLogs CSV encodes values with commas correctly', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { text: 'a,b' }, 100, 'log')
  const content = exportLogs(manager.getAll(), [], { format: 'csv' })
  assert.match(content, /"\{ text: ""a,b"" \}"/)
})

test('exportLogs Markdown produces valid table', () => {
  const content = exportLogs(makeBuffers(), [], { format: 'markdown' })
  assert.match(content, /^\| Timestamp \| File \| Line \| Level \| Value \|/)
  assert.match(content, /\| --- \| --- \| --- \| --- \| --- \|/)
})

test('exportLogs HAR only includes network entries', () => {
  const content = exportLogs(makeBuffers(), makeNetworkEntries(), { format: 'har' })
  const parsed = JSON.parse(content) as { log: { entries: Array<{ request: { url: string } }> } }
  assert.equal(parsed.log.entries.length, 1)
  assert.equal(parsed.log.entries[0].request.url, 'https://api.example.com/users')
})

test('filter by file path works', () => {
  const content = exportLogs(makeBuffers(), [], { format: 'json', files: ['/tmp/b.ts'] })
  const parsed = JSON.parse(content) as Array<{ file: string }>
  assert.deepEqual(parsed.map((entry) => entry.file), ['/tmp/b.ts'])
})

test('filter by level works', () => {
  const content = exportLogs(makeBuffers(), [], { format: 'json', levels: ['warn'] })
  const parsed = JSON.parse(content) as Array<{ level: string }>
  assert.deepEqual(parsed.map((entry) => entry.level), ['warn'])
})

test('filter by since timestamp works', () => {
  const content = exportLogs(makeBuffers(), makeNetworkEntries(), { format: 'json', since: 102 })
  const parsed = JSON.parse(content) as Array<{ timestamp: number }>
  assert.deepEqual(parsed.map((entry) => entry.timestamp), [102, 103])
})

test('maxEntries limit respected', () => {
  const content = exportLogs(makeBuffers(), makeNetworkEntries(), { format: 'json', maxEntries: 2 })
  const parsed = JSON.parse(content) as Array<unknown>
  assert.equal(parsed.length, 2)
})

test('empty buffers → empty export', () => {
  assert.equal(exportLogs([], [], { format: 'json' }), '')
})

test('JSON export is valid parseable JSON', () => {
  const content = exportLogs(makeBuffers(), [], { format: 'json' })
  assert.doesNotThrow(() => JSON.parse(content))
})

test('CSV row count matches entry count', () => {
  const content = exportLogs(makeBuffers(), makeNetworkEntries(), { format: 'csv' })
  assert.equal(content.split('\n').length, 5)
})
