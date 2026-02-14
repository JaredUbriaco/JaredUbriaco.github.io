/**
 * regression.js — Deterministic autopilot regression scenarios
 *
 * Run from console: window.runMOODRegression()
 * Requires game to be loaded (main.js). Each scenario inits state, runs N ticks with AI active, then asserts.
 */

import { getRoomId, ROOM_BOUNDS, getTile, TILE, openAllDoors } from './map.js';

const TICKS_EARLY_DOOR = 900;   // 15s at 60fps
const TICKS_AREA1_BUTTON = 900;
const TICKS_CORRIDOR_PICKUPS = 900;
const TICKS_BOSS_LIGHT_WELL = 600;
const DT = 1 / 60;

function findFirstLightWellInArea3() {
    const a = ROOM_BOUNDS.area3;
    if (!a) return { x: 19.5, y: 66.5 };
    for (let row = a.y; row < a.y + a.h; row++) {
        for (let col = a.x; col < a.x + a.w; col++) {
            if (getTile(col, row) === TILE.LIGHT_WELL) {
                return { x: col + 0.5, y: row + 0.5 };
            }
        }
    }
    return { x: a.x + a.w / 2, y: a.y + a.h / 2 };
}

/**
 * @param {object} state - Game state (from main)
 * @param {{ runSimulationTick: (s, dt) => void, initGameStateForTest: (s) => void }} deps - From main
 * @returns {{ scenario: string, pass: boolean, message: string, ticks: number }[]}
 */
export function runRegression(state, deps) {
    const { runSimulationTick, initGameStateForTest } = deps;
    const results = [];

    // ── Scenario 1: Early door — AI opens first door and reaches area1 ──
    (function () {
        initGameStateForTest(state);
        state.player.x = 7.5;
        state.player.y = 5;
        state.player.angle = 0;
        let i = 0;
        for (; i < TICKS_EARLY_DOOR; i++) {
            runSimulationTick(state, DT);
            const room = getRoomId(state.player.x, state.player.y);
            if (room === 'area1' || state.player.x > 9) break;
        }
        const room = getRoomId(state.player.x, state.player.y);
        const pass = room === 'area1' || state.player.x > 9;
        results.push({
            scenario: 'early_door',
            pass,
            message: pass ? `Reached area1 or passed door in ${i} ticks` : `After ${TICKS_EARLY_DOOR} ticks still in room ${room}, x=${state.player.x.toFixed(2)}`,
            ticks: i,
        });
    })();

    // ── Scenario 2: Area1 button — AI clears area1 and presses button ──
    (function () {
        initGameStateForTest(state);
        state.player.x = 19;
        state.player.y = 8;
        state.player.weapons = ['FIST', 'HANDGUN'];
        state.player.currentWeapon = 'HANDGUN';
        state.objectives.items.find(i => i.id === 'pickup-handgun').done = true;
        state.entities.forEach(e => {
            if (e.roomId === 'area1') e.hp = 0;
        });
        let i = 0;
        for (; i < TICKS_AREA1_BUTTON; i++) {
            runSimulationTick(state, DT);
            if (state.flags.buttonPressed) break;
        }
        const pass = !!state.flags.buttonPressed;
        results.push({
            scenario: 'area1_button',
            pass,
            message: pass ? `Button pressed in ${i} ticks` : `After ${TICKS_AREA1_BUTTON} ticks button not pressed`,
            ticks: i,
        });
    })();

    // ── Scenario 3: Corridor pickups — AI collects shotgun (doors opened for path) ──
    (function () {
        initGameStateForTest(state);
        openAllDoors();
        state.flags.buttonPressed = true;
        state.player.weapons = ['FIST', 'HANDGUN'];
        state.player.currentWeapon = 'HANDGUN';
        state.objectives.items.forEach(item => {
            if (['pickup-handgun', 'use-button', 'clear-rooms', 'use-doors-progress'].includes(item.id)) item.done = true;
        });
        const a4 = ROOM_BOUNDS.a2r4;
        state.player.x = a4 ? a4.x + a4.w / 2 - 2 : 30.5;
        state.player.y = a4 ? a4.y + a4.h / 2 : 36.5;
        state.player.angle = 0;
        let i = 0;
        for (; i < TICKS_CORRIDOR_PICKUPS; i++) {
            runSimulationTick(state, DT);
            if (state.player.weapons.includes('SHOTGUN')) break;
        }
        const pass = state.player.weapons.includes('SHOTGUN');
        results.push({
            scenario: 'corridor_pickups',
            pass,
            message: pass ? `Shotgun collected in ${i} ticks` : `After ${TICKS_CORRIDOR_PICKUPS} ticks shotgun not collected`,
            ticks: i,
        });
    })();

    // ── Scenario 4: Boss light-well — AI uses Void Beam from light well on boss ──
    (function () {
        initGameStateForTest(state);
        openAllDoors();
        state.flags.bossActive = true;
        state.player.weapons = ['FIST', 'HANDGUN', 'SHOTGUN', 'VOIDBEAM'];
        state.player.currentWeapon = 'VOIDBEAM';
        const lw = findFirstLightWellInArea3();
        state.player.x = lw.x;
        state.player.y = lw.y;
        state.player.angle = 0;
        state.objectives.items.forEach(item => { item.done = true; });
        let i = 0;
        for (; i < TICKS_BOSS_LIGHT_WELL; i++) {
            runSimulationTick(state, DT);
            if (state.flags.voidBeamLightZoneUsed) break;
        }
        const pass = !!state.flags.voidBeamLightZoneUsed;
        results.push({
            scenario: 'boss_light_well',
            pass,
            message: pass ? `Void Beam from light zone used in ${i} ticks` : `After ${TICKS_BOSS_LIGHT_WELL} ticks voidBeamLightZoneUsed not set`,
            ticks: i,
        });
    })();

    return results;
}
