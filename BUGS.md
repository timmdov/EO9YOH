# STILLFRAME — static bug audit

The original audit recorded all findings as unresolved. **Part 3 Batch 1: BUG-001, BUG-002 and BUG-003 are fixed and automated regression checks pass. BUG-002 first-level entry was manually verified by the student. BUG-003 was browser-confirmed before fixing; post-fix manual checks for BUG-001 and BUG-003 remain pending. All findings outside this batch remain unresolved.** Original HTML locations below refer to the pre-migration baseline; see the migration location map for current modules.

## Method, status and scope

- **Source-confirmed:** a concrete branch, data-flow contradiction or numerical counterexample establishes the defect. This does not establish its frequency or visual impact in a browser.
- **Suspected:** the implementation raises a specific functional concern, but intended behaviour or runtime impact needs confirmation.
- **Browser-confirmed:** requires observed browser reproduction. The student reported inverted horizontal mouse controls for BUG-003 during gameplay. First-level entry after the BUG-002 fix was also manually confirmed by the student; BUG-003 post-fix browser verification remains pending.
- Severity: **High** blocks progression or substantially affects controls/combat; **Medium** affects particular interactions or presentation; **Low** is a limited visual defect. These are audit assessments, not measured user impact.
- The student independently confirmed BUG-001 and BUG-002 in Part 1. This audit traced source and callers across the subsystems below. Isolated, read-only Node calculations using extracted source functions additionally checked level geometry/navigation, the capsule intersection example and the crossing-bullet example. No gameplay, GPU rendering or manual browser verification was performed.
- Suggested gameplay reproductions below are **pending**, not completed steps. BUG-002 blocks normal initial progression; level-dependent checks require a later authorized repair or a controlled test fixture. This audit did not bypass progression or alter saves.

## Coverage

| Subsystem inspected | Findings / outcome |
| --- | --- |
| Initialization and progression | BUG-002; also checked boot, graphics initialization, level cache, results and save paths. |
| Player movement and collisions | BUG-003, BUG-005, BUG-009; traced real-time movement, axis resolution, stepping and collision geometry. |
| Time scaling and timing | BUG-001, BUG-017; inspected fixed-step accumulator, limits, debug overrides and state gates. |
| Weapons, ammunition and damage | BUG-006–009, BUG-019; checked primary actions, bursts, cooldowns, disarming, pickups and damage paths. |
| Projectiles and hit detection | BUG-009–010; checked direction normalization, wall/entity ordering and bullet clashes. |
| Enemy AI, navigation and attacks | BUG-004, BUG-006, BUG-011–012; inspected all three enemy kinds and navigation. |
| Waves and victory | BUG-005 covers invalid spawn placement. No separate confirmed defect found in wave thresholds, queued-spawn limits or exit/clear predicates. |
| Rendering, shaders and effects | BUG-014–016, BUG-018; inspected passes, attachments, uniform packing, shader formulas, particles and poses. |
| Input and pointer lock | BUG-003, BUG-013; inspected event buffering, controller polling, lock requests, pause/resume and visibility handling. |
| Replay and state | BUG-017–018; checked frame recording, step counts, playback, results and reset paths. |

This is not proof that unlisted code is bug-free. Architectural concerns such as the monolithic file and oversized `Game` class belong in `PART1.md`, not this list. One-shot bullet kills despite enemy `hp: 2`, infinite enemy firing and fresh ammunition on enemy disarm may be deliberate balancing rules; without a contradictory requirement, they are not classified as bugs. The fixed-step cap and tiny nonzero time-scale minimum are explicit policies, not automatically defects.

## BUG-001 — Reversed movement arguments prevent intended slow motion

