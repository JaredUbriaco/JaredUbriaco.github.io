# MOOD — Design Document

**Esoteric spin on DOOM by id Software**  
*Neon-soaked, vaporwave nightmare. Raycasting pseudo-3D.*

---

## Vision Statement

MOOD flips the gritty, industrial corridors of DOOM into a psychedelic, vaporwave-inspired experience. Players navigate ethereal spaces, combat "MOOD Spirits," and face The Ego Boss. The game uses a Wolfenstein-style raycasting engine for performance and that iconic pseudo-3D aesthetic.

**Core Pillars:**
- **Esoteric & Ethereal** — No realistic textures; vibrant gradients, CSS filters, breathing geometry
- **Auto-Explore** — AI-driven movement; player focuses on targeting and atmosphere
- **Modular Engine** — Clean HTML/CSS/JS architecture; multiple JS modules for each game system

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Rendering | `<canvas>` 2D context | Raycasting is line-based; no WebGL needed |
| Layout | HTML/CSS overlay | HUD, menus, effects, filters |
| Logic | Vanilla JavaScript (modular, multi-file) | No frameworks; clean system separation |
| Audio | Web Audio API | Procedural ambient drones, SFX — no external files |

### Performance Target
- **Render resolution:** 400×300 internal, upscaled to 800×600 display with `image-rendering: pixelated`
- **Target:** 60 FPS on any modern (2020+) browser/hardware
- **Budget per frame:** ~16ms. Raycasting 400 columns + ~25 sprites is well within budget. DDA raycasting is O(columns × avg_steps); at 400 columns and ~20 steps avg, that's ~8,000 iterations — trivial for modern JS engines.
- **Hue-rotate CSS filter** is GPU-accelerated and costs effectively nothing
- **Main concern:** Sprite sorting/drawing if many sprites overlap. Cap at ~30 active entities; no issue.

---

## Phase 1: The Psychedelic Foundation

### 1.1 Canvas Setup
- Single `<canvas>` element, displayed at 800×600 (CSS size)
- **Internal resolution: 400×300** — all raycasting and drawing at this resolution
- Upscaled via CSS `width: 800px; height: 600px` + `image-rendering: pixelated` for crisp retro look
- **Full hue-shifting:** `filter: hue-rotate(Xdeg)` on canvas wrapper, X driven by `requestAnimationFrame` — constant psychedelic color drift

### 1.2 Controls & Pointer Lock (Locked)
- **Pointer Lock API:** `canvas.requestPointerLock()` on first click / game start
- **Mouse movement** (`movementX`) controls player look (turning left/right)
- **Mouse sensitivity:** Configurable; default ~0.002 radians per pixel
- **Escape key:** Unlocks pointer, opens pause menu overlay
  - Pause menu: "RESUME" (re-locks pointer, continues), "QUIT" (return to demoscenes page)
  - Game loop pauses while menu is open
- **Click to start:** On page load, show "CLICK TO BEGIN" overlay; first click requests pointer lock and starts game
- **Controls:**
  - `W/S` — Move forward/backward
  - `A/D` — Strafe left/right
  - `Mouse` — Look (turn left/right)
  - `Left Click` — Fire weapon
  - `E` — Interact (button, door, secret wall)
  - `1/2/3` — Weapon switch (only available weapons)
  - `Esc` — Pause menu / unlock pointer

### 1.3 HUD Overlay
- `position: absolute` overlay, layered on top of canvas
- **Third Eye** instead of Doomguy face — **organic design:** waves, curves, flowing shapes (no sharp geometry)
- Rendered via canvas Bezier curves on a small secondary canvas or inline SVG
- **States (decorative / weapon feedback):**
  - Idle: Calm, subtle pulse
  - Firing: Brief dilation or pulse
  - *No HP system — player cannot die for now*
- **Crosshair:** Small dot or soft cross at screen center (always visible)
- **Kill counter:** `killed / total` spirits display (e.g. "12/22 SPIRITS") — top-left
- **Room label:** Current room name displayed (e.g. "AREA 1", "AREA 2 — ROOM 3", "THE EGO") — top-center, fades after 3 seconds on room change
- **Key indicator:** Flash "ASTRAL KEY ACQUIRED" for 2 seconds when Prism drops key
- **Weapon indicator:** Current weapon name + icon, bottom-right (e.g. "FIST", "HANDGUN")
- **AI indicator:** When AI is controlling, show "AUTO" label pulsing near crosshair
- **Controls overlay on start:** Show WASD / Mouse / E / 1-2-3 keys for 3 seconds or until first input

### 1.4 World Aesthetic
- Walls: Gradient fills, not bitmap textures (HSL-based, shifting with global hue)
- Floor/Ceiling: Solid color or gradient (no complex floor-casting for v1)
- Lighting: Distance-based darkening (`1 / distance` falloff)
- Fog/haze for depth (darken strips based on distance)
- **Breathing walls:** Wall height modulated by `Math.sin(Date.now() * 0.001)` — subtle (±2–3% max) to avoid motion sickness

