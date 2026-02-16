/**
 * map.js — World Grid, Room Definitions & Door State
 * 
 * Defines the 2D tile grid for all game areas.
 * Currently: Area 0 (AWAKENING) + Area 1 (THE THRESHOLD) + connecting hallway.
 * Area 2 and Area 3 added in tasks5 and tasks6.
 * 
 * Grid convention: grid[row][col] where row=y, col=x.
 * All public API uses (x, y) which maps to grid[y][x].
 */

import { TILE } from './config.js';

// ── Grid Dimensions ─────────────────────────────────────────────────
// Allocate full 80x80 now (filled with WALL). Rooms carved below.
const MAP_WIDTH = 80;
const MAP_HEIGHT = 80;

// ── Initialize Grid (all walls) ─────────────────────────────────────
const grid = [];
const roomMeta = []; // parallel grid: stores roomId string or null

for (let row = 0; row < MAP_HEIGHT; row++) {
    grid[row] = new Array(MAP_WIDTH).fill(TILE.WALL);
    roomMeta[row] = new Array(MAP_WIDTH).fill(null);
}

// ── Helper Functions ────────────────────────────────────────────────

/** Fill a rectangular region with a tile type. */
function fillRect(x, y, w, h, tile) {
    for (let row = y; row < y + h && row < MAP_HEIGHT; row++) {
        for (let col = x; col < x + w && col < MAP_WIDTH; col++) {
            grid[row][col] = tile;
        }
    }
}

/** Tag a rectangular region with a room ID. */
function tagRoom(x, y, w, h, roomId) {
    for (let row = y; row < y + h && row < MAP_HEIGHT; row++) {
        for (let col = x; col < x + w && col < MAP_WIDTH; col++) {
            roomMeta[row][col] = roomId;
        }
    }
}

/** Place a single tile. */
function placeTile(x, y, tile) {
    if (y >= 0 && y < MAP_HEIGHT && x >= 0 && x < MAP_WIDTH) {
        grid[y][x] = tile;
    }
}

// ── Room Definitions ────────────────────────────────────────────────
export const ROOMS = {
    area0: { id: 'area0', label: 'AREA 0 — AWAKENING' },
    area1: { id: 'area1', label: 'AREA 1 — THE THRESHOLD' },
    a2r1: { id: 'a2r1', label: 'AREA 2 — HALL OF ECHOES' },
    a2r2: { id: 'a2r2', label: 'AREA 2 — THE DRIFT' },
    a2r3: { id: 'a2r3', label: 'AREA 2 — NEXUS' },
    a2r4: { id: 'a2r4', label: 'AREA 2 — PRISM CHAMBER' },
    a2r5: { id: 'a2r5', label: 'AREA 2 — THE PASSAGE' },
    bossCorridor: { id: 'bossCorridor', label: 'DESCENDING...' },
    area3: { id: 'area3', label: 'THE EGO' },
};

// ══════════════════════════════════════════════════════════════════════
// AREA 0 — AWAKENING (6×6 room at grid position 2,2)
// ══════════════════════════════════════════════════════════════════════
const A0_X = 2, A0_Y = 2, A0_W = 6, A0_H = 6;

fillRect(A0_X, A0_Y, A0_W, A0_H, TILE.EMPTY);
tagRoom(A0_X, A0_Y, A0_W, A0_H, 'area0');

// ══════════════════════════════════════════════════════════════════════
// HALLWAY: Area 0 → Area 1 (3 tiles wide, runs east from Area 0)
// ══════════════════════════════════════════════════════════════════════
const HALL_01_X = A0_X + A0_W;     // starts at right edge of Area 0
const HALL_01_Y = A0_Y + 2;        // vertically centered-ish (row 4-6)
const HALL_01_W = 4;               // 4 tiles long
const HALL_01_H = 3;               // 3 tiles wide

fillRect(HALL_01_X, HALL_01_Y, HALL_01_W, HALL_01_H, TILE.EMPTY);
tagRoom(HALL_01_X, HALL_01_Y, HALL_01_W, HALL_01_H, 'area1'); // corridor counts as area1 so AI step doesn't flip to "enter_area1" when crossing