- **Severity / verification:** High; **source-confirmed**, independently checked by the student. **Fixed in Part 3 Batch 1; automated regression verified; manual browser verification pending.**
- **Location:** `src/game.ts`, `Game.frame()` line 329; `src/core/time-scale.ts`, `TimeScaleDriver.update()` lines 18–30. Original evidence: `index.html` 6998 and 6177–6187.
- **Root cause / original evidence:** the signature expects `(realDt, planarSpeed, maxSpeed, ...)`, but the caller supplied `(dt, WALK_SPEED, this.player.planarSpeed, ...)`. The movement contribution `clamp(planarSpeed / maxSpeed, 0, 1)` therefore used the reciprocal ratio. At rest, `4 / 0` became Infinity, clamping to 1.
- **Expected:** current speed divided by maximum speed determines the movement contribution. Grounded inactivity approaches the intentional 0.015 minimum; half/full walking speed approaches 0.5/1, with smoothing and other activity contributions retained.
- **Reproduction confirmed before fixing:** tests executing the actual `Game.frame()` method with the real driver and stubbed external boundaries showed stationary and half-speed inputs approaching 1. All four new time-scale tests failed before the fix. This is automated reproduction, not browser gameplay.
- **Fix:** swapped only the second and third call arguments to `this.driver.update(dt, this.player.planarSpeed, WALK_SPEED, ...)`. The driver, minimum scale, smoothing constants, look contribution, airborne floor, action kick, burst handling and debug overrides were not changed.
- **Automated verification:** four focused tests in `tests/time-scaling.test.cjs` pass: inactivity, proportional walking speeds, smooth slowdown after stopping, and preserved look/jump/burst/action contributions. Batch checks pass: all 10 tests, `npm run typecheck`, `npm run build` (44 modules transformed), and `git diff --check`.
- **Manual reproduction / post-fix check — pending:** in 1-1, leave F2/F3 overrides off and use F4 to display time scale. While grounded, stop moving, looking and acting; allow smoothing/action kick to settle. Expect time scale near 0.015, not a complete freeze. Move and stop again: enemy/projectile motion should accelerate then slow smoothly. Looking, jumping and successful actions should still advance time. Report the observed values and behaviour.

## BUG-002 — First level fails the unlock condition

- **Severity / verification:** High; **source-confirmed**, independently checked by the student. **Fixed in Part 3.1; automated regression verified; first-level entry manually verified by the student.**
- **Location:** `src/ui/ui.ts`, `Ui.isUnlocked()` line 327; caller `src/game.ts`, `Game.startLevel()` lines 168–176. Original evidence: `index.html` 3717–3721 and 6837–6845.
- **Root cause / original evidence:** `if (index < 0) return true;` excluded index 0 from the unconditional first-level branch. It then read `this.levels[index - 1]`; `levels[-1]` is undefined, so the predicate returned false and `startLevel()` returned before loading the level or beginning its intro.
- **Expected:** index 0 is available without previous completion; later levels require their immediate predecessor to be cleared.
- **Reproduction confirmed before fixing:** the regression test called the actual `Ui.prototype.isUnlocked` with index 0 and an empty progress record. It returned false and failed the expected-true assertion. The later-level progression test passed. This is an automated source-level reproduction, not browser gameplay.
- **Fix:** changed only the boundary comparison from `index < 0` to `index <= 0`. The existing previous-level completion check and all gameplay balancing remain unchanged.
- **Automated verification:** `npm test` passes both tests in `tests/ui-unlock.test.cjs`: first-level entry with a fresh save, and later-level gating with missing, false and true predecessor completion records. `npm run build` passes, including strict TypeScript checking and production bundling (44 modules transformed). `git diff --check` passes.
- **Manual gameplay verification — passed for level entry:** the student reported: “The first level now starts successfully.” This confirms entry after the fix. Separate checks of later-level gating, pause behaviour and Console output were not reported; later-level gating has automated coverage.


## BUG-003 — Horizontal look direction is reversed

