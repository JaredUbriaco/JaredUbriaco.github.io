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
import { PLAYER_SPAWN, resetDoors } from './map.js';
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
        /** Combat memory: keep targeting recent enemy briefly without LOS so we don't rescans */
        lastEnemyTargetId: null,
        lastEnemyTime: 0,
        /** Telemetry for debug: state, targetId, confidence, stuckTimer, replanCount */
        telemetry: {},
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

    let debugText =
        `FPS: ${displayFps}\n` +
        `Pos: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}\n` +
        `Angle: ${angleDeg}° Pitch: ${p.pitch.toFixed(2)}\n` +
        `Room: ${state.hud.currentRoomId || '—'}\n` +
        `Entities: ${aliveCount}/${state.entities.length}\n` +
        `AI: ${state.ai.active ? 'ACTIVE' : 'inactive'}\n` +
        `Weapon: ${p.currentWeapon} [${p.weaponState.phase}]\n` +
        `Elapsed: ${state.time.elapsed.toFixed(1)}s`;
    if (state.ai.active && state.ai.debug) {
        const d = state.ai.debug;
        debugText +=
            `\n— AI —\n` +
            `Room: ${d.roomId}  Goal: ${d.goalSummary}\n` +
            `Raw step: ${d.rawStepIndex}  Effective: ${d.effectiveStepIndex}  Step: ${d.stepLabel || '—'}\n` +
            `Door 8,5: open=${d.door_8_5_open} progress=${d.door_8_5_progress}\n` +
            `Stuck: ${d.stuckTimer ?? '0'}  Replan: ${d.replanCount ?? 0}  BackingUp: ${d.backingUp ? 'YES' : 'no'}\n` +
            `Skipped: [${(d.skippedSteps || []).join(', ')}]\n` +
            `Last enemy id: ${d.lastEnemyId ?? '—'}`;
    } else if (state.ai.active && state.ai.telemetry && Object.keys(state.ai.telemetry).length > 0) {
        const t = state.ai.telemetry;
        debugText +=
            `\n— AI —\n` +
            `State: ${t.state}  Target: ${t.targetId}\n` +
            `Conf: ${t.confidence}  Stuck: ${t.stuckTimer}  Replan: ${t.replanCount}  Path: ${t.pathNodes ?? '—'} nodes\n` +
            `Decision: ${t.decisionMs ?? '—'}ms  Plan: ${t.planMs ?? '—'}ms`;
    }
    debugOverlay.textContent = debugText;
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
const HUD_MESSAGES_MAX = 8;

function updateMessages(dt) {
    const msgs = state.hud.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
        msgs[i].timer -= dt;
        if (msgs[i].timer <= 0) msgs.splice(i, 1);
    }
    if (msgs.length > HUD_MESSAGES_MAX) msgs.splice(0, msgs.length - HUD_MESSAGES_MAX);
    hudMessages.innerHTML = msgs.map(m => {
        const opacity = Math.min(1, m.timer / 0.5);
        return `<div class="message" style="opacity:${opacity}">${m.text}</div>`;
    }).join('');
}

