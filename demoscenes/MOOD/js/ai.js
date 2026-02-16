/**
 * ai.js — Bot Artificial Intelligence
 * 
 * New Context-Based Steering Implementation (Phase 3 "From Scratch").
 * 
 * Logic Flow:
 * 1. High-Level Strategy (update()):
 *    - Priority 1: Clear enemies in current room.
 *    - Priority 2: Follow Scripted Route (Areas/Rooms/Buttons).
 * 
 * 2. Navigation (getPathToGoal()):
 *    - Uses A* to find path to current goal.
 *    - Uses Catmull-Rom splines to smooth path for "Flow".
 * 
 * 3. Movement (steerToward()):
 *    - Calculates weighted vectors:
 *      * Flow: Direction along the path.
 *      * Avoidance: Raycast "whiskers" pushing away from walls.
 *      * Combat: Maintain optimal weapon range.
 *    - Blends vectors for organic, fluid movement.
 */

import {
    isSolid, getRoomId, doors, gates, getMapWidth, getMapHeight, BOSS_LIGHTWELLS
} from './map.js';
import { TILE, INTERACTION_RANGE, INTERACTION_ANGLE, PLAYER_RADIUS, MOUSE_SENSITIVITY, WEAPONS } from './config.js';
import { angleTo, distanceTo, normalizeAngle, catmullRom, manhattanDistance } from './utils.js';
import {
    buildRoute, getCurrentScriptedStepIndex as getRouteStepIndex,
    getScriptedRoute, getEffectiveCurrentStepIndex,
    isInteractGoal, getInteractApproachCenter,
    getCurrentGoal, getMainTrack
} from './ai_script.js';

// ── Tuning Constants ────────────────────────────────────────────────

// Navigation
const PATH_REACH_DIST = 1.2;          // Distance to consider a path node "reached" (increased for flow)
const LOOK_AHEAD_TILES = 4;           // How far along path to look for Flow Vector
const LOOK_AHEAD_TILES_NAV = 2;       // Shorter lookahead for precision nav
const STUCK_TIME_THRESHOLD = 2.0;     // Seconds with no progress before replan
const DOOR_STUCK_TIME = 2.5;          // Seconds waiting at door before backup
const NULL_PATH_STUCK_THRESHOLD = 3.0;// Seconds with no path before backup
const BACKUP_DURATION = 1.0;
const BACKUP_DURATION_EXTRA = 2.5;
const REPLAN_COUNT_FOR_EXTRA_BACKUP = 2;
const DOOR_FALLBACK_AFTER_ATTEMPTS = 3;

// Combat
const TURN_GAIN = 0.15;               // How snappy the turning is
const LOOK_DX_MAX = 100.0;             // Max turn speed per frame
const NO_OVERSHOOT_FRAC = 0.6;        // Damping to prevent jitter
const AIM_DEAD_ZONE = 0.05;           // Radians
const COMBAT_FACING_TOLERANCE = 0.35; // ~20 deg
const COMBAT_FACING_TOLERANCE_CLOSE = 0.6;
const COMBAT_MAX_RANGE = 25.0;
const COMBAT_NO_ADVANCE_DIST = 5.0;   // Default stop distance
const COMBAT_BACK_UP_DIST = 3.0;      // Default back up distance
const COMBAT_POINT_BLANK_DIST = 2.5;

const AI_TUNING = {
    interactFacingTolerance: 0.5,
};

// ── State & Cache ───────────────────────────────────────────────────

let pathCache = null;         // { path: [], sx, sy, ex, ey, stepIndex, time: number }
let lastCachedStepIndex = -2; // dirty check for step changes

function invalidatePathCache() {
    pathCache = null;
}

// ── Pathfinding (A* + Splines) ──────────────────────────────────────

