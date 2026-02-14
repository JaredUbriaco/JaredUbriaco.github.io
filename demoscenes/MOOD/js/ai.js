/**
 * ai.js — AI Autopilot System
 * 
 * Takes control when the player is idle (no input for ~10s).
 * Navigates the map, engages enemies, opens doors, collects pickups.
 * Uses synthetic input that feeds into the same player.update() path.
 * 
 * Strategy:
 * 1. If enemies are visible, face and attack them.
 * 2. If pickups are nearby, walk toward them.
 * 3. If a door is nearby and facing, interact (E).
 * 4. Otherwise, wander toward unexplored rooms via waypoints.
 */

import {
    isSolid, getTile, getRoomId, ROOM_BOUNDS, doors,
    PICKUP_POSITIONS, INTERACTABLE_POSITIONS,
} from './map.js';
import { TILE, INTERACTION_RANGE, PLAYER_SPEED } from './config.js';
import { getObjectiveHintsForAI } from './objectives.js';

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

// ── Utility Functions ───────────────────────────────────────────────

function angleTo(fromX, fromY, toX, toY) {
    return Math.atan2(toY - fromY, toX - fromX);
}

function distanceTo(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    return Math.sqrt(dx * dx + dy * dy);
}

/** Normalize angle to [-PI, PI] */
function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

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
            // Line-of-sight check — only engage enemies we can actually see
            if (hasLineOfSight(player.x, player.y, e.x, e.y)) {
                bestDist = dist;
                best = e;
            }
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

/** Pick the best weapon for the situation */
function chooseBestWeapon(state, distance) {
    const weapons = state.player.weapons;
    if (distance < 1.5 && weapons.includes('FIST')) return 'FIST';
    if (distance < 5 && weapons.includes('SHOTGUN')) return 'SHOTGUN';
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
        if (dist > INTERACTION_RANGE + 0.5) continue;
        if (dist < bestDist) {
            bestDist = dist;
            best = door;
        }
    }
    return best;
}

function getCurrentObjectiveId(state) {
    const firstIncomplete = state.objectives.items.find(item => !item.done);
    return firstIncomplete ? firstIncomplete.id : null;
}