- **Severity / verification:** High; **browser-confirmed** by the student before fixing: inverted horizontal mouse controls were observed during manual gameplay testing. **Fix implemented and automated regression verified; post-fix manual verification pending.** Controller behaviour has not been browser-verified.
- **Location:** `src/gameplay/player.ts`, `PlayerController.look()` lines 33–40; `src/graphics/camera.ts`, `Camera.forward()` lines 23–26; controller input is mapped in `src/core/input.ts`, `Input.pollGamepad()`. Original evidence: `index.html` 6092–6099, 1857–1860 and 2036–2039.
- **Root cause / original evidence:** `this.yaw += input.mouseDx * s.sensitivity` contradicted the camera convention `[-sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch)]`. At yaw 0, a positive horizontal input turned toward negative X (left), while camera right is positive X. Positive right-stick X enters the same horizontal look path.
- **Expected:** rightward mouse input turns right and leftward input turns left, retaining sensitivity magnitude and the existing vertical controls.
- **Reproduction:** the student confirmed the inversion in the first level. Before the fix, focused tests using the actual `PlayerController.look()` and `Camera.forward()/right()` failed for both horizontal directions; a corrected-sign assertion also failed. The vertical clamp/zero-input test already passed.
- **Fix:** changed only `this.yaw += ...` to `this.yaw -= ...`. Vertical inversion, sensitivity magnitude, pitch limits, look-speed calculation, movement, time scaling and balancing are unchanged. The shared controller look path receives the same horizontal sign correction without remapping buttons or axes.
- **Automated verification:** `npm test` passes all 10 batch tests, including 4 look tests covering both directions from multiple initial orientations, sensitivity magnitude, vertical inversion, pitch limits, look speed and zero input. `npm run build` passes strict TypeScript checking and production bundling (44 modules transformed). `git diff --check` passes.
- **Manual gameplay verification — pending:** run `npm run dev`, open `http://localhost:5173/` in Chrome and enter 1-1 PLATFORM. With mouse capture active, move the mouse right, then left: the view should follow each direction. Check normal up/down look and the existing Invert Y option; horizontal direction should remain correct with either option. If a controller is available, check right-stick horizontal look as well and report it separately. Also perform the BUG-001 slow-motion check as part of the consolidated batch verification. No post-fix mouse/controller browser result has been reported yet.

## Part 3 Batch 1 verification summary

- **Scope:** retained and inspected BUG-002's `<= 0` boundary and BUG-003's yaw subtraction; corrected BUG-001's call argument order. No fixes outside these three bugs.
- **Automated:** `npm test` passes 10 tests; `npm run typecheck` passes; `npm run build` passes with 44 modules transformed; `git diff --check` passes. Unlock tests confirm initial availability and predecessor gating; look tests confirm both horizontal directions, sensitivity, vertical inversion/limits and zero input; time tests exercise the production caller and driver together.
- **Browser evidence:** the student confirmed first-level entry after BUG-002 and inverted mouse controls before BUG-003 was fixed. No new browser verification was performed for this batch.
- **Consolidated manual checklist — pending:** open development (`npm run dev`, `http://localhost:5173/`) and production preview (`npm run preview`, `http://localhost:4173/`) in Chrome. With fresh progress, check 1-1 is available and later levels are locked, then enter 1-1. Test mouse right/left and vertical look with Invert Y off/on. With no F2/F3 override, use F4 to compare stationary time scale (near 0.015 after settling), movement and stopping; check looking, jumping and acting still advance time. Check controller horizontal look if available. Report failures and Console errors; do not interpret these checks as confirmation that other audited bugs are fixed.

## BUG-004 — Navigation bakes ceiling tops instead of the walkable floor below

