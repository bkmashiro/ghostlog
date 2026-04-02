import assert from 'node:assert'
import test from 'node:test'
import { DecorationDebouncer } from '../src/debounce.js'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('mark then wait → onFlush called once with correct files', async () => {
  const calls: string[][] = []
  const debouncer = new DecorationDebouncer(10, (files) => {
    calls.push([...files])
  })
  debouncer.mark('/tmp/a.ts')
  await wait(25)
  assert.deepEqual(calls, [['/tmp/a.ts']])
})

test('multiple marks within window → single flush', async () => {
  const calls: string[][] = []
  const debouncer = new DecorationDebouncer(10, (files) => {
    calls.push([...files].sort())
  })
  debouncer.mark('/tmp/a.ts')
  debouncer.mark('/tmp/b.ts')
  await wait(25)
  assert.deepEqual(calls, [['/tmp/a.ts', '/tmp/b.ts']])
})

test('flush() forces immediate callback', () => {
  const calls: string[][] = []
  const debouncer = new DecorationDebouncer(50, (files) => {
    calls.push([...files])
  })
  debouncer.mark('/tmp/a.ts')
  debouncer.flush()
  assert.deepEqual(calls, [['/tmp/a.ts']])
})

test('dispose() prevents further callbacks', async () => {
  const calls: string[][] = []
  const debouncer = new DecorationDebouncer(10, (files) => {
    calls.push([...files])
  })
  debouncer.mark('/tmp/a.ts')
  debouncer.dispose()
  await wait(25)
  assert.equal(calls.length, 0)
})
