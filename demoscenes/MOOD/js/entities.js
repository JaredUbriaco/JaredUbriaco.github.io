/**
 * entities.js — Enemy Entity System
 * 
 * Manages all enemy entities: Glimmers, Phantoms, Prism, Boss.
 * Factory functions create entities. Update loop runs behavior.
 * Currently implements: Glimmer (idle + aggro).
 * Phantom, Prism, Boss added in tasks5/tasks6.
 */

import { ENEMIES, AGGRO_PROPAGATION_RANGE } from './config.js';
import { isSolid, getRoomId, ROOM_BOUNDS, ENEMY_SPAWNS } from './map.js';

// ── Entity Factory Functions ────────────────────────────────────────

/**
 * Create a Glimmer entity.
 */
export function createGlimmer(x, y, roomId) {
    const stats = ENEMIES.GLIMMER;
    return {
        type: 'GLIMMER',
        x, y,
        hp: stats.hp,
        maxHp: stats.hp,
        radius: stats.radius,
        spriteWidth: stats.spriteWidth,
        spriteHeight: stats.spriteHeight,
        roomId,
        aggroState: 'idle',    // 'idle' | 'aggro' | 'dead'

        // Idle wander state
        idleTarget: { x: x + (Math.random() - 0.5) * 3, y: y + (Math.random() - 0.5) * 3 },
        idleTimer: Math.random() * 2 + 1,

        // Visual state
        hitFlash: 0,
        deathTimer: 0,
        sparklePhase: Math.random() * Math.PI * 2,
        pulsePhase: Math.random() * Math.PI * 2,
    };
}

/**
 * Create a Phantom entity.
 */
export function createPhantom(x, y, roomId) {
    const stats = ENEMIES.PHANTOM;
    return {
        type: 'PHANTOM',
        x, y,
        hp: stats.hp,
        maxHp: stats.hp,
        radius: stats.radius,
        spriteWidth: stats.spriteWidth,
        spriteHeight: stats.spriteHeight,
        roomId,
        aggroState: 'idle',

        // Idle patrol
        idleTarget: { x, y },
        idleTimer: Math.random() * 2 + 1,
        patrolPoints: [],      // set in tasks5

        // Aggro behavior
        strafeDir: Math.random() > 0.5 ? 1 : -1,
        fireTimer: stats.fireRate,

        // Trail (for afterimage rendering)
        trail: [{ x, y }, { x, y }, { x, y }],
        trailTimer: 0,

        // Visual
        hitFlash: 0,
        deathTimer: 0,
        wavyPhase: Math.random() * Math.PI * 2,
    };
}

/**
 * Create a Prism entity (key bearer).
 */
export function createPrism(x, y, roomId) {
    const stats = ENEMIES.PRISM;
    return {
        type: 'PRISM',
        x, y,
        hp: stats.hp,
        maxHp: stats.hp,
        radius: stats.radius,
        spriteWidth: stats.spriteWidth,
        spriteHeight: stats.spriteHeight,
        roomId,
        aggroState: 'idle',

        idleTarget: { x, y },
        idleTimer: Math.random() * 2 + 1,

        fireTimer: stats.fireRate,
        rotation: 0,

        hitFlash: 0,
        deathTimer: 0,
    };
}

/**
 * Create the Ego Boss.
 */
export function createBoss(x, y, roomId) {
    const stats = ENEMIES.BOSS;
    return {
        type: 'BOSS',
        x, y,
        hp: stats.hp,
        maxHp: stats.hp,
        radius: stats.radius,
        spriteWidth: stats.spriteWidth,
        spriteHeight: stats.spriteHeight,
        roomId,
        aggroState: 'aggro', // boss is always aggro

        orbitAngle: 0,
        orbitCenterX: x,
        orbitCenterY: y,
        fireTimer: stats.fireRate,

        hitFlash: 0,
        deathTimer: 0,
        tendrilPhase: 0,
    };
}

// ── Spawn Initial Entities ──────────────────────────────────────────

/**
 * Create the initial entity list based on ENEMY_SPAWNS.
 * @returns {Array} Array of entity objects
 */
