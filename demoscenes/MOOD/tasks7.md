# Tasks 7 — AI Auto-Pilot System (Milestone E)

**Goal:** Build the autonomous AI that takes over after 5 seconds of player inactivity and can complete the entire game — every room, every enemy, every door, every weapon, the boss — without human input.

**Milestone target:** Milestone E

**Depends on:** Tasks 1-6 (Milestone D — complete game playable by hand)

---

## ⚠ Implementation Warning

The AI system is the RISKIEST task set. It depends on every other system working correctly. Before starting tasks7:

1. **Verify full manual playthrough works** — every door, every weapon, every enemy, the boss, victory.
2. **Test each trigger** independently (button, key door, secret wall, Light Well).
3. **Ensure pathfinding has clear corridors** — if the map has geometry that blocks waypoint-to-waypoint movement, the AI will get stuck.

**Build order within tasks7:**
1. Waypoints + BFS (testable: log paths between rooms)
2. Idle timer + activation (testable: "AUTO" appears after 5s)
3. Basic navigation (testable: AI walks to a room center without combat)
4. Combat (testable: AI shoots nearby enemies)
5. Full target selection (testable: AI clears Area 1)
6. Boss strategy (testable: AI beats the game)

**Each step should be verified before the next.** Don't try to build the entire AI at once.

---

## Task 7.1: Waypoint Graph Definition

**File:** Edits to `js/map.js`

### Sub-task 7.1a: Waypoint Data Structure

- [ ] **Waypoint node:**
  ```js
  { id: 'area0_center', x: ..., y: ..., roomId: 'area0', connections: ['area0_door01'] }
  ```
- [ ] **Waypoint types:**
  - Room centers: one per room
  - Doorway waypoints: one per door (on the walkable side just inside each room)
  - Special waypoints: button position, key drop position, Light Well center, pickup positions

### Sub-task 7.1b: Place Waypoints

- [ ] **Area 0:** center + door waypoint
- [ ] **Area 1:** center + button waypoint + door-in waypoint + door-out waypoint
- [ ] **Area 2 (per room):** center + doorway waypoints for each connection
  - a2r1: center + 2-3 door waypoints
  - a2r2: center + door waypoint
  - a2r3: center + 3-4 door waypoints (hub)
  - a2r4: center + door waypoint + shotgun pickup waypoint
  - a2r5: center + door waypoint + key door waypoint
- [ ] **Boss corridor:** center + Void Beam pickup waypoint
- [ ] **Area 3:** center + Light Well waypoint

### Sub-task 7.1c: Waypoint Graph

- [ ] Store as `export const waypoints = [...]` and `export const waypointGraph = {...}`
- [ ] Each waypoint has `connections` array (bidirectional — if A connects to B, B connects to A)
- [ ] **Validation:** Every room has at least one waypoint. Every door has waypoints on both sides.
- [ ] Estimate: ~25-30 waypoints total

**Acceptance:** Waypoint graph is defined and connected. BFS can find a path from any room to any other room.

---

## Task 7.2: Create `js/ai.js` — BFS Pathfinding

**File:** `demoscenes/MOOD/js/ai.js`

### Sub-task 7.2a: BFS on Waypoint Graph

- [ ] **Function:** `findPath(startWaypointId, targetWaypointId, waypointGraph)` → array of waypoint IDs
- [ ] Standard BFS:
  ```js
  function findPath(startId, targetId, graph) {
    const queue = [[startId]];
    const visited = new Set([startId]);
    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];
      if (current === targetId) return path;
      for (const neighbor of graph[current].connections) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }
    return null; // no path
  }
  ```
- [ ] **Find nearest waypoint to a position:**
  ```js
  function nearestWaypoint(x, y, waypoints) {
    let closest = null, minDist = Infinity;
    for (const wp of waypoints) {
      const dist = Math.sqrt((wp.x - x)**2 + (wp.y - y)**2);
      if (dist < minDist) { minDist = dist; closest = wp; }
    }
    return closest;
  }
  ```

