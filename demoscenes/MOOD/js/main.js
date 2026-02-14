/**
 * main.js — MOOD Game Loop & State Management
 * 
 * Entry point. Creates the shared state object, manages the game loop,
 * handles overlays (start, pause, controls), and orchestrates all systems.
 */

import {
    INTERNAL_WIDTH, INTERNAL_HEIGHT,
    PLAYER_FOV, DT_CAP, TOTAL_ENEMIES
} from './config.js';

import * as input from './input.js';
import { PLAYER_SPAWN } from './map.js';
import * as renderer from './renderer.js';
import * as player from './player.js';
import * as hud from './hud.js';
import * as triggers from './triggers.js';
import * as pickups from './pickups.js';
import * as entities from './entities.js';
import * as combat from './combat.js';
import * as projectiles from './projectiles.js';
import * as ai from './ai.js';
import * as audio from './audio.js';
import * as objectives from './objectives.js';

// ── DOM References ──────────────────────────────────────────────────
const canvas = document.getElementById('mood-canvas');
const ctx = canvas.getContext('2d');
const overlayStart = document.getElementById('overlay-start');
const overlayPause = document.getElementById('overlay-pause');
const overlayControls = document.getElementById('overlay-controls');
const btnStart = document.getElementById('btn-start');
const btnStartControls = document.getElementById('btn-start-controls');
const btnStartQuit = document.getElementById('btn-start-quit');
const btnResume = document.getElementById('btn-resume');
const btnControls = document.getElementById('btn-controls');
const btnCloseControls = document.getElementById('btn-close-controls');
const btnQuit = document.getElementById('btn-quit');
const debugOverlay = document.getElementById('debug-overlay');

// HUD DOM elements
const hudKillCounter = document.getElementById('hud-kill-counter');
const hudObjectives = document.getElementById('hud-objectives');
const hudRoomLabel = document.getElementById('hud-room-label');
const hudWeapon = document.getElementById('hud-weapon');
const hudAiIndicator = document.getElementById('hud-ai-indicator');

// ── Canvas Setup ────────────────────────────────────────────────────
canvas.width = INTERNAL_WIDTH;   // 400
canvas.height = INTERNAL_HEIGHT; // 300
// Display size is set in CSS (800x600, pixelated upscale)

// ── Shared Game State ───────────────────────────────────────────────
const state = {
    player: {
        x: 0,
        y: 0,
        angle: 0,
        pitch: 0,
        fov: PLAYER_FOV,
        weapons: ['FIST'],
        currentWeapon: 'FIST',
        weaponState: {
            phase: 'idle',   // 'idle' | 'windup' | 'fire' | 'recovery' | 'swapping'
            timer: 0,
            swapTarget: null,
        },
        walkCycle: 0,
        hasAstralKey: false,
    },
    entities: [],
    projectiles: [],
    map: null,        // set during init from map.js
    pickups: [],
    hud: {
        killCount: 0,
        totalEnemies: TOTAL_ENEMIES,
        currentRoomLabel: '',
        currentRoomId: null,
        roomChanged: false,
        messages: [],     // [{ text, timer }]
    },
    ai: {
        active: false,
        idleTimer: 0,
        currentTarget: null,
        waypointPath: [],
        input: {          // Synthetic input from AI
            moveForward: false,
            moveBack: false,
            strafeLeft: false,
            strafeRight: false,
            lookDX: 0,
            lookDY: 0,
            fire: false,
            interact: false,
            weaponSlot: null,
        },
    },
    time: {
        now: 0,
        dt: 0,
        elapsed: 0,
    },
    pendingFire: false,
    pendingProjectiles: [],
    pendingKeyDrop: null,
    flags: {
        started: false,
        paused: false,
        bossActive: false,
        victoryTriggered: false,
        buttonPressed: false,
        area1Cleared: false,
        secretFound: false,
        lightWellHintShown: false,
        voidBeamLightZoneUsed: false,
    },
    objectives: objectives.createObjectivesState(),
    effects: {
        screenShake: 0,
        distortion: 0,
        victoryAlpha: 0,
    },
};

// ── Debug Overlay ───────────────────────────────────────────────────
let frameCount = 0;
let fpsAccumulator = 0;
let displayFps = 0;

function updateDebug(dt) {
    if (!input.isDebugVisible()) {
        debugOverlay.classList.remove('visible');
        return;
    }
    debugOverlay.classList.add('visible');

    // FPS calculation (smoothed)
    frameCount++;
    fpsAccumulator += dt;
    if (fpsAccumulator >= 0.5) {
        displayFps = Math.round(frameCount / fpsAccumulator);
        frameCount = 0;
        fpsAccumulator = 0;
    }

    const p = state.player;
    const angleDeg = ((p.angle * 180 / Math.PI) % 360).toFixed(1);
    const aliveCount = state.entities.filter(e => e.hp > 0).length;

    debugOverlay.textContent =
        `FPS: ${displayFps}\n` +
        `Pos: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}\n` +
        `Angle: ${angleDeg}° Pitch: ${p.pitch.toFixed(2)}\n` +
        `Room: ${state.hud.currentRoomId || '—'}\n` +
        `Entities: ${aliveCount}/${state.entities.length}\n` +
        `AI: ${state.ai.active ? 'ACTIVE' : 'inactive'}\n` +
        `Weapon: ${p.currentWeapon} [${p.weaponState.phase}]\n` +
        `Elapsed: ${state.time.elapsed.toFixed(1)}s`;
}

