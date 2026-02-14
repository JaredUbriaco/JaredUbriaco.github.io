/**
 * raycaster.js — DDA Raycasting Engine
 * 
 * The core rendering engine. Casts 400 rays (one per column at internal
 * resolution), produces wall strips, floor, ceiling, distance fog,
 * and a z-buffer for sprite clipping.
 * 
 * Algorithm: Digital Differential Analyzer (DDA) — step-based ray march.
 */

import {
    INTERNAL_WIDTH, INTERNAL_HEIGHT,
    TILE, PROJECTION_PLANE,
    BREATHING_AMPLITUDE, BREATHING_SPEED,
    PITCH_SCALE,
} from './config.js';

import { getTile, isSolid, doors, INTERACTABLE_POSITIONS } from './map.js';

// ── Z-Buffer (shared with sprite renderer) ──────────────────────────
export const zBuffer = new Float32Array(INTERNAL_WIDTH);

// ── Wall Color Palette (HSL-based, varies by tile type) ─────────────
function getWallColor(tileType, hitSide, distance) {
    let h, s, l;

    switch (tileType) {
        case TILE.WALL:
            h = 260;  // purple-blue
            s = 40;
            l = 45;
            break;
        case TILE.DOOR:
        case TILE.DOOR_LOCKED_BUTTON:
        case TILE.DOOR_LOCKED_KEY:
            h = 195;  // steel-blue gate tone
            s = 35;
            l = 44;
            break;
        case TILE.SECRET_WALL:
            h = 260;  // identical to regular wall (it's a secret!)
            s = 40;
            l = 45;
            break;
        case TILE.BUTTON:
            h = 22;   // orange button plate
            s = 95;
            l = 44;
            break;
        default:
            h = 260;
            s = 30;
            l = 40;
    }

    // Side shading: darken one axis for pseudo-lighting
    if (hitSide === 1) {
        l *= 0.7; // N/S walls are darker
    }

    // Distance fog: darken with distance
    const fogFactor = 1 / (1 + distance * 0.25);
    l *= fogFactor;

    return `hsl(${h}, ${s}%, ${Math.max(2, l)}%)`;
}

function isDoorTile(tileType) {
    return tileType === TILE.DOOR || tileType === TILE.DOOR_LOCKED_BUTTON || tileType === TILE.DOOR_LOCKED_KEY;
}

function isButtonWallHit(hit) {
    const button = INTERACTABLE_POSITIONS.area1Button;
    if (!button) return false;
    return hit.mapX === Math.floor(button.x) && hit.mapY === Math.floor(button.y) && hit.wallType === TILE.WALL;
}

// ── Ceiling & Floor Colors ──────────────────────────────────────────
function getCeilingColor(distance) {
    const fogFactor = 1 / (1 + distance * 0.3);
    const l = 12 * fogFactor;
    return `hsl(240, 30%, ${Math.max(1, l)}%)`;
}

function getFloorColor(distance) {
    const fogFactor = 1 / (1 + distance * 0.3);
    const l = 10 * fogFactor;
    return `hsl(270, 20%, ${Math.max(1, l)}%)`;
}

// ── Cast Single Ray (DDA) ───────────────────────────────────────────
/**
 * Cast a ray from (ox, oy) at angle. Returns hit info.
 * @returns {{ distance: number, wallType: number, hitSide: number, mapX: number, mapY: number, wallX: number }}
 */
function castRay(ox, oy, angle) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    // Current grid cell
    let mapX = Math.floor(ox);
    let mapY = Math.floor(oy);

    // Step direction
    const stepX = dirX >= 0 ? 1 : -1;
    const stepY = dirY >= 0 ? 1 : -1;

    // Distance between consecutive x/y grid lines along the ray
    const deltaDistX = Math.abs(dirX) < 1e-10 ? 1e10 : Math.abs(1 / dirX);
    const deltaDistY = Math.abs(dirY) < 1e-10 ? 1e10 : Math.abs(1 / dirY);

    // Distance to the next x/y grid line from current position
    let sideDistX, sideDistY;

    if (dirX >= 0) {
        sideDistX = (mapX + 1 - ox) * deltaDistX;
    } else {
        sideDistX = (ox - mapX) * deltaDistX;
    }

    if (dirY >= 0) {
        sideDistY = (mapY + 1 - oy) * deltaDistY;
    } else {
        sideDistY = (oy - mapY) * deltaDistY;
    }

    // DDA step loop
    let hitSide = 0; // 0 = vertical (E/W), 1 = horizontal (N/S)
    const MAX_STEPS = 80;

    for (let step = 0; step < MAX_STEPS; step++) {
        // Step to next grid line
        if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            hitSide = 0; // hit a vertical grid line (E/W wall face)
        } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            hitSide = 1; // hit a horizontal grid line (N/S wall face)
        }

        // Check tile at new position
        const tile = getTile(mapX, mapY);

        // Check if this tile is solid (wall, closed door, secret wall)
        if (tile === TILE.WALL || tile === TILE.SECRET_WALL) {
            // Solid wall — calculate perpendicular distance
            let perpDist;
            if (hitSide === 0) {
                perpDist = sideDistX - deltaDistX;
            } else {
                perpDist = sideDistY - deltaDistY;
            }

            // Wall X (where on the wall face we hit, 0-1) — for texture mapping later
            let wallX;
            if (hitSide === 0) {
                wallX = oy + perpDist * dirY;
            } else {
                wallX = ox + perpDist * dirX;
            }
            wallX -= Math.floor(wallX);

            return { distance: Math.max(perpDist, 0.01), wallType: tile, hitSide, mapX, mapY, wallX };
        }

        // Door tiles — check if closed
        if (tile === TILE.DOOR || tile === TILE.DOOR_LOCKED_BUTTON || tile === TILE.DOOR_LOCKED_KEY) {
            const doorKey = `${mapX},${mapY}`;
            const door = doors[doorKey];

            if (!door || door.openProgress < 1) {
                // Door is closed or partially open — treat as wall
                let perpDist;
                if (hitSide === 0) {
                    perpDist = sideDistX - deltaDistX;
                } else {
                    perpDist = sideDistY - deltaDistY;
                }

                let wallX;
                if (hitSide === 0) {
                    wallX = oy + perpDist * dirY;
                } else {
                    wallX = ox + perpDist * dirX;
                }
                wallX -= Math.floor(wallX);

                return {
                    distance: Math.max(perpDist, 0.01),
                    wallType: tile,
                    hitSide,
                    mapX, mapY,
                    wallX,
                    doorProgress: door ? door.openProgress : 0,
                };
            }
            // Fully open door — ray passes through, continue stepping
        }
    }

    // No hit within max steps — return far distance
    return { distance: 80, wallType: TILE.EMPTY, hitSide: 0, mapX, mapY, wallX: 0 };
}

