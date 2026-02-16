/**
 * renderer.js — Draw Orchestrator
 * 
 * Orchestrates the per-frame draw: clear canvas, call raycaster,
 * then (later) sprites, weapon, HUD, and post-effects.
 * 
 * Does NOT implement drawing itself — dispatches to subsystems.
 */

import { INTERNAL_WIDTH, INTERNAL_HEIGHT, HUE_ROTATE_SPEED } from './config.js';
import { renderWalls } from './raycaster.js';
import { renderAll as renderSprites } from './sprites.js';
import { drawCanvas as drawHud } from './hud.js';
import { getWeaponBob } from './player.js';
import { getRoomId } from './map.js';

// ── Hue Rotation State ──────────────────────────────────────────────
let hueAngle = 0;
const wrapper = document.getElementById('mood-wrapper');

// ── Weapon View Rendering (FPS weapon at bottom of screen) ──────────

function renderWeaponView(ctx, player, time) {
    const cx = INTERNAL_WIDTH / 2;
    const baseY = INTERNAL_HEIGHT - 40;
    const bob = getWeaponBob(player);
    const ws = player.weaponState;

    // Phase-based animation offsets
    let offsetX = 0, offsetY = bob;
    let showFlash = false;

    switch (ws.phase) {
        case 'windup':
            offsetY += 4;  // pull back slightly
            break;
        case 'fire':
            offsetY -= 6;  // recoil up
            showFlash = true;
            break;
        case 'recovery':
            offsetY += 2;  // settling back
            break;
        case 'swapping':
            offsetY += 30; // weapon drops below screen
            break;
    }

    ctx.save();
    ctx.translate(cx + offsetX, baseY + offsetY);

    switch (player.currentWeapon) {
        case 'FIST':
            drawFist(ctx, ws.phase);
            break;
        case 'HANDGUN':
            drawHandgun(ctx, ws.phase, showFlash);
            break;
        case 'SHOTGUN':
            drawShotgun(ctx, ws.phase, showFlash);
            break;
        case 'VOIDBEAM':
            drawVoidBeam(ctx, ws.phase, showFlash, time);
            break;
    }

    ctx.restore();
}

