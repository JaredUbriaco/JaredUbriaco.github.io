# Tasks 9 — Integration Testing & Playthrough Validation

**Goal:** Verify the complete game works end-to-end. This is NOT a build task — it's a testing and validation pass that runs after each milestone to catch integration issues early.

**When to use:** Run the relevant section after completing each milestone's task file.

---

## 9.1: Post-Milestone A Validation (After Tasks 1-3)

**What should work:** Walk around Area 0 and Area 1, open doors, pick up handgun, see minimap and HUD.

### Test Sequence

1. [ ] Load page → "CLICK TO BEGIN" overlay appears
2. [ ] Click → pointer lock acquired, game starts
3. [ ] Controls overlay shows briefly, then fades
4. [ ] Debug overlay toggles with backtick
5. [ ] WASD movement feels smooth at ~3 tiles/sec
6. [ ] Mouse look turns left/right, pitch up/down (clamped)
7. [ ] Walls render correctly (no fish-eye, no gaps)
8. [ ] Walk toward door in Area 0 → press E → door animates open (0.3s)
9. [ ] Walk through opened door into hallway → into Area 1
10. [ ] Room label "AREA 0 — AWAKENING" fades in, then out
11. [ ] Room label "AREA 1 — THE THRESHOLD" appears on entry
12. [ ] Handgun pickup auto-collects near spawn → "HANDGUN ACQUIRED"
13. [ ] Weapon indicator shows "HANDGUN"
14. [ ] Press 1 → switch to FIST. Press 2 → switch to HANDGUN.
15. [ ] Minimap shows both rooms, hallway, player position
16. [ ] Kill counter shows "0/23 SPIRITS"
17. [ ] Button tile visible in Area 1 (distinct on minimap)
18. [ ] Escape → pause overlay → Resume works → Quit navigates back
19. [ ] Hue-rotation continuously shifts colors
20. [ ] No console errors

