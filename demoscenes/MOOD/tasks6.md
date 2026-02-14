# Tasks 6 — Boss Fight & Victory (Milestone D)

**Goal:** Build the final encounter: Area 3 map, the Void Beam weapon, the Ego Boss with its unique Light Well mechanic, and the victory sequence. After this, the entire game is playable from start to finish by a human player.

**Milestone target:** Milestone D

**Depends on:** Tasks 1-5 (Milestone C — full level with all non-boss content)

---

## Task 6.1: Expand `js/map.js` — Area 3

### Sub-task 6.1a: Boss Corridor

- [ ] **Corridor** (~4x8) between Area 2 Room 5 and the boss room
- [ ] Connected via the key door (already placed in tasks5)
- [ ] Void Beam pickup entity placed in this corridor (on the critical path)
- [ ] Corridor ID: `corridor_boss` (no HUD label shown)
- [ ] All indoor tiles (ceiling)

### Sub-task 6.1b: Boss Room — THE EGO

- [ ] **Large room** (~16x16) — the biggest in the game
- [ ] **Light Well (type 6)** in the center: cluster of ~4-6 tiles
  - Player must stand on these to damage the boss
  - Visual: distinct floor color (bright, glowing)
- [ ] **Mix of indoor and outdoor tiles:**
  - Center area: indoor (ceiling)
  - Outer edges: outdoor (skybox) for dramatic open-sky feel
- [ ] **Internal structure:** Some pillars/walls for cover, but mostly open for boss orbiting
- [ ] **Room ID:** `area3`, label: `"THE EGO"`

### Sub-task 6.1c: Room Registration

- [ ] Add to ROOMS:
  ```js
  corridor_boss: { id: 'corridor_boss', label: '' }, // no label display
  area3: { id: 'area3', label: 'THE EGO' },
  ```
- [ ] Update `roomMeta` grid for all new tiles

**Acceptance:** Area 3 renders correctly. Corridor leads to a large boss room with Light Well tiles in the center. Mix of indoor ceiling and outdoor skybox. Minimap shows the complete game map.

---

## Task 6.2: Void Beam Weapon

### Sub-task 6.2a: Void Beam Pickup

**File:** Edits to `js/pickups.js`

- [ ] Spawn Void Beam pickup in boss corridor
- [ ] Pickup visual: glowing orb with radiating lines (drawn in sprites.js)
- [ ] On collect:
  - Add to weapons
  - Auto-equip (replaces slot 3)
  - HUD message: "VOID BEAM ACQUIRED"
- [ ] **Slot 3 replacement:** If player has shotgun on slot 3, Void Beam takes slot 3. Shotgun still usable (stays in weapons list — addressed in weapon switching or removed for simplicity since boss is the last fight)

### Sub-task 6.2b: Void Beam Combat

**File:** Edits to `js/combat.js`

