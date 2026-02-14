/**
 * ai.js — AI Autopilot System
 *
 * Takes control when the player is idle (~5s). Navigates, fights, opens doors,
 * collects pickups. Feeds synthetic input into player.update().
 *
 * Sections (for navigation):
 * - Waypoint graph + BFS room pathfinding
 * - AI state + action queue
 * - Utility (angleTo, distanceTo, hasLineOfSight, isPathBlocked)
 * - Combat (target scoring, weapon policy, positioning, projectile dodge)
 * - Doors (findNearbyClosedDoorForAI, door intent)
 * - Tile A* pathfinding (buildAStarPath, followTilePath, validatePathAhead)
 * - Steering (steerTowardPoint, avoidance, navigateToRoom, moveAlongWaypointPath)
 * - State machine (sense, chooseRequestedState, transitionState, plan, act)
 * - Main update (export update)
 */

import {
    isSolid, getTile, getRoomId, ROOM_BOUNDS, doors,
    PICKUP_POSITIONS, INTERACTABLE_POSITIONS,
} from './map.js';
import { TILE, INTERACTION_RANGE, PLAYER_SPEED } from './config.js';
import { getObjectiveHintsForAI, getCurrentObjectiveTask, getOrderedUnmetTasks, recordTaskFailure, getTaskFailure } from './objectives.js';
import { angleTo, distanceTo, normalizeAngle } from './utils.js';

// ── Waypoint Graph (room centers) ───────────────────────────────────
// Each node is a room center; edges are direct connections via hallways.

const WAYPOINT_GRAPH = {
    area0:        { x: 5,  y: 5,  neighbors: ['area1'] },
    area1:        { x: 19, y: 8,  neighbors: ['area0', 'a2r1'] },
    a2r1:         { x: 19, y: 24, neighbors: ['area1', 'a2r2', 'a2r3'] },
    a2r2:         { x: 6,  y: 27, neighbors: ['a2r1'] },
    a2r3:         { x: 19, y: 36, neighbors: ['a2r1', 'a2r4', 'a2r5'] },
    a2r4:         { x: 32, y: 36, neighbors: ['a2r3'] },
    a2r5:         { x: 19, y: 48, neighbors: ['a2r3', 'bossCorridor'] },
    bossCorridor: { x: 19, y: 56, neighbors: ['a2r5', 'area3'] },
    area3:        { x: 19, y: 66, neighbors: ['bossCorridor'] },
};

const AI_STATE = {
    EXPLORE: 'explore',
    COMBAT: 'combat',
    OBJECTIVE: 'objective',
    RECOVER: 'recover',
    INTERACT: 'interact',
};

const AI_STATE_LOCK_SECONDS = {
    [AI_STATE.EXPLORE]: 0.25,
    [AI_STATE.COMBAT]: 0.35,
    [AI_STATE.OBJECTIVE]: 0.35,
    [AI_STATE.RECOVER]: 0.2,
    [AI_STATE.INTERACT]: 0.15,
};

/** Single place for AI behavior tuning. Adjust here for balance and regression tests. */
export const AI_TUNING = {
    doorIntentRetrySeconds: 2.4,
    doorIntentMaxAttempts: 5,
    stallThresholdSeconds: 1.25,
    progressEpsilon: 0.02,
    routeCheckpointLookahead: 4,
    routeProgressDegradedSeconds: 0.45,
    combatOptimalRange: 3.5,
    combatMaxRange: 15,
    combatKiteProjectileCount: 2,
    combatKiteDistance: 2.0,
    combatPushEnemyHpFrac: 0.4,
    combatPushRangeMin: 2,
    combatPushRangeMax: 6,
    projectileDodgeRange: 8,
    projectileHeadingTolerance: 0.6,
    assistHintCooldown: 15,
};

const DOOR_INTENT_RETRY_SECONDS = AI_TUNING.doorIntentRetrySeconds;
const DOOR_INTENT_MAX_ATTEMPTS = AI_TUNING.doorIntentMaxAttempts;
const AI_STALL_THRESHOLD_SECONDS = AI_TUNING.stallThresholdSeconds;
const AI_PROGRESS_EPSILON = AI_TUNING.progressEpsilon;
const ROUTE_CHECKPOINT_LOOKAHEAD = AI_TUNING.routeCheckpointLookahead;
const ROUTE_PROGRESS_DEGRADED_SECONDS = AI_TUNING.routeProgressDegradedSeconds;

// We'll update waypoint positions from ROOM_BOUNDS at init
for (const [id, wp] of Object.entries(WAYPOINT_GRAPH)) {
    const bounds = ROOM_BOUNDS[id];
    if (bounds) {
        wp.x = bounds.x + bounds.w / 2;
        wp.y = bounds.y + bounds.h / 2;
    }
}

// ── BFS Pathfinding on Waypoint Graph ───────────────────────────────

function findPath(fromRoom, toRoom) {
    if (fromRoom === toRoom) return [toRoom];
    if (!WAYPOINT_GRAPH[fromRoom] || !WAYPOINT_GRAPH[toRoom]) return null;

    const visited = new Set([fromRoom]);
    const queue = [[fromRoom]];

    while (queue.length > 0) {
        const path = queue.shift();
        const current = path[path.length - 1];
        const node = WAYPOINT_GRAPH[current];
        if (!node) continue;

        for (const neighbor of node.neighbors) {
            if (visited.has(neighbor)) continue;
            visited.add(neighbor);

            const newPath = [...path, neighbor];
            if (neighbor === toRoom) return newPath;
            queue.push(newPath);
        }
    }

    return null; // no path found
}

// ── AI State ────────────────────────────────────────────────────────

let aiTarget = null;            // Current room target
let aiPath = [];                // Waypoint path (room IDs)
let aiPathIndex = 0;
let aiWanderTimer = 0;
let aiInteractCooldown = 0;
let aiFireCooldown = 0;
let aiWeaponSwitchCooldown = 0;
let aiStuckTimer = 0;
let aiLastPos = { x: 0, y: 0 };
let aiVisitedRooms = new Set();
let aiState = AI_STATE.EXPLORE;
let aiStateTimer = 0;
let aiDoorIntent = {
    key: null,
    retryTimer: 0,
    attempts: 0,
};
let aiProgress = {
    goalKey: null,
    lastDist: Infinity,
    stagnantTimer: 0,
};
let aiTilePath = [];
let aiTilePathIndex = 0;
let aiTilePathGoalKey = null;
let aiAvoidance = {
    mode: null, // 'wall_hug' | 'corner_escape' | null
    timer: 0,
    dir: 1,     // -1 left, +1 right
};
let aiRouteProgress = {
    lastDistToNode: Infinity,
    degradedTimer: 0,
};
const AI_ASSIST_HINT_COOLDOWN = AI_TUNING.assistHintCooldown;
let aiLastAssistHintAt = -999; // seconds (state.time.elapsed) when we last showed the stuck hint
let aiRecoveryGraceUntil = 0; // don't count as stuck for this many seconds after leaving RECOVER
let aiReplanCount = 0;