export function spawnInitialEntities() {
    const entities = [];

    // Iterate all spawn tables
    const spawnRooms = ['area1', 'a2r1', 'a2r2', 'a2r3', 'a2r4', 'a2r5', 'area3'];

    for (const roomId of spawnRooms) {
        const spawns = ENEMY_SPAWNS[roomId];
        if (!spawns) continue;

        for (const spawn of spawns) {
            switch (spawn.type) {
                case 'GLIMMER':
                    entities.push(createGlimmer(spawn.x, spawn.y, roomId));
                    break;
                case 'PHANTOM':
                    entities.push(createPhantom(spawn.x, spawn.y, roomId));
                    break;
                case 'PRISM':
                    entities.push(createPrism(spawn.x, spawn.y, roomId));
                    break;
                case 'BOSS':
                    entities.push(createBoss(spawn.x, spawn.y, roomId));
                    break;
            }
        }
    }

    return entities;
}

// ── Aggro System ────────────────────────────────────────────────────

/**
 * Aggro an entity and propagate to nearby same-type entities.
 */
export function aggroEntity(entity, allEntities) {
    if (entity.aggroState === 'dead') return;
    entity.aggroState = 'aggro';

    for (const other of allEntities) {
        if (other === entity) continue;
        if (other.aggroState !== 'idle') continue;
        if (other.roomId !== entity.roomId) continue;

        const dx = other.x - entity.x;
        const dy = other.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= AGGRO_PROPAGATION_RANGE) {
            other.aggroState = 'aggro';
        }
    }
}

// ── Entity Behaviors ────────────────────────────────────────────────

function updateGlimmer(entity, state, dt) {
    const player = state.player;

    if (entity.aggroState === 'idle') {
        // Wander toward idle target
        const dx = entity.idleTarget.x - entity.x;
        const dy = entity.idleTarget.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.3) {
            const angle = Math.atan2(dy, dx);
            const speed = ENEMIES.GLIMMER.speed * dt;
            const nx = entity.x + Math.cos(angle) * speed;
            const ny = entity.y + Math.sin(angle) * speed;
            if (!isSolid(nx, entity.y)) entity.x = nx;
            if (!isSolid(entity.x, ny)) entity.y = ny;
        }

        // Pick new wander target
        entity.idleTimer -= dt;
        if (entity.idleTimer <= 0 || dist <= 0.3) {
            entity.idleTimer = Math.random() * 2 + 1;
            const bounds = ROOM_BOUNDS[entity.roomId];
            if (bounds) {
                entity.idleTarget.x = bounds.x + 1 + Math.random() * (bounds.w - 2);
                entity.idleTarget.y = bounds.y + 1 + Math.random() * (bounds.h - 2);
            } else {
                entity.idleTarget.x = entity.x + (Math.random() - 0.5) * 4;
                entity.idleTarget.y = entity.y + (Math.random() - 0.5) * 4;
            }
        }
    } else if (entity.aggroState === 'aggro') {
        // Chase player with erratic movement
        const dx = player.x - entity.x;
        const dy = player.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.5) {
            let angle = Math.atan2(dy, dx);
            // Add jitter for erratic movement (±15°)
            angle += (Math.random() - 0.5) * 0.52;

            const speed = ENEMIES.GLIMMER.aggroSpeed * dt;
            const nx = entity.x + Math.cos(angle) * speed;
            const ny = entity.y + Math.sin(angle) * speed;
            if (!isSolid(nx, entity.y)) entity.x = nx;
            if (!isSolid(entity.x, ny)) entity.y = ny;
        }
    }

    // Update visual phases
    entity.sparklePhase += dt * 4;
    entity.pulsePhase += dt * 3;
}

