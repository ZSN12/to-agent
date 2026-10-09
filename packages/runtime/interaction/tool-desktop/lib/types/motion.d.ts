/**
 * Humanized cursor-path generation: turn a straight move into a series of
 * intermediate points that read like a person moving a mouse — a slight curve,
 * ease-in-out pacing, and small sub-pixel wobble — each with a per-step delay.
 * Pure functions over the primary display; a seeded RNG keeps output
 * reproducible for tests.
 * @module @z/dsh-tool-desktop
 */
import type { MotionStep, Point } from './types.ts';
/** A deterministic pseudo-random source so paths can be replayed in tests. */
export interface Rng {
    /** Return the next uniform value in [0, 1). */
    next(): number;
}
/**
 * Default RNG (mulberry32) with an injectable seed.
 * @param seed - any 32-bit integer; the same seed replays the same sequence
 * @returns a deterministic pseudo-random source over [0, 1)
 */
export declare function mulberry32(seed: number): Rng;
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
export declare function cubicBezier(start: Point, end: Point, c1: Point, c2: Point, t: number): Point;
/**
 * Ease-in-out (smoothstep) pacing for a parameter t in [0,1].
 * @param t - linear parameter in [0,1]
 * @returns the eased value, also in [0,1]
 */
export declare function easeInOut(t: number): number;
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
export declare function planHumanizedMove(start: Point, end: Point, durationMs: number, rng: Rng): MotionStep[];
//# sourceMappingURL=motion.d.ts.map