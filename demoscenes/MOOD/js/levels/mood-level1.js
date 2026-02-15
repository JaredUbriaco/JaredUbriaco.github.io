/**
 * MOOD Level 1 — Scripted route data for ai-route framework
 *
 * Declarative step list. Positions resolved via worldApi (getPickup, getRoomBounds, etc.)
 * or explicit position for doors. Same logic (succeeded OR past) applies to all steps.
 */

export const moodLevel1 = {
    roomOrder: ['area0', 'area1', 'a2r1', 'a2r2', 'a2r3', 'a2r4', 'a2r5', 'bossCorridor', 'area3'],
    exploreFallbackRoomId: 'area1',

    steps: [
        { type: 'pickup', label: 'handgun', id: 'handgun', weaponId: 'HANDGUN', pastRoomId: 'area0' },
        { type: 'door', label: 'door_area0_hall', doorKey: '8,5', pastRoomId: 'area1', position: { x: 8.5, y: 5.5 } },
        { type: 'enter_room', label: 'enter_area1', roomId: 'area1' },
        { type: 'button', label: 'button', id: 'area1Button', flagName: 'buttonPressed', pastRoomId: 'area1' },
        { type: 'door', label: 'gate_area2', doorKey: '19,15', pastRoomId: 'a2r1', position: { x: 19.5, y: 15.5 } },
        { type: 'enter_room', label: 'enter_a2r1', roomId: 'a2r1', positionOffset: { dy: -3 } }, // waypoint just inside north (entry) so we don't get stuck in corridor/alcoves
        { type: 'door', label: 'door_a2r2', doorKey: '14,26', pastRoomId: 'a2r2', position: { x: 14.5, y: 26.5 } },
        { type: 'enter_room', label: 'enter_a2r2', roomId: 'a2r2' },
        { type: 'door', label: 'door_a2r1_a2r3', doorKey: '19,30', pastRoomId: 'a2r3', position: { x: 19.5, y: 30.5 } },
        { type: 'enter_room', label: 'enter_a2r3', roomId: 'a2r3' },
        { type: 'door', label: 'door_a2r4', doorKey: '31,36', pastRoomId: 'a2r4', position: { x: 31.5, y: 36.5 } },
        { type: 'pickup', label: 'shotgun', id: 'shotgun', weaponId: 'SHOTGUN', pastRoomId: 'a2r4' },
        { type: 'door', label: 'door_a2r5', doorKey: '19,42', pastRoomId: 'a2r5', position: { x: 19.5, y: 42.5 } },
        { type: 'enter_room', label: 'enter_a2r5', roomId: 'a2r5' },
        { type: 'keydoor', label: 'keydoor_boss', doorKey: '19,54', pastRoomIds: ['bossCorridor', 'area3'], position: { x: 19.5, y: 54.5 } },
        { type: 'pickup', label: 'voidbeam', id: 'voidbeam', weaponId: 'VOIDBEAM', pastRoomId: 'a2r5' },
        { type: 'enter_room', label: 'enter_area3', roomId: 'area3' },
        { type: 'waypoint', label: 'light_well_boss', roomId: 'area3', positionOffset: { dy: 4 }, flagName: 'voidBeamLightZoneUsed' },
    ],
};

/**
 * World API for MOOD level 1: bridges map.js to ai-route framework.
 */
export function createMoodLevel1WorldApi(map) {
    const { getRoomId, doors, ROOM_BOUNDS: bounds, PICKUP_POSITIONS: pickups, INTERACTABLE_POSITIONS: interactables } = map;
    return {
        getRoomId,
        doors,
        getRoomBounds: (roomId) => bounds[roomId],
        getPickup: (id) => pickups[id],
        getInteractable: (id) => interactables[id],
    };
}
