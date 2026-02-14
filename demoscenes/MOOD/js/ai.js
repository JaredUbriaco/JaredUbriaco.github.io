/**
 * ai.js — Goal-driven AI autopilot
 *
 * When the player is idle (~5s), AI takes over. Each frame: pick one goal,
 * steer toward it, perform action when in range. Feeds state.ai.input for
 * player and triggers. No state machine; no A* or waypoint graph.
 */

import {
    isSolid, getRoomId, doors,
    PICKUP_POSITIONS, INTERACTABLE_POSITIONS, ROOM_BOUNDS,
} from './map.js';
import { TILE, INTERACTION_RANGE, INTERACTION_ANGLE, PLAYER_RADIUS } from './config.js';
import { getCurrentObjectiveTask } from './objectives.js';
import { angleTo, distanceTo, normalizeAngle } from './utils.js';

// ── Tuning ──────────────────────────────────────────────────────────
export const AI_TUNING = {
    combatMaxRange: 12,
    turnGain: 8,
    facingTolerance: 0.2,
    interactFacingTolerance: INTERACTION_ANGLE,
};

const COMBAT_MAX_RANGE = AI_TUNING.combatMaxRange;
const TURN_GAIN = AI_TUNING.turnGain;
const FACING_TOLERANCE = AI_TUNING.facingTolerance;

// ── Line of sight ────────────────────────────────────────────────────
/** True if ray from (x1,y1) to (x2,y2) doesn’t hit solid (step 0.2). */
function hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return true;
    const steps = Math.max(2, Math.ceil(dist / 0.2));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = x1 + dx * t;
        const y = y1 + dy * t;
        if (isSolid(x, y)) return false;
    }
    return true;
}

/** True if moving one small step forward from (x,y,angle) would hit solid. */
function isPathBlocked(x, y, angle) {
    const step = PLAYER_RADIUS * 2 + 0.1;
    return isSolid(x + Math.cos(angle) * step, y + Math.sin(angle) * step);
}

// ── Goal selection ───────────────────────────────────────────────────

/** Nearest live enemy we have LOS to, within COMBAT_MAX_RANGE, or null. */
function getNearestVisibleEnemy(state) {
    const p = state.player;
    const entities = state.entities || [];
    let nearest = null;
    let minDist = Infinity;
    for (const e of entities) {
        if (e.hp <= 0) continue;
        const d = distanceTo(p.x, p.y, e.x, e.y);
        if (d > COMBAT_MAX_RANGE || d >= minDist) continue;
        if (!hasLineOfSight(p.x, p.y, e.x, e.y)) continue;
        minDist = d;
        nearest = e;
    }
    return nearest;
}

/** Closed door we can open (not locked, or button locked and button pressed). */
function canOpenDoor(state, door) {
    if (door.openProgress >= 1) return false;
    if (!door.locked) return true;
    if (door.lockType === 'button' && state.flags.buttonPressed) return true;
    return false;
}

/** Nearest closed door we can open, within range, or null. */
function getNearestClosedDoor(state, maxRange = 6) {
    const p = state.player;
    let best = null;
    let bestDist = Infinity;
    for (const key of Object.keys(doors)) {
        const d = doors[key];
        if (!canOpenDoor(state, d)) continue;
        const cx = d.x + 0.5;
        const cy = d.y + 0.5;
        const dist = distanceTo(p.x, p.y, cx, cy);
        if (dist > maxRange || dist >= bestDist) continue;
        bestDist = dist;
        best = { door: d, x: cx, y: cy };
    }
    return best;
}

/** In interaction range and facing (angle) for position (tx, ty). */
function isInRangeAndFacing(px, py, pAngle, tx, ty, angleTolerance = INTERACTION_ANGLE) {
    const dist = distanceTo(px, py, tx, ty);
    if (dist > INTERACTION_RANGE) return false;
    const wantAngle = angleTo(px, py, tx, ty);
    return Math.abs(normalizeAngle(wantAngle - pAngle)) <= angleTolerance;
}

/**
 * One goal per frame. Priority: visible enemy → objective (pickup/button) → closed door → explore.
 * @returns {{ type: string, x: number, y: number, action?: string, entity?: object, door?: object } | null}
 */
