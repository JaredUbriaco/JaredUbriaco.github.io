/**
 * objectives.js — Shared objective/checklist tracking
 *
 * One source of truth for goal progress used by both HUD and AI.
 */

import { TILE } from './config.js';
import { ROOM_BOUNDS, getTile } from './map.js';

const COMBAT_ROOMS = ['area1', 'a2r1', 'a2r2', 'a2r3', 'a2r4', 'a2r5', 'area3'];

function getObjectiveValue(state, id) {
    return state.objectives.items.find(item => item.id === id) || null;
}

function isRoomCleared(state, roomId) {
    return !state.entities.some(e => e.roomId === roomId && e.hp > 0);
}

function getRoomClearProgress(state) {
    let cleared = 0;
    for (const roomId of COMBAT_ROOMS) {
        if (isRoomCleared(state, roomId)) cleared++;
    }
    return { cleared, total: COMBAT_ROOMS.length };
}

function getNearestLightWellDistance(state) {
    const area = ROOM_BOUNDS.area3;
    if (!area) return Infinity;

    let bestDist = Infinity;
    for (let row = area.y; row < area.y + area.h; row++) {
        for (let col = area.x; col < area.x + area.w; col++) {
            if (getTile(col, row) !== TILE.LIGHT_WELL) continue;
            const dx = col + 0.5 - state.player.x;
            const dy = row + 0.5 - state.player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist) bestDist = dist;
        }
    }
    return bestDist;
}

export function createObjectivesState() {
    return {
        items: [
            { id: 'pickup-handgun', label: 'Pick up Handgun', done: false },
            { id: 'use-button', label: 'Use Button', done: false },
            { id: 'clear-rooms', label: 'Clear combat rooms', done: false, progress: '0/0' },
            { id: 'use-doors-progress', label: 'Use doors to progress', done: false },
            { id: 'pickup-shotgun', label: 'Pick up Shotgun', done: false },
            { id: 'pickup-voidbeam', label: 'Pick up Void Beam', done: false },
            { id: 'voidbeam-light-zone', label: 'Use Void Beam from light zone', done: false },
        ],
        completedOnce: {},
    };
}

export function updateObjectives(state) {
    const handgun = getObjectiveValue(state, 'pickup-handgun');
    const button = getObjectiveValue(state, 'use-button');
    const clearRooms = getObjectiveValue(state, 'clear-rooms');
    const doorsProgress = getObjectiveValue(state, 'use-doors-progress');
    const shotgun = getObjectiveValue(state, 'pickup-shotgun');
    const voidbeam = getObjectiveValue(state, 'pickup-voidbeam');
    const lightZone = getObjectiveValue(state, 'voidbeam-light-zone');

    if (handgun) handgun.done = state.player.weapons.includes('HANDGUN');
    if (button) button.done = !!state.flags.buttonPressed;

    if (clearRooms) {
        const progress = getRoomClearProgress(state);
        clearRooms.progress = `${progress.cleared}/${progress.total}`;
        clearRooms.done = progress.cleared === progress.total;
    }

    if (doorsProgress) {
        // Reaching area3 implies using all progression-critical doors.
        doorsProgress.done = state.hud.currentRoomId === 'area3' || state.flags.bossActive;
    }

    if (shotgun) shotgun.done = state.player.weapons.includes('SHOTGUN');
    if (voidbeam) voidbeam.done = state.player.weapons.includes('VOIDBEAM');
    if (lightZone) lightZone.done = !!state.flags.voidBeamLightZoneUsed;

    for (const item of state.objectives.items) {
        if (item.done && !state.objectives.completedOnce[item.id]) {
            state.objectives.completedOnce[item.id] = true;
            state.hud.messages.push({ text: `OBJECTIVE COMPLETE: ${item.label.toUpperCase()}`, timer: 2 });
        }
    }
}

export function renderObjectivesHtml(state) {
    return state.objectives.items.map(item => {
        const check = item.done ? '[x]' : '[ ]';
        const suffix = item.progress ? ` (${item.progress})` : '';
        return `<div class="objective ${item.done ? 'done' : ''}">${check} ${item.label}${suffix}</div>`;
    }).join('');
}

export function getObjectiveHintsForAI(state) {
    const roomProgress = getRoomClearProgress(state);
    return {
        needsHandgun: !state.player.weapons.includes('HANDGUN'),
        needsButton: !state.flags.buttonPressed,
        needsRoomClears: roomProgress.cleared < roomProgress.total,
        needsDoorsProgress: !(state.hud.currentRoomId === 'area3' || state.flags.bossActive),
        needsShotgun: !state.player.weapons.includes('SHOTGUN'),
        needsVoidbeam: !state.player.weapons.includes('VOIDBEAM'),
        needsVoidBeamLightZone: !state.flags.voidBeamLightZoneUsed,
        nearestLightWellDist: getNearestLightWellDistance(state),
    };
}
