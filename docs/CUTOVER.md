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
- `GIFT_ENABLE_KINGSHOTMASTERY=1` (optional, default off): also read kingshotmastery.com/gift-codes automatically. Its Terms of Service forbid robots/data gathering, so only set it with the owner's explicit decision.
- `CRON_SECRET` — the daily `/api/cron/gift-codes` job reads kingshot.net/gift-codes (robots.txt obeyed, 1 attempt per 30 min, snapshots in `external_snapshots` as `giftcodes:<host>`); a 401/403/429 pauses that source for 24h. Admin > Gift codes shows source status, Check now / Force check and a Paste codes box.
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

**Every image the website stores lives in Google Drive; MongoDB keeps metadata only.** One root folder
`K710 Website` (find-or-create, ids cached in memory + `drive_folders`) with this tree, created on first use:

```
K710 Website/
  Gallery images/
  Guides images/
  Hero images/
  Tools and calculators images/
  Help images/
  Applications/<Player ID>/     (one subfolder per applicant, digits only)
```

| Path | What happens |
| --- | --- |
| Admin > Gallery, "Upload Image" | file -> server -> `Gallery images`; `gallery_images` row has `drive_file_id` etc. |
| Admin > Gallery, "Choose from Drive" | Google Picker -> server **copies** the file into `Gallery images` (owned by the connected account) |
| Guide builder upload / "Choose from Drive" or "Upload Image" | `Guides images`; `guide_attachments` row (metadata) keeps the public URL `/api/guide-images/<uuid>.<ext>` (same-origin proxy, `public, max-age=31536000, immutable`, ETag/304) |
| Apply form (/interest) | each validated screenshot -> `Applications/<Player ID>/screenshot-<n>-<timestamp>.<ext>`; `interest_submissions` keeps `screenshot_files` (`drive_file_id`, name, mime, size, md5, folder id), `drive_folder_id`, `drive_folder_link` |
| Hero / tool images (next work) | `storeSiteImage({ folder: 'hero' \| 'tool', ... })` or the shared `ImageUploadField`, see below |

Legacy rows keep working: gallery rows via their stored `drive_file_id` (the old `K710 Gallery` folder is left
alone; `drive.file` cannot rename folders the app did not create, new gallery uploads go to
`K710 Website/Gallery images`), guide rows and application rows with base64 still render until migrated.

### Applications: Drive is the destination, with a documented fallback

Honest trade-off: the owner asked for no database storage, but silently rejecting (or losing) an applicant
because Drive is disconnected or down is worse. So `POST /api/interest`:

1. validates everything as before (magic bytes, size, field rules);
2. inserts the application first (`screenshot_state: 'pending'`), then uploads each file to the applicant folder
   (`client_request_id` makes a retry resume the same row, reuse the same folder and skip finished files, never
   duplicating rows, folders or files);
3. if Drive is **not connected or fails**, the screenshots that could not be uploaded are kept as base64 in
   `screenshot_urls` (`screenshot_storage: 'db'` or `'mixed'`) and the application is still saved;
4. Admin > Inbox shows **"N applications have screenshots waiting to move to Drive"** with a **Move to Drive**
   button (`POST /api/admin-interest-submissions/migrate`, batches of 3, verifies size, then drops base64);
   the same button exists in Admin > Gallery. The next submission that reaches Drive also moves up to 2 waiting
   rows in the background (`after()`).

Admin Inbox drawer shows screenshots through the admin-only proxy `GET /api/admin-interest-submissions/<id>/screenshot/<n>`
(no public access, Drive ids never reach the browser) plus **Open applicant folder in Drive** (`webViewLink`).
Rows with a non-numeric Player ID (legacy) go to `Applications/unknown-player-id`; path tricks are rejected.

### Shared API for later work (hero images, tool images)

Server (`lib/siteImages.server.js`, admin routes only; authorise first):

```js
import { getSiteImages, storeSiteImage, copyPickedImage, siteImageUrl, publicSiteImage } from '<rel>/lib/siteImages.server';
const doc = await storeSiteImage({ folder: 'hero', subfolder: 'Home page' /* optional */, file /* File or {bytes,type} */, name, alt, createdBy, maxBytes });
const doc2 = await copyPickedImage({ folder: 'tool', fileId /* from the Picker */, alt });
publicSiteImage(doc)  // { id, folder, url: '/api/site-image/<id>', name, mime, size, width, height, alt }
siteImageUrl(id)      // '/api/site-image/<id>'  (client-safe, from lib/siteImages.mjs)
```

