import assert from 'node:assert'
import test from 'node:test'
import { parseLogLine } from '../src/parser.js'
import { findLogLocations, matchOutputToLocation } from '../src/tracker.js'

test('findLogLocations finds console.log on line 5', () => {
  const file = ['const a = 1', '', '', '', 'console.log("user:", a)'].join('\n')
  const locations = findLogLocations(file, '/tmp/example.ts')
  assert.equal(locations.length, 1)
  assert.equal(locations[0].line, 4)
})

test('findLogLocations finds console.error and console.warn', () => {
  const file = ['console.warn("warn")', 'console.error("error")'].join('\n')
  const locations = findLogLocations(file, '/tmp/example.ts')
  assert.equal(locations.length, 2)
})

test('findLogLocations handles multiline console calls', () => {
  const file = ['console.log(', '  "user:",', '  user', ')'].join('\n')
  const locations = findLogLocations(file, '/tmp/example.ts')
  assert.equal(locations.length, 1)
  assert.match(locations[0].callText, /user/)
})

test('findLogLocations returns empty array when no console calls', () => {
  const locations = findLogLocations('const x = 1', '/tmp/example.ts')
  assert.deepEqual(locations, [])
})

test('matchOutputToLocation matches by label string', () => {
  const locations = findLogLocations('console.log("user:", user)', '/tmp/example.ts')
  const match = matchOutputToLocation(parseLogLine('user: { id: 1 }', 'log'), locations)
  assert.equal(match?.line, 0)
})

test('matchOutputToLocation returns null when no match found', () => {
  const locations = findLogLocations('console.log("user:", user)', '/tmp/example.ts')
  const match = matchOutputToLocation(parseLogLine('other: { id: 1 }', 'log'), locations)
  assert.equal(match, null)
})

test('matchOutputToLocation matches closest when multiple candidates', () => {
  const file = ['console.log("user:", user)', 'console.log("user:details", user)'].join('\n')
  const locations = findLogLocations(file, '/tmp/example.ts')
  const match = matchOutputToLocation(parseLogLine('user: 1', 'log'), locations)
  assert.equal(match?.line, 0)
})