### Sub-task 7.2b: Path Following

- [ ] AI stores `currentPath = [waypointId, ...]` and `pathIndex = 0`
- [ ] Each frame when following path:
  - Get current target waypoint position
  - Move toward it (atan2 direction)
  - When within 0.5 tiles: advance `pathIndex++`
  - When path complete: clear path, switch to within-room behavior

**Acceptance:** AI can navigate from Area 0 to any other room via waypoints, walking through hallways and around corners.

---

## Task 7.3: Idle Timer & AI Activation

**File:** Edits to `js/input.js` and `js/ai.js`

### Sub-task 7.3a: Idle Detection

- [ ] Already scaffolded in input.js: `idleTimer` increments by dt, resets on input
- [ ] `isAIActive()` returns `idleTimer > AI_IDLE_THRESHOLD` (5 seconds)
- [ ] **Any input resets:** keypress, mouse movement (threshold > 2px to avoid micro-jitter), mouse click

### Sub-task 7.3b: AI Control Mode

- [ ] When AI activates:
  - `state.ai.active = true`
  - HUD shows pulsing "AUTO" indicator
  - AI begins generating synthetic inputs each frame
- [ ] When player provides input:
  - `state.ai.active = false`
  - AI stops controlling, player resumes immediately
  - AI state (path, target) preserved for when AI reactivates
- [ ] **Transition is seamless** — no pause, no fade, just control handoff

### Sub-task 7.3c: AI Synthetic Inputs

- [ ] AI doesn't move the player directly — it generates synthetic input:
  ```js
  // In ai.update(state):
  if (!state.ai.active) return;
  
  const aiInput = {
    moveForward: false,
    moveBack: false,
    strafeLeft: false,
    strafeRight: false,
    lookDX: 0,   // synthetic mouse X delta
    lookDY: 0,   // synthetic mouse Y delta
    fire: false,
    interact: false,
    weaponSlot: null, // 1, 2, or 3
  };
  // ... fill in based on AI logic ...
  // Player.update reads from AI input when ai.active
  ```
- [ ] `player.js` checks `state.ai.active` — if true, read from `state.ai.input` instead of real input

**Acceptance:** Leave the game idle for 5 seconds → "AUTO" appears → AI starts moving. Touch any key → immediate return to player control.

---

## Task 7.4: Target Selection Priority

**File:** `js/ai.js`

The AI must decide what to do each frame. Priority order:

### Sub-task 7.4a: Decision Logic

- [ ] **Priority 1 — Weapon pickup:** If uncollected weapon pickup is nearby (same room or adjacent), navigate to it
- [ ] **Priority 2 — Enemies in current room:** Target nearest alive enemy. Shoot to aggro, then fight.
- [ ] **Priority 3 — Progression gate:** If all enemies in current area/room are dead:
  - Area 1: navigate to button → interact → navigate to gate door → interact
  - Area 2: move to next un-cleared room
  - After Prism dead: navigate to key → navigate to key door → interact
- [ ] **Priority 4 — Room progression in Area 2:** Clear rooms in order: r1 → r2 → r3 → r4 → r5
  - After clearing a room, path to next room via waypoints
- [ ] **Priority 5 — Boss prep:** After Area 2 cleared, navigate through key door, pick up Void Beam
- [ ] **Priority 6 — Boss fight:** Navigate to Light Well, equip Void Beam, fire at boss

### Sub-task 7.4b: Implementation

