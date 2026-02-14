/**
 * sprites.js — Billboard Sprite Rendering
 * 
 * Projects world-space entities onto the 2D screen using the camera
 * transform. Handles z-buffer clipping, draw ordering, and per-type
 * visual dispatch. All visuals are canvas primitives.
 */

import { INTERNAL_WIDTH, INTERNAL_HEIGHT, PLAYER_FOV, PROJECTION_PLANE, PITCH_SCALE } from './config.js';
import { zBuffer } from './raycaster.js';

// ── Camera Plane (perpendicular to direction, scaled by FOV) ────────
// The camera plane defines the width of the view frustum.
const planeLength = Math.tan(PLAYER_FOV / 2);

// ── Render All Sprites ──────────────────────────────────────────────

/**
 * Render all visible sprites (entities, projectiles, pickups).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state - Game state
 */
export function renderAll(ctx, state) {
    const { player, entities, projectiles, pickups } = state;

    // Collect all renderable sprites
    const sprites = [];

    // Entities (alive + death animation)
    for (const e of entities) {
        if (e.aggroState === 'dead' && e.deathTimer < -0.3) continue;
        sprites.push({
            x: e.x, y: e.y,
            type: 'entity',
            entity: e,
            width: e.spriteWidth || 0.4,
            height: e.spriteHeight || 0.4,
        });

        // Phantom trail afterimages
        if (e.type === 'PHANTOM' && e.trail) {
            for (let t = 0; t < e.trail.length; t++) {
                sprites.push({
                    x: e.trail[t].x, y: e.trail[t].y,
                    type: 'trail',
                    entity: e,
                    alpha: 0.3 - t * 0.1,
                    width: e.spriteWidth || 0.6,
                    height: e.spriteHeight || 1.2,
                });
            }
        }
    }

    // Projectiles
    for (const p of projectiles) {
        sprites.push({
            x: p.x, y: p.y,
            type: 'projectile',
            projectile: p,
            width: 0.3,
            height: 0.3,
        });
    }

    // Uncollected pickups
    for (const pk of pickups) {
        if (pk.collected) continue;
        sprites.push({
            x: pk.x, y: pk.y + (pk.bobOffset || 0),
            type: 'pickup',
            pickup: pk,
            width: 0.4,
            height: 0.4,
        });
    }

    if (sprites.length === 0) return;

    // ── Camera transform values ─────────────────────────────────
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    const planeX = -dirY * planeLength;
    const planeY = dirX * planeLength;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const horizonY = INTERNAL_HEIGHT / 2 + player.pitch * PITCH_SCALE;

    // ── Transform and sort ──────────────────────────────────────
    const transformed = [];

    for (const sprite of sprites) {
        const dx = sprite.x - player.x;
        const dy = sprite.y - player.y;

        // Camera-space transform
        const transformX = invDet * (dirY * dx - dirX * dy);
        const transformY = invDet * (-planeY * dx + planeX * dy);

        // Skip if behind camera
        if (transformY <= 0.1) continue;

        // Screen X
        const screenX = Math.floor((INTERNAL_WIDTH / 2) * (1 + transformX / transformY));

        // Sprite scale
        const scale = PROJECTION_PLANE / transformY;

        // Sprite screen dimensions
        const spriteScreenWidth = Math.abs(Math.floor(sprite.width * scale));
        const spriteScreenHeight = Math.abs(Math.floor(sprite.height * scale));

        // Screen Y (centered on horizon, adjusted by pitch)
        const screenY = Math.floor(horizonY - spriteScreenHeight / 2);

        transformed.push({
            ...sprite,
            transformY,
            screenX,
            screenY,
            spriteScreenWidth,
            spriteScreenHeight,
            scale,
        });
    }

    // Sort far to near (painter's algorithm)
    transformed.sort((a, b) => b.transformY - a.transformY);

    // ── Draw each sprite ────────────────────────────────────────
    for (const s of transformed) {
        drawSprite(ctx, s, state.time);
    }
}

// ── Draw Single Sprite with Z-Buffer Clipping ───────────────────────

