/**
 * MOOD Level 1 — Scripted route data for ai-route framework
 *
 * Declarative step list. Positions resolved via worldApi (getPickup, getRoomBounds, etc.)
 * or explicit position for doors. Same logic (succeeded OR past) applies to all steps.
 *
 * Doors: doorKey must match map.js — one of the gate/door tile keys "x,y" (see registerGate/registerDoor).
 * Position should be the door/gate center so pathing and fallback resolution work.
 */

export const moodLevel1 = {
    roomOrder: ['area0', 'area1', 'a2r1', 'a2r2', 'a2r3', 'a2r4', 'a2r5', 'bossCorridor', 'area3'],
    exploreFallbackRoomId: 'area1',

    /**
     * The "Amusement Ride" main track.
     * A chronological, high-level path through the level. The bot snaps to this rail
     * to navigate between rooms/areas, ensuring it stays centered and moves smoothly.
     * Backtracking is explicit: the track goes A -> B -> A -> C.
     */
    mainTrack: [
        // Area 0 -> Hall -> Area 1
        { x: 5, y: 5 }, { x: 8, y: 5 }, { x: 12, y: 5 }, { x: 15, y: 5 }, { x: 19, y: 5 }, { x: 19, y: 8 }, 
        // Area 1 -> Gate -> A2R1 (Hall of Echoes)
        { x: 19, y: 12 }, { x: 19, y: 15 }, { x: 19, y: 18 }, { x: 19, y: 22 }, { x: 19, y: 24 },
        // A2R1 -> A2R2 (The Drift) [Branch 1]
        { x: 15, y: 24 }, { x: 12, y: 24 }, { x: 9, y: 24 }, { x: 6, y: 24 }, { x: 6, y: 27 }, { x: 6, y: 30 },
        // A2R2 -> A2R1 (Backtracking)
        { x: 6, y: 27 }, { x: 6, y: 24 }, { x: 9, y: 24 }, { x: 12, y: 24 }, { x: 15, y: 24 }, { x: 19, y: 24 },
        // A2R1 -> A2R3 (Nexus)
        { x: 19, y: 28 }, { x: 19, y: 32 }, { x: 19, y: 35 }, { x: 19, y: 38 },
        // A2R3 -> A2R4 (Prism Chamber) [Branch 2]
        { x: 23, y: 38 }, { x: 27, y: 38 }, { x: 30, y: 38 }, { x: 34, y: 38 }, { x: 34, y: 41 },
        // A2R4 -> A2R3 (Backtracking)
        { x: 34, y: 38 }, { x: 30, y: 38 }, { x: 27, y: 38 }, { x: 23, y: 38 }, { x: 19, y: 38 },
        // A2R3 -> A2R5 (The Passage) -> Keydoor
        { x: 19, y: 42 }, { x: 19, y: 46 }, { x: 19, y: 49 }, { x: 19, y: 53 }, { x: 19, y: 56 },
        // Keydoor -> Boss Corridor -> Area 3 (Boss)
        { x: 19, y: 59 }, { x: 19, y: 62 }, { x: 19, y: 65 }, { x: 19, y: 70 }, { x: 19, y: 73 }
    ],

    /** Combat track per room: ordered waypoints (tile coords). Must be walkable tiles; engine filters by isWalkable and falls back to path-to-enemy if none reachable. Bot paths to track point nearest enemy, not to enemy position. */
    roomTracks: {
        area1: [
            { x: 14, y: 5 }, { x: 14, y: 9 }, { x: 19, y: 9 }, { x: 19, y: 5 },
        ],
        a2r1: [
            { x: 17, y: 22 }, { x: 17, y: 25 }, { x: 20, y: 25 }, { x: 20, y: 22 },
        ],
        a2r2: [
            { x: 5, y: 24 }, { x: 5, y: 28 }, { x: 7, y: 30 }, { x: 4, y: 30 },
        ],
        a2r3: [
            { x: 16, y: 35 }, { x: 19, y: 35 }, { x: 19, y: 40 }, { x: 16, y: 40 },
        ],
        a2r4: [
            { x: 28, y: 39 }, { x: 31, y: 39 }, { x: 31, y: 42 }, { x: 28, y: 42 },
        ],
        a2r5: [
            { x: 20, y: 46 }, { x: 22, y: 46 }, { x: 22, y: 49 }, { x: 20, y: 49 },
        ],
        area3: [
            { x: 19, y: 58 }, { x: 19, y: 62 },
        ],
    },

    steps: [
        { type: 'pickup', label: 'handgun', id: 'handgun', weaponId: 'HANDGUN', pastRoomId: 'area0' },
        { type: 'door', label: 'door_area0_hall', doorKey: '8,5', pastRoomId: 'area1', position: { x: 8.5, y: 5.5 } },
        { type: 'enter_room', label: 'enter_area1', roomId: 'area1', positionOffset: { dx: -6 } }, // entry from west (hallway)
        { type: 'button', label: 'button', id: 'area1Button', flagName: 'buttonPressed', pastRoomId: 'area1' },
        { type: 'door', label: 'gate_area2', doorKey: '19,15', pastRoomId: 'a2r1', position: { x: 19.5, y: 15.5 } },
        { type: 'enter_room', label: 'enter_a2r1', roomId: 'a2r1', positionOffset: { dy: -3 } }, // waypoint just inside north (entry) so we don't get stuck in corridor/alcoves
        { type: 'door', label: 'door_a2r2', doorKey: '14,24', pastRoomId: 'a2r2', position: { x: 14.5, y: 24 } },
        { type: 'enter_room', label: 'enter_a2r2', roomId: 'a2r2', positionOffset: { dx: 2 } }, // entry from east (a2r1)
        { type: 'door', label: 'door_a2r1_a2r3', doorKey: '18,28', pastRoomId: 'a2r3', position: { x: 19, y: 28.5 } },
        { type: 'enter_room', label: 'enter_a2r3', roomId: 'a2r3', positionOffset: { dy: -5 } }, // entry from north (a2r1)
        { type: 'door', label: 'door_a2r4', doorKey: '25,38', pastRoomId: 'a2r4', position: { x: 25.5, y: 38 } },
        { type: 'pickup', label: 'shotgun', id: 'shotgun', weaponId: 'SHOTGUN', pastRoomId: 'a2r4' },
        { type: 'door', label: 'door_a2r5', doorKey: '19,44', pastRoomId: 'a2r5', position: { x: 19.5, y: 44 } },
        { type: 'enter_room', label: 'enter_a2r5', roomId: 'a2r5', positionOffset: { dy: -3 } }, // entry from north
        { type: 'keydoor', label: 'keydoor_boss', doorKey: '19,42', pastRoomIds: ['bossCorridor', 'area3'], position: { x: 19.5, y: 42.5 } },
        { type: 'pickup', label: 'voidbeam', id: 'voidbeam', weaponId: 'VOIDBEAM', pastRoomId: 'a2r5' },
        { type: 'enter_room', label: 'enter_area3', roomId: 'area3', positionOffset: { dy: -2 } }, // entry from north (boss corridor)
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
        /** Combat track for room: ordered waypoints (tile coords). When clearing room, bot paths along this track instead of to enemy position. */
        getRoomTrack: (roomId) => (moodLevel1.roomTracks && moodLevel1.roomTracks[roomId]) || null,
    };
}
