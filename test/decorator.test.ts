import assert from 'node:assert'
import test from 'node:test'
import { buildDecorationText, getDecorationOptions } from '../src/decorator.js'
import { parseLogLine } from '../src/parser.js'

test('buildDecorationText formats single entry as "👻 value"', () => {
  const text = buildDecorationText([parseLogLine('value', 'log')])
  assert.equal(text, '👻 value')
})

test('buildDecorationText formats multiple loop entries', () => {
  const text = buildDecorationText(['0', '1', '2'].map((value) => parseLogLine(value, 'log')))
  assert.equal(text, '👻 0  1  2')
})

test('buildDecorationText uses ⚠ prefix for errors', () => {
  const text = buildDecorationText([parseLogLine('Error: oops', 'error')])
  assert.equal(text, '⚠ Error: oops')
})

test('getDecorationOptions returns different colors for log/warn/error', () => {
  const log = getDecorationOptions('log') as { after: { color: string } }
  const warn = getDecorationOptions('warn') as { after: { color: string } }
  const error = getDecorationOptions('error') as { after: { color: string } }
  assert.notEqual(log.after.color, warn.after.color)
  assert.notEqual(warn.after.color, error.after.color)
})
