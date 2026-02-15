/**
 * ai.js — Goal-driven AI (1990s-style)
 *
 * Idle ~5s → AI takes over. Like Doom/Quake-era bots: pick one goal,
 * BFS pathfind on the tile grid (go around walls/pillars), steer toward
 * the next path step, interact when in range. One loop: goal → path → steer → act.
 *
 * Engine contract (goal validity, steer target, BFS, stuck recovery) is defined
 * once for all levels in levels/BFS-AND-STEERING.md. No step-specific logic.
 *
 * The AI uses the same world state the minimap displays: grid, entities, doors,
 * rooms (getRoomId). There is no separate minimap feed — decisions use that data directly.
 *
 * AI_TUNING = general rules (how to walk, aim, combat). Level data (steps, roomOrder) =
 * the "map and instructions" for the level; level can override via custom doneWhen etc.
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
const LOOK_AHEAD_TILES = 7; // When we have clear LOS, steer toward a point this far along the path (human-like: run toward goal until in range)
const COMBAT_RECENT_ENEMY_GRACE = 1.2; // Keep targeting enemy for this long without LOS so we don't rescans
const COMBAT_SWITCH_CLOSER_TILES = 2;  // Only switch to a different visible enemy if they're this many tiles closer

// Stuck recovery: when we don't make progress toward steer target for this long, back up and replan
const STUCK_NO_PROGRESS_THRESHOLD = 1.0;  // seconds (slightly sooner so we escape corners faster)
const STUCK_PROGRESS_MIN = 0.2;           // tiles improvement per check to count as progress
const BACKUP_DURATION = 0.55;             // seconds to back up + wiggle when stuck
const BACKUP_DURATION_EXTRA = 1.0;        // after many replans, back up longer to escape bad spots
const REPLAN_COUNT_FOR_EXTRA_BACKUP = 3;
const NULL_PATH_STUCK_THRESHOLD = 0.8;    // if path is null for this long (nav goal), treat as stuck
const DOOR_STUCK_TIME = 3;                // at door in range this long without opening → backup and re-approach
const DOOR_FALLBACK_AFTER_ATTEMPTS = 5;   // after this many door backup cycles, log FAILURE/FALLBACK

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
 * Optionally fills state.ai._debugStepSkip with why we skipped each step (for debugging).
 */
function getEffectiveCurrentStepIndex(state) {
    const route = getScriptedRoute();
    const skipReasons = [];
    for (let i = 0; i < route.length; i++) {
        const step = route[i];
        if (step.doneWhen(state)) {
            skipReasons.push(`${i}:${step.label}(done)`);
            continue;
        }
        if (step.doorKey && doors[step.doorKey] && doors[step.doorKey].openProgress >= 1) {
            skipReasons.push(`${i}:${step.label}(door open)`);
            continue;
        }
        state.ai._debugStepSkip = skipReasons;
        return i;
    }
    state.ai._debugStepSkip = skipReasons;
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
        const dirs = [
            { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
            { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
        ];
        for (const d of dirs) {
            const nx = cur.x + d.x, ny = cur.y + d.y;
            if (d.x !== 0 && d.y !== 0) {
                if (!isWalkable(cur.x + d.x, cur.y) || !isWalkable(cur.x, cur.y + d.y)) continue;
            }
            const key = `${nx},${ny}`;
            if (cameFrom.has(key) || !isWalkable(nx, ny)) continue;
            cameFrom.set(key, cur);
            queue.push({ x: nx, y: ny });
        }
    }
    return null;
}

/** Smooth path by string-pulling: keep only nodes we have LOS through (cut corners). Fewer waypoints = smoother ground path. */
function smoothPath(path) {
    if (!path || path.length <= 2) return path;
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
        const ax = path[i].x + 0.5, ay = path[i].y + 0.5;
        let best = i + 1;
        for (let j = i + 2; j < path.length; j++) {
            const bx = path[j].x + 0.5, by = path[j].y + 0.5;
            if (hasLineOfSight(ax, ay, bx, by)) best = j;
        }
        out.push(path[best]);
        i = best;
    }
    return out;
}