### 1.5 Minimap
- Drawn in a screen corner (top-right), ~120×120 px
- 1–2 px per grid cell
- **Colors:** Walls = dim, empty = dark, doors = highlight color, player = bright dot with direction indicator, enemies = red dots, pickups = green dots
- Iterate the 2D grid, draw filled rectangles
- **Room labels** shown on minimap (small text or color-coded regions)
- Helps orientation in the multi-room layout

---

## Phase 2: World Logic

### 2.1 Map Representation
Single contiguous 2D grid for all areas. Rooms connected by doorways/corridors.

| Value | Type | Behavior |
|-------|------|----------|
| 0 | Empty | Walkable |
| 1 | Ethereal Wall | Standard wall, gradient fill |
| 2 | Gateway/Door | Opens on trigger or key; **animated** — wall height shrinks to 0 over 0.3s |
| 3 | Checkpoint Trigger | Progress marker, AI waypoint target (walkable floor tile) |
| 4 | Secret Wall | Press E within 2 tiles and ±30° of facing — becomes type 0, reveals "YOU FOUND ME" |
| 5 | Key Door | Only opens when `hasAstralKey === true`; same animation as type 2 |
| 6 | Light Well | Special floor tile in boss room; stand here to damage boss. Visually distinct (bright glow on floor) |
| 7 | Boss Door | Opens automatically when player enters Area 3 corridor |
| 8 | Weapon Pickup | Floor tile; walking over it grants the weapon. Displays floating weapon sprite above tile. |

### 2.2 Room Layout (Locked)
All areas on one contiguous grid. Rooms connected by short corridors (2–3 tiles wide) with door cells.

```
[AREA 1: 1 room]  ──door──  [AREA 2: 5 rooms connected by doorways]  ──key door──  [AREA 3: boss room]
```

**Room IDs and Labels:**

| ID | Label | Approx Size | Notes |
|----|-------|-------------|-------|
| `area1` | "AREA 1" | ~12×12 | Starting room. Button on far wall. Handgun pickup. |
| `a2r1` | "AREA 2 — ROOM 1" | ~10×8 | First room of Area 2 |
| `a2r2` | "AREA 2 — ROOM 2" | ~8×10 | Side room |
| `a2r3` | "AREA 2 — ROOM 3" | ~10×10 | Central hub room |
| `a2r4` | "AREA 2 — ROOM 4" | ~8×8 | Prism room. Shotgun pickup here. |
| `a2r5` | "AREA 2 — ROOM 5" | ~10×6 | Final room before key door |
| `area3` | "THE EGO" | ~14×14 | Boss room. Light Well in center. Void Beam pickup in entry corridor. |

- Doorways between Area 2 rooms are always-open type 2 (no keys needed within Area 2)
- Area 1 → Area 2: Door (type 2) opens when button is pressed after clearing enemies
- Area 2 → Area 3: Key door (type 5) requires Astral Key

### 2.3 Room Detection
Each room is defined by **rectangular bounds** on the grid:
```js
const ROOMS = [
  { id: 'area1', label: 'AREA 1', x1: 0, y1: 0, x2: 12, y2: 12 },
  { id: 'a2r1', label: 'AREA 2 — ROOM 1', x1: 14, y1: 0, x2: 24, y2: 8 },
  // ... etc
];
```
- Player's current room = whichever ROOMS entry contains `(player.x, player.y)`
- Used for: HUD room label, AI target selection, enemy "current room" tracking
- Doorways/corridors can overlap two rooms or be their own zone — keep simple

### 2.4 Raycaster
- **Input:** Player `(x, y)`, `angle`, `fieldOfView`, `screenWidth` (400 columns at internal res)
- **Output:** For each column `i`, cast ray at `angle - FOV/2 + (i / screenWidth) * FOV`
- **Algorithm:** DDA (Digital Differential Analyzer) — step-based ray march until cell is a wall type
- **Per strip:** `distance` (fish-eye corrected), `wallType`, `hitSide` (N/S/E/W for shading)
- **Wall height:** `(tileSize / correctedDistance) * projectionConstant` — breathing modulation applied
- **Door animation:** When a door opens, its effective wall height lerps from full to 0 over 0.3 seconds (store `doorOpenProgress` per door cell)
- **Z-buffer:** Store wall distance per column for sprite clipping

### 2.5 Player
- `x, y` (world units, floating point)
- `angle` (radians)
- `fov` (60° = ~1.047 radians)
- Move speed: ~3 tiles/sec, turn speed: via mouse (Pointer Lock `movementX`)
- **Collision:** Circle-based (radius ~0.2 tiles). Before moving, check if new position's nearby grid cells are solid. Slide along walls (project velocity onto wall normal).
- **Weapon bob:** Offset weapon drawing by `Math.sin(walkCycle)` vertically when moving