function resetAiOutput(out) {
    out.moveForward = false;
    out.moveBack = false;
    out.strafeLeft = false;
    out.strafeRight = false;
    out.lookDX = 0;
    out.lookDY = 0;
    out.fire = false;
    out.interact = false;
    out.weaponSlot = null;
}

function createActionQueue(output) {
    const intent = {
        moveForward: false,
        moveBack: false,
        strafeLeft: false,
        strafeRight: false,
        lookDX: 0,
        lookDY: 0,
        fire: false,
        interact: false,
        weaponSlot: null,
        lastFB: null,
        lastStrafe: null,
    };

    function resolve() {
        if (intent.moveForward && intent.moveBack) {
            if (intent.lastFB === 'forward') intent.moveBack = false;
            else intent.moveForward = false;
        }
        if (intent.strafeLeft && intent.strafeRight) {
            if (intent.lastStrafe === 'left') intent.strafeRight = false;
            else intent.strafeLeft = false;
        }

        output.moveForward = intent.moveForward;
        output.moveBack = intent.moveBack;
        output.strafeLeft = intent.strafeLeft;
        output.strafeRight = intent.strafeRight;
        output.lookDX = intent.lookDX;
        output.lookDY = intent.lookDY;
        output.fire = intent.fire;
        output.interact = intent.interact;
        output.weaponSlot = intent.weaponSlot;
    }

    return new Proxy(intent, {
        get(target, prop) {
            return target[prop];
        },
        set(target, prop, value) {
            switch (prop) {
                case 'moveForward':
                    target.moveForward = !!value;
                    if (value) target.lastFB = 'forward';
                    break;
                case 'moveBack':
                    target.moveBack = !!value;
                    if (value) target.lastFB = 'back';
                    break;
                case 'strafeLeft':
                    target.strafeLeft = !!value;
                    if (value) target.lastStrafe = 'left';
                    break;
                case 'strafeRight':
                    target.strafeRight = !!value;
                    if (value) target.lastStrafe = 'right';
                    break;
                case 'lookDX':
                    if (Math.abs(value) >= Math.abs(target.lookDX)) {
                        target.lookDX = Number(value) || 0;
                    }
                    break;
                case 'lookDY':
                    if (Math.abs(value) >= Math.abs(target.lookDY)) {
                        target.lookDY = Number(value) || 0;
                    }
                    break;
                case 'fire':
                    target.fire = target.fire || !!value;
                    break;
                case 'interact':
                    target.interact = target.interact || !!value;
                    break;
                case 'weaponSlot':
                    if (value !== null && value !== undefined && value > 0) {
                        target.weaponSlot = value;
                    }
                    break;
                default:
                    target[prop] = value;
                    break;
            }
            resolve();
            return true;
        },
    });
}

// ── Utility (angleTo, distanceTo, normalizeAngle from utils.js) ───────

/**
 * Simple line-of-sight check: step along the ray from (x1,y1) to (x2,y2).
 * Returns true if no solid tile blocks the path.
 */
function hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) return true;

    const steps = Math.ceil(dist * 3); // check every ~0.33 tiles
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const cx = x1 + dx * t;
        const cy = y1 + dy * t;
        if (isSolid(cx, cy)) return false;
    }
    return true;
}

/**
 * Check if moving forward from current position is blocked by a wall.
 * Looks a short distance ahead along the given angle.
 */
function isPathBlocked(x, y, angle, distance) {
    const checkDist = Math.min(distance, 1.5);
    const cx = x + Math.cos(angle) * checkDist;
    const cy = y + Math.sin(angle) * checkDist;
    return isSolid(cx, cy);
}

/** Find the nearest alive entity visible from the player position (with LOS check) */
function findNearestEnemy(state) {
    const { player, entities } = state;
    let best = null;
    let bestDist = Infinity;

    for (const e of entities) {
        if (e.aggroState === 'dead' || e.hp <= 0) continue;
        const dist = distanceTo(player.x, player.y, e.x, e.y);
        if (dist < 15 && dist < bestDist) {
            if (hasLineOfSight(player.x, player.y, e.x, e.y)) {
                bestDist = dist;
                best = e;
            }
        }
    }
    return best ? { entity: best, distance: bestDist } : null;
}

const COMBAT_OPTIMAL_RANGE = AI_TUNING.combatOptimalRange;
const COMBAT_MAX_RANGE = AI_TUNING.combatMaxRange;
const COMBAT_KITE_PROJECTILE_COUNT = AI_TUNING.combatKiteProjectileCount;
const COMBAT_KITE_DISTANCE = AI_TUNING.combatKiteDistance;
const COMBAT_PUSH_ENEMY_HP_FRAC = AI_TUNING.combatPushEnemyHpFrac;
const COMBAT_PUSH_RANGE_MIN = AI_TUNING.combatPushRangeMin;
const COMBAT_PUSH_RANGE_MAX = AI_TUNING.combatPushRangeMax;
const PROJECTILE_DODGE_RANGE = AI_TUNING.projectileDodgeRange;
const PROJECTILE_HEADING_TOLERANCE = AI_TUNING.projectileHeadingTolerance;

/** Score a candidate combat target (higher = better). Uses distance, LOS, threat, objective relevance. */
function scoreCombatTarget(state, entity, distance, currentRoom, objectiveId) {
    if (entity.aggroState === 'dead' || entity.hp <= 0) return -1;
    if (!hasLineOfSight(state.player.x, state.player.y, entity.x, entity.y)) return -1;
    if (distance > COMBAT_MAX_RANGE) return -1;

    let score = 100;

    // Distance: prefer optimal range for guns (2–5)
    const rangeScore = 50 / (1 + Math.abs(distance - COMBAT_OPTIMAL_RANGE));
    score += rangeScore;

    // Threat: closer = more dangerous, prioritize
    if (distance < 4) score += 20;
    if (entity.aggroState === 'aggro') score += 15;

    // Finish low-HP targets first
    if (entity.maxHp > 0 && entity.hp < entity.maxHp * 0.4) score += 25;

    // Objective relevance: clear path to button or boss
    if (objectiveId === 'use-button' && entity.roomId === 'area1') score += 30;
    if (objectiveId === 'voidbeam-light-zone' && entity.type === 'BOSS') score += 40;
    if (objectiveId && entity.roomId === currentRoom) score += 10;

    return score;
}

/** Pick best combat target by score (distance, LOS, threat, objective relevance). */
function pickBestCombatTarget(state) {
    const { player, entities } = state;
    const currentRoom = getRoomId(player.x, player.y) || 'area0';
    const objectiveId = getCurrentObjectiveId(state);

    let best = null;
    let bestScore = -1;
    let bestDist = Infinity;

    for (const e of entities) {
        if (e.aggroState === 'dead' || e.hp <= 0) continue;
        const dist = distanceTo(player.x, player.y, e.x, e.y);
        if (dist > COMBAT_MAX_RANGE) continue;
        const score = scoreCombatTarget(state, e, dist, currentRoom, objectiveId);
        if (score > bestScore || (score === bestScore && dist < bestDist)) {
            bestScore = score;
            best = e;
            bestDist = dist;
        }
    }
    return best ? { entity: best, distance: bestDist } : null;
}

