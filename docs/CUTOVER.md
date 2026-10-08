# K710Hub Mongo cutover checklist

## Env parity (Vercel → legendofzenzen710 project)

Required:
- `MONGODB_URI` — MongoDB Atlas connection string
- `MEMBER_SESSION_SECRET` — long random secret for member cookies
- `ADMIN_PASSWORD` — admin password login
- `ADMIN_SESSION_SECRET` — (recommended) separate secret that signs admin session tokens; falls back to `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET` or reuse admin auth secret if used
- Kingshot login secrets used by `lib/kingshotLogin.js` (public key / signing material as already configured on Mongo-Test)

Optional / feature-specific:
- Gift code wiki fetch settings if used
- Any OCR / charm vision keys if those tools are enabled

Verify: Vercel project for `k710-hub-mongo-test` and future production domain share the same variable *names*; values may differ per environment.

## Data migration checklist

| Collection / domain | Source (Supabase / prod) | Target (Mongo) | Notes |
|---------------------|--------------------------|----------------|-------|
| alliances (+ bear_times_utc) | alliances | `alliances` | Include sort_order, active |
| events | events | `events` | Recurrence fields |
| kingdom_guides / guide content | guides tables | `kingdom_guides` / guide content | Access levels |
| content_blocks | content_blocks | `content_blocks` | home, about-record, about-sources |
| gallery | gallery | gallery collection | |
| members / submissions | member roster | submissions / roster | |
| kingshot_users | — | `kingshot_users` | Created on interest accept + login |
| interest submissions | interest | `interest_submissions` | Status workflow |
| gift codes / redemptions | gift schema | matching Mongo collections | |
| form gates / tool settings | settings tables | Mongo equivalents | |

Run: `MONGODB_URI=... node scripts/seed-public-content.mjs` after migration to fill missing public defaults.

## Image storage

**Gallery images live in Google Drive** (guide images still use base64 in Mongo, 3 MB cap).
`gallery_images` documents hold metadata only (`storage: 'drive'`, `drive_file_id`, `drive_md5`,
`mime_type`, `size`, `width`/`height`, title/alt/caption/position/is_published).
Legacy rows (`storage: 'db'` / no field) keep their base64 `image_url` until migrated.

Design:
- One-time **Connect Google Drive** in Admin > Gallery (any admin / superadmin). Uses the existing OAuth
  client with `access_type=offline`, `prompt=consent`, scope `drive.file`. It reuses the existing redirect
  URI `<SITE_URL>/api/google-drive/callback` (the callback recognises the gallery flow by its own state cookie).
- The refresh token is stored in Mongo `integration_tokens` (`_id: google_drive_gallery`), encrypted with
  AES-256-GCM; key = `GALLERY_TOKEN_KEY` or HKDF(`MEMBER_SESSION_SECRET`). It never reaches the browser.
  Rotating that secret requires reconnecting. A service account is NOT supported (the repo had none, and
  service accounts have no Drive quota on personal accounts).
- App creates/finds a Drive folder `K710 Gallery`; files stay private.
- Public delivery: `GET /api/gallery/image/<gallery id>` streams from Drive (published only; admins can
  preview unpublished). `Cache-Control: public, max-age=86400, stale-while-revalidate`, ETag from the Drive
  md5, 304 without calling Drive, small-file in-memory LRU. Drive/outage -> placeholder SVG with 404/502.
- Not connected: uploads return 409 "Connect Google Drive first (one-time setup)"; there is no fallback to Mongo.
- Delete moves the Drive file to the Drive trash (recoverable), then removes the record.
- Migration: Admin > Gallery > "Move existing images to Drive" (batches of 5, verifies size, then drops
  base64), or `MONGODB_URI=... node scripts/migrate-gallery-to-drive.mjs [--yes]` (dry run without `--yes`).
- Local dev without Google: `NODE_ENV=development` only, set `DRIVE_STORAGE_FAKE_DIR` or create
  `.data/drive-fake/.enable` (gitignored); files are stored under `.data/drive-fake/`. Ignored in production.

Owner setup checklist (cannot be done by the code):
1. Google Cloud console: enable the **Google Drive API** for the project that owns the OAuth client.
2. OAuth consent screen: add scope `.../auth/drive.file`; while in "Testing", add the kingdom Google account
   as a test user (refresh tokens for Testing apps expire after 7 days: publish the app to "In production").
3. OAuth client (Web): authorized redirect URI `https://<production domain>/api/google-drive/callback`
   (plus any preview/localhost origins you use).
4. Vercel env: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `MEMBER_SESSION_SECRET`,
   optionally `GALLERY_TOKEN_KEY` (long random).
5. Deploy, open Admin > Gallery > Connect Google Drive, sign in with the kingdom account, consent.
6. Run "Move existing images to Drive"; check the `K710 Gallery` folder appears in that Drive.

## Smoke checklist (prod vs Mongo-Test)

Public:
- [ ] `/` language gate → home
- [ ] `/about` alliances + KvK record + rankings sections
- [ ] `/events` Bear Hunt + published events
- [ ] `/guides` list + one slug
- [ ] `/interest` submit → reference code
- [ ] `/interest/status?reference=...`
- [ ] `/tools` and `/forms` require Kingshot (no PIN field)
- [ ] `/admin/login` password + optional Kingshot admin

Admin (after login):
- [ ] Overview shell (sidebar + topbar)
- [ ] Events CRUD → appears on public `/events`
- [ ] Alliances Bear times → public Bear schedule updates
- [ ] Interest accept → kingshot user, no PIN returned
- [ ] KvK Members rally cutoff control visible
- [ ] Prep Ministers schedule cutoff control visible

