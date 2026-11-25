# Part 1 — Understanding STILLFRAME

Source: the unchanged [index.html](index.html). All line numbers refer to this version. This is static code analysis; no manual browser verification has been completed. Intended behaviour is distinguished from what the implementation actually expresses. Reading time: about five minutes.

## 1. Game overview

STILLFRAME is a single-player, first-person browser action game rendered with WebGPU. It combines shooting, melee attacks, throwable objects and enemy waves. Level definitions are grouped into three acts (`LEVELS`, line 3388). `boot()` creates the graphics system and `Game`, then starts its loop (7394–7423).

**Objective:** survive and complete each level. `World.checkWin()` (5775–5791) normally requires all waves to have spawned, the spawn queue to be empty, and no enemies remaining. Levels with an exit instead require entering its rectangle; `requiresClear` determines whether enemies must also be eliminated. Results record completion and best times (`Game.showResults`, 6905–6931).

| Input | Action in the source |
| --- | --- |
| WASD or arrow keys | Move |
| Mouse | Look while the canvas has pointer lock |
| Space | Jump |
| Left click | Contextual action: shoot, slash with a blade, throw an object/empty gun, pick up a nearby aimed item, or punch |
| Right click | Throw held item |
| E | Pick up an item; discard the held item if necessary |
| R | Restart |
| Esc | Advertised pause control; browser pointer-lock release triggers `Game.pause()` |
| F2 / F3 / F4 | Toggle frozen time / real-time override / debug overlay |

Evidence: bindings 1876–1902; pointer handling 1932–1942 and 2012–2017; actions 5302–5379; pause listener 6774–6777; debug handling 6964–6969. `Input.pollGamepad()` (2022–2053) also implements standard-mapping controller input.

**Distinctive mechanic:** the title says “time moves only when you move” (3542). `TimeScaleDriver` (6161–6190) computes a smoothed simulation speed from movement, looking, actions and airborne state. Its minimum is **0.015**, not a complete stop; looking contributes up to 0.35, actions briefly request full speed, and being airborne requests at least 0.8. `Time.advanceSim()` (2084–2088) multiplies real elapsed time by that scale. Player movement uses real time (6959–6961, 6991), while world simulation uses scaled fixed steps.

**Observed mismatch:** line 6998 passes `WALK_SPEED` before current player speed, but line 6177 expects current speed before maximum speed. Thus line 6179 computes the reciprocal of the intended movement ratio. For a stationary player, the supplied ratio is `4 / 0`, clamped to 1. This predicts incorrect slow-motion behaviour; it is not a browser-tested result.

## 2. Code architecture

These are logical subsystems within one module, not separate source modules. Arrows below mean “calls, supplies data to, or constructs.”

```text
boot → Gfx + Game
              ├─ Ui ↔ settings/save
              ├─ Loop → Time
              │    └─ Game.frame → Input → PlayerController
              │                     └─ World + TimeScaleDriver
              ├─ Game.fixedStep → World → enemy AI
              │                          ├─ StaticWorld / NavGrid
              │                          └─ waves / combat / props
              ├─ ReplayRecorder → ReplayPlayer → separate World
              └─ Game.render → world events → AudioEngine / FxSystem
                            └─ Camera / poses / Viewmodel → Renderer → Gfx
Level definitions → scene/mesh builders + World
```

| Subsystem and source locations | Responsibility and dependencies |
| --- | --- |
| `Game` (6704–7387) | Owns components, game states, level loading, settings and presentation; wires UI and loop callbacks. |
| `Input`, `PlayerController` (1904–2054, 6071–6159) | Collect browser/controller input; update player look, velocity and collision-aware movement using `World.static` and enemy positions. |
| `Time`, `Loop`, `TimeScaleDriver` (2056–2156, 6161–6190) | Schedule animation frames, accumulate scaled time, run fixed simulation steps and calculate time scale. |
| Levels and geometry (2509–3393, 3837–3923, 4583–4612, 4685–4790) | `LevelBuilder` defines rooms, props and waves; `MeshBuilder`, `buildLevelMesh`, `buildMeshLibrary` create scene/character/item geometry. Themes supply materials and lighting. |
| `StaticWorld`, `NavGrid` (3999–4581) | Collision/raycast queries and navigation; navigation is constructed from static collision geometry. |
| `World`, enemy functions (5221–6052, 4846–5196) | Own gameplay state, waves, pickups, combat, projectiles and win/loss. `updateEnemy` uses visibility, navigation and weapon logic. `Rng` (4614) supplies seeded randomness. |
| `Gfx`, `Mesh`, `Renderer`, `Camera` (509–665, 1163–1874) | Manage GPU/canvas, buffers, render passes and camera matrices; use embedded WGSL shaders (666–1133) and CDN-imported matrix utilities (505). |
| Presentation (6195–6569, 6623–6693, 2233–2507) | `FxSystem`, `Viewmodel`, `computePose` produce particles and animation; `AudioEngine` and `SYNTHS` generate sound. `Game.handleEvents` (7265 onward) connects world events to effects/audio. |
| `Ui`, persistence, `DebugOverlay` (3400–3814) | DOM menus/HUD, settings, progress and diagnostics; `loadSave`/`writeSave` use `localStorage`. UI callbacks invoke `Game`. |
| Replay (6571–6621) | `ReplayRecorder` copies player frames and step counts; `ReplayPlayer` applies them to a separate `World` and repeats recorded fixed steps. |