- [ ] **Hitscan** — same as handgun but with unique properties:
  - 10 damage per hit
  - Fire rate: 3/sec (333ms cycle)
  - **Only damages the boss.** Against regular enemies: hits but deals 0 or normal damage (design says "boss only" but this could mean it just happens to be useful for the boss; for simplicity, it damages everything)
  - Actually re-reading mood.md: the boss is only vulnerable to Void Beam while on Light Well. But Void Beam can presumably hit other enemies too (it's just acquired right before the boss). Let's make it damage everything.
- [ ] **Timings:** windup 50ms, fire 233ms (beam active), recovery 50ms = 333ms
- [ ] **During fire phase:** Beam is active — continuous visual line from weapon to hit point

### Sub-task 6.2c: Void Beam Visual

**File:** Edits to `js/renderer.js`

- [ ] **Idle:** Glowing orb at bottom-center of screen
- [ ] **Phase 1 (charge):** Orb glows brighter, particles gather
- [ ] **Phase 2 (fire):** Bright line from orb to screen center, extending to hit point
  - Line rendered as a bright colored strip on the canvas
  - Glow effect: draw line at multiple widths with decreasing alpha
- [ ] **Phase 3 (recovery):** Glow fades
- [ ] **Weapon bob applied**

**Acceptance:** Void Beam fires a continuous beam visual. Deals 10 damage per hit at 3/sec. Satisfying visual.

---

## Task 6.3: Ego Boss Entity

**File:** Edits to `js/entities.js`

### Sub-task 6.3a: Boss Factory

- [ ] `createBoss(x, y, roomId)` — 150 HP, radius 1.0
- [ ] **Always aggro** — no idle state. `aggroState = 'aggro'` from spawn.
- [ ] Spawn at Area 3 center, but NOT active until player enters the room
- [ ] `state.flags.bossActive = false` initially

### Sub-task 6.3b: Boss Activation

- [ ] **Trigger:** When player's `roomId` becomes `'area3'` → `state.flags.bossActive = true`
- [ ] On activation:
  - HUD room label: "THE EGO" with dramatic fade-in
  - Boss starts moving

### Sub-task 6.3c: Boss Movement

- [ ] **Orbit:** Boss moves in a circle around room center
  ```js
  boss.orbitAngle += boss.orbitSpeed * dt;
  boss.x = roomCenterX + orbitRadius * Math.cos(boss.orbitAngle);
  boss.y = roomCenterY + orbitRadius * Math.sin(boss.orbitAngle);
  ```
- [ ] **Speed:** ~1.5 tiles/sec orbital speed
- [ ] **Orbit radius:** ~5-6 tiles (stays in the outer area of the room)
- [ ] Boss does NOT pathfind or chase — it orbits predictably

### Sub-task 6.3d: Boss Attack

- [ ] **Fire projectile** at player every 2-3 seconds
  - Projectile: gold/red, larger than Phantom projectiles (radius ~0.25)
  - Speed: 2 tiles/sec, aimed at player position
  - On player hit: stronger visual distortion (hue shift + blur for 0.5s)
- [ ] Use existing projectile system from `projectiles.js`

### Sub-task 6.3e: Boss Invulnerability / Light Well

- [ ] **Boss is invulnerable** unless player stands on a Light Well tile (type 6)
- [ ] **Check each frame:**
  ```js
  const playerTile = getTile(Math.floor(player.x), Math.floor(player.y));
  const onLightWell = playerTile === TILE.LIGHT_WELL;
  ```
- [ ] If player fires at boss while NOT on Light Well: no damage. HUD flash: "FIND THE LIGHT" (first time only)
- [ ] If player fires at boss while ON Light Well: normal damage applied
- [ ] **Light Well visual:** Floor glows brighter when player is standing on it (in raycaster floor rendering)

### Sub-task 6.3f: Boss Visual (sprites.js)

- [ ] **Drawing:** `drawBoss(ctx, screenX, screenY, scale, entity)`
- [ ] **Large pulsing mass:** Central `arc()` with radius oscillating via `sin(time)`
- [ ] **Tendrils:** 6-8 Bezier curves radiating outward
  - Each tendril: `quadraticCurveTo` with control points animated by `sin/cos` at different phases
  - Tendrils sway and writhe
- [ ] **Central eye:** Concentric circles (dark → bright → dark → pupil)
- [ ] **Color:** Shifts between dark red and gold: `hsl(lerp(0, 45, sin(time)), 80%, 40%)`
- [ ] **Size:** ~2 tiles wide (large sprite, needs to scale correctly)
- [ ] **Hit flash:** Full white tint for 2 frames
- [ ] **Death animation (separate from victory):**
  - Tendrils retract toward center
  - Body shrinks/implodes
  - Hold for 0.5 seconds at minimum size
  - Then trigger victory sequence

**Acceptance:** Boss orbits the room, fires projectiles. Player must stand on Light Well to deal damage. Void Beam at 3/sec = ~5 seconds of continuous fire to kill (150 HP / 10 = 15 hits, at 3/sec = 5 seconds). Boss looks like a writhing mass with tendrils and a central eye.

---

## Task 6.4: Victory Sequence

**File:** Create `js/effects.js` (or add to existing)

### Sub-task 6.4a: Boss Death → Victory Trigger

- [ ] When boss HP ≤ 0:
  1. Set `state.flags.victoryTriggered = true`
  2. Boss death animation starts (tendrils retract → implode → hold 0.5s)
  3. After death animation: begin victory sequence

### Sub-task 6.4b: Fade to White

- [ ] **Canvas overlay:** Draw white rectangle with increasing alpha over 1 second
  ```js
  ctx.fillStyle = `rgba(255, 255, 255, ${victoryAlpha})`;
  ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
  ```
- [ ] `victoryAlpha` lerps from 0 to 1 over 1 second
- [ ] During fade: game loop still runs but entities stop updating

### Sub-task 6.4c: Victory Screen

- [ ] After fade complete:
  - Display "YOU ESCAPED YOUR MOOD" — large centered text (canvas-drawn or DOM overlay)
  - Below: "SPIRITS VANQUISHED: 23/23" (or actual count / total)
  - If `state.flags.secretFound`: show "SECRET FOUND" badge
  - Return-to-menu button appears after 3 seconds
  - Auto-redirect to `../` after 10 seconds if no interaction
- [ ] **Style:** Large, clean text on white background. Minimal. Feels like relief.

### Sub-task 6.4d: Game Loop Halt

- [ ] After victory is triggered:
  - Continue running the game loop for death animation + fade
  - After fade: stop calling `requestAnimationFrame` (or skip all updates)
  - Show victory DOM overlay

**Acceptance:** Kill boss → tendrils retract → implode → fade to white → "YOU ESCAPED YOUR MOOD" → spirit count → menu button. Complete game can be played start to finish.

---

## Task 6.5: Wire Boss into Game Loop

**File:** Edits to `js/main.js` and related

- [ ] Spawn boss entity (inactive) on init
- [ ] Boss activation check in `entities.update()` or `triggers.update()`
- [ ] Victory sequence check in game loop (after entities update)
- [ ] Victory overlay management in main.js

**Acceptance:** Complete Milestone D. The game is playable from "CLICK TO BEGIN" to "YOU ESCAPED YOUR MOOD" by a human player. All 23 enemies, all 4 weapons, all areas, all mechanics work.

---

## Testing Checklist for Tasks 6

- [ ] Boss corridor renders, Void Beam pickup collectable
- [ ] Entering Area 3 activates the boss
- [ ] Boss orbits the room smoothly
- [ ] Boss fires projectiles at player
- [ ] Player projectile distortion works (visual only)
- [ ] Void Beam fires continuous beam with visual
- [ ] Boss is invulnerable when player NOT on Light Well
- [ ] Boss takes damage when player IS on Light Well
- [ ] Light Well floor glows when player stands on it
- [ ] Boss dies after sufficient Void Beam hits (~15 hits = 5 seconds)
- [ ] Boss death animation plays (retract → implode → hold)
- [ ] Fade to white over 1 second
- [ ] Victory message displays with correct spirit count
- [ ] Return to menu button works
- [ ] Full game playthrough: Area 0 → 1 → 2 → 3 → victory

---

## Summary — What Exists After Tasks 6 (Milestone D)

```
demoscenes/MOOD/js/
├── config.js       ✅
├── input.js        ✅
├── main.js         ✅ (boss + victory wired in)
├── map.js          ✅ (+ Area 3: corridor, boss room, Light Well)
├── raycaster.js    ✅ (+ Light Well floor glow)
├── renderer.js     ✅ (+ Void Beam visual, boss sprite)
├── player.js       ✅
├── hud.js          ✅
├── triggers.js     ✅ (+ boss activation)
├── pickups.js      ✅ (+ Void Beam pickup)
├── entities.js     ✅ (+ Boss: orbit, projectile, invulnerability)
├── sprites.js      ✅ (+ Boss drawing: tendrils, eye, death anim)
├── combat.js       ✅ (+ Void Beam, Light Well check)
├── projectiles.js  ✅ (+ boss projectile type)
└── effects.js      ✅ Victory fade, screen state management
```

**Milestone D achieved:** The complete game is playable by a human from start to finish. Every mechanic works. No AI yet — that's next.

**What's next:** Tasks 7 — the AI auto-pilot that can complete the entire game autonomously.