function findNearestEnemyInRoom(state, roomId) {
    if (!roomId) return null;
    const { player, entities } = state;
    let best = null;
    let bestDist = Infinity;
    for (const e of entities) {
        if (e.aggroState === 'dead' || e.hp <= 0) continue;
        if (e.roomId !== roomId) continue;
        const dist = distanceTo(player.x, player.y, e.x, e.y);
        if (dist < bestDist) {
            bestDist = dist;
            best = e;
        }
    }
    return best ? { entity: best, distance: bestDist } : null;
}

/** Find nearest uncollected pickup */
function findNearestPickup(state) {
    const { player, pickups } = state;
    let best = null;
    let bestDist = Infinity;

    for (const pk of pickups) {
        if (pk.collected) continue;
        const dist = distanceTo(player.x, player.y, pk.x, pk.y);
        if (dist < 15 && dist < bestDist) {
            bestDist = dist;
            best = pk;
        }
    }
    return best ? { pickup: best, distance: bestDist } : null;
}

/**
 * Weapon policy by range and context. Boss fight: use Void Beam only when on a light well (objective voidbeam-light-zone).
 * Otherwise: FIST point-blank, SHOTGUN short, HANDGUN medium, VOIDBEAM long or boss-on-well.
 */
/** Perpendicular dodge: pick left or right to move away from the most threatening projectile's lane. */
function getBestProjectileDodge(state) {
    const { player, projectiles } = state;
    if (!projectiles || projectiles.length === 0) return null;

    let bestDodge = null;
    let bestThreat = 0;

    for (const p of projectiles) {
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > PROJECTILE_DODGE_RANGE || dist < 0.3) continue;

        const vx = Math.cos(p.angle) * (p.speed || 2);
        const vy = Math.sin(p.angle) * (p.speed || 2);
        const norm = Math.sqrt(dx * dx + dy * dy) || 1;
        const dot = (dx * vx + dy * vy) / (norm * (Math.sqrt(vx * vx + vy * vy) || 1));
        if (dot < PROJECTILE_HEADING_TOLERANCE) continue; // not heading toward player

        const cross = dx * vy - dy * vx;
        const dodge = cross > 0 ? 'left' : 'right';
        const threat = 1 / (1 + dist);
        if (threat > bestThreat) {
            bestThreat = threat;
            bestDodge = dodge;
        }
    }
    return bestDodge;
}

/** Combat positioning: kite (low safety), push (advantage), or peek (default). */
function getCombatPositioning(state, entity, distance) {
    const projectileCount = (state.projectiles && state.projectiles.length) || 0;
    const lowSafety = projectileCount >= COMBAT_KITE_PROJECTILE_COUNT || distance < COMBAT_KITE_DISTANCE;
    if (lowSafety) return 'kite';

    const enemyLowHp = entity.maxHp > 0 && entity.hp < entity.maxHp * COMBAT_PUSH_ENEMY_HP_FRAC;
    const inPushRange = distance >= COMBAT_PUSH_RANGE_MIN && distance <= COMBAT_PUSH_RANGE_MAX;
    if (enemyLowHp && inPushRange) return 'push';

    return 'peek';
}

function chooseBestWeapon(state, distance, context = {}) {
    const weapons = state.player.weapons;
    const { enemyType, objectiveId } = context;
    const standingTile = getTile(Math.floor(state.player.x), Math.floor(state.player.y));
    const onLightWell = standingTile === TILE.LIGHT_WELL;

    // Boss-specific: Void Beam only when on light well for voidbeam-light-zone objective
    if (enemyType === 'BOSS' && objectiveId === 'voidbeam-light-zone') {
        if (onLightWell && weapons.includes('VOIDBEAM')) return 'VOIDBEAM';
        // Not on well yet: keep sidearm for self-defense while moving to well
        if (distance < 5 && weapons.includes('SHOTGUN')) return 'SHOTGUN';
        if (weapons.includes('HANDGUN')) return 'HANDGUN';
        return 'FIST';
    }

    // Normal combat by range
    if (distance < 1.5 && weapons.includes('FIST')) return 'FIST';
    if (distance >= 1.5 && distance < 5 && weapons.includes('SHOTGUN')) return 'SHOTGUN';
    if (distance >= 5 && distance < 10 && weapons.includes('HANDGUN')) return 'HANDGUN';
    if (distance >= 10 && weapons.includes('VOIDBEAM')) return 'VOIDBEAM';
    if (weapons.includes('VOIDBEAM')) return 'VOIDBEAM';
    if (weapons.includes('HANDGUN')) return 'HANDGUN';
    return 'FIST';
}

/** Choose next exploration target (unvisited or enemy-containing room) */
function chooseExplorationTarget(state) {
    const currentRoom = getRoomId(state.player.x, state.player.y) || 'area0';

    // Priority: rooms with alive enemies
    for (const roomId of Object.keys(WAYPOINT_GRAPH)) {
        if (roomId === currentRoom) continue;
        const hasAlive = state.entities.some(e => e.roomId === roomId && e.hp > 0);
        if (hasAlive) {
            const path = findPath(currentRoom, roomId);
            if (path) return { roomId, path };
        }
    }

    // Then: unvisited rooms
    for (const roomId of Object.keys(WAYPOINT_GRAPH)) {
        if (aiVisitedRooms.has(roomId)) continue;
        const path = findPath(currentRoom, roomId);
        if (path) return { roomId, path };
    }

    // All visited: random room
    const roomIds = Object.keys(WAYPOINT_GRAPH);
    const randomRoom = roomIds[Math.floor(Math.random() * roomIds.length)];
    const path = findPath(currentRoom, randomRoom);
    if (path) return { roomId: randomRoom, path };

    return null;
}

function findNearbyClosedDoorForAI(state) {
    const px = state.player.x;
    const py = state.player.y;
    let best = null;
    let bestDist = Infinity;

    for (const key in doors) {
        const door = doors[key];
        if (!door || door.open || door.opening) continue;
        const dx = door.x + 0.5 - px;
        const dy = door.y + 0.5 - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > INTERACTION_RANGE + 1.5) continue;
        if (dist < bestDist) {
            bestDist = dist;
            best = { door, key, dist };
        }
    }
    return best;
}

function clearDoorIntent() {
    aiDoorIntent.key = null;
    aiDoorIntent.retryTimer = 0;
    aiDoorIntent.attempts = 0;
}