// Door between Area 0 and hallway
const DOOR_01_X = HALL_01_X;
const DOOR_01_Y = HALL_01_Y + 1;   // center of hallway width
for (let y = HALL_01_Y; y < HALL_01_Y + HALL_01_H; y++) {
    placeTile(DOOR_01_X, y, TILE.DOOR);
}

// ══════════════════════════════════════════════════════════════════════
// AREA 1 — THE THRESHOLD (14×14 room, east of hallway)
// ══════════════════════════════════════════════════════════════════════
const A1_X = HALL_01_X + HALL_01_W; // starts after hallway
const A1_Y = 1;                      // extends from row 1 to row 14
const A1_W = 14;
const A1_H = 14;

fillRect(A1_X, A1_Y, A1_W, A1_H, TILE.EMPTY);
tagRoom(A1_X, A1_Y, A1_W, A1_H, 'area1');

// Internal pillars for cover (2×2 blocks)
fillRect(A1_X + 4, A1_Y + 4, 2, 2, TILE.WALL);
fillRect(A1_X + 9, A1_Y + 4, 2, 2, TILE.WALL);
fillRect(A1_X + 4, A1_Y + 9, 2, 2, TILE.WALL);
fillRect(A1_X + 9, A1_Y + 9, 2, 2, TILE.WALL);

// Button on the far (east) wall — centered vertically
const BUTTON_X = A1_X + A1_W - 1;
const BUTTON_Y = A1_Y + Math.floor(A1_H / 2);
// Keep the wall intact; the button is rendered/handled as a wall-mounted interactable.
placeTile(BUTTON_X, BUTTON_Y, TILE.WALL);

// Locked gate (button-locked door) on south wall of Area 1 → Area 2
// This door will be used to enter Area 2 (expanded in tasks5)
const GATE_X = A1_X + Math.floor(A1_W / 2);
const GATE_Y = A1_Y + A1_H;
for (let x = GATE_X - 1; x <= GATE_X + 1; x++) {
    placeTile(x, GATE_Y, TILE.DOOR_LOCKED_BUTTON);
    // Make tiles below the gate also empty so opened doors are passable
    placeTile(x, GATE_Y + 1, TILE.EMPTY);
}

// ══════════════════════════════════════════════════════════════════════
// HALLWAY: Area 1 → Area 2 Room 1 (south from gate)
// ══════════════════════════════════════════════════════════════════════
const HALL_12_X = GATE_X - 1;
const HALL_12_Y = GATE_Y + 1;
const HALL_12_W = 3;
const HALL_12_H = 4;
fillRect(HALL_12_X, HALL_12_Y, HALL_12_W, HALL_12_H, TILE.EMPTY);
tagRoom(HALL_12_X, HALL_12_Y, HALL_12_W, HALL_12_H, 'a2r1'); // gate corridor counts as a2r1 so we don't flip step when crossing area1↔a2r1

// ══════════════════════════════════════════════════════════════════════
// AREA 2 ROOM 1 — HALL OF ECHOES (12×8, south of gate hallway)
// ══════════════════════════════════════════════════════════════════════
const A2R1_X = GATE_X - 5;
const A2R1_Y = HALL_12_Y + HALL_12_H;
const A2R1_W = 12;
const A2R1_H = 8;
fillRect(A2R1_X, A2R1_Y, A2R1_W, A2R1_H, TILE.EMPTY);
tagRoom(A2R1_X, A2R1_Y, A2R1_W, A2R1_H, 'a2r1');
// Alcoves on sides
fillRect(A2R1_X + 2, A2R1_Y + 2, 2, 1, TILE.WALL);
fillRect(A2R1_X + 8, A2R1_Y + 2, 2, 1, TILE.WALL);
fillRect(A2R1_X + 2, A2R1_Y + 5, 2, 1, TILE.WALL);
fillRect(A2R1_X + 8, A2R1_Y + 5, 2, 1, TILE.WALL);

