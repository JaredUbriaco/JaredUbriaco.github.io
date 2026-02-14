# Tasks 3 — Player, HUD, Doors & Pickups (Milestone A)

**Goal:** Walk through Area 0 and Area 1 with full player controls, open doors, pick up the handgun, see the minimap and HUD. This is the first **playable milestone**.

**Milestone target:** Milestone A

**Depends on:** Tasks 1 (foundation), Tasks 2 (raycaster, map, renderer)

---

## Task 3.1: Create `js/player.js` — Movement & Collision

**File:** `demoscenes/MOOD/js/player.js`

### Sub-task 3.1a: Basic Movement

- [ ] **Function:** `update(state)`
- [ ] **Read input:** Import from `input.js` — `isKeyDown()`, `getMouseDelta()`
- [ ] **Mouse look (yaw):** `state.player.angle += mouseDX * MOUSE_SENSITIVITY`
- [ ] **Mouse look (pitch):** `state.player.pitch += mouseDY * MOUSE_SENSITIVITY`
  - Clamp: `pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch))`
- [ ] **WASD movement:**
  ```js
  let moveX = 0, moveY = 0;
  if (isKeyDown('KeyW')) { moveX += cos(angle); moveY += sin(angle); }
  if (isKeyDown('KeyS')) { moveX -= cos(angle); moveY -= sin(angle); }
  if (isKeyDown('KeyA')) { moveX += cos(angle - PI/2); moveY += sin(angle - PI/2); }
  if (isKeyDown('KeyD')) { moveX += cos(angle + PI/2); moveY += sin(angle + PI/2); }
  // Normalize if diagonal
  const len = Math.sqrt(moveX*moveX + moveY*moveY);
  if (len > 0) { moveX /= len; moveY /= len; }
  ```
- [ ] **Apply speed:** `newX = x + moveX * PLAYER_SPEED * dt`, same for Y

### Sub-task 3.1b: Wall Collision & Sliding

- [ ] **Circle-vs-grid collision:**
  - Player is a circle with `PLAYER_RADIUS` (0.2 tiles)
  - Before moving, check grid cells near the new position
  - **Sliding:** Try X movement first, then Y independently
    ```js
    // Try X movement only
    if (!collidesWithGrid(newX, y, PLAYER_RADIUS)) { x = newX; }
    // Try Y movement only
    if (!collidesWithGrid(x, newY, PLAYER_RADIUS)) { y = newY; }
    ```
  - **`collidesWithGrid(x, y, radius)` checks ALL grid cells the circle overlaps:**
    ```js
    function collidesWithGrid(cx, cy, r) {
      const minX = Math.floor(cx - r), maxX = Math.floor(cx + r);
      const minY = Math.floor(cy - r), maxY = Math.floor(cy + r);
      for (let gy = minY; gy <= maxY; gy++)
        for (let gx = minX; gx <= maxX; gx++)
          if (isSolid(gx, gy)) return true;
      return false;
    }
    ```
  - This handles corners, diagonals, and narrow passages correctly
- [ ] **Door collision:** Closed doors (`isSolid` returns true for closed doors) block movement
- [ ] Import `isSolid()` from `map.js`
- [ ] **Common bug:** Player gets stuck in walls on spawn — ensure PLAYER_SPAWN is in the center of Area 0, not near any wall

### Sub-task 3.1c: Weapon State

- [ ] **Player weapon data:**
  ```js
  state.player.weapons = ['FIST'];      // Available weapons
  state.player.currentWeapon = 'FIST';  // Active weapon key
  state.player.weaponState = {
    phase: 'idle',    // 'idle' | 'windup' | 'fire' | 'recovery' | 'swapping'
    timer: 0,         // ms remaining in current phase
    swapTarget: null,  // weapon to switch to
  };
  ```
- [ ] **Weapon switching:** On `1`, `2`, `3` keypress:
  - Only switch if that weapon slot is available
  - Start swap animation: `phase = 'swapping'`, `timer = WEAPON_SWAP_DELAY`
  - After delay: `currentWeapon = swapTarget`, `phase = 'idle'`
- [ ] **Fire trigger:** On mouse click (when `phase === 'idle'`):
  - Set `phase = 'windup'`, start weapon cycle
  - Actual hit resolution happens in `combat.js` (tasks4)
  - For now, just cycle through phases with correct timings from config

### Sub-task 3.1d: Weapon Bob

- [ ] Track `walkCycle` — increments when moving, resets when still
  ```js
  if (isMoving) { state.player.walkCycle += PLAYER_SPEED * dt * 6; }
  else { state.player.walkCycle *= 0.9; } // smooth decay
  ```