function setDoorIntentFromEntry(entry) {
    if (!entry || !entry.key) return;
    if (aiDoorIntent.key !== entry.key) {
        aiDoorIntent.key = entry.key;
        aiDoorIntent.retryTimer = DOOR_INTENT_RETRY_SECONDS;
        aiDoorIntent.attempts = 0;
        return;
    }
    aiDoorIntent.retryTimer = Math.max(aiDoorIntent.retryTimer, DOOR_INTENT_RETRY_SECONDS);
}

function getDoorIntentEntry() {
    if (!aiDoorIntent.key) return null;
    const door = doors[aiDoorIntent.key];
    if (!door || door.open || door.opening) {
        clearDoorIntent();
        return null;
    }
    return { key: aiDoorIntent.key, door };
}

function clearGoalProgress() {
    aiProgress.goalKey = null;
    aiProgress.lastDist = Infinity;
    aiProgress.stagnantTimer = 0;
}

function trackGoalProgress(player, goalKey, tx, ty, dt) {
    const dist = distanceTo(player.x, player.y, tx, ty);
    if (!goalKey) {
        return { dist, stalled: false };
    }

    if (aiProgress.goalKey !== goalKey) {
        aiProgress.goalKey = goalKey;
        aiProgress.lastDist = dist;
        aiProgress.stagnantTimer = 0;
        return { dist, stalled: false };
    }

    const improvement = aiProgress.lastDist - dist;
    if (improvement > AI_PROGRESS_EPSILON) {
        aiProgress.stagnantTimer = Math.max(0, aiProgress.stagnantTimer - dt * 1.5);
    } else {
        aiProgress.stagnantTimer += dt;
    }
    aiProgress.lastDist = dist;

    return { dist, stalled: aiProgress.stagnantTimer > AI_STALL_THRESHOLD_SECONDS };
}

function resetTilePath(goalKey = null) {
    aiTilePath = [];
    aiTilePathIndex = 0;
    aiTilePathGoalKey = goalKey;
    aiRouteProgress.lastDistToNode = Infinity;
    aiRouteProgress.degradedTimer = 0;
    aiReplanCount++;
}

function heuristic(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
}

function isPathWalkableTile(x, y) {
    const tile = getTile(x, y);
    if (tile === TILE.WALL || tile === TILE.SECRET_WALL) return false;
    return true;
}

/** Returns false if any of the next LOOKAHEAD path nodes are no longer walkable (e.g. door closed). */
function validatePathAhead(path, startIndex) {
    if (!path.length || startIndex >= path.length) return true;
    const end = Math.min(startIndex + ROUTE_CHECKPOINT_LOOKAHEAD, path.length);
    for (let i = startIndex; i < end; i++) {
        const node = path[i];
        const tx = Math.floor(node.x);
        const ty = Math.floor(node.y);
        if (!isPathWalkableTile(tx, ty)) return false;
    }
    return true;
}

function getTraversalCost(state, x, y, goalX, goalY, options = {}) {
    const tile = getTile(x, y);
    let cost = 1;

    // Closed doors are traversable but expensive so AI prefers clear lanes.
    if (tile === TILE.DOOR || tile === TILE.DOOR_LOCKED_BUTTON || tile === TILE.DOOR_LOCKED_KEY) {
        const door = doors[`${x},${y}`];
        if (door && door.openProgress < 1) {
            cost += options.doorPenalty ?? 1.2;
        }
    }

    const cx = x + 0.5;
    const cy = y + 0.5;

    if (options.avoidProjectiles) {
        for (const p of state.projectiles) {
            const d = distanceTo(cx, cy, p.x, p.y);
            if (d < 1.0) cost += (1.0 - d) * 2.8;
            else if (d < 2.0) cost += (2.0 - d) * 0.45;
        }
    }

    if (options.avoidEnemies) {
        for (const e of state.entities) {
            if (e.hp <= 0 || e.aggroState === 'dead') continue;
            const d = distanceTo(cx, cy, e.x, e.y);
            if (d < 1.4) cost += (1.4 - d) * 1.8;
            else if (d < 2.6) cost += (2.6 - d) * 0.35;
        }
    }

    // Tiny goal attraction to avoid needless side wandering in equal-cost regions.
    const goalDist = heuristic(x, y, goalX, goalY);
    cost += goalDist * 0.002;

    return cost;
}

function buildAStarPath(state, startX, startY, goalX, goalY, options = {}) {
    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    const gx = Math.floor(goalX);
    const gy = Math.floor(goalY);
    if (sx === gx && sy === gy) return [{ x: gx + 0.5, y: gy + 0.5 }];

    const open = [{ x: sx, y: sy, g: 0, f: heuristic(sx, sy, gx, gy) }];
    const gScore = new Map([[`${sx},${sy}`, 0]]);
    const came = new Map();
    const closed = new Set();
    const MAX_EXPANSIONS = 1400;
    let expansions = 0;

    while (open.length > 0 && expansions < MAX_EXPANSIONS) {
        open.sort((a, b) => a.f - b.f);
        const current = open.shift();
        const cKey = `${current.x},${current.y}`;
        if (closed.has(cKey)) continue;
        closed.add(cKey);
        expansions++;

        if (current.x === gx && current.y === gy) {
            const pathTiles = [];
            let walkKey = cKey;
            while (walkKey) {
                const [px, py] = walkKey.split(',').map(Number);
                pathTiles.push({ x: px + 0.5, y: py + 0.5 });
                walkKey = came.get(walkKey);
            }
            pathTiles.reverse();
            return pathTiles;
        }

        const neighbors = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 },
        ];

        for (const n of neighbors) {
            const nKey = `${n.x},${n.y}`;
            if (closed.has(nKey)) continue;
            if (!isPathWalkableTile(n.x, n.y)) continue;

            const stepCost = getTraversalCost(state, n.x, n.y, gx, gy, options);
            const tentativeG = (gScore.get(cKey) ?? Infinity) + stepCost;
            if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
                came.set(nKey, cKey);
                gScore.set(nKey, tentativeG);
                open.push({
                    x: n.x,
                    y: n.y,
                    g: tentativeG,
                    f: tentativeG + heuristic(n.x, n.y, gx, gy),
                });
            }
        }
    }

    return null;
}

function ensureTilePath(state, goalKey, fromX, fromY, toX, toY, options = {}) {
    if (aiTilePathGoalKey !== goalKey || aiTilePath.length === 0 || aiTilePathIndex >= aiTilePath.length) {
        aiTilePathGoalKey = goalKey;
        aiTilePathIndex = 0;
        aiTilePath = buildAStarPath(state, fromX, fromY, toX, toY, options) || [];
        if (aiTilePath.length > 0) aiReplanCount++;
    }
}

