/**
 * player.js — Player Movement, Collision & Weapon State
 * 
 * Handles WASD movement, mouse look (yaw + pitch), circle-vs-grid
 * collision with wall sliding, weapon state machine, and walk bob.
 */

import {
    PLAYER_SPEED, PLAYER_RADIUS, PLAYER_FOV,
    MOUSE_SENSITIVITY, PITCH_LIMIT,
    WEAPONS, WEAPON_SWAP_DELAY,
} from './config.js';

import { isKeyDown, getMouseDelta, isMouseDown, consumeMouseClick, consumeWeaponSlot } from './input.js';
import { isSolid, getRoomId, ROOMS } from './map.js';

// ── Collision Detection ─────────────────────────────────────────────

/**
 * Check if a circle at (cx, cy) with given radius overlaps any solid tile.
 */
function collidesWithGrid(cx, cy, radius) {
    const minX = Math.floor(cx - radius);
    const maxX = Math.floor(cx + radius);
    const minY = Math.floor(cy - radius);
    const maxY = Math.floor(cy + radius);

    for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
            if (isSolid(gx, gy)) {
                // Check if circle actually overlaps this grid cell
                // Find closest point on grid cell to circle center
                const closestX = Math.max(gx, Math.min(cx, gx + 1));
                const closestY = Math.max(gy, Math.min(cy, gy + 1));
                const dx = cx - closestX;
                const dy = cy - closestY;
                if (dx * dx + dy * dy < radius * radius) {
                    return true;
                }
            }
        }
    }
    return false;
}

// ── Player Update ───────────────────────────────────────────────────

/**
 * Update player state: movement, collision, weapon, walk bob.
 * @param {object} state - Shared game state
 */
export function update(state) {
    const p = state.player;
    const dt = state.time.dt;

    // ── Mouse Look ──────────────────────────────────────────────
    let lookDX, lookDY;

    if (state.ai.active) {
        // Read from AI synthetic input
        lookDX = state.ai.input.lookDX;
        lookDY = state.ai.input.lookDY;
    } else {
        const mouse = getMouseDelta();
        lookDX = mouse.dx;
        lookDY = mouse.dy;
    }

    // Yaw (horizontal turn)
    p.angle += lookDX * MOUSE_SENSITIVITY;
    // Normalize angle to [0, 2π)
    p.angle = ((p.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // Pitch (vertical look)
    p.pitch += lookDY * MOUSE_SENSITIVITY;
    p.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p.pitch));

    // ── WASD Movement ───────────────────────────────────────────
    let moveX = 0, moveY = 0;

    if (state.ai.active) {
        // AI synthetic movement
        const ai = state.ai.input;
        if (ai.moveForward)  { moveX += Math.cos(p.angle); moveY += Math.sin(p.angle); }
        if (ai.moveBack)     { moveX -= Math.cos(p.angle); moveY -= Math.sin(p.angle); }
        if (ai.strafeLeft)   { moveX += Math.cos(p.angle - Math.PI / 2); moveY += Math.sin(p.angle - Math.PI / 2); }
        if (ai.strafeRight)  { moveX += Math.cos(p.angle + Math.PI / 2); moveY += Math.sin(p.angle + Math.PI / 2); }
    } else {
        if (isKeyDown('KeyW')) { moveX += Math.cos(p.angle); moveY += Math.sin(p.angle); }
        if (isKeyDown('KeyS')) { moveX -= Math.cos(p.angle); moveY -= Math.sin(p.angle); }
        if (isKeyDown('KeyA')) { moveX += Math.cos(p.angle - Math.PI / 2); moveY += Math.sin(p.angle - Math.PI / 2); }
        if (isKeyDown('KeyD')) { moveX += Math.cos(p.angle + Math.PI / 2); moveY += Math.sin(p.angle + Math.PI / 2); }
    }

    // Normalize diagonal movement
    const moveLen = Math.sqrt(moveX * moveX + moveY * moveY);
    if (moveLen > 0) {
        moveX /= moveLen;
        moveY /= moveLen;
    }

    const isMoving = moveLen > 0;

    // Apply speed
    const stepX = moveX * PLAYER_SPEED * dt;
    const stepY = moveY * PLAYER_SPEED * dt;

    // ── Collision with Wall Sliding ─────────────────────────────
    // Try X movement independently
    const newX = p.x + stepX;
    if (!collidesWithGrid(newX, p.y, PLAYER_RADIUS)) {
        p.x = newX;
    }

    // Try Y movement independently
    const newY = p.y + stepY;
    if (!collidesWithGrid(p.x, newY, PLAYER_RADIUS)) {
        p.y = newY;
    }

    // ── Walk Cycle (for weapon bob) ─────────────────────────────
    if (isMoving) {
        p.walkCycle += PLAYER_SPEED * dt * 6;
    } else {
        p.walkCycle *= 0.9; // smooth decay to zero
    }

    // ── Room Detection ──────────────────────────────────────────
    const roomId = getRoomId(p.x, p.y);
    if (roomId && roomId !== state.hud.currentRoomId) {
        state.hud.currentRoomId = roomId;
        const room = ROOMS[roomId];
        if (room && room.label) {
            state.hud.currentRoomLabel = room.label;
            state.hud.roomChanged = true; // signal main.js to update DOM
        }
    }

    // ── Weapon State Machine ────────────────────────────────────
    updateWeaponState(p, state, dt);
}