// ── Hallway: a2r1 → a2r2 (west side, going south-west)
const HALL_R1R2_X = A2R1_X - 4;
const HALL_R1R2_Y = A2R1_Y + 3;
const HALL_R1R2_W = 4;
const HALL_R1R2_H = 3;
fillRect(HALL_R1R2_X, HALL_R1R2_Y, HALL_R1R2_W, HALL_R1R2_H, TILE.EMPTY);
tagRoom(HALL_R1R2_X, HALL_R1R2_Y, HALL_R1R2_W, HALL_R1R2_H, 'a2r1');
// Door between r1 and hallway
for (let y = HALL_R1R2_Y; y < HALL_R1R2_Y + HALL_R1R2_H; y++) {
    placeTile(A2R1_X, y, TILE.DOOR);
}
// registerDoor called below after function definition

// ══════════════════════════════════════════════════════════════════════
// AREA 2 ROOM 2 — THE DRIFT (8×12, L-shaped, west of r1)
// ══════════════════════════════════════════════════════════════════════
const A2R2_X = HALL_R1R2_X - 8;
const A2R2_Y = A2R1_Y + 1;
const A2R2_W = 8;
const A2R2_H = 12;
fillRect(A2R2_X, A2R2_Y, A2R2_W, A2R2_H, TILE.EMPTY);
tagRoom(A2R2_X, A2R2_Y, A2R2_W, A2R2_H, 'a2r2');
// L-shape cutout (block upper-right corner to make L shape)
fillRect(A2R2_X + 5, A2R2_Y, 3, 5, TILE.WALL);
// Carve opening through L-shape so hallway r1→r2 connects to a2r2 interior
fillRect(A2R2_X + 5, HALL_R1R2_Y, 3, HALL_R1R2_H, TILE.EMPTY);
// Internal walls
fillRect(A2R2_X + 3, A2R2_Y + 6, 2, 2, TILE.WALL);

// ── Hallway: a2r1 → a2r3 (south from r1)
const HALL_R1R3_X = A2R1_X + 4;
const HALL_R1R3_Y = A2R1_Y + A2R1_H;
const HALL_R1R3_W = 3;
const HALL_R1R3_H = 4;
fillRect(HALL_R1R3_X, HALL_R1R3_Y, HALL_R1R3_W, HALL_R1R3_H, TILE.EMPTY);
tagRoom(HALL_R1R3_X, HALL_R1R3_Y, HALL_R1R3_W, HALL_R1R3_H, 'a2r1');
// Door
for (let x = HALL_R1R3_X; x < HALL_R1R3_X + HALL_R1R3_W; x++) {
    placeTile(x, A2R1_Y + A2R1_H, TILE.DOOR);
}

// ══════════════════════════════════════════════════════════════════════
// AREA 2 ROOM 3 — NEXUS (12×12, central hub, south of r1)
// ══════════════════════════════════════════════════════════════════════
const A2R3_X = A2R1_X - 1;
const A2R3_Y = HALL_R1R3_Y + HALL_R1R3_H;
const A2R3_W = 12;
const A2R3_H = 12;
fillRect(A2R3_X, A2R3_Y, A2R3_W, A2R3_H, TILE.EMPTY);
tagRoom(A2R3_X, A2R3_Y, A2R3_W, A2R3_H, 'a2r3');
// Central pillars
fillRect(A2R3_X + 3, A2R3_Y + 3, 2, 2, TILE.WALL);
fillRect(A2R3_X + 7, A2R3_Y + 3, 2, 2, TILE.WALL);
fillRect(A2R3_X + 3, A2R3_Y + 7, 2, 2, TILE.WALL);
fillRect(A2R3_X + 7, A2R3_Y + 7, 2, 2, TILE.WALL);

// ── Hallway: a2r3 → a2r4 (east from r3)
const HALL_R3R4_X = A2R3_X + A2R3_W;
const HALL_R3R4_Y = A2R3_Y + 5;
const HALL_R3R4_W = 4;
const HALL_R3R4_H = 3;
fillRect(HALL_R3R4_X, HALL_R3R4_Y, HALL_R3R4_W, HALL_R3R4_H, TILE.EMPTY);
tagRoom(HALL_R3R4_X, HALL_R3R4_Y, HALL_R3R4_W, HALL_R3R4_H, 'a2r3');
for (let y = HALL_R3R4_Y; y < HALL_R3R4_Y + HALL_R3R4_H; y++) {
    placeTile(A2R3_X + A2R3_W, y, TILE.DOOR);
}

