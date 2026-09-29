/**
 * Humanized cursor-path generation: turn a straight move into a series of
 * intermediate points that read like a person moving a mouse — a slight curve,
 * ease-in-out pacing, and small sub-pixel wobble — each with a per-step delay.
 * Pure functions over the primary display; a seeded RNG keeps output
 * reproducible for tests.
 * @module @z/dsh-tool-desktop
 */

import type { MotionStep, Point } from './types.ts'

/** A deterministic pseudo-random source so paths can be replayed in tests. */
export interface Rng {
  /** Return the next uniform value in [0, 1). */
  next(): number
}

/**
 * Default RNG (mulberry32) with an injectable seed.
 * @param seed - any 32-bit integer; the same seed replays the same sequence
 * @returns a deterministic pseudo-random source over [0, 1)
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return {
    next(): number {
      a += 0x6d2b79f5
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

/**
 * Evaluate a cubic bezier at t in [0,1] given control points p1/p2 between the
 * start and end anchors. The anchors come first so the curve is anchored on
 * `start`/`end` while the controls only shape the interior.
 * @param start - the fixed start anchor
 * @param end - the fixed end anchor
 * @param c1 - first control point
 * @param c2 - second control point
 * @param t - parametric position in [0,1]
 * @returns the bezier point at parameter `t`
 */
export function cubicBezier(start: Point, end: Point, c1: Point, c2: Point, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * start.x + b * c1.x + c * c2.x + d * end.x,
    y: a * start.y + b * c1.y + c * c2.y + d * end.y,
  }
}

/**
 * Ease-in-out (smoothstep) pacing for a parameter t in [0,1].
 * @param t - linear parameter in [0,1]
 * @returns the eased value, also in [0,1]
 */
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Build two control points for a subtle natural curve: each sits near the
 * straight-line midpoint, offset perpendicular by a random fraction of the
 * chord length (a random split keeps the curve slightly asymmetric). The two
 * points straddle the line in the same perpendicular direction so the cursor
 * arcs rather than zig-zags.
 */
function controlPoints(start: Point, end: Point, rng: Rng): [Point, Point] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy)
  // Perpendicular unit (rotate the chord 90deg). Zero-length stays put.
  const px = len === 0 ? 0 : -dy / len
  const py = len === 0 ? 0 : dx / len
  // Amplitude is 8-15% of the chord; sign randomizes the bow direction.
  const amp = len * (0.08 + 0.07 * rng.next()) * (rng.next() < 0.5 ? -1 : 1)
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2
  // A small random along-chord split makes the two controls asymmetric.
  const split = 0.3 + 0.4 * rng.next()
  const c1 = { x: midX + px * amp, y: midY + py * amp }
  const c2 = { x: midX + px * amp, y: midY + py * amp }
  // Shift each control slightly along the chord so the hump is off-center.
  c1.x += (start.x - midX) * 0.2
  c1.y += (start.y - midY) * 0.2
  c2.x += (end.x - midX) * 0.2 * split
  c2.y += (end.y - midY) * 0.2 * split
  return [c1, c2]
}

/**
 * Plan a humanized cursor move from `start` to `end`.
 *
 * The path is sampled at a fixed step interval so each returned step carries a
 * per-step delay; pacing follows ease-in-out (slow start and end, faster
 * middle) and each sample gets a sub-pixel jitter to read as a hand rather
 * than a teleport. The final point is exactly `end`.
 * @param start - the starting cursor position
 * @param end - the destination
 * @param durationMs - total move duration
 * @param rng - random source for curve/jitter
 * @returns ordered steps, each with its own delay before firing
 */
export function planHumanizedMove(
  start: Point,
  end: Point,
  durationMs: number,
  rng: Rng,
): MotionStep[] {
  const [c1, c2] = controlPoints(start, end, rng)
  const totalSteps = Math.max(1, Math.round(durationMs / 10))
  const steps: MotionStep[] = []
  for (let i = 0; i < totalSteps; i++) {
    const t = i / totalSteps
    const eased = easeInOut(t)
    const raw = cubicBezier(start, end, c1, c2, eased)
    // Sub-pixel hand wobble, ±0.5px, sampled per step. The first step stays
    // pinned to the start; the last is pinned to the exact target.
    const jitter = 0.5 * (rng.next() * 2 - 1)
    const x = i === totalSteps - 1 ? end.x : i === 0 ? start.x : raw.x + jitter
    const y = i === totalSteps - 1 ? end.y : i === 0 ? start.y : raw.y + jitter
    // The first step fires immediately; interior steps fire every 10ms; the
    // last holds whatever remains of the requested duration.
    const delayMs = i === 0 ? 0 : i === totalSteps - 1
      ? Math.max(0, durationMs - (totalSteps - 2) * 10)
      : 10
    steps.push({ x, y, delayMs })
  }
  return steps
}
