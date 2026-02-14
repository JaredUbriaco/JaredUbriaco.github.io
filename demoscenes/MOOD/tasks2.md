# Tasks 2 — Core Engine: Map, Raycaster & Renderer

**Goal:** Render a 3D world the player can look at. Walls, floor, ceiling, fog, and a z-buffer for later sprite clipping. This is the hardest single system — the raycaster IS the engine.

**Milestone target:** Pre-Milestone A (engine core)

**Depends on:** Tasks 1 (config.js, main.js, canvas setup)

---

## Task 2.1: Create `js/map.js` — Area 0 + Area 1

**File:** `demoscenes/MOOD/js/map.js`

**Key decision:** `grid[row][col]` where row = y, col = x. All map functions use `(x, y)` API that internally maps to `grid[y][x]`. Be consistent everywhere.

- [ ] **Grid representation:** 2D array `grid[row][col]` using `TILE` enum from config
- [ ] **Start small:** Only Area 0 (~6×6) and Area 1 (~14×14) for now, embedded in a larger grid
  - Allocate a grid big enough for the full game (~80×80) but only carve these two rooms now
  - Fill entire grid with `TILE.WALL` initially
  - Carve rooms by setting cells to `TILE.EMPTY`
  - Place doors, button tile, etc.
- [ ] **Helper functions for map building:**
  ```js
  function fillRect(grid, x, y, w, h, tile) {
    for (let row = y; row < y + h; row++)
      for (let col = x; col < x + w; col++)
        grid[row][col] = tile;
  }
  function placeHallway(grid, x1, y1, x2, y2, width, tile) { ... }
  ```
- [ ] **Area 0 — AWAKENING (~6×6):**
  - Open room, all `TILE.EMPTY` (indoor)
  - One `TILE.DOOR` (type 2) on the wall connecting to Area 1
  - Player spawn position stored: `export const PLAYER_SPAWN = { x: ..., y: ..., angle: ... }`
  - Spawn position should be at the center of Area 0, facing the door
- [ ] **Area 1 — THE THRESHOLD (~14×14):**
  - Larger room with some internal walls/pillars for cover (2×2 pillar clusters)
  - `TILE.BUTTON` (type 9) on far wall
  - `TILE.DOOR_LOCKED_BUTTON` (type 3) on wall connecting to Area 2 (blocked for now)
- [ ] **Connecting hallway** between Area 0 and Area 1 (2–3 tiles wide)
- [ ] **Room metadata:** Parallel 2D array for `roomId` per tile
  ```js
  export const roomMeta = []; // same dimensions as grid, stores roomId string or null
  ```
  Corridor tiles store `null` — HUD won't display a label for them.
- [ ] **Room definitions:**
  ```js
  export const ROOMS = {
    area0: { id: 'area0', label: 'AREA 0 — AWAKENING' },
    area1: { id: 'area1', label: 'AREA 1 — THE THRESHOLD' },
    // ... more added in tasks5
  };
  ```
- [ ] **Door state tracking:**
  ```js
  export const doors = {}; // keyed by "x,y" (note: x first for consistency)
  // Each: { open: false, locked: false, lockType: null, openProgress: 0, opening: false }
  ```
  **Initialize door entries** for every door tile placed on the grid during map construction.
- [ ] **Exports:**
  - `grid` — the 2D tile array
  - `roomMeta` — per-tile room IDs
  - `ROOMS` — room label lookup
  - `doors` — door state map
  - `PLAYER_SPAWN` — start position
  - `getTile(x, y)` — safe grid lookup with bounds check (returns WALL for out-of-bounds)
  - `isSolid(x, y)` — returns true if tile is wall, closed door, or secret wall
  - `getMapWidth()`, `getMapHeight()`

**Edge cases:**
- `isSolid()` must check door state: a door tile with `openProgress >= 1` is NOT solid
- `getTile()` must handle fractional coords (floor them) and out-of-bounds (return WALL)
- Button tile (type 9) is NOT solid — it's a floor tile with special interaction

**Acceptance:** Map module exports a grid with two rooms, a hallway, and a door. `getTile()` and `isSolid()` work correctly with edge cases. Can be visualized via debug overlay or minimap later.

---

## Task 2.2: Create `js/raycaster.js` — DDA Core

**File:** `demoscenes/MOOD/js/raycaster.js`

This is the largest and most critical system. Build incrementally — test after EACH sub-task.