// ══════════════════════════════════════════════════════════════════════
// AREA 2 ROOM 4 — PRISM CHAMBER (10×10, east of r3)
// ══════════════════════════════════════════════════════════════════════
const A2R4_X = HALL_R3R4_X + HALL_R3R4_W;
const A2R4_Y = A2R3_Y + 2;
const A2R4_W = 10;
const A2R4_H = 10;
fillRect(A2R4_X, A2R4_Y, A2R4_W, A2R4_H, TILE.EMPTY);
tagRoom(A2R4_X, A2R4_Y, A2R4_W, A2R4_H, 'a2r4');
// Cover pillars
fillRect(A2R4_X + 3, A2R4_Y + 3, 1, 1, TILE.WALL);
fillRect(A2R4_X + 6, A2R4_Y + 3, 1, 1, TILE.WALL);
fillRect(A2R4_X + 3, A2R4_Y + 6, 1, 1, TILE.WALL);
fillRect(A2R4_X + 6, A2R4_Y + 6, 1, 1, TILE.WALL);

// ── Hallway: a2r3 → a2r5 (south from r3)
const HALL_R3R5_X = A2R3_X + 5;
const HALL_R3R5_Y = A2R3_Y + A2R3_H;
const HALL_R3R5_W = 3;
const HALL_R3R5_H = 4;
fillRect(HALL_R3R5_X, HALL_R3R5_Y, HALL_R3R5_W, HALL_R3R5_H, TILE.EMPTY);
tagRoom(HALL_R3R5_X, HALL_R3R5_Y, HALL_R3R5_W, HALL_R3R5_H, 'a2r3');
for (let x = HALL_R3R5_X; x < HALL_R3R5_X + HALL_R3R5_W; x++) {
    placeTile(x, A2R3_Y + A2R3_H, TILE.DOOR);
}

// ══════════════════════════════════════════════════════════════════════
// AREA 2 ROOM 5 — THE PASSAGE (10×8, south of r3, has key door)
// ══════════════════════════════════════════════════════════════════════
const A2R5_X = A2R3_X;
const A2R5_Y = HALL_R3R5_Y + HALL_R3R5_H;
const A2R5_W = 10;
const A2R5_H = 8;
fillRect(A2R5_X, A2R5_Y, A2R5_W, A2R5_H, TILE.EMPTY);
tagRoom(A2R5_X, A2R5_Y, A2R5_W, A2R5_H, 'a2r5');
// Some outdoor tiles for visual variety
fillRect(A2R5_X + 1, A2R5_Y + 1, 3, 3, TILE.OUTDOOR);
// Stair transition
placeTile(A2R5_X + 4, A2R5_Y + 1, TILE.STAIR);
placeTile(A2R5_X + 4, A2R5_Y + 2, TILE.STAIR);
placeTile(A2R5_X + 4, A2R5_Y + 3, TILE.STAIR);

// Key door: south wall of a2r5 → boss corridor (Area 3)
const KEYDOOR_X = A2R5_X + Math.floor(A2R5_W / 2);
const KEYDOOR_Y = A2R5_Y + A2R5_H;
for (let x = KEYDOOR_X - 1; x <= KEYDOOR_X + 1; x++) {
    placeTile(x, KEYDOOR_Y, TILE.DOOR_LOCKED_KEY);
    // Tiles below key door also need to be empty for passage
    placeTile(x, KEYDOOR_Y + 1, TILE.EMPTY);
}

// Secret wall hidden in Area 2 (in r2, east wall looks like normal wall)
placeTile(A2R2_X + A2R2_W - 1, A2R2_Y + 8, TILE.SECRET_WALL);