Auth:
- [ ] PIN `/api/member-login` returns 410
- [ ] PIN `/api/member-register` returns 410
- [ ] Admin password still works
- [ ] Logout clears member + admin + login-flow cookies


## Security hardening notes (2026-10)

**Indexes at runtime.** `instrumentation.js` calls `ensureIndexes()` once per
Node server process on boot (non-fatal: failures are logged as `[indexes] ...`
and the app still starts; skipped when `NODE_ENV=test`, `QA_NO_DB=1`, no
`MONGODB_URI`/`MONGO_URI`, or on the edge runtime). `node scripts/ensure-indexes.mjs`
remains the way to apply them explicitly and exits 1 listing any index that
could not be built (usually a unique index blocked by historic duplicates).

**New collection: `event_cycle_snapshots`.** Frozen per-cycle copies of roster rows (KvK
`submissions`, `flamedragon_forms`) so history survives members resubmitting in a newer
cycle. Created on first write; its indexes (`type_cycle_member_unique`, `type_cycle_idx`,
`member_id_idx`) come from `ensureIndexes()`. Rally planner rows (`admin_rallies`,
`admin_flamedragon_rallies`) gain an optional `event_cycle_id`; untagged rows count as the
current cycle, so no data migration is needed.
New in this pass: TTL `rate_limits.expires_at`; `kingshot_sessions
(token_hash, revoked_at)`; `kingshot_users.access_role`;
`interest_submissions (intake_period_id, created_at)`; `gallery_images`
`id` and `(is_published, position, created_at)`; `kingdom_guides.slug`,
`guide_content.slug`, `guide_attachments.path` (all non-unique, so none can
fail on existing data).

**Rate limiting.** `lib/rateLimit.mjs` `checkRateLimit()` keeps fixed-window
counters in the `rate_limits` collection (atomic `$inc` upsert, TTL cleanup),
so limits are shared across serverless instances. If Mongo errors, auth/abuse
routes (admin login, interest submit, interest status) fall back to the
per-instance in-memory limiter (still enforced); cost-only routes (translate-ui,
governor-gear-ocr) pass `failOpen: true` and allow the request.

**CSRF / Origin.** `proxy.js` now also matches `/api/:path*` and rejects any
POST/PUT/PATCH/DELETE whose `Origin` host differs from the request host, or
whose `Sec-Fetch-Site` is `cross-site`/`same-site` (`lib/sameOrigin.js`).
Requests with neither header (curl, server-to-server, tests) pass, and
`/api/cron/*` (Bearer secret) is exempt. Because this is a proxy change,
restart the server after deploying. A reverse proxy must forward the original
`Host` (or `X-Forwarded-Host`).

**Member session revocation.** `readMemberSession` (and therefore proxy.js and
every member route) now also checks the `kingshot_sessions` row for the cookie:
revoked or expired rows reject the cookie; no row (legacy cookie) is still
accepted. Results are cached in-process for 30 seconds, logout clears the local
cache entry immediately, other instances converge within 30s. If Mongo is
unreachable the signed cookie (with its own 30-day expiry) is trusted rather
than locking everyone out. proxy.js runs on the Node runtime, so the dynamic
`import('./mongo.js')` there is fine; `lib/memberAuth.js` has no static Mongo import.

**Uploads.** Gallery, guide-image and interest uploads are accepted only when
the leading magic bytes are a real JPEG/PNG/WebP/GIF matching the declared type
(`lib/interestUploadLimits.mjs` `sniffImageType`), on top of the size caps.
List endpoints no longer return base64 blobs: `GET /api/admin-gallery` and
`GET /api/admin-interest-submissions` return links to
`/api/admin-gallery/<id>/image` and
`/api/admin-interest-submissions/<id>/screenshot/<n>` (admin-only, bytes served
on demand). The public gallery (`lib/gallery.js`) still reads `image_url`
inline; moving it to a cached image route is the next step if it gets heavy.

**KvK auto-allocate** no longer does `deleteMany` + `insertMany`. It ordered-
bulkWrites upserts keyed on the unique slot index, removes only rows that would
collide beforehand (restoring them if the write fails), and deletes the leftover
stale slots last. A true transaction would need a replica set, which standalone
local Mongo is not.

**Google Drive callback CSP.** `/api/*` CSP no longer allows `'unsafe-inline'`
scripts; `/api/google-drive/callback` is excluded from that header and sets its
own nonce-based CSP and escapes the message it renders.

## Per-cycle member forms (2026-10)
Every member form except Power Profile is saved per event cycle (KvK: Availability, Prep, Appointments;
Flamedragon: Dragon, Noble Advisor). Prep and Noble are one row per (member_id, event_cycle_id); Availability
and Dragon keep one roster row per member plus `event_cycle_snapshots` for earlier cycles.

On cutover:
1. Run `node scripts/ensure-indexes.mjs`. It drops the old one-row-per-member `member_id_unique` index on
   `prep_backpack` and `noble_advisor_submissions` and creates `member_cycle_unique` (partial, tagged rows only).
2. Legacy rows without `event_cycle_id` (imported prep/noble/availability/dragon rows) are tagged with the OLDEST
   cycle of their type by `backfillCycleTags()` (lib/eventCycles.server.js). It runs once per server process the
   first time a cycle is read, is idempotent, and needs no manual step. Start the new cycle afterwards: members then
   see every cycle form as "not done" with last cycle's answers offered as a starting point.

## Page addresses (route aliases)

SuperAdmins can rename public pages in Admin > Settings > Page addresses (collection `route_aliases`, created on first save; indexes in lib/mongoCollections.js). proxy.js rewrites the new address to the canonical page and 308-redirects (Cache-Control: no-store) the old one. The proxy reads the map from `/api/route-aliases` on its own origin (cached 15s, fails open). After deploying or changing proxy.js, restart the server.
