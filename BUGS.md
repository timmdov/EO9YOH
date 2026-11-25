# STILLFRAME — static bug audit

All findings remain **unresolved**. This audit changes documentation only. Locations refer to the current `index.html`; the increment 2.1 import replacement did not shift line numbers.

## Method, status and scope

- **Source-confirmed:** a concrete branch, data-flow contradiction or numerical counterexample establishes the defect. This does not establish its frequency or visual impact in a browser.
- **Suspected:** the implementation raises a specific functional concern, but intended behaviour or runtime impact needs confirmation.
- **Browser-confirmed:** requires observed browser reproduction. **No finding has this status.**
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

- **Severity / verification:** High; **source-confirmed**, independently checked by the student.
- **Location:** `index.html`, `Game.frame()` line 6998; `TimeScaleDriver.update()` 6177–6187; `WALK_SPEED` 6064.
- **Evidence:** the signature expects `(realDt, planarSpeed, maxSpeed, ...)`, but the caller supplies `(dt, WALK_SPEED, this.player.planarSpeed, ...)`. The movement contribution is `clamp(planarSpeed / maxSpeed, 0, 1)`.
- **Expected:** movement contributes current speed divided by maximum speed; stationary, grounded inactivity approaches the minimum scale.
- **Predicted:** with current speed 0, `4 / 0` becomes Infinity and clamps to 1. Speeds up to 4 also request full speed; smoothing approaches that target rather than slow motion.
- **Root cause:** reversed numeric arguments. The smoothed value does not become 1 instantly, and debug overrides remain separate.
- **Suggested reproduction:** compare the call and signature; substitute speed 0. Later, stand still without looking or acting, leave F2/F3 overrides off, and compare F4 time scale and enemy motion with movement.

## BUG-002 — First level fails the unlock condition

- **Severity / verification:** High; **source-confirmed**, independently checked by the student.
- **Location:** `index.html`, `Ui.isUnlocked()` 3717–3721; `Game.startLevel()` 6837–6845.
- **Evidence:** `if (index < 0) return true;` is followed by `const prev = this.levels[index - 1]` and `return !!prev && !!this.save.levels[prev.id]?.cleared`. `startLevel()` returns when this is false.
- **Expected:** index 0 is available without a previous completion.
- **Predicted:** index 0 reads `levels[-1]`, receives undefined and is rejected before loading or intro. Fresh-player progression is blocked.
- **Root cause:** incorrect boundary comparison for the first level.
- **Suggested reproduction:** substitute index 0 into the predicate. Later, open a fresh Chrome profile, wait for the title screen and click PLAY; record whether level 1-1 starts.

## BUG-003 — Horizontal look direction is reversed

- **Severity / verification:** High; **source-confirmed**.
- **Location:** `index.html`, `PlayerController.look()` 6092–6099; `Camera.forward()` 1857–1860; `Input.pollGamepad()` 2036–2039.
- **Evidence:** `this.yaw += input.mouseDx * s.sensitivity`, while camera forward is `[-sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch)]`. Positive right-stick X also increases `mouseDx`.
- **Expected:** moving the mouse/right stick right turns the view right with the default controls.
- **Predicted:** starting at yaw 0, a positive horizontal input turns toward negative X (left), while local right is positive X. Vertical inversion is separately configurable; there is no horizontal inversion setting.
- **Root cause:** input yaw sign contradicts the camera's yaw convention.
- **Suggested reproduction:** evaluate forward at yaw 0 and a small positive yaw; later compare a rightward mouse movement with the direction of view rotation.

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
