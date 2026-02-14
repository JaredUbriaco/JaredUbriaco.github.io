# Tasks 8 — Audio, Effects & Polish (Milestone F)

**Goal:** Add procedural audio (music + 13 SFX), visual effects (screen shake, distortion, hit flash, breathing walls), polish the HUD (Third Eye, key flash, controls overlay), and do final tuning. This transforms the functional game into a complete, atmospheric experience.

**Milestone target:** Milestone F (Final)

**Depends on:** Tasks 1-7 (Milestone E — full game with AI)

**Note:** Audio and effects are largely independent of each other and can be worked on in parallel. Many of these tasks can be started earlier (alongside tasks 5-7) since they don't have hard dependencies on specific game systems.

---

## Task 8.1: Create `js/audio.js` — Procedural Audio Engine

**File:** `demoscenes/MOOD/js/audio.js`

### Sub-task 8.1a: Audio Context Setup

- [ ] Initialize `AudioContext` on first user interaction (browser autoplay policy)
  ```js
  let audioCtx = null;
  export function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
  }
  ```
- [ ] Call `initAudio()` on game start (first click)
- [ ] Master volume node for global volume control
- [ ] `export function update(state)` — called each frame, triggers sounds based on state changes

### Sub-task 8.1b: Ambient Music Drone

- [ ] **Procedural ambient music:**
  - Low sine oscillator: 60-80 Hz (random within range on init)
  - Filtered white noise: `createBufferSource` with noise buffer → `BiquadFilterNode` (lowpass)
  - Slow LFO on filter cutoff: `osc.frequency.setValueAtTime(...)` with sine LFO
  - Continuous loop — starts on game start, stops on pause/victory
- [ ] **Volume:** Low (0.1-0.15 gain) — background ambiance, not overpowering
- [ ] **Dynamic:** Can subtly shift during boss fight (higher frequency, more intensity)

### Sub-task 8.1c: Weapon SFX

- [ ] **Fist swing:** Short noise burst, 100ms, bandpass filter at 500Hz
  ```js
  export function playFistSwing() {
    const noise = createNoiseSource(0.1); // 100ms
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 500;
    noise.connect(filter).connect(masterGain);
    noise.start(); noise.stop(audioCtx.currentTime + 0.1);
  }
  ```
- [ ] **Fist impact:** Low thud: sine 80Hz, 50ms exponential decay
- [ ] **Handgun shot:** Noise burst 50ms + sine sweep 400Hz→100Hz over 80ms
- [ ] **Shotgun blast:** Longer noise burst 150ms, low-pass filter, louder gain
- [ ] **Void Beam hum:** Continuous sine 200Hz + 201Hz (1Hz beat frequency), volume envelope while firing
  - Start on fire phase, stop on recovery/idle
  - Use gain node for smooth start/stop (avoid clicks)

### Sub-task 8.1d: World SFX

- [ ] **Door open:** Rising sine sweep 100Hz→300Hz over 300ms
- [ ] **Button press:** Two-tone beep: 440Hz 50ms → 880Hz 50ms
- [ ] **Key pickup:** Ascending arpeggio: C4(262Hz) → E4(330Hz) → G4(392Hz), 50ms each
- [ ] **Secret found:** Ascending chime: C → E → G → C5 (4 tones, 100ms each)

### Sub-task 8.1e: Enemy SFX

- [ ] **Enemy hit:** Short click: 1ms noise burst at high gain
- [ ] **Enemy death:** Descending sine sweep 400Hz→50Hz over 300ms
- [ ] **Boss projectile:** Low wobble: sine 100Hz with 5Hz LFO modulation on pitch, 200ms
- [ ] **Boss death:** Long descending sweep 500Hz→20Hz over 2 seconds + noise fadeout

### Sub-task 8.1f: Audio Trigger Integration

- [ ] `audio.update(state)` checks for state changes and plays corresponding sounds:
  - Player weapon state entered `fire` phase → play weapon sound
  - Door `openProgress` started → play door sound
  - Entity `hp` decreased → play hit sound
  - Entity `aggroState` became `dead` → play death sound
  - etc.
- [ ] Use flags to prevent double-triggering (play once per event)

### Sub-task 8.1g: Helper Functions

- [ ] `createNoiseSource(duration)` — white noise buffer source
- [ ] `playSine(freq, duration, gain)` — single sine tone
- [ ] `playSweep(startFreq, endFreq, duration, gain)` — frequency sweep
- [ ] `playTone(freq, duration, type)` — oscillator with ADSR envelope