### Known Risks
- Player spawns inside a wall → crash or visual glitch
- Door doesn't open (interaction range or angle mismatch)
- Minimap scale wrong (rooms don't fit)

---

## 9.2: Post-Milestone B Validation (After Tasks 4)

**What should work:** Enemies visible, shootable, killable. Combat loop functional.

### Test Sequence

1. [ ] 4 Glimmers visible in Area 1 (floating orbs)
2. [ ] Glimmers wander slowly when idle
3. [ ] Point crosshair at Glimmer → click → handgun fires
4. [ ] Muzzle flash visible at barrel
5. [ ] Glimmer flashes white on hit
6. [ ] Glimmer dies in 1 handgun shot (5 HP / 5 damage)
7. [ ] Death animation plays (shrink + particle burst)
8. [ ] Kill counter increments (1/23, 2/23, etc.)
9. [ ] Shooting one Glimmer → nearby Glimmers aggro (chase player)
10. [ ] Aggro'd Glimmers move faster, chase erratically
11. [ ] Switch to Fist (key 1) → punch kills in 3 hits (5 HP / 2 damage)
12. [ ] Weapon bob visible when walking
13. [ ] Screen shake on hit
14. [ ] Glimmers appear correctly in 3D (scale with distance, hidden behind walls)
15. [ ] Minimap shows red dots for enemies
16. [ ] All 4 killed → button becomes usable (or already was if no gate check yet)

### Known Risks
- Sprite projection math wrong → enemies at wrong screen position
- Z-buffer clipping doesn't work → enemies visible through walls
- Hitscan ray doesn't intersect enemy bounding circle → can't hit
- Aggro propagation doesn't stop at room boundaries

---

## 9.3: Post-Milestone C Validation (After Tasks 5)

**What should work:** Full Area 2 with Phantoms, Prism, projectiles, Shotgun, key, secret wall.

### Test Sequence

1. [ ] Kill all 4 Glimmers in Area 1
2. [ ] Press button → "GATE UNLOCKED" message
3. [ ] Open gate door → enter Area 2
4. [ ] 5 distinct rooms render correctly
5. [ ] Hallways connect rooms with working doors
6. [ ] Phantoms visible as tall ghostly columns with trails
7. [ ] Phantom strafes at ~4 tiles, retreats when hurt
8. [ ] Phantom fires projectiles → projectile travels → hits wall or player
9. [ ] Projectile hit on player → visual distortion (hue shift)
10. [ ] Shotgun pickup in Room 4 → auto-collect → "SHOTGUN ACQUIRED"
11. [ ] Shotgun fires 12-pellet spread → devastating at close range
12. [ ] Shotgun pump animation after firing
13. [ ] Prism in Room 4 → rotating prismatic shape
14. [ ] Prism fires 3-way spread shots
15. [ ] Kill Prism → rainbow explosion → key drops → "ASTRAL KEY ACQUIRED"
16. [ ] Walk to key → auto-collect
17. [ ] Navigate to key door (Room 5) → press E → door opens
18. [ ] Secret wall: find it, press E → "YOU FOUND ME"
19. [ ] Minimap shows all rooms, enemies, pickups
20. [ ] All 22 non-boss enemies killable
21. [ ] Outdoor skybox tiles render with gradient sky
22. [ ] Weapon switching between Fist/Handgun/Shotgun works

### Known Risks
- Projectile stuck in wall or passes through
- Prism key drop position is inside a wall
- Map geometry creates unreachable areas
- Door between rooms doesn't open or is missing

---

## 9.4: Post-Milestone D Validation (After Tasks 6)

**What should work:** Complete game playable from start to victory.

### Test Sequence — Full Playthrough

1. [ ] Start game → Area 0 → pick up Handgun
2. [ ] Open door → Area 1 → kill 4 Glimmers
3. [ ] Press button → gate opens → enter Area 2
4. [ ] Clear Rooms 1-5 in sequence (all 18 enemies)
5. [ ] Collect Shotgun in Room 4
6. [ ] Kill Prism → collect Astral Key
7. [ ] Open key door → boss corridor
8. [ ] Collect Void Beam → "VOID BEAM ACQUIRED"
9. [ ] Enter boss room → "THE EGO" label → boss activates
10. [ ] Boss orbits room, fires projectiles
11. [ ] Fire at boss NOT on Light Well → no damage → "FIND THE LIGHT" hint
12. [ ] Stand on Light Well → floor glows
13. [ ] Fire Void Beam at boss from Light Well → boss takes damage
14. [ ] ~5 seconds of continuous fire → boss HP hits 0
15. [ ] Boss death animation (retract → implode → hold)
16. [ ] Fade to white over 1 second
17. [ ] "YOU ESCAPED YOUR MOOD" appears
18. [ ] "SPIRITS VANQUISHED: 23/23"
19. [ ] Return button appears after 3 seconds
20. [ ] Click return → navigate back to demoscenes

**Time:** Target 5-15 minutes for a manual playthrough.

### Known Risks
- Boss orbit gets stuck on pillar
- Light Well check uses wrong tile coords
- Void Beam doesn't register hits on boss
- Victory doesn't trigger (HP check off-by-one)

---

## 9.5: Post-Milestone E Validation (After Tasks 7)

**What should work:** AI completes the entire game autonomously.

### Test Sequence — AI Playthrough

1. [ ] Start game → wait 5 seconds → "AUTO" indicator appears
2. [ ] AI picks up Handgun
3. [ ] AI opens door to Area 1
4. [ ] AI fights and kills all 4 Glimmers
5. [ ] AI presses button
6. [ ] AI opens gate to Area 2
7. [ ] AI clears Area 2 rooms systematically
8. [ ] AI picks up Shotgun (uses it on closer enemies)
9. [ ] AI kills Prism, picks up key
10. [ ] AI opens key door
11. [ ] AI picks up Void Beam
12. [ ] AI enters boss room, navigates to Light Well
13. [ ] AI fires Void Beam at boss until dead
14. [ ] Victory sequence plays
15. [ ] **Total time:** Should complete in ~5-10 minutes

### Player Handoff Test
16. [ ] During AI play, press any key → AI stops, player controls
17. [ ] Wait 5 seconds → AI resumes from where it left off
18. [ ] Repeat handoff 3-4 times during different phases

### Known Risks
- AI gets stuck in a doorway or hallway corner
- AI doesn't switch weapons when it should
- AI walks past key on the floor
- AI doesn't face button within interaction angle
- BFS path leads through a locked door

---

## 9.6: Post-Milestone F Validation (After Tasks 8)

**What should work:** Complete polished game with audio, effects, and all HUD elements.

### Audio Checklist
- [ ] Ambient drone plays on game start (low continuous)
- [ ] Fist swing sound on punch
- [ ] Handgun shot sound distinct from shotgun
- [ ] Shotgun blast is louder and longer
- [ ] Void Beam continuous hum while firing
- [ ] Door open sound on every door
- [ ] Button press beep
- [ ] Key pickup arpeggio
- [ ] Secret wall chime
- [ ] Enemy hit click
- [ ] Enemy death sweep
- [ ] Boss projectile wobble
- [ ] Boss death long sweep

### Visual Effects Checklist
- [ ] Screen shake on hit (varies by weapon)
- [ ] Projectile hit distortion (hue + blur)
- [ ] Enemy hit flash (white tint 1 frame)
- [ ] Breathing walls subtle but visible
- [ ] Third Eye pulses at bottom center
- [ ] Third Eye dilates on fire

### HUD Checklist
- [ ] Kill counter animates on kill
- [ ] Key flash dramatic and visible
- [ ] AI indicator pulses
- [ ] Weapon indicator shows name + icon
- [ ] Controls overlay at game start
- [ ] Room labels smooth transitions

### Performance
- [ ] 60fps throughout (check debug FPS)
- [ ] No lag spikes during combat with many entities
- [ ] No audio glitches or clicks

---

## 9.7: Cross-Browser Spot Check

Not a deep test, just verify basics:
- [ ] Chrome (primary target) — full test
- [ ] Firefox — loads, renders, pointer lock works
- [ ] Edge — loads, renders, pointer lock works
- [ ] Safari — pointer lock may have quirks; verify basic function

---

## 9.8: Known Limitations to Accept (v1)

These are NOT bugs — they're conscious v1 simplifications:
- No fog of war on minimap
- No ammo system (infinite ammo)
- Player cannot die (no HP)
- Enemies don't collision-check each other
- No save/load
- No difficulty settings
- No mobile/touch support
- Audio may not work on iOS Safari without additional interaction