// ══════════════════════════════════════════════════════════════════════
// BOSS CORRIDOR (3 wide, 8 long, south from key door)
// ══════════════════════════════════════════════════════════════════════
const BC_X = KEYDOOR_X - 1;
const BC_Y = KEYDOOR_Y + 1;
const BC_W = 3;
const BC_H = 8;
fillRect(BC_X, BC_Y, BC_W, BC_H, TILE.EMPTY);
tagRoom(BC_X, BC_Y, BC_W, BC_H, 'bossCorridor');
// Light wells line the corridor (2 on each side)
placeTile(BC_X, BC_Y + 2, TILE.LIGHT_WELL);
placeTile(BC_X + BC_W - 1, BC_Y + 2, TILE.LIGHT_WELL);
placeTile(BC_X, BC_Y + 5, TILE.LIGHT_WELL);
placeTile(BC_X + BC_W - 1, BC_Y + 5, TILE.LIGHT_WELL);
// Void Beam pickup at end of corridor
const VOIDBEAM_POS = { x: BC_X + 1.5, y: BC_Y + BC_H - 1.5 };

// ══════════════════════════════════════════════════════════════════════
// AREA 3 — THE EGO (Boss Arena, 16×16, south of corridor)
// ══════════════════════════════════════════════════════════════════════
const A3_X = BC_X - 6;
const A3_Y = BC_Y + BC_H;
const A3_W = 16;
const A3_H = 16;
fillRect(A3_X, A3_Y, A3_W, A3_H, TILE.EMPTY);
tagRoom(A3_X, A3_Y, A3_W, A3_H, 'area3');
// Three light well zones (boss vulnerability zones for Void Beam)
fillRect(A3_X + 1, A3_Y + 1, 3, 3, TILE.LIGHT_WELL);   // north-west
fillRect(A3_X + 12, A3_Y + 1, 3, 3, TILE.LIGHT_WELL);  // north-east
fillRect(A3_X + 6, A3_Y + 11, 3, 3, TILE.LIGHT_WELL);  // south-center
// Perimeter pillars for cover
fillRect(A3_X + 3, A3_Y + 3, 2, 2, TILE.WALL);
fillRect(A3_X + 11, A3_Y + 3, 2, 2, TILE.WALL);
fillRect(A3_X + 3, A3_Y + 11, 2, 2, TILE.WALL);
fillRect(A3_X + 11, A3_Y + 11, 2, 2, TILE.WALL);
// Colorful floor pattern in the arena (visual signal + minimap flavor)
for (let row = A3_Y + 1; row < A3_Y + A3_H - 1; row++) {
    for (let col = A3_X + 1; col < A3_X + A3_W - 1; col++) {
        // Keep existing solids/light zones untouched
        if (grid[row][col] !== TILE.EMPTY) continue;
        grid[row][col] = ((row + col) % 2 === 0) ? TILE.STAIR : TILE.OUTDOOR;
    }
}

// Boss spawn position
const BOSS_SPAWN = { x: A3_X + A3_W / 2, y: A3_Y + A3_H / 2 };

// ── Player Spawn ────────────────────────────────────────────────────
// Center of Area 0, facing east (toward hallway/Area 1)
export const PLAYER_SPAWN = {
    x: A0_X + A0_W / 2,
    y: A0_Y + A0_H / 2,
    angle: 0, // facing east (positive X direction)
};

// ── Passages: Doors (1 tile) and Gates (2+ tiles) ────────────────────
// One backend object per opening. Door = single-tile opening; gate = multi-tile.
// Visual and collision: one object spans the full width of the gap; one interaction opens it.
// doors["x,y"] → passage (same object for every tile in that opening). gates[] = list of all.
export const doors = {};   // tile key "x,y" → passage object
export const gates = [];   // list of all passages (for animation, AI, iteration)

function registerPassage(tiles, locked, lockType) {
    const list = Array.isArray(tiles[0]) ? tiles : tiles.map((t) => ({ x: t.x, y: t.y }));
    const kind = list.length === 1 ? 'door' : 'gate';
    const cx = list.reduce((s, t) => s + t.x, 0) / list.length + 0.5;
    const cy = list.reduce((s, t) => s + t.y, 0) / list.length + 0.5;
    const passage = {
        kind,
        tiles: list,
        cx, cy,
        open: false,
        opening: false,
        locked: locked ?? false,
        lockType: lockType ?? null,
        openProgress: 0,
    };
    gates.push(passage);
    for (const t of list) {
        doors[`${t.x},${t.y}`] = passage;
    }
}