`folder` is one of `gallery | guide | hero | tool | help | application` (`SITE_FOLDERS` in `lib/driveFolders.mjs`; `application`
requires a numeric `subfolder` = Player ID). Errors are `SiteImageError` with a plain `message`/`status` (409 +
`needsConnect` when Drive is not connected). Metadata lives in `site_images`: `{ _id, folder, subfolder?, storage:
'drive'|'reference', drive_file_id, drive_folder_id, name, mime, size, md5, width, height, alt, created_at, created_by }`.
Store `url` (or the id) in your own record, never a Drive id. `GET /api/site-image/<id>` streams from Drive
(`hero`, `tool`, `guide`: public, `public, max-age=86400, stale-while-revalidate`, ETag/304; `gallery`/`application`:
admin only); Drive failure gives a placeholder SVG (404/502). `images.remove(id)` moves the file to the Drive trash.
Pure/injectable core (testable with the fake Drive): `createSiteImages({ drive, tree, coll })` in `lib/siteImages.mjs`.

Admin UI: every place an admin adds or replaces an image shows exactly two side-by-side 48px buttons from the shared
`components/admin/AddImageButtons.jsx` (wording and enable rules in `lib/addImageUi.mjs`): **Upload Image** (file chooser)
and **Choose from Drive** (Google Picker, or the fake picker in local dev), with the helper line "Upload Image: pick a
picture from this computer. Choose from Drive: pick one already in Google Drive." Drive not connected disables both
("Connect Google Drive first"); Picker keys missing disables only Choose from Drive ("Google Picker is not set up yet" +
setup steps). They stack on phones. Places: Admin > Gallery, Heroes (per-hero picture and bulk "name each file after the
hero"), Tools > Tool images, **Help images**, and the guide builder (image block, image grid, selected picture, Images tab,
"reuse a picture" modal). `ImageUploadField.jsx` (`folder`, `value`, `onChange`, `label`, `altRequired`, `subfolder`,
`deleteOnRemove`) wraps AddImageButtons with preview, description and Remove for hero/tool/help
(`POST /api/admin-drive/images`, folders `hero`, `tool`, `help`). `DriveImagePicker.jsx` is the bare picker;
`DriveStatusBanner.jsx` is the "Google Drive connected" strip.

### Help page images

`lib/helpSections.mjs` holds the Help sections (id + title, shared by `/help` and the admin screen). Admin > Content >
**Help images** (`/admin/dashboard/help-images`, `GET/PUT/DELETE /api/admin-help-images`, admin only, section id validated)
sets one picture per section in Mongo `help_section_images` `{ section_id (unique), site_image_id, alt (required), caption,
side: 'right'|'left', updated_at, updated_by }`; the file lives in Drive `K710 Website/Help images` and is served by the
public `/api/site-image/<id>`. `/help` reads the rows through `lib/helpImages.server.js` (cached ~30 s, invalidated on
writes, fails open to text only). Two columns (text <= 65ch + picture ~40%) on wide screens, picture under the heading on
phones. New index `section_id_unique` (applied by `ensureIndexes` on boot).

### Connecting Google Drive and the Google Picker

- One-time **Connect Google Drive** in Admin > Gallery (any admin). Existing OAuth client, `access_type=offline`,
  `prompt=consent`, scope `drive.file`, redirect URI `<SITE_URL>/api/google-drive/callback`.
- The refresh token is stored in Mongo `integration_tokens` (`_id: google_drive_gallery`), AES-256-GCM, key =
  `GALLERY_TOKEN_KEY` or HKDF(`MEMBER_SESSION_SECRET`); it never reaches the browser. No service account (no quota).
- **Choose from Drive** uses the Google Picker. `GET /api/admin-drive/picker-config` (admin only, no-store)
  returns `{ accessToken (short-lived, drive.file), developerKey, appId }`; the component lazy-loads
  `https://apis.google.com/js/api.js`, opens the Picker restricted to image types, and the server copies the picked
  file into the destination folder (`files.copy`, owned by the connected account; if copy is impossible for a
  non-permission reason a reference is recorded and never trashed on delete). A file the Picker did not grant gives
  the plain message "Google Drive did not give this site access to that file...".
