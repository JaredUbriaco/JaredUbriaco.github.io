# Tasks 1 — Foundation & Scaffold

**Goal:** Get a blank canvas rendering with a game loop, input handling, and pointer lock. Nothing visual yet except a colored rectangle and the HUD skeleton. This is the bedrock everything else sits on.

**Milestone target:** Pre-Milestone A (infrastructure only)

**Depends on:** Nothing — this is the starting point.

---

## Task 1.1: Create `index.html`

**File:** `demoscenes/MOOD/index.html`

- [ ] HTML5 boilerplate with `<meta charset="UTF-8">`, viewport meta
- [ ] `<title>MOOD</title>`
- [ ] `<link rel="stylesheet" href="css/mood.css">`
- [ ] `<script type="module" src="js/main.js">` — ES module entry point
- [ ] Structure:
  ```html
  <div id="mood-wrapper">         <!-- hue-rotate filter applied here -->
    <canvas id="mood-canvas"></canvas>
    <div id="hud-overlay">        <!-- absolute positioned over canvas -->
      <div id="hud-kill-counter"></div>
      <div id="hud-room-label"></div>
      <div id="hud-weapon"></div>
      <div id="hud-ai-indicator"></div>
      <div id="hud-crosshair"></div>
      <div id="hud-minimap-container">
        <canvas id="minimap-canvas"></canvas>
      </div>
      <div id="hud-third-eye-container">
        <canvas id="third-eye-canvas"></canvas>
      </div>
      <div id="hud-messages"></div>
    </div>
    <div id="overlay-start" class="overlay">CLICK TO BEGIN</div>
    <div id="overlay-pause" class="overlay hidden">
      <h2>PAUSED</h2>
      <button id="btn-resume">RESUME</button>
      <button id="btn-quit">QUIT</button>
    </div>
    <div id="overlay-controls" class="overlay">
      <!-- WASD / Mouse / E / 1-2-3 key display, fades after 3s -->
    </div>
  </div>
  ```
- [ ] Canvas element has NO width/height attributes (set in CSS + JS)
- [ ] Ensure `type="module"` on script tag

**Acceptance:** Page loads with a styled wrapper, canvas, and overlay elements. No JS errors in console.

---

## Task 1.2: Create `css/mood.css`

**File:** `demoscenes/MOOD/css/mood.css`

- [ ] `#mood-wrapper` — `position: relative; width: 800px; height: 600px; margin: 0 auto; overflow: hidden;`
- [ ] `#mood-wrapper` — `filter: hue-rotate(0deg);` (JS will animate this)
- [ ] `#mood-canvas` — `width: 800px; height: 600px; display: block; image-rendering: pixelated; image-rendering: crisp-edges;`
- [ ] `#hud-overlay` — `position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10;`
- [ ] HUD element positioning:
  - `#hud-kill-counter` — top-left
  - `#hud-room-label` — top-center, transitions for fade
  - `#hud-weapon` — bottom-right
  - `#hud-crosshair` — center of screen
  - `#hud-minimap-container` — top-right, ~120x120
  - `#hud-third-eye-container` — bottom-center
  - `#hud-ai-indicator` — near center, pulsing animation
- [ ] `.overlay` — full-screen absolute, centered text, semi-transparent background
- [ ] `.overlay.hidden` — `display: none;`
- [ ] `#overlay-start` — large text, cursor pointer
- [ ] `#overlay-pause` — dark overlay with buttons
- [ ] `#overlay-controls` — semi-transparent, shows key hints
- [ ] Body background: `#000` (black behind the game)
- [ ] Font: monospace or a clean sans-serif for HUD text
- [ ] Color variables: `--hud-text`, `--hud-accent`, `--hud-bg`

**Acceptance:** The page renders a centered 800x600 wrapper with properly positioned HUD elements and overlays.

---

## Task 1.3: Create `js/config.js`

**File:** `demoscenes/MOOD/js/config.js`

This is the ONLY file with no imports. Every other module imports from here.

