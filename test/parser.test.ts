import assert from 'node:assert'
import test from 'node:test'
import {
  formatValues,
  groupEntries,
  parseLogLine,
  parseStructuredPayload,
  truncateValue,
  GHOSTLOG_PREFIX
} from '../src/parser.js'

test('parseLogLine extracts label and value from "user: {...}"', () => {
  const entry = parseLogLine("user: { id: 1, name: 'Alice' }", 'log')
  assert.equal(entry.label, 'user:')
  assert.deepEqual(entry.values, ["{ id: 1, name: 'Alice' }"])
})

test('parseLogLine handles multi-value: "a b c" → values [a, b, c]', () => {
  const entry = parseLogLine('a b c', 'log')
  assert.deepEqual(entry.values, ['a', 'b', 'c'])
})

test('parseLogLine handles error level', () => {
  const entry = parseLogLine('Error: oops at index.ts:8', 'error')
  assert.equal(entry.level, 'error')
  assert.deepEqual(entry.values, ['Error: oops at index.ts:8'])
})

test('truncateValue cuts at 60 chars and adds ...', () => {
  const value = 'x'.repeat(80)
  assert.equal(truncateValue(value, 60), `${'x'.repeat(57)}...`)
})

test('truncateValue does not cut short strings', () => {
  assert.equal(truncateValue('short', 60), 'short')
})

test('formatValues joins with double space', () => {
  assert.equal(formatValues(['a', 'b', 'c']), 'a  b  c')
})

test('groupEntries shows first 5 values for loop', () => {
  const entries = ['0', '1', '2', '3', '4'].map((value) => parseLogLine(value, 'log'))
  assert.equal(groupEntries(entries, 5), '0  1  2  3  4')
})

test('groupEntries shows (+N more) when overflow', () => {
  const entries = ['0', '1', '2', '3', '4', '5', '6'].map((value) => parseLogLine(value, 'log'))
  assert.equal(groupEntries(entries, 5), '0  1  2  3  4  ... (+2 more)')
})

test('groupEntries returns single value when only 1 entry', () => {
  const entries = [parseLogLine('value', 'log')]
  assert.equal(groupEntries(entries), 'value')
})

test('parseStructuredPayload parses GhostLog runtime payloads', () => {
  const payload = parseStructuredPayload(
    `${GHOSTLOG_PREFIX}{"type":"network","method":"GET","url":"/api/users"}`
  )
  assert.equal(payload?.type, 'network')
})
