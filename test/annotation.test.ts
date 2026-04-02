import assert from 'node:assert'
import test from 'node:test'
import { detectAnnotationStyle, formatAnnotation, sparkline } from '../src/annotation.js'

test("detectAnnotationStyle([1,2,3]) → 'chart' (number array)", () => {
  assert.equal(detectAnnotationStyle([1, 2, 3]), 'chart')
})

test("detectAnnotationStyle({id:1}) → 'raw'", () => {
  assert.equal(detectAnnotationStyle({ id: 1 }), 'raw')
})

test("detectAnnotationStyle(new Error('x')) → 'raw' (errors shown specially)", () => {
  assert.equal(detectAnnotationStyle(new Error('x')), 'raw')
})

test("formatAnnotation(null) → '∅'", () => {
  assert.equal(formatAnnotation(null), '∅')
})

test("formatAnnotation(undefined) → '∅'", () => {
  assert.equal(formatAnnotation(undefined), '∅')
})

test("formatAnnotation(true) → '✓'", () => {
  assert.equal(formatAnnotation(true), '✓')
})

test("formatAnnotation(false) → '✗'", () => {
  assert.equal(formatAnnotation(false), '✗')
})

test("formatAnnotation(long string) → truncated with '...'", () => {
  assert.equal(formatAnnotation('x'.repeat(50)).endsWith('...'), true)
})

test('formatAnnotation([1,4,8,2]) → sparkline string', () => {
  assert.equal(formatAnnotation([1, 4, 8, 2]), sparkline([1, 4, 8, 2]))
})

test('sparkline([1]) → single block char', () => {
  assert.equal(sparkline([1]).length, 1)
})

test('sparkline([0,0,0]) → all lowest blocks', () => {
  assert.equal(sparkline([0, 0, 0]), '▁▁▁')
})

test('sparkline([10,10,10]) → all highest blocks', () => {
  assert.equal(sparkline([10, 10, 10]), '███')
})
