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

import { isSolid, getTile, getRoomId, ROOMS, ROOM_BOUNDS, doors } from './map.js';
import { TILE, INTERACTION_RANGE, PLAYER_SPEED } from './config.js';

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

/** Find the nearest alive entity visible from the player position */
function findNearestEnemy(state) {
    const { player, entities } = state;
    let best = null;
    let bestDist = Infinity;

    for (const e of entities) {
        if (e.aggroState === 'dead' || e.hp <= 0) continue;
        const dist = distanceTo(player.x, player.y, e.x, e.y);
        if (dist < 20 && dist < bestDist) {
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

    // Stuck detection
    const distMoved = distanceTo(player.x, player.y, aiLastPos.x, aiLastPos.y);
    if (distMoved < 0.05 * dt) {
        aiStuckTimer += dt;
    } else {
        aiStuckTimer = 0;
    }
    aiLastPos.x = player.x;
    aiLastPos.y = player.y;

    // If stuck for 3+ seconds, try random strafe
    if (aiStuckTimer > 3) {
        ai.strafeLeft = Math.random() > 0.5;
        ai.strafeRight = !ai.strafeLeft;
        ai.moveForward = true;
        aiStuckTimer = 0;
        return;
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
                const slotMap = { 'FIST': 1, 'HANDGUN': 2, 'SHOTGUN': 3, 'VOIDBEAM': 3 };
                ai.weaponSlot = slotMap[bestWeapon] || null;
                aiWeaponSwitchCooldown = 1;
            }
        }

        // Fire when roughly facing enemy
        if (Math.abs(angleDiff) < 0.2 && aiFireCooldown <= 0) {
            ai.fire = true;
            aiFireCooldown = 0.3;
        }

        // Movement: close in or maintain distance
        if (distance > 3) {
            ai.moveForward = true;
        } else if (distance < 1.5) {
            ai.moveBack = true;
        }

        // Strafe to dodge projectiles
        if (state.projectiles.length > 0) {
            ai.strafeLeft = Math.sin(state.time.now * 0.003) > 0;
            ai.strafeRight = !ai.strafeLeft;
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
        // Check if facing a door within interaction range
        const lookX = player.x + Math.cos(player.angle) * 1.5;
        const lookY = player.y + Math.sin(player.angle) * 1.5;
        const tileAhead = getTile(lookX, lookY);

        if (tileAhead === TILE.DOOR || tileAhead === TILE.DOOR_LOCKED_BUTTON || tileAhead === TILE.DOOR_LOCKED_KEY) {
            const doorKey = `${Math.floor(lookX)},${Math.floor(lookY)}`;
            const door = doors[doorKey];
            if (door && !door.open && !door.opening) {
                ai.interact = true;
                aiInteractCooldown = 1;
                return;
            }
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

    // Move forward when roughly facing
    if (Math.abs(angleDiff) < 0.5) {
        ai.moveForward = true;
    }
}