**Acceptance:** Every game action has a corresponding procedural sound. Ambient drone plays continuously. No external audio files. All sounds are distinct and match the vaporwave aesthetic.

---

## Task 8.2: Expand `js/effects.js` — Visual Effects

**File:** `demoscenes/MOOD/js/effects.js`

### Sub-task 8.2a: Screen Shake

- [ ] **Trigger:** On enemy hit (from combat.js): `state.effects.screenShake = 3`
  - Shotgun: `screenShake = 4` (heavier)
- [ ] **Application:** In renderer.draw, before drawing:
  ```js
  if (state.effects.screenShake > 0) {
    const shakeX = (Math.random() - 0.5) * 4; // ±2px
    const shakeY = (Math.random() - 0.5) * 4;
    ctx.translate(shakeX, shakeY);
    state.effects.screenShake--;
  }
  ```
- [ ] Reset translate after drawing

### Sub-task 8.2b: Phantom/Projectile Distortion

- [ ] **Trigger:** When enemy projectile hits player: `state.effects.distortion = 0.5` (seconds)
- [ ] **Visual effect:**
  - Hue shift: temporarily add extra hue rotation (large, like ±180°)
  - Chromatic aberration: slight CSS filter or canvas offset
  - Simple implementation: `wrapper.style.filter = hue-rotate(X + 180deg)` for distortion duration
  - Or: draw a semi-transparent colored overlay on canvas (magenta at 20% opacity)
- [ ] **Decay:** `distortion -= dt` each frame, effect fades

### Sub-task 8.2c: Hit Flash on Enemies

- [ ] Already partially implemented (entity.hitFlash timer)
- [ ] **In sprites.js draw functions:** When `entity.hitFlash > 0`:
  - Set `ctx.globalCompositeOperation = 'source-atop'` and draw white rectangle over sprite
  - Or: use `ctx.filter = 'brightness(5)'` for sprite draw
  - Simple approach: just draw the sprite in all-white color when flashing

### Sub-task 8.2d: Breathing Walls (Finalization)

- [ ] Already scaffolded in raycaster (Task 2.2e)
- [ ] Verify the modulation is subtle and not nauseating
- [ ] Fine-tune `BREATHING_AMPLITUDE` (±2-3% of wall height)
- [ ] Ensure it applies uniformly to all wall types

### Sub-task 8.2e: Fade-to-White (Finalization)

- [ ] Already implemented in Task 6.4
- [ ] Polish timing and smoothness
- [ ] Ensure it covers sprites and HUD (drawn last, over everything)

**Acceptance:** Screen shakes on hit, visual distortion on projectile hit, enemies flash white when damaged, walls breathe subtly, victory fade is smooth.

---

## Task 8.3: HUD Polish — Third Eye

**File:** Edits to `js/hud.js`

### Sub-task 8.3a: Third Eye Rendering

- [ ] Draw on `#third-eye-canvas` (small canvas, ~80x80 px)
- [ ] **Design:** Organic eye shape with waves, curves, flowing shapes (NO sharp geometry)
  - Outer shape: horizontal ellipse with Bezier-curve eyelid contours
  - Inner iris: concentric circles with gradient fill
  - Pupil: dark circle in center
  - Decorative: wavy lines / flowing curves around the eye
- [ ] **All drawn with canvas Bezier curves:**
  ```js
  ctx.beginPath();
  ctx.moveTo(...);
  ctx.bezierCurveTo(...); // Upper eyelid
  ctx.bezierCurveTo(...); // Lower eyelid
  ctx.closePath();
  ctx.fillStyle = gradientFill;
  ctx.fill();
  ```
- [ ] Color: matches global hue rotation (or shifts independently)

### Sub-task 8.3b: Third Eye States

- [ ] **Idle:** Calm, subtle pulse (scale oscillates ±3% with sin(time))
- [ ] **Firing:** Brief dilation — pupil expands, iris brightens for 100ms
  - Triggered when player fires any weapon
- [ ] **Decorative only** — no HP system to reflect. But responds to player actions.

### Sub-task 8.3c: Third Eye Animation

- [ ] Smooth transitions between states
- [ ] Continuous subtle animation (pulse + color shift) even when idle
- [ ] Update every frame (or every 2-3 frames for perf)

**Acceptance:** Third Eye is visible at bottom-center of screen. It pulses calmly during idle, dilates briefly when firing. Organic, flowing design with Bezier curves.

---

## Task 8.4: HUD Polish — Remaining Elements

**File:** Edits to `js/hud.js`

### Sub-task 8.4a: Kill Counter Polish