/** A* Pathfinding: Finds grid path from (sx, sy) to (ex, ey). */
function bfsPath(sx, sy, ex, ey) {
    if (sx === ex && sy === ey) return [{ x: sx, y: sy }];

    // Check line of sight first for trivial paths? No, A* is fast enough.
    // If start or end is solid, we might have issues, but A* handles it (returns null).

    const startNode = { x: sx, y: sy, g: 0, h: 0, f: 0, parent: null };
    const openList = [startNode];
    const closedSet = new Set();
    const cameFrom = new Map(); // "x,y" => node

    const getKey = (x, y) => `${x},${y}`;
    const openMap = new Map(); // Quick lookup
    openMap.set(getKey(sx, sy), startNode);

    // Limits
    const MAX_NODES = 500;
    let nodesExplored = 0;

    while (openList.length > 0) {
        // Sort by F cost (lowest first)
        openList.sort((a, b) => a.f - b.f);
        const current = openList.shift();
        const k = getKey(current.x, current.y);
        openMap.delete(k);
        closedSet.add(k);

        if (current.x === ex && current.y === ey) {
            // Reconstruct path
            const path = [];
            let curr = current;
            while (curr) {
                path.push({ x: curr.x, y: curr.y });
                curr = curr.parent;
            }
            return path.reverse();
        }

        if (++nodesExplored > MAX_NODES) return null; // Too complex

        const neighbors = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 }
        ];

        for (const n of neighbors) {
            if (isSolid(n.x, n.y) && !(n.x === ex && n.y === ey)) continue; // Allow end node to be solid (e.g. invalid map data) but usually we shouldn't.
            // Actually, we check isSolid in map.js which handles doors.

            const nk = getKey(n.x, n.y);
            if (closedSet.has(nk)) continue;

            // Centering cost: Penalize tiles next to walls
            let openness = 0;
            if (!isSolid(n.x + 1, n.y)) openness++;
            if (!isSolid(n.x - 1, n.y)) openness++;
            if (!isSolid(n.x, n.y + 1)) openness++;
            if (!isSolid(n.x, n.y - 1)) openness++;

            // Cost = 1 (dist) + penalty for being near walls (less open)
            // If openness < 4 (touches wall), add cost.
            const centeringCost = (4 - openness) * 2.0;

            const g = current.g + 1 + centeringCost;
            const h = manhattanDistance(n.x, n.y, ex, ey);
            const f = g + h;

            const existing = openMap.get(nk);
            if (existing && g >= existing.g) continue;

            const newNode = { x: n.x, y: n.y, g, h, f, parent: current };
            openMap.set(nk, newNode);
            openList.push(newNode);
        }
    }
    return null;
}

/** Catmull-Rom Spline Smoothing */
function smoothPath(path) {
    if (!path || path.length === 0) return path;

    // If path is short, just center it
    if (path.length < 3) {
        return path.map(p => ({ x: p.x + 0.5, y: p.y + 0.5 }));
    }

    const smoothed = [];
    // Points for spline: duplicate start/end to control tension at tips
    const points = [path[0], ...path, path[path.length - 1]].map(p => ({ x: p.x + 0.5, y: p.y + 0.5 }));

    for (let i = 0; i < points.length - 3; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const p2 = points[i + 2];
        const p3 = points[i + 3];

        // Steps per segment
        const dist = distanceTo(p1.x, p1.y, p2.x, p2.y);
        const steps = Math.max(1, Math.floor(dist * 2)); // 2 points per tile

        for (let t = 0; t < 1; t += 1 / steps) {
            const pt = catmullRom(p0, p1, p2, p3, t);
            // Collision check: if spline clips wall, fallback to hard node
            if (!isSolid(pt.x, pt.y)) {
                smoothed.push(pt);
            } else {
                smoothed.push(p1); // Fallback
            }
        }
    }
    // Add final point
    smoothed.push(points[points.length - 2]);
    return smoothed;
}

