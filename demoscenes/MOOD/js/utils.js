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