- [ ] Bob value: `Math.sin(walkCycle) * 3` — used by renderer for weapon offset

**Acceptance:** WASD moves the player through the 3D world. Mouse turns and pitches. Player slides along walls (doesn't stop dead). Weapon switching cycles through phases. Walk bob value is tracked.

---

## Task 3.2: Create `js/hud.js` — Basic HUD

**File:** `demoscenes/MOOD/js/hud.js`

### Sub-task 3.2a: Crosshair

- [ ] Draw a small dot or thin cross at screen center
  ```js
  // On the main canvas (drawn in renderer after walls):
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillRect(INTERNAL_WIDTH/2 - 1, INTERNAL_HEIGHT/2 - 1, 3, 3);
  ```
- [ ] Always visible, doesn't shift with pitch (stays at actual screen center)

### Sub-task 3.2b: Minimap

- [ ] Draw on `#minimap-canvas` (120x120 px)
- [ ] **Scale:** Each grid cell = 1-2 px depending on map size
- [ ] **Colors:**
  - Wall: dim gray (#333)
  - Empty: dark (#111)
  - Door: highlighted color (cyan/teal)
  - Button: distinct highlight (yellow)
  - Player: bright dot with direction line
  - *(Later)* Enemies: red dots, pickups: green dots
- [ ] **Viewport:** Center minimap on player position, show surrounding ~40x40 tiles
- [ ] **Update every frame** (or every 3-4 frames if perf concern)

### Sub-task 3.2c: Room Label

- [ ] When player enters a new room (roomId changes):
  - Update `#hud-room-label` text content
  - Show with fade-in
  - Fade out after 3 seconds (CSS transition or JS timer)
- [ ] **Room detection:** `roomId = roomMeta[Math.floor(player.y)][Math.floor(player.x)]`
- [ ] Corridor tiles (no label) → don't update label
- [ ] Look up display name from `ROOMS[roomId].label`

### Sub-task 3.2d: Kill Counter (placeholder)

- [ ] Display `"0/23 SPIRITS"` in top-left
- [ ] Update from `state.hud.killCount` / `state.hud.totalEnemies`
- [ ] Rendered via DOM element `#hud-kill-counter` (not canvas — cleaner text)

### Sub-task 3.2e: Weapon Indicator (placeholder)

- [ ] Display current weapon name in bottom-right
- [ ] Update from `state.player.currentWeapon`
- [ ] Via DOM element `#hud-weapon`

**Acceptance:** Crosshair visible at center. Minimap shows the Area 0/1 layout with player dot. Room label fades in/out on room change. Kill counter and weapon name displayed.

---

## Task 3.3: Create `js/triggers.js` — Doors & Buttons

**File:** `demoscenes/MOOD/js/triggers.js`

### Sub-task 3.3a: Door Opening

- [ ] **Function:** `update(state)`
- [ ] **E key interaction check:**
  - When player presses E (`consumeInteract()` from input):
  - Check all door tiles within `INTERACTION_RANGE` (2 tiles) of player
  - Check angle: door must be within `±INTERACTION_ANGLE` (30°) of player facing
  - If door is found and is openable:
    - `TILE.DOOR` (type 2): always openable → begin opening
    - `TILE.DOOR_LOCKED_BUTTON` (type 3): only if `state.flags.buttonPressed` → begin opening
    - `TILE.DOOR_LOCKED_KEY` (type 5): only if `state.player.hasAstralKey` → begin opening
  - Begin opening: set `doors[key].opening = true`, `doors[key].openProgress = 0`
- [ ] **Door animation tick:**
  - For each opening door: `openProgress += dt / DOOR_OPEN_DURATION`
  - When `openProgress >= 1`: set door to fully open, update grid tile to `TILE.EMPTY`
  - This makes the door passable in both collision AND raycasting
- [ ] **Interaction range helper:**
  ```js
  function isInInteractionRange(playerX, playerY, playerAngle, targetX, targetY) {
    const dx = targetX - playerX;
    const dy = targetY - playerY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > INTERACTION_RANGE) return false;
    const angleToTarget = Math.atan2(dy, dx);
    const angleDiff = Math.abs(normalizeAngle(angleToTarget - playerAngle));
    return angleDiff < INTERACTION_ANGLE;
  }
  ```

### Sub-task 3.3b: Button Interaction

- [ ] Button tile (type 9) in Area 1
- [ ] **Condition:** Only activatable when all enemies in Area 1 are dead
  - Check: `state.entities.filter(e => e.roomId === 'area1' && e.hp > 0).length === 0`
  - For now (no enemies yet): button is always activatable
- [ ] On E press at button: `state.flags.buttonPressed = true`
- [ ] Unlock the corresponding `DOOR_LOCKED_BUTTON` (type 3): set `doors[key].locked = false`
- [ ] Show HUD message: "GATE UNLOCKED" for 2 seconds

### Sub-task 3.3c: HUD Messages System

- [ ] `state.hud.messages` — array of `{ text, timer }`
- [ ] `triggers.js` pushes messages
- [ ] `hud.js` renders active messages (centered, fading)
- [ ] Each frame: decrement timers, remove expired messages

**Acceptance:** Press E near a door → it animates open (wall shrinks to nothing). Can walk through opened door. Locked doors show nothing happens until condition met. Button press unlocks the gate door.

---

## Task 3.4: Create `js/pickups.js` — Handgun Pickup

**File:** `demoscenes/MOOD/js/pickups.js`

- [ ] **Pickup entity structure:**
  ```js
  { type: 'HANDGUN', x: ..., y: ..., collected: false, bobOffset: 0 }
  ```
- [ ] **Spawn:** One handgun pickup in Area 0, directly in front of player spawn
- [ ] **Update function:** `update(state)`
  - For each uncollected pickup:
    - Update bob: `bobOffset = Math.sin(state.time.now * 0.003) * 0.1`
    - Check distance to player: if `< 1 tile` → auto-collect
  - On collect:
    - Set `collected = true`
    - Add weapon to `state.player.weapons` array
    - Auto-equip: `state.player.currentWeapon = 'HANDGUN'`
    - Push HUD message: "HANDGUN ACQUIRED"
- [ ] **Render data:** Uncollected pickups are included in sprite rendering (tasks4)
  - For now, show on minimap as green dot
  - Full 3D rendering comes with sprites.js

**Acceptance:** Walk near the handgun in Area 0 → "HANDGUN ACQUIRED" message → weapon indicator changes to "HANDGUN". Pickup disappears from minimap.

---

## Task 3.5: Wire Everything into Game Loop

**File:** Edits to `js/main.js`

- [ ] Import `player.js`, `hud.js`, `triggers.js`, `pickups.js`
- [ ] Initialize player position from `PLAYER_SPAWN`
- [ ] Initialize pickup entities
- [ ] **Update order in game loop:**
  ```js
  // Step 4: player.update(state)
  // Step 7: pickups.update(state)
  // Step 8: triggers.update(state)
  // Step 11: renderer.draw(state, ctx) — now includes HUD
  ```
- [ ] Remove temporary movement controls (player.js handles it now)
- [ ] Wire HUD drawing into renderer.js (crosshair on canvas, DOM elements for text)

**Acceptance:** Complete Milestone A flow: Start → walk around Area 0 → pick up handgun → open door → enter Area 1 → see minimap and HUD → use button (opens when enemies would be dead — auto-open for now) → see locked door to Area 2.

---

## Testing Checklist for Tasks 3

- [ ] Player moves at correct speed (3 tiles/sec feels right)
- [ ] Mouse look is smooth (no jitter, correct sensitivity)
- [ ] Pitch look (up/down) shifts the horizon correctly, clamped
- [ ] Wall sliding works (don't get stuck on corners)
- [ ] Can't walk through closed doors
- [ ] E opens doors within range and angle
- [ ] Door opening animation is smooth (0.3 seconds)
- [ ] After door opens, can walk through
- [ ] Handgun auto-collects within 1 tile
- [ ] Minimap accurately shows rooms, doors, player position
- [ ] Room label appears on entering Area 0, then Area 1
- [ ] Kill counter shows 0/23
- [ ] Weapon indicator updates on pickup

---

## Summary — What Exists After Tasks 3 (Milestone A)

```
demoscenes/MOOD/js/
├── config.js       ✅
├── input.js        ✅
├── main.js         ✅ (full game loop with systems wired)
├── map.js          ✅
├── raycaster.js    ✅
├── renderer.js     ✅ (+ crosshair)
├── player.js       ✅ Movement, collision, weapon state, bob
├── hud.js          ✅ Crosshair, minimap, room label, kill counter, weapon name
├── triggers.js     ✅ Doors, button, interaction system
└── pickups.js      ✅ Handgun entity, auto-collect
```

**Milestone A achieved:** Walk through Area 0, pick up handgun, open doors, see minimap and HUD. No enemies yet — that's next.

**What's next:** Tasks 4 — entities, sprite rendering, combat, and the Glimmer enemy for the first combat loop (Milestone B).
