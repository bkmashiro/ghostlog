import assert from 'node:assert'
import test from 'node:test'
import { LogBufferManager } from '../src/log-buffer.js'

test('add stores first entry as base', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { value: 1 }, 100)
  const buffer = manager.get('/tmp/a.ts', 1)
  assert.deepEqual(buffer?.base, { value: 1 })
})

test('add returns deduplicated for identical consecutive values', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { value: 1 }, 100)
  assert.equal(manager.add('/tmp/a.ts', 1, { value: 1 }, 101), 'deduplicated')
})

test('add stores delta for changed value', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { value: 1 }, 100)
  manager.add('/tmp/a.ts', 1, { value: 2 }, 101)
  assert.equal(manager.get('/tmp/a.ts', 1)?.deltas.size, 1)
})

test('add handles 10,000 entries without growing memory unboundedly', () => {
  const manager = new LogBufferManager({ deltaCapacity: 200 })
  for (let index = 0; index < 10_000; index += 1) {
    manager.add('/tmp/a.ts', 1, { id: index, stable: true }, index)
  }
  const buffer = manager.get('/tmp/a.ts', 1)!
  assert.equal(buffer.deltas.size, 200)
})

test('totalReceived counts all entries including deduplicated', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, 'same', 1)
  manager.add('/tmp/a.ts', 1, 'same', 2)
  assert.equal(manager.get('/tmp/a.ts', 1)?.totalReceived, 2)
})

test('totalDropped increments when ring buffer overflows', () => {
  const manager = new LogBufferManager({ deltaCapacity: 2 })
  manager.add('/tmp/a.ts', 1, { id: 1 }, 1)
  manager.add('/tmp/a.ts', 1, { id: 2 }, 2)
  manager.add('/tmp/a.ts', 1, { id: 3 }, 3)
  manager.add('/tmp/a.ts', 1, { id: 4 }, 4)
  assert.equal(manager.get('/tmp/a.ts', 1)?.totalDropped, 1)
})

test('reconstruct(seq=0) returns base value', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { id: 1 }, 1)
  assert.deepEqual(manager.reconstruct('/tmp/a.ts', 1, 0), { id: 1 })
})

test('reconstruct(seq=5) applies 5 deltas correctly', () => {
  const manager = new LogBufferManager()
  for (let index = 0; index <= 5; index += 1) {
    manager.add('/tmp/a.ts', 1, { id: index }, index)
  }
  assert.deepEqual(manager.reconstruct('/tmp/a.ts', 1, 5), { id: 5 })
})

test('latest always returns most recent value', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { id: 1 }, 1)
  manager.add('/tmp/a.ts', 1, { id: 2 }, 2)
  assert.equal(manager.get('/tmp/a.ts', 1)?.latest.raw.includes('"id":2'), true)
})

test('changeFrequency tracks most-changed keys', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { id: 1, score: 1 }, 1)
  manager.add('/tmp/a.ts', 1, { id: 2, score: 1 }, 2)
  manager.add('/tmp/a.ts', 1, { id: 3, score: 2 }, 3)
  assert.deepEqual(manager.get('/tmp/a.ts', 1)?.changeFrequency, { id: 2, score: 1 })
})

test('clear removes specific file buffers', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { id: 1 }, 1)
  manager.add('/tmp/b.ts', 1, { id: 2 }, 2)
  manager.clear('/tmp/a.ts')
  assert.equal(manager.get('/tmp/a.ts', 1), undefined)
  assert.notEqual(manager.get('/tmp/b.ts', 1), undefined)
})
