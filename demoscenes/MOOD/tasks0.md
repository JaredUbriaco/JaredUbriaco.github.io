# Tasks 0 — Pre-Work: Reconciliation & Project Skeleton

**Goal:** Align all design documents, resolve naming/numbering conflicts between `mood.md` and `talkingroom.md`, set up the folder structure, and establish the canonical source of truth before any code is written.

**Milestone target:** Pre-everything. This must be done first.

**Depends on:** Nothing. This IS the starting point.

---

## Task 0.1: Resolve Room Naming — "Area 0" vs. mood.md

### The Conflict

`mood.md` defines 3 areas:
- **Area 1** — Starting room (12×12), 4 Glimmers, Handgun pickup, button + door to Area 2
- **Area 2** — 5 rooms (Rooms 1–5), 18 enemies, Shotgun in Room 4, Prism + key
- **Area 3** — Boss room (THE EGO), Light Well, Void Beam

`talkingroom.md` introduces a split:
- **Area 0 — AWAKENING** (~6×6) — Spawn point, Handgun pickup, door to Area 1
- **Area 1 — THE THRESHOLD** (~14×14) — 4 Glimmers, button, gate to Area 2

This is a good design choice (separate peaceful tutorial space from first combat), but it conflicts with mood.md's locked layout.

### Resolution: Adopt talkingroom.md's split, update mood.md

- [x] **Canonical room list (7 rooms + boss corridor):**

| ID | Label | Approx Size | Notes |
|----|-------|-------------|-------|
| `area0` | AREA 0 — AWAKENING | ~6×6 | Spawn point. Handgun pickup. Door to Area 1. |
| `area1` | AREA 1 — THE THRESHOLD | ~14×14 | 4 Glimmers. Internal pillars. Button + locked gate to Area 2. |
| `a2r1` | AREA 2 — HALL OF ECHOES | ~12×8 | 3 Glimmers, 1 Phantom |
| `a2r2` | AREA 2 — THE DRIFT | ~8×12 | 4 Glimmers |
| `a2r3` | AREA 2 — NEXUS | ~12×12 | 2 Glimmers, 2 Phantoms. Central hub. |
| `a2r4` | AREA 2 — PRISM CHAMBER | ~10×10 | 2 Glimmers, 1 Prism. Shotgun pickup. |
| `a2r5` | AREA 2 — THE PASSAGE | ~10×8 | 3 Phantoms. Key door to Area 3. |
| `corridor_boss` | *(no label)* | ~4×8 | Void Beam pickup on the floor. |
| `area3` | THE EGO | ~16×16 | Boss room. Light Well center. Indoor + outdoor tiles. |

- [x] Enemy counts unchanged: 15 Glimmers + 6 Phantoms + 1 Prism + 1 Boss = 23 total

---

## Task 0.2: Resolve Tile Type Numbering

### The Conflict

**mood.md tile types:**
| Value | Type |
|-------|------|
| 0 | Empty |
| 1 | Ethereal Wall |
| 2 | Gateway/Door |
| 3 | Checkpoint Trigger |
| 4 | Secret Wall |
| 5 | Key Door |
| 6 | Light Well |
| 7 | Boss Door |
| 8 | Weapon Pickup |

**tasks1 config.js tile types:**
| Value | Type |
|-------|------|
| 0 | EMPTY |
| 1 | WALL |
| 2 | DOOR |
| 3 | DOOR_LOCKED_BUTTON |
| 4 | SECRET_WALL |
| 5 | DOOR_LOCKED_KEY |
| 6 | LIGHT_WELL |
| 7 | OUTDOOR |
| 8 | STAIR |
| 9 | BUTTON |

### Resolution: Use tasks1's expanded set (more practical)