```js
function selectTarget(state) {
  const { player, entities, pickups, flags } = state;
  const currentRoom = getCurrentRoom(player);
  
  // Weapon pickup nearby?
  const nearPickup = findNearbyPickup(pickups, player, currentRoom);
  if (nearPickup) return { type: 'pickup', target: nearPickup };
  
  // Enemies alive in current room?
  const roomEnemies = entities.filter(e => e.roomId === currentRoom && e.hp > 0);
  if (roomEnemies.length > 0) {
    const nearest = findNearest(roomEnemies, player);
    return { type: 'enemy', target: nearest };
  }
  
  // Progression gate?
  if (currentRoom === 'area1' && flags.area1Cleared && !flags.buttonPressed) {
    return { type: 'button', target: getButtonPosition() };
  }
  // ... etc for each gate
  
  // Next room to clear
  const nextRoom = getNextUncleared(state);
  if (nextRoom) return { type: 'room', target: nextRoom };
  
  // Boss
  if (flags.bossActive) return { type: 'boss' };
}
```

**Acceptance:** AI makes correct decisions: picks up weapons, fights enemies room by room, handles gates, and eventually reaches the boss.

---

## Task 7.5: AI Combat Behavior

**File:** `js/ai.js`

### Sub-task 7.5a: Aiming

- [ ] **Turn toward target:** Calculate angle to target with `atan2`, generate synthetic mouse delta to turn toward it
  ```js
  const targetAngle = Math.atan2(target.y - player.y, target.x - player.x);
  const angleDiff = normalizeAngle(targetAngle - player.angle);
  aiInput.lookDX = angleDiff * aimSpeed; // smooth turn
  ```
- [ ] **Aim smoothing:** Don't snap instantly — turn at a rate that looks natural (~3-4 rad/sec)
- [ ] **Pitch reset:** AI resets pitch to 0 (level look) when targeting enemies

### Sub-task 7.5b: Firing

- [ ] **Fire when aimed:** If angle to target < 0.1 rad (within crosshair), fire
- [ ] **First shot triggers aggro** — this is how AI initiates combat
- [ ] **Continuous fire:** Keep firing while aimed at target
- [ ] AI respects weapon fire rate (no faster than weapon allows)

### Sub-task 7.5c: Weapon Selection

- [ ] **Automatic weapon choice:**
  - Fist: only if no other weapons
  - Handgun: default ranged weapon
  - Shotgun: prefer if enemy < 5 tiles (devastating up close)
  - Void Beam: always use in boss room
- [ ] AI issues weapon switch commands (`aiInput.weaponSlot = 2` etc.)

### Sub-task 7.5d: Combat Movement

- [ ] While fighting: AI strafes slightly (left/right) to avoid standing still
- [ ] Back up if enemies are very close (< 2 tiles with ranged weapon)
- [ ] Move forward if enemies are far (> 8 tiles)

**Acceptance:** AI shoots enemies accurately. Picks appropriate weapons. Strafes during combat. Clears rooms efficiently.

---

## Task 7.6: AI Interaction & Navigation

**File:** `js/ai.js`

### Sub-task 7.6a: Door Interaction

- [ ] When path requires passing through a closed door:
  - Navigate to door position
  - Face the door (turn toward it)
  - When within range and facing: `aiInput.interact = true`
  - Wait for door to open, then continue path

### Sub-task 7.6b: Button Interaction

- [ ] When target is button:
  - Navigate to button waypoint
  - Face the button tile
  - Interact (E)
  - After button pressed, navigate to newly unlocked door

### Sub-task 7.6c: Key Pickup

- [ ] After Prism dies: key entity is on the floor
  - Navigate to key position (within 1 tile → auto-collect)
  - Then navigate to key door → interact

### Sub-task 7.6d: Obstacle Avoidance

- [ ] **Forward blocked:** If AI can't move forward (wall collision):
  - Strafe left or right for 10-20 frames
  - Then retry forward movement
- [ ] **Stuck detection:** If AI hasn't moved > 0.5 tiles in 3 seconds:
  - Pick random strafe direction for 1 second
  - Then recalculate path
- [ ] **Doorway navigation:** Doorways are narrow (2-3 tiles wide). AI must align before entering.

