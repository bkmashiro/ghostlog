import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { LensStore, applyLens } from '../src/lens.js'

test('applyLens resolves bare property access', () => {
  assert.deepEqual(applyLens({ users: [1, 2, 3] }, '.users.length'), { result: 3 })
})

test('applyLens resolves arrow functions', () => {
  assert.deepEqual(applyLens({ name: 'Alice' }, 'x => x.name.toUpperCase()'), { result: 'ALICE' })
})

test('applyLens returns undefined for optional chains', () => {
  assert.deepEqual(applyLens({ name: 'Alice' }, 'x.nonexistent?.deep'), { result: undefined })
})

test('applyLens surfaces runtime errors', () => {
  const result = applyLens({ ok: true }, 'throw new Error("bad")')
  assert.equal(result.result, undefined)
  assert.match(result.error ?? '', /bad/)
})

test('applyLens supports method calls', () => {
  assert.deepEqual(applyLens([1, 2, 3], 'x.filter(n => n > 1)'), { result: [2, 3] })
})

test('LensStore add remove getForLine and persistence round-trip', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostlog-lens-'))
  const store = new LensStore()
  const lens = store.add('/tmp/example.ts', 4, '.users.length', 'users')
  assert.equal(store.getForLine('/tmp/example.ts', 4)?.id, lens.id)
  store.save(workspaceRoot)

  const loaded = new LensStore()
  loaded.load(workspaceRoot)
  assert.equal(loaded.getForLine('/tmp/example.ts', 4)?.expression, '.users.length')
  loaded.remove(lens.id)
  assert.equal(loaded.getForLine('/tmp/example.ts', 4), undefined)
})
