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
    renderWalls(ctx, player, time.now);

    // ── 3. Sprites (entities + projectiles + pickups) ───────────
    renderSprites(ctx, state);

    // ── 4. Weapon Rendering (FPS view) ──────────────────────────
    renderWeaponView(ctx, player, time);

    // ── 5. HUD Drawing (canvas elements) ────────────────────────
    drawHud(ctx, state);

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
