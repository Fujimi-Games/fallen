# FALLEN — architecture

## Problems with the prototype layout
- `Game extends World`: one 850-line class owns input, player, scoring, persistence,
  boss supply, effects, audio calls and the mode machine. It cannot run without a canvas.
- Attack types are `if/else` chains on `L.type` in four places (update, player hit,
  bullet cutting, fairness marking). Adding an attack means editing all four.
- Persistence (`localStorage`) is hand-rolled three times; audio is called directly from
  game logic; `patterns.js` / `melee.js` mix math helpers, content tables and geometry.
- Phases do not exist: "melee only" is an accident of trait order.

## Rules
1. **Layers only depend downward**: `core → content → procgen/sim → game → render/audio/ui`.
   `sim` and `fairness` never touch DOM, canvas, audio or storage (they run in a Worker).
2. **No singletons, no module-level mutable state.** Everything stateful is a class
   instance created by `Game` and passed down (`events`, `store`, `effects`, `input`…).
3. **Open/closed via registries.** New content or attack types are *added*, not wired in:
   a layer behaviour (`sim/layers/*`), a spawner, a melee shape, a phase.
4. **Game logic talks through events**, not by calling audio/FX: `events.emit('sever', …)`;
   `Music` and `Effects` subscribe.
5. **Presentation is injected.** `Game` takes `{ input, renderer, music, store }`; a test
   passes null/fakes and runs the whole game headless.

## Layout (as built)
```
src/
  core/      math.js  rng.js  config.js  events.js (Emitter)  storage.js (Store)
  content/   spawners motions mods paths fields melee playerMelee difficulty   — pure maths tables
  procgen/   generateBoss.js   (seed + level → BossDef, traits, progression)
  sim/       World.js          bullets + boss stepping, hazard/cut queries (no DOM, no player)
             Boss.js           traits, durability, phase, tempo, boss clock
             phases.js         data: assault ×1 → fury ×2
             layers/           registry + emitter / rays / melee / chladni behaviours
  fairness/  grid.js marks.js verify.js worker.js client.js   — viability proof
  game/      Game.js (mode machine + rules)  Player  PlayerMelee  Run  BossSupply
             Input  Loop  arsenal.js  createGame.js (composition root)
  fx/        Effects.js (sparks, shake)  Grid.js
  audio/     Music.js  NullAudio.js
  render/    Renderer.js  layers boss entities hud util
  ui/        App  Dossier  Record  hue.js
test/        fairness.test.mjs  game.test.mjs   (npm test, no DOM)
```

## Phases (new)
`phases.js` is an ordered list. A phase has `id`, `when(boss)` (first match wins, latched
forward only), `tempo` (multiplier of the boss clock) and `enter(world)` (events).

| phase | when | tempo |
|-------|------|-------|
| `assault` | any non-melee trait left | ×1 |
| `fury`    | exactly one trait left (always melee), full durability | ×2–2.8 by distance |
| `bare`    | zero traits left: nothing attacks, `briefHp` hits finish it | ×1 |

`Boss.t` is the **boss clock** (advances `dt · tempo`; every equation, path and melee
shape reads it). `Boss.age` is real elapsed time (intro, player-melee beat slot).
Fairness proves the `fury` state at tempo ×2 with marks taken twice as often, so the
sweep inflation constants stay valid.

## Extending
- **New attack type**: add `sim/layers/<name>.js` (`update`, optional `hits` / `cuts` /
  `pressure`), register it in `layers/index.js`, add a marker in `fairness/marks.js`,
  a generator in `procgen`, a drawer in `render/layers.js`.
- **New phase**: append to `sim/phases.js`. `tempo` and the banner are data; the
  fairness proof picks the phase up from the trait state.
- **New score rule / persistence key**: `game/Run.js`, through the injected `Store`.
- **Headless play**: `new Game({ fairClient })` runs with no canvas, input or audio.
