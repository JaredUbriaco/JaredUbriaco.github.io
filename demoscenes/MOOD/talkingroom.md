# MOOD — Architectural Deliberation

*Internal planning discussion before breaking into task files.*

---

## The Big Picture

We're building a DOOM-style raycasting FPS in vanilla JavaScript (ES modules) with a vaporwave/psychedelic aesthetic. No frameworks, no bundlers, no image assets — everything is programmatic. The game runs on a `<canvas>` at 400x300 internal resolution, upscaled to 800x600 with pixelated rendering. 17 JS module files, each under ~300-400 lines.

The design doc (`mood.md`) is already incredibly thorough — 32 locked decisions, a full architecture diagram, shared state spec, game loop order, and a phased implementation plan with milestones. Our job is to validate that plan, identify risks, and break it into granular, actionable tasks.

---

## Key Architectural Decisions to Validate

### 1. Module System: ES Modules vs. IIFE

The existing RTS game in `rts/` uses IIFEs and global functions. MOOD specifies ES modules (`import`/`export` with `<script type="module">`). This is the right call:

- **ES modules give us a real dependency graph.** Each of the 17 files imports only what it needs.
- **No global namespace pollution.** The RTS already has issues with everything being on `window`.
- **Tree of imports makes the build order clear.** If `raycaster.js` imports from `config.js` and `map.js`, we know those must exist first.
- **No bundler needed.** Modern browsers handle `<script type="module">` natively. The only gotcha is that modules require a server (no `file://` protocol) — but GitHub Pages serves files over HTTP, so no issue.

**Decision: Confirmed. ES modules.**

### 2. Shared State Object: Single Source of Truth

The design calls for one `state` object passed through all systems each frame. This is the right pattern for a game this size:

```
state.player     — position, angle, pitch, weapons, walkCycle
state.entities   — all enemies (array of objects)
state.projectiles — active projectiles
state.map        — grid, rooms, doors, waypoints
state.pickups    — weapon pickups
state.hud        — kill counter, messages, room label
state.ai         — auto-pilot state
state.time       — dt, now, elapsed
state.flags      — paused, bossActive, victoryTriggered, etc.
```

Each module gets the full state but only reads/writes its own domain. This is simple, debuggable, and fast. No event system, no pub/sub — just direct state mutation in a defined order.

**Risk:** State coupling — if modules start reaching into each other's domains (e.g., `entities.js` directly modifying `state.hud`), it gets messy. Mitigation: each module exposes `update(state)` and only touches its own slice. Cross-cutting concerns (like "enemy dies → increment kill counter") happen through flags or return values, resolved in the game loop.

**Decision: Confirmed. Single state object.**

### 3. Game Loop Order — The 12-Step Frame

```
1. input.update(state)       — read keys/mouse, idle timer, pause check
2. if (paused) return
3. ai.update(state)          — generate synthetic input if idle > 5s
4. player.update(state)      — move, collide, weapon bob, weapon state
5. entities.update(state)    — enemy AI, movement, attacks
6. projectiles.update(state) — move, collisions
7. pickups.update(state)     — proximity collection
8. triggers.update(state)    — button/door/key state
9. combat.update(state)      — resolve pending hits
10. effects.update(state)    — tick timers (shake, distortion)
11. renderer.draw(state)     — raycaster → sprites → weapon → hud → effects
12. audio.update(state)      — trigger/stop sounds
```

This is clean. A few notes:

- **Combat (step 9) happens AFTER entities (step 5).** This means when the player fires a hitscan weapon, the hit is resolved in the same frame but after enemies have moved. That's fine — one frame of latency is imperceptible.
- **AI (step 3) happens BEFORE player (step 4).** This means the AI's synthetic inputs are written to the same input state that `player.update` reads. Clean.
- **Triggers (step 8) happen AFTER pickups (step 7).** So if you pick up a key and walk to the key door in the same frame, the door check runs after the key is collected. Good.