// ── HUD DOM Updates ─────────────────────────────────────────────────
function updateHudDom() {
    hudKillCounter.textContent = `${state.hud.killCount}/${state.hud.totalEnemies} SPIRITS`;
    hudObjectives.innerHTML = objectives.renderObjectivesHtml(state);
    hudWeapon.textContent = state.player.currentWeapon;

    // AI indicator
    if (state.ai.active) {
        hudAiIndicator.textContent = 'AUTO';
        hudAiIndicator.classList.add('active');
        hudAiIndicator.style.opacity = '1';
    } else {
        hudAiIndicator.classList.remove('active');
        hudAiIndicator.style.opacity = '0';
    }
}

// ── Message System ──────────────────────────────────────────────────
const hudMessages = document.getElementById('hud-messages');

function updateMessages(dt) {
    const msgs = state.hud.messages;
    // Tick down timers, remove expired
    for (let i = msgs.length - 1; i >= 0; i--) {
        msgs[i].timer -= dt;
        if (msgs[i].timer <= 0) {
            msgs.splice(i, 1);
        }
    }
    // Render active messages
    hudMessages.innerHTML = msgs.map(m => {
        const opacity = Math.min(1, m.timer / 0.5); // fade out in last 0.5s
        return `<div class="message" style="opacity:${opacity}">${m.text}</div>`;
    }).join('');
}

/** Push a timed HUD message. */
export function showMessage(text, duration = 2) {
    state.hud.messages.push({ text, timer: duration });
}

// ── Room Label ──────────────────────────────────────────────────────
let roomLabelTimer = 0;

function updateRoomLabel(dt) {
    if (roomLabelTimer > 0) {
        roomLabelTimer -= dt;
        hudRoomLabel.classList.add('visible');
        if (roomLabelTimer <= 0) {
            hudRoomLabel.classList.remove('visible');
        }
    }
}

export function setRoomLabel(label) {
    if (label && label !== hudRoomLabel.textContent) {
        hudRoomLabel.textContent = label;
        roomLabelTimer = 3.5; // visible for 3s + 0.5s fade
    }
}

// ── Controls Overlay ────────────────────────────────────────────────
let controlsTimer = 3; // show for 3 seconds
let controlsPinned = false;

function showControls(seconds = 3, pinned = false) {
    controlsPinned = pinned;
    controlsTimer = seconds;
    overlayControls.classList.remove('hidden');
    overlayControls.classList.remove('fade-out');
}

function hideControls() {
    controlsPinned = false;
    controlsTimer = 0;
    overlayControls.classList.add('fade-out');
    setTimeout(() => overlayControls.classList.add('hidden'), 220);
}

function updateControlsOverlay(dt) {
    if (controlsPinned) return;
    if (controlsTimer > 0) {
        controlsTimer -= dt;
        if (controlsTimer <= 0) {
            overlayControls.classList.add('fade-out');
            setTimeout(() => overlayControls.classList.add('hidden'), 500);
        }
    }
}

// ── Game Loop ───────────────────────────────────────────────────────
let lastTime = 0;

function gameLoop(timestamp) {
    const rawDt = (timestamp - lastTime) / 1000;
    const dt = Math.min(rawDt, DT_CAP);
    lastTime = timestamp;

    state.time.dt = dt;
    state.time.now = timestamp;
    state.time.elapsed += dt;

    // ── Step 1: Input ───────────────────────────────────────────
    input.update(dt);

    // Check for pause trigger
    if (input.shouldPause() && state.flags.started && !state.flags.paused) {
        pauseGame();
    }

    // ── Step 2: Pause check ─────────────────────────────────────
    if (state.flags.paused) {
        requestAnimationFrame(gameLoop);
        return;
    }

    // ── Step 3: AI update ───────────────────────────────────────
    objectives.updateObjectives(state);
    state.ai.active = input.isAIActive();
    ai.update(state);

    // ── Step 4: Player update ───────────────────────────────────
    player.update(state);

    // Check if player entered a new room
    if (state.hud.roomChanged) {
        state.hud.roomChanged = false;
        setRoomLabel(state.hud.currentRoomLabel);
    }

    // ── Step 5: Entities update ─────────────────────────────────
    entities.update(state);

    // ── Step 6: Projectiles update ──────────────────────────────
    projectiles.update(state);

    // ── Step 7: Pickups update ──────────────────────────────────
    pickups.update(state);

    // ── Step 8: Triggers update ─────────────────────────────────
    triggers.update(state);

    // ── Step 9: Combat update ───────────────────────────────────
    combat.update(state);

    // ── Step 10: Effects update ─────────────────────────────────
    // Tick down effect timers
    if (state.effects.screenShake > 0) state.effects.screenShake--;
    if (state.effects.distortion > 0) state.effects.distortion -= dt;

    // Victory check
    if (state.flags.victoryTriggered && state.effects.victoryAlpha < 1) {
        state.effects.victoryAlpha += dt * 0.3; // 3+ second fade
        if (state.effects.victoryAlpha >= 1) {
            state.effects.victoryAlpha = 1;
            // Show victory overlay after full fade
            showVictoryScreen();
        }
    }

    // Handle Prism key drop
    if (state.pendingKeyDrop) {
        const keyPos = state.pendingKeyDrop;
        state.pickups.push({
            type: 'ASTRAL_KEY',
            x: keyPos.x, y: keyPos.y,
            collected: false,
            bobOffset: 0,
            bobPhase: 0,
        });
        state.pendingKeyDrop = null;
        state.hud.messages.push({ text: 'ASTRAL KEY DROPPED', timer: 2 });
    }

    // ── Step 11: Render ─────────────────────────────────────────
    renderer.draw(state, ctx);

    // ── Step 12: Audio update ───────────────────────────────────
    audio.update(state);

    // ── HUD & Overlays ──────────────────────────────────────────
    // Hue rotation is handled by renderer.draw() via CSS filter
    updateHudDom();
    updateMessages(dt);
    updateRoomLabel(dt);
    updateControlsOverlay(dt);
    updateDebug(dt);

    requestAnimationFrame(gameLoop);
}

