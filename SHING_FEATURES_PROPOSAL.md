# Fallen: Shing Features proposal

Features players could back on Fallen's Shing page. Proposal only, for the studio to approve, price and create. 2026-11-26. Amounts are suggestions, not based on Fallen's numbers (it has no players yet).

## 1. `gamepad_support`: Play with a controller

| Field | Value |
|---|---|
| Name | Play with a controller |
| Funding goal | GBP 1,500 |
| Suggested pledge | GBP 5 |
| Days open | 30 |

Fallen is keyboard and mouse only today: movement, focus, pause, restart and the Hard mode's mouse aim. This Feature adds gamepad support: the left stick moves, the right stick aims in Hard mode (a twin-stick shooter feel), triggers for focus, and the existing Settings panel learns to rebind pad buttons as it already rebinds keys. Bullet-hell dodging is precise work, so the stick needs a dead zone and a focus mode tuned to match the keyboard's speed; the fairness proof is unaffected, since it models the ship's speed, not the input.

**Source in the game's docs:** the project's design notes (2026-11) list "Competitive format and controller/rebinding are 'later'"; rebinding has since shipped (`src/ui/Settings.jsx`, `src/game/bindings.js`), the controller has not (`src/game/Input.js` reads keyboard and mouse only).

## 2. `new_attack_family`: A new family of boss attacks

| Field | Value |
|---|---|
| Name | A new family of boss attacks |
| Funding goal | GBP 3,000 |
| Suggested pledge | GBP 8 |
| Days open | 45 |

Every Fallen boss is assembled from attack families: emitters, rays, melee shapes and Chladni plates, each a mathematical object. This Feature funds one more family, chosen with backers from a short list the developer proposes, built the way the game's architecture prescribes: a new layer behaviour, a fairness marker so every boss that uses it is still proven survivable, a generator so it appears in procedural bosses, a drawing in the star-chart style, and its own voice in the generated music. A new family also means new traits to inherit when those bosses fall.

**Source in the game's docs:** `ARCHITECTURE.md`, "Extending → New attack type" (add `sim/layers/<name>.js`, register it, add a marker in `fairness/marks.js`, a generator in `procgen`, a drawer in `render/layers.js`), and the instrument registry note in the design notes ("Add an instrument = one entry + a line in ensemble.js").

## Backer rewards

None proposed. Fallen's only items are inherited traits, which must not be given outside a run (see `PRODUCTS_PROPOSAL.md`), and the game does not read `rewards.pending()` yet. An avatar reward would fit (avatars are given by Metaru directly), but it needs new art and an avatar declared with `unlock: "reward"`; none is declared today.