- **Severity / verification:** High; **source-confirmed**.
- **Location:** `index.html`, `NavGrid.bake()` 4340–4366, `MAX_FLOOR` 4309, `nearestWalkable()` 4388–4418; CARRIAGE ceiling 2674; `LevelBuilder.ceiling()` 2520–2522.
- **Evidence:** baking chooses the highest `bx.max[1] <= 3.3` at each X/Z. The CARRIAGE ceiling occupies Y 2.6–2.9, so its top replaces floor Y 0. Only one height is stored per cell.
- **Expected:** enemies inside a covered carriage navigate its accessible floor, not the roof.
- **Predicted:** navigation represents roof heights, loses valid interior routes and may return inaccessible waypoints or fall back to direct movement. The source-derived grid at CARRIAGE's player position contains approximately 2.9 rather than 0; ELEVATOR's player cell has the same issue.
- **Root cause:** choosing the highest surface globally ignores which vertical layer is reachable from the agent. Headroom checking above that surface cannot restore the discarded interior floor.
- **Suggested reproduction:** construct the original CARRIAGE collision boxes and `NavGrid`; inspect `floor[cellOf(0,0)]`. Later observe enemies trying to route through the carriage doors.

## BUG-005 — Level spawn positions intersect solid geometry

- **Severity / verification:** High; **source-confirmed**.
- **Location:** `index.html`, CARRIAGE definition 2648–2688; `World.flushSpawnQueue()` 5760–5773; `PlayerController.reset()` 6082–6090; `StaticWorld.moveAxis()` 4128–4136.
- **Evidence:** the player spawns at `[0,0,0]`, and the pillar loop creates a solid pillar there spanning X/Z ±0.04 and Y 0–2.6. Initial enemies at `[0,-12]` and `[0,12]` coincide with other pillars; the later `[5.5,0]` spawn is inside the crate at 2688. Spawn/reset code does not validate these placements.
- **Expected:** characters begin in free space at the intended floor height.
- **Predicted:** penetration resolution can push characters sideways or onto obstacle tops. In an isolated call using the actual carriage boxes, a small downward movement from `[0,0,0]` changes Y to 2.6 and reports grounded. This is not a browser observation.
- **Root cause:** level coordinates conflict with collision volumes; downward penetration is interpreted as landing on the box top.
- **Additional affected data:** character-volume overlap checks also find enemy spawns intersecting obstacles in TURNSTILES (2691–2731), ELEVATOR (2878–2933), CUBICLES (2935–2977), SKYLIGHT (3149–3190), CROSSING (3192–3230), HELIPAD (3232–3293) and SPIRE (3295–3385). For example, HELIPAD's four initial `[±11,±11]` walkers (3250–3253) are inside corner towers centered at `[±12,±12]` (3286–3287). Some overlaps are shallow; their individual gameplay consequences remain unobserved.
- **Suggested reproduction:** compare spawn character AABBs with collidable level boxes, including the +0.05 spawn Y offset. Later enter CARRIAGE without moving and inspect initial player/enemy positions.

## BUG-006 — Enemy melee can kill through solid walls

- **Severity / verification:** High; **source-confirmed**.
- **Location:** `index.html`, `updateEnemy()` 5010–5027; `meleeStrike()` 5183–5195; contrast `World.meleeTarget()` 5466–5485.
- **Evidence:** melee initiation checks distance, facing and vertical separation but not `canSee`; the strike checks `d < MELEE_RANGE + 0.15 && facing && vertical`, then calls `killPlayer()`. Neither checks `world.static.lineClear()`; player melee does.
- **Expected:** a solid barrier blocks a melee strike.
- **Predicted:** an alerted unarmed enemy within range can start and finish an attack through a thin wall or partition.
- **Root cause:** missing obstruction checks in both melee initiation and damage application.
- **Suggested reproduction:** later place an alerted rusher and player on opposite sides of a thin partition, within 1.5 units and at similar height; wait through its strike while the barrier remains between them.

## BUG-007 — Proximity pickup bypasses wall obstruction

