# Fallen: store products proposal

For the Fujimi studio, which builds products in the Metaru console. Proposal only: nothing was created. 2026-11-26.

## Recommendation: no paid products for now

Fallen has no currency and no shop. The only things a player receives are **traits inherited from bosses** (published as the 39 resources `muzzle.*`, `flight.*`, `rhythm.*`, `shot.*`, `melee.*`). They are the game's power progression *and* its life count: each inherited trait adds firepower and absorbs one hit (`src/game/arsenal.js`, `Player.loseLife`). A run always starts with nothing inherited (`Game.beginRun`).

So there is nothing a product could contain that would not change how hard a run is, and two things in the game depend on runs being equal:

- **Score and best run** (`src/game/Run.js`): a bought trait inflates both.
- **Achievements** (`metaru/catalogue.mjs`): *The Plateau*, *Orrery*, *Untouched* and *Five in a Row* measure runs. A bought trait makes them meaningless for everyone.

The game also cannot deliver a product today: it does not read `rewards.pending()` and has no code to add an outside trait to a run.

## Must not be sold

| Resource keys | Why |
|---|---|
| all 39: `muzzle.*`, `flight.*`, `rhythm.*`, `shot.*`, `melee.*` | power and extra lives; breaks score and achievements |

Also not to be given as Shing backer rewards or Moderation grants, for the same reason.

## If the studio wants something to sell later

Only cosmetics would fit, and none exist in the code yet. The project's design notes list ship shapes that were considered (ankh, crescent, vesica, athame, winged sun, armillary); the game draws the crescent. The others as cosmetic skins, or a ship colour, would sell without touching the run. That needs new game code (a cosmetic slot that reads granted resources) and new resources, so it is a game change first, then a product. Suggested price if built: GBP 2 to 3 per skin, or GBP 5 for a set; a guess, not based on Fallen's numbers (it has no players yet).