function getPathToGoal(state, goal) {
    const elapsed = state.time.elapsed || 0;
    const stepIndex = state.ai._effectiveStepIndex ?? -2;
    const p = state.player;

    const sx = Math.floor(p.x);
    const sy = Math.floor(p.y);
    const ex = goal.door ? Math.floor(goal.door.cx) : Math.floor(goal.x);
    const ey = goal.door ? Math.floor(goal.door.cy) : Math.floor(goal.y);

    // Cache hit?
    if (pathCache &&
        stepIndex === pathCache.stepIndex &&
        pathCache.ex === ex && pathCache.ey === ey &&
        distanceTo(p.x, p.y, pathCache.sx, pathCache.sy) < 3.0 && // reuse if close to start
        (elapsed - pathCache.time) < 1.0) { // expire after 1s to allow dynamic updates
        return pathCache.path;
    }

    const path = bfsPath(sx, sy, ex, ey);
    if (path) {
        // Apply Spline Smoothing for fluid movement
        const smoothed = smoothPath(path);

        pathCache = { path: smoothed, sx, sy, ex, ey, stepIndex, time: elapsed };
        state.ai._pathWasNull = false;
        state.ai.telemetry = state.ai.telemetry || {};
        state.ai.telemetry.pathNodes = smoothed.length;
        return smoothed;
    } else {
        pathCache = null;
        state.ai._pathWasNull = true;
        return null;
    }
}

// ── Helpers ─────────────────────────────────────────────────────────

function hasPathClear(x1, y1, x2, y2) {
    const d = distanceTo(x1, y1, x2, y2);
    const steps = Math.ceil(d * 2);
    const dx = (x2 - x1) / steps;
    const dy = (y2 - y1) / steps;
    for (let i = 0; i <= steps; i++) {
        const tx = x1 + dx * i;
        const ty = y1 + dy * i;
        if (isSolid(tx, ty)) return false;
    }
    return true;
}

function hasLineOfSight(x1, y1, x2, y2) {
    return hasPathClear(x1, y1, x2, y2);
}

function isInRangeAndFacing(px, py, angle, tx, ty, tolerance = 0.5) { // default ~30 deg
    const dist = distanceTo(px, py, tx, ty);
    if (dist > INTERACTION_RANGE) return false;
    const wantAngle = angleTo(px, py, tx, ty);
    const diff = Math.abs(normalizeAngle(wantAngle - angle));
    return diff <= tolerance;
}

function isPathBlocked(x, y, angle, dist = 1.0) {
    const tx = x + Math.cos(angle) * dist;
    const ty = y + Math.sin(angle) * dist;
    return isSolid(tx, ty);
}

// ── Context-Based Steering (New "From Scratch" System) ────────────────

/** 
 * 1. Flow Vector: Get desired direction based on Following the Path.
 * Returns normalized vector {x, y} or {0,0} if no path.
 */
function getFlowVector(path, p, lookAhead = 4) {
    if (!path || path.length < 2) return { x: 0, y: 0 };

    // Find closest point on path (index)
    let closestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < path.length; i++) {
        const d = distanceTo(p.x, p.y, path[i].x, path[i].y);
        if (d < minDist) {
            minDist = d;
            closestIdx = i;
        }
    }

    // Look ahead to get flow direction
    let targetIdx = Math.min(closestIdx + lookAhead, path.length - 1);

    // If we are far from the path, flow towards the closest point first to rejoin
    if (minDist > 2.0) {
        targetIdx = closestIdx + 1;
    }

    const tx = path[targetIdx].x;
    const ty = path[targetIdx].y;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 0.001) return { x: dx / len, y: dy / len };
    return { x: 0, y: 0 };
}

/**
 * 2. Avoidance Vector: Raycast whiskers to detect walls and push away.
 * Returns normalized vector {x, y} pointing AWAY from obstacles.
 */
