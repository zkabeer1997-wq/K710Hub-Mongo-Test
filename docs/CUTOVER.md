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

## Image storage (no object storage on this stack)

Supabase Storage isn't part of this stack, so `admin-gallery` and
`admin-guide-images` store uploaded images as base64 data URLs directly in
their Mongo documents instead. MongoDB's hard cap is 16 MB per document, and
base64 inflates a file's size by ~33%, so upload caps are set well below
that: 4 MB for gallery images (`app/api/admin-gallery/route.js`), 3 MB for
guide images (`app/api/admin-guide-images/route.js`). Don't raise either cap
without re-checking the real per-document ceiling.

This works but doesn't scale: every read of a gallery/guide list pulls full
image bytes along with it, and the collection grows one image at a time
with no CDN caching. If image volume grows, move to GridFS or an external
object store (S3/R2/Vercel Blob) instead of raising these caps further.

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