// ── Victory Screen ──────────────────────────────────────────────────
function showVictoryScreen() {
    const victoryOverlay = document.createElement('div');
    victoryOverlay.id = 'overlay-victory';
    victoryOverlay.className = 'overlay';
    victoryOverlay.innerHTML = `
        <div class="overlay-content" style="text-align:center;">
            <h1 style="color: #0ff; font-size: 3rem; text-shadow: 0 0 20px #0ff;">THE EGO IS DISSOLVED</h1>
            <p style="color: #aaa; margin: 1rem 0;">You walked through every mood.</p>
            <p style="color: #888; font-size: 0.9rem;">Time: ${state.time.elapsed.toFixed(1)}s | Kills: ${state.hud.killCount}/${state.hud.totalEnemies}</p>
            <button style="margin-top: 2rem; padding: 0.5rem 2rem; cursor: pointer; 
                background: transparent; border: 1px solid #0ff; color: #0ff; font-family: inherit;
                font-size: 1rem;" onclick="window.location.href='../'">EXIT</button>
        </div>
    `;
    victoryOverlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.9); z-index: 1000;
        animation: fadeIn 2s ease;
    `;
    document.body.appendChild(victoryOverlay);
}

// ── Pause / Resume ──────────────────────────────────────────────────
function pauseGame() {
    state.flags.paused = true;
    overlayPause.classList.remove('hidden');
    hideControls();
}

function resumeGame() {
    state.flags.paused = false;
    overlayPause.classList.add('hidden');
    // Re-request pointer lock (must come from a click user gesture)
    input.resumeGame(canvas);
}

// Resume button — click is a valid user gesture for pointer lock
btnResume.addEventListener('click', (e) => {
    e.stopPropagation();
    resumeGame();
});

// Clicking anywhere on the pause overlay also resumes
overlayPause.addEventListener('click', (e) => {
    if (e.target === overlayPause) {
        resumeGame();
    }
});

btnQuit.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.href = '../';
});

btnControls.addEventListener('click', (e) => {
    e.stopPropagation();
    showControls(0, true);
});

btnCloseControls.addEventListener('click', (e) => {
    e.stopPropagation();
    hideControls();
});

// ── Game Start ──────────────────────────────────────────────────────
function startGame(fromClick) {
    if (state.flags.started) return;

    state.flags.started = true;
    overlayStart.classList.add('hidden');

    // Show controls overlay briefly
    showControls(3, false);

    // Initialize player at spawn position (center of Area 0)
    state.player.x = PLAYER_SPAWN.x;
    state.player.y = PLAYER_SPAWN.y;
    state.player.angle = PLAYER_SPAWN.angle;

    // Initialize pickups
    state.pickups = pickups.createInitialPickups();

    // Initialize entities (enemies)
    state.entities = entities.spawnInitialEntities();
    state.projectiles = [];

    // Request pointer lock — must come from a click event to work reliably
    if (fromClick) {
        input.requestLock(canvas);
    }

    // Start the loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

btnStart.addEventListener('click', (e) => {
    e.stopPropagation();
    startGame(true);
});

btnStartControls.addEventListener('click', (e) => {
    e.stopPropagation();
    showControls(0, true);
});

btnStartQuit.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.href = '../';
});

// Any key also starts (but won't get pointer lock — click the game area to lock)
window.addEventListener('keydown', (e) => {
    if (!state.flags.started && e.code !== 'Escape') {
        startGame(false);
    }
});

// If pointer lock is lost and game isn't paused, clicking canvas re-locks
canvas.addEventListener('click', () => {
    if (state.flags.started && !state.flags.paused && !input.isPointerLocked()) {
        input.requestLock(canvas);
    }
});

// ── Export state for other modules ──────────────────────────────────
export { state, ctx, canvas };
