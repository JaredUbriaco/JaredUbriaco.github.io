/**
 * ai.js — Goal-driven AI (1990s-style)
 *
 * Idle ~5s → AI takes over. Like Doom/Quake-era bots: pick one goal,
 * BFS pathfind on the tile grid (go around walls/pillars), steer toward
 * the next path step, interact when in range. One loop: goal → path → steer → act.
 *
 * Combat: enemy in LOS → goal = enemy. We turn toward them and may advance until
 * within combatNoAdvanceDist; then we STOP moving and only turn + fire (avoids
 * point-blank "dance"). Fire when aim within combatFacingTolerance; if enemy
 * within combatPointBlankDist we use slightly looser combatFacingToleranceClose
 * so shots land while they move.
 */

import * as map from './map.js';
import {
    isSolid, getRoomId, doors, gates, getMapWidth, getMapHeight,
} from './map.js';
import { TILE, INTERACTION_RANGE, INTERACTION_ANGLE, PLAYER_RADIUS, MOUSE_SENSITIVITY } from './config.js';
import { getCurrentObjectiveTask } from './objectives.js';
import { angleTo, distanceTo, normalizeAngle } from './utils.js';
import {
    buildRoute, getCurrentScriptedStepIndex as getRouteStepIndex,
    stepToGoal as routeStepToGoal, isRoomClear, getExploreFallbackRoom,
} from './ai-route.js';
import { moodLevel1, createMoodLevel1WorldApi } from './levels/mood-level1.js';

const worldApi = createMoodLevel1WorldApi(map);

// ── Tuning ──────────────────────────────────────────────────────────
// lookDxMax: AI outputs lookDX; player does angle += lookDX * MOUSE_SENSITIVITY (0.002).
//   Clamp to ±lookDxMax so turn rate ≈ lookDxMax*0.002 rad/frame (e.g. 28 → ~3 rad/s at 60fps).
// combatFacingTolerance: handgun is hitscan (single ray) — only fire when aimed within this (rad).
// combatNoAdvanceDist: when enemy is this close (tiles), do NOT move forward — only turn and fire.
// combatPointBlankDist: when enemy within this (tiles), use combatFacingToleranceClose for fire check.
// aimDeadZone: if |angleDiff| < this (rad), don't turn — stops left-right oscillation when nearly aligned.
// noOvershootFrac: cap turn so we never rotate more than this fraction of angleDiff per frame (stops overshoot jitter).
// combatBackUpDist: when enemy closer than this (tiles), back up instead of strafe (create separation).
export const AI_TUNING = {
    combatMaxRange: 12,
    combatNoAdvanceDist: 3,
    combatBackUpDist: 1.5,
    combatPointBlankDist: 2,
    turnGain: 10,
    lookDxMax: 28,
    aimDeadZone: 0.02,
    noOvershootFrac: 0.9,
    facingTolerance: 0.2,
    combatFacingTolerance: 0.065,      // slightly looser so we fire sooner, less aim jitter
    combatFacingToleranceClose: 0.12,  // point-blank: fire more readily when very close
    interactFacingTolerance: INTERACTION_ANGLE,
    pathReachDist: 0.4,
};

const COMBAT_MAX_RANGE = AI_TUNING.combatMaxRange;
const COMBAT_NO_ADVANCE_DIST = AI_TUNING.combatNoAdvanceDist;
const COMBAT_BACK_UP_DIST = AI_TUNING.combatBackUpDist;
const TURN_GAIN = AI_TUNING.turnGain;
const LOOK_DX_MAX = AI_TUNING.lookDxMax;
const FACING_TOLERANCE = AI_TUNING.facingTolerance;
const COMBAT_FACING_TOLERANCE = AI_TUNING.combatFacingTolerance;
const COMBAT_FACING_TOLERANCE_CLOSE = AI_TUNING.combatFacingToleranceClose;
const COMBAT_POINT_BLANK_DIST = AI_TUNING.combatPointBlankDist;
const AIM_DEAD_ZONE = AI_TUNING.aimDeadZone;
const NO_OVERSHOOT_FRAC = AI_TUNING.noOvershootFrac;
const PATH_REACH_DIST = AI_TUNING.pathReachDist;
const COMBAT_RECENT_ENEMY_GRACE = 0.6; // Keep targeting enemy for this long without LOS so we don't rescans