function drawSprite(ctx, s, time) {
    const startX = Math.max(0, Math.floor(s.screenX - s.spriteScreenWidth / 2));
    const endX = Math.min(INTERNAL_WIDTH - 1, Math.floor(s.screenX + s.spriteScreenWidth / 2));
    const startY = Math.max(0, s.screenY);
    const endY = Math.min(INTERNAL_HEIGHT - 1, s.screenY + s.spriteScreenHeight);

    if (startX >= endX || startY >= endY) return;

    // Check if at least one column is visible (not behind a wall)
    let anyVisible = false;
    for (let col = startX; col <= endX; col++) {
        if (zBuffer[col] > s.transformY) {
            anyVisible = true;
            break;
        }
    }
    if (!anyVisible) return;

    ctx.save();

    // Trail afterimage: set alpha
    if (s.type === 'trail') {
        ctx.globalAlpha = Math.max(0.05, s.alpha || 0.2);
    }

    // Clip to visible columns (simple approach: draw full sprite, rely on z-buffer check above)
    // For proper per-column clipping, we'd need to draw strip by strip.
    // Simplified: if the center column is visible, draw the whole thing.
    // This is acceptable for < 30 entities.

    switch (s.type) {
        case 'entity':
            drawEntity(ctx, s, time);
            break;
        case 'trail':
            drawEntityGhost(ctx, s, time);
            break;
        case 'projectile':
            drawProjectile(ctx, s, time);
            break;
        case 'pickup':
            drawPickup(ctx, s, time);
            break;
    }

    ctx.restore();
}

// ── Entity Type Visuals ─────────────────────────────────────────────

function drawEntity(ctx, s, time) {
    const e = s.entity;
    const cx = s.screenX;
    const cy = s.screenY + s.spriteScreenHeight / 2;
    const r = s.spriteScreenWidth / 2;

    // Hit flash: draw white
    const isFlashing = e.hitFlash > 0;

    // Death animation: shrink
    let deathScale = 1;
    if (e.aggroState === 'dead') {
        deathScale = Math.max(0, 1 + e.deathTimer * 3); // shrinks to 0 over 0.33s
        if (deathScale <= 0) return;
    }

    switch (e.type) {
        case 'GLIMMER':
            drawGlimmer(ctx, cx, cy, r * deathScale, e, time, isFlashing);
            break;
        case 'PHANTOM':
            drawPhantom(ctx, cx, cy, r * deathScale, s.spriteScreenHeight * deathScale, e, time, isFlashing);
            break;
        case 'PRISM':
            drawPrism(ctx, cx, cy, r * deathScale, e, time, isFlashing);
            break;
        case 'BOSS':
            drawBoss(ctx, cx, cy, r * deathScale, e, time, isFlashing);
            break;
    }

    // Death particles
    if (e.aggroState === 'dead' && e.deathTimer > -0.3) {
        drawDeathParticles(ctx, cx, cy, r, e, time);
    }
}

