/**
 * hud.js — HUD Rendering: Crosshair, Minimap, Room Label
 * 
 * Handles canvas-drawn HUD elements (crosshair, minimap).
 * DOM-based HUD (kill counter, weapon name, room label, messages)
 * is managed by main.js.
 */

import { INTERNAL_WIDTH, INTERNAL_HEIGHT, TILE } from './config.js';
import { grid, getMapWidth, getMapHeight, getRoomId, doors, ROOMS } from './map.js';

// ── Minimap Config ──────────────────────────────────────────────────
const MINIMAP_SIZE = 120;       // canvas pixel size
const MINIMAP_VIEW = 40;        // how many tiles visible at once
const MINIMAP_SCALE = MINIMAP_SIZE / MINIMAP_VIEW;

const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');
minimapCanvas.width = MINIMAP_SIZE;
minimapCanvas.height = MINIMAP_SIZE;

// ── Minimap Colors ──────────────────────────────────────────────────
const TILE_COLORS = {
    [TILE.EMPTY]:              '#111',
    [TILE.WALL]:               '#333',
    [TILE.DOOR]:               '#0aa',
    [TILE.DOOR_LOCKED_BUTTON]: '#a60',
    [TILE.SECRET_WALL]:        '#333',  // same as wall (it's a secret!)
    [TILE.DOOR_LOCKED_KEY]:    '#a0a',
    [TILE.LIGHT_WELL]:         '#39e6ff',
    [TILE.OUTDOOR]:            '#137348',
    [TILE.STAIR]:              '#7a2bd3',
    [TILE.BUTTON]:             '#ff6a00',
};

// ── Draw Crosshair (on main canvas) ─────────────────────────────────

/**
 * Draw the crosshair on the main game canvas.
 * @param {CanvasRenderingContext2D} ctx - Main canvas context
 */
export function drawCrosshair(ctx) {
    const cx = Math.floor(INTERNAL_WIDTH / 2);
    const cy = Math.floor(INTERNAL_HEIGHT / 2);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    // Center dot
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
    // Small cross arms (subtle)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(cx - 5, cy, 3, 1);
    ctx.fillRect(cx + 3, cy, 3, 1);
    ctx.fillRect(cx, cy - 5, 1, 3);
    ctx.fillRect(cx, cy + 3, 1, 3);
}

// ── Draw Minimap ────────────────────────────────────────────────────

/**
 * Render the minimap, centered on the player.
 * @param {object} state - Game state
 */
export function drawMinimap(state) {
    const { player, entities, pickups } = state;
    const mctx = minimapCtx;
    const mapW = getMapWidth();
    const mapH = getMapHeight();

    // Clear
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Camera offset: center on player
    const halfView = MINIMAP_VIEW / 2;
    const camX = player.x - halfView;
    const camY = player.y - halfView;

    // Tile range to draw
    const startCol = Math.floor(camX);
    const startRow = Math.floor(camY);
    const endCol = Math.ceil(camX + MINIMAP_VIEW);
    const endRow = Math.ceil(camY + MINIMAP_VIEW);

    // Draw tiles
    for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
            if (row < 0 || row >= mapH || col < 0 || col >= mapW) continue;

            const tile = grid[row][col];
            const color = TILE_COLORS[tile] || '#111';

            // Check if door is open (draw as empty)
            let drawColor = color;
            if (tile === TILE.DOOR || tile === TILE.DOOR_LOCKED_BUTTON || tile === TILE.DOOR_LOCKED_KEY) {
                const doorKey = `${col},${row}`;
                const door = doors[doorKey];
                if (door && door.openProgress >= 1) {
                    drawColor = TILE_COLORS[TILE.EMPTY];
                }
            }

            const sx = (col - camX) * MINIMAP_SCALE;
            const sy = (row - camY) * MINIMAP_SCALE;

            mctx.fillStyle = drawColor;
            mctx.fillRect(sx, sy, MINIMAP_SCALE + 0.5, MINIMAP_SCALE + 0.5);
        }
    }

    // Draw pickups (green dots)
    for (const pickup of pickups) {
        if (pickup.collected) continue;
        const sx = (pickup.x - camX) * MINIMAP_SCALE;
        const sy = (pickup.y - camY) * MINIMAP_SCALE;
        if (sx < 0 || sx > MINIMAP_SIZE || sy < 0 || sy > MINIMAP_SIZE) continue;
        mctx.fillStyle = '#0f0';
        mctx.beginPath();
        mctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        mctx.fill();
    }

    // Draw enemies (red dots)
    for (const entity of entities) {
        if (entity.hp <= 0) continue;
        const sx = (entity.x - camX) * MINIMAP_SCALE;
        const sy = (entity.y - camY) * MINIMAP_SCALE;
        if (sx < 0 || sx > MINIMAP_SIZE || sy < 0 || sy > MINIMAP_SIZE) continue;

        // Boss is a larger dot
        const radius = entity.type === 'BOSS' ? 4 : 2;
        mctx.fillStyle = entity.type === 'PRISM' ? '#f0f' : '#f00';
        mctx.beginPath();
        mctx.arc(sx, sy, radius, 0, Math.PI * 2);
        mctx.fill();
    }

    // Draw player (bright cyan dot with direction line)
    const px = (player.x - camX) * MINIMAP_SCALE;
    const py = (player.y - camY) * MINIMAP_SCALE;

    // Direction line
    const dirLen = 6;
    const dirEndX = px + Math.cos(player.angle) * dirLen;
    const dirEndY = py + Math.sin(player.angle) * dirLen;
    mctx.strokeStyle = '#0ff';
    mctx.lineWidth = 1.5;
    mctx.beginPath();
    mctx.moveTo(px, py);
    mctx.lineTo(dirEndX, dirEndY);
    mctx.stroke();

    // Player dot
    mctx.fillStyle = '#0ff';
    mctx.beginPath();
    mctx.arc(px, py, 3, 0, Math.PI * 2);
    mctx.fill();

    // Minimap border glow
    mctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    mctx.lineWidth = 1;
    mctx.strokeRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
}

// ── Main HUD Draw (called from renderer) ────────────────────────────

/**
 * Draw all canvas-based HUD elements.
 * @param {CanvasRenderingContext2D} ctx - Main game canvas
 * @param {object} state - Game state
 */
export function drawCanvas(ctx, state) {
    drawCrosshair(ctx);
    drawMinimap(state);
}
