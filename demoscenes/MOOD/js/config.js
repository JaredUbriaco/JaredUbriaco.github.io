/**
 * config.js — MOOD Game Constants
 * 
 * The ONLY file with no imports. Every other module imports from here.
 * No side effects on import — pure constant definitions.
 */

// ── Resolution ──────────────────────────────────────────────────────
export const INTERNAL_WIDTH = 400;
export const INTERNAL_HEIGHT = 300;
export const DISPLAY_WIDTH = 800;
export const DISPLAY_HEIGHT = 600;

// ── Player Defaults ─────────────────────────────────────────────────
export const PLAYER_SPEED = 3;          // tiles/sec
export const PLAYER_RADIUS = 0.2;       // collision circle radius (tiles)
export const PLAYER_FOV = Math.PI / 3;  // 60 degrees
export const MOUSE_SENSITIVITY = 0.002; // rad/px of mouse movement
export const PITCH_LIMIT = 0.7;         // ±0.7 rad (~40 degrees) vertical look
export const PITCH_SCALE = 200;         // pixels per radian for y-shearing

// ── Tile Types (CANONICAL — see tasks0.md for rationale) ────────────
// Weapon pickups are sprite entities, NOT tile types.
export const TILE = {
    EMPTY: 0,               // Walkable floor
    WALL: 1,                // Standard ethereal wall
    DOOR: 2,                // Opens with E key
    DOOR_LOCKED_BUTTON: 3,  // Locked until Area 1 button pressed
    SECRET_WALL: 4,         // Looks like WALL, opens with E to reveal passage
    DOOR_LOCKED_KEY: 5,     // Locked until Astral Key collected
    LIGHT_WELL: 6,          // Boss room floor — enables boss damage
    OUTDOOR: 7,             // Walkable, skybox ceiling instead of indoor ceiling
    STAIR: 8,               // Visual transition tile (indoor ↔ outdoor)
    BUTTON: 9,              // Interactive button (Area 1 far wall)
};

// ── Weapon Stats ────────────────────────────────────────────────────
export const WEAPONS = {
    FIST: {
        name: 'FIST',
        damage: 2,
        range: 2.5,
        fireRate: 333,        // ms between full fire cycles
        type: 'melee',
        windupMs: 80,
        fireMs: 80,
        recoveryMs: 173,
    },
    HANDGUN: {
        name: 'HANDGUN',
        damage: 5,
        range: Infinity,
        fireRate: 500,
        type: 'hitscan',
        windupMs: 50,
        fireMs: 100,
        recoveryMs: 350,
    },
    SHOTGUN: {
        name: 'SHOTGUN',
        damage: 15,           // total across all pellets
        range: 6,
        fireRate: 1000,
        type: 'shotgun',
        pellets: 12,
        spread: Math.PI / 18, // ±10 degrees
        windupMs: 80,
        fireMs: 200,
        recoveryMs: 720,
    },
    VOIDBEAM: {
        name: 'VOID BEAM',
        damage: 10,
        range: Infinity,
        fireRate: 333,
        type: 'hitscan',
        windupMs: 50,
        fireMs: 233,
        recoveryMs: 50,
    },
};

// ── Enemy Stats ─────────────────────────────────────────────────────
export const ENEMIES = {
    GLIMMER: {
        hp: 5,
        speed: 0.5,           // idle wander speed (tiles/sec)
        aggroSpeed: 1.5,      // pursuit speed (tiles/sec)
        radius: 0.2,
        spriteWidth: 0.4,     // visual width in world units
        spriteHeight: 0.4,
    },
    PHANTOM: {
        hp: 20,
        speed: 0.6,
        aggroSpeed: 1.2,
        radius: 0.3,
        spriteWidth: 0.6,
        spriteHeight: 1.2,
        projectileSpeed: 2,
        fireRate: 2000,       // ms between shots
        approachDist: 4,      // tiles — strafe at this range
        retreatDist: 6,       // tiles — retreat when HP < 50%
    },
    PRISM: {
        hp: 30,
        speed: 0.5,
        aggroSpeed: 1.0,
        radius: 0.4,
        spriteWidth: 0.8,
        spriteHeight: 0.8,
        projectileSpeed: 2,
        fireRate: 2000,
        spreadCount: 3,       // fires 3 projectiles in spread
        spreadAngle: Math.PI / 12,  // ±15 degrees
    },
    BOSS: {
        hp: 150,
        speed: 1.5,           // orbital speed (tiles/sec)
        aggroSpeed: 2.0,      // movement speed toward orbit point
        radius: 1.0,
        spriteWidth: 2.0,
        spriteHeight: 2.0,
        projectileSpeed: 2,
        fireRate: 2500,
        orbitRadius: 5.5,     // tiles from room center
    },
};

// ── Timing ──────────────────────────────────────────────────────────
export const DT_CAP = 0.05;                // 50ms max delta (prevents physics explosions)
export const AI_IDLE_THRESHOLD = 5.0;       // seconds before AI takes over
export const DOOR_OPEN_DURATION = 0.3;      // seconds for door animation
export const WEAPON_SWAP_DELAY = 200;       // ms
export const AGGRO_PROPAGATION_RANGE = 3;   // tiles
export const INTERACTION_RANGE = 2;         // tiles
export const INTERACTION_ANGLE = Math.PI / 6; // ±30 degrees

// ── Visual ──────────────────────────────────────────────────────────
export const HUE_ROTATE_SPEED = 0.02;      // degrees per ms
export const BREATHING_AMPLITUDE = 0.025;   // ±2.5% wall height
export const BREATHING_SPEED = 0.001;       // sin() frequency multiplier

/** When true, L key toggles legacy lighting (no room ambient, no breathing). Initial value for state.debug.useLegacyLighting. */
export const DEBUG_TOGGLE_LIGHT = false;
export const PROJECTILE_TRAIL_LENGTH = 3;   // number of trail positions
/** Door/gate recess: apparent depth in tiles so panels look set into the wall from both sides. */
export const DOOR_RECESS_DEPTH = 0.12;

// ── Projection (derived) ───────────────────────────────────────────
export const PROJECTION_PLANE = INTERNAL_WIDTH / (2 * Math.tan(PLAYER_FOV / 2));

// ── Entity Caps ─────────────────────────────────────────────────────
export const MAX_ENTITIES = 30;
export const MAX_PROJECTILES = 50;
export const TOTAL_ENEMIES = 23;            // 15 Glimmers + 6 Phantoms + 1 Prism + 1 Boss