/** Register a single-tile door. Use for 1-wide openings. */
export function registerDoor(x, y, locked, lockType) {
    registerPassage([{ x, y }], locked, lockType);
}

/** Register a multi-tile gate. Use for openings 2+ tiles wide. */
function registerGate(tiles, locked, lockType) {
    registerPassage(tiles, locked, lockType);
}

/** Reset all passages (doors and gates) to closed. */
export function resetDoors() {
    for (const g of gates) {
        g.open = false;
        g.opening = false;
        g.openProgress = 0;
    }
}

/** Open all passages (for regression tests). */
export function openAllDoors() {
    for (const g of gates) {
        g.open = true;
        g.opening = false;
        g.openProgress = 1;
    }
}

// One passage per opening: door = 1 tile, gate = 2+ tiles
registerGate(
    [...Array(HALL_01_H)].map((_, i) => ({ x: DOOR_01_X, y: HALL_01_Y + i })),
    false, null
);
registerGate(
    [...Array(3)].map((_, i) => ({ x: GATE_X - 1 + i, y: GATE_Y })),
    true, 'button'
);
registerGate(
    [...Array(HALL_R1R2_H)].map((_, i) => ({ x: A2R1_X, y: HALL_R1R2_Y + i })),
    false, null
);
registerGate(
    [...Array(HALL_R1R3_W)].map((_, i) => ({ x: HALL_R1R3_X + i, y: A2R1_Y + A2R1_H })),
    false, null
);
registerGate(
    [...Array(HALL_R3R4_H)].map((_, i) => ({ x: A2R3_X + A2R3_W, y: HALL_R3R4_Y + i })),
    false, null
);
registerGate(
    [...Array(HALL_R3R5_W)].map((_, i) => ({ x: HALL_R3R5_X + i, y: A2R3_Y + A2R3_H })),
    false, null
);
registerGate(
    [...Array(3)].map((_, i) => ({ x: KEYDOOR_X - 1 + i, y: KEYDOOR_Y })),
    true, 'key'
);

// ── Public API ──────────────────────────────────────────────────────

/**
 * Safe grid lookup. Returns tile type at (x, y).
 * Floors fractional coords. Returns WALL for out-of-bounds.
 */
export function getTile(x, y) {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (row < 0 || row >= MAP_HEIGHT || col < 0 || col >= MAP_WIDTH) {
        return TILE.WALL; // out of bounds = solid
    }
    return grid[row][col];
}

/**
 * Is the tile at (x, y) solid (blocks movement and raycasting)?
 * Floors fractional coords.
 */
export function isSolid(x, y) {
    const tile = getTile(x, y);
    switch (tile) {
        case TILE.WALL:
            return true;
        case TILE.SECRET_WALL:
            return true; // looks and acts like wall until opened
        case TILE.DOOR:
        case TILE.DOOR_LOCKED_BUTTON:
        case TILE.DOOR_LOCKED_KEY: {
            // Check if this door is open
            const key = `${Math.floor(x)},${Math.floor(y)}`;
            const door = doors[key];
            if (door && door.openProgress >= 1) return false; // fully open = passable
            return true; // closed or partially open = solid
        }
        default:
            return false; // EMPTY, LIGHT_WELL, OUTDOOR, STAIR, BUTTON are walkable
    }
}

/**
 * Get room ID at world position (x, y). Returns null for corridors/unlabeled.
 */
export function getRoomId(x, y) {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (row < 0 || row >= MAP_HEIGHT || col < 0 || col >= MAP_WIDTH) {
        return null;
    }
    return roomMeta[row][col];
}

/** Grid width in tiles. */
export function getMapWidth() { return MAP_WIDTH; }

/** Grid height in tiles. */
export function getMapHeight() { return MAP_HEIGHT; }

/** Export the raw grid for raycaster access. */
export { grid };