function drawFist(ctx, phase) {
    // Arm
    ctx.fillStyle = '#d4a574';
    ctx.fillRect(-12, -8, 24, 30);
    // Knuckles
    ctx.fillStyle = '#c9956a';
    ctx.beginPath();
    ctx.arc(0, -8, 12, Math.PI, 0);
    ctx.fill();
    // Punch effect: shift forward on fire
    if (phase === 'fire') {
        ctx.fillStyle = 'rgba(255, 255, 200, 0.3)';
        ctx.beginPath();
        ctx.arc(0, -20, 8, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawHandgun(ctx, phase, showFlash) {
    // Gun body
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-8, -20, 16, 28);
    // Barrel
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-4, -30, 8, 12);
    // Grip highlight
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(-6, 0, 4, 8);
    // Muzzle flash
    if (showFlash) {
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(0, -34, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 200, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(0, -34, 10, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawShotgun(ctx, phase, showFlash) {
    // Gun body (longer)
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-10, -28, 20, 36);
    // Barrel (wider)
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-7, -42, 14, 16);
    // Pump grip
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(-8, -10, 16, 8);
    // Muzzle flash (larger)
    if (showFlash) {
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(0, -46, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 160, 0, 0.4)';
        ctx.beginPath();
        ctx.arc(0, -46, 16, 0, Math.PI * 2);
        ctx.fill();
        // Pellet trails
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.6)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const angle = (i / 4 - 0.5) * 0.6 - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(0, -46);
            ctx.lineTo(Math.cos(angle) * 25, -46 + Math.sin(angle) * 25);
            ctx.stroke();
        }
    }
}

function drawVoidBeam(ctx, phase, showFlash, time) {
    // Central orb
    const pulse = Math.sin(time.now * 0.008) * 2;
    const orbRadius = 8 + pulse;

    // Outer glow
    ctx.fillStyle = 'rgba(100, 0, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(0, -15, orbRadius + 6, 0, Math.PI * 2);
    ctx.fill();

    // Core orb
    ctx.fillStyle = '#a040ff';
    ctx.beginPath();
    ctx.arc(0, -15, orbRadius, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright spot
    ctx.fillStyle = '#e0b0ff';
    ctx.beginPath();
    ctx.arc(0, -15, orbRadius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Beam line when firing (from orb up to crosshair area)
    if (showFlash) {
        const beamEndY = -(INTERNAL_HEIGHT - 40 - INTERNAL_HEIGHT / 2 + 15); // weapon pos to screen center
        const beamWidth = 3;
        ctx.strokeStyle = '#c060ff';
        ctx.lineWidth = beamWidth + 2;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(0, beamEndY);
        ctx.stroke();

        ctx.strokeStyle = '#e0a0ff';
        ctx.lineWidth = beamWidth;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(0, beamEndY);
        ctx.stroke();

        ctx.globalAlpha = 1;
    }

    // Radiating lines (idle glow)
    ctx.strokeStyle = 'rgba(160, 64, 255, 0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + time.now * 0.002;
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(Math.cos(angle) * 15, -15 + Math.sin(angle) * 15);
        ctx.stroke();
    }
}

function drawBossArenaFloor(ctx, state) {
    if (getRoomId(state.player.x, state.player.y) !== 'area3') return;

    const pitchShift = state.player.pitch * 16;
    const topY = Math.floor(INTERNAL_HEIGHT * 0.58 + pitchShift);
    const bottomY = INTERNAL_HEIGHT;
    const topInset = 120;
    const centerX = INTERNAL_WIDTH / 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(topInset, topY);
    ctx.lineTo(INTERNAL_WIDTH - topInset, topY);
    ctx.lineTo(INTERNAL_WIDTH, bottomY);
    ctx.lineTo(0, bottomY);
    ctx.closePath();
    ctx.clip();

    // Colored tile strips that widen with depth.
    const rows = 14;
    for (let r = 0; r < rows; r++) {
        const t0 = r / rows;
        const t1 = (r + 1) / rows;
        const y0 = topY + (bottomY - topY) * t0;
        const y1 = topY + (bottomY - topY) * t1;
        const halfW0 = topInset + ((INTERNAL_WIDTH / 2) - topInset) * t0;
        const halfW1 = topInset + ((INTERNAL_WIDTH / 2) - topInset) * t1;

        const cols = 12;
        for (let c = 0; c < cols; c++) {
            const x0 = centerX - halfW0 + (2 * halfW0 * c) / cols;
            const x1 = centerX - halfW0 + (2 * halfW0 * (c + 1)) / cols;
            const x2 = centerX - halfW1 + (2 * halfW1 * (c + 1)) / cols;
            const x3 = centerX - halfW1 + (2 * halfW1 * c) / cols;

            const hue = (state.time.now * 0.02 + c * 18 + r * 7) % 360;
            const alpha = ((r + c) % 2 === 0) ? 0.18 : 0.11;
            ctx.fillStyle = `hsla(${hue}, 80%, 45%, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y0);
            ctx.lineTo(x2, y1);
            ctx.lineTo(x3, y1);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Three "light" pads that mirror the new minimap zones.
    const pads = [
        { x: centerX - 82, y: topY + 36 },
        { x: centerX + 82, y: topY + 36 },
        { x: centerX, y: topY + 96 },
    ];
    for (const pad of pads) {
        ctx.fillStyle = 'rgba(80, 235, 255, 0.28)';
        ctx.fillRect(pad.x - 18, pad.y - 10, 36, 20);
        ctx.strokeStyle = 'rgba(160, 250, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(pad.x - 18, pad.y - 10, 36, 20);
    }

    ctx.restore();
}

// ── Debug Path Rendering ────────────────────────────────────────────
function drawDebugPath(ctx, state) {
    // Only draw if AI is active and debug is enabled (or just always for now if requested)
    const path = state.ai.telemetry?.pathNodes;
    if (path && path.length > 0) {
        ctx.save();

        // Mini-Map overlay in the top-right.
        const mapSize = 150;
        const mapX = INTERNAL_WIDTH - mapSize - 10;
        const mapY = 10;
        const scale = 4; // 1 tile = 4 pixels

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(mapX, mapY, mapSize, mapSize);

        // Clip to map
        ctx.beginPath();
        ctx.rect(mapX, mapY, mapSize, mapSize);
        ctx.clip();

        // Center map on player
        const cx = mapX + mapSize / 2;
        const cy = mapY + mapSize / 2;
        const px = state.player.x;
        const py = state.player.y;

        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-px, -py);

        // Draw Track (if available in state)
        if (state.ai.debugTrack) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            state.ai.debugTrack.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.stroke();
            // Nodes
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            state.ai.debugTrack.forEach(p => {
                ctx.fillRect(p.x - 0.25, p.y - 0.25, 0.5, 0.5);
            });
        }

        // Draw Path (GREEN)
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        path.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        // Draw Bot Target (RED X)
        if (state.ai.telemetry.targetPos) {
            const tx = state.ai.telemetry.targetPos.x;
            const ty = state.ai.telemetry.targetPos.y;
            ctx.strokeStyle = '#f00';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(tx - 1, ty - 1); ctx.lineTo(tx + 1, ty + 1);
            ctx.moveTo(tx + 1, ty - 1); ctx.lineTo(tx - 1, ty + 1);
            ctx.stroke();
        }

        // Draw Player/Bot (Yellow dot)
        ctx.fillStyle = '#ff0';
        ctx.beginPath();
        ctx.arc(px, py, 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Draw Enemies (Red dots)
        ctx.fillStyle = '#f00';
        state.entities.forEach(e => {
            if (e.hp > 0) {
                ctx.beginPath();
                ctx.arc(e.x, e.y, 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        ctx.restore();
    }
}

// ── Main Draw Function ──────────────────────────────────────────────

/**
 * Main draw function. Called once per frame from the game loop.
 * @param {object} state - Shared game state
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 */
export function draw(state, ctx) {
    const { player, time, effects } = state;

    // ── Screen Shake Offset ─────────────────────────────────────
    let shakeX = 0, shakeY = 0;
    if (effects.screenShake > 0) {
        shakeX = (Math.random() - 0.5) * 4;
        shakeY = (Math.random() - 0.5) * 4;
        ctx.save();
        ctx.translate(shakeX, shakeY);
    }

    // ── 1. Clear Canvas ─────────────────────────────────────────
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

    // ── 2. Raycaster: Walls + Floor + Ceiling ───────────────────
    renderWalls(ctx, player, time.now, state);

    // ── 2.5 Boss Arena Floor Overlay ─────────────────────────────
    drawBossArenaFloor(ctx, state);

    // ── 3. Sprites (entities + projectiles + pickups) ───────────
    renderSprites(ctx, state);

    // ── 4. Weapon Rendering (FPS view) ──────────────────────────
    renderWeaponView(ctx, player, time);

    // ── 5. HUD Drawing (canvas elements) ────────────────────────
    drawHud(ctx, state);

    // ── 5.5 Debug Overlay (Minimap) ─────────────────────────────
    drawDebugPath(ctx, state);

    // ── 6. Post-Effects ─────────────────────────────────────────
    // Distortion overlay
    if (effects.distortion > 0) {
        ctx.fillStyle = `rgba(255, 0, 255, ${Math.min(0.2, effects.distortion * 0.4)})`;
        ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
    }

    // Victory fade-to-white
    if (effects.victoryAlpha > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${effects.victoryAlpha})`;
        ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
    }

    // ── Restore from screen shake ───────────────────────────────
    if (effects.screenShake > 0) {
        ctx.restore();
    }

    // ── Hue Rotation (CSS filter on wrapper) ────────────────────
    hueAngle = (hueAngle + HUE_ROTATE_SPEED * time.dt * 1000) % 360;
    wrapper.style.filter = `hue-rotate(${hueAngle}deg)`;
}
