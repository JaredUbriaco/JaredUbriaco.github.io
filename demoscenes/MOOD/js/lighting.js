/**
 * lighting.js — Per-room ambient lighting for the raycaster and sprites.
 *
 * Two layers: (1) global defaults, (2) per-map, per-room overrides.
 * Supports ambient, ceilingAmbient (darker unless ceiling light), warm tint,
 * and gentle breathing. No fog (handled in raycaster when legacy off).
 */

// ── Global defaults (used when room has no override) ─────────────────
export const DEFAULT_LIGHTING = {
    ambient: 1,
    ceilingAmbient: 0.7,   // darker ceiling unless light mounted
    warmHue: 35,           // old bulb / fire (amber)
    warmBlend: 0.15,       // how much to shift base hue toward warm (0–1)
    breathing: true,
    breathingAmplitude: 0.05,
    breathingSpeed: 1.5,
};

// ── Per-room overrides for MOOD level 1 (map-specific) ────────────────
/** roomId -> partial override; only set keys you want to change. */
export const ROOM_LIGHTING_LEVEL1 = {
    area0:  { ambient: 0.95, ceilingAmbient: 0.65 },
    area1:  { ambient: 0.9, ceilingAmbient: 0.6 },
    a2r1:   { ambient: 0.85, ceilingAmbient: 0.55 },
    a2r2:   { ambient: 0.82, ceilingAmbient: 0.52 },
    a2r3:   { ambient: 0.88, ceilingAmbient: 0.58 },
    a2r4:   { ambient: 0.9, ceilingAmbient: 0.6 },
    a2r5:   { ambient: 0.8, ceilingAmbient: 0.5 },
    bossCorridor: { ambient: 0.75, ceilingAmbient: 0.48 },
    area3:   {
        ambient: 1,
        ceilingAmbient: 0.85,
        warmBlend: 0.25,
        lightWellRoom: true,   // LIGHT_WELL tiles: brighter floor feel for boss arena
    },
};

/**
 * Resolve lighting for a room. Merges DEFAULT_LIGHTING with ROOM_LIGHTING_LEVEL1[roomId].
 * @param {string|null} roomId
 * @param {number} timeNow - timestamp (ms) for breathing
 * @param {boolean} useLegacy - if true, return null (caller uses legacy path)
 * @returns {{ ambient: number, ceilingAmbient: number, warmHue: number, warmBlend: number, breathingFactor: number, lightWellRoom: boolean } | null}
 */
export function getRoomLighting(roomId, timeNow, useLegacy = false) {
    if (useLegacy) return null;

    const base = { ...DEFAULT_LIGHTING };
    const overrides = (roomId && ROOM_LIGHTING_LEVEL1[roomId]) ? ROOM_LIGHTING_LEVEL1[roomId] : {};
    const merged = { ...base, ...overrides };

    let breathingFactor = 1;
    if (merged.breathing && merged.breathingAmplitude && merged.breathingSpeed) {
        breathingFactor = 1 + merged.breathingAmplitude * Math.sin((timeNow / 1000) * merged.breathingSpeed);
    }

    return {
        ambient: merged.ambient,
        ceilingAmbient: merged.ceilingAmbient ?? merged.ambient * 0.7,
        warmHue: merged.warmHue ?? DEFAULT_LIGHTING.warmHue,
        warmBlend: merged.warmBlend ?? DEFAULT_LIGHTING.warmBlend,
        breathingFactor,
        lightWellRoom: !!merged.lightWellRoom,
    };
}

/**
 * Apply lighting to a base luminance (0–100). Used by raycaster for walls/floor/ceiling.
 * @param {number} baseL - base lightness (e.g. 45)
 * @param {{ ambient: number, ceilingAmbient?: number, breathingFactor: number } | null} lighting - from getRoomLighting, or null for no change
 * @param {'wall'|'ceiling'|'floor'} surface - ceiling uses ceilingAmbient
 */
export function applyLightingToLuminance(baseL, lighting, surface = 'wall') {
    if (!lighting) return baseL;
    const mult = surface === 'ceiling' ? lighting.ceilingAmbient : lighting.ambient;
    return baseL * mult * lighting.breathingFactor;
}

/**
 * Blend base HSL hue toward warm (amber). Returns hue in 0–360.
 */
export function blendWarmHue(baseHue, lighting) {
    if (!lighting || lighting.warmBlend <= 0) return baseHue;
    const warm = lighting.warmHue;
    const diff = ((warm - baseHue + 180) % 360) - 180;
    return baseHue + diff * lighting.warmBlend;
}