**Build order within 2.2:**
1. 2.2a: Cast rays, get distances (test: log distances to console)
2. 2.2b: Draw wall strips (test: see walls in 3D — the first visual milestone!)
3. 2.2c: Floor & ceiling (test: complete scene with no gaps)
4. 2.2d: Door rendering (test: doors look distinct from walls)
5. 2.2e: Breathing walls (test: subtle oscillation visible)
6. 2.2f: Z-buffer (test: values logged — sprite clipping verified in tasks4)

**If the raycaster doesn't work, NOTHING works.** Take extra time here.

### Sub-task 2.2a: Basic DDA Ray Casting

- [ ] **Function:** `castRay(originX, originY, angle, grid)` → `{ distance, wallType, hitSide, mapX, mapY }`
- [ ] **DDA algorithm:**
  1. Calculate ray direction: `dirX = cos(angle)`, `dirY = sin(angle)`
  2. Calculate step sizes: `deltaDistX = |1/dirX|`, `deltaDistY = |1/dirY|`
  3. Determine step direction and initial side distances
  4. Step through grid cells until a solid tile is hit
  5. Return perpendicular distance (fish-eye corrected), tile type, and which side was hit (N/S/E/W)
- [ ] **Fish-eye correction:** `correctedDist = rawDist * cos(rayAngle - playerAngle)`
- [ ] **Max steps:** Cap at ~80 steps to prevent infinite loops on open maps
- [ ] **Hit side:** Track whether we hit a vertical or horizontal grid line (for shading)

### Sub-task 2.2b: Wall Strip Rendering

- [ ] **Function:** `renderWalls(ctx, player, grid, zBuffer)`
- [ ] **For each column (0 to INTERNAL_WIDTH-1):**
  1. Calculate ray angle: `angle = player.angle - player.fov/2 + (col / INTERNAL_WIDTH) * player.fov`
  2. Cast ray → get distance, wallType, hitSide
  3. Calculate wall height: `wallHeight = (1 / correctedDist) * projectionPlane`
     - `projectionPlane = INTERNAL_WIDTH / (2 * tan(player.fov / 2))`
  4. Calculate y-shear offset: `horizonY = INTERNAL_HEIGHT / 2 + player.pitch * PITCH_SCALE`
  5. Wall strip top: `horizonY - wallHeight / 2`
  6. Wall strip bottom: `horizonY + wallHeight / 2`
  7. Draw wall strip as 1px-wide filled rectangle
  8. Store `zBuffer[col] = correctedDist`
- [ ] **Wall coloring:**
  - Base color from tile type (HSL, varies by type)
  - Darken one side (N/S vs E/W) for pseudo-lighting
  - Darken by distance: `brightness *= (1 / (1 + dist * 0.3))`
  - Use `ctx.fillStyle = hsl(h, s%, l%)`

### Sub-task 2.2c: Floor & Ceiling

- [ ] **For each column, after wall strip:**
  - **Ceiling (above wall):** Fill from column top to wall strip top
    - Indoor tile: solid color, darkened by estimated distance
    - Outdoor tile (type 7): gradient sky (dark blue → purple → pink at horizon)
  - **Floor (below wall):** Fill from wall strip bottom to column bottom
    - Color darkened by distance (interpolated from wall bottom to screen bottom)
- [ ] **Per-pixel distance for floor/ceiling (optional optimization):**
  - Can do simple solid fills for now (faster, looks fine with fog)
  - Per-pixel distance casting is more accurate but slower — defer to polish

### Sub-task 2.2d: Door Rendering

- [ ] **Door tiles (type 2, 3, 5):** When raycaster hits a door cell:
  - Look up `doors[key].openProgress` (0 = fully closed, 1 = fully open)
  - If fully open → treat as empty (ray passes through)
  - If partially open → wall height multiplied by `(1 - openProgress)`
  - If fully closed → render as a wall with a distinct color (different hue from normal walls)
- [ ] **Animated doors:** `openProgress` is lerped in `triggers.js`, but raycaster must read it each frame

### Sub-task 2.2e: Breathing Walls

- [ ] Wall height modulated: `wallHeight *= 1 + BREATHING_AMPLITUDE * Math.sin(state.time.now * BREATHING_SPEED)`
- [ ] Subtle (±2.5%) — should be barely noticeable

### Sub-task 2.2f: Z-Buffer

- [ ] `zBuffer` is a `Float32Array(INTERNAL_WIDTH)` — one distance value per column
- [ ] Written during wall rendering, read during sprite rendering (tasks4)
- [ ] Exported or passed to sprite renderer

