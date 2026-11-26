# Danboru SDK feedback (from integrating Fallen, 2026-11-26)

Worked only from public material: github.com/Fujimi-Games/danboru at tag `com.fujimi.danboru/0.6.0` (README, `docs/`, and the web package source where the docs stopped), npm `@danboru/web-sdk` 0.5.0, and the `install-danboru` skill. Fallen is a React + Vite web game with no accounts and no economy.

Severity: **blocker** (could not proceed from the docs), **major** (wrong or missing, cost real time or would mislead), **minor** (confusing or inconsistent).

## Versions and installation

1. **major. npm is one version behind the docs.** npm has `@danboru/web-sdk` 0.5.0; the docs at the 0.6.0 tag describe `app.listing` (the store page), which 0.5.0's CLI does not know. *Did:* game runtime from npm 0.5.0; validate and publish with `node <clone>/web/bin/danboru.mjs` from the Git tag.
2. **minor. The version is stated three ways in one tag.** `docs/install.md` says "Version 0.5.0", `docs/roadmap-and-status.md` says 0.5.0, `docs/api-reference.md` asserts `SDK_VERSION === "0.6.0"`.
3. **major. `docs/quickstart.md` is stale.** It says the package "is not published to npm", tells you to `npm install ../path/to/metaru/sdk/web` (a private path), and says the backend "is not built yet", while `docs/index.md` and the roadmap say it works end to end.
4. **minor. `@supabase/supabase-js` is needed for sign-in but no public page says so**, or which version. *Did:* installed the current one (2.x).

## Player sign-in (the biggest gap)

5. **blocker (from the public docs alone). There is no public guide to signing a player in on the web.** The docs mention the pieces in passing: `fetchTransport` `accessToken` ("the signed-in player's session token"), `setLogin(userId)` ("the auth user id"), `identify(playerId)`, and `moderation-and-grants.md` names `link_game`. Nothing says: use supabase-js against the API URL with the public key; call `link_game` with which arguments; that the player id for `identify` is `get_my_account().account_id`, not the login id; which sign-in methods the server has. *Did:* the `install-danboru` skill's accounts reference (`link_game(p_app_key, p_source, p_client)`, `get_my_account`) plus `GET /auth/v1/settings` (anonymous and email only, no OAuth providers), then checked the return shapes by calling them on development.
6. **minor. Return shapes of `link_game` and `get_my_account` are undocumented.** Both return an object with `account_id` (plus `handle`, `pool_key`, …). *Did:* printed the keys from a development call.
7. **minor. No guidance for a guest adding an email**, or for merge when that email already has an account. *Did:* `supabase.auth.updateUser({ email })` for a guest, `signInWithOtp` for a signed-out player; merge is not handled.

## The `install-danboru` skill

8. **major. The skill points at the private platform repository** (`/Users/…/Metaru`, `docs/PLATFORM_CONTRACT.md`, `backend/supabase/migrations/`, `sdk/docs/`), which an outside developer cannot read and this task forbade. Its own "read first" steps cannot be followed. *Did:* read only its `references/` files and the public repo.
9. **major. The skill is out of date (2026-11-14)** against the public SDK: it says achievements "do not exist as a platform object", "publishing knobs is not possible", the web SDK is "not on npm", and the server is `https://api.fujimi.games` (the keys file points elsewhere). Following it would have led to modelling achievements by hand.
10. **minor. The skill says "never start editing before a plan is approved"**; fine for an interactive session, but an agent working to a brief has no one to approve it. A sentence for that case would help.

## Achievements and avatars

11. **major. The `achievements` and `avatars` manifest sections are not documented.** `declaring-your-game.md` mentions them only in the publish order; `api-reference.md` describes reading them. The fields, rule shape (`event`, `measure: count|sum`, `property`, `target`, `where[]` with `eq|neq|gt|gte|lt|lte`), the 1000-point cap per game, `check: "rule"|"server"`, avatar `unlock: "achievement"|"reward"|"game_call"`, and image limits are only in `web/src/manifest.js` (`checkNetwork`). *Did:* read that function.
12. **minor. Image rules differ without saying why:** achievement images accept `.png/.jpg/.webp`, avatar images only `.png/.webp` ("square, 256 to 1024 pixels"). Only visible in source.
13. **minor. How soon a rule achievement unlocks is not stated.** It took a few seconds on development. *Did:* refresh `achievements.list()` 8 s after a win.

## Store page (`app.listing`)

14. **major. `validate` and the dev publish do not check listing fields at all.** A wrong tag, an over-long pitch or a link on the wrong host is only refused by the production publish, the one you least want to fail. *Did:* checked lengths by hand against the comments in `declaring-your-game.md`; it passed first time.
15. **minor. Allowed tags and platform keys are not in the docs.** The task supplied the public RPCs `rpc/shing_categories` and `rpc/listing_platforms`; the docs only say "from the shared category list".
16. **minor. No public way to check the store page after publishing** is documented ("open the console" assumes console access). *Did:* `POST rpc/network_games_directory` with the public key (name found in a sibling agent's notes, not in the docs; `GET /rest/v1/network_games_directory` answers "table not found").

## The CLI

17. **minor. A development publish prints `failed listing_media: only the production app publishes listing media`.** It is an expected skip, but the word "failed" makes it look like an error.
18. **minor. The human-readable `--dry-run` summary omits the store-page media, achievements and avatars** ("would publish: app details, 39 resource(s) with 58 image(s)"); `--json` has them under `plan.detail.listing_files`, `achievements`, `avatars`.
19. **minor. `--strict` warns when an event lacks `display_name`.** `events-and-roles.md` shows the field in its example, but `declaring-your-game.md` (the "one place to read") gives no event shape at all, so it is easy to miss. *Did:* added display names.

## Runtime API

20. **minor. `init({ apiKey })` with `postgrestRoutes` is ambiguous.** The table says `apiKey` is "the app key in the proposed design"; `postgrestRoutes` takes the app key itself and the server's public key goes in `headers`. One complete `init` for the real backend (fetchTransport + postgrestRoutes + accessToken + consent) in the docs would remove the guesswork. *Did:* `apiKey: appKey`, as the sibling integrations did.
21. **minor. `Environment` in the Types table is `"staging" | "production"`**; `init` accepts `"development"` too.
22. **minor. The default export is a shared singleton**; `createDanboru()` exists and is documented, which suited Fallen's no-singletons rule. Worth recommending in the quickstart for games that create and destroy their game object (React effects, hot reload).

## What worked well

- `danboru publish` itself: one command, clear per-step lines, content-hashed uploads, the secret only from the environment, `--env` guard. Development and production publishes succeeded first time.
- Rule achievements unlocked from ordinary `track()` events within seconds, credited to a guest, with no server code.
- Consent API (`needsPrompt`, `grant/deny/withdraw`, events held until a choice) was easy to wire to a small banner.
- `mockTransport`-tested docs: every runnable example was accurate.