// ── List of goals (scripted route from ai-route framework + level data) ─
// Order: spawn → handgun → first door → next room → kill enemies → button → door → next room → …
// Branching: clear room, then choose next door; repeat. Same logic for any level.
//
// Universal rule: a door or gate that can no longer be interacted with (already open) is NEVER
// a valid goal. We skip such steps when choosing the current goal so the AI never goes back
// to an open door or spins there.

let SCRIPTED_ROUTE = null;
function getScriptedRoute() {
    if (!SCRIPTED_ROUTE) SCRIPTED_ROUTE = buildRoute(moodLevel1, worldApi);
    return SCRIPTED_ROUTE;
}

/** Raw index of first step where doneWhen(state) is false. */
function getCurrentScriptedStepIndex(state) {
    return getRouteStepIndex(getScriptedRoute(), state);
}

/**
 * Effective current step: first step that is not done AND (if it's a door step) the door
 * is still interactable (not open). Ensures we never target an open door/gate.
 */
function getEffectiveCurrentStepIndex(state) {
    const route = getScriptedRoute();
    for (let i = 0; i < route.length; i++) {
        if (route[i].doneWhen(state)) continue;
        const step = route[i];
        if (step.doorKey && doors[step.doorKey] && doors[step.doorKey].openProgress >= 1) continue;
        return i;
    }
    return -1;
}