**Acceptance:** Looking at the world, you see colored wall strips with distance darkening, a floor below, ceiling above, and doors that are visually distinct. Y-shearing works (pitch shifts the horizon). Walls breathe subtly.

---

## Task 2.3: Create `js/renderer.js` — Draw Orchestrator

**File:** `demoscenes/MOOD/js/renderer.js`

- [ ] **Function:** `draw(state, ctx)`
- [ ] **Clear canvas:** `ctx.fillStyle = '#000'; ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);`
- [ ] **Call order:**
  1. `raycaster.renderWalls(ctx, state.player, state.map.grid, zBuffer)` — walls + floor + ceiling
  2. *(Later)* `sprites.renderAll(ctx, state, zBuffer)` — entities + projectiles + pickups
  3. *(Later)* `renderWeapon(ctx, state.player)` — FPS weapon at bottom-center
  4. *(Later)* `hud.draw(ctx, state)` — crosshair, minimap, etc.
  5. *(Later)* `effects.draw(ctx, state)` — screen shake, distortion overlays
- [ ] **For now:** Only step 1 is implemented. Steps 2-5 are commented placeholders.
- [ ] **Hue rotation:** Update `#mood-wrapper` style each frame
  ```js
  hueAngle = (hueAngle + HUE_ROTATE_SPEED * state.time.dt * 1000) % 360;
  wrapper.style.filter = `hue-rotate(${hueAngle}deg)`;
  ```

**Acceptance:** Calling `renderer.draw(state, ctx)` clears the canvas and renders the 3D view. The wrapper hue-rotates continuously.

---

## Task 2.4: Wire Raycaster into Game Loop

**File:** Edits to `js/main.js`

- [ ] Import `map.js` — initialize `state.map` with grid, rooms, doors
- [ ] Import `renderer.js`
- [ ] Set player spawn position from `map.PLAYER_SPAWN`
- [ ] In game loop step 11: call `renderer.draw(state, ctx)`
- [ ] **Temporary test controls** (until `player.js` is built):
  - Read arrow keys or WASD from `input.js`
  - Directly modify `state.player.x`, `state.player.y`, `state.player.angle` in the loop
  - This lets us visually test the raycaster before player.js exists

**Acceptance:** Game starts → 3D view of Area 0 appears → can turn and move with temporary controls → walls render correctly → no visual artifacts at room edges.

---

## Testing Checklist for Tasks 2

**Critical (must pass before moving on):**
- [ ] Walls render at correct height (taller when close, shorter when far)
- [ ] Fish-eye correction works (walls don't bow outward at screen edges)
- [ ] N/S walls are slightly different shade from E/W walls
- [ ] Floor and ceiling fill correctly (no gaps between wall and floor/ceiling)
- [ ] No visual artifacts at tile boundaries or map edges
- [ ] Can see both Area 0 and Area 1 from inside (rooms render correctly)
- [ ] Performance: solid 60fps with 400-column raycasting (check debug overlay FPS)

**Important (should pass):**
- [ ] Distance fog darkens far walls progressively
- [ ] Y-shearing works: pitch up → horizon moves down, pitch down → horizon moves up
- [ ] Door tiles render with distinct color (visually different from normal walls)
- [ ] Breathing walls produce subtle height oscillation (barely noticeable)
- [ ] Z-buffer contains valid distance values (log a few columns to verify)
- [ ] Hue-rotation on wrapper is animating (psychedelic color drift)

**Edge cases to verify:**
- [ ] Standing right next to a wall doesn't cause rendering glitches
- [ ] Looking at a wall from extreme angle doesn't cause artifacts
- [ ] Corner where two walls meet renders cleanly
- [ ] Hallway between rooms renders without gaps or overlaps
- [ ] Map boundaries don't cause crashes (player at edge of grid)

---

## Summary — What Exists After Tasks 2

```
demoscenes/MOOD/js/
├── config.js       ✅ (from tasks1)
├── input.js        ✅ (from tasks1)
├── main.js         ✅ (updated: wires map + renderer)
├── map.js          ✅ Area 0 + Area 1 grid
├── raycaster.js    ✅ DDA + wall/floor/ceiling + z-buffer + doors + breathing
└── renderer.js     ✅ Draw orchestrator (walls only for now)
```

**What you can do:** See a 3D raycasted world with walls, floor, ceiling, and doors. Move around with temporary controls. The psychedelic hue-rotation is active.

**What's next:** Tasks 3 — proper player movement, HUD, door interaction, and the handgun pickup to reach Milestone A.