function getCurrentGoal(state) {
    const p = state.player;

    // 1) Combat: nearest visible enemy
    const enemy = getNearestVisibleEnemy(state);
    if (enemy) return { type: 'enemy', x: enemy.x, y: enemy.y, action: 'fire', entity: enemy };

    // 2) Objective-driven target
    const task = getCurrentObjectiveTask(state);
    if (task) {
        if (task.id === 'pickup-handgun' && (!p.weapons || !p.weapons.includes('HANDGUN'))) {
            const pos = PICKUP_POSITIONS.handgun;
            if (pos) return { type: 'pickup', x: pos.x, y: pos.y, action: 'interact' };
        }
        if (task.id === 'use-button' && !state.flags.buttonPressed) {
            const pos = INTERACTABLE_POSITIONS.area1Button;
            if (pos) return { type: 'button', x: pos.x, y: pos.y, action: 'interact' };
        }
        if (task.id === 'pickup-shotgun' && (!p.weapons || !p.weapons.includes('SHOTGUN'))) {
            const pos = PICKUP_POSITIONS.shotgun;
            if (pos) return { type: 'pickup', x: pos.x, y: pos.y, action: 'interact' };
        }
        if ((task.id === 'pickup-voidbeam' || task.id === 'voidbeam-light-zone') && (!p.weapons || !p.weapons.includes('VOIDBEAM'))) {
            const pos = PICKUP_POSITIONS.voidbeam;
            if (pos) return { type: 'pickup', x: pos.x, y: pos.y, action: 'interact' };
        }
    }

    // 3) Closed door to open (so we can progress)
    const doorGoal = getNearestClosedDoor(state);
    if (doorGoal) return { type: 'door', x: doorGoal.x, y: doorGoal.y, action: 'interact', door: doorGoal.door };

    // 4) Explore: when in area0 or hallway, go toward area1 (so we leave first room)
    const room = getRoomId(p.x, p.y);
    if (room === 'area0' || room === null) {
        const a1 = ROOM_BOUNDS.area1;
        if (a1) return { type: 'waypoint', x: a1.x + a1.w / 2, y: a1.y + a1.h / 2 };
    }

    return null;
}

// ── Steering ─────────────────────────────────────────────────────────

/** Set state.ai.input look and move so we turn and move toward (gx, gy). */
function steerToward(state, goal) {
    if (!goal) return;
    const p = state.player;
    const inp = state.ai.input;
    const wantAngle = angleTo(p.x, p.y, goal.x, goal.y);
    const angleDiff = normalizeAngle(wantAngle - p.angle);
    inp.lookDX = Math.max(-1, Math.min(1, angleDiff * TURN_GAIN));
    inp.lookDY = 0;

    const aligned = Math.abs(angleDiff) <= FACING_TOLERANCE;
    if (aligned && !isPathBlocked(p.x, p.y, p.angle)) {
        inp.moveForward = true;
        inp.strafeLeft = false;
        inp.strafeRight = false;
    } else if (aligned && isPathBlocked(p.x, p.y, p.angle)) {
        inp.moveForward = false;
        // Strafe to avoid wall
        inp.strafeLeft = true;
        inp.strafeRight = false;
    } else {
        inp.moveForward = false;
        inp.strafeLeft = false;
        inp.strafeRight = false;
    }
}

// ── Actions ──────────────────────────────────────────────────────────

/** If we’re in range and facing goal, set interact or fire. */
function performAction(state, goal) {
    if (!goal || !goal.action) return;
    const p = state.player;
    const inp = state.ai.input;

    if (goal.action === 'interact') {
        if (isInRangeAndFacing(p.x, p.y, p.angle, goal.x, goal.y, AI_TUNING.interactFacingTolerance)) {
            inp.interact = true;
        }
        return;
    }

    if (goal.action === 'fire') {
        const dist = distanceTo(p.x, p.y, goal.x, goal.y);
        const wantAngle = angleTo(p.x, p.y, goal.x, goal.y);
        if (dist <= COMBAT_MAX_RANGE && Math.abs(normalizeAngle(wantAngle - p.angle)) <= FACING_TOLERANCE) {
            inp.fire = true;
        }
    }
}

// ── Reset input ───────────────────────────────────────────────────────

function resetAiInput(inp) {
    inp.moveForward = false;
    inp.moveBack = false;
    inp.strafeLeft = false;
    inp.strafeRight = false;
    inp.lookDX = 0;
    inp.lookDY = 0;
    inp.fire = false;
    inp.interact = false;
    inp.weaponSlot = null;
}

// ── Main update ──────────────────────────────────────────────────────

/**
 * Update AI. When active, sets state.ai.input and state.ai.telemetry.
 */
export function update(state) {
    if (!state.ai.active) return;

    const inp = state.ai.input;
    resetAiInput(inp);

    const goal = getCurrentGoal(state);
    if (goal) {
        steerToward(state, goal);
        performAction(state, goal);
    }

    state.ai.telemetry = {
        state: goal ? goal.type : 'idle',
        targetId: goal && goal.entity ? goal.entity.id : null,
        confidence: goal ? 1 : 0,
        stuckTimer: 0,
        replanCount: 0,
    };
}
