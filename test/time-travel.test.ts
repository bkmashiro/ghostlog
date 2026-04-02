import assert from 'node:assert'
import test from 'node:test'
import { LogBufferManager } from '../src/log-buffer.js'
import { TimeTravel } from '../src/time-travel.js'

test('getTimeline returns empty for unknown line', () => {
  const travel = new TimeTravel(new LogBufferManager())
  assert.deepEqual(travel.getTimeline('/tmp/a.ts', 1), [])
})

test('getTimeline returns single frame when only base exists', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { count: 1 }, 100)
  const frames = new TimeTravel(manager).getTimeline('/tmp/a.ts', 1)
  assert.equal(frames.length, 1)
  assert.deepEqual(frames[0], {
    seq: 0,
    timestamp: 100,
    file: '/tmp/a.ts',
    line: 1,
    value: { count: 1 },
    deltaKeys: ['count']
  })
})

test('getTimeline reconstructs 5 frames correctly from deltas', () => {
  const manager = new LogBufferManager()
  for (let index = 0; index < 5; index += 1) {
    manager.add('/tmp/a.ts', 1, { count: index }, 100 + index)
  }
  const frames = new TimeTravel(manager).getTimeline('/tmp/a.ts', 1)
  assert.deepEqual(
    frames.map((frame) => frame.value),
    [{ count: 0 }, { count: 1 }, { count: 2 }, { count: 3 }, { count: 4 }]
  )
})

test('seekTo returns correct frame at seq=0', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, 'a', 100)
  manager.add('/tmp/a.ts', 1, 'b', 101)
  const frame = new TimeTravel(manager).seekTo('/tmp/a.ts', 1, 0)
  assert.equal(frame?.value, 'a')
})

test('seekTo returns correct frame at seq=N', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, 'a', 100)
  manager.add('/tmp/a.ts', 1, 'b', 101)
  manager.add('/tmp/a.ts', 1, 'c', 102)
  const frame = new TimeTravel(manager).seekTo('/tmp/a.ts', 1, 2)
  assert.equal(frame?.value, 'c')
})

test('seekTo returns null for out-of-range seq', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, 'a', 100)
  assert.equal(new TimeTravel(manager).seekTo('/tmp/a.ts', 1, 3), null)
})

test('stepForward advances position', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, 1, 100)
  manager.add('/tmp/a.ts', 1, 2, 101)
  const travel = new TimeTravel(manager)
  travel.seekTo('/tmp/a.ts', 1, 0)
  assert.equal(travel.stepForward('/tmp/a.ts', 1)?.value, 2)
})

test('stepForward returns null at end', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, 1, 100)
  const travel = new TimeTravel(manager)
  travel.seekTo('/tmp/a.ts', 1, 0)
  assert.equal(travel.stepForward('/tmp/a.ts', 1), null)
})

test('stepBackward goes back', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, 1, 100)
  manager.add('/tmp/a.ts', 1, 2, 101)
  const travel = new TimeTravel(manager)
  travel.seekTo('/tmp/a.ts', 1, 1)
  assert.equal(travel.stepBackward('/tmp/a.ts', 1)?.value, 1)
})

test('stepBackward returns null at beginning', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, 1, 100)
  const travel = new TimeTravel(manager)
  travel.seekTo('/tmp/a.ts', 1, 0)
  assert.equal(travel.stepBackward('/tmp/a.ts', 1), null)
})

test('currentFrame returns null before any seek', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, 1, 100)
  assert.equal(new TimeTravel(manager).currentFrame('/tmp/a.ts', 1), null)
})

test('deltaKeys correctly lists changed keys at each frame', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { a: 1, b: 1 }, 100)
  manager.add('/tmp/a.ts', 1, { a: 2, b: 1 }, 101)
  manager.add('/tmp/a.ts', 1, { a: 2 }, 102)
  const frames = new TimeTravel(manager).getTimeline('/tmp/a.ts', 1)
  assert.deepEqual(
    frames.map((frame) => frame.deltaKeys),
    [['a', 'b'], ['a'], ['b']]
  )
})

test('Works with isFullReset deltas', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, { a: 1 }, 100)
  manager.add('/tmp/a.ts', 1, 'reset', 101)
  const frames = new TimeTravel(manager).getTimeline('/tmp/a.ts', 1)
  assert.equal(frames[1].value, 'reset')
  assert.deepEqual(frames[1].deltaKeys, ['$'])
})

test('getTimeline handles ring buffer overflow (missing early frames)', () => {
  const manager = new LogBufferManager({ deltaCapacity: 2 })
  manager.add('/tmp/a.ts', 1, { id: 1 }, 100)
  manager.add('/tmp/a.ts', 1, { id: 2 }, 101)
  manager.add('/tmp/a.ts', 1, { id: 3 }, 102)
  manager.add('/tmp/a.ts', 1, { id: 4 }, 103)
  const frames = new TimeTravel(manager).getTimeline('/tmp/a.ts', 1)
  assert.deepEqual(
    frames.map((frame) => frame.seq),
    [1, 2, 3]
  )
  assert.deepEqual(frames.map((frame) => frame.value), [{ id: 2 }, { id: 3 }, { id: 4 }])
})

test('Multiple lines tracked independently', () => {
  const manager = new LogBufferManager()
  manager.add('/tmp/a.ts', 1, 'one', 100)
  manager.add('/tmp/a.ts', 2, 'two', 101)
  const travel = new TimeTravel(manager)
  travel.seekTo('/tmp/a.ts', 1, 0)
  assert.equal(travel.currentFrame('/tmp/a.ts', 2), null)
  assert.equal(travel.getTimeline('/tmp/a.ts', 2)[0].value, 'two')
})
