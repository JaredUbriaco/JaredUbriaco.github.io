# AI route levels

Scripted route **data** for the ai-route framework: a **list of goals** in order (spawn → handgun → first door → next room → kill enemies → button → door → …). Same logic for every level; number of rooms, doors, and branches varies.

**Universal rule:** A door or gate that can no longer be interacted with (already open) is never a valid goal. The engine skips such steps when choosing the current goal, so the AI never goes back to an open door or spins there.

## Engine behavior (BFS and steering)

The way the AI chooses goals, moves, and interacts is **the same for every level**. The engine (ai.js) follows the contract in **BFS-AND-STEERING.md** in this folder. In short:

- **Goal:** Enemy with LOS first; if current step is a door and enemy has no LOS, prefer opening the door; then first undone scripted step (open doors are never chosen).
- **Movement:** For **any** door or interact (button, pickup), the bot never moves toward the interact point itself (it may be solid). It moves only to the **approach tile** (adjacent walkable tile). So every door and every button works the same.
- **Aim:** When in range of a door or interact, the bot aims at it to press E; movement target stays the approach tile.
- **Stuck:** If the bot makes no progress or has no path for a short time, it backs up and replans (for any step).

Level files only supply **data** (steps, roomOrder, positions). They do not need step-specific steering or BFS logic.

## Adding a new level

1. **Create a level file** (e.g. `mood-level2.js`) that exports:
   - **levelData**: `{ roomOrder, exploreFallbackRoomId?, steps }`
   - **createWorldApi(map)**: function that returns the world API for this level (see below).

2. **roomOrder**: Array of room IDs in forward progression order (used for "past room" checks).
   - Example: `['area0', 'area1', 'a2r1', ...]`

3. **steps**: Array of step descriptors. Each step has:
   - **type**: `'pickup' | 'door' | 'keydoor' | 'button' | 'enter_room' | 'waypoint' | 'custom'`
   - **label**: string (for debug/telemetry)
   - **id?**: for lookup via worldApi.getPickup(id) or getInteractable(id)
   - **position?**: `{ x, y }` when not resolved from id/roomId
   - **doorKey?**: tile key for doors (e.g. `'8,5'`)
   - **pastRoomId?**: room ID that means "we're past this step"
   - **pastRoomIds?**: for keydoor (multiple destination rooms)
   - **roomId?**: for enter_room and waypoint (room center used for position)
   - **weaponId?**: for pickup (e.g. `'HANDGUN'`)
   - **flagName?**: for button/waypoint (e.g. `'buttonPressed'`)
   - **positionOffset?**: `{ dx?, dy? }` added to room center
   - **doneWhen?**: optional custom `(state) => boolean`; overrides built-in

4. **World API** (returned by createWorldApi(map)):
   - `getRoomId(x, y)` → string | null
   - `doors` → object (tileKey → passage with openProgress, cx, cy)
   - `getRoomBounds(roomId)` → `{ x, y, w, h }` | undefined
   - `getPickup(id)` → `{ x, y }` | undefined
   - `getInteractable(id)` → `{ x, y }` | undefined

5. **Wire the level in ai.js**: Import the new level and worldApi factory; use `buildRoute(levelData, worldApi)` and the same fallback/explore logic (e.g. from `getExploreFallbackRoom(levelData, worldApi)`).

## Framework (ai-route.js)

- **buildRoute(levelData, worldApi)** → array of steps with `{ label, x, y, action?, doorKey?, doneWhen }`
- **getCurrentScriptedStepIndex(route, state)** → index of first undone step, or -1
- **stepToGoal(step, worldApi)** → goal object for steering/action
- **isRoomClear(state, roomId)** → true if no live enemies in that room
- **getExploreFallbackRoom(levelData, worldApi)** → bounds of fallback room for "explore" when no scripted step

No map-specific imports in ai-route.js; it only uses the world API and level data.
