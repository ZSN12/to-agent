"use strict";
/**
 * Humanized cursor-path generation: turn a straight move into a series of
 * intermediate points that read like a person moving a mouse — a slight curve,
 * ease-in-out pacing, and small sub-pixel wobble — each with a per-step delay.
 * Pure functions over the primary display; a seeded RNG keeps output
 * reproducible for tests.
 * @module @z/dsh-tool-desktop
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mulberry32 = mulberry32;
exports.cubicBezier = cubicBezier;
exports.easeInOut = easeInOut;
exports.planHumanizedMove = planHumanizedMove;
/**
 * Default RNG (mulberry32) with an injectable seed.
 * @param seed - any 32-bit integer; the same seed replays the same sequence
 * @returns a deterministic pseudo-random source over [0, 1)
 */
function mulberry32(seed) {
    var a = seed >>> 0;
    return {
        next: function () {
            a += 0x6d2b79f5;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        },
    };
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
function cubicBezier(start, end, c1, c2, t) {
    var u = 1 - t;
    var a = u * u * u;
    var b = 3 * u * u * t;
    var c = 3 * u * t * t;
    var d = t * t * t;
    return {
        x: a * start.x + b * c1.x + c * c2.x + d * end.x,
        y: a * start.y + b * c1.y + c * c2.y + d * end.y,
    };
}
/**
 * Ease-in-out (smoothstep) pacing for a parameter t in [0,1].
 * @param t - linear parameter in [0,1]
 * @returns the eased value, also in [0,1]
 */
function easeInOut(t) {
    return t * t * (3 - 2 * t);
}
/**
 * Build two control points for a subtle natural curve: each sits near the
 * straight-line midpoint, offset perpendicular by a random fraction of the
 * chord length (a random split keeps the curve slightly asymmetric). The two
 * points straddle the line in the same perpendicular direction so the cursor
 * arcs rather than zig-zags.
 */
function controlPoints(start, end, rng) {
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var len = Math.hypot(dx, dy);
    // Perpendicular unit (rotate the chord 90deg). Zero-length stays put.
    var px = len === 0 ? 0 : -dy / len;
    var py = len === 0 ? 0 : dx / len;
    // Amplitude is 8-15% of the chord; sign randomizes the bow direction.
    var amp = len * (0.08 + 0.07 * rng.next()) * (rng.next() < 0.5 ? -1 : 1);
    var midX = (start.x + end.x) / 2;
    var midY = (start.y + end.y) / 2;
    // A small random along-chord split makes the two controls asymmetric.
    var split = 0.3 + 0.4 * rng.next();
    var c1 = { x: midX + px * amp, y: midY + py * amp };
    var c2 = { x: midX + px * amp, y: midY + py * amp };
    // Shift each control slightly along the chord so the hump is off-center.
    c1.x += (start.x - midX) * 0.2;
    c1.y += (start.y - midY) * 0.2;
    c2.x += (end.x - midX) * 0.2 * split;
    c2.y += (end.y - midY) * 0.2 * split;
    return [c1, c2];
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
function planHumanizedMove(start, end, durationMs, rng) {
    var _a = controlPoints(start, end, rng), c1 = _a[0], c2 = _a[1];
    var totalSteps = Math.max(1, Math.round(durationMs / 10));
    var steps = [];
    for (var i = 0; i < totalSteps; i++) {
        var t = i / totalSteps;
        var eased = easeInOut(t);
        var raw = cubicBezier(start, end, c1, c2, eased);
        // Sub-pixel hand wobble, ±0.5px, sampled per step. The first step stays
        // pinned to the start; the last is pinned to the exact target.
        var jitter = 0.5 * (rng.next() * 2 - 1);
        var x = i === totalSteps - 1 ? end.x : i === 0 ? start.x : raw.x + jitter;
        var y = i === totalSteps - 1 ? end.y : i === 0 ? start.y : raw.y + jitter;
        // The first step fires immediately; interior steps fire every 10ms; the
        // last holds whatever remains of the requested duration.
        var delayMs = i === 0 ? 0 : i === totalSteps - 1
            ? Math.max(0, durationMs - (totalSteps - 2) * 10)
            : 10;
        steps.push({ x: x, y: y, delayMs: delayMs });
    }
    return steps;
}
