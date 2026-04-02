import assert from 'node:assert'
import test from 'node:test'
import { LogDiffManager } from '../src/diff.js'
import type { LogEntry } from '../src/types.js'

function createEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    raw: 'value',
    level: 'log',
    values: ['value'],
    timestamp: 1,
    file: '/tmp/example.ts',
    line: 0,
    ...overrides
  }
}

test('diff() finds added entries (in snap2 but not snap1)', () => {
  const manager = new LogDiffManager()
  const snap1 = manager.saveSnapshot([createEntry({ raw: 'a' })])
  const snap2 = manager.saveSnapshot([createEntry({ raw: 'a' }), createEntry({ raw: 'b', line: 1 })])
  const diff = manager.diff(snap1, snap2)
  assert.equal(diff.added.length, 1)
})

test('diff() finds removed entries', () => {
  const manager = new LogDiffManager()
  const snap1 = manager.saveSnapshot([createEntry({ raw: 'a' }), createEntry({ raw: 'b', line: 1 })])
  const snap2 = manager.saveSnapshot([createEntry({ raw: 'a' })])
  const diff = manager.diff(snap1, snap2)
  assert.equal(diff.removed.length, 1)
})

test('diff() finds changed entries (same line, different value)', () => {
  const manager = new LogDiffManager()
  const snap1 = manager.saveSnapshot([createEntry({ raw: 'a', values: ['a'] })])
  const snap2 = manager.saveSnapshot([createEntry({ raw: 'b', values: ['b'] })])
  const diff = manager.diff(snap1, snap2)
  assert.equal(diff.changed.length, 1)
})

test('diff() returns empty arrays when snapshots are identical', () => {
  const manager = new LogDiffManager()
  const entries = [createEntry({ raw: 'a' })]
  const snap1 = manager.saveSnapshot(entries)
  const snap2 = manager.saveSnapshot(entries)
  const diff = manager.diff(snap1, snap2)
  assert.deepEqual(diff, { added: [], removed: [], changed: [] })
})
