import assert from 'node:assert'
import test from 'node:test'
import { PinStore, extractPath, formatPinHistory } from '../src/pin.js'

test('extractPath resolves nested objects', () => {
  assert.deepEqual(extractPath({ a: { b: { c: 42 } } }, 'a.b.c'), { value: 42, found: true })
})

test('extractPath resolves array indexes', () => {
  assert.deepEqual(extractPath({ arr: [1, 2, 3] }, 'arr[1]'), { value: 2, found: true })
})

test('extractPath reports missing values', () => {
  assert.deepEqual(extractPath({}, 'nonexistent.path'), { value: undefined, found: false })
})

test('PinStore marks first value as unchanged', () => {
  const store = new PinStore()
  const pin = store.add('/tmp/example.ts', 2, 'a')
  store.onNewValue('/tmp/example.ts', 2, { a: 1 })
  assert.equal(store.list()[0].history[0].changed, false)
  assert.equal(store.list()[0].id, pin.id)
})

test('PinStore marks changed and unchanged updates correctly', () => {
  const store = new PinStore()
  store.add('/tmp/example.ts', 2, 'a')
  store.onNewValue('/tmp/example.ts', 2, { a: 1 })
  store.onNewValue('/tmp/example.ts', 2, { a: 2 })
  store.onNewValue('/tmp/example.ts', 2, { a: 2 })
  assert.equal(store.list()[0].history[1].changed, true)
  assert.equal(store.list()[0].history[2].changed, false)
})

test('PinStore caps history at maxHistory', () => {
  const store = new PinStore()
  store.add('/tmp/example.ts', 2, 'a')
  for (let index = 0; index < 55; index += 1) {
    store.onNewValue('/tmp/example.ts', 2, { a: index })
  }
  assert.equal(store.list()[0].history.length, 50)
})

test('formatPinHistory renders timestamps and values', () => {
  const store = new PinStore()
  const pin = store.add('/tmp/example.ts', 2, 'a')
  store.onNewValue('/tmp/example.ts', 2, { a: 'active' })
  const formatted = formatPinHistory(pin)
  assert.match(formatted, /a/)
  assert.match(formatted, /active/)
})
