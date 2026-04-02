import assert from 'node:assert'
import test from 'node:test'
import { RingBuffer } from '../src/ring-buffer.js'

test('push adds item to empty buffer', () => {
  const buffer = new RingBuffer<number>(2)
  buffer.push(1)
  assert.equal(buffer.get(0), 1)
})

test('push returns undefined when not full', () => {
  const buffer = new RingBuffer<number>(2)
  assert.equal(buffer.push(1), undefined)
})

test('push evicts oldest when full and returns it', () => {
  const buffer = new RingBuffer<number>(2)
  buffer.push(1)
  buffer.push(2)
  assert.equal(buffer.push(3), 1)
})

test('get(0) returns oldest item', () => {
  const buffer = new RingBuffer<number>(3)
  buffer.push(1)
  buffer.push(2)
  assert.equal(buffer.get(0), 1)
})

test('get(size-1) returns newest item', () => {
  const buffer = new RingBuffer<number>(3)
  buffer.push(1)
  buffer.push(2)
  assert.equal(buffer.get(buffer.size - 1), 2)
})

test('latest() returns most recently pushed', () => {
  const buffer = new RingBuffer<number>(2)
  buffer.push(1)
  buffer.push(2)
  assert.equal(buffer.latest(), 2)
})

test('oldest() returns earliest surviving item', () => {
  const buffer = new RingBuffer<number>(2)
  buffer.push(1)
  buffer.push(2)
  buffer.push(3)
  assert.equal(buffer.oldest(), 2)
})

test('iterator yields items oldest-first', () => {
  const buffer = new RingBuffer<number>(3)
  buffer.push(1)
  buffer.push(2)
  buffer.push(3)
  assert.deepEqual([...buffer], [1, 2, 3])
})

test('size is correct after pushes and evictions', () => {
  const buffer = new RingBuffer<number>(2)
  buffer.push(1)
  buffer.push(2)
  buffer.push(3)
  assert.equal(buffer.size, 2)
})

test('isFull is true when at capacity', () => {
  const buffer = new RingBuffer<number>(2)
  buffer.push(1)
  buffer.push(2)
  assert.equal(buffer.isFull, true)
})

test('clear resets buffer', () => {
  const buffer = new RingBuffer<number>(2)
  buffer.push(1)
  buffer.clear()
  assert.equal(buffer.size, 0)
})

test('toArray returns oldest-first', () => {
  const buffer = new RingBuffer<number>(2)
  buffer.push(1)
  buffer.push(2)
  assert.deepEqual(buffer.toArray(), [1, 2])
})
