# Tasks 5 — Full Level Expansion (Milestone C)

**Goal:** Expand from 2 rooms to the full game world: Area 2 with 5 interconnected rooms, Phantoms and the Prism enemy, the projectile system, Shotgun weapon, key mechanics, and the secret wall. After this, the entire game content exists except the boss.

**Milestone target:** Milestone C

**Depends on:** Tasks 1-4 (Milestone B — combat loop working)

---

## Task 5.1: Expand `js/map.js` — Full Area 2

### Sub-task 5.1a: Area 2 Room Geometry

- [ ] **Expand the grid** to accommodate all rooms (~80×80 total or whatever fits naturally)
  - The grid was already allocated at ~80×80 in tasks2 (filled with WALL). Now we carve the new rooms.
- [ ] **Carve 5 rooms with distinct shapes:**
  - `a2r1` — HALL OF ECHOES (~12×8): Rectangular with alcoves on sides
  - `a2r2` — THE DRIFT (~8×12): L-shaped with internal walls
  - `a2r3` — NEXUS (~12×12): Central hub, hallways branch to r2, r4, r5. Internal pillars.
  - `a2r4` — PRISM CHAMBER (~10×10): Internal pillars/walls for cover. Shotgun pickup here.
  - `a2r5` — THE PASSAGE (~10×8): Mix of indoor and outdoor (skybox) tiles. Key door to Area 3.
- [ ] **Layout tip:** Sketch the room positions on paper or a text grid first. Rooms should be offset so hallways don't cross. Example rough layout:
  ```
  [Area 0] -- [Area 1] -- [a2r1] -- [a2r3] -- [a2r5] -- [Boss]
                              |         |
                           [a2r2]    [a2r4]
  ```
- [ ] **Internal geometry:** Rooms are NOT open rectangles. Add:
  - Pillars (1x1 or 2x2 wall clusters inside rooms)
  - L-shapes and alcoves
  - Varied wall thickness
- [ ] **Hallways:** 2-3 tiles wide, connecting rooms with bends
  - a2r1 ↔ a2r2 (hallway with bend)
  - a2r1 ↔ a2r3 (direct hallway)
  - a2r3 ↔ a2r4 (hallway)
  - a2r3 ↔ a2r5 (hallway)
- [ ] **Doors between rooms:** `TILE.DOOR` (type 2) at each room connection in Area 2

### Sub-task 5.1b: Room Metadata for Area 2

- [ ] Add room IDs to `roomMeta` grid for all new tiles
- [ ] Add room definitions:
  ```js
  a2r1: { id: 'a2r1', label: 'AREA 2 — HALL OF ECHOES' },
  a2r2: { id: 'a2r2', label: 'AREA 2 — THE DRIFT' },
  a2r3: { id: 'a2r3', label: 'AREA 2 — NEXUS' },
  a2r4: { id: 'a2r4', label: 'AREA 2 — PRISM CHAMBER' },
  a2r5: { id: 'a2r5', label: 'AREA 2 — THE PASSAGE' },
  ```
- [ ] Hallways get corridor IDs (e.g., `'hall_1_2'`) — no HUD label shown for corridors

### Sub-task 5.1c: Special Tiles

- [ ] `TILE.OUTDOOR` (type 7) tiles in Area 2 Room 5 — skybox ceiling
- [ ] `TILE.STAIR` (type 8) tiles at indoor/outdoor transitions
- [ ] `TILE.SECRET_WALL` (type 4) — ONE hidden in Area 2 (looks like wall type 1)
- [ ] Button tile already handled (Area 1). No new buttons in Area 2.

### Sub-task 5.1d: Outdoor/Skybox Rendering

- [ ] Update `raycaster.js` to handle `TILE.OUTDOOR` tiles:
  - When casting ceiling for an outdoor tile: draw gradient sky instead of solid color
  - Gradient: dark blue (top) → purple (mid) → pink (horizon)
  - Skybox is per-column — matches the aesthetic
- [ ] Stair tiles: draw floor with alternating light/dark stripes

**Acceptance:** The full map renders with 5 distinct Area 2 rooms connected by hallways. Doors between rooms. Mix of indoor ceiling and outdoor skybox tiles. Minimap shows the complete layout.

---

## Task 5.2: Button Gate Logic (Area 1 → Area 2)