- Without the keys Choose from Drive is disabled with **"Google Picker is not set up yet"** and the steps; Upload Image
  still works.
- CSP: `proxy.js` adds `script-src https://apis.google.com https://www.gstatic.com`, `frame-src https://docs.google.com
  https://drive.google.com https://apis.google.com`, `connect-src https://www.googleapis.com`, `img-src
  https://*.googleusercontent.com https://drive.google.com` **only for `/admin` pages**. Public CSP is unchanged.
  This is a proxy change: restart the server after deploying.
- Delete moves the Drive file to the Drive trash (recoverable).
- Migration (idempotent, legacy data is never dropped before the Drive copy verifies): Admin > Gallery > "Move existing
  images / guide images / applications to Drive", or `node scripts/migrate-gallery-to-drive.mjs [--yes]` and
  `node scripts/migrate-site-images-to-drive.mjs [--yes]` (guides + applications; dry run without `--yes`).
- Local dev without Google: `NODE_ENV=development` only, `DRIVE_STORAGE_FAKE_DIR` or `.data/drive-fake/.enable`
  (gitignored). Files mirror the folder tree under `.data/drive-fake/tree/K710 Website/...`; "Choose from Drive"
  opens a built-in fake picker listing those images. Ignored in production.

Owner setup checklist (cannot be done by the code):
1. Google Cloud console: enable the **Google Drive API** and the **Google Picker API** for the project that owns the OAuth client.
2. OAuth consent screen: add scope `.../auth/drive.file`; while in "Testing", add the kingdom Google account as a test
   user (refresh tokens for Testing apps expire after 7 days: publish the app to "In production").
3. OAuth client (Web): authorized redirect URI `https://<production domain>/api/google-drive/callback`; **authorized
   JavaScript origins** `https://<production domain>` (the Picker runs in the browser).
4. Create an **API key** (Credentials), restrict it to HTTP referrers (`https://<production domain>/*`) and to the
   Google Picker API. Note the **project number** (Dashboard > Project info).
5. Vercel env: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `MEMBER_SESSION_SECRET`, `GOOGLE_PICKER_API_KEY`,
   `GOOGLE_PICKER_APP_ID` (project number); optionally `GALLERY_TOKEN_KEY` (long random).
