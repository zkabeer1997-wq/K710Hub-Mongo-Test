# Deployment Readiness Audit — K710Hub (Mongo stack)

Audited at commit `18bf43e` on `main`. Verified against the live MongoDB Atlas
cluster `K710Hub` / database `k710hub`.

## Current state

| Check | Result |
|---|---|
| `npm run build` | ✅ Passes, all routes compile |
| `npm test` | ⚠️ 87 pass / 4 fail (all pre-existing, same root cause — see B1) |
| `npm run lint` | ⚠️ 1 error, 10 warnings (error is trivial — see C4) |
| Admin API auth coverage | ✅ Every `admin-*` route gated except `admin-login` (correct) |
| Supabase fully retired | ⚠️ One route still calls the disabled client (see A1) |
| MongoDB connectivity | ✅ Live, populated, superadmins bootstrapped correctly |
| Secrets committed | ✅ None found; no `.env*` in repo |
| CI | ❌ No workflow runs build/lint/test on PRs |

The app is close to deployable. There is **one true blocker** (A1); everything
else is hardening, correctness, or hygiene.

---

## A. Blocker — fix before deploying

### A1. `/api/tool-state` (list endpoint) is dead-on-arrival

`app/api/tool-state/route.js` imports `createAdminSupabaseClient()` from
`lib/adminSupabase.js`, which now **throws unconditionally**:

> `Supabase is disabled on the MongoDB test stack. Convert this route to lib/mongo.js.`

Any `GET /api/tool-state` returns a 500. This file came from the
tools-platform-expansion branch and was written against Supabase before the
Mongo cutover.

Mitigating fact: **no client code currently calls it.** Every caller
(`lib/useToolPersistence.js`, `CostPlanner.jsx`, `AccountProgressionPlanner.jsx`,
and the four legacy optimizers) uses `/api/tool-state/${toolKey}`, which is
served by `app/api/tool-state/[tool]/route.js` — already correctly on Mongo.

**Fix:** rewrite it against Mongo. It only needs to list a member's saved plans:

```js
import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { SUPPORTED_TOOL_KEYS } from '../../../lib/toolKeys.mjs';

export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401 });
  try {
    const coll = await getCollection(COLLECTIONS.MEMBER_TOOL_STATE);
    const plans = await coll
      .find({ member_id: session.memberId, tool_key: { $in: SUPPORTED_TOOL_KEYS } })
      .project({ tool_key: 1, updated_at: 1, _id: 0 })
      .sort({ updated_at: -1 })
      .toArray();
    return NextResponse.json({ plans });
  } catch (error) {
    console.error('tool-state list GET failed', error);
    return NextResponse.json({ error: 'Unable to load saved plans.' }, { status: 500 });
  }
}
```

Deleting the file is also acceptable since nothing calls it — but converting it
is better, because the Account Progression Planner's "saved plans" concept is
exactly what this endpoint is for.

**Verify:** `grep -rn "adminSupabase\|supabaseAdmin" app lib components` should
return only `lib/adminSupabase.js` and `lib/supabaseAdmin.js` themselves.

---

## B. High — security and correctness

### B1. Four failing tests (pre-existing, blocks adding CI)

`tests/adminWorkflows.test.mjs`, `tests/allianceBearTimes.test.mjs`,
`tests/eventScheduleRoutes.test.mjs`, `tests/guideEditor.test.mjs` all fail with:

> `ERR_MODULE_NOT_FOUND: Cannot find module '.../lib/mongo'`

Cause: 55 app files import `'../../../lib/mongo'` **without the `.js`
extension**. Next.js's bundler resolves that fine, but `node --test` uses native
ESM resolution, which requires the extension. This is not caused by the tools
merge — it reproduces on pre-merge `main`.

**Fix (preferred — 4 files, not 55):** each failing test already installs a
`registerHooks` resolver that appends `.js` to a list of module names. Extend
that regex to cover the Mongo modules. In each of the four test files, find:

```js
if (/\/(adminAuth|memberAuth|bearHuntSchedule|publicBearSchedule|publicAllianceEvents|revalidateAlliancePages|ics)$/.test(specifier)) return next(`${specifier}.js`, context);
```

and add `mongo|mongoCollections` to the alternation. The exact list differs
slightly per file — match each file's existing pattern rather than pasting one
version over all four.

Then mock Mongo the way each test already mocks Supabase, or point the tests at
the collection-level seams. Run each file individually while iterating:
`node --test tests/allianceBearTimes.test.mjs`.

