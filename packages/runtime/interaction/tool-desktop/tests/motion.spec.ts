import { describe, expect, it } from 'vitest'
import {
  cubicBezier,
  easeInOut,
  mulberry32,
  planHumanizedMove,
} from '../src/motion.ts'

describe('mulberry32', () => {
  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
  })

  it('differs across seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a.next()).not.toEqual(b.next())
  })

  it('emits values in [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 100; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('easeInOut', () => {
  it('is 0 at t=0 and 1 at t=1', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
  })

  it('is symmetric and slow at the edges', () => {
    const mid = easeInOut(0.5)
    expect(mid).toBeCloseTo(0.5, 5)
    // 0.25 eases to less than the linear 0.25 (slow start).
    expect(easeInOut(0.25)).toBeLessThan(0.25)
    expect(easeInOut(0.75)).toBeGreaterThan(0.75)
  })
})

describe('cubicBezier', () => {
  it('anchors at the start and end', () => {
    const p = cubicBezier({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 10, y: 90 }, { x: 90, y: 10 }, 0)
    expect(p.x).toBe(0)
    expect(p.y).toBe(0)
    const q = cubicBezier({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 10, y: 90 }, { x: 90, y: 10 }, 1)
    expect(q.x).toBe(100)
    expect(q.y).toBe(100)
  })

  it('interpolates interior points through the controls', () => {
    const mid = cubicBezier({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }, { x: 50, y: 80 }, 0.5)
    // A peaked control pulls the midpoint up from the straight line.
    expect(mid.x).toBeCloseTo(50, 3)
    expect(mid.y).toBeGreaterThan(0)
  })
})

describe('planHumanizedMove', () => {
  const start = { x: 10, y: 10 }
  const end = { x: 200, y: 50 }
  const rng = mulberry32(123)

  it('ends exactly at the target and starts at the origin', () => {
    const steps = planHumanizedMove(start, end, 400, rng)
    const first = steps[0]!
    const last = steps[steps.length - 1]!
    expect(first.x).toBe(start.x)
    expect(first.y).toBe(start.y)
    expect(last.x).toBe(end.x)
    expect(last.y).toBe(end.y)
  })

  it('emits one step roughly every 10ms', () => {
    const steps = planHumanizedMove(start, end, 400, rng)
    expect(steps.length).toBeGreaterThanOrEqual(40)
    expect(steps.length).toBeLessThanOrEqual(40)
  })

  it('gives the first step zero delay and folds the remainder into the last', () => {
    const steps = planHumanizedMove(start, end, 400, rng)
    expect(steps[0]!.delayMs).toBe(0)
    const summed = steps.reduce((acc, s) => acc + s.delayMs, 0)
    expect(summed).toBe(400)
  })

  it('produces a non-straight path (curve) for a long move', () => {
    const steps = planHumanizedMove(start, end, 400, rng)
    // Sample an interior point; it must deviate from the straight line.
    const straightAt = (i: number, total: number): number =>
      start.y + ((end.y - start.y) * i) / total
    let deviated = false
    for (let i = 1; i < steps.length - 1; i++) {
      const expected = straightAt(i, steps.length)
      if (Math.abs(steps[i]!.y - expected) > 0.6) {
        deviated = true
        break
      }
    }
    expect(deviated).toBe(true)
  })

  it('handles a zero-distance move without breaking', () => {
    const steps = planHumanizedMove({ x: 5, y: 5 }, { x: 5, y: 5 }, 200, rng)
    expect(steps[steps.length - 1]!.x).toBe(5)
    expect(steps[steps.length - 1]!.y).toBe(5)
  })
})