function followTilePath(state, ai, player, dt, goalKey, targetX, targetY, options = {}) {
    ensureTilePath(state, goalKey, player.x, player.y, targetX, targetY, options);
    if (aiTilePath.length === 0) {
        aiRouteProgress.lastDistToNode = Infinity;
        aiRouteProgress.degradedTimer = 0;
        const steer = steerTowardPoint(ai, player, targetX, targetY, dt, goalKey);
        return { reached: steer.dist < 0.8, stalled: steer.stalled };
    }

    while (aiTilePathIndex < aiTilePath.length - 1) {
        const node = aiTilePath[aiTilePathIndex];
        if (distanceTo(player.x, player.y, node.x, node.y) < 0.45) aiTilePathIndex++;
        else break;
    }

    // Early replan: next nodes blocked (e.g. door closed) or progress degraded
    if (!validatePathAhead(aiTilePath, aiTilePathIndex)) {
        resetTilePath(goalKey);
        ensureTilePath(state, goalKey, player.x, player.y, targetX, targetY, options);
        aiRouteProgress.lastDistToNode = Infinity;
        aiRouteProgress.degradedTimer = 0;
        if (aiTilePath.length === 0) {
            const steer = steerTowardPoint(ai, player, targetX, targetY, dt, goalKey);
            return { reached: steer.dist < 0.8, stalled: steer.stalled };
        }
    }

    const nextNode = aiTilePath[Math.min(aiTilePathIndex, aiTilePath.length - 1)];
    const distToNode = distanceTo(player.x, player.y, nextNode.x, nextNode.y);

    if (distToNode > aiRouteProgress.lastDistToNode + AI_PROGRESS_EPSILON) {
        aiRouteProgress.degradedTimer += dt;
        if (aiRouteProgress.degradedTimer >= ROUTE_PROGRESS_DEGRADED_SECONDS) {
            resetTilePath(goalKey);
            ensureTilePath(state, goalKey, player.x, player.y, targetX, targetY, options);
            aiRouteProgress.lastDistToNode = Infinity;
            aiRouteProgress.degradedTimer = 0;
            if (aiTilePath.length === 0) {
                const steer = steerTowardPoint(ai, player, targetX, targetY, dt, goalKey);
                return { reached: steer.dist < 0.8, stalled: steer.stalled };
            }
        }
    } else {
        aiRouteProgress.degradedTimer = 0;
    }
    aiRouteProgress.lastDistToNode = distToNode;

    const steer = steerTowardPoint(ai, player, nextNode.x, nextNode.y, dt, `${goalKey}:node:${aiTilePathIndex}`);
    const reachedGoal = distanceTo(player.x, player.y, targetX, targetY) < 1.0;
    if (reachedGoal) {
        resetTilePath(goalKey);
        aiRouteProgress.lastDistToNode = Infinity;
        aiRouteProgress.degradedTimer = 0;
    }
    if (steer.stalled) {
        resetTilePath(goalKey);
        aiRouteProgress.lastDistToNode = Infinity;
        aiRouteProgress.degradedTimer = 0;
    }
    return { reached: reachedGoal, stalled: steer.stalled };
}

function getCurrentObjectiveId(state) {
    const task = getCurrentObjectiveTask(state);
    return task ? task.id : null;
}

function beginWallHug(dir) {
    aiAvoidance.mode = 'wall_hug';
    aiAvoidance.timer = 0.35;
    aiAvoidance.dir = dir;
}

function beginCornerEscape(dir) {
    aiAvoidance.mode = 'corner_escape';
    aiAvoidance.timer = 0.5;
    aiAvoidance.dir = dir;
}

function tickAvoidance(dt) {
    if (!aiAvoidance.mode) return;
    aiAvoidance.timer = Math.max(0, aiAvoidance.timer - dt);
    if (aiAvoidance.timer <= 0) {
        aiAvoidance.mode = null;
    }
}

function applyAvoidance(ai, player) {
    if (!aiAvoidance.mode) return false;

    if (aiAvoidance.mode === 'wall_hug') {
        const steerSign = aiAvoidance.dir > 0 ? 1 : -1;
        ai.lookDX = steerSign * 1.8;
        ai.moveForward = true;
        if (steerSign > 0) ai.strafeRight = true;
        else ai.strafeLeft = true;

        // Stop hugging once forward lane clears.
        if (!isPathBlocked(player.x, player.y, player.angle, 0.95)) {
            aiAvoidance.mode = null;
        }
        return true;
    }

    if (aiAvoidance.mode === 'corner_escape') {
        const steerSign = aiAvoidance.dir > 0 ? 1 : -1;
        ai.lookDX = steerSign * 4.5;
        ai.moveBack = true;
        if (steerSign > 0) ai.strafeRight = true;
        else ai.strafeLeft = true;
        return true;
    }

    return false;
}

function steerTowardPoint(ai, player, tx, ty, dt = 0, goalKey = null) {
    if (applyAvoidance(ai, player)) {
        const progressAvoid = trackGoalProgress(player, goalKey, tx, ty, dt);
        return { dist: progressAvoid.dist, angleDiff: 0, stalled: progressAvoid.stalled };
    }

    const targetAngle = angleTo(player.x, player.y, tx, ty);
    const angleDiff = normalizeAngle(targetAngle - player.angle);
    ai.lookDX = angleDiff * 7;

    const progress = trackGoalProgress(player, goalKey, tx, ty, dt);
    const dist = progress.dist;
    if (dist > 0.6) {
        if (!isPathBlocked(player.x, player.y, player.angle, 1.0)) {
            ai.moveForward = true;
        } else {
            const leftClear = !isPathBlocked(player.x, player.y, player.angle - Math.PI / 2, 1.0);
            const rightClear = !isPathBlocked(player.x, player.y, player.angle + Math.PI / 2, 1.0);
            if (leftClear) {
                beginWallHug(-1);
                ai.strafeLeft = true;
            } else if (rightClear) {
                beginWallHug(1);
                ai.strafeRight = true;
            } else {
                beginCornerEscape(Math.random() > 0.5 ? 1 : -1);
                ai.moveBack = true;
            }
        }
    }

    return { dist, angleDiff, stalled: progress.stalled };
}

function navigateToRoom(state, targetRoomId) {
    const currentRoom = getRoomId(state.player.x, state.player.y) || 'area0';
    if (currentRoom === targetRoomId) return true;
    const path = findPath(currentRoom, targetRoomId);
    if (!path || path.length < 2) return false;
    aiPath = path;
    aiPathIndex = 1;
    aiTarget = targetRoomId;
    return true;
}

function moveAlongWaypointPath(state, ai, player, dt = 0) {
    if (aiPath.length === 0 || aiPathIndex >= aiPath.length) return false;
    const nextRoom = aiPath[aiPathIndex];
    const wp = WAYPOINT_GRAPH[nextRoom];
    if (!wp) return false;

    const goalKey = `path:${nextRoom}:${aiPathIndex}`;
    const progress = trackGoalProgress(player, goalKey, wp.x, wp.y, dt);
    const dist = progress.dist;
    if (dist < 2) {
        aiPathIndex++;
        resetTilePath();
        return true;
    }

    const pathOptions = {
        avoidProjectiles: true,
        avoidEnemies: aiState !== AI_STATE.COMBAT,
        doorPenalty: aiState === AI_STATE.OBJECTIVE ? 1.0 : 1.3,
    };
    followTilePath(state, ai, player, dt, goalKey, wp.x, wp.y, pathOptions);

    if (progress.stalled) {
        aiPath = [];
        aiPathIndex = 0;
        clearDoorIntent();
        resetTilePath();
        aiState = AI_STATE.RECOVER;
        aiStateTimer = 0;
    }
    return true;
}

