/**
 * combat.js — Hitscan, Damage Application & Weapon Resolution
 * 
 * Resolves weapon fire events: hitscan rays for Handgun/Void Beam,
 * shotgun pellet spread, fist melee range check. Applies damage to
 * entities and triggers aggro propagation.
 */

import { WEAPONS, TILE } from './config.js';
import { isSolid, getTile } from './map.js';
import { aggroEntity } from './entities.js';

// ── Ray-Circle Intersection ─────────────────────────────────────────

/**
 * Test if a ray intersects a circle.
 * @returns {number|null} Distance to intersection, or null if no hit
 */
function rayCircleIntersect(rayOX, rayOY, rayDirX, rayDirY, cx, cy, radius) {
    const dx = rayOX - cx;
    const dy = rayOY - cy;

    const a = rayDirX * rayDirX + rayDirY * rayDirY;
    const b = 2 * (dx * rayDirX + dy * rayDirY);
    const c = dx * dx + dy * dy - radius * radius;

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    // Return nearest positive intersection
    if (t1 > 0) return t1;
    if (t2 > 0) return t2;
    return null;
}

// ── Hitscan Weapon Fire ─────────────────────────────────────────────

/**
 * Fire a hitscan ray from the player. Hits the first entity in range.
 * @returns {{ entity: object, distance: number }|null}
 */
function fireHitscan(state, angle, maxRange) {
    const { player, entities } = state;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    // Find wall distance along this ray (to limit entity checks)
    let wallDist = maxRange;
    {
        let mx = Math.floor(player.x);
        let my = Math.floor(player.y);
        const stepX = dirX >= 0 ? 1 : -1;
        const stepY = dirY >= 0 ? 1 : -1;
        const ddx = Math.abs(dirX) < 1e-10 ? 1e10 : Math.abs(1 / dirX);
        const ddy = Math.abs(dirY) < 1e-10 ? 1e10 : Math.abs(1 / dirY);
        let sdx = dirX >= 0 ? (mx + 1 - player.x) * ddx : (player.x - mx) * ddx;
        let sdy = dirY >= 0 ? (my + 1 - player.y) * ddy : (player.y - my) * ddy;

        for (let i = 0; i < 40; i++) {
            let side;
            if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; }
            else { sdy += ddy; my += stepY; side = 1; }

            if (isSolid(mx, my)) {
                wallDist = Math.min(wallDist, side === 0 ? sdx - ddx : sdy - ddy);
                break;
            }
        }
    }

    // Check entities sorted by distance
    let bestHit = null;
    let bestDist = wallDist;

    for (const entity of entities) {
        if (entity.aggroState === 'dead') continue;
        if (entity.hp <= 0) continue;

        const dist = rayCircleIntersect(
            player.x, player.y, dirX, dirY,
            entity.x, entity.y, entity.radius + 0.15 // slightly generous hitbox
        );

        if (dist !== null && dist < bestDist && dist <= maxRange) {
            bestDist = dist;
            bestHit = { entity, distance: dist };
        }
    }

    return bestHit;
}

// ── Damage Application ──────────────────────────────────────────────

function damageEntity(entity, damage, state) {
    // Boss invulnerability check
    if (entity.type === 'BOSS') {
        const playerTile = getTile(Math.floor(state.player.x), Math.floor(state.player.y));
        if (playerTile !== TILE.LIGHT_WELL) {
            // Not on Light Well — no damage
            if (!state.flags.lightWellHintShown) {
                state.hud.messages.push({ text: 'FIND THE LIGHT', timer: 2 });
                state.flags.lightWellHintShown = true;
            }
            return;
        }
    }

    entity.hp -= damage;
    entity.hitFlash = 3; // frames of white flash

    // Aggro on damage
    aggroEntity(entity, state.entities);

    // Screen shake
    state.effects.screenShake = Math.max(state.effects.screenShake, 3);

    if (entity.hp <= 0) {
        entity.hp = 0;
        entity.aggroState = 'dead';
        entity.deathTimer = 0.33; // death animation duration

        // Increment kill counter
        state.hud.killCount++;

        // Prism drops key
        if (entity.type === 'PRISM') {
            state.pendingKeyDrop = { x: entity.x, y: entity.y };
        }

        // Boss triggers victory
        if (entity.type === 'BOSS') {
            state.flags.victoryTriggered = true;
        }
    }
}

// ── Main Combat Update ──────────────────────────────────────────────

/**
 * Resolve pending weapon fire events.
 * @param {object} state - Shared game state
 */
export function update(state) {
    // Check for pending fire event
    if (!state.pendingFire) return;
    state.pendingFire = false;

    const player = state.player;
    const weapon = WEAPONS[player.currentWeapon];
    if (!weapon) return;

    switch (weapon.type) {
        case 'melee':
            resolveMelee(state, weapon);
            break;
        case 'hitscan':
            resolveHitscan(state, weapon);
            break;
        case 'shotgun':
            resolveShotgun(state, weapon);
            break;
    }
}

function resolveMelee(state, weapon) {
    const { player, entities } = state;

    for (const entity of entities) {
        if (entity.aggroState === 'dead' || entity.hp <= 0) continue;

        const dx = entity.x - player.x;
        const dy = entity.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > weapon.range) continue;

        // Check facing angle
        const angleToEntity = Math.atan2(dy, dx);
        let angleDiff = angleToEntity - player.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) < Math.PI / 6) { // ±30°
            damageEntity(entity, weapon.damage, state);
            return; // Fist hits only one target
        }
    }
}

function resolveHitscan(state, weapon) {
    const hit = fireHitscan(state, state.player.angle, weapon.range);
    if (hit) {
        damageEntity(hit.entity, weapon.damage, state);
    }
}

function resolveShotgun(state, weapon) {
    const { player } = state;
    const pelletDamage = weapon.damage / weapon.pellets; // ~1.25 per pellet

    state.effects.screenShake = Math.max(state.effects.screenShake, 4); // heavier shake

    for (let i = 0; i < weapon.pellets; i++) {
        const offset = (i / (weapon.pellets - 1) - 0.5) * weapon.spread * 2;
        const rayAngle = player.angle + offset;

        const hit = fireHitscan(state, rayAngle, weapon.range);
        if (hit) {
            damageEntity(hit.entity, pelletDamage, state);
        }
    }
}
