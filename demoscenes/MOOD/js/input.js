/**
 * input.js — Keyboard, Mouse, Pointer Lock & Idle Timer
 * 
 * Handles all player input, pointer lock management, pause state,
 * and the idle timer that triggers AI takeover.
 */

import { AI_IDLE_THRESHOLD, MOUSE_SENSITIVITY } from './config.js';

// ── Keyboard State ──────────────────────────────────────────────────
const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    resetIdleTimer();
    // Prevent default for game keys to avoid browser shortcuts
    // NEVER preventDefault on Escape — browser needs it to exit pointer lock
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Backquote'].includes(e.code)) {
        e.preventDefault();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

/**
 * Check if a key is currently held down.
 * @param {string} code - KeyboardEvent.code (e.g., 'KeyW', 'Digit1')
 */
export function isKeyDown(code) {
    return !!keys[code];
}

// ── One-Shot Keys (consumed on read) ────────────────────────────────
let interactPressed = false;
let weaponSlotPressed = 0; // 0 = none, 1/2/3 = slot

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') interactPressed = true;
    if (e.code === 'Digit1') weaponSlotPressed = 1;
    if (e.code === 'Digit2') weaponSlotPressed = 2;
    if (e.code === 'Digit3') weaponSlotPressed = 3;
    if (e.code === 'Digit4') weaponSlotPressed = 4;
});

/** Returns true once per E press, then resets. */
export function consumeInteract() {
    if (interactPressed) {
        interactPressed = false;
        return true;
    }
    return false;
}

/** Returns weapon slot (1/2/3) if pressed, or 0. Consumed on read. */
export function consumeWeaponSlot() {
    const slot = weaponSlotPressed;
    weaponSlotPressed = 0;
    return slot;
}

// ── Mouse State ─────────────────────────────────────────────────────
let mouseDX = 0;
let mouseDY = 0;
let mouseDown = false;
let mouseClicked = false; // one-shot click detection

document.addEventListener('mousemove', (e) => {
    if (pointerLocked) {
        mouseDX += e.movementX || 0;
        mouseDY += e.movementY || 0;
        // Only reset idle if meaningful movement (> 2px to avoid micro-jitter)
        if (Math.abs(e.movementX) > 2 || Math.abs(e.movementY) > 2) {
            resetIdleTimer();
        }
    }
});

document.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
        mouseDown = true;
        mouseClicked = true;
        resetIdleTimer();
    }
});

document.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        mouseDown = false;
    }
});

/**
 * Get accumulated mouse movement since last call, then reset.
 * @returns {{ dx: number, dy: number }}
 */
export function getMouseDelta() {
    const dx = mouseDX;
    const dy = mouseDY;
    mouseDX = 0;
    mouseDY = 0;
    return { dx, dy };
}

/** Is left mouse button currently held? */
export function isMouseDown() {
    return mouseDown;
}

/** Returns true once per click, then resets. */
export function consumeMouseClick() {
    if (mouseClicked) {
        mouseClicked = false;
        return true;
    }
    return false;
}

// ── Pointer Lock ────────────────────────────────────────────────────
let pointerLocked = false;
let shouldPauseFlag = false;

/**
 * Request pointer lock on the game canvas.
 * @param {HTMLCanvasElement} canvas
 */
export function requestLock(canvas) {
    if (canvas && canvas.requestPointerLock) {
        canvas.requestPointerLock();
    }
}

document.addEventListener('pointerlockchange', () => {
    pointerLocked = !!document.pointerLockElement;
    if (!pointerLocked) {
        // Pointer lock was lost — could be Escape or browser action
        shouldPauseFlag = true;
    }
});

document.addEventListener('pointerlockerror', () => {
    console.warn('Pointer lock request failed');
});

/** Is pointer lock currently active? */
export function isPointerLocked() {
    return pointerLocked;
}

// ── Pause System ────────────────────────────────────────────────────
/** Check if the game should pause (pointer lock lost). Consumed on read. */
export function shouldPause() {
    if (shouldPauseFlag) {
        shouldPauseFlag = false;
        return true;
    }
    return false;
}

/** Re-request pointer lock and clear pause intent. */
export function resumeGame(canvas) {
    shouldPauseFlag = false;
    requestLock(canvas);
}

// ── Idle Timer ──────────────────────────────────────────────────────
let idleTimer = 0;

function resetIdleTimer() {
    idleTimer = 0;
}

/**
 * Update input state. Called once per frame.
 * @param {number} dt - Delta time in seconds
 */
export function update(dt) {
    idleTimer += dt;
}

/** Seconds since last player input. */
export function getIdleTime() {
    return idleTimer;
}

/** Is the AI auto-pilot threshold reached? */
export function isAIActive() {
    return idleTimer > AI_IDLE_THRESHOLD;
}

/** Force-reset idle timer (e.g., when AI is turned off). */
export function resetIdle() {
    idleTimer = 0;
}

// ── Debug Toggle ────────────────────────────────────────────────────
let debugVisible = false;

window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') {
        debugVisible = !debugVisible;
    }
});

/** Is the debug overlay toggled on? */
export function isDebugVisible() {
    return debugVisible;
}