- **Severity / verification:** Medium; **source-confirmed**.
- **Location:** `index.html`, `World.applyPlayerFrame()` 5313–5320; `findAimProp()` 5518–5540; `nearestPropInRadius()` 5542–5556.
- **Evidence:** interaction uses `this.aimProp ?? this.nearestPropInRadius(1.4)`. Aimed pickup checks `lineClear`, but fallback selection checks only horizontal distance and a vertical difference below 1.8.
- **Expected:** an item behind a solid wall is inaccessible from the other side.
- **Predicted:** E can pick up an occluded nearby item even when the aimed path correctly rejects it.
- **Root cause:** the fallback omits the visibility/obstruction rule used by the primary selection path.
- **Suggested reproduction:** later put an item less than 1.4 horizontal units away behind a thin wall, aim away from other items, and press E. Compare with the aimed-pickup visibility check.

## BUG-008 — Thrown-object damage is applied before wall collision

- **Severity / verification:** High; **source-confirmed**.
- **Location:** `index.html`, `World.stepProps()` 5812–5857; `StaticWorld.resolveSphere()` 4148–4202.
- **Evidence:** props move to their next position, test enemy segments and immediately kill/disarm/stun (5832–5844). Only afterward does `resolveSphere()` process static geometry (5857); fragile props can even exit early at 5854–5855 after damage. No wall raycast limits the enemy test.
- **Expected:** a wall blocks an object before it damages an enemy behind it.
- **Predicted:** an enemy hit volume overlapping the swept segment across/near a thin barrier can be damaged before the wall resolves the prop. Wall collision is also endpoint-only, so sufficiently large displacements can skip thin obstacles.
- **Root cause:** static and dynamic hits are not ordered by earliest impact; the static check is neither swept nor consulted before damage.
- **Suggested reproduction:** in a later fixture, throw toward an enemy close behind a thin partition; inspect the enemy-hit branch and wall impact order. For tunneling, choose a displacement exceeding wall thickness plus the prop diameter and inspect the segment crossing despite a clear endpoint. These are conditional source counterexamples, not claims of observed frequency in existing levels.

## BUG-009 — Capsule intersection returns an incorrect entry time

- **Severity / verification:** High; **source-confirmed**.
- **Location:** `index.html`, `segmentCapsule()` 4266–4303; `World.stepProjectiles()` 5924–5957 and 5966–5973.
- **Evidence:** after finding the closest points, the helper returns `clampN(s - sqrt(r*r - dsq) / segLen, 0, 1)`. This backtracking formula is not a general segment/capsule entry solution, especially when the closest point is clamped to a segment endpoint.
- **Expected:** return the earliest actual contact parameter, comparable with wall and other hit parameters.
- **Predicted / counterexample:** capsule endpoints `[0,0,0]`, `[0,2,0]`, radius 0.3; shot segment `[-0.4,0.8,0]` → `[-0.2,1,0]`. Actual contact is at X=-0.3, parameter **0.5**. The unchanged helper returns **0.20943058495790523**. A wall at parameter 0.35 can therefore incorrectly lose the nearest-hit comparison to an enemy behind it.
- **Root cause:** closest distance is used as though it supplied the geometry of an unrestricted entry calculation.
- **Suggested reproduction:** evaluate the helper with the values above and independently solve `-0.4 + 0.2*t = -0.3`. Later compare wall/entity hit ordering in a controlled oblique-shot fixture.

## BUG-010 — Bullet clash detection ignores relative motion

- **Severity / verification:** Medium; **source-confirmed**.
- **Location:** `index.html`, `World.stepProjectiles()` 6026–6041, especially 6035.
- **Evidence:** the clash test checks final-point distance or `segmentSphere(a.prevPos, a.pos, c.pos, 0.12)`, treating the second bullet as stationary at its final point. `c.prevPos` is unused.
- **Expected:** bullets meeting during the same simulation step clash, irrespective of array order.
- **Predicted / counterexample:** at speed 25 and dt=1/120, A travels `[-0.02,0,0]` → `[0.1883333,0,0]`; B travels `[0,0,-0.02]` → `[0,0,0.1883333]`. Both cross the origin at the same time. Final separation is about 0.2663 (>0.16), and the implemented segment/sphere test returns -1, so the clash is missed.
- **Root cause:** collision uses one trajectory and the other's endpoint rather than relative swept movement.
- **Suggested reproduction:** inspect/evaluate the predicate with distinct shot IDs and the above positions. Later test perpendicular simultaneous shots in an unobstructed fixture.