function getAvoidanceVector(p) {
    const whiskers = [
        { angle: 0, len: 1.0, weight: 1.0 },
        { angle: 0.5, len: 0.8, weight: 0.8 },   // ~30 deg
        { angle: -0.5, len: 0.8, weight: 0.8 },
        { angle: 1.0, len: 0.6, weight: 0.5 },   // ~60 deg
        { angle: -1.0, len: 0.6, weight: 0.5 }
    ];

    let ax = 0, ay = 0;
    let count = 0;

    for (const w of whiskers) {
        const rayAngle = p.angle + w.angle;
        // Cast ray - Simple hit check: sample points along the ray
        const checkSteps = 5;
        for (let i = 1; i <= checkSteps; i++) {
            const dist = (i / checkSteps) * w.len;
            const rx = p.x + Math.cos(rayAngle) * dist;
            const ry = p.y + Math.sin(rayAngle) * dist;

            if (isSolid(rx, ry)) {
                // Hit! Calculate repulsion vector (opposite to ray)
                // EXPONENTIAL FALLOFF: The closer the hit, the STRONGER the repulsion
                // dist 0.1 -> 1/0.1 = 10. dist 1.0 -> 1.
                const closeness = Math.max(0.01, dist / w.len); // Avoid div by zero
                const force = (1.0 / closeness) * w.weight;

                ax -= Math.cos(rayAngle) * force;
                ay -= Math.sin(rayAngle) * force;
                count++;
                break; // Stop ray on first hit
            }
        }
    }

    // Preserve magnitude to let it override flow/combat!
    // But clamp it reasonably so it doesn't go to infinity or NaN
    const len = Math.sqrt(ax * ax + ay * ay);
    if (len > 0.001) {
        // Cap max force to avoid glitchy movement, but make it high (e.g. 6.0)
        // Previous was fixed at 2.0. Now it can scale from 1.0 to 6.0 based on danger.
        const maxForce = 6.0;
        if (len > maxForce) {
            return { x: (ax / len) * maxForce, y: (ay / len) * maxForce };
        }
        return { x: ax, y: ay };
    }
    return { x: 0, y: 0 };
}

/**
 * 3. Combat Spacing Vector: Maintain optimal range from enemy.
 */
function getCombatVector(p, goal) {
    if (goal.type !== 'enemy' && goal.action !== 'fire') return { x: 0, y: 0 };

    // Default optimal distances
    let optDist = 4.0;
    const weapon = WEAPONS[p.currentWeapon] || WEAPONS.HANDGUN;

    if (weapon.name === 'SHOTGUN') optDist = 2.5; // Rush
    if (weapon.name === 'VOID BEAM') optDist = 8.0; // Kite
    if (weapon.name === 'FIST') optDist = 0.5; // Melee

    const dist = distanceTo(p.x, p.y, goal.x, goal.y);
    const angleToTarget = angleTo(p.x, p.y, goal.x, goal.y);

    // If too close, push back
    if (dist < optDist - 1.0) {
        return {
            x: -Math.cos(angleToTarget) * 1.5,
            y: -Math.sin(angleToTarget) * 1.5
        };
    }
    // If too far, pull forward (but Flow vector usually handles this via pathing)
    return { x: 0, y: 0 };
}

/**
 * Context Steering Solver.
 * Computes final move direction by summing weighted context vectors.
 * Sets state.ai.input directly.
 */
// ── Navigation (Hybrid Track System) ──────────────────────────────

/**
 * Find the target point on the Main Track.
 * 1. Find closest track node to Player.
 * 2. Find closest track node to Goal.
 * 3. If Player is "behind" Goal on track, move to next node index.
 * 4. If Goal is off-track (room enter), use A* from track exit.
 */
// ── 4. Boss Strategy Vector: Go to nearest lightwell ──
function getBossZoneVector(p) {
    let bestZone = null;
    let minDist = Infinity;
    for (const z of BOSS_LIGHTWELLS) {
        const d = distanceTo(p.x, p.y, z.x, z.y);
        if (d < minDist) {
            minDist = d;
            bestZone = z;
        }
    }

    if (bestZone) {
        // Go to zone center
        const dx = bestZone.x - p.x;
        const dy = bestZone.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.5) { // If not inside, pull towards it
            return { x: dx / dist, y: dy / dist };
        }
        // If inside, maybe small wiggle to stay centered? Or zero.
        return { x: dx, y: dy }; // dampens as we get closer
    }
    return { x: 0, y: 0 };
}