function updatePhantom(entity, state, dt) {
    const player = state.player;
    const stats = ENEMIES.PHANTOM;

    if (entity.aggroState === 'idle') {
        // Slow patrol (simplified — just wander like Glimmer but slower)
        const dx = entity.idleTarget.x - entity.x;
        const dy = entity.idleTarget.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.3) {
            const angle = Math.atan2(dy, dx);
            const speed = stats.speed * dt;
            const nx = entity.x + Math.cos(angle) * speed;
            const ny = entity.y + Math.sin(angle) * speed;
            if (!isSolid(nx, entity.y)) entity.x = nx;
            if (!isSolid(entity.x, ny)) entity.y = ny;
        }

        entity.idleTimer -= dt;
        if (entity.idleTimer <= 0 || dist <= 0.3) {
            entity.idleTimer = Math.random() * 3 + 1;
            const bounds = ROOM_BOUNDS[entity.roomId];
            if (bounds) {
                entity.idleTarget.x = bounds.x + 1 + Math.random() * (bounds.w - 2);
                entity.idleTarget.y = bounds.y + 1 + Math.random() * (bounds.h - 2);
            }
        }
    } else if (entity.aggroState === 'aggro') {
        const dx = player.x - entity.x;
        const dy = player.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const isLowHp = entity.hp < entity.maxHp * 0.5;
        const targetDist = isLowHp ? stats.retreatDist : stats.approachDist;

        if (dist < targetDist - 0.5) {
            // Too close — retreat
            const angle = Math.atan2(-dy, -dx);
            const speed = stats.aggroSpeed * dt;
            const nx = entity.x + Math.cos(angle) * speed;
            const ny = entity.y + Math.sin(angle) * speed;
            if (!isSolid(nx, entity.y)) entity.x = nx;
            if (!isSolid(entity.x, ny)) entity.y = ny;
        } else if (dist > targetDist + 0.5) {
            // Too far — approach
            const angle = Math.atan2(dy, dx);
            const speed = stats.aggroSpeed * dt;
            const nx = entity.x + Math.cos(angle) * speed;
            const ny = entity.y + Math.sin(angle) * speed;
            if (!isSolid(nx, entity.y)) entity.x = nx;
            if (!isSolid(entity.x, ny)) entity.y = ny;
        } else {
            // At desired distance — strafe
            const perpAngle = Math.atan2(dy, dx) + (Math.PI / 2) * entity.strafeDir;
            const speed = stats.aggroSpeed * 0.6 * dt;
            const nx = entity.x + Math.cos(perpAngle) * speed;
            const ny = entity.y + Math.sin(perpAngle) * speed;
            if (!isSolid(nx, entity.y)) {
                entity.x = nx;
            } else {
                entity.strafeDir *= -1; // reverse strafe on wall hit
            }
            if (!isSolid(entity.x, ny)) {
                entity.y = ny;
            } else {
                entity.strafeDir *= -1;
            }
        }

        // Fire projectile
        entity.fireTimer -= dt * 1000;
        if (entity.fireTimer <= 0 && dist < 12) {
            entity.fireTimer = stats.fireRate;
            const angle = Math.atan2(dy, dx);
            state.pendingProjectiles = state.pendingProjectiles || [];
            state.pendingProjectiles.push({
                x: entity.x,
                y: entity.y,
                angle,
                speed: stats.projectileSpeed,
                owner: 'phantom',
            });
        }
    }

    // Update trail for afterimage
    entity.trailTimer += dt;
    if (entity.trailTimer >= 0.1) {
        entity.trailTimer = 0;
        entity.trail.pop();
        entity.trail.unshift({ x: entity.x, y: entity.y });
    }

    entity.wavyPhase += dt * 2;
}

function updatePrism(entity, state, dt) {
    const player = state.player;
    const stats = ENEMIES.PRISM;

    if (entity.aggroState === 'idle') {
        // Patrol (same as Phantom idle)
        const dx = entity.idleTarget.x - entity.x;
        const dy = entity.idleTarget.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.3) {
            const angle = Math.atan2(dy, dx);
            const speed = stats.speed * dt;
            const nx = entity.x + Math.cos(angle) * speed;
            const ny = entity.y + Math.sin(angle) * speed;
            if (!isSolid(nx, entity.y)) entity.x = nx;
            if (!isSolid(entity.x, ny)) entity.y = ny;
        }

        entity.idleTimer -= dt;
        if (entity.idleTimer <= 0 || dist <= 0.3) {
            entity.idleTimer = Math.random() * 3 + 1;
            const bounds = ROOM_BOUNDS[entity.roomId];
            if (bounds) {
                entity.idleTarget.x = bounds.x + 1 + Math.random() * (bounds.w - 2);
                entity.idleTarget.y = bounds.y + 1 + Math.random() * (bounds.h - 2);
            }
        }
    } else if (entity.aggroState === 'aggro') {
        // Pursue player
        const dx = player.x - entity.x;
        const dy = player.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 2) {
            const angle = Math.atan2(dy, dx);
            const speed = stats.aggroSpeed * dt;
            const nx = entity.x + Math.cos(angle) * speed;
            const ny = entity.y + Math.sin(angle) * speed;
            if (!isSolid(nx, entity.y)) entity.x = nx;
            if (!isSolid(entity.x, ny)) entity.y = ny;
        }

        // Fire spread shot
        entity.fireTimer -= dt * 1000;
        if (entity.fireTimer <= 0 && dist < 12) {
            entity.fireTimer = stats.fireRate;
            const baseAngle = Math.atan2(dy, dx);
            state.pendingProjectiles = state.pendingProjectiles || [];
            for (let i = 0; i < stats.spreadCount; i++) {
                const offset = (i / (stats.spreadCount - 1) - 0.5) * stats.spreadAngle * 2;
                state.pendingProjectiles.push({
                    x: entity.x,
                    y: entity.y,
                    angle: baseAngle + offset,
                    speed: stats.projectileSpeed,
                    owner: 'prism',
                });
            }
        }
    }

    entity.rotation += dt * 2;
}

