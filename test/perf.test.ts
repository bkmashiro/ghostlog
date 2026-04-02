import assert from 'node:assert'
import test from 'node:test'
import { classifyDuration, parseTimingEntries } from '../src/perf.js'
import type { LogEntry } from '../src/types.js'

function timingEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    raw: '',
    level: 'info',
    values: [],
    timestamp: 0,
    file: '/tmp/example.ts',
    line: 0,
    ...overrides
  }
}

test('parseTimingEntries matches console.time/timeEnd by label', () => {
  const entries = [
    timingEntry({
      timestamp: 100,
      timing: { label: 'load', phase: 'start', startTime: 100 }
    }),
    timingEntry({
      timestamp: 123,
      timing: { label: 'load', phase: 'end', startTime: 100, endTime: 123, duration: 23 }
    })
  ]
  const timings = parseTimingEntries(entries)
  assert.equal(timings.length, 1)
  assert.equal(timings[0].label, 'load')
})

test('parseTimingEntries calculates duration correctly', () => {
  const timings = parseTimingEntries([
    timingEntry({
      timestamp: 100,
      timing: { label: 'load', phase: 'start', startTime: 100 }
    }),
    timingEntry({
      timestamp: 145,
      timing: { label: 'load', phase: 'end', startTime: 100, endTime: 145, duration: 45 }
    })
  ])
  assert.equal(timings[0].duration, 45)
})

test("classifyDuration: 5ms \u2192 'fast', 50ms \u2192 'medium', 200ms \u2192 'slow'", () => {
  assert.equal(classifyDuration(5), 'fast')
  assert.equal(classifyDuration(50), 'medium')
  assert.equal(classifyDuration(200), 'slow')
})

test('parseTimingEntries handles unmatched timeEnd (no start) gracefully', () => {
  const timings = parseTimingEntries([
    timingEntry({
      timestamp: 145,
      timing: { label: 'load', phase: 'end', endTime: 145, duration: 45 }
    })
  ])
  assert.deepEqual(timings, [])
})