function sense(state) {
    const currentRoom = getRoomId(state.player.x, state.player.y);
    const objectiveId = getCurrentObjectiveId(state);
    const objectiveHints = getObjectiveHintsForAI(state);
    const enemyInfo = pickBestCombatTarget(state);
    const localEnemy = findNearestEnemyInRoom(state, currentRoom);
    const pickupInfo = findNearestPickup(state);
    const nearbyDoor = findNearbyClosedDoorForAI(state);
    const doorIntent = getDoorIntentEntry();
    const forwardBlocked = isPathBlocked(state.player.x, state.player.y, state.player.angle, 1.0);

    return {
        currentRoom,
        objectiveId,
        objectiveHints,
        enemyInfo,
        localEnemy,
        pickupInfo,
        nearbyDoor,
        doorIntent,
        forwardBlocked,
    };
}

function chooseRequestedState(sensed) {
    if (aiStuckTimer > 1.5) return AI_STATE.RECOVER;
    if (sensed.doorIntent) return AI_STATE.INTERACT;
    if (sensed.objectiveId) return AI_STATE.OBJECTIVE;
    if (sensed.nearbyDoor && sensed.forwardBlocked) return AI_STATE.INTERACT;
    if (sensed.enemyInfo) return AI_STATE.COMBAT;
    return AI_STATE.EXPLORE;
}

function transitionState(requestedState, dt) {
    aiStateTimer += dt;
    if (requestedState === aiState) return;

    const lock = AI_STATE_LOCK_SECONDS[aiState] ?? 0;
    if (requestedState !== AI_STATE.RECOVER && aiStateTimer < lock) {
        return;
    }

    aiState = requestedState;
    aiStateTimer = 0;
    clearGoalProgress();
}

function getNearestArea3LightWell(state) {
    const bounds = ROOM_BOUNDS.area3;
    if (!bounds) return null;

    let best = null;
    let bestDist = Infinity;
    for (let row = bounds.y; row < bounds.y + bounds.h; row++) {
        for (let col = bounds.x; col < bounds.x + bounds.w; col++) {
            if (getTile(col, row) !== TILE.LIGHT_WELL) continue;
            const x = col + 0.5;
            const y = row + 0.5;
            const dist = distanceTo(state.player.x, state.player.y, x, y);
            if (dist < bestDist) {
                bestDist = dist;
                best = { x, y, dist };
            }
        }
    }
    return best;
}