function updateBoss(entity, state, dt) {
    const player = state.player;
    const stats = ENEMIES.BOSS;

    // Activate boss when player enters Area 3
    if (!state.flags.bossActive && entity.roomId === 'area3') {
        const playerRoom = getRoomId(player.x, player.y);
        if (playerRoom === 'area3') {
            state.flags.bossActive = true;
            state.hud.messages.push({ text: 'THE EGO AWAKENS', timer: 3 });
        }
    }

    if (!state.flags.bossActive) return;

    // Orbit around arena center
    entity.orbitAngle += stats.speed * dt * 0.3;
    const orbitRadius = 5 + Math.sin(state.time.now * 0.001) * 2;
    const targetX = entity.orbitCenterX + Math.cos(entity.orbitAngle) * orbitRadius;
    const targetY = entity.orbitCenterY + Math.sin(entity.orbitAngle) * orbitRadius;

    // Smoothly move towards orbit position
    const dx = targetX - entity.x;
    const dy = targetY - entity.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) {
        const speed = stats.aggroSpeed * dt;
        const nx = entity.x + (dx / dist) * speed;
        const ny = entity.y + (dy / dist) * speed;
        if (!isSolid(nx, entity.y)) entity.x = nx;
        if (!isSolid(entity.x, ny)) entity.y = ny;
    }

    // Fire projectiles (radial burst pattern)
    entity.fireTimer -= dt * 1000;
    if (entity.fireTimer <= 0) {
        entity.fireTimer = stats.fireRate;
        const burstCount = 8;
        const baseAngle = Math.atan2(player.y - entity.y, player.x - entity.x);
        state.pendingProjectiles = state.pendingProjectiles || [];

        for (let i = 0; i < burstCount; i++) {
            const angle = baseAngle + (i / burstCount) * Math.PI * 2;
            state.pendingProjectiles.push({
                x: entity.x,
                y: entity.y,
                angle,
                speed: stats.projectileSpeed,
                owner: 'boss',
            });
        }
    }

    entity.tendrilPhase += dt;
}

// ── Main Update Loop ────────────────────────────────────────────────

/**
 * Update all entities.
 * @param {object} state - Shared game state
 */
export function update(state) {
    const dt = state.time.dt;

    for (let i = state.entities.length - 1; i >= 0; i--) {
        const entity = state.entities[i];

        // Dead entity cleanup
        if (entity.aggroState === 'dead') {
            entity.deathTimer -= dt;
            if (entity.deathTimer <= 0) {
                // Keep in array for death animation to fully finish
                // Only remove if well past death
                if (entity.deathTimer < -1) {
                    state.entities.splice(i, 1);
                }
            }
            continue;
        }

        // Tick hit flash
        if (entity.hitFlash > 0) {
            entity.hitFlash--;
        }

        // Update room tracking
        const roomId = getRoomId(entity.x, entity.y);
        if (roomId) entity.roomId = roomId;

        // Type-specific behavior
        switch (entity.type) {
            case 'GLIMMER':
                updateGlimmer(entity, state, dt);
                break;
            case 'PHANTOM':
                updatePhantom(entity, state, dt);
                break;
            case 'PRISM':
                updatePrism(entity, state, dt);
                break;
            case 'BOSS':
                updateBoss(entity, state, dt);
                break;
        }
    }
}
