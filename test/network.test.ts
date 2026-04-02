import assert from 'node:assert'
import test from 'node:test'
import { formatNetworkEntry, parseNetworkLine } from '../src/parser.js'

test("parseNetworkLine 'GET /api/users 200 32ms' parses fields", () => {
  const entry = parseNetworkLine('GET /api/users 200 32ms')
  assert.deepEqual(
    entry && {
      method: entry.method,
      url: entry.url,
      status: entry.status,
      duration: entry.duration
    },
    { method: 'GET', url: '/api/users', status: 200, duration: 32 }
  )
})

test("formatNetworkEntry returns '🌐 GET 200 32ms'", () => {
  const text = formatNetworkEntry({
    method: 'GET',
    url: '/api/users',
    status: 200,
    duration: 32,
    timestamp: 0
  })
  assert.equal(text, '🌐 GET 200 32ms')
})

test("Error network entry returns '🌐 GET ✗ ECONNREFUSED'", () => {
  const text = formatNetworkEntry({
    method: 'GET',
    url: '/api/users',
    error: 'ECONNREFUSED',
    duration: 0,
    timestamp: 0
  })
  assert.equal(text, '🌐 GET ✗ ECONNREFUSED')
})