**Do not** "fix" this by adding `.js` to all 55 app imports — extensionless
imports are this repo's established convention and the change would touch every
route for no runtime benefit.

**Verify:** `npm test` → 0 failures.

### B2. `/api/prep-backpack` POST has no session check (IDOR)

`app/api/prep-backpack/route.js` takes `member_id` straight from the request
body and upserts on it, with no `readMemberSession` call. Anyone can overwrite
any member's prep-backpack record by POSTing their ID. The `/prep-phase-backpack`
*page* is gated by `proxy.js`, but the API behind it is not, so the gate is
cosmetic.

**Fix:** read the session and use `session.memberId` as the identity; reject when
absent. Follow the pattern in `app/api/tool-state/[tool]/route.js`:

```js
const session = await readMemberSession(request);
if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401 });
// ...then key all reads/writes on session.memberId, NOT payload.member_id
```

Check whether admins need to write on another member's behalf; if so, allow
`member_id` from the body only when `await isAdminRequest(request)` is true.

### B3. Member session tokens fall back to `ADMIN_PASSWORD`

`README.md` says explicitly: *"Set `MEMBER_SESSION_SECRET` explicitly. Do not
fall back to any database secret."* Both secret resolvers do exactly that, in
**different priority orders**:

- `lib/memberAuth.js:8` — `MEMBER_SESSION_SECRET || SUPABASE_SERVICE_ROLE_KEY || ADMIN_PASSWORD`
- `lib/memberSessionSecret.js` — `MEMBER_SESSION_SECRET || ADMIN_PASSWORD || SUPABASE_SERVICE_ROLE_KEY`

Two problems: (a) if `MEMBER_SESSION_SECRET` is unset, member session cookies are
signed with the admin password — one leak compromises both trust domains; (b) the
mismatched order means the two modules can derive *different* secrets when both
fallbacks are set, so Kingshot session audit fingerprints and the signed cookie
disagree about the key.

**Fix:** make `MEMBER_SESSION_SECRET` the only source in both files. Fail closed
in production (throw / return null so login refuses) and keep the existing
development-only random secret in `memberSessionSecret.js`. Then confirm
`MEMBER_SESSION_SECRET` is set in Vercel for every environment before shipping,
because this change makes member login **fail closed** without it.

### B4. Cron endpoint accepts a forgeable header

`app/api/cron/gift-codes/route.js:21` authorizes when
`request.headers.get('x-vercel-cron') === '1'` — a header any external caller can
set. `CRON_SECRET` must merely *exist*, not match.

**Fix:** require the bearer token to match `CRON_SECRET`; drop the
`x-vercel-cron` branch (Vercel Cron sends the `Authorization: Bearer $CRON_SECRET`
header when `CRON_SECRET` is configured, so the bearer check alone is sufficient).

---

## C. Medium

### C1. `mongoCollections.js` declares an index that would break the tools feature

`INDEXES.member_tool_state` declares `{ member_id: 1 }` with `unique: true`. The
real data model is composite — one row per `(member_id, tool_key)`. Verified live:
member `106599852` has 4 rows, `107657621` and `59360043` have 3 each. Running
`ensureIndexes()` today would throw a duplicate-key error; if it ever succeeded it
would limit every member to a single saved tool.

**Fix:** `{ keys: { member_id: 1, tool_key: 1 }, options: { unique: true, name: 'member_tool_unique' } }`.

While in that file, sanity-check the other `unique: true` claims against real
data before anyone runs `ensureIndexes()`. Confirmed clean so far: `submissions.member_id`
(no dupes), `kingshot_users.player_id` (no dupes).

### C2. Live cluster is missing unique / TTL constraints

I added plain lookup indexes to the live cluster this session (they had none
beyond `_id`, so every login and every authenticated page load was a full
collection scan):

- `kingshot_users.player_id_idx`
- `kingshot_sessions.token_hash_idx`
- `kingshot_personal_codes.player_id_idx`

The MCP tooling available could not set `unique` or TTL options. Still needed:

- `kingshot_users.player_id` → **unique** (an upsert race can otherwise create
  duplicate users with conflicting `access_role`, making permissions nondeterministic)
- `kingshot_personal_codes.player_id` → **unique**
- `kingshot_sessions.expires_at` → **TTL** (`expireAfterSeconds: 0`); sessions are
  currently never cleaned up

`lib/mongoCollections.js` already records these as the intended specs.