The tasks1 version is better because:
- It separates `OUTDOOR` and `STAIR` as distinct tile types (mood.md didn't account for these)
- It gives the button its own tile type (type 9) instead of overloading "Checkpoint Trigger"
- Weapon pickups are entities, not tile types (correct — they float above the floor)
- Boss Door (mood.md type 7) isn't needed as a separate type — it's just a DOOR_LOCKED_KEY with a different trigger

**Canonical tile types:**
```js
export const TILE = {
  EMPTY: 0,
  WALL: 1,
  DOOR: 2,                // Standard door, opens with E
  DOOR_LOCKED_BUTTON: 3,  // Locked until button pressed (Area 1 → 2 gate)
  SECRET_WALL: 4,         // Looks like WALL, opens with E to reveal passage
  DOOR_LOCKED_KEY: 5,     // Locked until Astral Key collected (Area 2 → 3)
  LIGHT_WELL: 6,          // Boss room floor — enables boss damage
  OUTDOOR: 7,             // Walkable, skybox ceiling instead of indoor ceiling
  STAIR: 8,               // Visual transition tile (indoor ↔ outdoor)
  BUTTON: 9,              // Interactive button tile (Area 1 far wall)
};
```

Weapon pickups are sprite entities placed at world coordinates, NOT tile types. This is correct.

---

## Task 0.3: Create Folder Structure

Before any code is written, the directory skeleton must exist.

- [ ] Create `demoscenes/MOOD/css/` directory
- [ ] Create `demoscenes/MOOD/js/` directory

```
demoscenes/MOOD/
├── index.html              (exists — will be replaced in tasks1)
├── mood.md                 (exists — design doc)
├── talkingroom.md          (exists — architecture notes)
├── tasks0.md               (this file)
├── tasks1.md – tasks8.md   (exist — task breakdowns)
├── css/
│   └── mood.css            (tasks1)
└── js/
    ├── main.js             (tasks1)
    ├── config.js           (tasks1)
    ├── input.js            (tasks1)
    ├── map.js              (tasks2)
    ├── raycaster.js        (tasks2)
    ├── player.js           (tasks3)
    ├── entities.js         (tasks4)
    ├── sprites.js          (tasks4)
    ├── combat.js           (tasks4)
    ├── projectiles.js      (tasks5)
    ├── pickups.js          (tasks3)
    ├── triggers.js         (tasks3)
    ├── ai.js               (tasks7)
    ├── hud.js              (tasks3)
    ├── audio.js            (tasks8)
    ├── effects.js          (tasks6)
    └── renderer.js         (tasks2)
```

---

## Task 0.4: Establish Debug Tools Early

`tasks8.md` Task 8.8 says "consider building this early" for debug tools. We're pulling it forward.

- [ ] Add a simple debug overlay to `tasks1.md` (Task 1.7)
- [ ] Toggle with backtick (`` ` ``) key
- [ ] Shows: FPS, player XY, angle, current room, entity count
- [ ] Rendered as DOM overlay (not canvas) for simplicity
- [ ] This is invaluable from Task 2 onward for testing the raycaster

---

## Task 0.5: Document Cross-References

Every task file should know what it produces and what depends on it.

| Task File | Produces | Required By |
|-----------|----------|-------------|
| tasks0 | Folder structure, aligned docs | tasks1 |
| tasks1 | index.html, mood.css, config.js, input.js, main.js | tasks2, tasks3 |
| tasks2 | map.js, raycaster.js, renderer.js | tasks3, tasks4 |
| tasks3 | player.js, hud.js, triggers.js, pickups.js | tasks4, tasks5 |
| tasks4 | entities.js, sprites.js, combat.js | tasks5, tasks6 |
| tasks5 | Expanded map, projectiles.js, Phantom/Prism, Shotgun | tasks6 |
| tasks6 | Boss, Void Beam, effects.js, victory | tasks7 |
| tasks7 | ai.js (waypoints, BFS, target selection, combat) | tasks8 |
| tasks8 | audio.js, polish, final tuning | — (complete) |

---

## Task 0.6: Key Design Principles (Carry Forward)

These apply to ALL implementation tasks:

1. **ES Modules** — `<script type="module">`, `import`/`export`. No globals. No IIFEs.
2. **Single state object** — passed to every `update(state)` call. Modules only mutate their own slice.
3. **Fixed update order** — 12 steps per frame, always in the same order.
4. **Canvas at 400×300** — internal resolution. Upscaled to 800×600 via CSS.
5. **No external assets** — all visuals are canvas primitives. All audio is Web Audio API.
6. **Performance from day one** — profile early, cap entities at ~30, use Float32Array for z-buffer.
7. **Incremental testing** — every task file ends with a testing checklist. Don't move to the next file until the checklist passes.

---

## Acceptance

- [ ] Folder structure created (`css/`, `js/`)
- [ ] Tile types resolved (canonical enum documented)
- [ ] Room naming resolved (Area 0 through Area 3 + corridor)
- [ ] Debug tools pulled to tasks1
- [ ] Cross-reference table complete
- [ ] Ready to begin tasks1
