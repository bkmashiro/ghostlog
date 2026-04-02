import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { LogpointManager } from '../src/logpoint.js'

function createManager(): { manager: LogpointManager; storagePath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostlog-logpoint-'))
  const storagePath = path.join(dir, '.ghostlog', 'logpoints.json')
  return { manager: new LogpointManager(storagePath), storagePath }
}

test('add() creates logpoint with unique id', () => {
  const { manager } = createManager()
  const first = manager.add('/tmp/a.ts', 1, 'user.id')
  const second = manager.add('/tmp/a.ts', 2, 'user.name')
  assert.notEqual(first.id, second.id)
})

test('remove() removes by id', () => {
  const { manager } = createManager()
  const logpoint = manager.add('/tmp/a.ts', 1, 'user.id')
  manager.remove(logpoint.id)
  assert.deepEqual(manager.list(), [])
})

test('list() returns all logpoints', () => {
  const { manager } = createManager()
  manager.add('/tmp/a.ts', 1, 'user.id')
  manager.add('/tmp/b.ts', 2, 'user.name')
  assert.equal(manager.list().length, 2)
})

test('getForFile() filters correctly', () => {
  const { manager } = createManager()
  manager.add('/tmp/a.ts', 1, 'user.id')
  manager.add('/tmp/b.ts', 2, 'user.name')
  assert.equal(manager.getForFile('/tmp/a.ts').length, 1)
})
