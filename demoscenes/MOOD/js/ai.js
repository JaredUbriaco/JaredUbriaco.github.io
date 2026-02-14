/**
 * ai.js — Goal-driven AI (1990s-style)
 *
 * Idle ~5s → AI takes over. Like Doom/Quake-era bots: pick one goal,
 * BFS pathfind on the tile grid (go around walls/pillars), steer toward
 * the next path step, interact when in range. One loop: goal → path → steer → act.
 */

import {
    isSolid, getRoomId, doors, getMapWidth, getMapHeight,
    PICKUP_POSITIONS, INTERACTABLE_POSITIONS, ROOM_BOUNDS,
} from './map.js';
import { TILE, INTERACTION_RANGE, INTERACTION_ANGLE, PLAYER_RADIUS } from './config.js';
import { getCurrentObjectiveTask } from './objectives.js';
import { angleTo, distanceTo, normalizeAngle } from './utils.js';

// ── Tuning ──────────────────────────────────────────────────────────
// lookDxMax: AI outputs lookDX; player does angle += lookDX * MOUSE_SENSITIVITY (0.002).
//   Clamp to ±lookDxMax so turn rate ≈ lookDxMax*0.002 rad/frame (e.g. 28 → ~3 rad/s at 60fps).
// combatFacingTolerance: handgun is hitscan (single ray) — only fire when aimed within this
//   (rad). 0.2 was too loose (~11°) so we fired at edge of aim and missed; ~0.05 ≈ 3° centers shot.
export const AI_TUNING = {
    combatMaxRange: 12,
    turnGain: 10,
    lookDxMax: 28,
    facingTolerance: 0.2,
    combatFacingTolerance: 0.05,
    interactFacingTolerance: INTERACTION_ANGLE,
    pathReachDist: 0.4,
};

const COMBAT_MAX_RANGE = AI_TUNING.combatMaxRange;
const TURN_GAIN = AI_TUNING.turnGain;
const LOOK_DX_MAX = AI_TUNING.lookDxMax;
const FACING_TOLERANCE = AI_TUNING.facingTolerance;
const COMBAT_FACING_TOLERANCE = AI_TUNING.combatFacingTolerance;
const PATH_REACH_DIST = AI_TUNING.pathReachDist;

// ── Scripted route (1990s-style: fixed sequence to complete the level) ─
/** One step: { x, y, action?, doorKey?, doneWhen(state) }. First step with !doneWhen(state) is current. */
function buildScriptedRoute() {
    const a1 = ROOM_BOUNDS.area1;
    const a2r1 = ROOM_BOUNDS.a2r1;
    const a2r2 = ROOM_BOUNDS.a2r2;
    const a2r3 = ROOM_BOUNDS.a2r3;
    const a2r4 = ROOM_BOUNDS.a2r4;
    const a2r5 = ROOM_BOUNDS.a2r5;
    const a3 = ROOM_BOUNDS.area3;
    const handgun = PICKUP_POSITIONS.handgun;
    const button = INTERACTABLE_POSITIONS.area1Button;
    const shotgun = PICKUP_POSITIONS.shotgun;
    const voidbeam = PICKUP_POSITIONS.voidbeam;

    return [
        { label: 'handgun', x: handgun.x, y: handgun.y, action: 'interact', doneWhen: (s) => s.player.weapons && s.player.weapons.includes('HANDGUN') },
        { label: 'door_area0_hall', x: 8.5, y: 5.5, action: 'interact', doorKey: '8,5', doneWhen: (s) => (doors['8,5'] && doors['8,5'].openProgress >= 1) },
        { label: 'enter_area1', x: a1.x + a1.w / 2, y: a1.y + a1.h / 2, doneWhen: (s) => getRoomId(s.player.x, s.player.y) === 'area1' },
        { label: 'button', x: button.x, y: button.y, action: 'interact', doneWhen: (s) => !!s.flags.buttonPressed },
        { label: 'gate_area2', x: 19.5, y: 15.5, action: 'interact', doorKey: '19,15', doneWhen: (s) => (doors['19,15'] && doors['19,15'].openProgress >= 1) },
        { label: 'enter_a2r1', x: a2r1.x + a2r1.w / 2, y: a2r1.y + a2r1.h / 2, doneWhen: (s) => getRoomId(s.player.x, s.player.y) === 'a2r1' },
        { label: 'door_a2r2', x: 14.5, y: 26.5, action: 'interact', doorKey: '14,26', doneWhen: (s) => (doors['14,26'] && doors['14,26'].openProgress >= 1) },
        { label: 'enter_a2r2', x: a2r2.x + a2r2.w / 2, y: a2r2.y + a2r2.h / 2, doneWhen: (s) => getRoomId(s.player.x, s.player.y) === 'a2r2' },
        { label: 'door_a2r1_a2r3', x: 19.5, y: 30.5, action: 'interact', doorKey: '19,30', doneWhen: (s) => (doors['19,30'] && doors['19,30'].openProgress >= 1) },
        { label: 'enter_a2r3', x: a2r3.x + a2r3.w / 2, y: a2r3.y + a2r3.h / 2, doneWhen: (s) => getRoomId(s.player.x, s.player.y) === 'a2r3' },
        { label: 'door_a2r4', x: 31.5, y: 36.5, action: 'interact', doorKey: '31,36', doneWhen: (s) => (doors['31,36'] && doors['31,36'].openProgress >= 1) },
        { label: 'shotgun', x: shotgun.x, y: shotgun.y, action: 'interact', doneWhen: (s) => s.player.weapons && s.player.weapons.includes('SHOTGUN') },
        { label: 'door_a2r5', x: 19.5, y: 42.5, action: 'interact', doorKey: '19,42', doneWhen: (s) => (doors['19,42'] && doors['19,42'].openProgress >= 1) },
        { label: 'enter_a2r5', x: a2r5.x + a2r5.w / 2, y: a2r5.y + a2r5.h / 2, doneWhen: (s) => getRoomId(s.player.x, s.player.y) === 'a2r5' },
        { label: 'keydoor_boss', x: 19.5, y: 54.5, action: 'interact', doorKey: '19,54', doneWhen: (s) => (doors['19,54'] && doors['19,54'].openProgress >= 1) },
        { label: 'voidbeam', x: voidbeam.x, y: voidbeam.y, action: 'interact', doneWhen: (s) => s.player.weapons && s.player.weapons.includes('VOIDBEAM') },
        { label: 'enter_area3', x: a3.x + a3.w / 2, y: a3.y + a3.h / 2, doneWhen: (s) => getRoomId(s.player.x, s.player.y) === 'area3' },
        { label: 'light_well_boss', x: a3.x + a3.w / 2, y: a3.y + a3.h / 2 + 4, doneWhen: (s) => !!s.flags.voidBeamLightZoneUsed },
    ];
}

