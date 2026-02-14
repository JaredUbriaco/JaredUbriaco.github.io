/**
 * triggers.js — Doors, Buttons, Key Door, Secret Wall, Interactions
 * 
 * Manages all interactive world elements: door opening animations,
 * button activation, key door gating, and secret wall reveal.
 */

import {
    TILE, DOOR_OPEN_DURATION,
    INTERACTION_RANGE, INTERACTION_ANGLE,
} from './config.js';

import { getTile, isSolid, doors, grid } from './map.js';
import { consumeInteract } from './input.js';

// ── Helpers ─────────────────────────────────────────────────────────

/** Push a timed message to the HUD state. */
function pushMessage(state, text, duration) {
    state.hud.messages.push({ text, timer: duration });
}

// ── Angle Utilities ─────────────────────────────────────────────────

/** Normalize angle to [-PI, PI] */
function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

/**
 * Check if a target position is within interaction range and facing angle.
 */
function isInInteractionRange(px, py, pAngle, tx, ty) {
    const dx = tx - px;
    const dy = ty - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > INTERACTION_RANGE) return false;

    const angleToTarget = Math.atan2(dy, dx);
    const angleDiff = Math.abs(normalizeAngle(angleToTarget - pAngle));
    return angleDiff < INTERACTION_ANGLE;
}

// ── Find Interactable Doors ─────────────────────────────────────────

/**
 * Search for interactable door tiles near the player.
 * Returns the door entry if found, or null.
 */
function findNearbyDoor(px, py, pAngle) {
    // Check a grid area around the player
    const searchRange = Math.ceil(INTERACTION_RANGE) + 1;
    const playerCol = Math.floor(px);
    const playerRow = Math.floor(py);

    let bestDoor = null;
    let bestDist = Infinity;

    for (let dy = -searchRange; dy <= searchRange; dy++) {
        for (let dx = -searchRange; dx <= searchRange; dx++) {
            const col = playerCol + dx;
            const row = playerRow + dy;
            const tile = getTile(col, row);

            // Is this a door-type tile?
            if (tile !== TILE.DOOR && tile !== TILE.DOOR_LOCKED_BUTTON && tile !== TILE.DOOR_LOCKED_KEY) {
                continue;
            }

            // Center of this tile
            const tileCX = col + 0.5;
            const tileCY = row + 0.5;

            // Check range and facing
            if (!isInInteractionRange(px, py, pAngle, tileCX, tileCY)) continue;

            const dist = Math.sqrt((tileCX - px) ** 2 + (tileCY - py) ** 2);
            if (dist < bestDist) {
                bestDist = dist;
                const doorKey = `${col},${row}`;
                bestDoor = { key: doorKey, door: doors[doorKey], tile, col, row };
            }
        }
    }

    return bestDoor;
}

// ── Find Button ─────────────────────────────────────────────────────

function findNearbyButton(px, py, pAngle) {
    const searchRange = Math.ceil(INTERACTION_RANGE) + 1;
    const playerCol = Math.floor(px);
    const playerRow = Math.floor(py);

    for (let dy = -searchRange; dy <= searchRange; dy++) {
        for (let dx = -searchRange; dx <= searchRange; dx++) {
            const col = playerCol + dx;
            const row = playerRow + dy;
            if (getTile(col, row) !== TILE.BUTTON) continue;

            const tileCX = col + 0.5;
            const tileCY = row + 0.5;
            if (isInInteractionRange(px, py, pAngle, tileCX, tileCY)) {
                return { col, row };
            }
        }
    }
    return null;
}

// ── Find Secret Wall ────────────────────────────────────────────────

function findNearbySecretWall(px, py, pAngle) {
    const searchRange = Math.ceil(INTERACTION_RANGE) + 1;
    const playerCol = Math.floor(px);
    const playerRow = Math.floor(py);

    for (let dy = -searchRange; dy <= searchRange; dy++) {
        for (let dx = -searchRange; dx <= searchRange; dx++) {
            const col = playerCol + dx;
            const row = playerRow + dy;
            if (getTile(col, row) !== TILE.SECRET_WALL) continue;

            const tileCX = col + 0.5;
            const tileCY = row + 0.5;
            if (isInInteractionRange(px, py, pAngle, tileCX, tileCY)) {
                return { col, row };
            }
        }
    }
    return null;
}

// ── Main Update ─────────────────────────────────────────────────────

/**
 * Update triggers system: handle E-key interactions and door animations.
 * @param {object} state - Shared game state
 */
export function update(state) {
    const dt = state.time.dt;
    const p = state.player;

    // ── Animate Opening Doors ───────────────────────────────────
    for (const key in doors) {
        const door = doors[key];
        if (door.opening && door.openProgress < 1) {
            door.openProgress += dt / DOOR_OPEN_DURATION;
            if (door.openProgress >= 1) {
                door.openProgress = 1;
                door.open = true;
                door.opening = false;
                // Mark tile as EMPTY so raycaster and collision treat it as open
                grid[door.y][door.x] = TILE.EMPTY;
            }
        }
    }

    // ── E-Key Interaction ───────────────────────────────────────
    let wantsInteract;
    if (state.ai.active) {
        wantsInteract = state.ai.input.interact;
        state.ai.input.interact = false; // consume
    } else {
        wantsInteract = consumeInteract();
    }

    if (!wantsInteract) return;

    // Priority: Door > Button > Secret Wall

    // Try door interaction
    const doorHit = findNearbyDoor(p.x, p.y, p.angle);
    if (doorHit && doorHit.door && !doorHit.door.open && !doorHit.door.opening) {
        const { door, tile } = doorHit;

        if (tile === TILE.DOOR) {
            // Regular door — always openable
            door.opening = true;
            return;
        }

        if (tile === TILE.DOOR_LOCKED_BUTTON) {
            if (state.flags.buttonPressed) {
                door.locked = false;
                door.opening = true;
            } else {
                pushMessage(state, 'GATE IS LOCKED', 1.5);
            }
            return;
        }

        if (tile === TILE.DOOR_LOCKED_KEY) {
            if (p.hasAstralKey) {
                door.locked = false;
                door.opening = true;
            } else {
                pushMessage(state, 'REQUIRES ASTRAL KEY', 1.5);
            }
            return;
        }
    }

    // Try button interaction
    const buttonHit = findNearbyButton(p.x, p.y, p.angle);
    if (buttonHit && !state.flags.buttonPressed) {
        // Check if all enemies in Area 1 are dead
        const area1Alive = state.entities.filter(e => e.roomId === 'area1' && e.hp > 0).length;
        if (area1Alive > 0) {
            pushMessage(state, 'ENEMIES REMAIN', 1.5);
        } else {
            state.flags.buttonPressed = true;
            state.flags.area1Cleared = true;
            pushMessage(state, 'GATE UNLOCKED', 2);

            // Unlock all button-locked doors
            for (const key in doors) {
                if (doors[key].lockType === 'button') {
                    doors[key].locked = false;
                }
            }
        }
        return;
    }

    // Try secret wall interaction
    const secretHit = findNearbySecretWall(p.x, p.y, p.angle);
    if (secretHit && !state.flags.secretFound) {
        const { col, row } = secretHit;
        grid[row][col] = TILE.EMPTY; // reveal passage
        state.flags.secretFound = true;
        pushMessage(state, 'YOU FOUND ME', 3);
        return;
    }
}