### 2.6 Collision System (Locked)
- **Player vs walls:** Circle (radius 0.2) vs grid. Slide along walls, don't stop dead.
- **Player vs enemies:** No collision (player can walk through enemies). Simplifies movement.
- **Enemies vs walls:** Same circle-vs-grid check. Enemies cannot walk through walls. If stuck, they attempt to slide along the wall.
- **Enemies vs enemies:** No collision (pass through each other). Prevents doorway gridlock.
- **Enemies in doorways:** Enemies CAN stand in doorways. Player must kill them to pass (since enemies block line-of-sight / are targetable, not physical blockers — but player cannot skip them because all enemies in a room must be dead to progress).
- **Projectiles vs walls:** Projectiles are destroyed on wall hit.
- **Projectiles vs player:** Phantom/boss projectiles trigger visual distortion on player hit (no HP loss).
- **Interaction range:** 2 tiles distance AND ±30° of facing direction to interact (E key) with buttons, doors, secret walls.

---

## Phase 3: Entities (MOOD Spirits)

### 3.1 Visual Design (All Programmatic)
All entity visuals are drawn with canvas primitives — no images, no sprites sheets. Simple shapes and blobs, each enemy type visually distinct.

**Glimmer:**
- Small flickering orb/blob
- Draw: `arc()` with oscillating radius + 4–6 small `arc()` "sparkle" dots orbiting it
- Color: Bright white/cyan, alpha pulses
- Size: ~0.4 tiles wide

**Phantom:**
- Tall wavering column/silhouette
- Draw: Bezier curve body (elongated, wavy edges), two "eye" dots near top
- Trailing afterimage: draw 2–3 previous positions at lower alpha
- Color: Deep purple/magenta
- Size: ~0.6 tiles wide, ~1.2 tiles tall (in world units for sprite scaling)

**Prism:**
- Rotating geometric shape (triangle/diamond) with inner glow
- Draw: Rotating polygon (3–4 points) with gradient fill, concentric inner shape
- Color: Rainbow/prismatic — hue cycles independently of global hue shift
- Size: ~0.8 tiles wide

**Ego Boss:**
- Large pulsing mass with tendrils
- Draw: Central large `arc()` + 6–8 Bezier-curve tendrils radiating outward, animated with `sin/cos` offsets
- "Eye" in center: concentric circles
- Color: Shifts between dark red and gold
- Size: ~2 tiles wide (large sprite)

**Weapon Pickups:**
- Floating shape above floor tile, bobbing up/down (`Math.sin`)
- Handgun: Small rectangle + barrel shape
- Shotgun: Longer rectangle + wider barrel
- Void Beam: Glowing orb with radiating lines

### 3.2 Glimmers (Normal)
- **HP:** 5
- **Behavior:** Float toward player; erratic movement (add random angle offset each frame ±15°)
- **Attack:** Melee range — visual-only since player has no HP
- **Speed:** ~1.5 tiles/sec
- **Visual:** Small flickering orb (see 3.1)
- **Death:** Shrink to 0 + burst of 5–8 small particles (tiny arcs) that fade over 0.3s

### 3.3 Phantoms (Elite)
- **HP:** 20
- **Behavior:** Approach to ~4 tiles, then strafe. Retreat to ~6 tiles when HP < 50%.
- **Attack:** "Vibe" projectile every 2 seconds — slow-moving orb (~2 tiles/sec) aimed at player
- **Projectile visual:** Glowing circle with trail (draw 3 previous positions at decreasing alpha)
- **Distortion on hit:** Hue shift + chromatic aberration for 0.5s (visual only, no HP loss)
- **Speed:** ~1.2 tiles/sec
- **Visual:** Tall wavering column (see 3.1)
- **Death:** Dissolve effect — body splits into 4–6 fragments that drift apart and fade

### 3.4 The Prism (Key-Bearer)
- **Location:** Area 2, Room 4 (fixed spawn position — AI knows where to go)
- **HP:** 30
- **Behavior:** Patrols within its room (moves between 2–3 waypoints in the room)
- **Attack:** Same as Phantom but fires 3 projectiles in a small spread
- **Speed:** ~1.0 tiles/sec
- **Visual:** Rotating prismatic shape (see 3.1)
- **Death:** Explodes into rainbow particles + drops `KEY_OBJECT` at death position. Flash "ASTRAL KEY ACQUIRED" on HUD for 2s. Key rendered as a floating glowing diamond on the floor.
- **Key pickup:** Walk within 1 tile of dropped key → auto-collect. Sets `hasAstralKey = true`.
- **Gate:** Key door (type 5) to Area 3 requires `hasAstralKey`

### 3.5 Ego Boss
- **Location:** Area 3 center
- **HP:** 150
- **Behavior:** Orbits room center at ~1.5 tiles/sec. Fires slow projectile at player every 2–3 seconds.
- **Invulnerable** unless player stands on Light Well tile (type 6)
- **Only damaged by Void Beam** (10 dmg per hit, 3 hits/sec = ~5 seconds to kill)
- **Visual:** Large pulsing mass with tendrils (see 3.1)
- **Death:** Screen flash white → all tendrils retract → body implodes to center → held 0.5s → victory sequence

