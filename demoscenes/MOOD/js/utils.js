/**
 * utils.js — Shared math/geometry helpers
 *
 * Used by ai.js, triggers.js, combat.js (and others as needed).
 * No game state; pure functions only.
 */

/** Normalize angle to [-PI, PI]. */
export function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

/** Distance between two points. */
export function distanceTo(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    return Math.sqrt(dx * dx + dy * dy);
}

/** Angle from (fromX, fromY) to (toX, toY). */
export function angleTo(fromX, fromY, toX, toY) {
    return Math.atan2(toY - fromY, toX - fromX);
}

/** Manhattan distance (heuristic for A*). */
export function manhattanDistance(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/** 
 * Catmull-Rom spline interpolation.
 * Returns a point at t (0..1) between p1 and p2, influenced by p0 and p3.
 */
export function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;

    const f0 = -0.5 * t3 + t2 - 0.5 * t;
    const f1 = 1.5 * t3 - 2.5 * t2 + 1.0;
    const f2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
    const f3 = 0.5 * t3 - 0.5 * t2;

    const x = p0.x * f0 + p1.x * f1 + p2.x * f2 + p3.x * f3;
    const y = p0.y * f0 + p1.y * f1 + p2.y * f2 + p3.y * f3;

    return { x, y };
}
