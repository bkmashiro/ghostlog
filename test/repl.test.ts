import assert from 'node:assert'
import test from 'node:test'
import { GhostlogRepl, formatValue } from '../src/repl.js'

test('evaluate simple arithmetic', () => {
  const repl = new GhostlogRepl()
  const result = repl.evaluate('1 + 1')
  assert.equal(result.output, '2')
})

test('evaluate with $0 context variable', () => {
  const repl = new GhostlogRepl()
  repl.updateContext(new Map([['$line_1', [1, 2, 3]]]))
  const result = repl.evaluate('$0.length')
  assert.equal(result.output, '3')
})

test('evaluate $last', () => {
  const repl = new GhostlogRepl()
  repl.updateContext(
    new Map([
      ['$a', 'hello'],
      ['$b', 'world']
    ])
  )
  const result = repl.evaluate('$last.toUpperCase()')
  assert.equal(result.output, '"WORLD"')
})

test('evaluate returns error for invalid expression', () => {
  const repl = new GhostlogRepl()
  const result = repl.evaluate('invalid!!!')
  assert.ok(result.error)
})

test('evaluate is sandboxed - cannot access process', () => {
  const repl = new GhostlogRepl()
  const result = repl.evaluate('process.env')
  assert.ok(result.error || result.output === 'undefined')
})

test('evaluate is sandboxed - cannot access require', () => {
  const repl = new GhostlogRepl()
  const result = repl.evaluate('require("fs")')
  assert.ok(result.error)
})

test('history records all evaluations', () => {
  const repl = new GhostlogRepl()
  repl.evaluate('1')
  repl.evaluate('2')
  assert.equal(repl.getHistory().length, 2)
})

test('clearHistory empties history', () => {
  const repl = new GhostlogRepl()
  repl.evaluate('1')
  repl.clearHistory()
  assert.deepEqual(repl.getHistory(), [])
})

test('updateContext sets $0 $1 $last correctly', () => {
  const repl = new GhostlogRepl()
  repl.updateContext(
    new Map([
      ['$file_1', 123],
      ['$file_2', 456]
    ])
  )
  const context = repl.getContext()
  assert.equal(context.$0, 123)
  assert.equal(context.$1, 456)
  assert.equal(context.$last, 456)
  assert.equal(context.$file_1, 123)
})

test('formatValue handles primitives', () => {
  assert.equal(formatValue('hello'), '"hello"')
  assert.equal(formatValue(42), '42')
  assert.equal(formatValue(true), 'true')
})

test('formatValue handles arrays with more than 10 items', () => {
  assert.equal(formatValue(Array.from({ length: 11 }, (_, index) => index)), '[ ...11 items ]')
})

test('formatValue handles nested objects with max depth', () => {
  assert.equal(
    formatValue({ a: { b: { c: { d: 1 } } } }, 2),
    '{ a: { b: { ...1 keys } } }'
  )
})

test('formatValue handles null and undefined', () => {
  assert.equal(formatValue(null), 'null')
  assert.equal(formatValue(undefined), 'undefined')
})

test('evaluate timeout - infinite loop does not hang', () => {
  const repl = new GhostlogRepl()
  const result = repl.evaluate('while (true) {}')
  assert.ok(result.error)
})