**Fix:** add a `scripts/ensure-indexes.mjs` that imports and runs `ensureIndexes()`
from `lib/mongo.js`, then run it once against the live cluster with
`MONGODB_URI=... node scripts/ensure-indexes.mjs`. Fix C1 **first** — otherwise
this script will fail on `member_tool_state`. Note `ensureIndexes()` is currently
exported but called from nowhere.

### C3. No CI on pull requests

`.github/workflows/` contains only `sitewide-ui-audit.yml` (Playwright UI audit).
Nothing runs `npm run build`, `npm run lint`, or `npm test` on a PR — which is how
a build-breaking bug like the corrupted XLSX escape function (fixed in `d386672`)
reached `main` in the first place.

**Fix:** add a workflow running `npm ci`, `npm run lint`, `npm test`, `npm run build`
on PRs to `main`. Do B1 first so the suite is green, otherwise CI lands red.

### C4. Lint error

`components/GiftCodeRewards.jsx:194` — unescaped apostrophe in `Didn't work`.
Replace with `Didn&apos;t work`. One-line fix; clears the only lint error.

### C5. Unauthenticated, unthrottled expensive endpoints

- `app/api/translate-ui/route.js` — proxies to external LibreTranslate. Has size
  caps (`MAX_STRINGS` 64, `MAX_STRING_LENGTH` 320) but no per-IP rate limit.
- `app/api/governor-gear-ocr/route.js` — proxies to an external OCR endpoint, no
  auth, no rate limit.

Both are cost/abuse vectors on a public deployment. **Fix:** require a member
session (both are only used from member-gated pages), and/or add simple per-IP
throttling.

### C6. Images stored as data URLs inside Mongo documents

`app/api/admin-gallery/route.js:94` and `app/api/admin-content/upload/route.js`
store uploaded binaries as data URLs because Supabase Storage is gone. This works,
but every image counts against Mongo's 16 MB per-document limit and bloats reads
of those collections.

**Fix (not urgent, but plan it):** move binaries to GridFS or an object store, or
at minimum enforce an explicit upload size cap and document the ceiling.

---

## D. Low / follow-up

- **D1.** Legacy `member_tool_state` rows are keyed by display names (`"Eris"`,
  `"Greyscale"`, `"O Bear"`) from the retired PIN era, alongside numeric Kingshot
  player IDs. Those saves are orphaned now that login issues numeric IDs — 52 rows
  total, worth a one-off migration or an accepted write-off.
- **D2.** Design-system drift in the new tools (from the earlier design audit):
  `components/tools/CostPlanner.module.css` defines a private `--cp-*` token system
  plus ~20 raw hex values instead of `app/tokens.css`, which `DESIGN.md` explicitly
  forbids; `Phase2Planner.module.css` reinvents radii off the token scale; and
  `AccountProgressionPlanner.module.css` has no `:focus-visible` styling for its
  many bare `<button>` elements.
- **D3.** No `engines` field in `package.json` and no `.nvmrc` — Node version on
  Vercel is unpinned. Local build verified on Node 22.
- **D4.** `README.md` still lists `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` as
  "legacy/transitional". Once A1 and B3 land, no code path reads them — delete the
  section so nobody sets them.

---

## Suggested order of work

1. **A1** — convert `/api/tool-state` to Mongo (the only real blocker)
2. **B2, B3, B4** — the three security fixes
3. **C1** — fix the index spec, then **C2** — run `ensureIndexes()` against live
4. **B1** — get the test suite green, then **C3** — add CI
5. **C4** — lint error; **C5**, **C6**, and section D as follow-ups

Items A1, B2, B3, B4, C1, C4 are all small and independent — they can be one PR.
B1 is the fiddliest (per-file test resolver work) and deserves its own.

## Pre-deploy environment checklist

Set in Vercel for every environment that serves traffic:

- `MONGODB_URI` — required; app throws without it
- `MONGODB_DB_NAME` — optional, defaults to `k710hub`
- `ADMIN_PASSWORD` — required; admin auth fails closed without it
- `MEMBER_SESSION_SECRET` — **required after B3**; member login fails closed without it
- `CRON_SECRET` — required for the gift-codes cron
- `KINGSHOT_API_BASE_URL`, `KINGSHOT_PLAYER_API_URL`, `KINGSHOT_PLAYER_SEARCH_URL` — verify the login flow's upstreams are set
- `CHARM_OCR_ENDPOINT`, `GOVERNOR_CHARM_OCR_ENDPOINT`, `GOVERNOR_GEAR_OCR_ENDPOINT`, `K710_LIBRETRANSLATE_URLS` — optional; those features degrade without them