6. Deploy (restart: proxy.js changed), open Admin > Gallery > Connect Google Drive, sign in with the kingdom account.
7. Run the "Move ..." actions; check the `K710 Website` folder tree appears in that Drive.

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
- [ ] KvK > Appointments tab: Review answers, Build schedule, Adjust, Publish, Share all reachable (one tab replaces Prep ministers + Appointments; old /prep-ministers and /kvk-appointments addresses redirect)

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
Every member form except Power Profile is saved per event cycle (KvK: Availability, Prep & Appointments - the separate Appointments form is retired;
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

## External data (Kingshot Optimizer timeline + KvK record)

- Code: `lib/external/**`; pages `/timeline`, `/about` (KvkRecord), home stats strip; routes `/api/timeline`, `/api/cron/refresh-external`, `/api/admin-external-data`.
- Env: `CRON_SECRET` (required for the cron route, same as gift-codes), `SITE_URL` (put in the User-Agent `K710Hub-KingdomSite/1.0 (+SITE_URL)`). No other config.
- Mongo: collection `external_snapshots`, `_id` = key (no index needed). Safe to delete any document: it is re-fetched on the next view/cron.
- Freshness: pages read the snapshot; a request only fetches when the snapshot is older than 60 min AND it wins a per-source 30 min attempt claim (`last_attempt_at`). Vercel Hobby crons run once a day (`20 5 * * *`, in vercel.json); on Pro change it to `*/30 * * * *`.
- Sources are fetched with robots.txt checked first, 8 s timeout, fixed URLs, https and two allow-listed hosts only. A 401/403/429 or robots disallow is treated as "blocked": we keep the last snapshot and never retry around it.
- KS Atlas cannot be read automatically (client-rendered; its data API is `Disallow: /api/`). Set the Atlas figures by POSTing `{ "atlas": { "rank": 107, "score": 57.59, "tier": "S-Tier", "topPercent": "5.0%", "asOf": "2026-10-01" } }` to `/api/admin-external-data` as admin (`{ "atlas": null }` clears).

## Tool images (Tools & Calculators tiles)

Admin > Tools > Tool images lets an admin replace the icon on each /tools tile with an image stored in the Drive folder "K710 Website/Tools and calculators images". Mongo `tool_images` holds `{tool_key (unique), site_image_id, alt, updated_at, updated_by}`; the image is a `site_images` record (folder `tool`) served at `/api/site-image/<id>`. No override means the built-in icon. Reads are cached 30 s (invalidated on admin writes) and fail open to the built-in icons. Valid tool keys are the tiles in `lib/toolHubTools.mjs`. APIs: `/api/admin-tool-images` (GET/PUT/DELETE, admin), `/api/tool-images` (public, same-origin urls only). Limits: PNG/JPG/WebP/GIF, 4 MB, alt text required; no server-side downscale.


### Hero catalog (KvK Availability + Flamedragon forms)

- Mongo `hero_catalog` `{ key (unique slug), name, image: {site_image_id}|null, active, order, created_at, updated_at, updated_by }`, seeded lazily from `lib/playerCombatOptions.mjs` (the ten retired heroes are seeded `active: false`). Default portrait when no Drive image: `public/heroes/<key>.webp`, else an initial-letter placeholder.
- Admin: Admin > Content > Heroes (`/admin/dashboard/heroes`, API `/api/admin-heroes` GET/POST/PATCH/DELETE): add, show/hide, reorder, picture (shared `ImageUploadField`, Drive folder `Hero images`), bulk "Upload many images" (file name = hero name/key). Heroes that members saved cannot be renamed (forms store the name): add a new hero and hide/remove the old one.
- Remove is always allowed: it deletes the row (uploaded image goes to the Drive trash) and writes a tombstone in `hero_catalog_removed` (`_id` = normalised name) so lazy seeding never re-adds it; members' saved names are untouched and removed heroes are dropped like inactive ones. "Restore removed heroes" (POST `{action:'restore',key}`) brings one back; adding the same name again clears the tombstone.
- Uniqueness is by normalised name (`name_norm`: case/accents/spaces/punctuation-insensitive; unique partial index `name_norm_unique`). Seeding is per-hero upserts (`$setOnInsert`), reads de-duplicate in memory (best row: has image, active, oldest). `ensureIndexes()` dedupes `hero_catalog` before creating its unique indexes. Cleanup of existing duplicate rows: admin "Remove duplicates" button (shown when any exist), a redeploy/restart (boot ensureIndexes), or `MONGODB_URI=... node scripts/dedupe-hero-catalog.mjs [--yes]` (dry run by default).
- Public: `GET /api/heroes` (no Drive ids; images are `/api/site-image/<id>`); the member form pages also receive the list as server props. Reads are cached 30 s per server process, invalidated on admin writes, and fall back to the code defaults when MongoDB is unavailable.
- Validation uses the active heroes; saved heroes that are now inactive are dropped silently on load/prefill and on re-save (never a 400). Stored values remain hero names.

### Page text (Home, About, Glossary, Guides list words)

- Admin > Content > Page text (`/admin/dashboard/page-text`, API `/api/admin-page-text` GET/PUT, admin only). Mongo `page_text`: one document per page `{ page (unique), values: { key: text | faq list }, updated_at, updated_by }`. Defaults and field limits live in `lib/pageText.mjs` (add another page by registering it in `PAGE_TEXT_PAGES`). Pages: home, about, glossary, guides. Home reads old `content_blocks` (page 'home') values once into `page_text` (`legacy_imported: true`), then ignores them; About reads its shared story paragraphs and R5 leaders from `getPageText('home')`. Glossary terms (`glossary_terms` list) also feed the tooltips via `GlossaryProvider` in the root layout.
- A blank or whitespace-only value, or a value equal to the default, is not stored: the page shows the default. "Reset to default" in the screen does exactly that. FAQ: max 12 items, question <= 140, answer <= 800 characters; saving an empty list restores the default list.
- The About page reads it server-side (`lib/pageText.server.js`), cached 30 s, invalidated on admin writes, and falls back to the code defaults if MongoDB is unavailable. Plain text only (blank line = new paragraph). Alliances, KvK numbers and the two home-page paragraphs are not editable here.