// ── Render All Walls ────────────────────────────────────────────────
/**
 * Render the 3D view: walls, floor, ceiling for every column.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, angle: number, pitch: number, fov: number }} player
 * @param {number} timeNow - timestamp for breathing walls
 */
export function renderWalls(ctx, player, timeNow) {
    const { x: px, y: py, angle, pitch, fov } = player;

    // Breathing wall modulation
    const breathe = 1 + BREATHING_AMPLITUDE * Math.sin(timeNow * BREATHING_SPEED);

    // Horizon line (shifts with pitch via y-shearing)
    const horizonY = INTERNAL_HEIGHT / 2 + pitch * PITCH_SCALE;

    // Half FOV
    const halfFov = fov / 2;

    for (let col = 0; col < INTERNAL_WIDTH; col++) {
        // Ray angle for this column
        const rayAngle = angle - halfFov + (col / INTERNAL_WIDTH) * fov;

        // Cast ray
        const hit = castRay(px, py, rayAngle);

        // Fish-eye correction
        const correctedDist = hit.distance * Math.cos(rayAngle - angle);

        // Store in z-buffer
        zBuffer[col] = correctedDist;

        // Wall strip height
        let wallHeight = (1 / correctedDist) * PROJECTION_PLANE;

        // Apply breathing modulation
        wallHeight *= breathe;

        // Doors are shorter than full walls so they read as gate panels.
        if (isDoorTile(hit.wallType)) {
            wallHeight *= 0.86;
        }

        // Door animation: partially open doors have reduced height
        if (hit.doorProgress !== undefined && hit.doorProgress > 0) {
            wallHeight *= (1 - hit.doorProgress);
        }

        // Buttons are intentionally shorter than doors/walls.
        if (hit.wallType === TILE.BUTTON) {
            wallHeight *= 0.12;
        }

        // Wall strip screen positions
        const wallTop = Math.floor(horizonY - wallHeight / 2);
        const wallBottom = Math.floor(horizonY + wallHeight / 2);

        // ── Draw Ceiling (above wall) ───────────────────────────
        if (wallTop > 0) {
            // Simple distance interpolation for ceiling shading
            const ceilDist = correctedDist * 0.8; // approximate
            ctx.fillStyle = getCeilingColor(ceilDist);
            ctx.fillRect(col, 0, 1, Math.max(0, wallTop));
        }

        // ── Draw Wall Strip ─────────────────────────────────────
        const clampedTop = Math.max(0, wallTop);
        const clampedBottom = Math.min(INTERNAL_HEIGHT, wallBottom);
        if (clampedBottom > clampedTop) {
            let color = getWallColor(hit.wallType, hit.hitSide, correctedDist);
            if (isDoorTile(hit.wallType) && hit.wallX !== undefined) {
                const slat = Math.floor(hit.wallX * 8) % 2;
                if (slat === 0) {
                    color = getWallColor(hit.wallType, hit.hitSide, correctedDist * 1.25);
                }
            }
            ctx.fillStyle = color;
            ctx.fillRect(col, clampedTop, 1, clampedBottom - clampedTop);

            // Wall-mounted button: small, unique shape embedded on the wall.
            if (isButtonWallHit(hit) && hit.wallX > 0.34 && hit.wallX < 0.66) {
                const mountHeight = Math.max(2, Math.floor(wallHeight * 0.2));
                const mountTop = Math.floor(horizonY - mountHeight * 0.5);
                const mountBottom = Math.min(INTERNAL_HEIGHT, mountTop + mountHeight);

                // Backplate
                ctx.fillStyle = 'rgba(40, 16, 8, 0.95)';
                ctx.fillRect(col, Math.max(0, mountTop), 1, Math.max(0, mountBottom - Math.max(0, mountTop)));

                // Orange core
                const coreHeight = Math.max(1, Math.floor(mountHeight * 0.55));
                const coreTop = Math.floor(horizonY - coreHeight * 0.5);
                ctx.fillStyle = '#ff7a1a';
                ctx.fillRect(col, Math.max(0, coreTop), 1, Math.max(0, coreHeight));

                // Bright center segment for distinct "button" read.
                const centerTop = Math.floor(horizonY - 1);
                ctx.fillStyle = '#ffe3c4';
                ctx.fillRect(col, Math.max(0, centerTop), 1, 2);
            }
        }

        // ── Draw Floor (below wall) ─────────────────────────────
        if (wallBottom < INTERNAL_HEIGHT) {
            const floorDist = correctedDist * 0.8;
            ctx.fillStyle = getFloorColor(floorDist);
            ctx.fillRect(col, Math.max(0, wallBottom), 1, INTERNAL_HEIGHT - Math.max(0, wallBottom));
        }
    }
}