### 3.6 Enemy Counts Per Room (Locked)

| Room | Glimmers | Phantoms | Prism | Total |
|------|----------|----------|-------|-------|
| Area 1 | 4 | 0 | 0 | 4 |
| Area 2 Room 1 | 3 | 1 | 0 | 4 |
| Area 2 Room 2 | 4 | 0 | 0 | 4 |
| Area 2 Room 3 | 2 | 2 | 0 | 4 |
| Area 2 Room 4 | 2 | 0 | 1 | 3 |
| Area 2 Room 5 | 0 | 3 | 0 | 3 |
| **Total** | **15** | **6** | **1** | **22** |

Plus 1 Ego Boss in Area 3. Grand total: 23 entities to kill.

### 3.7 Sprite Rendering
- Billboarding: sprites always face camera (calculated from player angle to entity position)
- Draw order: sort all entities by distance to player, draw far→near
- Scale: `spriteWorldHeight / correctedDistance * projectionConstant`
- Clip to screen bounds; use Z-buffer from raycaster to clip sprites behind walls
- Each entity type has its own `draw(ctx, screenX, screenY, scale)` method

---

## Phase 4: Level Flow & AI Auto-Pilot

### 4.1 Level Structure (Locked)
- **Area 1:** One room. 4 Glimmers. Handgun pickup. Button + door to Area 2.
- **Area 2:** Five rooms connected by open doorways. 22 enemies total. Shotgun pickup in Room 4. ONE Prism in Room 4 — kill drops Astral Key.
- **Area 3:** Boss room. Void Beam pickup in entry corridor. Single Ego Boss. Light Well in center.

### 4.2 Weapon Progression (Locked)
1. **Start:** Player has Fist only
2. **Area 1:** Handgun pickup on floor near spawn point (player picks it up almost immediately)
3. **Area 2 Room 4:** Shotgun pickup
4. **Area 3 entry corridor:** Void Beam pickup (before entering boss room proper)

- Weapons are floor pickups (tile type 8). Walk over to collect. Cannot be missed — they're on the critical path.
- Weapon switch: `1` = Fist, `2` = Handgun (if collected), `3` = Shotgun (if collected). Void Beam auto-equips and replaces weapon slot 3 display.
- AI will pick up weapons automatically (walks over them on its route).

### 4.3 AI / Player Control (Locked)
- **Player can always control:** WASD, mouse look, shoot (click), interact (E), weapon switch (1-2-3).
- **When player idle 5 seconds:** AI takes over — movement, aiming, shooting, interactions.
- **Any input resumes player control.** Timer resets on ANY keypress, mouse move, or mouse click.
- **AI indicator:** "AUTO" label pulses on HUD when AI is controlling.
- **Goal:** AI can complete the entire level autonomously; player may choose to explore/control or let AI finish.

### 4.4 AI Waypoint Navigation (Locked)
Naive `atan2` → walk forward will hit walls in a multi-room level. Solution: **waypoints.**

- Each room has a **center waypoint**. Each doorway has a **doorway waypoint**.
- Waypoints form a **graph** (array of nodes with connections): `[{id, x, y, roomId, connections: [id, ...]}, ...]`
- AI follows the shortest **waypoint path** (BFS on waypoint graph) to reach the target room, then uses `atan2` to approach the specific target within that room.
- **Within a room:** AI uses `atan2(dy, dx)` to aim at nearest enemy, pickup, or trigger; moves forward.
- **Between rooms:** AI follows waypoint path (room center → doorway → next room center → ...).
- **Obstacle avoidance:** If forward is blocked (wall collision), strafe left or right for 10–20 frames, then retry. Simple but effective in corridor-connected rooms.
- **Stuck detection:** If AI hasn't moved more than 0.5 tiles in 3 seconds, pick a random strafe direction for 1 second.

### 4.5 Auto-Explore Logic
1. **Target selection priority:**
   - If weapon pickup in current room and not yet collected → pick up weapon
   - If enemies alive in current room → target nearest enemy
   - If Area 1 cleared and button not pressed → target button (E to interact)
   - If button pressed and door closed → target door (walk through)
   - If in Area 2 → clear rooms in order (1→2→3→4→5), entering each and killing all enemies
   - If Prism dead and key on floor → walk to key (auto-collect on proximity)
   - If has key → target key door (E to interact)
   - If entering Area 3 → pick up Void Beam (walk over) → enter boss room
   - If boss room → navigate to Light Well → fire Void Beam at boss
2. **Movement:** BFS on waypoint graph for room-to-room; `atan2` for within-room targeting
3. **Interactions:** AI "presses E" when within 2 tiles and ±30° of: Button (Area 1 cleared), Key Door (has key), Secret Wall (optional — low priority)
4. **Combat:** AI aims at nearest enemy, fires current best weapon. Prefers shotgun at close range, handgun at long range. Uses Void Beam in boss room.
5. **Weapon switching:** AI auto-selects best weapon: Fist if only weapon; Handgun for ranged; Shotgun if enemy < 5 tiles; Void Beam in boss room.

