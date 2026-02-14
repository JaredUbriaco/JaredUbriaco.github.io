# Tasks 4 — Entities, Sprites, Combat & Weapons (Milestone B)

**Goal:** See enemies in the 3D world, shoot them, watch them die. First combat loop with Glimmers, the handgun, and the aggro system. This is when the game starts feeling like a game.

**Milestone target:** Milestone B

**Depends on:** Tasks 1-3 (foundation, raycaster, player, HUD, triggers)

---

## Task 4.1: Create `js/entities.js` — Glimmer Enemy

**File:** `demoscenes/MOOD/js/entities.js`

### Sub-task 4.1a: Entity Base Structure

- [ ] **Entity object shape:**
  ```js
  {
    type: 'GLIMMER',          // 'GLIMMER' | 'PHANTOM' | 'PRISM' | 'BOSS'
    x: 0, y: 0,              // World position (float)
    hp: 5,                   // From ENEMIES config
    maxHp: 5,
    radius: 0.2,             // Collision circle
    roomId: 'area1',         // Current room
    aggroState: 'idle',      // 'idle' | 'aggro' | 'dead'
    idleTarget: { x, y },    // Random wander target
    idleTimer: 0,            // Time until next direction change
    hitFlash: 0,             // Frames remaining for white flash on hit
    deathTimer: 0,           // Animation countdown on death
    // Type-specific fields added by factory
  }
  ```
- [ ] **Factory function:** `createGlimmer(x, y, roomId)` → entity object
- [ ] **Entity array management:**
  - `export function spawnEntities(state)` — creates initial entity list based on room configs
  - For now: spawn 4 Glimmers in Area 1 at defined positions

### Sub-task 4.1b: Glimmer Idle Behavior

- [ ] **When `aggroState === 'idle'`:**
  - Wander slowly (~0.5 tiles/sec) toward `idleTarget`
  - `idleTarget` is a random walkable position within the same room
  - When close to target (< 0.5 tiles) or `idleTimer` expires (1-3 sec): pick new random target
  - **Movement:** `atan2(targetY - y, targetX - x)` → move in that direction
  - Apply wall collision (circle vs grid, same as player but simpler — no sliding, just stop and pick new target)
  - Wobble/jitter: add small random offset to position each frame for visual flavor

### Sub-task 4.1c: Glimmer Aggro Behavior

- [ ] **When `aggroState === 'aggro'`:**
  - Move toward player at ~1.5 tiles/sec
  - Add erratic movement: `angle += randomRange(-0.26, 0.26)` (±15°)
  - Wall collision with sliding (try to navigate around obstacles)
  - "Attack" at melee range (< 1.5 tiles): visual only, no damage to player

### Sub-task 4.1d: Entity Update Loop

- [ ] **Function:** `updateEntities(state)`
- [ ] For each entity:
  - Skip if `aggroState === 'dead'` and `deathTimer <= 0` (remove from array)
  - If dead but animating: tick `deathTimer`, keep in list for visual
  - If idle: run idle behavior
  - If aggro: run aggro behavior
  - Decrement `hitFlash`
  - Update `roomId` from current position (lookup roomMeta)

**Acceptance:** 4 Glimmers spawn in Area 1, wandering aimlessly. They don't react to the player yet (until shot).

---

## Task 4.2: Create `js/sprites.js` — Billboard Rendering

**File:** `demoscenes/MOOD/js/sprites.js`

This system projects world-space entities onto the 2D screen and draws them behind/in-front-of walls using the z-buffer.

### Sub-task 4.2a: Sprite Projection

- [ ] **Function:** `renderSprites(ctx, state, zBuffer)`
- [ ] **For each visible entity (+ projectiles + uncollected pickups):**
  1. **Calculate relative position:**
     ```js
     const dx = entity.x - player.x;
     const dy = entity.y - player.y;
     ```
  2. **Transform to camera space:**
     ```js
     const invDet = 1 / (planeX * dirY - dirX * planeY);
     const transformX = invDet * (dirY * dx - dirX * dy);
     const transformY = invDet * (-planeY * dx + planeX * dy);
     ```
     Where `dirX/Y` is player direction, `planeX/Y` is camera plane (perpendicular, scaled by FOV).
  3. **Screen X:** `screenX = (INTERNAL_WIDTH / 2) * (1 + transformX / transformY)`
  4. **Screen Y (with pitch):** Apply y-shearing offset (same as wall rendering)
  5. **Sprite scale:** `scale = projectionConstant / transformY`
  6. **Discard if behind camera:** `if (transformY <= 0.1) skip`

### Sub-task 4.2b: Z-Buffer Clipping

