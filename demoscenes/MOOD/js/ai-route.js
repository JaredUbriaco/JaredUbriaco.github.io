/**
 * ai-route.js — Level-agnostic scripted route framework
 *
 * The route is a list of goals in order: spawn → pickup → door → enter room → kill enemies →
 * button → door → next room → … (branching: two directions, two doors, etc.). Same structure
 * for any level; number of rooms/doors/branches varies.
 *
 * Rules:
 * - If we succeeded at an interaction (door opened, button pressed, pickup taken, room cleared),
 *   we are past it — never target it again. No backtracking unless the level explicitly requires it.
 * - A door or gate that can no longer be interacted with (already open) is never a valid goal.
 *   The engine skips such steps when choosing the current goal (see ai.js getEffectiveCurrentStepIndex).
 *
 * Branching: clear each branch, return to hub, then take the door that leads forward.
 *
 * This module is independent of any specific map. It needs a world API and level data.
 */

// ── Contract: world API (inject from map/level) ────────────────────────
// worldApi = {
//   getRoomId(x, y) -> string | null,
//   doors: { [tileKey]: { openProgress, cx, cy, ... } },
//   getRoomBounds(roomId) -> { x, y, w, h } | undefined,
//   getPickup(id) -> { x, y } | undefined,
//   getInteractable(id) -> { x, y } | undefined,
// }

// ── Contract: level data ───────────────────────────────────────────────
// levelData = {
//   roomOrder: string[],   // forward order for "past room" checks
//   steps: StepDescriptor[]
// }
// StepDescriptor = {
//   type: 'pickup' | 'door' | 'button' | 'enter_room' | 'waypoint' | 'custom',
//   label: string,
//   id?: string,           // for pickup/interactable lookup
//   position?: { x, y },   // explicit (e.g. door center)
//   doorKey?: string,      // for doors, key into worldApi.doors
//   pastRoomId?: string,   // room that means "we're past this step"
//   roomId?: string,       // for enter_room
//   weaponId?: string,     // for pickup done (e.g. 'HANDGUN')
//   flagName?: string,     // for button/custom (e.g. 'buttonPressed')
//   pastRoomIds?: string[], // for keydoor with multiple past rooms
//   doneWhen?: (state) => boolean  // custom; overrides built-in
// }

/**
 * True if current room is after roomId in the level's forward order.
 */
export function isPastRoom(state, roomId, roomOrder, getRoomId) {
    const cur = getRoomId(state.player.x, state.player.y);
    const i = roomOrder.indexOf(cur);
    const j = roomOrder.indexOf(roomId);
    return i !== -1 && j !== -1 && i > j;
}

/**
 * True if the given room has no live enemies.
 */
export function isRoomClear(state, roomId) {
    const entities = state.entities || [];
    return !entities.some((e) => e.roomId === roomId && e.hp > 0);
}

/**
 * Build a single step's doneWhen from descriptor and world API.
 */
function buildDoneWhen(step, levelData, worldApi) {
    const { roomOrder } = levelData;
    const { getRoomId, doors } = worldApi;
    const past = (s, roomId) => isPastRoom(s, roomId, roomOrder, getRoomId);
    const inRoom = (s, id) => getRoomId(s.player.x, s.player.y) === id;
    const roomClear = (s, id) => inRoom(s, id) && isRoomClear(s, id);

    if (step.doneWhen) return step.doneWhen;

    switch (step.type) {
        case 'pickup':
            return (s) =>
                (step.weaponId && s.player.weapons && s.player.weapons.includes(step.weaponId)) ||
                (step.pastRoomId && past(s, step.pastRoomId));
        case 'door':
            // Done if door open OR we're in the destination room OR we're past it (e.g. in a2r1 when destination was area1)
            return (s) =>
                (doors[step.doorKey] && doors[step.doorKey].openProgress >= 1) ||
                (step.pastRoomId && (inRoom(s, step.pastRoomId) || past(s, step.pastRoomId)));
        case 'keydoor':
            return (s) =>
                (doors[step.doorKey] && doors[step.doorKey].openProgress >= 1) ||
                (step.pastRoomIds && step.pastRoomIds.some((id) => inRoom(s, id) || past(s, id)));
        case 'button':
            return (s) =>
                !!(step.flagName && s.flags && s.flags[step.flagName]) ||
                (step.pastRoomId && past(s, step.pastRoomId));
        case 'enter_room':
            // Done forever once we've ever been in the room (or we're past it). No time limit — prevents oscillating back to "enter_a2r2" after leaving to open the next door.
            return (s) => {
                if (roomClear(s, step.roomId) || (step.roomId && past(s, step.roomId))) return true;
                const stamp = s.ai && s.ai._enteredRoomAt && step.roomId && s.ai._enteredRoomAt[step.roomId];
                return stamp != null;
            };
        case 'waypoint':
            return (s) => step.flagName && s.flags && s.flags[step.flagName];
        default:
            return () => false;
    }
}

