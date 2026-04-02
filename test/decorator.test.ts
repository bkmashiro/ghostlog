import assert from 'node:assert'
import test from 'node:test'
import { buildDecorationText, getDecorationOptions } from '../src/decorator.js'
import { LogBufferManager } from '../src/log-buffer.js'
import { parseLogLine } from '../src/parser.js'

test('buildDecorationText formats single entry as "👻 value"', () => {
  const text = buildDecorationText([parseLogLine('value', 'log')])
  assert.equal(text, '👻 value')
})

test('buildDecorationText formats multiple loop entries', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, '0')
  manager.add('/tmp/a.ts', 1, '1')
  manager.add('/tmp/a.ts', 1, '2')
  const text = buildDecorationText(['0', '1', '2'].map((value) => parseLogLine(value, 'log')), {
    buffer: manager.get('/tmp/a.ts', 1)
  })
  assert.equal(text, '👻 "0" → "1" → "2"')
})

test('buildDecorationText uses ⚠ prefix for errors', () => {
  const text = buildDecorationText([parseLogLine('Error: oops', 'error')])
  assert.equal(text, '⚠ Error: oops')
})

test('buildDecorationText summarizes high-volume buffer state', () => {
  const manager = new LogBufferManager()
  for (let index = 0; index < 5; index += 1) {
    manager.add('/tmp/a.ts', 1, { id: index, score: index % 2 }, index)
  }
  const text = buildDecorationText([parseLogLine('ignored', 'log')], {
    buffer: manager.get('/tmp/a.ts', 1)
  })
  assert.match(text, /👻 ×5/)
  assert.match(text, /\[Δ id,score\]/)
})

test('getDecorationOptions returns different colors for log/warn/error', () => {
  const log = getDecorationOptions('log') as { after: { color: string } }
  const warn = getDecorationOptions('warn') as { after: { color: string } }
  const error = getDecorationOptions('error') as { after: { color: string } }
  assert.notEqual(log.after.color, warn.after.color)
  assert.notEqual(warn.after.color, error.after.color)
})
