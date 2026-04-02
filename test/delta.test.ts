import assert from 'node:assert'
import test from 'node:test'
import { analyzeChanges, computeDelta, replayTo, serializeValue } from '../src/delta.js'

test('computeDelta returns null for identical primitives', () => {
  assert.equal(computeDelta(1, 1, 1), null)
})

test('computeDelta returns null for structurally equal objects', () => {
  assert.equal(computeDelta({ a: 1 }, { a: 1 }, 1), null)
})

test('computeDelta detects single key change', () => {
  const delta = computeDelta({ a: 1 }, { a: 2 }, 1)
  assert.deepEqual(delta?.changes, { a: 2 })
  assert.deepEqual(delta?.removed, [])
  assert.equal(delta?.isFullReset, false)
})

test('computeDelta detects multiple key changes', () => {
  const delta = computeDelta({ a: 1, b: 2 }, { a: 3, b: 4 }, 1)
  assert.deepEqual(delta?.changes, { a: 3, b: 4 })
})

test('computeDelta detects removed key', () => {
  const delta = computeDelta({ a: 1, b: 2 }, { a: 1 }, 1)
  assert.deepEqual(delta?.removed, ['b'])
})

test('computeDelta isFullReset for primitive-to-primitive change', () => {
  const delta = computeDelta('a', 'b', 1)
  assert.equal(delta?.isFullReset, true)
  assert.deepEqual(delta?.changes, { $: 'b' })
})

test('computeDelta isFullReset for type change (object → array)', () => {
  const delta = computeDelta({ a: 1 }, [1], 1)
  assert.equal(delta?.isFullReset, true)
})

test('replayTo reconstructs value at seq 0 (just base)', () => {
  const base = { a: 1 }
  assert.deepEqual(replayTo(base, [], 0), { a: 1 })
})

test('replayTo reconstructs value after 3 deltas', () => {
  const base = { count: 0 }
  const deltas = [
    computeDelta(base, { count: 1 }, 1)!,
    computeDelta({ count: 1 }, { count: 2 }, 2)!,
    computeDelta({ count: 2 }, { count: 3 }, 3)!
  ]
  assert.deepEqual(replayTo(base, deltas, 3), { count: 3 })
})

test('replayTo handles isFullReset delta', () => {
  const deltas = [computeDelta({ a: 1 }, 'reset', 1)!]
  assert.equal(replayTo({ a: 1 }, deltas, 1), 'reset')
})

test('analyzeChanges counts key changes correctly', () => {
  const deltas = [
    computeDelta({ a: 1 }, { a: 2, b: 1 }, 1)!,
    computeDelta({ a: 2, b: 1 }, { a: 3 }, 2)!
  ]
  assert.deepEqual(analyzeChanges(deltas), { a: 2, b: 2 })
})

test('serializeValue truncates large values', () => {
  const serialized = serializeValue('x'.repeat(500), 10)
  assert.equal(serialized.raw.endsWith('...'), true)
  assert.equal(serialized.full, undefined)
})

test('serializeValue preserves small values fully', () => {
  const serialized = serializeValue({ ok: true }, 1024)
  assert.deepEqual(serialized.full, { ok: true })
  assert.equal(serialized.type, 'object')
})