- [ ] **Resolution:**
  ```js
  export const INTERNAL_WIDTH = 400;
  export const INTERNAL_HEIGHT = 300;
  export const DISPLAY_WIDTH = 800;
  export const DISPLAY_HEIGHT = 600;
  ```
- [ ] **Player defaults:**
  ```js
  export const PLAYER_SPEED = 3;        // tiles/sec
  export const PLAYER_RADIUS = 0.2;     // collision circle
  export const PLAYER_FOV = Math.PI / 3; // 60 degrees
  export const MOUSE_SENSITIVITY = 0.002; // rad/px
  export const PITCH_LIMIT = 0.7;       // ±40 degrees in radians
  export const PITCH_SCALE = 200;       // pixels per radian for y-shearing
  ```
- [ ] **Tile types (enum-like) — CANONICAL (see tasks0.md for rationale):**
  ```js
  export const TILE = {
    EMPTY: 0,              // Walkable floor
    WALL: 1,               // Standard ethereal wall
    DOOR: 2,               // Opens with E key
    DOOR_LOCKED_BUTTON: 3, // Locked until Area 1 button pressed
    SECRET_WALL: 4,        // Looks like WALL, opens with E
    DOOR_LOCKED_KEY: 5,    // Locked until Astral Key collected
    LIGHT_WELL: 6,         // Boss room — enables boss damage
    OUTDOOR: 7,            // Walkable, skybox ceiling
    STAIR: 8,              // Visual transition (indoor ↔ outdoor)
    BUTTON: 9,             // Interactive button (Area 1 far wall)
  };
  ```
  **Note:** Weapon pickups are sprite entities at world coordinates, NOT tile types.
  These values differ from mood.md's original tile table — this version is canonical.
- [ ] **Weapon stats:**
  ```js
  export const WEAPONS = {
    FIST:     { name: 'FIST',     damage: 2,  range: 1.5, fireRate: 333,  type: 'melee' },
    HANDGUN:  { name: 'HANDGUN',  damage: 5,  range: Infinity, fireRate: 500,  type: 'hitscan' },
    SHOTGUN:  { name: 'SHOTGUN',  damage: 15, range: 6,   fireRate: 1000, type: 'shotgun', pellets: 12, spread: Math.PI/18 },
    VOIDBEAM: { name: 'VOID BEAM', damage: 10, range: Infinity, fireRate: 333,  type: 'hitscan' },
  };
  ```
- [ ] **Enemy stats:**
  ```js
  export const ENEMIES = {
    GLIMMER: { hp: 5,   speed: 0.5, aggroSpeed: 1.5, radius: 0.2 },
    PHANTOM: { hp: 20,  speed: 0.6, aggroSpeed: 1.2, radius: 0.3, projectileSpeed: 2, fireRate: 2000 },
    PRISM:   { hp: 30,  speed: 0.5, aggroSpeed: 1.0, radius: 0.4, projectileSpeed: 2, fireRate: 2000, spreadCount: 3 },
    BOSS:    { hp: 150, speed: 1.5, radius: 1.0, projectileSpeed: 2, fireRate: 2500 },
  };
  ```
- [ ] **Timing:**
  ```js
  export const DT_CAP = 0.05;          // 50ms max delta
  export const AI_IDLE_THRESHOLD = 5.0; // seconds before AI takes over
  export const DOOR_OPEN_DURATION = 0.3; // seconds
  export const WEAPON_SWAP_DELAY = 0.2;  // seconds
  export const AGGRO_PROPAGATION_RANGE = 3; // tiles
  export const INTERACTION_RANGE = 2;    // tiles
  export const INTERACTION_ANGLE = Math.PI / 6; // ±30 degrees
  ```
- [ ] **Visual:**
  ```js
  export const HUE_ROTATE_SPEED = 0.02; // degrees per ms
  export const BREATHING_AMPLITUDE = 0.025; // ±2.5% wall height
  export const BREATHING_SPEED = 0.001; // sin frequency
  ```