### 4.6 Triggers & Progression Gates
- **Button (Area 1):** Only interactable when ALL enemies in Area 1 are dead. Press E → opens door to Area 2.
- **Door to Area 2 (type 2):** Locked until button pressed. Animated open.
- **Area 2 doorways:** Always open (walk through freely).
- **Key Door (Area 2 → 3, type 5):** Only interactable when `hasAstralKey === true`. Press E → animated open.
- **Secret Wall (type 4):** Press E within range → wall becomes empty (type 0) + displays "YOU FOUND ME" message for 3 seconds. One in level (hidden in Area 2 somewhere).
- **Light Well (type 6):** Standing on this tile enables damage to boss. Visual cue: floor glows brighter when player is on it.
- **Weapon pickups (type 8):** Auto-collect on walk-over. No E press needed.

---

## Phase 5: Final Encounter (The Ego Boss)

### 5.1 Setup
- Void Beam pickup in corridor between Area 2 and boss room
- On entering boss room: `bossActive = true`
- Room label: "THE EGO"
- Boss is **invulnerable** unless player stands on Light Well (tile type 6)

### 5.2 Boss Behavior (Locked)
- **Single phase** — no multi-stage gimmicks
- **Movement:** Orbits the room center at ~1.5 tiles/sec
- **Attacks:** Fires slow projectile (~2 tiles/sec) toward player every 2–3 seconds (visual-only distortion since no player HP)
- **HP:** 150 — only Void Beam damages (10 dmg × 3/sec = ~5 seconds continuous fire)
- **Visual:** Large pulsing mass with tendrils (see 3.1 visual design)

### 5.3 AI Strategy for Boss
1. `if (bossActive)` → equip Void Beam if not equipped
2. Navigate to Light Well (room center — simple)
3. When on Light Well → aim at boss → fire Void Beam continuously
4. If moved off Light Well (e.g. by strafe), re-navigate
5. Repeat until boss HP ≤ 0

### 5.4 Victory Sequence
1. Boss death animation: tendrils retract → body implodes → held 0.5s
2. **Fade to white** over 1 second (canvas overlay alpha lerp)
3. Display "YOU ESCAPED YOUR MOOD" centered text (large, fading in)
4. "SPIRITS VANQUISHED: 23/23" below
5. Return-to-menu button after 3 seconds, or auto-redirect after 10 seconds

---

## Phase 6: Systems

### 6.1 Player (Locked — Easy Mode)
- **No player HP.** Player cannot die.
- **No Aura/saturation system** for now.
- First goal: get AI to succeed; player immortality keeps focus on mechanics.

### 6.2 Weapons (Locked)

| Weapon | Damage | Range | Fire Rate | Mechanic | Visual |
|--------|--------|-------|-----------|----------|--------|
| **Fist** | 2 | 1.5 tiles | 3/sec | Melee — instant hit check in range | Arm swings from side. Draw: arc + rectangle, animate X offset |
| **Handgun** | 5 | Hitscan (∞) | 2/sec | Hitscan — ray from center, first enemy hit | Small rectangle + barrel. Muzzle flash: bright circle for 2 frames |
| **Shotgun** | 15 | 6 tiles | 1/sec | 12 rays in ±10° cone, each does 1–2 dmg; total ~15 if close | Wider rectangle + barrel. Large muzzle flash. Screen shake. |
| **Void Beam** | 10 | Hitscan (∞) | 3/sec | Hitscan — continuous beam visual | Glowing line from weapon to target. Hum sound loops while firing. |

- **Weapon switch:** `1` = Fist, `2` = Handgun, `3` = Shotgun / Void Beam
- **Ammo:** Infinite (first pass)
- **Weapon bob:** `Math.sin(walkCycle * 6) * 3` px vertical offset when moving
- **Weapon rendering:** Bottom-center of screen. Each weapon drawn with canvas primitives:
  - Fist: Skin-toned arc (knuckles) + rectangle (arm). Punch animation: translate forward + rotate.
  - Handgun: Dark rectangle body + small barrel. Muzzle flash: bright yellow circle at barrel tip for 50ms.
  - Shotgun: Longer dark rectangle + wide barrel. Muzzle flash: larger, with 3–4 pellet trail lines.
  - Void Beam: Glowing orb at center-bottom. When firing, draw bright line from orb to center of screen extending to hit point.