function stepToGoal(step) {
    return routeStepToGoal(step, worldApi);
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

const PATH_CACHE_TTL = 0.5;
let pathCache = { path: null, sx: -1, sy: -1, ex: -1, ey: -1, stepIndex: -2, time: -1 };
let lastCachedStepIndex = -2;

function invalidatePathCache() {
    pathCache = { path: null, sx: -1, sy: -1, ex: -1, ey: -1, stepIndex: -2, time: -1 };
}

/** Path from player to goal; uses approach tile for doors/interact. Caches by (sx,sy,ex,ey,stepIndex) so we never reuse a path from a different scripted step. */
function getPathToGoal(state, goal) {
    const stepIndex = getEffectiveCurrentStepIndex(state);
    const px = state.player.x;
    const py = state.player.y;
    const elapsed = state.time.elapsed || 0;
    const sx = Math.floor(px);
    const sy = Math.floor(py);
    let ex, ey;
    if (goal.type === 'door' && goal.door) {
        const a = getApproachTile(goal.door.cx, goal.door.cy, px, py);
        ex = a.x; ey = a.y;
    } else if (goal.action === 'interact') {
        const a = getApproachTile(goal.x, goal.y, px, py);
        ex = a.x; ey = a.y;
    } else {
        ex = Math.floor(goal.x); ey = Math.floor(goal.y);
    }

    const cacheHit = pathCache.path
        && pathCache.sx === sx && pathCache.sy === sy && pathCache.ex === ex && pathCache.ey === ey
        && pathCache.stepIndex === stepIndex
        && (elapsed - pathCache.time) < PATH_CACHE_TTL;
    if (cacheHit) return pathCache.path;

    const path = bfsPath(sx, sy, ex, ey);
    if (path) {
        pathCache = { path, sx, sy, ex, ey, stepIndex, time: elapsed };
    } else {
        pathCache = { path: null, sx: -1, sy: -1, ex: -1, ey: -1, stepIndex: -2, time: elapsed };
    }
    return path;
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

/** If we had a recent enemy target and they're still in range and alive, return them (combat memory so we don't rescans). */
function getRecentEnemyIfValid(state) {
    const ai = state.ai;
    const elapsed = state.time.elapsed || 0;
    if (ai.lastEnemyTargetId == null || (elapsed - ai.lastEnemyTime) > COMBAT_RECENT_ENEMY_GRACE) return null;
    const entities = state.entities || [];
    const p = state.player;
    for (const e of entities) {
        if (e.id !== ai.lastEnemyTargetId || e.hp <= 0) continue;
        const d = distanceTo(p.x, p.y, e.x, e.y);
        if (d > COMBAT_MAX_RANGE) return null;
        return e;
    }
    return null;
}

/** Closed door we can open (not locked, or button locked and button pressed). */
function canOpenDoor(state, door) {
    if (door.openProgress >= 1) return false;
    if (!door.locked) return true;
    if (door.lockType === 'button' && state.flags.buttonPressed) return true;
    return false;
}

/** Nearest closed gate we can open, within range, or null. One goal per opening. */
function getNearestClosedDoor(state, maxRange = 6) {
    const p = state.player;
    let best = null;
    let bestDist = Infinity;
    for (const gate of gates) {
        if (!canOpenDoor(state, gate)) continue;
        const dist = distanceTo(p.x, p.y, gate.cx, gate.cy);
        if (dist > maxRange || dist >= bestDist) continue;
        bestDist = dist;
        best = { door: gate, x: gate.cx, y: gate.cy };
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
 * One goal per frame. Priority: visible enemy → current scripted step → fallback (nearest door / explore).
 * @returns {{ type: string, x: number, y: number, action?: string, entity?: object, door?: object } | null}
 */
function getCurrentGoal(state) {
    const p = state.player;

    // 1) Combat: nearest visible enemy, or recent enemy (combat memory so we don't rescans when LOS flickers)
    let enemy = getNearestVisibleEnemy(state);
    if (!enemy) enemy = getRecentEnemyIfValid(state);
    if (enemy) {
        state.ai.lastEnemyTargetId = enemy.id;
        state.ai.lastEnemyTime = state.time.elapsed || 0;
        return { type: 'enemy', x: enemy.x, y: enemy.y, action: 'fire', entity: enemy };
    }
    state.ai.lastEnemyTargetId = null;

    // 2) List of goals: first step not done and (if door) still interactable — never target an open door
    const stepIndex = getEffectiveCurrentStepIndex(state);
    if (stepIndex >= 0) {
        const route = getScriptedRoute();
        return stepToGoal(route[stepIndex]);
    }

    // 3) Fallback: nearest closed door only when still in area0/hallway (never target a door behind us)
    // 4) Explore: go toward level's explore fallback room (e.g. area1) if still in start area
    const room = getRoomId(p.x, p.y);
    const startRoomId = moodLevel1.roomOrder && moodLevel1.roomOrder[0];
    if (room === startRoomId || room === null) {
        const doorGoal = getNearestClosedDoor(state, 10);
        if (doorGoal) return { type: 'door', x: doorGoal.x, y: doorGoal.y, action: 'interact', door: doorGoal.door };
        const fallbackRoom = getExploreFallbackRoom(moodLevel1, worldApi);
        if (fallbackRoom) return { type: 'waypoint', x: fallbackRoom.x + fallbackRoom.w / 2, y: fallbackRoom.y + fallbackRoom.h / 2 };
    }

    return null;
}

// ── Steering ─────────────────────────────────────────────────────────

/** Pick (tx, ty) to steer toward: next path step, or goal. Never steer toward a different goal when path is null — stick to current goal (forward-only). */
function getSteerTarget(state, goal) {
    const p = state.player;
    if (goal.type === 'enemy' || goal.action === 'fire') {
        return { x: goal.x, y: goal.y };
    }
    const path = getPathToGoal(state, goal);
    if (path && path.length > 1) {
        for (let i = 1; i < path.length; i++) {
            const cx = path[i].x + 0.5, cy = path[i].y + 0.5;
            if (distanceTo(p.x, p.y, cx, cy) > PATH_REACH_DIST) return { x: cx, y: cy };
        }
        return { x: goal.x, y: goal.y };
    }
    // Path null or length 1: keep current goal (e.g. door we're at while it opens). Do not fall back to "nearest closed door" — that would send us backward.
    if (goal.type === 'door' && goal.door) {
        const a = getApproachTile(goal.door.cx, goal.door.cy, p.x, p.y);
        return { x: a.x + 0.5, y: a.y + 0.5 };
    }
    if (goal.action === 'interact') {
        const a = getApproachTile(goal.x, goal.y, p.x, p.y);
        return { x: a.x + 0.5, y: a.y + 0.5 };
    }
    return { x: goal.x, y: goal.y };
}

/** Set state.ai.input: aim at target and move in any combination of directions (multimodal: move + aim + fire at once). */
function steerToward(state, goal) {
    if (!goal) return;
    const p = state.player;
    const inp = state.ai.input;
    const target = getSteerTarget(state, goal);
    const wantAngle = angleTo(p.x, p.y, target.x, target.y);
    const angleDiff = normalizeAngle(wantAngle - p.angle);
    const distToTarget = distanceTo(p.x, p.y, target.x, target.y);

    // ── Aim: always turn toward target (like a player moving the mouse). Never stop aiming when we have a goal. ──
    if (Math.abs(angleDiff) <= AIM_DEAD_ZONE) {
        inp.lookDX = 0;
    } else {
        const isCombat = goal.type === 'enemy' || goal.action === 'fire';
        const turnGain = isCombat ? TURN_GAIN * 1.2 : TURN_GAIN; // Slightly faster track in combat
        let lookDX = angleDiff * turnGain;
        const maxTurnPerFrame = (Math.abs(angleDiff) * NO_OVERSHOOT_FRAC) / MOUSE_SENSITIVITY;
        lookDX = Math.max(-maxTurnPerFrame, Math.min(maxTurnPerFrame, lookDX));
        inp.lookDX = Math.max(-LOOK_DX_MAX, Math.min(LOOK_DX_MAX, lookDX));
    }
    inp.lookDY = 0;

    // ── Movement: allow any combination of forward/back/strafe (diagonal movement like W+A). ──
    const isCombat = goal.type === 'enemy' || goal.action === 'fire';
    const inCombatStandoff = isCombat && distToTarget <= COMBAT_NO_ADVANCE_DIST;

    if (isCombat) {
        if (inCombatStandoff) {
            inp.moveForward = false;
            if (distToTarget < COMBAT_BACK_UP_DIST) {
                inp.moveBack = true;
                inp.strafeLeft = false;
                inp.strafeRight = false;
            } else {
                inp.moveBack = false;
                const phase = Math.floor((state.time.elapsed || 0) / 2.5) % 2;
                inp.strafeLeft = phase === 0;
                inp.strafeRight = phase === 1;
            }
        } else {
            // Advancing: move forward + circle-strafe toward enemy (diagonal movement while aiming)
            inp.moveForward = true;
            inp.moveBack = false;
            const side = angleDiff; // positive = enemy to our left (we want to strafe right to orbit)
            inp.strafeLeft = side < -0.15;
            inp.strafeRight = side > 0.15;
        }
        return;
    }

    // Navigation: move in the direction of the target (forward and/or strafe = diagonal)
    const forwardComponent = Math.cos(angleDiff);
    const rightComponent = Math.sin(angleDiff);
    const thresh = 0.2;
    inp.moveForward = forwardComponent > thresh && !isPathBlocked(p.x, p.y, p.angle);
    inp.moveBack = forwardComponent < -thresh;
    inp.strafeRight = rightComponent > thresh;
    inp.strafeLeft = rightComponent < -thresh;
    if (inp.moveBack && (inp.strafeLeft || inp.strafeRight)) {
        inp.moveForward = false;
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
        const aimTolerance = dist <= COMBAT_POINT_BLANK_DIST ? COMBAT_FACING_TOLERANCE_CLOSE : COMBAT_FACING_TOLERANCE;
        if (dist <= COMBAT_MAX_RANGE && Math.abs(normalizeAngle(wantAngle - p.angle)) <= aimTolerance) {
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

    const stepIndex = getEffectiveCurrentStepIndex(state);
    if (stepIndex !== lastCachedStepIndex) {
        invalidatePathCache();
        lastCachedStepIndex = stepIndex;
    }

    const goal = getCurrentGoal(state);
    if (goal) {
        steerToward(state, goal);
        performAction(state, goal);
    }
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