function plan(state, sensed, context, ai) {
    const { player, dt } = context;
    const currentRoom = sensed.currentRoom;
    const objectiveHints = sensed.objectiveHints;
    const objectiveId = sensed.objectiveId;

    // ── Retry/escalation: after door_blocked, force one replan (clear path once)
    if (aiState === AI_STATE.OBJECTIVE && objectiveId && aiPath.length > 0 && getTaskFailure(state, objectiveId)?.reason === 'door_blocked') {
        aiPath = [];
        aiPathIndex = 0;
    }

    // ── Objective Stage Steering (shared with checklist) ─────────
    if (aiState === AI_STATE.OBJECTIVE && objectiveId === 'pickup-handgun') {
        const pos = PICKUP_POSITIONS.handgun;
        if (pos) {
            const pickupRoom = getRoomId(pos.x, pos.y);
            if (pickupRoom && currentRoom !== pickupRoom) {
                if (navigateToRoom(state, pickupRoom)) moveAlongWaypointPath(state, ai, player, dt);
                return;
            }
            const steer = steerTowardPoint(ai, player, pos.x, pos.y, dt, 'obj:pickup-handgun');
            if (steer.stalled) {
                recordTaskFailure(state, 'pickup-handgun', 'stuck');
                aiPath = [];
                aiPathIndex = 0;
                aiState = AI_STATE.RECOVER;
            }
            return;
        }
    }

    if (aiState === AI_STATE.OBJECTIVE && objectiveId === 'use-button') {
        const area1Alive = state.entities.some(e => e.roomId === 'area1' && e.hp > 0);
        if (area1Alive) {
            if (currentRoom !== 'area1') {
                if (navigateToRoom(state, 'area1')) moveAlongWaypointPath(state, ai, player, dt);
                return;
            }
            const roomEnemy = findNearestEnemyInRoom(state, 'area1');
            if (roomEnemy && hasLineOfSight(player.x, player.y, roomEnemy.entity.x, roomEnemy.entity.y)) {
                steerTowardPoint(ai, player, roomEnemy.entity.x, roomEnemy.entity.y, dt, 'obj:clear-area1');
                return;
            }
        }

        const button = INTERACTABLE_POSITIONS.area1Button;
        if (button) {
            const { dist, angleDiff, stalled } = steerTowardPoint(ai, player, button.x, button.y, dt, 'obj:button');
            if (dist <= INTERACTION_RANGE && Math.abs(angleDiff) < 0.9 && aiInteractCooldown <= 0) {
                ai.interact = true;
                aiInteractCooldown = 1;
            }
            if (stalled) {
                recordTaskFailure(state, 'use-button', 'stuck');
                aiPath = [];
                aiPathIndex = 0;
                aiState = AI_STATE.RECOVER;
            }
            return;
        }
    }

    if (aiState === AI_STATE.OBJECTIVE && objectiveId === 'use-doors-progress' && objectiveHints.needsDoorsProgress) {
        if (!navigateToRoom(state, 'area3')) {
            const area3 = ROOM_BOUNDS.area3;
            if (area3) {
                steerTowardPoint(ai, player, area3.x + area3.w / 2, area3.y + area3.h / 2, dt, 'obj:to-area3');
                return;
            }
        }
    }

    if (aiState === AI_STATE.OBJECTIVE && objectiveId === 'pickup-shotgun') {
        const pos = PICKUP_POSITIONS.shotgun;
        if (pos) {
            const pickupRoom = getRoomId(pos.x, pos.y);
            if (pickupRoom && currentRoom !== pickupRoom) {
                if (navigateToRoom(state, pickupRoom)) moveAlongWaypointPath(state, ai, player, dt);
                return;
            }
            steerTowardPoint(ai, player, pos.x, pos.y, dt, 'obj:pickup-shotgun');
            return;
        }
    }

    if (aiState === AI_STATE.OBJECTIVE && objectiveId === 'pickup-voidbeam') {
        const pos = PICKUP_POSITIONS.voidbeam;
        if (pos) {
            const pickupRoom = getRoomId(pos.x, pos.y);
            if (pickupRoom && currentRoom !== pickupRoom) {
                if (navigateToRoom(state, pickupRoom)) moveAlongWaypointPath(state, ai, player, dt);
                return;
            }
            steerTowardPoint(ai, player, pos.x, pos.y, dt, 'obj:pickup-voidbeam');
            return;
        }
    }

    // ── Priority 1: Fight visible enemies ───────────────────────
    const enemyInfo = sensed.enemyInfo;
    if ((aiState === AI_STATE.COMBAT || aiState === AI_STATE.OBJECTIVE) && enemyInfo) {
        const { entity, distance } = enemyInfo;

        // Look toward enemy
        const targetAngle = angleTo(player.x, player.y, entity.x, entity.y);
        const angleDiff = normalizeAngle(targetAngle - player.angle);
        ai.lookDX = angleDiff * 8; // smooth turn

        // Weapon selection (range + context; boss uses Void Beam only on light well)
        if (aiWeaponSwitchCooldown <= 0) {
            const bestWeapon = chooseBestWeapon(state, distance, {
                enemyType: entity.type,
                objectiveId,
            });
            if (bestWeapon !== player.currentWeapon) {
                const slotMap = { FIST: 1, HANDGUN: 2, SHOTGUN: 3, VOIDBEAM: 4 };
                ai.weaponSlot = slotMap[bestWeapon] || null;
                aiWeaponSwitchCooldown = 1;
            }
        }

        // Explicit boss protocol: move to light well → equip Void Beam → maintain LOS, strafe-fire
        if (objectiveId === 'voidbeam-light-zone' && entity.type === 'BOSS') {
            const standingTile = getTile(Math.floor(player.x), Math.floor(player.y));
            const onLightWell = standingTile === TILE.LIGHT_WELL;

            if (!onLightWell) {
                const nearestLight = getNearestArea3LightWell(state);
                if (nearestLight) {
                    steerTowardPoint(ai, player, nearestLight.x, nearestLight.y, dt, 'combat:boss-lightwell');
                    return;
                }
            } else {
                // On light well: maintain LOS (look at boss), strafe to avoid void laser, keep firing
                if (player.currentWeapon !== 'VOIDBEAM' && player.weapons.includes('VOIDBEAM') && aiWeaponSwitchCooldown <= 0) {
                    ai.weaponSlot = 4;
                    aiWeaponSwitchCooldown = 0.5;
                }
                const strafeDir = Math.sin(state.time.now * 0.0025) > 0 ? 1 : -1;
                if (strafeDir > 0 && !isPathBlocked(player.x, player.y, player.angle + Math.PI / 2, 1.0)) ai.strafeRight = true;
                else if (strafeDir < 0 && !isPathBlocked(player.x, player.y, player.angle - Math.PI / 2, 1.0)) ai.strafeLeft = true;
            }
        }

        // Fire when roughly facing enemy
        if (Math.abs(angleDiff) < 0.2 && aiFireCooldown <= 0) {
            ai.fire = true;
            aiFireCooldown = 0.3;
        }

        // Movement: peek / kite / push with wall awareness
        const angleToEnemy = angleTo(player.x, player.y, entity.x, entity.y);
        const positioning = getCombatPositioning(state, entity, distance);
        const leftClear = !isPathBlocked(player.x, player.y, angleToEnemy - Math.PI / 3, 1.5);
        const rightClear = !isPathBlocked(player.x, player.y, angleToEnemy + Math.PI / 3, 1.5);
        const forwardClear = !isPathBlocked(player.x, player.y, angleToEnemy, 1.5);

        if (positioning === 'kite') {
            ai.moveBack = true;
            if (Math.sin(state.time.now * 0.004) > 0 && leftClear) ai.strafeLeft = true;
            else if (rightClear) ai.strafeRight = true;
        } else if (positioning === 'push' && forwardClear && distance > 2) {
            ai.moveForward = true;
        } else if (positioning === 'peek') {
            if (distance > 3 && forwardClear) ai.moveForward = true;
            else if (!forwardClear) {
                if (leftClear) ai.strafeLeft = true;
                else if (rightClear) ai.strafeRight = true;
                else ai.moveBack = true;
            }
        }

        if (distance < 1.5) ai.moveBack = true;

        if (state.projectiles.length > 0) {
            const perpLeft = !isPathBlocked(player.x, player.y, player.angle - Math.PI / 2, 1.0);
            const perpRight = !isPathBlocked(player.x, player.y, player.angle + Math.PI / 2, 1.0);
            const dodge = getBestProjectileDodge(state);
            if (dodge === 'left' && perpLeft) ai.strafeLeft = true;
            else if (dodge === 'right' && perpRight) ai.strafeRight = true;
            else if (Math.sin(state.time.now * 0.003) > 0 && perpLeft) ai.strafeLeft = true;
            else if (perpRight) ai.strafeRight = true;
        }
        return;
    }

    if (aiState === AI_STATE.INTERACT) {
        const intentEntry = sensed.doorIntent || sensed.nearbyDoor;
        if (intentEntry && intentEntry.key) setDoorIntentFromEntry(intentEntry);

        const activeDoor = getDoorIntentEntry() || intentEntry;
        if (aiInteractCooldown <= 0 && activeDoor) {
            const doorRef = activeDoor.door || activeDoor;
            const doorAngle = angleTo(player.x, player.y, doorRef.x + 0.5, doorRef.y + 0.5);
            const doorDiff = normalizeAngle(doorAngle - player.angle);
            ai.lookDX = doorDiff * 8;
            ai.interact = true;
            aiDoorIntent.attempts++;
            aiInteractCooldown = 0.8;
            return;
        }

        if (aiDoorIntent.key && (aiDoorIntent.retryTimer <= 0 || aiDoorIntent.attempts >= DOOR_INTENT_MAX_ATTEMPTS)) {
            const curObj = getCurrentObjectiveId(state);
            if (curObj) recordTaskFailure(state, curObj, 'door_blocked');
            clearDoorIntent();
            aiPath = [];
            aiPathIndex = 0;
        }
        aiState = AI_STATE.EXPLORE;
    }

    const pickupInfo = sensed.pickupInfo;
    if (aiState === AI_STATE.EXPLORE && pickupInfo && pickupInfo.distance < 5) {
        const { pickup } = pickupInfo;
        const targetAngle = angleTo(player.x, player.y, pickup.x, pickup.y);
        const angleDiff = normalizeAngle(targetAngle - player.angle);
        ai.lookDX = angleDiff * 6;
        ai.moveForward = true;
        return;
    }

    // Only chase enemies we can actually see — avoid running at walls toward invisible targets
    const localEnemy = sensed.localEnemy;
    if (aiState === AI_STATE.EXPLORE && localEnemy && localEnemy.distance < 14) {
        const canSee = hasLineOfSight(player.x, player.y, localEnemy.entity.x, localEnemy.entity.y);
        if (canSee) {
            steerTowardPoint(ai, player, localEnemy.entity.x, localEnemy.entity.y, dt, `explore:local-enemy:${localEnemy.entity.type}`);
            return;
        }
    }

    if (aiState === AI_STATE.EXPLORE && aiInteractCooldown <= 0) {
        const nearbyDoor = findNearbyClosedDoorForAI(state);
        if (nearbyDoor) {
            setDoorIntentFromEntry(nearbyDoor);
            const doorAngle = angleTo(player.x, player.y, nearbyDoor.door.x + 0.5, nearbyDoor.door.y + 0.5);
            const doorDiff = normalizeAngle(doorAngle - player.angle);
            ai.lookDX = doorDiff * 8;
            ai.interact = true;
            aiDoorIntent.attempts++;
            aiInteractCooldown = 0.8;
            return;
        }
    }

    if (aiState !== AI_STATE.EXPLORE && aiState !== AI_STATE.OBJECTIVE) return;

    if (aiPath.length === 0 || aiPathIndex >= aiPath.length) {
        const target = chooseExplorationTarget(state);
        if (target) {
            aiPath = target.path;
            aiPathIndex = 1;
            aiTarget = target.roomId;
        } else {
            ai.moveForward = true;
            aiWanderTimer += dt;
            if (aiWanderTimer > 2) {
                ai.lookDX = (Math.random() - 0.5) * 3;
                aiWanderTimer = 0;
            }
            return;
        }
    }

    if (!moveAlongWaypointPath(state, ai, player, dt)) {
        aiPath = [];
        aiPathIndex = 0;
        resetTilePath();
    }

    if (aiInteractCooldown <= 0) {
        const nearbyDoor = findNearbyClosedDoorForAI(state);
        if (nearbyDoor) {
            setDoorIntentFromEntry(nearbyDoor);
            ai.interact = true;
            aiDoorIntent.attempts++;
            aiInteractCooldown = 0.8;
        }
    }
}