### 6.3 Projectile System
- **Projectiles** are world entities with `(x, y, angle, speed, owner)`.
- Move each frame: `x += cos(angle) * speed * dt`, `y += sin(angle) * speed * dt`
- **Wall collision:** Check grid cell at projectile position; if solid → destroy projectile.
- **Player collision:** If within 0.5 tiles of player → trigger visual distortion, destroy projectile.
- **Phantom projectile:** Speed 2 tiles/sec. Visual: glowing circle (radius ~0.15 tiles) with 3-frame trail.
- **Boss projectile:** Speed 2 tiles/sec. Visual: larger glowing circle (radius ~0.25 tiles), different color (gold/red).
- **Prism projectile:** Same as Phantom but fires 3 in a ±15° spread.
- Projectiles rendered as billboarded sprites (same system as enemies).

### 6.4 Enemy HP Reference

| Enemy | HP | Fist Hits | Handgun Hits | Shotgun Hits |
|-------|-----|-----------|--------------|--------------|
| Glimmer | 5 | 3 | 1 | 1 |
| Phantom | 20 | 10 | 4 | 2 |
| Prism | 30 | 15 | 6 | 2 |
| **Boss** | **150** | — | — | — |

Boss can only be damaged by Void Beam (10 dmg × 3/sec = ~5 seconds continuous fire to kill).

### 6.5 Damage & Feedback
- **Hitscan weapons:** On fire, cast ray from player center. First enemy intersected within range takes damage.
- **Shotgun:** Cast 12 rays within ±10° cone. Each ray that hits an enemy within 6 tiles does ~1.25 damage (total ~15 if all hit).
- **Fist:** Check if any enemy within 1.5 tiles and ±30° of facing.
- **Screen shake:** On enemy hit, offset canvas draw by random ±2px for 3 frames.
- **Enemy hit flash:** Tint enemy sprite white for 1 frame on damage.
- **Phantom distortion:** If Phantom/Prism/Boss projectile hits player — hue shift + brief blur for 0.5s (visual only).
- **Door opening:** Wall height lerps from full to 0 over 0.3 seconds (smooth reveal).

### 6.6 Audio (Locked)
- **All original, programmatically generated:** Web Audio API
- **Music:** Procedural ambient drone — low sine oscillator (60–80 Hz) + filtered white noise, slow LFO on filter cutoff. Starts on first interaction (browser autoplay policy).
- **SFX:** Oscillators, noise bursts, ADSR envelopes — no external audio files

**Sound List:**

| Sound | Technique |
|-------|-----------|
| Fist swing | Short noise burst, 100ms, bandpass 500Hz |
| Fist impact | Low thud: sine 80Hz, 50ms decay |
| Handgun shot | Noise burst 50ms + sine 400Hz→100Hz sweep 80ms |
| Shotgun blast | Longer noise burst 150ms, low-pass filter, louder |
| Void Beam hum | Continuous sine 200Hz + 201Hz (beat frequency), volume envelope while firing |
| Enemy hit | Short click: 1ms noise burst |
| Enemy death | Descending sine sweep 400Hz→50Hz over 300ms |
| Door open | Rising sine sweep 100Hz→300Hz over 300ms |
| Button press | Two-tone beep: 440Hz 50ms → 880Hz 50ms |
| Key pickup | Ascending arpeggio: 3 sine tones 50ms each (C-E-G) |
| Boss projectile | Low wobble: sine 100Hz with 5Hz LFO on pitch, 200ms |
| Boss death | Long descending sweep 500Hz→20Hz over 2s + noise fade |
| Secret found | Reversed/ascending chime: 3 tones (C-E-G-C) 100ms each |

---

## Decisions Locked (v3)

| # | Decision |
|---|----------|
| 1 | **Level layout:** Area 1 = 1 room (4 enemies); Area 2 = 5 rooms (22 enemies); Area 3 = boss room |
| 2 | **Playtime:** 5–15 min |
| 3 | **AI idle timer:** 5 seconds no input → AI takes over; any input resumes player control |
| 4 | **AI navigation:** Waypoint graph (BFS) between rooms; atan2 within rooms; stuck detection |
| 5 | **Secret:** One secret wall, E to interact (2 tiles, ±30°), reveals "YOU FOUND ME" |
| 6 | **Hue:** Full hue-shifting (constant psychedelic drift on canvas wrapper) |
| 7 | **Audio:** All procedural — Web Audio API, no external files |
| 8 | **Third Eye:** Organic — waves, curves (no sharp geometry), decorative only |
| 9 | **Weapons:** Fist (2 dmg), Handgun (5 dmg), Shotgun (15 dmg / 12 pellets), Void Beam (10 dmg, boss only) |
| 10 | **Difficulty:** Easy — no player HP, player cannot die; enemies have HP |
| 11 | **Boss:** Single phase, orbits room, 150 HP, Void Beam only, Light Well mechanic |
| 12 | **HUD:** Crosshair, kill counter, room label, key flash, weapon indicator, AI indicator, controls overlay, minimap |
| 13 | **Room transitions:** Open doorways, animated door open (0.3s lerp) |
| 14 | **Enemy counts:** 15 Glimmers, 6 Phantoms, 1 Prism, 1 Boss = 23 total |
| 15 | **Victory:** Boss death anim → fade to white → "YOU ESCAPED YOUR MOOD" |
| 16 | **Pointer Lock:** Required for mouse look. Escape opens pause menu, unlocks pointer. |
| 17 | **Resolution:** 400×300 internal, 800×600 display, `image-rendering: pixelated` |
| 18 | **Visuals:** All programmatic canvas shapes — unique per entity type, no image assets |
| 19 | **Weapon rendering:** Bottom-center FPS style, unique per weapon, canvas-drawn |
| 20 | **Weapon progression:** Fist (start) → Handgun (Area 1) → Shotgun (Area 2 R4) → Void Beam (Area 3 entry) |
| 21 | **Collision:** Player/enemies vs walls (circle vs grid, slide). No player-enemy or enemy-enemy collision. Projectiles destroyed on wall hit. |
| 22 | **Interaction range:** 2 tiles distance + ±30° facing |
| 23 | **Architecture:** Modular multi-file JS (one file per system). HTML + CSS + JS only. No frameworks. |
| 24 | **Projectiles:** World entities, travel at 2 tiles/sec, wall collision, billboarded sprites |
| 25 | **Room detection:** Rectangular bounds per room; drives HUD label + AI targeting |