/** Push a timed HUD message. Capped so the list never overflows. */
export function showMessage(text, duration = 2) {
    const msgs = state.hud.messages;
    msgs.push({ text, timer: duration });
    if (msgs.length > HUD_MESSAGES_MAX) msgs.splice(0, msgs.length - HUD_MESSAGES_MAX);
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

    // ── Step 3: Advance door animations (before AI so AI sees current door state) ─
    triggers.advanceDoorAnimations(state);

    // ── Step 4: AI update ───────────────────────────────────────
    objectives.updateObjectives(state);
    state.ai.active = input.isAIActive();
    ai.update(state);

    // ── Step 5: Player update ───────────────────────────────────
    player.update(state);

    // Check if player entered a new room
    if (state.hud.roomChanged) {
        state.hud.roomChanged = false;
        setRoomLabel(state.hud.currentRoomLabel);
    }

    // ── Step 6: Entities update ─────────────────────────────────
    entities.update(state);

    // ── Step 7: Projectiles update ──────────────────────────────
    projectiles.update(state);

    // ── Step 8: Pickups update ──────────────────────────────────
    pickups.update(state);

    // ── Step 9: Triggers update (process interact after AI) ─────
    triggers.update(state);

    // ── Step 10: Combat update ──────────────────────────────────
    combat.update(state);

    // ── Step 11: Effects update ─────────────────────────────────
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

    // ── Step 12: Render ─────────────────────────────────────────
    renderer.draw(state, ctx);

    // ── Step 13: Audio update ───────────────────────────────────
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
    audio.initFromUserGesture();
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
    audio.initFromUserGesture(); // user gesture allows AudioContext if not yet started
    if (state.flags.started && !state.flags.paused && !input.isPointerLocked()) {
        input.requestLock(canvas);
    }
});

// ── Simulation tick & test init (for regression) ───────────────────
const FIXED_DT = 1 / 60;

/**
 * Run one simulation tick without input or render. Caller should set state.ai.active.
 * Advances state.time by dt.
 */
export function runSimulationTick(state, dt = FIXED_DT) {
    const t = state.time;
    t.dt = dt;
    t.now += dt;
    t.elapsed += dt;

    triggers.advanceDoorAnimations(state);
    objectives.updateObjectives(state);
    state.ai.active = true;
    ai.update(state);
    player.update(state);
    if (state.hud.roomChanged) state.hud.roomChanged = false;

    entities.update(state);
    projectiles.update(state);
    pickups.update(state);
    triggers.update(state);
    combat.update(state);

    if (state.effects.screenShake > 0) state.effects.screenShake--;
    if (state.effects.distortion > 0) state.effects.distortion -= dt;

    if (state.flags.victoryTriggered && state.effects.victoryAlpha < 1) {
        state.effects.victoryAlpha = Math.min(1, state.effects.victoryAlpha + dt * 0.3);
    }
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
    }
}

/**
 * Initialize state for regression: same as startGame() minus DOM/input.
 * Resets doors, player, pickups, entities, objectives, flags.
 */
export function initGameStateForTest(state) {
    state.flags.started = true;
    state.flags.paused = false;
    state.flags.bossActive = false;
    state.flags.victoryTriggered = false;
    state.flags.buttonPressed = false;
    state.flags.voidBeamLightZoneUsed = false;
    state.player.x = PLAYER_SPAWN.x;
    state.player.y = PLAYER_SPAWN.y;
    state.player.angle = PLAYER_SPAWN.angle;
    state.player.weapons = ['FIST'];
    state.player.currentWeapon = 'FIST';
    state.player.hasAstralKey = false;
    state.player.weaponState = { phase: 'idle', timer: 0, swapTarget: null };
    state.pickups = pickups.createInitialPickups();
    state.entities = entities.spawnInitialEntities();
    state.projectiles = [];
    state.objectives = objectives.createObjectivesState();
    state.hud.killCount = 0;
    state.hud.currentRoomId = null;
    state.hud.messages = [];
    state.effects.victoryAlpha = 0;
    state.time.elapsed = 0;
    resetDoors();
}

// ── Regression runner (deterministic autopilot scenarios) ───────────
if (typeof window !== 'undefined') {
    import('./regression.js').then((m) => {
        window.runMOODRegression = () => {
            const results = m.runRegression(state, { runSimulationTick, initGameStateForTest });
            console.log('MOOD regression results:', results);
            results.forEach((r) => console.log(`  ${r.scenario}: ${r.pass ? 'PASS' : 'FAIL'} — ${r.message}`));
            return results;
        };
    }).catch(() => {});
}

// ── Export state for other modules ──────────────────────────────────
export { state, ctx, canvas };