/**
 * Resolve step position from descriptor and world API.
 * positionOffset: { dx?, dy? } added to room center when roomId is set.
 */
function resolvePosition(step, worldApi) {
    if (step.position && !step.roomId) return step.position;
    if (step.type === 'pickup' && step.id && worldApi.getPickup) {
        const p = worldApi.getPickup(step.id);
        if (p) return p;
    }
    if ((step.type === 'button' || step.type === 'waypoint') && step.id && worldApi.getInteractable) {
        const p = worldApi.getInteractable(step.id);
        if (p) return p;
    }
    if ((step.type === 'enter_room' || step.type === 'waypoint') && step.roomId && worldApi.getRoomBounds) {
        const b = worldApi.getRoomBounds(step.roomId);
        if (b) {
            const x = b.x + b.w / 2, y = b.y + b.h / 2;
            const o = step.positionOffset || {};
            return { x: x + (o.dx || 0), y: y + (o.dy || 0) };
        }
    }
    if (step.position) return step.position;
    return { x: 0, y: 0 };
}

/**
 * Build full route (array of steps with doneWhen and x,y) from level data and world API.
 */
export function buildRoute(levelData, worldApi) {
    const { roomOrder, steps } = levelData;
    if (!roomOrder || !steps) return [];

    return steps.map((desc) => {
        const pos = resolvePosition(desc, worldApi);
        const doneWhen = buildDoneWhen(desc, levelData, worldApi);
        const step = {
            type: desc.type,
            label: desc.label,
            x: pos.x,
            y: pos.y,
            action: desc.type === 'pickup' || desc.type === 'button' || desc.type === 'door' || desc.type === 'keydoor' ? 'interact' : undefined,
            doorKey: desc.doorKey,
            doneWhen,
        };
        return step;
    });
}

/**
 * Index of first step that is not yet done.
 */
export function getCurrentScriptedStepIndex(route, state) {
    for (let i = 0; i < route.length; i++) {
        if (!route[i].doneWhen(state)) return i;
    }
    return -1;
}

/**
 * Turn a scripted step into a goal object for steering/action.
 */
export function stepToGoal(step, worldApi) {
    const g = {
        type: step.doorKey ? 'door' : (step.label || 'waypoint'),
        x: step.x,
        y: step.y,
    };
    if (step.action) g.action = step.action;
    if (step.doorKey && worldApi.doors && worldApi.doors[step.doorKey]) {
        g.door = worldApi.doors[step.doorKey];
    }
    return g;
}

/**
 * Get the room ID to use for "explore fallback" (e.g. first room after start).
 * levelData can have exploreFallbackRoomId; if not, use second room in roomOrder.
 */
export function getExploreFallbackRoom(levelData, worldApi) {
    const id = levelData.exploreFallbackRoomId || (levelData.roomOrder && levelData.roomOrder[1]);
    if (!id || !worldApi.getRoomBounds) return null;
    return worldApi.getRoomBounds(id) || null;
}