**File:** Edits to `js/triggers.js`

- [ ] **Area 1 clear check:** Button (type 9) is only interactable when:
  ```js
  const area1Alive = state.entities.filter(e => e.roomId === 'area1' && e.hp > 0).length;
  if (area1Alive > 0) {
    // Show message: "ENEMIES REMAIN" (for 1.5 seconds)
    return;
  }
  ```
- [ ] On button press → unlock `DOOR_LOCKED_BUTTON` → player can open and enter Area 2
- [ ] Set `state.flags.area1Cleared = true`

**Acceptance:** Can't press the button until all 4 Glimmers in Area 1 are dead. Once pressed, the gate door opens.

---

## Task 5.3: Phantom Enemy

**File:** Edits to `js/entities.js`

### Sub-task 5.3a: Phantom Factory & Idle Behavior

- [ ] `createPhantom(x, y, roomId)` — 20 HP, radius 0.3
- [ ] **Idle patrol:** Move between 2-3 random waypoints in room at ~0.6 tiles/sec
  - Slow, ghostly drift (smooth movement, no jitter)
  - Pause 1-2 seconds at each waypoint

### Sub-task 5.3b: Phantom Aggro Behavior

- [ ] **Approach phase:** Move toward player until ~4 tiles away
- [ ] **Strafe phase:** At 4 tiles, strafe left/right (perpendicular to player direction)
- [ ] **Retreat:** When HP < 50% (< 10 HP), retreat to ~6 tiles
- [ ] **Speed:** ~1.2 tiles/sec when aggro'd
- [ ] **Wall avoidance:** Circle-vs-grid collision with sliding

### Sub-task 5.3c: Phantom Projectile Attack

- [ ] **When aggro'd:** Fire "Vibe" projectile every 2 seconds
- [ ] Create projectile entity aimed at player position
- [ ] Projectile creation handled by `projectiles.js` (Task 5.5)

### Sub-task 5.3d: Phantom Visual (sprites.js)

- [ ] **Drawing function:** `drawPhantom(ctx, screenX, screenY, scale, entity)`
- [ ] Tall wavering body: Bezier curves (elongated, wavy edges oscillating with time)
- [ ] Two "eye" dots near top
- [ ] **Trailing afterimage:** Draw 2-3 previous positions at lower alpha
  - Store last 3 positions in entity: `entity.trail = [{x,y}, ...]`
  - Draw trail as faded copies
- [ ] Color: deep purple/magenta
- [ ] Hit flash: white override
- [ ] **Death animation:** Body splits into 4-6 fragments that drift apart and fade

**Acceptance:** Phantoms patrol their rooms. When shot, they aggro, strafe at medium range, and fire projectiles. They look like tall ghostly columns with trailing afterimages.

---

## Task 5.4: Prism Enemy (Key Bearer)

**File:** Edits to `js/entities.js`

### Sub-task 5.4a: Prism Factory & Behavior

- [ ] `createPrism(x, y, roomId)` — 30 HP, radius 0.4
- [ ] **Idle:** Patrol between 2-3 fixed waypoints in Prism Chamber
- [ ] **Aggro'd:** Pursue player at ~1.0 tiles/sec
- [ ] **Attack:** Fire 3 projectiles in ±15° spread every 2 seconds
- [ ] **Spawn:** ONE Prism in Area 2 Room 4 (fixed position)

### Sub-task 5.4b: Prism Visual (sprites.js)

- [ ] **Drawing function:** `drawPrism(ctx, screenX, screenY, scale, entity)`
- [ ] Rotating geometric shape (triangle/diamond) — `entity.rotation += dt * 2`
- [ ] Gradient fill with concentric inner shape
- [ ] Color: rainbow/prismatic — hue cycles independently: `hsl(entity.rotation * 60 % 360, ...)`
- [ ] Hit flash: white
- [ ] **Death animation:** Explodes into rainbow particles

### Sub-task 5.4c: Prism Key Drop

- [ ] On Prism death:
  - Create `KEY_OBJECT` pickup at death position
  - HUD message: "ASTRAL KEY ACQUIRED" for 2 seconds
  - Key visual: floating glowing diamond on floor (rendered as sprite)
- [ ] **Key pickup:** Walk within 1 tile → auto-collect → `state.player.hasAstralKey = true`
- [ ] Key appears on minimap as special icon

