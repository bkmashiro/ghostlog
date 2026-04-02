import assert from 'node:assert'
import test from 'node:test'
import { generateInjectionScript } from '../src/injector.js'

test('generateInjectionScript returns valid JS string', () => {
  const script = generateInjectionScript()
  assert.equal(typeof script, 'string')
  assert.ok(script.length > 0)
})

test('generateInjectionScript contains globalThis.fetch override', () => {
  const script = generateInjectionScript()
  assert.match(script, /globalThis\.fetch = async function/)
})

test('generateInjectionScript contains __ghostlog_send call', () => {
  const script = generateInjectionScript()
  assert.match(script, /__ghostlog_send/)
})