function drawGlimmer(ctx, cx, cy, r, entity, time, flash) {
    const pulseR = r * (0.8 + 0.2 * Math.sin(entity.pulsePhase));

    // Core orb
    ctx.fillStyle = flash ? '#fff' : 'rgba(200, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.fill();

    // Outer glow
    ctx.fillStyle = flash ? 'rgba(255,255,255,0.5)' : 'rgba(0, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle dots
    if (!flash) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let i = 0; i < 5; i++) {
            const angle = entity.sparklePhase + (i / 5) * Math.PI * 2;
            const dist = pulseR * 1.3;
            const sx = cx + Math.cos(angle) * dist;
            const sy = cy + Math.sin(angle) * dist;
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(1, r * 0.15), 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawPhantom(ctx, cx, cy, r, h, entity, time, flash) {
    const halfH = h / 2;

    // Body (wavering column)
    ctx.fillStyle = flash ? '#fff' : 'rgba(180, 60, 200, 0.8)';
    ctx.beginPath();
    const waveA = Math.sin(entity.wavyPhase) * r * 0.3;
    const waveB = Math.sin(entity.wavyPhase + 1) * r * 0.3;
    ctx.moveTo(cx - r + waveA, cy + halfH);
    ctx.quadraticCurveTo(cx - r * 0.6 + waveB, cy, cx - r * 0.3, cy - halfH);
    ctx.lineTo(cx + r * 0.3, cy - halfH);
    ctx.quadraticCurveTo(cx + r * 0.6 - waveB, cy, cx + r - waveA, cy + halfH);
    ctx.closePath();
    ctx.fill();

    // Eyes
    if (!flash) {
        const eyeY = cy - halfH * 0.4;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx - r * 0.25, eyeY, Math.max(1, r * 0.12), 0, Math.PI * 2);
        ctx.arc(cx + r * 0.25, eyeY, Math.max(1, r * 0.12), 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawPrism(ctx, cx, cy, r, entity, time, flash) {
    const rot = entity.rotation;
    const sides = 4; // diamond shape

    // Outer shape
    ctx.fillStyle = flash ? '#fff' : `hsl(${(rot * 60) % 360}, 80%, 60%)`;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = rot + (i / sides) * Math.PI * 2;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Inner concentric shape
    if (!flash) {
        ctx.fillStyle = `hsl(${(rot * 60 + 120) % 360}, 90%, 70%)`;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = rot + (i / sides) * Math.PI * 2 + 0.3;
            const px = cx + Math.cos(angle) * r * 0.5;
            const py = cy + Math.sin(angle) * r * 0.5;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    }
}

function drawBoss(ctx, cx, cy, r, entity, time, flash) {
    // Pulsing mass
    const pulse = r * (0.9 + 0.1 * Math.sin(time.now * 0.003));

    ctx.fillStyle = flash ? '#fff' : `hsl(${10 + Math.sin(time.now * 0.002) * 20}, 80%, 35%)`;
    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.fill();

    // Tendrils
    if (!flash) {
        ctx.strokeStyle = `hsl(${30 + Math.sin(time.now * 0.003) * 15}, 70%, 40%)`;
        ctx.lineWidth = Math.max(1, r * 0.08);
        for (let i = 0; i < 8; i++) {
            const baseAngle = (i / 8) * Math.PI * 2 + entity.tendrilPhase;
            const ctrlAngle = baseAngle + Math.sin(time.now * 0.004 + i) * 0.5;
            const endX = cx + Math.cos(baseAngle) * r * 1.8;
            const endY = cy + Math.sin(baseAngle) * r * 1.8;
            const ctrlX = cx + Math.cos(ctrlAngle) * r * 1.2;
            const ctrlY = cy + Math.sin(ctrlAngle) * r * 1.2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(baseAngle) * pulse * 0.8, cy + Math.sin(baseAngle) * pulse * 0.8);
            ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
            ctx.stroke();
        }

        // Eye
        ctx.fillStyle = '#200';
        ctx.beginPath();
        ctx.arc(cx, cy, pulse * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f80';
        ctx.beginPath();
        ctx.arc(cx, cy, pulse * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cx, cy, pulse * 0.08, 0, Math.PI * 2);
        ctx.fill();
    }

    entity.tendrilPhase += time.dt * 0.5;
}

function drawEntityGhost(ctx, s, time) {
    const e = s.entity;
    const cx = s.screenX;
    const cy = s.screenY + s.spriteScreenHeight / 2;
    const r = s.spriteScreenWidth / 2;

    // Simplified ghost version of the entity (for Phantom trail)
    ctx.fillStyle = 'rgba(140, 40, 160, 0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
}

function drawDeathParticles(ctx, cx, cy, r, entity, time) {
    const progress = Math.max(0, -entity.deathTimer / 0.3); // 0 to 1
    const count = entity.type === 'PRISM' ? 8 : 5;

    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + entity.sparklePhase;
        const dist = r * (1 + progress * 3);
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;
        const alpha = Math.max(0, 1 - progress);
        const size = Math.max(1, r * 0.2 * (1 - progress));

        if (entity.type === 'PRISM') {
            ctx.fillStyle = `hsla(${(i * 45) % 360}, 90%, 60%, ${alpha})`;
        } else {
            ctx.fillStyle = `rgba(200, 255, 255, ${alpha})`;
        }

        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ── Projectile Visuals ──────────────────────────────────────────────

function drawProjectile(ctx, s, time) {
    const cx = s.screenX;
    const cy = s.screenY + s.spriteScreenHeight / 2;
    const r = Math.max(2, s.spriteScreenWidth / 2);
    const p = s.projectile;

    let color = 'rgba(0, 255, 255, 0.9)';
    if (p.owner === 'boss') color = 'rgba(255, 180, 0, 0.9)';
    else if (p.owner === 'prism') color = `hsla(${(time.now * 0.1) % 360}, 90%, 60%, 0.9)`;

    // Outer glow
    ctx.fillStyle = color.replace('0.9', '0.3');
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Bright center
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
}

// ── Pickup Visuals ──────────────────────────────────────────────────

function drawPickup(ctx, s, time) {
    const cx = s.screenX;
    const cy = s.screenY + s.spriteScreenHeight / 2;
    const r = Math.max(3, s.spriteScreenWidth / 2);
    const pk = s.pickup;

    // Glow
    ctx.fillStyle = 'rgba(0, 255, 100, 0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Weapon shape
    ctx.fillStyle = '#0f0';
    switch (pk.type) {
        case 'HANDGUN':
            ctx.fillRect(cx - r * 0.3, cy - r * 0.6, r * 0.6, r * 0.8);
            ctx.fillRect(cx - r * 0.15, cy - r * 1, r * 0.3, r * 0.5);
            break;
        case 'SHOTGUN':
            ctx.fillRect(cx - r * 0.4, cy - r * 0.5, r * 0.8, r * 0.7);
            ctx.fillRect(cx - r * 0.25, cy - r * 1.1, r * 0.5, r * 0.7);
            break;
        case 'VOIDBEAM':
            ctx.fillStyle = '#a040ff';
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
            ctx.fill();
            // Radiating lines
            ctx.strokeStyle = 'rgba(160, 64, 255, 0.6)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2 + time.now * 0.003;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
                ctx.stroke();
            }
            break;
    }
}
