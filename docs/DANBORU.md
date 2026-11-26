# Fallen on Danboru

Fallen is part of Danboru, Fujimi's player network on the Metaru server, under the studio **Fujimi**. Integrated 2026-11-26 from the public SDK only (github.com/Fujimi-Games/danboru, tag `com.fujimi.danboru/0.6.0`; npm `@danboru/web-sdk` 0.5.0).

| Environment | App key | State |
|---|---|---|
| development | in `.env.development` | published; sign-in, events and achievements verified end to end |
| staging | in `~/.config/danboru/fallen.env` only | not used |
| production | `app_qx5rsmrl` (in `.env.production`) | published: store page, 39 resources, 14 achievements, 5 avatars |

App keys, the API URL and the server's public key are public and ship in the build (`VITE_GJ_*`). **The app secrets never go in this repository**: publishing reads `GJ_APP_SECRET` from the shell.

## What the game does

- `src/platform/danboru.js`: one module beside audio and render. `createGame` attaches it to the game's event bus; the game never calls it. Without the `VITE_GJ_*` values (tests, other hosts) it is a no-op. A server that is down only means nothing is sent.
- **Fujimi account** (right panel, under the controls): *Play as guest* (anonymous sign-in) or an email sign-in link; a guest can add an email to keep the account. On a session: `link_game` → `get_my_account` → `identify(account_id)` and `setLogin(user id)`; events carry the session token so achievements are credited. The auth client uses its own storage key (`fallen.fujimi.auth`).
- **Consent**: a prompt over the stage until the player chooses; nothing is sent before, and nothing after Decline. The panel can stop or resume sharing. The wording is a placeholder **[LEGAL REVIEW]**.
- **Achievements**: listed in the panel from `achievements.list()`, refreshed after each boss. All are `check: "rule"`: Metaru unlocks them from the events.
- `src/game/Game.js` gained three bus events for this: `run` (a run begins), `abandon` (Restart during a run), `inherit` (slot, trait, new/upgrade/kept).

## Events (`metaru/catalogue.mjs`)

| Event | Properties | Sent when |
|---|---|---|
| `run_started` | `aim_mode` | Play, or a new run after falling or restarting |
| `boss_defeated` | `bosses_in_run`, `flawless`, `aim_mode`, `run_score`, `fairness` | a boss falls |
| `trait_severed` | `category`, `trait` | a boss loses a trait |
| `weak_spot_broken` | none | a planet breaks |
| `phase_entered` | `phase` | fury or bare |
| `trait_inherited` | `slot`, `trait`, `result` | after a win, per inherited trait |
| `player_hit` | `lives_left` | a hit that does not end the run |
| `run_ended` | `reason` (`fell`/`abandoned`), `bosses_in_run`, `run_score`, `aim_mode` | the run ends |

No name, email or free text is ever a property.

## Declarations (`metaru/`)

- `manifest.mjs`: app details and store page, events, resources, achievements, avatars.
- `catalogue.mjs`: built from the game's own tables (`src/content/*`), so names cannot drift.
  - **Resources**: the 39 inheritable traits (13 muzzle, 4 flight, 4 rhythm, 2 shot, 16 melee), non-stackable. They are what a player receives in Fallen; the game does **not** grant them from outside (it does not read `rewards.pending()`), and none should be sold: see `PRODUCTS_PROPOSAL.md`.
  - **Achievements**: 14, 675 of 1000 points; 5 unlock an avatar.
- `listing.mjs`: the store page. The Fujimi site's `data/games.json` has **no entry for Fallen** (its six entries are the other five games and Two Castles), so the text comes from the game itself. No links (no public page exists yet). Tags `roguelite`; platform `web`.
- `art.mjs` draws every resource, achievement and avatar image from the game's curve library and palette (`node metaru/art.mjs`; needs `rsvg-convert`).
- `capture.mjs` films the store media from the running game in headless Chrome (`npm run dev`, then `node metaru/capture.mjs`; needs Chrome and ffmpeg). The published set was picked by hand from its output: `shot2` → `assault.jpg`, `shot1` → `purified.jpg`, `shot4` → `boss_intro.jpg`, `shot5` → `boss_down.jpg`; `shot3` was dropped (an empty-looking frame).

## Publish

```bash
SDK=<a clone of github.com/Fujimi-Games/danboru at tag com.fujimi.danboru/0.6.0>
export GJ_ENDPOINT=<the API URL> GJ_API_KEY=<the public key> GJ_APP_KEY=<the app key of one environment>
# GJ_APP_SECRET: set in your shell from your secret store, never typed into a command
node $SDK/web/bin/danboru.mjs validate metaru/manifest.mjs --strict
node $SDK/web/bin/danboru.mjs publish metaru/manifest.mjs --dry-run
node $SDK/web/bin/danboru.mjs publish metaru/manifest.mjs --env development
```

The CLI comes from the Git tag because npm has only 0.5.0, which does not know `app.listing`. Only a production publish changes the store page.

## Not done or not verified

- Email sign-in was not tested end to end (it needs a real inbox); guest sign-in was.
- Account merge (a guest whose email already has an account) is not handled; Supabase reports the error in the panel.
- No player profile schema or `save_progress`: best score and lifetime record stay in `localStorage`.
- `rewards.pending()` and `moderation.status()` are not read: backer rewards, grants and declared restrictions would not reach the game.
- Events are not published by `danboru publish` (the SDK does not send them yet); they appear in the console once players send them.
- `dist/` in the repository is the old build; it was not rebuilt or deployed.