**One concern:** The renderer (step 11) is a monolith — it must call the raycaster, then sprite rendering, then weapon drawing, then HUD, then post-effects. Internally, `renderer.js` orchestrates sub-calls. It should NOT do all the drawing itself — it dispatches to `raycaster.js`, `sprites.js`, `hud.js`, and `effects.js`.

**Decision: Confirmed. The loop order is correct. Renderer orchestrates, doesn't implement.**

### 4. The Raycaster — The Biggest Single System

The DDA raycaster is the most complex individual piece. It must:
- Cast 400 rays (one per column at internal resolution)
- Handle 10 tile types (walls, doors, outdoor, stairs, etc.)
- Produce a z-buffer for sprite clipping
- Handle y-shearing for vertical mouselook
- Render ceiling (indoor vs. skybox), wall strips, and floor per column
- Animate doors (wall height lerp)
- Apply distance fog and breathing wall modulation

**Build strategy:** Start with the simplest possible raycaster:
1. Basic DDA against a small test grid (just walls and empty)
2. Render wall strips only — no floor, no ceiling
3. Add fish-eye correction
4. Add floor and ceiling (solid colors)
5. Add distance fog
6. Add y-shearing (pitch offset)
7. Add door tiles (animated)
8. Add skybox (outdoor tiles)
9. Add breathing walls
10. Build z-buffer alongside

This is ~200-250 lines. It's the system that MUST work before anything else is visually testable.

### 5. Map Design — Hardcoded vs. Generated

The design says ~80x80 grid, maze-like, with specific rooms (Area 0, Area 1, Area 2 with 5 sub-rooms, Area 3). It explicitly names rooms with sizes and geometries.

**This should be hardcoded.** Procedural generation would:
- Add enormous complexity for a game that's 5-15 minutes long
- Make it impossible to hand-tune room flow, enemy placement, and progression gates
- Contradict the locked room layout in the design doc

**However**, the 80x80 grid is ~6,400 cells. Writing that as a 2D array literal is painful. Strategy:
- Define the grid programmatically in `map.js` using helper functions: `fillRect(grid, x, y, w, h, tileType)`, `drawHallway(grid, from, to, width)`
- Start with Area 0 + Area 1 (small). Expand later.
- Room metadata (roomId per tile) stored as a parallel grid or sparse lookup.

### 6. Entity System — Flat Array vs. Type Classes

The design says entities are objects in a flat array with a `type` field. Enemy-specific behavior is either in sub-modules or switch-cased.

**Recommendation: Factory functions + strategy pattern.**
```js
// entities.js
export function createGlimmer(x, y, roomId) { ... }
export function createPhantom(x, y, roomId) { ... }

// Each entity has { type, x, y, hp, state, update(entity, state, dt), draw(ctx, ...) }
```

The `update` and `draw` methods are assigned at creation time from type-specific behavior modules. This avoids a giant switch statement and keeps each enemy type's logic self-contained.

If `entities.js` gets too big (4 enemy types + pickups), split into:
- `entities.js` — base: spawn, death, array management
- `enemies/glimmer.js`, `enemies/phantom.js`, `enemies/prism.js`, `enemies/boss.js`

But start with a single file. Split only if it crosses ~350 lines.

### 7. Sprite Rendering — When to Build It

Sprites (billboarded entities drawn in 3D space) depend on:
- A working raycaster (need z-buffer for clipping)
- Entity positions in world space
- Camera projection math (screen X/Y from world position)

Sprites should be built RIGHT AFTER the raycaster works, even before combat. Being able to see entities in the 3D view is critical for testing everything that follows.

### 8. Combat System — Hitscan is Simple

Hitscan weapons (Handgun, Void Beam) cast a single ray from the player. Shotgun casts 12 rays in a cone. Fist is a range check.

**Key insight:** Combat resolution reuses the raycaster's DDA algorithm but against entities, not just the grid. We can:
1. For hitscan: cast a ray at the player's facing angle, check intersection with enemy bounding circles (sorted by distance)
2. For shotgun: cast 12 rays with angular spread
3. For fist: iterate nearby entities, check distance + angle