**Acceptance:** Prism patrols its room, fires spread shots when aggro'd, drops a key on death. Key is collectible.

---

## Task 5.5: Create `js/projectiles.js` — Projectile System

**File:** `demoscenes/MOOD/js/projectiles.js`

- [ ] **Projectile entity:**
  ```js
  { x, y, angle, speed, owner: 'phantom'|'prism'|'boss', lifetime: 10, age: 0 }
  ```
- [ ] **Spawn function:** `createProjectile(x, y, angle, speed, owner)`
- [ ] **Update function:** `updateProjectiles(state)`
  - Move: `x += cos(angle) * speed * dt`, `y += sin(angle) * speed * dt`
  - **Wall collision:** `if (isSolid(Math.floor(x), Math.floor(y)))` → destroy
  - **Player collision:** `if (dist(x, y, player.x, player.y) < 0.5)` → destroy + visual distortion
  - **Lifetime:** Destroy after 10 seconds (failsafe)
  - Tick `age += dt`
- [ ] **Player hit effect:**
  - No HP damage (player can't die)
  - Visual: trigger hue shift + chromatic aberration for 0.5s via `state.effects.distortion = 0.5`
- [ ] **Projectile visual (sprites.js):**
  - Rendered as billboarded sprites (same system as entities)
  - Phantom: glowing circle (cyan) with 3-frame trail
  - Prism: same but different color per projectile
  - Boss: larger, gold/red (added in tasks6)
- [ ] **Trail rendering:** Store last 3 positions, draw at decreasing alpha

**Acceptance:** Phantoms and Prism fire projectiles. Projectiles travel through the air, are visible as glowing orbs with trails, hit walls and are destroyed, or hit the player and cause a visual distortion.

---

## Task 5.6: Shotgun Weapon

**File:** Edits to `js/combat.js` and `js/pickups.js`

### Sub-task 5.6a: Shotgun Pickup

- [ ] Spawn shotgun pickup entity in Area 2 Room 4 (PRISM CHAMBER)
- [ ] Walk within 1 tile → auto-collect → add 'SHOTGUN' to `state.player.weapons`
- [ ] Auto-equip or available on key 3

### Sub-task 5.6b: Shotgun Fire Mechanic

- [ ] **On fire:** Cast 12 rays within ±10° cone (spread)
  ```js
  const baseAngle = player.angle;
  for (let i = 0; i < 12; i++) {
    const offset = (i / 11 - 0.5) * WEAPONS.SHOTGUN.spread * 2;
    const rayAngle = baseAngle + offset;
    // Cast ray, check entity intersection
    // Each hit: ~1.25 damage (15 / 12)
  }
  ```
- [ ] **Range limited:** 6 tiles max
- [ ] **Timings:** windup 80ms, fire 200ms, recovery 720ms (pump animation) = 1000ms total

### Sub-task 5.6c: Shotgun Visual (renderer.js)

- [ ] **Drawing:** Longer dark rectangle + wide barrel at bottom-center
- [ ] **Phase 2 (fire):** Large muzzle flash + 3-4 pellet trail lines radiating from barrel
- [ ] **Phase 3 (recovery):** Pump/rack animation — weapon drops down then rises back up
- [ ] **Screen shake:** Heavier than handgun (±3px for 4 frames)

**Acceptance:** Shotgun pickup in Area 2. Fires spread of 12 pellets. Devastating at close range (1-shots Phantoms within 6 tiles). Satisfying pump animation.

---

## Task 5.7: Key Door & Secret Wall

**File:** Edits to `js/triggers.js`

### Sub-task 5.7a: Key Door

- [ ] `TILE.DOOR_LOCKED_KEY` (type 5) between Area 2 Room 5 and Area 3
- [ ] **Interaction:** E press → check `state.player.hasAstralKey`:
  - If no key: HUD message "REQUIRES ASTRAL KEY" (1.5 seconds)
  - If has key: begin door open animation (same as regular doors)

### Sub-task 5.7b: Secret Wall

- [ ] `TILE.SECRET_WALL` (type 4) — ONE in Area 2 (hidden in a wall that looks identical to type 1)
- [ ] **In raycaster:** Render type 4 identically to type 1 (no visual difference)
- [ ] **Interaction:** E press within range + angle:
  - Change tile to `TILE.EMPTY`
  - HUD message: "YOU FOUND ME" for 3 seconds
  - Set `state.flags.secretFound = true`
  - *(Audio in tasks8: ascending chime)*

**Acceptance:** Key door blocks until Astral Key collected. Secret wall looks identical to normal wall but can be opened with E.

---

## Task 5.8: Spawn All Enemies for Area 2

**File:** Edits to `js/entities.js` (spawn logic) and `js/map.js` (positions)

- [ ] **Enemy placement per room (from mood.md):**
  | Room | Glimmers | Phantoms | Prism |
  |------|----------|----------|-------|
  | a2r1 | 3 | 1 | 0 |
  | a2r2 | 4 | 0 | 0 |
  | a2r3 | 2 | 2 | 0 |
  | a2r4 | 2 | 0 | 1 |
  | a2r5 | 0 | 3 | 0 |
- [ ] Place enemies at specific positions within rooms (not overlapping, not on walls)
- [ ] All idle at start — only aggro when shot (or propagation)
- [ ] Total across Areas 1+2: 15 Glimmers + 6 Phantoms + 1 Prism = 22 entities
- [ ] Update `state.hud.totalEnemies = 23` (includes boss, but boss not spawned yet)

**Acceptance:** All 22 non-boss enemies are in the world, in the correct rooms, wandering idle.

---

## Task 5.9: Weapon Switching Polish

**File:** Edits to `js/player.js`

- [ ] **Weapon slots:**
  - `1` = Fist (always available)
  - `2` = Handgun (if collected)
  - `3` = Shotgun (if collected) — later replaced by Void Beam
- [ ] **200ms swap delay:** Lower current weapon → raise new weapon
  - During swap: weapon is in `swapping` phase, cannot fire
  - Visual: weapon drops below screen bottom, then new weapon rises
- [ ] **Prevent spam:** Can't start a new swap while swapping

**Acceptance:** Press 1/2/3 to switch weapons smoothly. 200ms animation. Can't fire during swap.

---

## Testing Checklist for Tasks 5

- [ ] Full Area 2 renders correctly with 5 distinct rooms
- [ ] Hallways connect rooms, all doors work
- [ ] Indoor ceiling and outdoor skybox tiles render correctly
- [ ] Stair tiles show striped floor pattern
- [ ] Button in Area 1 only works after all enemies dead
- [ ] Phantoms patrol, strafe when aggro'd, retreat at low HP
- [ ] Phantom projectiles travel, hit walls, distort player screen
- [ ] Prism fires 3-way spread shots
- [ ] Prism drops key on death
- [ ] Key auto-collects, enables key door
- [ ] Shotgun fires 12-pellet spread, limited to 6 tiles
- [ ] Shotgun pump animation after firing
- [ ] Secret wall opens with E, shows "YOU FOUND ME"
- [ ] All 22 enemies spawned in correct rooms
- [ ] Minimap shows expanded map with all rooms and enemies

---

## Summary — What Exists After Tasks 5 (Milestone C)

```
demoscenes/MOOD/js/
├── config.js       ✅
├── input.js        ✅
├── main.js         ✅ (projectiles wired in)
├── map.js          ✅ Full map: Area 0 + Area 1 + Area 2 (5 rooms)
├── raycaster.js    ✅ (+ outdoor skybox, stair rendering)
├── renderer.js     ✅ (+ shotgun drawing, Phantom/Prism sprite dispatch)
├── player.js       ✅ (+ weapon switching polish)
├── hud.js          ✅
├── triggers.js     ✅ (+ button gate, key door, secret wall)
├── pickups.js      ✅ (+ shotgun pickup, key object)
├── entities.js     ✅ (+ Phantom, Prism, all 22 enemies spawned)
├── sprites.js      ✅ (+ Phantom/Prism/projectile drawing)
├── combat.js       ✅ (+ shotgun spread)
└── projectiles.js  ✅ Projectile movement, collisions, trails
```

**Milestone C achieved:** Full Areas 0-2 playable with all enemy types, all non-boss weapons, projectiles, keys, and secret wall. Only missing: boss fight and AI.

**What's next:** Tasks 6 — the Ego Boss, Void Beam, Light Well mechanic, and victory sequence.