**Acceptance:** File exports all constants. Can be imported by any other module. No side effects on import.

---

## Task 1.4: Create `js/input.js`

**File:** `demoscenes/MOOD/js/input.js`

- [ ] **Keyboard state:** Object tracking which keys are currently pressed
  ```js
  const keys = {};
  window.addEventListener('keydown', e => { keys[e.code] = true; });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  export function isKeyDown(code) { return !!keys[code]; }
  ```
- [ ] **Mouse state:** Track mouse movement deltas and button state
  ```js
  let mouseDX = 0, mouseDY = 0, mouseDown = false;
  document.addEventListener('mousemove', e => {
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  });
  ```
- [ ] **Pointer Lock:**
  - `requestPointerLock()` on canvas click (when start overlay is showing)
  - `pointerlockchange` listener — detect lock/unlock
  - When lock lost unexpectedly → set `shouldPause = true`
  - Export `isPointerLocked()` helper
- [ ] **Pause system:**
  - Escape key → release pointer lock → set `shouldPause = true`
  - Export `shouldPause` flag (read by `main.js`)
  - Export `resumeGame()` — re-requests pointer lock, clears pause flag
- [ ] **Idle timer:**
  - Track `idleTimer` (seconds since last input)
  - Increment by `dt` each frame
  - Reset on ANY keypress, mouse move (with threshold), or mouse click
  - Export `getIdleTime()` and `isAIActive()` (returns `idleTimer > AI_IDLE_THRESHOLD`)
- [ ] **Per-frame reset:**
  - `export function update(dt)` — called at start of each frame
  - Accumulates idle timer
  - Export `getMouseDelta()` — returns `{dx, dy}` and resets accumulators to 0
  - Export `isMouseDown()` — returns button state
  - Export `consumeMouseClick()` — returns true once per click
- [ ] **E key interaction:**
  - Track `E` press as a one-shot (true on keydown, consumed on read)
  - Export `consumeInteract()` — returns true once per E press

**Acceptance:** After pointer lock, WASD keys register, mouse deltas are tracked, Escape pauses. Idle timer counts up and resets on input.

---

## Task 1.5: Create `js/main.js` — Game Loop Shell

**File:** `demoscenes/MOOD/js/main.js`

- [ ] Import from `config.js`, `input.js`
- [ ] **Canvas setup:**
  ```js
  const canvas = document.getElementById('mood-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = INTERNAL_WIDTH;   // 400
  canvas.height = INTERNAL_HEIGHT; // 300
  ```
- [ ] **Shared state object creation:**
  ```js
  const state = {
    player: { x: 0, y: 0, angle: 0, pitch: 0, fov: PLAYER_FOV, ... },
    entities: [],
    projectiles: [],
    map: null,  // set during init
    pickups: [],
    hud: { killCount: 0, totalEnemies: 23, currentRoomLabel: '', messages: [] },
    ai: { active: false, idleTimer: 0, currentTarget: null, waypointPath: [] },
    time: { now: 0, dt: 0, elapsed: 0 },
    flags: { paused: false, started: false, bossActive: false, victoryTriggered: false, ... },
  };
  ```
- [ ] **Game loop:**
  ```js
  let lastTime = 0;
  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, DT_CAP);
    lastTime = timestamp;
    state.time.dt = dt;
    state.time.now = timestamp;
    state.time.elapsed += dt;

    // Step 1: Input
    input.update(dt);

    // Step 2: Pause check
    if (state.flags.paused) { requestAnimationFrame(gameLoop); return; }

    // Steps 3-12: (stubbed, filled in by later tasks)
    // ai.update(state);
    // player.update(state);
    // entities.update(state);
    // ... etc
    // renderer.draw(state, ctx);

    requestAnimationFrame(gameLoop);
  }
  ```
- [ ] **Start flow:**
  - On page load: show "CLICK TO BEGIN" overlay
  - On click: hide overlay, request pointer lock, set `state.flags.started = true`, call `requestAnimationFrame(gameLoop)`