This means `combat.js` should import from `raycaster.js` (or share the ray-casting function).

### 9. AI — Build Last, Wire First

The AI auto-pilot is the most complex behavioral system (waypoint BFS, target selection, idle timer, combat strategy). It should be built LAST because:
- It needs every other system working (movement, combat, doors, triggers, weapons)
- It's a consumer, not a producer — it generates synthetic inputs
- The game must be fully playable by hand before AI is added

**But** the idle timer and AI activation hook should be wired into `input.js` from the start:
```js
// input.js
let idleTimer = 0;
export function isAIActive() { return idleTimer > 5.0; }
```

This way, when we build `ai.js` later, the activation mechanism is already in place.

### 10. Audio — Fully Independent

All audio is procedural (Web Audio API). No external files. This is completely independent of every other system and can be built in parallel at any point.

**Strategy:** Build audio last (after the game works silently), OR assign it as a parallel task. Each sound is a self-contained function:
```js
export function playHandgunShot() { /* oscillator + noise burst */ }
export function playDoorOpen() { /* rising sweep */ }
```

These functions are called from the game loop's step 12 (`audio.update`).

---

## Build Order Analysis

The design doc's implementation order (Phases 1-29, Milestones A-F) is well-structured. After analysis, I'd make these adjustments:

### Validated Order (with granular sub-tasks)

**Foundation Layer (must exist before anything visual):**
1. `index.html` + `mood.css` — canvas element, HUD skeleton, hue-rotate wrapper
2. `config.js` — all constants (resolution, speeds, tile types, weapon stats, enemy stats)
3. `main.js` — game loop shell (requestAnimationFrame, variable dt with cap)
4. `input.js` — keyboard state, mouse state, pointer lock, pause/escape

**Core Engine (must exist before the game is testable):**
5. `map.js` — Area 0 + Area 1 grid definition, tile lookup, room metadata
6. `raycaster.js` — DDA algorithm, wall rendering, z-buffer
7. `renderer.js` — orchestration: clear canvas, call raycaster, (later) sprites, HUD, effects

**Playable Navigation (Milestone A):**
8. `player.js` — WASD movement, mouse look (yaw + pitch), collision, wall sliding
9. `hud.js` — crosshair, minimap, room label (basics)
10. `triggers.js` — door opening (E key), closed-door collision
11. `pickups.js` — handgun entity in Area 0, proximity collection

**Combat Loop (Milestone B):**
12. `entities.js` — Glimmer: spawn, idle patrol, billboard data
13. `sprites.js` — sprite projection, sorting, z-buffer clipping, draw dispatch
14. Aggro system in `entities.js` — idle → aggro on damage
15. `combat.js` — handgun hitscan, damage application, death
16. Weapon animation (handgun 3-phase) in renderer

**Level Expansion (Milestone C):**
17. Full map: Area 2 (5 rooms + hallways + internal walls)
18. Button + locked door gate (Area 1 → 2)
19. Phantom entity (patrol, strafe, retreat, projectile attack)
20. `projectiles.js` — projectile movement, wall/player collision
21. Prism entity (patrol, spread shot, key drop)
22. Fist + Shotgun weapons + weapon switching
23. Prism key drop + key door + secret wall

**Boss Fight (Milestone D):**
24. Area 3 map (boss corridor, boss room, Light Well)
25. Void Beam weapon
26. Boss entity (always aggro, orbit, projectiles, invulnerability/Light Well)
27. Victory sequence (fade to white, message)

**AI Auto-Pilot (Milestone E):**
28. Waypoint graph definition
29. BFS pathfinding
30. Idle timer → AI activation
31. Target selection priority
32. AI combat (aim, fire, weapon switch)
33. AI door/button interaction
34. Boss strategy (navigate to Light Well, equip Void Beam)
35. Stuck detection + full playthrough testing

