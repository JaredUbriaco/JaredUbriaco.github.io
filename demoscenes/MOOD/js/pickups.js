/**
 * pickups.js — Weapon Pickups & Collection Logic
 * 
 * Manages weapon pickups as world entities. Walk within 1 tile to
 * auto-collect. Pickups bob up and down until collected.
 */

import { PICKUP_POSITIONS } from './map.js';

// ── Pickup Factory ──────────────────────────────────────────────────

/**
 * Create a weapon pickup entity.
 */
function createPickup(type, x, y) {
    return {
        type,           // 'HANDGUN' | 'SHOTGUN' | 'VOIDBEAM'
        x, y,
        collected: false,
        bobOffset: 0,   // visual bob (rendered as sprite later)
        bobPhase: Math.random() * Math.PI * 2, // random start phase
    };
}

// ── Initialize Pickups ──────────────────────────────────────────────

/**
 * Create initial pickup entities for the current map.
 * Called once at game start. More pickups added in tasks5/tasks6.
 * @returns {Array} Array of pickup entities
 */
export function createInitialPickups() {
    const pickups = [];

    // Handgun in Area 0
    const hp = PICKUP_POSITIONS.handgun;
    if (hp) {
        pickups.push(createPickup('HANDGUN', hp.x, hp.y));
    }

    // Shotgun in Area 2 Room 4 (Prism Chamber)
    const sp = PICKUP_POSITIONS.shotgun;
    if (sp) {
        pickups.push(createPickup('SHOTGUN', sp.x, sp.y));
    }

    // Void Beam at end of boss corridor
    const vp = PICKUP_POSITIONS.voidbeam;
    if (vp) {
        pickups.push(createPickup('VOIDBEAM', vp.x, vp.y));
    }

    return pickups;
}

// ── Pickup Update ───────────────────────────────────────────────────

/**
 * Update all pickups: bob animation and proximity collection.
 * @param {object} state - Shared game state
 */
export function update(state) {
    const { player, pickups, time } = state;

    for (const pickup of pickups) {
        if (pickup.collected) continue;

        // Bob animation
        pickup.bobOffset = Math.sin(time.now * 0.003 + pickup.bobPhase) * 0.1;

        // Proximity check (auto-collect within 1 tile)
        const dx = pickup.x - player.x;
        const dy = pickup.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1.0) {
            collectPickup(pickup, state);
        }
    }
}

// ── Collection Logic ────────────────────────────────────────────────

function collectPickup(pickup, state) {
    pickup.collected = true;
    const player = state.player;

    switch (pickup.type) {
        case 'HANDGUN':
            if (!player.weapons.includes('HANDGUN')) {
                player.weapons.push('HANDGUN');
            }
            player.currentWeapon = 'HANDGUN';
            player.weaponState.phase = 'idle';
            player.weaponState.timer = 0;
            state.hud.messages.push({ text: 'HANDGUN ACQUIRED', timer: 2 });
            break;

        case 'SHOTGUN':
            if (!player.weapons.includes('SHOTGUN')) {
                player.weapons.push('SHOTGUN');
            }
            player.currentWeapon = 'SHOTGUN';
            player.weaponState.phase = 'idle';
            player.weaponState.timer = 0;
            state.hud.messages.push({ text: 'SHOTGUN ACQUIRED', timer: 2 });
            break;

        case 'VOIDBEAM':
            if (!player.weapons.includes('VOIDBEAM')) {
                player.weapons.push('VOIDBEAM');
            }
            player.currentWeapon = 'VOIDBEAM';
            player.weaponState.phase = 'idle';
            player.weaponState.timer = 0;
            state.hud.messages.push({ text: 'VOID BEAM ACQUIRED', timer: 2 });
            break;

        case 'ASTRAL_KEY':
            player.hasAstralKey = true;
            state.hud.messages.push({ text: 'ASTRAL KEY ACQUIRED', timer: 2.5 });
            break;
    }
}