// ── Weapon State Machine ────────────────────────────────────────────

function updateWeaponState(p, state, dt) {
    const ws = p.weaponState;
    const weapon = WEAPONS[p.currentWeapon];

    // Tick timer
    if (ws.timer > 0) {
        ws.timer -= dt * 1000; // timer is in ms
        if (ws.timer <= 0) {
            advanceWeaponPhase(p, state);
        }
        return; // Don't process input while in a phase
    }

    // ── Weapon Switching ────────────────────────────────────────
    let slotRequest;
    if (state.ai.active) {
        slotRequest = state.ai.input.weaponSlot;
        state.ai.input.weaponSlot = null; // consume
    } else {
        slotRequest = consumeWeaponSlot();
    }

    if (slotRequest > 0 && ws.phase === 'idle') {
        const slotMap = { 1: 'FIST', 2: 'HANDGUN', 3: 'SHOTGUN' };
        const targetWeapon = slotMap[slotRequest];
        if (targetWeapon && targetWeapon !== p.currentWeapon && p.weapons.includes(targetWeapon)) {
            ws.phase = 'swapping';
            ws.timer = WEAPON_SWAP_DELAY;
            ws.swapTarget = targetWeapon;
            return;
        }
    }

    // ── Fire Trigger ────────────────────────────────────────────
    let wantsFire;
    if (state.ai.active) {
        wantsFire = state.ai.input.fire;
    } else {
        wantsFire = isMouseDown();
        consumeMouseClick(); // consume the click event
    }

    if (wantsFire && ws.phase === 'idle' && weapon) {
        ws.phase = 'windup';
        ws.timer = weapon.windupMs;
    }
}

function advanceWeaponPhase(p, state) {
    const ws = p.weaponState;
    const weapon = WEAPONS[p.currentWeapon];

    switch (ws.phase) {
        case 'windup':
            ws.phase = 'fire';
            ws.timer = weapon.fireMs;
            // Mark that a fire event needs to be resolved by combat.js
            state.pendingFire = true;
            break;

        case 'fire':
            ws.phase = 'recovery';
            ws.timer = weapon.recoveryMs;
            break;

        case 'recovery':
            ws.phase = 'idle';
            ws.timer = 0;
            break;

        case 'swapping':
            if (ws.swapTarget) {
                p.currentWeapon = ws.swapTarget;
                ws.swapTarget = null;
            }
            ws.phase = 'idle';
            ws.timer = 0;
            break;

        default:
            ws.phase = 'idle';
            ws.timer = 0;
    }
}

// ── Weapon Bob Value (for renderer) ─────────────────────────────────

/**
 * Get current weapon bob offset in pixels.
 */
export function getWeaponBob(player) {
    return Math.sin(player.walkCycle) * 3;
}
