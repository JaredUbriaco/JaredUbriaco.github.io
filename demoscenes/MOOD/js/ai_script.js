/**
 * ai_script.js — Bridge between ai.js and ai-route + level data
 *
 * Builds the scripted route from MOOD Level 1 and exposes getCurrentGoal,
 * getScriptedRoute, getEffectiveCurrentStepIndex, isInteractGoal, getInteractApproachCenter.
 * Route is built lazily when state.map is available.
 */

import { moodLevel1, createMoodLevel1WorldApi } from './levels/mood-level1.js';
import {
    buildRoute,
    getCurrentScriptedStepIndex,
    stepToGoal,
} from './ai-route.js';
import { doors, gates } from './map.js';
import { distanceTo } from './utils.js';

export {
    buildRoute,
    getCurrentScriptedStepIndex
};

let _route = [];
let _worldApi = null;

function ensureRoute(state) {
    if (!state.map || _worldApi) return;
    _worldApi = createMoodLevel1WorldApi(state.map);
    _route = buildRoute(moodLevel1, _worldApi);
}

export function getScriptedRoute() {
    return _route;
}

export function getMainTrack() {
    return moodLevel1.mainTrack || [];
}

export function getEffectiveCurrentStepIndex(state) {
    ensureRoute(state);
    const route = _route;
    const skipReasons = [];

    // Find the first step that is NOT done AND is valid (e.g. door not already open)
    for (let i = 0; i < route.length; i++) {
        const step = route[i];

        // 1. Is step already satisfied?
        if (step.doneWhen(state)) {
            // skipReasons.push(`${i}:${step.label}(done)`);
            continue;
        }

        // 2. If it's a door step, is the door already open?
        if (step.doorKey) {
            let door = doors[step.doorKey];

            // Safety: Handle missing door / wrong key by finding nearest gate
            if (!door) {
                const sx = step.x != null ? step.x : (step.position && step.position.x);
                const sy = step.y != null ? step.y : (step.position && step.position.y);
                if (sx != null && sy != null && gates.length > 0) {
                    let bestGate = null;
                    let bestDist = Infinity;
                    for (const g of gates) {
                        const d = distanceTo(sx, sy, g.cx, g.cy);
                        if (d < bestDist && g.openProgress < 1) {
                            bestDist = d;
                            bestGate = g;
                        }
                    }
                    // Fallback to *any* gate if no closed one found? No, prefer closed.
                    if (!bestGate) {
                        // Find closest gate regardless of state
                        let minDist = Infinity;
                        for (const g of gates) {
                            const d = distanceTo(sx, sy, g.cx, g.cy);
                            if (d < minDist) {
                                minDist = d;
                                bestGate = g;
                            }
                        }
                    }

                    if (bestGate && bestGate.tiles && bestGate.tiles.length > 0) {
                        const t = bestGate.tiles[0];
                        // Patch the step key so we find it next time
                        step.doorKey = `${t.x},${t.y}`;
                        door = doors[step.doorKey];
                    }
                }
            }

            // If still no door, skip it (safety)
            if (!door) {
                console.warn('[AI] Skipping missing door step:', step.label);
                continue;
            }

            // If door is fully open, we don't need to "do" it.
            if (door.openProgress >= 1) {
                // skipReasons.push(`${i}:${step.label}(door open)`);
                continue;
            }
        }

        // Found our active step
        return i;
    }

    return -1;
}

export function isInteractGoal(goal) {
    return goal && (goal.action === 'interact' || goal.door);
}

export function getInteractApproachCenter(goal) {
    if (!goal) return { x: 0, y: 0 };
    if (goal.door) return { x: goal.door.cx, y: goal.door.cy };
    return { x: goal.x, y: goal.y };
}

export function getCurrentGoal(state) {
    ensureRoute(state);
    const idx = getEffectiveCurrentStepIndex(state); // Use robust logic logic
    if (idx < 0) return null;
    const step = _route[idx];
    return stepToGoal(step, _worldApi);
}