// Path cache: shorter TTL = recalc path more often (more responsive to blocks); longer = fewer recalc. Stuck recovery invalidates cache so we get a fresh path after backup.
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

    let path = bfsPath(sx, sy, ex, ey);
    if (path) {
        path = smoothPath(path);
        pathCache = { path, sx, sy, ex, ey, stepIndex, time: elapsed };
        state.ai._pathWasNull = false;
    } else {
        pathCache = { path: null, sx: -1, sy: -1, ex: -1, ey: -1, stepIndex: -2, time: elapsed };
        state.ai._pathWasNull = true;
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
 * One goal per frame. See AI-BEHAVIOR.md for the full contract.
 *
 * Priority:
 * 1. Visible enemy (we have LOS) — always valid.
 * 2. Recent enemy (combat memory) — invalid if current step is a door and we have no LOS (open door first).
 * 3. Effective scripted step (first not done; never an open door).
 * 4. Fallback only in area0: nearest closed door, else explore toward area1.
 *
 * @returns {{ type: string, x: number, y: number, action?: string, entity?: object, door?: object } | null}
 */
function getCurrentGoal(state) {
    const p = state.player;
    const stepIndex = getEffectiveCurrentStepIndex(state);
    const route = getScriptedRoute();
    const currentStep = stepIndex >= 0 ? route[stepIndex] : null;
    const isDoorStep = currentStep && currentStep.doorKey;

    // 1) Combat: prefer current target if still in LOS (reduce refocus); else nearest visible, else recent enemy
    let enemy = getNearestVisibleEnemy(state);
    const haveVisibleEnemy = !!enemy;
    // If we're already targeting someone who's still visible, stick to them unless another enemy is much closer
    if (state.ai.lastEnemyTargetId != null && haveVisibleEnemy) {
        const current = state.entities?.find((e) => e.id === state.ai.lastEnemyTargetId && e.hp > 0);
        if (current && hasLineOfSight(p.x, p.y, current.x, current.y) && distanceTo(p.x, p.y, current.x, current.y) <= COMBAT_MAX_RANGE) {
            const distCurrent = distanceTo(p.x, p.y, current.x, current.y);
            const distNearest = distanceTo(p.x, p.y, enemy.x, enemy.y);
            if (distNearest >= distCurrent - COMBAT_SWITCH_CLOSER_TILES) {
                enemy = current; // keep current target
            }
        }
    }
    if (!enemy) enemy = getRecentEnemyIfValid(state);
    if (enemy) {
        const haveLOS = haveVisibleEnemy || hasLineOfSight(p.x, p.y, enemy.x, enemy.y);
        if (isDoorStep && !haveLOS) {
            // Enemy is behind the door; open the door first instead of shooting at the wall
            enemy = null;
            state.ai.lastEnemyTargetId = null;
        }
    }
    if (enemy) {
        state.ai.lastEnemyTargetId = enemy.id;
        state.ai.lastEnemyTime = state.time.elapsed || 0;
        return { type: 'enemy', x: enemy.x, y: enemy.y, action: 'fire', entity: enemy };
    }
    state.ai.lastEnemyTargetId = null;

    // 2) List of goals: first step not done and (if door) still interactable — never target an open door
    if (stepIndex >= 0) {
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
// See levels/BFS-AND-STEERING.md: for any door or interact goal, steer target is always
// the approach tile (never the interact point, which may be solid). Same logic for all levels.

/** True if goal requires standing at an approach tile to interact (door, button, pickup, etc.). */
function isInteractGoal(goal) {
    return (goal.type === 'door' && goal.door) || goal.action === 'interact';
}

/** Approach tile center for an interact goal. Multi-tile doors use gate center (cx, cy) so bot goes to middle. */
function getInteractApproachCenter(goal, px, py) {
    if (goal.type === 'door' && goal.door) {
        const a = getApproachTile(goal.door.cx, goal.door.cy, px, py);
        return { x: a.x + 0.5, y: a.y + 0.5 };
    }
    if (goal.action === 'interact') {
        const a = getApproachTile(goal.x, goal.y, px, py);
        return { x: a.x + 0.5, y: a.y + 0.5 };
    }
    return { x: goal.x, y: goal.y };
}

/** When within this many tiles of an interact goal, steer at approach tile only (no look-ahead) so target doesn't jump and trigger replan. */
const INTERACT_STEER_LOCK_DIST = 5;
/** When this close to an interact point, never trigger "no progress" replan — we're committed to walking there. */
const COMMIT_TO_INTERACT_DIST = 5;

/** Pick (tx, ty) to steer toward. Uses look-ahead: when we have LOS, target a point up to LOOK_AHEAD_TILES ahead (human-like straight run until in range). */
function getSteerTarget(state, goal) {
    const p = state.player;
    if (goal.type === 'enemy' || goal.action === 'fire') {
        return { x: goal.x, y: goal.y };
    }
    const path = getPathToGoal(state, goal);
    const pickFromPath = (path, useLookAhead) => {
        if (!path || path.length <= 1) return null;
        let firstUnreached = -1;
        for (let i = 1; i < path.length; i++) {
            const cx = path[i].x + 0.5, cy = path[i].y + 0.5;
            if (distanceTo(p.x, p.y, cx, cy) > PATH_REACH_DIST) {
                firstUnreached = i;
                break;
            }
        }
        if (firstUnreached < 0) return null;
        let bestIdx = firstUnreached;
        if (useLookAhead) {
            for (let i = firstUnreached + 1; i < path.length; i++) {
                const cx = path[i].x + 0.5, cy = path[i].y + 0.5;
                const dist = distanceTo(p.x, p.y, cx, cy);
                if (dist <= LOOK_AHEAD_TILES && hasLineOfSight(p.x, p.y, cx, cy)) bestIdx = i;
                else break;
            }
        }
        const n = path[bestIdx];
        return { x: n.x + 0.5, y: n.y + 0.5 };
    };
    if (isInteractGoal(goal)) {
        const approachCenter = getInteractApproachCenter(goal, p.x, p.y);
        const distToApproach = distanceTo(p.x, p.y, approachCenter.x, approachCenter.y);
        // Close to door/button: steer at approach tile only so we don't jump targets and trigger replan
        if (distToApproach <= INTERACT_STEER_LOCK_DIST) {
            return approachCenter;
        }
        const pathTarget = pickFromPath(path, true);
        if (pathTarget) return pathTarget;
        return approachCenter;
    }
    const pathTarget = pickFromPath(path, true);
    if (pathTarget) return pathTarget;
    return { x: goal.x, y: goal.y };
}

/** Set state.ai.input: aim at target and move in any combination of directions (multimodal: move + aim + fire at once). */
function steerToward(state, goal) {
    if (!goal) return;
    const p = state.player;
    const inp = state.ai.input;
    const target = getSteerTarget(state, goal);
    // For any interact goal: when in range, aim at the interact point so we can press E (movement stays approach tile)
    const interactAim = isInteractGoal(goal)
        && (goal.door
            ? distanceTo(p.x, p.y, goal.door.cx, goal.door.cy) <= INTERACTION_RANGE
            : distanceTo(p.x, p.y, goal.x, goal.y) <= INTERACTION_RANGE);
    const aimAt = interactAim
        ? (goal.door ? { x: goal.door.cx, y: goal.door.cy } : { x: goal.x, y: goal.y })
        : target;
    const wantAngle = angleTo(p.x, p.y, aimAt.x, aimAt.y);
    const angleDiff = normalizeAngle(wantAngle - p.angle);
    const distToTarget = distanceTo(p.x, p.y, target.x, target.y);
    const elapsed = state.time.elapsed || 0;
    const dt = state.time.dt != null ? state.time.dt : (1 / 60);

    const isCombat = goal.type === 'enemy' || goal.action === 'fire';

    // ── Stuck detection (navigation only): no progress toward steer target → back up and replan ──
    if (!isCombat) {
        const ai = state.ai;
        const inBackupMode = ai._backUpUntil != null && elapsed < ai._backUpUntil;
        if (inBackupMode) {
            // Back up + strafe wiggle to escape corners; keep aiming at target
            inp.moveBack = true;
            inp.moveForward = false;
            const wiggle = Math.floor(elapsed / 0.25) % 2;
            inp.strafeLeft = wiggle === 0;
            inp.strafeRight = wiggle === 1;
            ai._lastSteerTargetDist = distToTarget;
            if (Math.abs(angleDiff) > AIM_DEAD_ZONE) {
                const turnGain = TURN_GAIN;
                let lookDX = angleDiff * turnGain;
                const maxTurnPerFrame = (Math.abs(angleDiff) * NO_OVERSHOOT_FRAC) / MOUSE_SENSITIVITY;
                lookDX = Math.max(-maxTurnPerFrame, Math.min(maxTurnPerFrame, lookDX));
                inp.lookDX = Math.max(-LOOK_DX_MAX, Math.min(LOOK_DX_MAX, lookDX));
            } else inp.lookDX = 0;
            inp.lookDY = 0;
            return;
        }
        // Null path: BFS returned no path to goal; don't steer at goal forever
        if (ai._pathWasNull) {
            ai._nullPathTime = (ai._nullPathTime || 0) + dt;
            if (ai._nullPathTime >= NULL_PATH_STUCK_THRESHOLD) {
                invalidatePathCache();
                const replans = (ai._replanCount || 0) + 1;
                ai._replanCount = replans;
                const backupLen = replans >= REPLAN_COUNT_FOR_EXTRA_BACKUP ? BACKUP_DURATION_EXTRA : BACKUP_DURATION;
                ai._backUpUntil = elapsed + backupLen;
                ai._nullPathTime = 0;
                console.log('[AI] REPLAN — null path to goal for too long, backing up (replan #' + replans + ')');
            }
        } else {
            ai._nullPathTime = 0;
        }

        const atDoorInRange = isInteractGoal(goal) && (goal.door
            ? distanceTo(p.x, p.y, goal.door.cx, goal.door.cy) <= INTERACTION_RANGE
            : distanceTo(p.x, p.y, goal.x, goal.y) <= INTERACTION_RANGE);
        const atWaypoint = distToTarget < PATH_REACH_DIST * 2 || atDoorInRange;
        const lastDist = ai._lastSteerTargetDist;
        // For interact goals, also count progress toward the interaction point (door/button), not just steer target.
        const isInteract = isInteractGoal(goal);
        const interactX = isInteract && (goal.door ? goal.door.cx : goal.x);
        const interactY = isInteract && (goal.door ? goal.door.cy : goal.y);
        const distToInteract = (interactX != null && interactY != null) ? distanceTo(p.x, p.y, interactX, interactY) : Infinity;
        const lastInteractDist = ai._lastInteractDist;
        const madeProgressTowardInteract = isInteract && (lastInteractDist != null && distToInteract < lastInteractDist - STUCK_PROGRESS_MIN);
        if (isInteract) ai._lastInteractDist = distToInteract; else ai._lastInteractDist = undefined;

        // When committed to an interact goal (within COMMIT_TO_INTERACT_DIST), never replan for "no progress" — just walk there.
        const committedToInteract = isInteract && distToInteract <= COMMIT_TO_INTERACT_DIST;
        if (committedToInteract) ai._stuckNoProgressTime = 0;
        if (lastDist != null && !atWaypoint && !committedToInteract) {
            const madeProgress = distToTarget < lastDist - STUCK_PROGRESS_MIN || (isInteract && madeProgressTowardInteract);
            if (!madeProgress) {
                ai._stuckNoProgressTime = (ai._stuckNoProgressTime || 0) + dt;
                if (ai._stuckNoProgressTime >= STUCK_NO_PROGRESS_THRESHOLD) {
                    invalidatePathCache();
                    const replans = (ai._replanCount || 0) + 1;
                    ai._replanCount = replans;
                    const backupLen = replans >= REPLAN_COUNT_FOR_EXTRA_BACKUP ? BACKUP_DURATION_EXTRA : BACKUP_DURATION;
                    ai._backUpUntil = elapsed + backupLen;
                    ai._stuckNoProgressTime = 0;
                    console.log('[AI] REPLAN — no progress toward target, backing up (replan #' + replans + ')');
                }
            } else {
                ai._stuckNoProgressTime = 0;
            }
        }
        ai._lastSteerTargetDist = distToTarget;
    } else {
        state.ai._lastSteerTargetDist = distToTarget;
        state.ai._stuckNoProgressTime = 0;
        state.ai._nullPathTime = 0;
        state.ai._lastInteractDist = undefined;
    }

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
                // Longer phase (3.5s) + hysteresis: commit to one strafe direction, switch only when angle crosses margin
                const side = angleDiff; // positive = enemy to our left → strafe right
                let dir = state.ai._combatStrafeDir;
                if (dir === undefined) dir = side >= 0 ? 1 : -1;
                if (dir === 1 && side < -0.22) dir = -1;
                else if (dir === -1 && side > 0.22) dir = 1;
                state.ai._combatStrafeDir = dir;
                inp.strafeLeft = dir === -1;
                inp.strafeRight = dir === 1;
            }
        } else {
            // Advancing: move forward + circle-strafe toward enemy (diagonal movement while aiming)
            inp.moveForward = true;
            inp.moveBack = false;
            const side = angleDiff;
            let dir = state.ai._combatStrafeDir;
            if (dir === undefined) dir = side >= 0 ? 1 : -1;
            if (dir === 1 && side < -0.2) dir = -1;
            else if (dir === -1 && side > 0.2) dir = 1;
            state.ai._combatStrafeDir = dir;
            inp.strafeLeft = dir === -1;
            inp.strafeRight = dir === 1;
        }
        return;
    }
    state.ai._combatStrafeDir = undefined; // clear when leaving combat

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
        const tx = goal.door ? goal.door.cx : goal.x;
        const ty = goal.door ? goal.door.cy : goal.y;
        if (isInRangeAndFacing(p.x, p.y, p.angle, tx, ty, AI_TUNING.interactFacingTolerance)) {
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
        const prevStep = lastCachedStepIndex >= 0 ? getScriptedRoute()[lastCachedStepIndex] : null;
        if (prevStep && prevStep.doorKey) {
            console.log('[AI] DOOR_SUCCESS — step completed: ' + (prevStep.label || 'door'));
        }
        invalidatePathCache();
        lastCachedStepIndex = stepIndex;
        state.ai._replanCount = 0;
        state.ai._doorAttemptCount = 0;
        state.ai._lastInteractDist = undefined;
    }

    const goal = getCurrentGoal(state);

    if (stepIndex < 0 && goal === null) {
        const room = getRoomId(state.player.x, state.player.y);
        const startId = moodLevel1.roomOrder && moodLevel1.roomOrder[0];
        if (room !== startId && room !== null) {
            state.ai._noStepLogT = state.ai._noStepLogT || 0;
            state.ai._noStepLogT += state.time.dt || 0;
            if (state.ai._noStepLogT >= 5) {
                console.warn('[AI] NO STEP — no scripted step for this level; bot has no goal. Add steps to level data.');
                state.ai._noStepLogT = 0;
            }
        } else {
            state.ai._noStepLogT = 0;
        }
    }

    if (goal && goal.type === 'door' && goal.door) {
        const dist = distanceTo(state.player.x, state.player.y, goal.door.cx, goal.door.cy);
        const inRange = dist <= INTERACTION_RANGE;
        const elapsed = state.time.elapsed || 0;
        if (inRange) {
            if (state.ai._atDoorSince == null) state.ai._atDoorSince = elapsed;
            if (goal.door.openProgress < 1 && (elapsed - state.ai._atDoorSince) >= DOOR_STUCK_TIME) {
                invalidatePathCache();
                state.ai._atDoorSince = null;
                state.ai._doorAttemptCount = (state.ai._doorAttemptCount || 0) + 1;
                const backupLen = state.ai._doorAttemptCount >= REPLAN_COUNT_FOR_EXTRA_BACKUP ? BACKUP_DURATION_EXTRA : BACKUP_DURATION;
                state.ai._backUpUntil = elapsed + backupLen;
                state.ai._replanCount = (state.ai._replanCount || 0) + 1;
                console.log('[AI] REPLAN — stuck at door, backing up to re-approach (attempt ' + state.ai._doorAttemptCount + ')');
                if (state.ai._doorAttemptCount >= DOOR_FALLBACK_AFTER_ATTEMPTS) {
                    console.warn('[AI] FAILURE/FALLBACK — door still not open after ' + DOOR_FALLBACK_AFTER_ATTEMPTS + ' attempts; continuing to retry.');
                }
            }
        } else {
            state.ai._atDoorSince = null;
        }
    } else {
        state.ai._atDoorSince = null;
    }
    if (goal) {
        steerToward(state, goal);
        performAction(state, goal);
    }
    const route = getScriptedRoute();
    const stepLabel = stepIndex >= 0 ? route[stepIndex].label : null;
    const rawStepIndex = getCurrentScriptedStepIndex(state);
    const roomId = getRoomId(state.player.x, state.player.y);

    // Debug: goal summary; for door goals show THIS door's state, not a hardcoded tile
    let goalSummary = 'none';
    let goalDoorOpen = null;
    if (goal) {
        if (goal.type === 'enemy' && goal.entity) goalSummary = `enemy ${goal.entity.id}`;
        else if (goal.door) {
            goalSummary = `door ${goal.door.cx.toFixed(0)},${goal.door.cy.toFixed(0)}`;
            goalDoorOpen = goal.door.openProgress >= 1;
        } else if (goal.type === 'waypoint') goalSummary = `waypoint ${goal.x.toFixed(0)},${goal.y.toFixed(0)}`;
        else goalSummary = goal.type || '?';
    }
    const door0 = doors['8,5'];

    state.ai.telemetry = {
        state: goal ? goal.type : 'idle',
        step: stepLabel,
        targetId: goal && goal.entity ? goal.entity.id : null,
        confidence: goal ? 1 : 0,
        stuckTimer: state.ai._stuckNoProgressTime ?? 0,
        replanCount: state.ai._replanCount ?? 0,
    };

    const inBackup = state.ai._backUpUntil != null && (state.time.elapsed || 0) < state.ai._backUpUntil;
    state.ai.debug = {
        rawStepIndex,
        effectiveStepIndex: stepIndex,
        stepLabel,
        goalType: goal ? goal.type : null,
        goalSummary,
        roomId: roomId || 'null',
        skippedSteps: state.ai._debugStepSkip || [],
        goalDoorOpen: goalDoorOpen,
        door_8_5_open: door0 ? door0.openProgress >= 1 : 'no ref',
        door_8_5_progress: door0 ? door0.openProgress.toFixed(2) : '—',
        lastEnemyId: state.ai.lastEnemyTargetId,
        stuckTimer: (state.ai._stuckNoProgressTime ?? 0).toFixed(2),
        replanCount: state.ai._replanCount ?? 0,
        backingUp: inBackup,
    };

    // Throttled console log (every ~2s) to trace regression without flooding
    if (!state.ai._debugLogT) state.ai._debugLogT = 0;
    state.ai._debugLogT += state.time.dt || 0;
    if (state.ai._debugLogT >= 2) {
        state.ai._debugLogT = 0;
        const doorStatus = goalDoorOpen != null ? ` goalDoorOpen=${goalDoorOpen}` : '';
        console.log(
            `[AI] room=${roomId || 'null'} rawStep=${rawStepIndex} effectiveStep=${stepIndex} step=${stepLabel || '—'} goal=${goalSummary}${doorStatus} skipped=[${(state.ai._debugStepSkip || []).join(', ')}]`
        );
    }
}