**Acceptance:** AI opens doors, presses buttons, picks up keys, navigates through hallways without getting stuck.

---

## Task 7.7: AI Boss Strategy

**File:** `js/ai.js`

- [ ] **On entering boss room:**
  1. Equip Void Beam (if not already)
  2. Navigate to Light Well (room center waypoint)
  3. When on Light Well: face boss, fire continuously
  4. If knocked off Light Well (unlikely — player can't be pushed): re-navigate
- [ ] **Ignore boss projectiles** (they're visual-only, no HP loss)
- [ ] **Continue firing until boss dies**

**Acceptance:** AI walks to Light Well, aims at orbiting boss, fires Void Beam until boss dies. Victory triggers.

---

## Task 7.8: Full AI Playthrough Testing

- [ ] **Automated test:** Start game, wait 5 seconds for AI to activate, observe full playthrough
- [ ] **Checklist:**
  - [ ] AI picks up Handgun in Area 0
  - [ ] AI opens door to Area 1
  - [ ] AI fights and kills all 4 Glimmers in Area 1
  - [ ] AI presses button after Area 1 clear
  - [ ] AI opens gate door to Area 2
  - [ ] AI clears each Area 2 room in order
  - [ ] AI picks up Shotgun in Room 4
  - [ ] AI kills Prism, collects Astral Key
  - [ ] AI opens key door to Area 3
  - [ ] AI picks up Void Beam in boss corridor
  - [ ] AI enters boss room, goes to Light Well
  - [ ] AI kills boss with Void Beam
  - [ ] Victory sequence plays
- [ ] **Edge cases:**
  - [ ] Player interrupts mid-AI → AI stops → player plays → player idles → AI resumes from where it left off
  - [ ] AI doesn't get stuck in doorways
  - [ ] AI doesn't get stuck on corners
  - [ ] AI handles enemies that follow it between rooms (if possible)
  - [ ] AI recovers from stuck state (stuck detection works)

**Acceptance:** AI can complete the entire game from start to finish, unattended, within ~5-10 minutes of gameplay.

---

## Testing Checklist for Tasks 7

- [ ] 5-second idle timer works correctly
- [ ] "AUTO" indicator pulses when AI active
- [ ] Any input immediately returns control to player
- [ ] AI navigates between rooms via waypoints
- [ ] AI doesn't walk into walls
- [ ] AI opens doors (E interaction)
- [ ] AI presses button when enemies are cleared
- [ ] AI picks up all weapons on the critical path
- [ ] AI selects appropriate weapon per situation
- [ ] AI aims and fires accurately
- [ ] AI aggros enemies by shooting first
- [ ] AI clears rooms systematically
- [ ] AI picks up key after Prism death
- [ ] AI opens key door
- [ ] AI uses Void Beam on boss from Light Well
- [ ] AI completes full game autonomously
- [ ] Player-AI handoff is seamless in both directions

---

## Summary — What Exists After Tasks 7 (Milestone E)

```
demoscenes/MOOD/js/
├── config.js       ✅
├── input.js        ✅ (idle timer, AI activation hooks)
├── main.js         ✅ (AI update in game loop)
├── map.js          ✅ (+ waypoint graph)
├── raycaster.js    ✅
├── renderer.js     ✅
├── player.js       ✅ (reads AI synthetic input when active)
├── hud.js          ✅ (+ AI indicator)
├── triggers.js     ✅
├── pickups.js      ✅
├── entities.js     ✅
├── sprites.js      ✅
├── combat.js       ✅
├── projectiles.js  ✅
├── effects.js      ✅
└── ai.js           ✅ BFS pathfinding, target selection, combat AI, boss strategy
```

**Milestone E achieved:** The AI can play and complete the entire game autonomously. Player can take over or relinquish control at any time.

**What's next:** Tasks 8 — audio, visual effects, HUD polish, and final tuning for a complete, polished game.