---

## Architecture (Engine Systems)

This is a small game engine. Each system is its own JS module. Systems communicate through a shared game state object.

```
demoscenes/MOOD/
├── index.html              Entry point, loads CSS + JS, contains canvas + HUD markup
├── css/
│   └── mood.css            HUD layout, overlays, pause menu, hue-rotate filter
└── js/
    ├── main.js             Game loop, init, state management, pause/resume
    ├── config.js           Constants: resolution, speeds, tile types, weapon stats, enemy stats
    ├── input.js            Keyboard + mouse state, pointer lock management, idle timer
    ├── map.js              Map grid data, room definitions, tile lookup, door state
    ├── raycaster.js        DDA raycasting, wall rendering, z-buffer generation
    ├── player.js           Player state, movement, collision, weapon switching
    ├── entities.js         Entity base: spawn, update, death. Enemy types as sub-modules:
    │   (or split further)    - Glimmer behavior
    │                         - Phantom behavior
    │                         - Prism behavior
    │                         - Boss behavior
    ├── sprites.js          Sprite projection, sorting, billboarding, draw dispatch
    ├── combat.js           Hitscan, shotgun spread, fist range check, damage application
    ├── projectiles.js      Projectile spawning, movement, wall/player collision
    ├── pickups.js          Weapon pickup definitions, collection logic
    ├── triggers.js         Button, doors, key door, secret wall, Light Well — state + interaction
    ├── ai.js               Auto-pilot: idle timer, waypoint BFS, target selection, combat AI
    ├── hud.js              HUD rendering: crosshair, kill counter, room label, weapon, minimap, Third Eye
    ├── audio.js            Web Audio: procedural music + all SFX functions
    ├── effects.js          Screen shake, hue distortion, fade-to-white, hit flash
    └── renderer.js         Orchestrates per-frame draw: clear → raycaster → sprites → weapon → HUD → effects
```

### Shared Game State
A single `state` object passed through systems each frame:
```js
const state = {
  player: { x, y, angle, fov, weapons: [], currentWeapon, hasAstralKey, ... },
  entities: [ { type, x, y, hp, roomId, behavior, ... }, ... ],
  projectiles: [ { x, y, angle, speed, owner, ... }, ... ],
  map: { grid: [][], doors: {}, rooms: [], waypoints: [] },
  pickups: [ { type, x, y, collected, ... }, ... ],
  hud: { killCount, totalEnemies, currentRoomLabel, messages: [], ... },
  ai: { active, idleTimer, currentTarget, waypointPath: [], ... },
  time: { now, dt, elapsed },
  flags: { paused, bossActive, victoryTriggered, secretFound, ... }
};
```

### Game Loop
```
each frame:
  1. input.update(state)         — read keys/mouse, update idle timer, check pause
  2. if (paused) return
  3. ai.update(state)            — if idle > 5s, generate input commands
  4. player.update(state)        — move, collide, weapon bob
  5. entities.update(state)      — enemy AI, movement, attacks
  6. projectiles.update(state)   — move projectiles, check collisions
  7. pickups.update(state)       — check player proximity for collection
  8. triggers.update(state)      — check button/door/key states
  9. combat.update(state)        — process any pending hits (hitscan resolved here)
  10. effects.update(state)      — tick screen shake, distortion timers
  11. renderer.draw(state)       — raycaster → sprites → weapon → hud → effects
  12. audio.update(state)        — trigger/stop sounds based on state changes
```

---

## Implementation Order (Locked — Playable Loop First)