## 3. One frame: key press to pixels

This traces the implemented **playing-state path**, assuming a level is active and pointer lock is held; it does not claim startup succeeds.

1. A W keydown reaches `Input.onKeyDown()` → `press()` (1984–2001), storing the key in held and newly-pressed sets.
2. `requestAnimationFrame` invokes `Loop.tick()` (2143–2155). `Time.beginFrame()` calculates capped real elapsed time, then the loop calls `Game.frame()`.
3. `Input.update()` snapshots new presses. `PlayerController.update()` calls `look()` and `Input.moveAxes()`, integrates movement, and resolves collisions with `StaticWorld.moveCharacter()` (6103–6139).
4. `toFrame()` packages player state/actions; `World.applyPlayerFrame()` copies them and applies interactions. `ReplayRecorder.push()` records the frame; `TimeScaleDriver.update()` sets simulation speed (6991–6998).
5. `Time.advanceSim()` accumulates scaled time. `consumeStep()` permits zero to eight **1/120-second** steps per display frame. Each invokes `Game.fixedStep()` → `World.step()`, updating cooldowns, waves, enemies, props, projectiles and win conditions (5676–5718).
6. `Time.endSteps()` computes interpolation alpha. `Game.render()` checks outcomes, records step counts, consumes events, updates effects/cameras, and queues world/viewmodel geometry (7038–7119).
7. `Renderer.render()` (1476–1605) encodes shadow, opaque, glass, effects, viewmodel, outline, bloom and final passes as applicable. It targets `getCurrentTexture()` and submits GPU commands through `device.queue.submit()`; GPU execution and browser presentation produce canvas pixels. HUD/overlay DOM updates follow (7120–7130), and the loop schedules another frame.

## 4. Design problems

1. **Mixed source responsibilities.** CSS (8–489), JavaScript starting at 504, shader strings (666–1133), and level content (2611–3388) share one file. Editing unrelated systems creates noisy reviews and makes isolated reuse/testing harder.
2. **Oversized coordinator with rendering side effects.** `Game` spans 6704–7387. Its `render()` changes gameplay states (7041–7044), records simulation counts and drains events. Rendering and gameplay progression are therefore coupled, complicating headless tests and changes to rendering frequency.
3. **Ambiguous positional contracts.** The six-argument `TimeScaleDriver.update()` call at 6998 swaps two numeric arguments relative to 6177. Nothing in this JavaScript signature rejects that mistake. Understanding or changing callers requires manually checking argument order across distant code.
4. **Gameplay policy owned by UI.** `Game.startLevel()` (6838–6840) delegates admission to `Ui.isUnlocked()` (3717–3721). Progression rules become tied to presentation. The boundary check accepts negative indices, but index 0 consults `levels[-1]` and returns false: a concrete source-level concern, left unchanged.

## 5. Independent verification results

The student independently cross-checked the following two findings against the original HTML source and confirmed both through **static source-code analysis**. The consequences below follow from the code; manual browser verification has not been reported.

### Confirmed: reversed time-scale arguments

- **Evidence:** `TimeScaleDriver.update(realDt, planarSpeed, maxSpeed, lookSpeed, airborne, busy)` at **6177** calculates `clamp(planarSpeed / maxSpeed, 0, 1)` at **6179**. However, `Game.frame()` at **6998** supplies `dt, WALK_SPEED, this.player.planarSpeed, ...`. `WALK_SPEED` is **4** at **6064**.
- **Independent check:** matching arguments to parameter positions confirms that current speed and maximum speed are reversed. At current speed 0, the actual ratio is `4 / 0` (Infinity), which clamps to 1, rather than the intended `0 / 4`.
- **Consequence:** movement contributes a full-speed target even while stationary, and for speeds between 0 and 4. Lines **6182–6187** smooth the time-scale value toward that target rather than the minimum slow-motion scale. This undermines the intended movement-controlled time mechanic during normal gameplay; it does not mean the smoothed value becomes 1 instantly or overrides explicit debug time locks.

### Confirmed: incorrect first-level unlock condition

- **Evidence:** `Ui.isUnlocked()` at **3717–3721** accepts `index < 0`, then reads `this.levels[index - 1]` and returns `!!prev && !!this.save.levels[prev.id]?.cleared`. `Game.startLevel()` at **6838–6839** returns immediately if this predicate is false.
- **Independent check:** substituting the first level's index, **0**, makes `index < 0` false. `this.levels[-1]` is undefined, so `!!prev` is false and the level is rejected.
- **Consequence:** starting level 0 through `Game.startLevel()` is blocked before level loading and the intro begin (**6843–6845**). A fresh player therefore cannot enter the first level through the normal Play path. This is a confirmed control-flow result, not a claim that the browser symptom was manually reproduced.

**Additional verification exercise (not reported as independently completed):** for scaled fixed steps, inspect **2056–2058**, **2084–2101**, **2147–2153**, and **7033–7035**. Trace scaled-time accumulation, 1/120-second steps, the eight-step cap, and the call to `World.step()`.

Neither bug has been fixed. `index.html` remains unchanged.