## BUG-011 — Nearby AI targets disable routing even through obstacles

- **Severity / verification:** Medium; **source-confirmed**.
- **Location:** `index.html`, `nextWaypoint()` 5096–5115; `updateEnemy()` 5036–5052.
- **Evidence:** if horizontal distance is below 2.2 and height difference below 0.5, `e.path = null; return target;` executes without any obstruction check.
- **Expected:** a close target behind a barrier still requires a route around it.
- **Predicted:** an enemy repeatedly discards its route and pushes directly into a wall when the target is nearby on the opposite side; the collision system prevents movement but never changes this shortcut decision.
- **Root cause:** proximity is incorrectly treated as proof of a traversable straight path.
- **Suggested reproduction:** later stand near a partition with an enemy on the opposite side, below the distance threshold and with a doorway farther away; compare pursuit while farther away and while close.

## BUG-012 — Dead enemies leave permanent gun reservations

- **Severity / verification:** Medium; **source-confirmed**.
- **Location:** `index.html`, `World.findGunPropFor()` 5643–5668; `killEnemy()` 5602–5610; `enemyPickUp()` 5669–5675; `addProp()` 5807.
- **Evidence:** selection assigns `best.claimedBy = e.id`; other enemies reject `pr.claimedBy >= 0 && pr.claimedBy !== e.id`. `killEnemy()` neither releases the claimed prop nor clears its reservation. The only initial unclaimed assignment is in `addProp()`.
- **Expected:** a gun reserved by an enemy that dies before collecting it becomes available to other enemies.
- **Predicted:** other enemies permanently ignore that still-existing gun, even after its claimant is removed. The player can still collect it.
- **Root cause:** reservation ownership outlives the owning enemy; no release/owner-liveness check exists.
- **Suggested reproduction:** later let an unarmed walker reserve a stationary gun, kill it before pickup, and inspect `claimedBy` while a second unarmed walker searches nearby.

## BUG-013 — Mapped controller pause action is never consumed

- **Severity / verification:** Medium; **source-confirmed**.
- **Location:** `index.html`, `GAMEPAD_BUTTONS` 1896–1902; `Input.pollGamepad()` 2040–2052; `Game.frame()` 6958–7031; pointer-lock listener 6774–6777.
- **Evidence:** button 9 maps to `pause`, but there is no `wasPressed("pause")` or equivalent action consumption. Keyboard Escape can pause indirectly by releasing browser pointer lock; controller button 9 does not use that path.
- **Expected:** the explicitly mapped controller pause button opens the pause menu.
- **Predicted:** pressing it during play has no pause effect.
- **Root cause:** action binding is present without a corresponding state transition handler.
- **Suggested reproduction:** search all uses of `pause` to verify the missing consumer; later press button 9 on a standard-mapped controller while playing.

## BUG-014 — Viewmodel pass erases world depth before outlines

- **Severity / verification:** Medium; **source-confirmed**.
- **Location:** `index.html`, `Renderer.render()` 1518, 1553–1578; `ensureTargets()` 1777–1786; WGSL `fsOutline()` 987–1015.
- **Evidence:** opaque/glass passes write world depth. The viewmodel then uses the same `depthView` with `depthLoadOp: "clear"`, `depthClearValue: 1` (1561). The following outline pass samples that depth texture and immediately returns unoutlined colour when `dc >= 1.0` (990–991).
- **Expected:** world outlines continue to use world depth while hands/weapons render in the foreground.
- **Predicted:** pixels outside the viewmodel lose world depth and bypass outline processing whenever the viewmodel pass runs. World colour and normals survive, but their matching depth does not.
- **Root cause:** foreground rendering and world postprocessing reuse a depth attachment whose contents are destructively cleared.
- **Suggested reproduction:** trace attachment identity and load operations; later inspect world silhouettes with the viewmodel visible, or use a GPU frame capture to inspect depth immediately before the outline pass.