- [ ] **Pause flow:**
  - When `input.shouldPause`: set `state.flags.paused = true`, show pause overlay
  - Resume button: call `input.resumeGame()`, set `state.flags.paused = false`, hide overlay
  - Quit button: `window.location.href = '../'` (back to demoscenes)
- [ ] **Hue rotation:**
  - In loop or separate rAF: update `#mood-wrapper` filter
  ```js
  const wrapper = document.getElementById('mood-wrapper');
  let hueAngle = 0;
  // In game loop: hueAngle += HUE_ROTATE_SPEED * dt * 1000;
  // wrapper.style.filter = `hue-rotate(${hueAngle}deg)`;
  ```

**Acceptance:** Page loads → "CLICK TO BEGIN" → click → pointer lock acquired → game loop runs (blank canvas for now) → Escape pauses → Resume un-pauses. Hue-rotate animates on the wrapper. Console shows no errors.

---

## Task 1.6: Wire Overlays & Controls Display

**File:** Edits to `main.js` and `mood.css`

- [ ] Controls overlay ("WASD to move, Mouse to look, E to interact, 1-2-3 weapons") shows on game start
- [ ] Controls overlay fades out after 3 seconds OR on first player input
- [ ] CSS transition: `opacity 1 → 0` over 0.5s, then `display: none`
- [ ] Pause overlay: semi-transparent black background, "PAUSED" title, two buttons
- [ ] Resume button: requests pointer lock, unpauses
- [ ] Quit button: navigates back to `../` (demoscenes index)
- [ ] Start overlay: large centered text with pulsing animation (CSS keyframes)

**Acceptance:** All three overlays work correctly: start → controls flash → gameplay → Escape → pause → resume or quit.

---

## Task 1.7: Debug Overlay (Pulled from Tasks 8)

**File:** Edits to `index.html`, `mood.css`, `main.js`

Building debug tools NOW rather than at the end. This is essential for testing tasks2+ (raycaster, entities, AI).

- [ ] Add `<div id="debug-overlay">` to `index.html` (inside `#mood-wrapper`)
- [ ] CSS: fixed position top-left, monospace font, semi-transparent background, `z-index: 20`
- [ ] Toggle with backtick (`` ` ``) key — hidden by default
- [ ] **Displays (updated every frame):**
  - FPS (calculated from dt)
  - Player position: `x, y` (2 decimal places)
  - Player angle (degrees) and pitch
  - Current room ID and label
  - Entity count: `alive / total`
  - AI state: `active | inactive`
  - Weapon: current + phase
- [ ] **Implementation:** Update DOM text content each frame when visible
  ```js
  if (debugVisible) {
    debugEl.textContent = `FPS: ${fps}\nPos: ${x.toFixed(2)}, ${y.toFixed(2)}\nAngle: ${deg}° Pitch: ${pitch.toFixed(2)}\nRoom: ${roomId}\nEntities: ${alive}/${total}\nAI: ${aiState}\nWeapon: ${weapon} [${phase}]`;
  }
  ```
- [ ] Performance: only update DOM when overlay is visible (skip `textContent` set when hidden)

**Acceptance:** Press backtick → debug info appears. Press again → it hides. Shows correct live data. No performance impact when hidden.

---

## Summary — What Exists After Tasks 1

```
demoscenes/MOOD/
├── index.html          ✅ Canvas + HUD skeleton + overlays
├── css/
│   └── mood.css        ✅ Layout, overlays, hue-rotate, HUD positioning
└── js/
    ├── config.js       ✅ All game constants
    ├── input.js        ✅ Keyboard, mouse, pointer lock, pause, idle timer
    └── main.js         ✅ Game loop, state object, overlay management
```

**What you can do:** Click to start, get pointer lock, see a blank (or solid-color) canvas with hue-rotation animating, press Escape to pause, resume or quit. Press backtick for debug overlay. The game loop is running at 60fps doing nothing visible yet.

**What's next:** Tasks 2 — the raycaster and renderer, which will make walls appear.