// ── Exported Room Geometry (for entity spawning, minimap, etc.) ─────
export const ROOM_BOUNDS = {
    area0: { x: A0_X, y: A0_Y, w: A0_W, h: A0_H },
    area1: { x: A1_X, y: A1_Y, w: A1_W, h: A1_H },
    a2r1: { x: A2R1_X, y: A2R1_Y, w: A2R1_W, h: A2R1_H },
    a2r2: { x: A2R2_X, y: A2R2_Y, w: A2R2_W, h: A2R2_H },
    a2r3: { x: A2R3_X, y: A2R3_Y, w: A2R3_W, h: A2R3_H },
    a2r4: { x: A2R4_X, y: A2R4_Y, w: A2R4_W, h: A2R4_H },
    a2r5: { x: A2R5_X, y: A2R5_Y, w: A2R5_W, h: A2R5_H },
    bossCorridor: { x: BC_X, y: BC_Y, w: BC_W, h: BC_H },
    area3: { x: A3_X, y: A3_Y, w: A3_W, h: A3_H },
};

// Pickup positions
export const PICKUP_POSITIONS = {
    handgun: { x: A0_X + A0_W / 2 + 1, y: A0_Y + A0_H / 2 },
    shotgun: { x: A2R4_X + A2R4_W / 2, y: A2R4_Y + A2R4_H / 2 + 1 },
    voidbeam: VOIDBEAM_POS,
};

export const INTERACTABLE_POSITIONS = {
    area1Button: { x: BUTTON_X + 0.5, y: BUTTON_Y + 0.5 },
};

// Enemy spawn positions per room
export const ENEMY_SPAWNS = {
    area1: [
        { type: 'GLIMMER', x: A1_X + 3, y: A1_Y + 3 },
        { type: 'GLIMMER', x: A1_X + 11, y: A1_Y + 3 },
        { type: 'GLIMMER', x: A1_X + 3, y: A1_Y + 11 },
        { type: 'GLIMMER', x: A1_X + 11, y: A1_Y + 11 },
    ],
    a2r1: [
        { type: 'GLIMMER', x: A2R1_X + 3, y: A2R1_Y + 2 },
        { type: 'GLIMMER', x: A2R1_X + 6, y: A2R1_Y + 5 },
        { type: 'GLIMMER', x: A2R1_X + 9, y: A2R1_Y + 3 },
        { type: 'PHANTOM', x: A2R1_X + 6, y: A2R1_Y + 2 },
    ],
    a2r2: [
        { type: 'GLIMMER', x: A2R2_X + 2, y: A2R2_Y + 3 },
        { type: 'GLIMMER', x: A2R2_X + 5, y: A2R2_Y + 7 },
        { type: 'GLIMMER', x: A2R2_X + 3, y: A2R2_Y + 10 },
        { type: 'GLIMMER', x: A2R2_X + 6, y: A2R2_Y + 9 },
    ],
    a2r3: [
        { type: 'GLIMMER', x: A2R3_X + 2, y: A2R3_Y + 2 },
        { type: 'GLIMMER', x: A2R3_X + 9, y: A2R3_Y + 9 },
        { type: 'PHANTOM', x: A2R3_X + 2, y: A2R3_Y + 9 },
        { type: 'PHANTOM', x: A2R3_X + 9, y: A2R3_Y + 2 },
    ],
    a2r4: [
        { type: 'GLIMMER', x: A2R4_X + 2, y: A2R4_Y + 2 },
        { type: 'GLIMMER', x: A2R4_X + 7, y: A2R4_Y + 7 },
        { type: 'PRISM', x: A2R4_X + 5, y: A2R4_Y + 5 },
    ],
    a2r5: [
        { type: 'PHANTOM', x: A2R5_X + 3, y: A2R5_Y + 3 },
        { type: 'PHANTOM', x: A2R5_X + 7, y: A2R5_Y + 3 },
        { type: 'PHANTOM', x: A2R5_X + 5, y: A2R5_Y + 6 },
    ],
    area3: [
        { type: 'BOSS', x: BOSS_SPAWN.x, y: BOSS_SPAWN.y },
    ],
};

export const BOSS_LIGHTWELLS = [
    { x: A3_X + 2.5, y: A3_Y + 2.5 },   // NW
    { x: A3_X + 13.5, y: A3_Y + 2.5 },  // NE
    { x: A3_X + 7.5, y: A3_Y + 12.5 }   // S-Center
];

export { BOSS_SPAWN };
