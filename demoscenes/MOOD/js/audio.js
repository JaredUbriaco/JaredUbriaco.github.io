/**
 * audio.js — Procedural Audio via Web Audio API
 * 
 * All sounds are synthesized. No external audio files.
 * - Ambient drone (continuous, pitch-shifts with room)
 * - Weapon fire sounds
 * - Enemy hit / death sounds
 * - Door open sound
 * - Pickup collected sound
 * - Boss music layer
 */

let ctx = null;          // AudioContext (created on first interaction)
let masterGain = null;
let droneOsc = null;
let droneGain = null;
let bossOsc = null;
let bossGain = null;
let initialized = false;

// Room-based drone frequencies (lower = creepier)
const ROOM_DRONE_FREQ = {
    area0: 55,           // A1
    area1: 65,           // C2
    a2r1: 73,            // D2
    a2r2: 62,            // B1
    a2r3: 82,            // E2
    a2r4: 98,            // G2
    a2r5: 60,            // B1 low
    bossCorridor: 49,    // G1
    area3: 41,           // E1
};

// ── Initialize Audio Context ────────────────────────────────────────

function init() {
    if (initialized) return;

    try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.3;
        masterGain.connect(ctx.destination);

        // Ambient drone oscillator
        droneOsc = ctx.createOscillator();
        droneOsc.type = 'sawtooth';
        droneOsc.frequency.value = 55;

        droneGain = ctx.createGain();
        droneGain.gain.value = 0.08;

        // Low-pass filter for warmth
        const droneFilter = ctx.createBiquadFilter();
        droneFilter.type = 'lowpass';
        droneFilter.frequency.value = 200;
        droneFilter.Q.value = 2;

        droneOsc.connect(droneFilter);
        droneFilter.connect(droneGain);
        droneGain.connect(masterGain);
        droneOsc.start();

        // Boss music oscillator (dormant until boss fight)
        bossOsc = ctx.createOscillator();
        bossOsc.type = 'square';
        bossOsc.frequency.value = 82;
        bossGain = ctx.createGain();
        bossGain.gain.value = 0;

        const bossFilter = ctx.createBiquadFilter();
        bossFilter.type = 'lowpass';
        bossFilter.frequency.value = 400;

        bossOsc.connect(bossFilter);
        bossFilter.connect(bossGain);
        bossGain.connect(masterGain);
        bossOsc.start();

        initialized = true;
    } catch (e) {
        console.warn('Audio initialization failed:', e);
    }
}

// ── Sound Effects (one-shot) ────────────────────────────────────────

function playOneShot(freq, type, duration, volume = 0.15) {
    if (!ctx) return;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

function playNoise(duration, volume = 0.1) {
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start();
}

// ── Specific Sound Effects ──────────────────────────────────────────

function playWeaponFire(weaponType) {
    switch (weaponType) {
        case 'FIST':
            playOneShot(120, 'sine', 0.1, 0.1);
            break;
        case 'HANDGUN':
            playNoise(0.15, 0.15);
            playOneShot(440, 'square', 0.08, 0.1);
            break;
        case 'SHOTGUN':
            playNoise(0.25, 0.25);
            playOneShot(220, 'sawtooth', 0.15, 0.15);
            break;
        case 'VOIDBEAM':
            playOneShot(880, 'sine', 0.3, 0.1);
            playOneShot(660, 'sine', 0.4, 0.08);
            break;
    }
}

function playEnemyHit() {
    playOneShot(600, 'square', 0.08, 0.08);
}

function playEnemyDeath() {
    playOneShot(400, 'sawtooth', 0.2, 0.12);
    playOneShot(200, 'sine', 0.4, 0.08);
}

function playDoorOpen() {
    playOneShot(150, 'triangle', 0.3, 0.1);
    playOneShot(200, 'triangle', 0.2, 0.08);
}

function playPickup() {
    playOneShot(523, 'sine', 0.1, 0.1);
    playOneShot(659, 'sine', 0.1, 0.1);
    setTimeout(() => {
        if (ctx) playOneShot(784, 'sine', 0.15, 0.08);
    }, 100);
}

// ── Event Tracking ──────────────────────────────────────────────────
let lastKillCount = 0;
let lastWeaponPhase = 'idle';
let lastCurrentRoom = null;

// ── Main Audio Update ───────────────────────────────────────────────

/**
 * Update audio system. Called each frame.
 * @param {object} state - Shared game state
 */
export function update(state) {
    // Lazy init (needs user gesture)
    if (!initialized) {
        init();
        if (!initialized) return;
    }

    // Resume context if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
        ctx.resume();
    }

    const player = state.player;
    const ws = player.weaponState;

    // ── Weapon fire sound ───────────────────────────────────────
    if (ws.phase === 'fire' && lastWeaponPhase !== 'fire') {
        playWeaponFire(player.currentWeapon);
    }
    lastWeaponPhase = ws.phase;

    // ── Kill sound ──────────────────────────────────────────────
    if (state.hud.killCount > lastKillCount) {
        const kills = state.hud.killCount - lastKillCount;
        for (let i = 0; i < kills; i++) {
            playEnemyDeath();
        }
        lastKillCount = state.hud.killCount;
    }

    // ── Entity hit flash sound ──────────────────────────────────
    for (const e of state.entities) {
        if (e.hitFlash === 3) { // just got hit (hitFlash starts at 3)
            playEnemyHit();
        }
    }

    // ── Door opening sound ──────────────────────────────────────
    // Check for message "GATE UNLOCKED" etc — simple trigger detection
    for (const msg of state.hud.messages) {
        if (msg.timer > 1.9 && msg.text.includes('ACQUIRED')) {
            playPickup();
        }
    }

    // ── Drone frequency shift on room change ────────────────────
    const currentRoom = state.hud.currentRoomId;
    if (currentRoom !== lastCurrentRoom && droneOsc) {
        const targetFreq = ROOM_DRONE_FREQ[currentRoom] || 55;
        droneOsc.frequency.linearRampToValueAtTime(targetFreq, ctx.currentTime + 1);
        lastCurrentRoom = currentRoom;

        // Door sound when changing rooms
        playDoorOpen();
    }

    // ── Boss music layer ────────────────────────────────────────
    if (state.flags.bossActive && bossGain) {
        bossGain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 2);
        // Pulse the boss oscillator frequency
        const pulse = 82 + Math.sin(state.time.now * 0.002) * 20;
        bossOsc.frequency.value = pulse;
    }

    // ── Victory: fade out all audio ─────────────────────────────
    if (state.flags.victoryTriggered && masterGain) {
        masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 3);
    }
}