- [ ] Format: `"12/23 SPIRITS"` — updates on each kill
- [ ] Brief flash/scale animation on increment
- [ ] Color: soft white/cyan, monospace font

### Sub-task 8.4b: Key Flash

- [ ] When `hasAstralKey` becomes true: flash "ASTRAL KEY ACQUIRED" centered on screen
- [ ] Large text, fades in over 0.3s, holds 1.5s, fades out over 0.5s
- [ ] Prismatic/rainbow color effect on the text

### Sub-task 8.4c: AI Indicator

- [ ] When `state.ai.active`:
  - Show "AUTO" text near crosshair (slightly below center)
  - Pulsing opacity animation (CSS or JS: `opacity = 0.5 + 0.5 * sin(time * 4)`)
- [ ] Disappears immediately when player takes control

### Sub-task 8.4d: Weapon Indicator

- [ ] Bottom-right: current weapon name + simple icon
- [ ] **Icons (canvas-drawn):**
  - Fist: small fist shape
  - Handgun: small gun silhouette
  - Shotgun: longer gun silhouette
  - Void Beam: glowing dot
- [ ] Update on weapon switch
- [ ] Brief highlight animation on switch

### Sub-task 8.4e: Controls Overlay (Start-of-Game)

- [ ] Show on game start for 3 seconds (or until first input):
  ```
  WASD — Move       Mouse — Look
  LMB — Fire        E — Interact
  1/2/3 — Weapons   ESC — Pause
  ```
- [ ] Semi-transparent background, centered text
- [ ] Fades out smoothly

### Sub-task 8.4f: Room Label Polish

- [ ] Smooth fade-in (0.3s) on room change
- [ ] Hold for 3 seconds
- [ ] Smooth fade-out (0.5s)
- [ ] Don't show for corridors (only named rooms)
- [ ] Font: slightly larger than other HUD text, centered top

**Acceptance:** All HUD elements are polished: kill counter animates, key acquisition flashes dramatically, AI indicator pulses, weapon indicator shows name + icon, controls overlay fades at start, room labels transition smoothly.

---

## Task 8.5: Minimap Polish

**File:** Edits to `js/hud.js`

- [ ] **Enemy dots:** Red dots for alive enemies, no dot for dead
- [ ] **Pickup dots:** Green dots for uncollected pickups
- [ ] **Key dot:** Special icon (diamond shape) for dropped key
- [ ] **Boss indicator:** Larger red dot or pulsing icon
- [ ] **Fog of war (optional):** Only show tiles the player has visited — or skip for v1
- [ ] **Door indicators:** Small colored marks at door positions (different color for locked vs unlocked)

**Acceptance:** Minimap is a useful navigation tool showing enemies, pickups, doors, and player position.

---

## Task 8.6: Final Polish & Tuning

### Sub-task 8.6a: Weapon Bob Tuning

- [ ] Verify weapon bob feels right (not too aggressive, not too subtle)
- [ ] Bob should affect the weapon visual at bottom of screen
- [ ] Bob should NOT affect the crosshair

### Sub-task 8.6b: Skybox Refinement

- [ ] Outdoor ceiling gradient: dark blue → purple → pink at horizon
- [ ] Should blend nicely with the hue-rotation effect
- [ ] Stars optional (small white dots in the upper portion)

### Sub-task 8.6c: Stair Visuals

- [ ] Stair tiles (type 8): alternating light/dark stripes on floor
- [ ] Pattern should suggest height change
- [ ] Used at indoor/outdoor transitions

### Sub-task 8.6d: Victory Screen Polish

- [ ] "YOU ESCAPED YOUR MOOD" — elegant typography (canvas text or DOM)
- [ ] Spirit count: "SPIRITS VANQUISHED: 23/23"
- [ ] Secret badge (if found): "SECRET DISCOVERED"
- [ ] Time elapsed: "TIME: X:XX"
- [ ] Menu button styled to match game aesthetic

### Sub-task 8.6e: Death Particle Tuning

- [ ] **Glimmer death:** 5-8 small arcs that shrink and fade over 0.3s — verify timing
- [ ] **Phantom death:** 4-6 body fragments drift apart and fade — verify they look ghostly
- [ ] **Prism death:** Rainbow particle explosion — verify the prismatic effect
- [ ] **Boss death:** Tendrils retract → implosion effect — verify drama and timing

### Sub-task 8.6f: Performance Check

- [ ] Profile the game: 60fps target on modern hardware
- [ ] Check with all 23 entities alive
- [ ] Check with many projectiles on screen
- [ ] Check that minimap drawing isn't expensive
- [ ] Optimize if any frame takes > 16ms consistently