## BUG-015 — Threat effect can obscure nearly the entire scene

- **Severity / verification:** High; **suspected** functional defect; the attenuation formula is source-confirmed, but acceptable visual intensity/design intent needs review.
- **Location:** `index.html`, `Game.incomingThreat()` 7199–7215; `updatePost()` 7239–7243; `Renderer.writePost()` 1734–1735; WGSL `fsFinal()` 1123–1128.
- **Evidence:** an enemy bullet within 8 units requests threat 1 via `clamp(2 - d/8, 0, 1)`; any telegraph also requests 1. Threat rapidly approaches that value (rise time 0.05). The shader multiplies the whole scene by `1.0 - post.danger.x * smoothstep(0.0, 0.3, abs(sin(...)))`.
- **Expected (inferred):** a danger indicator preserves enough visibility to aim and dodge; a complete scene blackout is not described elsewhere as a mechanic.
- **Predicted:** sustained threat makes scene brightness approach zero over much of the pulse cycle, with grain applied afterward. The HUD is separate DOM, so this does not imply that the HUD disappears. Reduce Motion disables this effect.
- **Root cause candidate:** unbounded full-screen attenuation up to 100%, rather than a limited danger cue.
- **Suggested reproduction:** later compare visibility during a sustained nearby projectile/marksman telegraph with Reduce Motion off and on. Record actual darkness and duration before deciding whether the effect is a bug or deliberate presentation.

## BUG-016 — “No bob” setting still applies bob and sway

- **Severity / verification:** Low; **source-confirmed**.
- **Location:** `index.html`, `Ui.showSettings()` 3606; `Viewmodel.draw()` 6473–6477.
- **Evidence:** the option is labelled `Reduce motion (no aberration, grain, bob)`, but `const bobScale = reduceMotion ? 0.3 : 1` multiplies both bob and sway.
- **Expected:** the advertised no-bob setting removes viewmodel bob.
- **Predicted:** 30% of bob amplitude remains whenever `bobAmount` is nonzero.
- **Root cause:** nonzero reduced-motion multiplier contradicts the UI promise.
- **Suggested reproduction:** substitute `reduceMotion = true` into bobX/bobY; later enable the setting and walk while observing the weapon/hands.

## BUG-017 — Replay advances even when already ahead of its playback clock

- **Severity / verification:** Medium; **source-confirmed**.
- **Location:** `index.html`, `ReplayPlayer.update()` 6603–6619; `ReplayRecorder.setLastSteps()` 6579–6582.
- **Evidence:** the loop condition includes `(this.simPlayed < this.clock || applied === 0)`. `applied` resets to 0 on every render update, forcing at least one recorded frame even when `simPlayed` is already ahead.
- **Expected:** speed-1 replay follows its recorded simulation duration independently of playback render frequency.
- **Predicted:** if each recorded frame contains four steps (1/30 second) but playback updates at 120 Hz, every update still consumes at least four steps: playback runs about four times too fast. This is separate from deliberately removing slow-motion waiting in a real-time replay.
- **Root cause:** mandatory per-display-frame consumption overrides the simulation-time budget.
- **Suggested reproduction:** use a later fixture of recorded frames with `steps: 4`; call `update(1/120)` repeatedly and compare `simPlayed` with `clock`. Browser-check playback under a higher refresh rate than recording.

## BUG-018 — Replay weapon animation uses stale state and distance from origin