function getTrackTarget(state, goal) {
    const track = getMainTrack();
    if (!track || track.length === 0) return null;

    const p = state.player;

    // Find closest index to player
    let pIdx = -1;
    let pDist = Infinity;
    for (let i = 0; i < track.length; i++) {
        const d = distanceTo(p.x, p.y, track[i].x, track[i].y);
        if (d < pDist) {
            pDist = d;
            pIdx = i;
        }
    }

    // Find closest index to goal
    let gIdx = -1;
    let gDist = Infinity;
    for (let i = 0; i < track.length; i++) {
        const d = distanceTo(goal.x, goal.y, track[i].x, track[i].y);
        if (d < gDist) {
            gDist = d;
            gIdx = i;
        }
    }

    // Heuristic: If we are close to the track node (within 1.5 tiles), aim for the NEXT one.
    // Direction: always forward if gIdx > pIdx.
    let targetIdx = pIdx;

    if (gIdx > pIdx) {
        // Moving forward along track
        if (pDist < 1.5) targetIdx = Math.min(pIdx + 1, gIdx);
        else targetIdx = pIdx; // Getting back to track

        // Lookahead: if smooth, maybe +2?
        if (targetIdx < gIdx && distanceTo(p.x, p.y, track[targetIdx].x, track[targetIdx].y) < 2.0) {
            targetIdx = Math.min(targetIdx + 1, gIdx);
        }
    } else if (gIdx < pIdx) {
        // Moving backward (backtracking)
        if (pDist < 1.5) targetIdx = Math.max(pIdx - 1, gIdx);
        else targetIdx = pIdx;
    } else {
        // We are at the segment closest to goal.
        return track[targetIdx];
    }
}