---

## Task 8.7: Link MOOD from Demoscenes Page

**File:** Edits to `demoscenes/index.html`

- [ ] Replace "Coming soon" placeholder with link to MOOD:
  ```html
  <a href="MOOD/" class="demo-link">
    <h2>MOOD</h2>
    <p>Neon-soaked, vaporwave nightmare. Raycasting pseudo-3D.</p>
  </a>
  ```
- [ ] Style the link to match the site's design
- [ ] Keep room for future demoscenes

**Acceptance:** Demoscenes page links to MOOD. Clicking it opens the game.

---

## Task 8.8: Debug Tools — MOVED TO TASKS 1 (Task 1.7)

> **This task has been pulled forward to tasks1.md as Task 1.7.** Debug tools are essential from Task 2 onward for raycaster testing. See tasks1.md for the full spec.

**In tasks8, extend the debug overlay with additional fields:**
- [ ] AI state: current target type, waypoint path length, stuck timer
- [ ] Projectile count
- [ ] Door states (how many open, how many locked)
- [ ] Performance: draw calls per frame estimate

**Acceptance:** Debug overlay shows all relevant game state for development and testing.

---

## Testing Checklist for Tasks 8

- [ ] Ambient drone plays on game start
- [ ] Every weapon has distinct, correct sound
- [ ] Door open sound plays on open
- [ ] Button press has feedback sound
- [ ] Key pickup plays ascending arpeggio
- [ ] Enemy hit and death sounds are distinct
- [ ] Boss has unique projectile and death sounds
- [ ] Screen shake on hit (varying intensity)
- [ ] Projectile distortion effect (hue + aberration)
- [ ] Enemy hit flash (white tint)
- [ ] Breathing walls visible but not nauseating
- [ ] Third Eye pulses and reacts to firing
- [ ] Kill counter animates on kill
- [ ] Key flash is dramatic and visible
- [ ] AI indicator pulses correctly
- [ ] Weapon indicator shows name + icon
- [ ] Controls overlay fades at game start
- [ ] Room labels transition smoothly
- [ ] Minimap shows enemies, pickups, doors
- [ ] Victory screen shows all stats
- [ ] 60fps maintained throughout
- [ ] Full playthrough (manual + AI) works perfectly

---

## Summary — What Exists After Tasks 8 (Milestone F — COMPLETE)

```
demoscenes/MOOD/
├── index.html          ✅ Canvas + HUD + overlays
├── mood.md             📝 Design document
├── talkingroom.md      📝 Architecture deliberation
├── tasks1-8.md         📝 Task breakdowns
├── css/
│   └── mood.css        ✅ Layout, overlays, hue-rotate, HUD, animations
└── js/
    ├── main.js         ✅ Game loop, state, overlays, init
    ├── config.js       ✅ All constants
    ├── input.js        ✅ Keyboard, mouse, pointer lock, idle timer
    ├── map.js          ✅ Full 80x80 grid, rooms, waypoints
    ├── raycaster.js    ✅ DDA, walls, floor, ceiling, skybox, doors, fog, z-buffer
    ├── player.js       ✅ Movement, collision, weapon state, bob
    ├── entities.js     ✅ Glimmer, Phantom, Prism, Boss — all behaviors
    ├── sprites.js      ✅ Billboard projection, z-buffer clipping, all entity visuals
    ├── combat.js       ✅ Hitscan, shotgun, fist, Void Beam, damage
    ├── projectiles.js  ✅ Projectile system with trails
    ├── pickups.js      ✅ All weapon pickups + key
    ├── triggers.js     ✅ Doors, button, key door, secret wall, Light Well
    ├── ai.js           ✅ BFS pathfinding, target selection, combat, boss strategy
    ├── hud.js          ✅ Crosshair, minimap, room label, Third Eye, all indicators
    ├── audio.js        ✅ Procedural music drone + 13 SFX
    ├── effects.js      ✅ Screen shake, distortion, hit flash, fade-to-white
    └── renderer.js     ✅ Draw orchestrator: raycaster → sprites → weapon → HUD → effects
```

**17 JS files. Zero external assets. Zero frameworks. One complete game.**

**Milestone F achieved:** MOOD is complete. A fully playable, vaporwave-aesthetic, pseudo-3D FPS with AI auto-pilot, procedural audio, and full visual polish. The game runs from "CLICK TO BEGIN" to "YOU ESCAPED YOUR MOOD" in 5-15 minutes.
