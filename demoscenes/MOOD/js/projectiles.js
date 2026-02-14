/**
 * projectiles.js — Projectile Movement & Collision
 * 
 * Manages enemy projectiles: movement, wall collision, player collision.
 * Projectiles are visual-only (no player HP loss) but trigger distortion.
 */

import { isSolid } from './map.js';

/**
 * Create a projectile entity.
 */
export function createProjectile(x, y, angle, speed, owner) {
    return {
        x, y,
        angle,
        speed,
        owner,       // 'phantom' | 'prism' | 'boss'
        age: 0,
        alive: true,
        trail: [{ x, y }, { x, y }, { x, y }],
        trailTimer: 0,
    };
}

/**
 * Update all projectiles: movement, collisions, lifetime.
 * @param {object} state - Shared game state
 */
export function update(state) {
    const { player, projectiles, time } = state;
    const dt = time.dt;

    // Spawn pending projectiles from entities
    if (state.pendingProjectiles && state.pendingProjectiles.length > 0) {
        for (const p of state.pendingProjectiles) {
            projectiles.push(createProjectile(p.x, p.y, p.angle, p.speed, p.owner));
        }
        state.pendingProjectiles = [];
    }

    // Update existing projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];

        // Movement
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;
        p.age += dt;

        // Trail update
        p.trailTimer += dt;
        if (p.trailTimer >= 0.05) {
            p.trailTimer = 0;
            p.trail.pop();
            p.trail.unshift({ x: p.x, y: p.y });
        }

        // Wall collision
        if (isSolid(Math.floor(p.x), Math.floor(p.y))) {
            projectiles.splice(i, 1);
            continue;
        }

        // Player collision (within 0.5 tiles)
        const dx = p.x - player.x;
        const dy = p.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) {
            // Visual distortion (no HP damage)
            state.effects.distortion = Math.max(state.effects.distortion, 0.5);
            projectiles.splice(i, 1);
            continue;
        }

        // Lifetime (10 seconds max)
        if (p.age > 10) {
            projectiles.splice(i, 1);
            continue;
        }
    }
}