function steerToward(state, goal) {
    if (!goal) return;
    const p = state.player;
    const inp = state.ai.input;
    const elapsed = state.time.elapsed || 0;
    const dt = state.time.dt != null ? state.time.dt : (1 / 60);

    // ── 0. Stuck Recovery (Universal) ──
    const isCombat = goal.type === 'enemy' || goal.action === 'fire';

    // Check if we are in backup mode
    const inBackupMode = state.ai._backUpUntil != null && elapsed < state.ai._backUpUntil;
    if (inBackupMode) {
        // Panic Backup: Move back and wiggle to dislodge
        inp.moveBack = true;
        inp.moveForward = false;
        const wiggle = Math.floor(elapsed / 0.25) % 2;
        inp.strafeLeft = wiggle === 0;
        inp.strafeRight = wiggle === 1;

        // If in combat, look at enemy; else look at path target
        let target = null;
        if (isCombat) {
            target = { x: goal.x, y: goal.y };
        } else {
            target = goal.door ? { x: goal.door.cx, y: goal.door.cy } : { x: goal.x, y: goal.y };
        }

        const wantAngle = angleTo(p.x, p.y, target.x, target.y);
        const angleDiff = normalizeAngle(wantAngle - p.angle);
        inp.lookDX = angleDiff * TURN_GAIN;
        inp.lookDY = 0;
        return;
    }

    // Physical Stuck Check: Are we failing to move despite inputs?
    // We run this for BOTH combat and navigation.
    const CHECK_INTERVAL = 0.5;
    if (!state.ai._lastPosCheckTime) state.ai._lastPosCheckTime = elapsed;
    if (elapsed - state.ai._lastPosCheckTime > CHECK_INTERVAL) {
        const lastPos = state.ai._lastPos || { x: p.x, y: p.y };
        const distMoved = distanceTo(p.x, p.y, lastPos.x, lastPos.y);

        // Threshold: 0.1 tiles in 0.5s is very slow (stuck)
        // Only trigger if we aren't already very close to the goal (nav) or holding position (intentional stop)
        // For combat, we usually strafe, so we SHOULD be moving.

        let isIntentionallyStopped = false;
        if (state.ai.input && !state.ai.input.moveForward && !state.ai.input.moveBack && !state.ai.input.strafeLeft && !state.ai.input.strafeRight) {
            isIntentionallyStopped = true;
        }

        // If we are commanding movement but not moving -> Stuck
        // For combat, we expect higher mobility, so threshold is higher (0.15 tiles)
        const STUCK_DIST_THRESH = isCombat ? 0.25 : 0.1;

        if (!isIntentionallyStopped && distMoved < STUCK_DIST_THRESH) {
            state.ai._stuckTimer = (state.ai._stuckTimer || 0) + CHECK_INTERVAL;
            if (state.ai._stuckTimer > 1.0) { // 1 sec stuck -> Panic
                invalidatePathCache();
                state.ai._backUpUntil = elapsed + BACKUP_DURATION;
                state.ai._stuckTimer = 0;
                // console.log('[AI] IMPACT STUCK — stationary for >1s, backing up' + (isCombat ? ' (COMBAT)' : ''));
            }
        } else {
            state.ai._stuckTimer = 0;
        }

        state.ai._lastPos = { x: p.x, y: p.y };
        state.ai._lastPosCheckTime = elapsed;
    }

    if (!isCombat) {
        // Nav-specific "No Progress" logic (Distance to goal) -> Already handled by Physical Stuck Check largely,
        // but kept for "looping" stucks where we move but don't get closer?
        // Actually, the previous 'No Progress' check (distance based) is good for that.
        // Let's keep the Null Path check here.

        // Stuck detection (null path)
        if (state.ai._pathWasNull && !isInteractGoal(goal)) {
            state.ai._nullPathTime = (state.ai._nullPathTime || 0) + dt;
            if (state.ai._nullPathTime >= NULL_PATH_STUCK_THRESHOLD) {
                invalidatePathCache();
                const replans = (state.ai._replanCount || 0) + 1;
                state.ai._replanCount = replans;
                const backupLen = replans >= REPLAN_COUNT_FOR_EXTRA_BACKUP ? BACKUP_DURATION_EXTRA : BACKUP_DURATION;
                state.ai._backUpUntil = elapsed + backupLen;
                state.ai._nullPathTime = 0;
            }
        } else {
            state.ai._nullPathTime = 0;
        }
    }

    // ── 1. Calculate Control Vectors ──

    // A. Flow (Path Following)
    const path = getPathToGoal(state, goal);
    let flow = getFlowVector(path, p);

    // B. Avoidance (Wall Repulsion)
    const avoid = getAvoidanceVector(p);

    // C. Combat Spacing or Boss Zone
    const isBoss = goal.entity && goal.entity.type === 'BOSS';
    let combat = { x: 0, y: 0 };

    if (isCombat) {
        if (isBoss) {
            // override combat spacing with Boss Zone logic
            combat = getBossZoneVector(p);
            // disable flow for boss fight (we want to stick to zones, not path)
            flow = { x: 0, y: 0 };
        } else {
            combat = getCombatVector(p, goal);
        }
    }

    // ── 2. Combine Vectors (Weighted Sum) ──
    const W_FLOW = 1.0;
    const W_AVOID = 2.0; // Stronger avoidance
    const W_COMBAT = isBoss ? 2.5 : 0.8; // Strong pull to zones for boss

    let moveX = flow.x * W_FLOW + avoid.x * W_AVOID + combat.x * W_COMBAT;
    let moveY = flow.y * W_FLOW + avoid.y * W_AVOID + combat.y * W_COMBAT;

    // Normalize final movement vector
    const len = Math.sqrt(moveX * moveX + moveY * moveY);
    if (len > 0.001) {
        moveX /= len;
        moveY /= len;
    } else {
        moveX = 0; moveY = 0;
    }

    // ── 3. Interaction Override ──
    // If interact goal and VERY close, stop context steering and just align to Interact
    if (isInteractGoal(goal) && distanceTo(p.x, p.y, goal.x, goal.y) < 1.0) {
        moveX = 0; moveY = 0; // Stop moving, just aim

        // Exact aim for interaction
        const tx = goal.door ? goal.door.cx : goal.x;
        const ty = goal.door ? goal.door.cy : goal.y;
        const wantAngle = angleTo(p.x, p.y, tx, ty);
        const angleDiff = normalizeAngle(wantAngle - p.angle);

        // Turn to target
        let lookDX = (angleDiff * TURN_GAIN) / MOUSE_SENSITIVITY;
        lookDX = Math.max(-LOOK_DX_MAX, Math.min(LOOK_DX_MAX, lookDX));
        inp.lookDX = lookDX;
        inp.lookDY = 0;

        // Stop movement
        inp.moveForward = false;
        inp.moveBack = false;
        inp.strafeLeft = false;
        inp.strafeRight = false;
        return;
    }

    // ── 4. Apply to Inputs ──

    // A. Aiming (Look where we are going OR at enemy)
    let lookTargetX = p.x + moveX;
    let lookTargetY = p.y + moveY;

    // If in combat, always look at enemy regardless of move direction (strafe support)
    if (goal.type === 'enemy' || goal.action === 'fire') {
        lookTargetX = goal.x;
        lookTargetY = goal.y;
    }
    // If interacting and close, look at interact (covered by override above usually, but flow might push us)
    else if (isInteractGoal(goal)) {
        const tx = goal.door ? goal.door.cx : goal.x;
        const ty = goal.door ? goal.door.cy : goal.y;
        lookTargetX = tx;
        lookTargetY = ty;
    }

    const wantAngleKey = angleTo(p.x, p.y, lookTargetX, lookTargetY);
    const angleDiffKey = normalizeAngle(wantAngleKey - p.angle);

    let lookDX = (angleDiffKey * TURN_GAIN) / MOUSE_SENSITIVITY;
    // Clamp turn speed
    lookDX = Math.max(-LOOK_DX_MAX, Math.min(LOOK_DX_MAX, lookDX));
    inp.lookDX = lookDX;
    inp.lookDY = 0;

    // B. Velocity Projection (Dot Product)
    // Map the absolute world movement vector (moveX, moveY) into local player space (Forward, Right)
    // Forward component = Dot(Move, PlayerDir)
    // Right component = Dot(Move, PlayerRight)
    const pDirX = Math.cos(p.angle);
    const pDirY = Math.sin(p.angle);
    const pRightX = Math.cos(p.angle + Math.PI / 2);
    const pRightY = Math.sin(p.angle + Math.PI / 2);

    const fwdDot = moveX * pDirX + moveY * pDirY;
    const rightDot = moveX * pRightX + moveY * pRightY;

    const thresh = 0.1;
    inp.moveForward = fwdDot > thresh;
    inp.moveBack = fwdDot < -thresh;
    inp.strafeRight = rightDot > thresh;
    inp.strafeLeft = rightDot < -thresh;

    // Debug
    state.ai.telemetry = state.ai.telemetry || {};
    state.ai.telemetry.context = { flow, avoid, combat, final: { x: moveX, y: moveY } };
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
        // Doors: use same wide angle as triggers.js (Math.PI * 0.8) so we actually trigger; strict 30° caused stuck-at-door.
        const angleTolerance = goal.door ? Math.PI * 0.8 : AI_TUNING.interactFacingTolerance;
        if (isInRangeAndFacing(p.x, p.y, p.angle, tx, ty, angleTolerance)) {
            inp.interact = true;
        }
        return;
    }

    if (goal.action === 'fire') {
        const dist = distanceTo(p.x, p.y, goal.x, goal.y);
        const wantAngle = angleTo(p.x, p.y, goal.x, goal.y);
        const aimTolerance = dist <= COMBAT_POINT_BLANK_DIST ? COMBAT_FACING_TOLERANCE_CLOSE : COMBAT_FACING_TOLERANCE;
        const canHit = hasLineOfSight(p.x, p.y, goal.x, goal.y);
        if (canHit && dist <= COMBAT_MAX_RANGE && Math.abs(normalizeAngle(wantAngle - p.angle)) <= aimTolerance) {
            inp.fire = true;
        }

        // Auto-switch to best weapon for boss
        if (goal.entity && goal.entity.type === 'BOSS') {
            const weapons = state.player.weapons || [];
            const vbIndex = weapons.indexOf('VOIDBEAM');
            if (vbIndex !== -1) {
                inp.weaponSlot = vbIndex; // 0-based index for logic, input system usually handles mapping
            }
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

function getCurrentGoalWithLogic(state) {
    // 1. Clear Room First (Phase 4 Logic)
    const roomId = getRoomId(state.player.x, state.player.y);
    // Find enemies in this room that aren't dead
    // state.entities has all ents.
    // simplistic check: if enemy is in current room ID, target it.

    if (state.entities && roomId) {
        let bestEnemy = null;
        let minDist = Infinity;

        for (const e of state.entities) {
            // Target any living entity that isn't the player or an item.
            // Assuming entities with HP > 0 are enemies.
            if (e.hp > 0 && e.type !== 'player') {
                const eRoom = getRoomId(e.x, e.y);
                if (eRoom === roomId) {
                    const d = distanceTo(state.player.x, state.player.y, e.x, e.y);
                    if (d < minDist) {
                        minDist = d;
                        bestEnemy = e;
                    }
                }
            }
        }

        if (bestEnemy) {
            return { type: 'enemy', x: bestEnemy.x, y: bestEnemy.y, entity: bestEnemy, action: 'fire' };
        }
    }

    // 2. Otherwise, follow script
    // Replaces getCurrentGoal(state) call in the update loop? 
    // No, we should call getCurrentGoal(state) which is imported from ai_script.js
    // But we override it here.

    // We need to import getCurrentGoal from ai_script.js? 
    // It's not imported in the provided code snippet unless I missed it.
    // Ah, line 29 of my previous view: `import { ... } from './ai_script.js'`.
    // Wait, `getCurrentGoal` was NOT in the imports list I wrote above.
    // I need to check `ai.js` imports again.
    // Ah, `getCurrentGoal` was not imported in my `write_to_file` block above. I need to add it.

    return getCurrentGoal(state);
}

/**
 * Update AI. When active, sets state.ai.input and state.ai.telemetry.
 */
export function update(state) {
    if (!state.ai.active) {
        // console.log('AI inactive'); // minimal spam
        return;
    }

    const inp = state.ai.input;
    resetAiInput(inp);

    // DEBUG: Print current goal
    // let goal = getCurrentGoalWithLogic(state);
    // console.log('AI Update. Goal:', goal); 

    // Sticky enter_room etc... (Keep existing logic)
    const room = getRoomId(state.player.x, state.player.y);
    if (room) {
        if (!state.ai._enteredRoomAt) state.ai._enteredRoomAt = {};
        state.ai._enteredRoomAt[room] = state.time.elapsed || 0;
    }

    const stepIndex = getEffectiveCurrentStepIndex(state);
    state.ai._effectiveStepIndex = stepIndex;
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

    // High-Level Logic Selection
    let goal = getCurrentGoalWithLogic(state);
    if (Math.random() < 0.01) console.log('[AI DEBUG] Goal:', goal); // Throttled log

    // Last Known position logic (enemy tracking)
    if (goal && (goal.type === 'enemy' || goal.action === 'fire')) {
        const haveLOS = hasLineOfSight(state.player.x, state.player.y, goal.x, goal.y);
        if (haveLOS) {
            state.ai._lastKnownEnemyPos = null;
        } else {
            if (!state.ai._lastKnownEnemyPos) state.ai._lastKnownEnemyPos = { x: goal.x, y: goal.y };
            // If we lost LOS, go to last known position (Hunt)
            goal = { type: 'waypoint', x: state.ai._lastKnownEnemyPos.x, y: state.ai._lastKnownEnemyPos.y };
        }
    }

    // Door stuck logic...
    if (goal && goal.type === 'door' && goal.door) {
        const dist = distanceTo(state.player.x, state.player.y, goal.door.cx, goal.door.cy);
        const inRange = dist <= INTERACTION_RANGE;
        const facing = inRange && isInRangeAndFacing(state.player.x, state.player.y, state.player.angle, goal.door.cx, goal.door.cy, AI_TUNING.interactFacingTolerance);
        const elapsed = state.time.elapsed || 0;
        if (inRange && facing) {
            if (state.ai._atDoorSince == null) state.ai._atDoorSince = elapsed;
            if (goal.door.openProgress < 1 && (elapsed - state.ai._atDoorSince) >= DOOR_STUCK_TIME) {
                invalidatePathCache();
                state.ai._atDoorSince = null;
                state.ai._doorAttemptCount = (state.ai._doorAttemptCount || 0) + 1;
                const backupLen = state.ai._doorAttemptCount >= REPLAN_COUNT_FOR_EXTRA_BACKUP ? BACKUP_DURATION_EXTRA : BACKUP_DURATION;
                state.ai._backUpUntil = elapsed + backupLen;
                state.ai._replanCount = (state.ai._replanCount || 0) + 1;
                // console.log('[AI] REPLAN — stuck at door...');
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

    // Telemetry updates...
    // Only minimal debug for performance/cleanliness
    state.ai.telemetry = {
        state: goal ? goal.type : 'idle',
        confidence: goal ? 1 : 0,
        ...state.ai.telemetry
    };
} // End update