let SCRIPTED_ROUTE = null;
function getScriptedRoute() {
    if (!SCRIPTED_ROUTE) SCRIPTED_ROUTE = buildScriptedRoute();
    return SCRIPTED_ROUTE;
}

/** Index of first step that is not yet done. */
function getCurrentScriptedStepIndex(state) {
    const route = getScriptedRoute();
    for (let i = 0; i < route.length; i++) {
        if (!route[i].doneWhen(state)) return i;
    }
    return -1;
}

// ── Tile pathfinding (BFS) ───────────────────────────────────────────
function isWalkable(tx, ty) {
    if (tx < 0 || tx >= getMapWidth() || ty < 0 || ty >= getMapHeight()) return false;
    return !isSolid(tx, ty);
}

/** Tile we should stand on to interact with (gx, gy) from (px, py). */
function getApproachTile(gx, gy, px, py) {
    const tx = Math.floor(gx);
    const ty = Math.floor(gy);
    if (!isSolid(gx, gy)) return { x: tx, y: ty };
    return { x: tx + Math.sign(px - gx), y: ty + Math.sign(py - gy) };
}

/** BFS from (sx,sy) to (ex,ey). Returns path [start, ..., end] or null. */
function bfsPath(sx, sy, ex, ey) {
    if (!isWalkable(sx, sy) || !isWalkable(ex, ey)) return null;
    if (sx === ex && sy === ey) return [{ x: sx, y: sy }];

    const queue = [{ x: sx, y: sy }];
    const cameFrom = new Map();
    cameFrom.set(`${sx},${sy}`, null);

    while (queue.length > 0) {
        const cur = queue.shift();
        if (cur.x === ex && cur.y === ey) {
            const path = [];
            let p = cur;
            while (p) {
                path.unshift(p);
                p = cameFrom.get(`${p.x},${p.y}`);
            }
            return path;
        }
        for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
            const nx = cur.x + d.x, ny = cur.y + d.y;
            const key = `${nx},${ny}`;
            if (cameFrom.has(key) || !isWalkable(nx, ny)) continue;
            cameFrom.set(key, cur);
            queue.push({ x: nx, y: ny });
        }
    }
    return null;
}