| Phase | Task | Depends On | Est. Complexity |
|-------|------|------------|-----------------|
| 1 | `index.html` + `mood.css` + `main.js` + `config.js` — scaffold, canvas, game loop shell | — | Small |
| 2 | `input.js` — WASD + pointer lock + mouse look + pause/escape menu | Phase 1 | Small |
| 3 | `map.js` — hardcoded Area 1 grid + room definition | — | Small |
| 4 | `raycaster.js` + `renderer.js` — DDA, wall drawing, z-buffer, distance fog | Phase 1, 3 | **Large** |
| 5 | `player.js` — movement, collision (circle vs grid, wall sliding) | Phase 2, 3, 4 | Medium |
| 6 | `hud.js` — crosshair + minimap + room label | Phase 4, 5 | Small |
| 7 | `entities.js` + `sprites.js` — Glimmer spawn, billboard rendering | Phase 4 | Medium |
| 8 | `combat.js` — Handgun hitscan + Glimmer damage + death | Phase 5, 7 | Medium |
| 9 | `pickups.js` — Handgun pickup in Area 1 | Phase 5 | Small |
| **Milestone A** | **Playable loop: walk, shoot Glimmers with handgun, minimap** | | |
| 10 | `triggers.js` — Button + door animation + gate logic (Area 1 → 2) | Phase 5, 8 | Medium |
| 11 | `map.js` expand — Full Area 2 grid (5 rooms + doorways) | Phase 3 | Medium |
| 12 | `entities.js` expand — Phantom + Prism behaviors, projectile attacks | Phase 7 | Medium |
| 13 | `projectiles.js` — Phantom/Prism projectile system | Phase 12 | Medium |
| 14 | Shotgun + Fist weapons in `combat.js` + weapon switching in `player.js` | Phase 8 | Medium |
| 15 | Prism key drop + key door + secret wall in `triggers.js` | Phase 10, 12 | Small |
| **Milestone B** | **Full Area 1 + Area 2 playable with all enemies and weapons** | | |
| 16 | `map.js` expand — Area 3 (boss room + Light Well + entry corridor) | Phase 11 | Small |
| 17 | Boss entity + Void Beam weapon + Light Well mechanic | Phase 12, 14, 16 | **Large** |
| 18 | Victory sequence in `effects.js` | Phase 17 | Small |
| **Milestone C** | **Complete game playable by hand (no AI)** | | |
| 19 | `ai.js` — idle timer + waypoint graph + BFS + target selection | Phase 5, 10, 15 | **Large** |
| 20 | AI combat: aim, fire, weapon switch | Phase 19, 14 | Medium |
| 21 | AI interactions: button, doors, key pickup, secret wall | Phase 19, 15 | Medium |
| 22 | AI boss strategy: Light Well + Void Beam | Phase 19, 17 | Small |
| **Milestone D** | **AI can complete entire game autonomously** | | |
| 23 | `audio.js` — procedural music + all SFX | — (can start anytime) | **Large** |
| 24 | `effects.js` expand — screen shake, Phantom distortion, hit flash | Phase 8 | Small |
| 25 | `hud.js` polish — Third Eye, kill counter, key flash, AI indicator, weapon indicator, controls overlay | Phase 6 | Medium |
| 26 | Final polish — breathing walls, weapon bob tuning, victory stats | All | Small |
| **Milestone E** | **Complete, polished game** | | |

**Rationale:** Milestones A–C give a fully hand-playable game first. AI (Milestone D) is wired on top of working systems — much easier to debug. Audio and polish (Milestone E) are independent and can be done in parallel.

---

## File Structure (Locked)

```
demoscenes/MOOD/
├── index.html
├── mood.md                 (this document)
├── css/
│   └── mood.css
└── js/
    ├── main.js
    ├── config.js
    ├── input.js
    ├── map.js
    ├── raycaster.js
    ├── player.js
    ├── entities.js
    ├── sprites.js
    ├── combat.js
    ├── projectiles.js
    ├── pickups.js
    ├── triggers.js
    ├── ai.js
    ├── hud.js
    ├── audio.js
    ├── effects.js
    └── renderer.js
```

17 JS files. Each is a focused module with clear responsibility. No file should exceed ~300–400 lines.

---

## Revision Log

| Date | Change |
|------|--------|
| (initial) | Draft from concept; questions added |
| v1 | Locked decisions: level layout, 5s AI delay, 3 weapons, no player HP, secret wall, full hue, procedural audio |
| v2 | Added: concrete HP/damage numbers, enemy counts per room, boss behavior locked, AI waypoint navigation, minimap, crosshair, weapon bob, kill counter, key flash, door animation, controls overlay, room layout specs, victory screen, revised implementation order |
| v3 | Major update: Pointer Lock + pause menu, all-programmatic entity visuals (detailed per type), FPS weapon rendering (bottom-center, unique per weapon), projectile system spec, room detection (rectangular bounds), collision system (circle vs grid, slide, no entity-entity), weapon progression (pickup system: Fist→Handgun→Shotgun→Void Beam), modular multi-file architecture (17 JS modules), 400×300 internal / 800×600 display resolution, interaction range (2 tiles ±30°), full architecture diagram with shared state + game loop, phased implementation order with milestones and dependency tracking, detailed sound design table |