function steerTowardPoint(ai, player, tx, ty) {
    const targetAngle = angleTo(player.x, player.y, tx, ty);
    const angleDiff = normalizeAngle(targetAngle - player.angle);
    ai.lookDX = angleDiff * 7;

    const dist = distanceTo(player.x, player.y, tx, ty);
    if (dist > 0.6) {
        if (!isPathBlocked(player.x, player.y, player.angle, 1.0)) {
            ai.moveForward = true;
        } else {
            const leftClear = !isPathBlocked(player.x, player.y, player.angle - Math.PI / 2, 1.0);
            const rightClear = !isPathBlocked(player.x, player.y, player.angle + Math.PI / 2, 1.0);
            if (leftClear) ai.strafeLeft = true;
            else if (rightClear) ai.strafeRight = true;
            else ai.moveBack = true;
        }
    }

    return { dist, angleDiff };
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
        return;
    }

    const ai = state.ai.input;
    const player = state.player;
    const dt = state.time.dt;

    // Reset synthetic inputs
    ai.moveForward = false;
    ai.moveBack = false;
    ai.strafeLeft = false;
    ai.strafeRight = false;
    ai.lookDX = 0;
    ai.lookDY = 0;
    ai.fire = false;
    ai.interact = false;
    ai.weaponSlot = null;

    // Tick cooldowns
    aiInteractCooldown = Math.max(0, aiInteractCooldown - dt);
    aiFireCooldown = Math.max(0, aiFireCooldown - dt);
    aiWeaponSwitchCooldown = Math.max(0, aiWeaponSwitchCooldown - dt);

    // Track visited rooms
    const currentRoom = getRoomId(player.x, player.y);
    if (currentRoom) aiVisitedRooms.add(currentRoom);

    // Stuck detection — more aggressive (1.5s threshold, smarter recovery)
    const distMoved = distanceTo(player.x, player.y, aiLastPos.x, aiLastPos.y);
    if (distMoved < 0.02) {
        aiStuckTimer += dt;
    } else {
        aiStuckTimer = Math.max(0, aiStuckTimer - dt * 2); // decay faster when moving
    }
    aiLastPos.x = player.x;
    aiLastPos.y = player.y;

    // If stuck for 1.5+ seconds, do a smart recovery
    if (aiStuckTimer > 1.5) {
        // Turn away from whatever we're stuck on, then strafe
        const forwardBlocked = isPathBlocked(player.x, player.y, player.angle, 1.0);
        const leftBlocked = isPathBlocked(player.x, player.y, player.angle - Math.PI / 2, 1.0);
        const rightBlocked = isPathBlocked(player.x, player.y, player.angle + Math.PI / 2, 1.0);

        if (forwardBlocked && !rightBlocked) {
            ai.lookDX = 3; // turn right
            ai.strafeRight = true;
        } else if (forwardBlocked && !leftBlocked) {
            ai.lookDX = -3; // turn left
            ai.strafeLeft = true;
        } else {
            // Both sides blocked — turn around
            ai.lookDX = 6;
            ai.moveBack = true;
        }
        aiStuckTimer = 0;
        // Clear current path to force re-pathfinding
        aiPath = [];
        aiPathIndex = 0;
        return;
    }

    const objectiveHints = getObjectiveHintsForAI(state);
    const objectiveId = getCurrentObjectiveId(state);

    // ── Objective Stage Steering (shared with checklist) ─────────
    if (objectiveId === 'pickup-handgun') {
        const pos = PICKUP_POSITIONS.handgun;
        if (pos) {
            steerTowardPoint(ai, player, pos.x, pos.y);
            return;
        }
    }

    if (objectiveId === 'use-button') {
        const area1Alive = state.entities.some(e => e.roomId === 'area1' && e.hp > 0);
        if (area1Alive) {
            const area1 = ROOM_BOUNDS.area1;
            if (area1) {
                const tx = area1.x + area1.w / 2;
                const ty = area1.y + area1.h / 2;
                steerTowardPoint(ai, player, tx, ty);
            } else {
                navigateToRoom(state, 'area1');
            }
            return;
        }

        const button = INTERACTABLE_POSITIONS.area1Button;
        if (button) {
            const { dist, angleDiff } = steerTowardPoint(ai, player, button.x, button.y);
            if (dist <= INTERACTION_RANGE && Math.abs(angleDiff) < 0.9 && aiInteractCooldown <= 0) {
                ai.interact = true;
                aiInteractCooldown = 1;
            }
            return;
        }
    }

    if (objectiveId === 'use-doors-progress' && objectiveHints.needsDoorsProgress) {
        if (!navigateToRoom(state, 'area3')) {
            const area3 = ROOM_BOUNDS.area3;
            if (area3) {
                steerTowardPoint(ai, player, area3.x + area3.w / 2, area3.y + area3.h / 2);
                return;
            }
        }
    }

    if (objectiveId === 'pickup-shotgun') {
        const pos = PICKUP_POSITIONS.shotgun;
        if (pos) {
            steerTowardPoint(ai, player, pos.x, pos.y);
            return;
        }
    }

    if (objectiveId === 'pickup-voidbeam') {
        const pos = PICKUP_POSITIONS.voidbeam;
        if (pos) {
            steerTowardPoint(ai, player, pos.x, pos.y);
            return;
        }
    }

    // ── Priority 1: Fight visible enemies ───────────────────────
    const enemyInfo = findNearestEnemy(state);
    if (enemyInfo) {
        const { entity, distance } = enemyInfo;

        // Look toward enemy
        const targetAngle = angleTo(player.x, player.y, entity.x, entity.y);
        const angleDiff = normalizeAngle(targetAngle - player.angle);
        ai.lookDX = angleDiff * 8; // smooth turn

        // Weapon selection
        if (aiWeaponSwitchCooldown <= 0) {
            const bestWeapon = chooseBestWeapon(state, distance);
            if (bestWeapon !== player.currentWeapon) {
                const slotMap = { 'FIST': 1, 'HANDGUN': 2, 'SHOTGUN': 3, 'VOIDBEAM': 4 };
                ai.weaponSlot = slotMap[bestWeapon] || null;
                aiWeaponSwitchCooldown = 1;
            }
        }

        // During boss phase objective, make AI use Void Beam from a light well.
        if (objectiveId === 'voidbeam-light-zone' && enemyInfo.entity.type === 'BOSS') {
            const standingTile = getTile(Math.floor(player.x), Math.floor(player.y));
            const onLightWell = standingTile === TILE.LIGHT_WELL;

            if (!onLightWell) {
                const nearestLight = getNearestArea3LightWell(state);
                if (nearestLight) {
                    steerTowardPoint(ai, player, nearestLight.x, nearestLight.y);
                    return;
                }
            } else if (player.currentWeapon !== 'VOIDBEAM' && player.weapons.includes('VOIDBEAM')) {
                ai.weaponSlot = 4;
            }
        }

        // Fire when roughly facing enemy
        if (Math.abs(angleDiff) < 0.2 && aiFireCooldown <= 0) {
            ai.fire = true;
            aiFireCooldown = 0.3;
        }

        // Movement: close in or maintain distance, with wall awareness
        const angleToEnemy = angleTo(player.x, player.y, entity.x, entity.y);
        if (distance > 3) {
            // Check if forward path toward enemy is clear
            if (!isPathBlocked(player.x, player.y, angleToEnemy, 1.5)) {
                ai.moveForward = true;
            } else {
                // Path blocked — try strafing around the obstacle
                const leftClear = !isPathBlocked(player.x, player.y, angleToEnemy - Math.PI / 3, 1.5);
                const rightClear = !isPathBlocked(player.x, player.y, angleToEnemy + Math.PI / 3, 1.5);
                if (leftClear) ai.strafeLeft = true;
                else if (rightClear) ai.strafeRight = true;
                else ai.moveBack = true; // fully blocked, back up
            }
        } else if (distance < 1.5) {
            ai.moveBack = true;
        }

        // Strafe to dodge projectiles
        if (state.projectiles.length > 0) {
            const leftClear = !isPathBlocked(player.x, player.y, player.angle - Math.PI / 2, 1.0);
            const rightClear = !isPathBlocked(player.x, player.y, player.angle + Math.PI / 2, 1.0);
            if (Math.sin(state.time.now * 0.003) > 0 && leftClear) {
                ai.strafeLeft = true;
            } else if (rightClear) {
                ai.strafeRight = true;
            }
        }

        return;
    }

    // ── Priority 2: Collect nearby pickups ──────────────────────
    const pickupInfo = findNearestPickup(state);
    if (pickupInfo && pickupInfo.distance < 5) {
        const { pickup } = pickupInfo;
        const targetAngle = angleTo(player.x, player.y, pickup.x, pickup.y);
        const angleDiff = normalizeAngle(targetAngle - player.angle);
        ai.lookDX = angleDiff * 6;
        ai.moveForward = true;
        return;
    }

    // ── Priority 3: Interact with nearby doors ──────────────────
    if (aiInteractCooldown <= 0) {
        const nearbyDoor = findNearbyClosedDoorForAI(state);
        if (nearbyDoor) {
            const doorAngle = angleTo(player.x, player.y, nearbyDoor.x + 0.5, nearbyDoor.y + 0.5);
            const doorDiff = normalizeAngle(doorAngle - player.angle);
            ai.lookDX = doorDiff * 8;
            ai.interact = true;
            aiInteractCooldown = 0.8;
            return;
        }
    }

    // ── Priority 4: Navigate to next waypoint ───────────────────
    if (aiPath.length === 0 || aiPathIndex >= aiPath.length) {
        const target = chooseExplorationTarget(state);
        if (target) {
            aiPath = target.path;
            aiPathIndex = 1; // skip first (current room)
            aiTarget = target.roomId;
        } else {
            // Nowhere to go, just wander
            ai.moveForward = true;
            aiWanderTimer += dt;
            if (aiWanderTimer > 2) {
                ai.lookDX = (Math.random() - 0.5) * 3;
                aiWanderTimer = 0;
            }
            return;
        }
    }

    // Move toward current waypoint
    const nextRoom = aiPath[aiPathIndex];
    const wp = WAYPOINT_GRAPH[nextRoom];
    if (!wp) { aiPath = []; return; }

    const dist = distanceTo(player.x, player.y, wp.x, wp.y);
    if (dist < 2) {
        // Reached waypoint, advance
        aiPathIndex++;
        return;
    }

    // Face waypoint
    const targetAngle = angleTo(player.x, player.y, wp.x, wp.y);
    const angleDiff = normalizeAngle(targetAngle - player.angle);
    ai.lookDX = angleDiff * 6;

    // Move forward when roughly facing — but check for walls first
    if (Math.abs(angleDiff) < 0.5) {
        if (!isPathBlocked(player.x, player.y, player.angle, 1.0)) {
            ai.moveForward = true;
        } else {
            // Wall ahead — try to strafe around it
            const leftClear = !isPathBlocked(player.x, player.y, player.angle - Math.PI / 2, 1.0);
            const rightClear = !isPathBlocked(player.x, player.y, player.angle + Math.PI / 2, 1.0);
            if (leftClear) {
                ai.strafeLeft = true;
                ai.moveForward = true;
            } else if (rightClear) {
                ai.strafeRight = true;
                ai.moveForward = true;
            }
            // If both blocked, stuck timer will handle it
        }
    }

    // Also try to interact with doors in our path
    if (aiInteractCooldown <= 0) {
        const nearbyDoor = findNearbyClosedDoorForAI(state);
        if (nearbyDoor) {
            ai.interact = true;
            aiInteractCooldown = 0.8;
        }
    }
}