/** Path from player to goal; uses approach tile for doors/interact. */
function getPathToGoal(px, py, goal) {
    const sx = Math.floor(px), sy = Math.floor(py);
    let ex, ey;
    if (goal.type === 'door' && goal.door) {
        const a = getApproachTile(goal.door.x + 0.5, goal.door.y + 0.5, px, py);
        ex = a.x; ey = a.y;
    } else if (goal.action === 'interact') {
        const a = getApproachTile(goal.x, goal.y, px, py);
        ex = a.x; ey = a.y;
    } else {
        ex = Math.floor(goal.x); ey = Math.floor(goal.y);
    }
    return bfsPath(sx, sy, ex, ey);
}

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

/** Turn a scripted step into a goal object for steering/action. */
function stepToGoal(step) {
    const g = { type: step.doorKey ? 'door' : (step.label || 'waypoint'), x: step.x, y: step.y };
    if (step.action) g.action = step.action;
    if (step.doorKey && doors[step.doorKey]) g.door = doors[step.doorKey];
    return g;
}

/**
 * One goal per frame. Priority: visible enemy → current scripted step → fallback (nearest door / explore).
 * @returns {{ type: string, x: number, y: number, action?: string, entity?: object, door?: object } | null}
 */
function getCurrentGoal(state) {
    const p = state.player;

    // 1) Combat: nearest visible enemy
    const enemy = getNearestVisibleEnemy(state);
    if (enemy) return { type: 'enemy', x: enemy.x, y: enemy.y, action: 'fire', entity: enemy };

    // 2) Scripted route: first step that is not yet done
    const stepIndex = getCurrentScriptedStepIndex(state);
    if (stepIndex >= 0) {
        const route = getScriptedRoute();
        return stepToGoal(route[stepIndex]);
    }

    // 3) Fallback: nearest closed door we can open
    const doorGoal = getNearestClosedDoor(state, 10);
    if (doorGoal) return { type: 'door', x: doorGoal.x, y: doorGoal.y, action: 'interact', door: doorGoal.door };

    // 4) Explore: go toward area1 if still in area0/hallway
    const room = getRoomId(p.x, p.y);
    if (room === 'area0' || room === null) {
        const a1 = ROOM_BOUNDS.area1;
        if (a1) return { type: 'waypoint', x: a1.x + a1.w / 2, y: a1.y + a1.h / 2 };
    }

    return null;
}

// ── Steering ─────────────────────────────────────────────────────────

/** Pick (tx, ty) to steer toward: next path step, or goal if no path / combat. */
function getSteerTarget(state, goal) {
    const p = state.player;
    if (goal.type === 'enemy' || goal.action === 'fire') {
        return { x: goal.x, y: goal.y };
    }
    const path = getPathToGoal(p.x, p.y, goal);
    if (!path || path.length <= 1) return { x: goal.x, y: goal.y };
    for (let i = 1; i < path.length; i++) {
        const cx = path[i].x + 0.5, cy = path[i].y + 0.5;
        if (distanceTo(p.x, p.y, cx, cy) > PATH_REACH_DIST) return { x: cx, y: cy };
    }
    return { x: goal.x, y: goal.y };
}

/** Set state.ai.input so we turn and move toward target (next path step or goal). */
function steerToward(state, goal) {
    if (!goal) return;
    const p = state.player;
    const inp = state.ai.input;
    const target = getSteerTarget(state, goal);
    const wantAngle = angleTo(p.x, p.y, target.x, target.y);
    const angleDiff = normalizeAngle(wantAngle - p.angle);
    inp.lookDX = Math.max(-LOOK_DX_MAX, Math.min(LOOK_DX_MAX, angleDiff * TURN_GAIN));
    inp.lookDY = 0;

    const aligned = Math.abs(angleDiff) <= FACING_TOLERANCE;
    if (aligned && !isPathBlocked(p.x, p.y, p.angle)) {
        inp.moveForward = true;
        inp.strafeLeft = false;
        inp.strafeRight = false;
    } else if (aligned && isPathBlocked(p.x, p.y, p.angle)) {
        inp.moveForward = false;
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
        if (dist <= COMBAT_MAX_RANGE && Math.abs(normalizeAngle(wantAngle - p.angle)) <= COMBAT_FACING_TOLERANCE) {
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

    const stepIndex = getCurrentScriptedStepIndex(state);
    const route = getScriptedRoute();
    const stepLabel = stepIndex >= 0 ? route[stepIndex].label : null;

    state.ai.telemetry = {
        state: goal ? goal.type : 'idle',
        step: stepLabel,
        targetId: goal && goal.entity ? goal.entity.id : null,
        confidence: goal ? 1 : 0,
        stuckTimer: 0,
        replanCount: 0,
    };
}