function act(state) {
    // Action queue resolves intents to state.ai.input as intents are set.
    state.ai.currentState = aiState;
}

// ── Main AI Update ──────────────────────────────────────────────────

/**
 * Update AI autopilot. Sets synthetic input on state.ai.input.
 * @param {object} state - Shared game state
 */
export function update(state) {
    if (!state.ai.active) {
        // Reset when deactivated
        aiTarget = null;
        aiPath = [];
        aiPathIndex = 0;
        aiState = AI_STATE.EXPLORE;
        aiStateTimer = 0;
        clearDoorIntent();
        clearGoalProgress();
        resetTilePath();
        aiAvoidance.mode = null;
        aiAvoidance.timer = 0;
        return;
    }

    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const aiOutput = state.ai.input;
    resetAiOutput(aiOutput);
    const ai = createActionQueue(aiOutput);
    const player = state.player;
    const dt = state.time.dt;

    // Tick cooldowns
    aiInteractCooldown = Math.max(0, aiInteractCooldown - dt);
    aiFireCooldown = Math.max(0, aiFireCooldown - dt);
    aiWeaponSwitchCooldown = Math.max(0, aiWeaponSwitchCooldown - dt);
    aiDoorIntent.retryTimer = Math.max(0, aiDoorIntent.retryTimer - dt);
    tickAvoidance(dt);

    // Track visited rooms
    const currentRoom = getRoomId(player.x, player.y);
    if (currentRoom) aiVisitedRooms.add(currentRoom);

    // Stuck detection — grace period after recovery so we don't thrash in/out of RECOVER
    const distMoved = distanceTo(player.x, player.y, aiLastPos.x, aiLastPos.y);
    const inGrace = state.time && state.time.elapsed < aiRecoveryGraceUntil;
    if (distMoved < 0.02 && !inGrace) {
        aiStuckTimer += dt;
    } else {
        aiStuckTimer = Math.max(0, aiStuckTimer - dt * 2);
    }
    aiLastPos.x = player.x;
    aiLastPos.y = player.y;

    // Optional player-facing assist hint when autopilot is stuck (rate-limited; cooldown in seconds)
    const elapsedSec = state.time && typeof state.time.elapsed === 'number' ? state.time.elapsed : 0;
    const stuckOrRecovering = aiStuckTimer > 2.5 || aiState === AI_STATE.RECOVER;
    if (stuckOrRecovering && state.hud && (elapsedSec - aiLastAssistHintAt) >= AI_ASSIST_HINT_COOLDOWN) {
        const msg = 'AUTOPILOT STUCK — Try moving or open the door manually.';
        const last = state.hud.messages[state.hud.messages.length - 1];
        if (!last || last.text !== msg) {
            state.hud.messages.push({ text: msg, timer: 4 });
            if (state.hud.messages.length > 8) state.hud.messages.splice(0, state.hud.messages.length - 8);
        }
        aiLastAssistHintAt = elapsedSec;
    }

    // If in recovery state, do one frame of unstuck maneuver then leave RECOVER so we don't spin forever.
    if (aiState === AI_STATE.RECOVER) {
        const forwardBlocked = isPathBlocked(player.x, player.y, player.angle, 1.0);
        const leftBlocked = isPathBlocked(player.x, player.y, player.angle - Math.PI / 2, 1.0);
        const rightBlocked = isPathBlocked(player.x, player.y, player.angle + Math.PI / 2, 1.0);

        if (forwardBlocked && !rightBlocked) {
            ai.lookDX = 3;
            ai.strafeRight = true;
        } else if (forwardBlocked && !leftBlocked) {
            ai.lookDX = -3;
            ai.strafeLeft = true;
        } else {
            ai.lookDX = 6;
            ai.moveBack = true;
        }
        aiStuckTimer = 0;
        aiRecoveryGraceUntil = (state.time && state.time.elapsed) ? state.time.elapsed + 0.5 : 0;
        aiPath = [];
        aiPathIndex = 0;
        clearDoorIntent();
        clearGoalProgress();
        resetTilePath();
        aiAvoidance.mode = null;
        aiAvoidance.timer = 0;
        aiState = AI_STATE.EXPLORE;
        return;
    }

    const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
    const sensed = sense(state);
    transitionState(chooseRequestedState(sensed), dt);
    plan(state, sensed, { player, dt }, ai);
    const t2 = typeof performance !== 'undefined' ? performance.now() : 0;
    act(state);
    const t3 = typeof performance !== 'undefined' ? performance.now() : 0;

    // Telemetry for debug overlay / tuning
    const targetId = getCurrentObjectiveId(state) || (sensed.enemyInfo ? `enemy:${sensed.enemyInfo.entity?.type ?? '?'}` : null);
    const confidence = aiState === AI_STATE.RECOVER ? 0 : (aiStuckTimer > 1 ? Math.max(0, 1 - aiStuckTimer / 3) : 1);
    const decisionMs = t3 - t0;
    const planMs = t2 - t1;
    state.ai.telemetry = {
        state: aiState,
        targetId: targetId || '—',
        confidence: confidence.toFixed(2),
        stuckTimer: aiStuckTimer.toFixed(2),
        replanCount: aiReplanCount,
        pathNodes: aiTilePath.length,
        decisionMs: decisionMs.toFixed(2),
        planMs: planMs.toFixed(2),
    };
}