**Polish (Milestone F):**
36. `audio.js` — ambient drone + all 13 SFX
37. `effects.js` — screen shake, Phantom distortion, hit flash, breathing walls
38. `hud.js` polish — Third Eye, kill counter, key flash, AI indicator, weapon indicator
39. Final tuning — weapon bob, victory stats, skybox, stair visuals

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Raycaster bugs (fish-eye, edge cases at grid boundaries) | Blocks ALL visual testing | Build incrementally; test with a tiny 10x10 map first |
| Door animation + raycaster interaction | Doors that don't render correctly during open animation | Handle door height in raycaster as a special case from day one |
| Y-shearing distortion at extreme pitch | Visual glitch that's hard to debug | Clamp pitch aggressively (±0.7 rad); test early |
| Sprite clipping behind walls | Enemies visible through walls | Z-buffer must be per-column and sprites must be clipped per-column strip |
| AI pathfinding in complex maze | AI gets stuck in corners/doorways | Stuck detection + random strafe escape; test in each room individually |
| 80x80 map authoring | Tedious, error-prone | Use helper functions to build rooms; validate with minimap visualization |
| Performance with 30 entities + 400 ray columns | Frame drops | Profile early; entity cap is already set at ~30; raycasting 400 columns is trivial |
| ES module loading order | Circular dependencies | Keep imports one-directional; config → map → raycaster → renderer; no cycles |

---

## Module Dependency Graph

```
config.js          ← imported by everything (constants only, no side effects)
    ↓
map.js             ← imports config (tile types, map dimensions)
    ↓
input.js           ← imports config (key bindings, sensitivity)
    ↓
raycaster.js       ← imports config, map
    ↓
player.js          ← imports config, input, map (collision)
    ↓
entities.js        ← imports config, map (collision, room tracking)
    ↓
sprites.js         ← imports config (projection math)
    ↓
combat.js          ← imports config, entities (damage application)
    ↓
projectiles.js     ← imports config, map (wall collision), entities (hit detection)
    ↓
pickups.js         ← imports config (pickup definitions)
    ↓
triggers.js        ← imports config, map (door state), input (E key)
    ↓
ai.js              ← imports config, map, entities, triggers, combat, player
    ↓
hud.js             ← imports config (HUD layout)
    ↓
audio.js           ← imports config (standalone, no game imports)
    ↓
effects.js         ← imports config (timer durations)
    ↓
renderer.js        ← imports raycaster, sprites, hud, effects, player (weapon draw)
    ↓
main.js            ← imports EVERYTHING; orchestrates the game loop
```

**Critical path:** `config.js` → `map.js` → `raycaster.js` → `renderer.js` → `main.js`. This is what we build first.

---

## Questions for the Human

Before proceeding to implementation, we need answers on:

1. **Map authoring approach:** Should we hand-code the 80x80 grid using programmatic helper functions (e.g., `fillRoom(grid, x, y, w, h)`), or write the grid as a literal array? Helper functions are recommended for maintainability.

2. **Starting scope:** Should the first playable build include ONLY Area 0 + Area 1 (as mood.md suggests), or should we stub all 4 areas from the start with placeholder geometry?

3. **Testing strategy:** Do you want a debug overlay (toggle with a key) that shows: player coordinates, FPS counter, current room, entity states? This is easy to add early and invaluable for development.

4. **The existing demoscenes/index.html** is a placeholder ("Coming soon"). When should MOOD be linked from that page — after Milestone A, or only when fully complete?

5. **AI priority:** The design says AI is Milestone E (built last, after the game is hand-playable). Are you okay with this, or should AI scaffolding be woven in earlier?

6. **File size discipline:** The design says each module should be under ~300-400 lines. If a module naturally exceeds that (e.g., `entities.js` with 4 enemy types), should we split into sub-files immediately, or allow it to grow and refactor later?

---

## Consensus

The architecture in mood.md is sound. The build order is correct: scaffold → engine → navigation → combat → content → boss → AI → polish. The ES module approach with a shared state object is clean and appropriate for 17 files. The raycaster is the critical path — everything else is blocked until we can render walls.

**Proceed to task files.**
