import assert from 'node:assert'
import test from 'node:test'
import { classifyEntries, detectPattern, summarizePatterns } from '../src/classifier.js'

test('detectPattern returns sorted object keys', () => {
  assert.equal(detectPattern({ id: 1, name: 'a' }), '{id,name}')
})

test('detectPattern uses constructor name for errors', () => {
  assert.equal(detectPattern(new Error('oops')), 'Error')
})

test('detectPattern returns primitive types', () => {
  assert.equal(detectPattern('hello'), 'string')
  assert.equal(detectPattern(42), 'number')
})

test('classifyEntries groups values by pattern', () => {
  const patterns = classifyEntries([{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { x: 1 }])
  assert.equal(patterns.size, 2)
})

test('summarizePatterns includes names and counts', () => {
  const patterns = classifyEntries([{ id: 1 }, { id: 2 }, 'hello'])
  const summary = summarizePatterns(patterns)
  assert.match(summary, /\{id\}/)
  assert.match(summary, /string/)
})

test('single pattern summary omits wrapper', () => {
  const patterns = classifyEntries(['a', 'b'])
  assert.equal(summarizePatterns(patterns), 'string×2')
})