- **Severity / verification:** Low; **source-confirmed**.
- **Location:** `index.html`, `Game.render()` 7111–7116; `PlayerController.update()` 6141; `Viewmodel.update()/draw()` 6463–6477; `Game.startReplay()` 6930–6938.
- **Evidence:** `Viewmodel.update()` is skipped in replay, retaining prior sway/bob state. Replay stride is `Math.hypot(current.pos[0], current.pos[2])`, while live stride accumulates speed times dt. Starting replay does not reset the viewmodel.
- **Expected:** replay weapon motion follows recorded movement, with a consistent animation phase and no leftover live-play sway.
- **Predicted:** camera/world replay can proceed while hands keep stale sway or bob amplitude; moving around a circle centered at the origin changes travelled distance but leaves replay stride constant.
- **Root cause:** radial position substitutes for accumulated distance, and presentation state is neither updated from replay data nor reset.
- **Suggested reproduction:** later record a run ending while turning/walking, then watch the replay; compare hand motion with a run ending stationary. Inspect a constant-radius path to isolate the stride error.

## BUG-019 — Thrown-object hits use enemy array order instead of earliest contact

- **Severity / verification:** Medium; **source-confirmed**.
- **Location:** `index.html`, `World.stepProps()` 5827–5852; contrast `World.stepProjectiles()` 5920–5957.
- **Evidence:** each enemy's head/body intersection is computed, but the first enemy with either hit is damaged and the loop breaks. There is no minimum-t selection across enemies. Within that enemy, `if (th >= 0)` chooses a head kill even when a valid body contact occurs earlier.
- **Expected:** the first physical contact determines the target and whether the object hit the head or body.
- **Predicted:** when a swept object overlaps multiple targets, insertion order can select the farther one; a segment touching body before head can receive the headshot outcome. Bullet code explicitly compares hit times, showing the missing distinction in the thrown-object path.
- **Root cause:** intersection booleans and array order replace time-of-impact ordering. This is distinct from BUG-008's missing wall ordering.
- **Suggested reproduction:** later create two overlapping/reachable enemy hit volumes along one thrown segment and reverse their array order; compare the damaged enemy. Separately use a segment intersecting body before head and compare `tb` and `th` with the selected outcome.

## Follow-up boundary

No fixes, refactoring, gameplay changes, save changes or browser-confirmation claims are included. All suggested browser/fixture reproductions remain future work; source-confirmed does not mean browser-confirmed. Resolve design intent for BUG-015 before treating its presentation as definitively incorrect.

## Part 2 migration location map

All existing entries remain unresolved with their existing verification status. Their HTML line references identify the original baseline (`git show af3e29c:index.html`). Current code is in the modules below; search the same function names for exact current locations. Extraction and typing encountered no additional confirmed functional bug and did not repeat the audit.

| IDs | Current source |
| --- | --- |
| 001 | `src/game.ts`, `src/core/time-scale.ts` |
| 002 | `src/ui/ui.ts`, `src/game.ts` |
| 003 | `src/gameplay/player.ts`, `src/graphics/camera.ts`, `src/core/input.ts` |
| 004 | `src/physics/navigation.ts`, `src/levels/levels.ts` |
| 005 | `src/levels/levels.ts`, `src/gameplay/world.ts`, `src/gameplay/player.ts`, `src/physics/collision.ts` |
| 006 | `src/gameplay/enemies.ts`, `src/gameplay/world.ts` |
| 007–008, 010, 012, 019 | `src/gameplay/world.ts` |
| 009 | `src/physics/collision.ts`, `src/gameplay/world.ts` |
| 011 | `src/gameplay/enemies.ts` |
| 013 | `src/core/input.ts`, `src/game.ts` |
| 014 | `src/graphics/renderer.ts`, `src/shaders/outline.wgsl` |
| 015 | `src/game.ts`, `src/graphics/renderer.ts`, `src/shaders/final.wgsl` |
| 016 | `src/ui/ui.ts`, `src/graphics/viewmodel.ts` |
| 017 | `src/gameplay/replay.ts` |
| 018 | `src/game.ts`, `src/graphics/viewmodel.ts` |
