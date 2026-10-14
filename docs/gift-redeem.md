# Gift code auto-redeem

When a new Kingdom 710 gift code appears, the site redeems it for enrolled players automatically, using the same
logic and delays as the owner's Discord bot. Nothing changes until an admin switches it on.

## How it works

1. **Discovery** (unchanged): `/api/cron/gift-codes` reads the public code lists (kingshot.net, optionally
   kingshotmastery.com) and writes `gift_codes`. Admins can also paste codes on the Gift codes page.
2. **Queue**: every active code is checked against every enabled, not-failed player. A player/code pair with no row in
   `gift_redemptions` is "waiting".
3. **Runner** (`lib/giftRedeem/runner.mjs`, route `/api/cron/gift-redeem`): takes a lease, walks the waiting pairs,
   writes one result row per player right after each attempt (this replaces the bot's `processedPlayerIds`), and stops
   when its time budget is used up. The next run continues where it stopped; nobody is ever redeemed twice.
4. **Results** per (code, player): `success`, `received` (already had it), `expired`, `unknown`, `login_failed`,
   `skipped`. Members see them in their dashboard; admins see them under Redemption history.

### Fixed pacing (copied from the bot, `lib/giftRedeem/constants.mjs`, do not lower)

| Rule | Value |
| --- | --- |
| Pause after every player | 800 ms |
| Pause between tries for one player | 3000 ms, at most 5 tries (unclear answers and `login_failed` are retried) |
| Extra pause after every 15th player | 5000 ms (counts players already finished for that code, also across runs) |
| `20000` / `40008` | done (redeemed / already had it) |
| `40007` expired | done, and the rest of that code is skipped; the code is switched off (`expired_reason: game_expired`) |
| `40017` recharge | `skipped`, no retry |
| `40001` login failed | retried like any other answer; after 5 tries the player is marked failed and skipped for all later codes until an admin re-enables them |
| Network error / timeout | `skipped` (no retry), like the bot. "Reprocess unprocessed players" retries skipped and unclear ones |

The bot has no "player check" call before redeeming (its README mentions a 500 ms gap, but no code does); none was added.

Requests are form-encoded POSTs with the bot's headers and body `{fid, kid, cdk, captcha_code: '', time}` plus `sign`
(md5 of the sorted `key=value&...` string followed by the secret). A 20 s per-request timeout was added for serverless.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `GIFT_REDEEM_SIGN_SECRET` | **Required.** Request-signing secret. No default: without it the runner is disabled and the admin page says so. Value = the secret constant in the bot's `src/sign.js` (the string appended before hashing). Never commit it. |
| `GIFT_REDEEM_BUDGET_MS` | Optional. Wall-clock budget of one run, default `200000` (min 10000, max 780000). Keep it under the route's `maxDuration` (300 s) minus about 60 s. |
| `CRON_SECRET` | Already used by the crons. Also authorises the automatic "start the next run" call. Without it, chaining is off and runs only start from the daily cron or the admin button. |
| `GIFT_REDEEM_ENDPOINT` | QA only. Points the runner at a local mock. Leave unset in production (defaults to the real service). |

## Turning it on (owner steps)

1. Open the bot's `src/sign.js` and copy the secret string constant.
2. Add `GIFT_REDEEM_SIGN_SECRET=<that value>` to `.env.local` and to the Vercel project (Production). Redeploy.
3. Make sure `CRON_SECRET` is set on Vercel.
4. Admin, Gift codes: add players (single, bulk paste, or import the bot's `player_ids.json` / `player_submissions.json`).
5. Flip **Automatic redeeming** to On. Press **Process now** to start immediately; otherwise it starts with the next code.

## Scheduling, chaining and Vercel limits

* A run lasts at most `GIFT_REDEEM_BUDGET_MS`, then ends cleanly. If work is left, it calls
  `/api/cron/gift-redeem?mode=async` on itself with the `CRON_SECRET` bearer token; that request answers `202`
  immediately and does its work in `after()` (Next.js), a fresh invocation with its own time limit. Chains are capped at
  40 in a row.
* A lease document (`gift_runner`) stops two runs from overlapping. It expires on its own, so a crashed run never blocks.
* Triggers: discovery cron (after new codes), admin adding codes/players, a member turning auto-redeem on, the admin
  "Process now" button (same endpoint, admin session, same-origin only), and the daily safety-net cron.
* `vercel.json`: discovery `0 14 * * *`, redeem tick `30 14 * * *`. On the **Hobby** plan crons can run once per day at
  most and `maxDuration` is capped at 300 s (Fluid Compute), so the defaults rely on chaining. On **Pro**, change the redeem
  tick to something like `*/10 * * * *` and, if you like, raise `maxDuration` and the budget.
* Roughly 150 players fit in one 200 s run (about 1.1 s each including the 15th-player pause); more players simply take more chained runs.

## Consent

* Members opt in themselves with a checkbox on their dashboard ("Redeem new Kingdom 710 gift codes for my account
  automatically"), default off. Their player ID comes from their session and the kingdom is always 710; neither is taken
  from the request. Opting out pauses them at once.
* Admins can add players by ID and kingdom, pause, remove, and re-enable players the game rejected. Imported players keep a
  `bot_import` source. Other kingdoms are allowed for imports and flagged in the table.
* Every admin and member change is stored in `gift_audit` (shown as "Recent changes").

## Importing the bot's lists

Gift codes page, Players, "Import from the Discord bot": pick `player_ids.json` (`playerIds`, `failedPlayerIds`,
`kingdomByPlayerId`) or `player_submissions.json` (`userPlayerIds[discordId] = {playerId, kingdom}`). The browser reads
the file and sends only the player IDs and kingdoms. A preview shows the count before you confirm; players already
enrolled are not duplicated and bot-failed players stay paused.

## Risk, in plain words

The redeem endpoint is the game's own web page backend, not a public API. It is signed with a secret taken from the bot
and could change or block this traffic at any time. The delays above are deliberately gentle; do not shorten them.
If it breaks, switch the option off on the Gift codes page. Codes and players are kept.

## Tests and QA

* `npm test` (unit tests use a fake clock and injected fetch; no real sleeping, no real endpoint).
* `node scripts/dev/qa-gift-redeem.mjs`: Playwright journey on port 3017 against a local mongod and
  `scripts/dev/mock-gift-server.mjs`. It uses the real delays on a few players (about 4 minutes) with a 10 s budget so the
  chained resume is exercised. No pacing scale exists in production code.