- [ ] Sprite is drawn as vertical strips (1px wide each)
- [ ] For each strip of the sprite:
  - If `zBuffer[column] < transformY` → wall is closer → don't draw this strip
  - Otherwise, draw the sprite strip
- [ ] This ensures sprites are hidden behind walls
- [ ] **Important:** DO NOT modify the z-buffer when drawing sprites. The z-buffer is wall-only. Sprites don't occlude other sprites via z-buffer — that's handled by draw order (painter's algorithm in 4.2c).

### Sub-task 4.2c: Draw Order (Painter's Algorithm)

- [ ] Sort all sprites by distance to camera (far to near)
- [ ] Draw in order: far sprites first, near sprites overwrite
- [ ] Combined with per-column z-buffer clipping, this handles all occlusion cases

### Sub-task 4.2d: Entity Drawing Dispatch

- [ ] Each entity type has its own `drawSprite(ctx, screenX, screenY, scale, entity)` function
- [ ] **Glimmer drawing:**
  - Central circle (`arc()`) with oscillating radius
  - 4-6 small sparkle dots orbiting at varying angles
  - Color: bright white/cyan, alpha pulses with `sin(time)`
  - On hit flash: draw in white
  - Death animation: shrink to 0, burst of particles
- [ ] **Pickup drawing (for handgun and later weapons):**
  - Small shape (rectangle + barrel) bobbing up/down
  - Glowing outline
- [ ] All drawn with canvas primitives — no images

**Acceptance:** Glimmers are visible in the 3D world as floating orbs. They appear to be at the correct world positions. They're hidden when behind walls. They appear smaller when far away. They wobble and sparkle.

---

## Task 4.3: Aggro System

**File:** Edits to `js/entities.js`

- [ ] **Trigger:** When an entity takes damage (from combat.js):
  - Set `entity.aggroState = 'aggro'`
  - **Propagation:** Find all entities within `AGGRO_PROPAGATION_RANGE` (3 tiles) that:
    - Are the same type
    - Are currently idle
    - Are in the same room
  - Set them to aggro too
  ```js
  export function aggroEntity(entity, allEntities) {
    entity.aggroState = 'aggro';
    for (const other of allEntities) {
      if (other === entity || other.type !== entity.type) continue;
      if (other.aggroState !== 'idle') continue;
      const dist = Math.sqrt((other.x - entity.x)**2 + (other.y - entity.y)**2);
      if (dist <= AGGRO_PROPAGATION_RANGE) {
        other.aggroState = 'aggro';
      }
    }
  }
  ```
- [ ] **Aggro is permanent.** Once aggro'd, an entity stays aggressive until dead.

**Acceptance:** Shoot a Glimmer → it becomes aggressive → nearby Glimmers also become aggressive. Unshot Glimmers in other rooms stay idle.

---

## Task 4.4: Create `js/combat.js` — Hitscan & Damage

**File:** `demoscenes/MOOD/js/combat.js`

### Sub-task 4.4a: Hitscan Ray

- [ ] **Function:** `fireHitscan(state)` — called when player fires handgun (or void beam later)
- [ ] Cast a ray from player position at player angle
- [ ] Check intersection with each entity's bounding circle (sorted by distance)
  ```js
  function rayCircleIntersect(rayOrigin, rayDir, circlePos, radius) {
    // Standard ray-circle intersection test
    // Returns distance to intersection or null
  }
  ```
- [ ] First entity hit within weapon range → apply damage
- [ ] **Damage application:**
  ```js
  export function damageEntity(entity, damage, allEntities) {
    entity.hp -= damage;
    entity.hitFlash = 3; // frames of white flash
    aggroEntity(entity, allEntities);
    if (entity.hp <= 0) {
      entity.aggroState = 'dead';
      entity.deathTimer = 0.3; // death animation duration
    }
  }
  ```

### Sub-task 4.4b: Weapon Fire Phases

- [ ] **In player.js or combat.js**, manage weapon state machine:
  - `idle` → mouse click → `windup` (Phase 1 timer)
  - `windup` → timer done → `fire` (Phase 2 timer) — **this is when hit check runs**
  - `fire` → timer done → `recovery` (Phase 3 timer)
  - `recovery` → timer done → `idle`
- [ ] **Handgun timings:** windup 50ms, fire 100ms, recovery 350ms = 500ms total
- [ ] Auto-fire: if mouse held down and `idle`, start next fire cycle
- [ ] **Screen shake:** On successful hit, set `state.effects.screenShake = 3` (frames)

### Sub-task 4.4c: Kill Tracking

- [ ] On entity death: `state.hud.killCount++`
- [ ] HUD updates automatically from state

### Sub-task 4.4d: Fist Weapon (melee)

- [ ] **Range check:** Is any entity within 1.5 tiles AND within ±30° of player facing?
- [ ] If yes, apply damage (2 damage)
- [ ] **Fist timings:** windup 80ms, fire 80ms, recovery 173ms = 333ms total
- [ ] Fist is always available (slot 1)

**Acceptance:** Point at a Glimmer, click → handgun fires → Glimmer flashes white → takes 5 damage → dies (5 HP). Kill counter increments. Nearby Glimmers aggro. Can also punch with fist (key 1).

---

## Task 4.5: Weapon Rendering — Handgun + Fist

**File:** Edits to `js/renderer.js` (or new sub-section)

### Sub-task 4.5a: Fist Drawing

- [ ] Draw at bottom-center of canvas
- [ ] **Idle:** Skin-toned arc (knuckles) + rectangle (arm), slightly below center
- [ ] **Phase 1 (windup):** Arm pulls back (translate down/right)
- [ ] **Phase 2 (fire):** Arm swings forward (translate up/left, larger)
- [ ] **Phase 3 (recovery):** Arm returns to idle
- [ ] **Weapon bob:** Vertical offset from `Math.sin(walkCycle) * 3`

### Sub-task 4.5b: Handgun Drawing

- [ ] Draw at bottom-center of canvas
- [ ] **Idle:** Dark rectangle body + small barrel rectangle, angled slightly
- [ ] **Phase 1 (windup):** Slight weapon shift backward
- [ ] **Phase 2 (fire):** Recoil kick-up + bright yellow circle at barrel (muzzle flash)
- [ ] **Phase 3 (recovery):** Weapon settles back down
- [ ] **Weapon bob applied**
- [ ] All drawn with `ctx.fillRect()`, `ctx.arc()`, `ctx.fillStyle` — pure canvas shapes

**Acceptance:** Looking down, you see a fist or handgun at the bottom of the screen. It animates when you fire. Muzzle flash on handgun. Bob when walking.

---

## Task 4.6: Wire Combat into Game Loop

**File:** Edits to `js/main.js`

- [ ] Import `entities.js`, `sprites.js`, `combat.js`
- [ ] Spawn entities on init
- [ ] **Update order:**
  ```js
  // Step 5: entities.update(state)
  // Step 9: combat.update(state) — resolve weapon fires
  // Step 11: renderer now calls sprites.renderSprites() after raycaster
  //          renderer now calls weapon drawing after sprites
  ```
- [ ] Weapon fire triggers from player's weapon state machine

**Acceptance:** Complete Milestone B: Walk through Area 0 → pick up handgun → open door → enter Area 1 → see idle Glimmers → shoot one → it aggros + nearby aggro → fight → kill all 4 → minimap shows enemy positions → kill counter tracks.

---

## Testing Checklist for Tasks 4

- [ ] Glimmers wander in Area 1 when idle
- [ ] Glimmers are visible as orbs in 3D view
- [ ] Glimmers scale correctly with distance
- [ ] Glimmers are hidden behind walls (z-buffer clipping)
- [ ] Shooting a Glimmer deals 5 damage (1-shot kill with handgun)
- [ ] Hit flash (white tint) for 1 frame on damage
- [ ] Death animation (shrink + particle burst)
- [ ] Aggro propagation: shoot one, nearby same-type aggro
- [ ] Aggro'd Glimmers chase the player
- [ ] Aggro'd Glimmers navigate around internal walls
- [ ] Kill counter increments on death
- [ ] Fist works at melee range (2 damage, 3 hits to kill)
- [ ] Weapon animations display correctly (3 phases)
- [ ] Weapon bob works when walking
- [ ] Weapon switch (1=Fist, 2=Handgun) with 200ms delay

---

## Summary — What Exists After Tasks 4 (Milestone B)

```
demoscenes/MOOD/js/
├── config.js       ✅
├── input.js        ✅
├── main.js         ✅ (entities, combat, sprites wired in)
├── map.js          ✅
├── raycaster.js    ✅
├── renderer.js     ✅ (+ weapon drawing, sprite dispatch)
├── player.js       ✅
├── hud.js          ✅
├── triggers.js     ✅
├── pickups.js      ✅
├── entities.js     ✅ Glimmer spawn, idle/aggro behavior, aggro propagation
├── sprites.js      ✅ Billboard projection, z-buffer clipping, Glimmer drawing
└── combat.js       ✅ Hitscan, damage, fist melee, weapon phases
```

**Milestone B achieved:** The core combat loop works. Walk, open doors, shoot idle enemies that aggro and chase, kill them. This is the game's heartbeat.

**What's next:** Tasks 5 — expand to the full level: Area 2, Phantoms, Prism, Shotgun, projectiles, and the key door.
