# Screenshot scan engine: plan (branch `feat/gear-ocr`, not for main until approved)

Status: PLAN ONLY. No application code has been written. Several inputs below are marked
**NEEDS OWNER** because they are in-game facts that must not be guessed.

## Goal
Read the six Governor Gear slots from a screenshot (quality, tier, stars), let the user review and
fix them, save to their loadout. Build it as a reusable engine with "scan kinds" so backpack
resources, speedups and charms can be added later as new profiles + readers.

## What exists today (summary)
- Next.js 16 App Router + MongoDB (native driver). Node tests with `node:test`. Styling: plain CSS +
  tokens. Sessions: signed cookie, `readMemberSession(request)`; the member id comes from the session.
- Power Profile page (`app/power-profile/PowerProfileClient.js`) already has a scan button:
  `components/GovernorGearOcr.js` -> `POST /api/governor-gear-ocr` -> forwards the image to a THIRD-PARTY
  service (`optimizer-ocr.zebrave.workers.dev`) and maps its answer with `lib/governorGearOcr.mjs`.
  Charms are matched client-side by `lib/charmVisionClient.js`. Results fill dropdowns; the saved
  form stores a string (`power_profiles.governor_gear`).
- Existing game-value table in the repo: `lib/equipmentOptions.mjs` (`GOVERNOR_GEAR_OPTIONS`, 58 labels:
  Green / Blue / Purple / Gold / Red, with tiers and 0-3 stars). Costs per tier in
  `lib/governorGearToolData.mjs` (placeholder numbers, admin-editable).
- No `/api/loadout`, no `loadouts` or `scanCorrections` collections, no calibration page,
  no `scan:eval` script.
- Dependencies present: `sharp`, `pngjs`, `pixelmatch`, `heic2any`, `playwright`. `zod` exists only as
  a transitive dependency (not declared). NOT installed: `tesseract.js`, `mongodb-memory-server`.

## Fixtures: what exists and what is missing
- Only ONE real screenshot is in the repo: `public/images/player-profile-ocr-example-private.webp`
  (a Governor Profile screen, name/ID blurred). It is inside `public/`, so it is served publicly.
  Recommend moving it to `tests/fixtures/` when we start.
- It shows: six gear tiles with a coloured frame, a yellow tier label ("T3", "T1") at the top-left of
  each tile, and three small gem icons under each tile. I cannot see a star row on it.
- There is NO labelled fixture set (no ground-truth JSON) and no screenshot of the Governor Gear
  detail screen with stars.
- Six sprite images exist (`public/images/kingshot/governor-gear/*_green_t0_s0.webp`): green, tier 0, 0 stars only.

## NEEDS OWNER (will not be guessed)
1. Which screen is the scan source: the Governor Profile screen (as in the example) or a dedicated
   Governor Gear screen? Where exactly are the stars drawn?
2. Quality names and their on-screen colours (the repo lists Green, Blue, Purple, Gold, Red: is that
   complete and correct? any others such as Gray/White/Orange?). Palette = from your game-data file,
   or measured from labelled fixtures during calibration.
3. Tier labels: the example shows "T1".."T3" text. Which tiers exist per quality and what does tier 0
   look like (no label)? (Repo currently assumes Purple T0-T1, Gold T0-T3, Red T0-T6.)
4. Star counts per quality (repo assumes Green 0-1, others 0-3).
5. The anchor: a UI element that is always present and reliably findable (candidates: the
   "Governor Profile" title bar, the lower player panel, the eye/"Gear" toggle).
6. 15-30 labelled screenshots across phones/aspect ratios (iPhone, Android) with the true value of
   every slot, in `tests/fixtures/scan/governor-gear/` plus `labels.json`.
7. Whether this REPLACES the third-party OCR call (recommended: yes, for privacy and reliability).

## Resource decisions
- Run the engine in the BROWSER (Web Worker + canvas/OffscreenCanvas + `tesseract.js` WASM). The image
  never leaves the device, which makes "never store the image" true by construction, avoids serverless
  time/size limits, and removes the third-party service. The server only receives structured results.
  Self-host Tesseract worker/core/language data under `public/` (no CDN); CSP additions needed:
  `worker-src 'self' blob:`, `'wasm-unsafe-eval'` on script-src for the scan page only.
- Same engine modules in Node for `scan:eval` and tests: pixel input abstraction (RGBA buffer +
  width + height). Browser gets it from canvas; Node from `sharp` (already a dev dependency).
- `zod` (declare it) for profile JSON, scan results and API payloads.
- `mongodb-memory-server` (dev dependency) for route tests, as you asked. It downloads a mongod binary
  on first run (needs network once; CI caches it).
- No OpenCV: colour maths, Otsu, template match and projection are small and can be written and tested
  directly. Revisit only if star detection needs it.

## Data types (zod)
- `ScanKind`: `'governor_gear'` now; registry for later kinds.
- `LayoutProfile` (JSON, versioned): `{ kind, version, anchor:{type,template|textHint,expected:{x,y,w,h}},
  regions:{ [id]:{ x,y,w,h, reader:'quality'|'stars'|'number'|'label', options } } }`, all coordinates 0-1
  relative to the anchor frame.
- `FieldReading`: `{ value, confidence 0-1, alternatives?:[{value,confidence}], crop?:ref, flags[] }`.
- `GearSlotReading`: `{ slot, quality, tier, stars }` each a `FieldReading`.
- `Loadout` document: `{ _id, user_id, kind, slots:{ [slot]:{quality,tier,stars} }, schema_version,
  profile_version, engine_version, source:'scan'|'manual', updated_at, created_at }` (one per user+kind).
- `ScanCorrection` document: `{ user_id, kind, slot, field, read_value, read_confidence, corrected_value,
  profile_version, engine_version, created_at }`. No images, no crops.

## Collections and API
- `loadouts` (unique index `{user_id, kind}`), `scan_corrections` (index `{kind, created_at}`).
- `GET /api/loadout?kind=` returns the caller's own loadout. `POST /api/loadout` validates with zod,
  takes the user from the session (never from the body), upserts, and inserts `scan_corrections` rows for
  fields the user changed. CSRF is already central. Rate limit with the shared limiter.

## Files (proposed)
```
lib/scan/imageCheck.mjs        signature + end-marker check, size limit, redraw-on-damage decision
lib/scan/normalize.mjs         resize to standard width
lib/scan/coords.mjs            anchor frame <-> pixel maths
lib/scan/color.mjs             RGB->HSV, palette distance -> confidence
lib/scan/otsu.mjs              greyscale, upscale, Otsu, invert
lib/scan/readers/{quality,stars,text}.mjs
lib/scan/validate.mjs          check against game data; lower confidence, never auto-fix
lib/scan/engine.mjs            runScan(kind, pixels, profile) -> readings
lib/scan/kinds/index.mjs       registry
lib/scan/kinds/governorGear/{profile.v1.json, gameData.mjs, schema.mjs}
lib/loadout.server.js          upsert + corrections
app/api/loadout/route.js
app/dev/calibrate/page.js      development only (notFound in production)
components/scan/{ScanUploader,ScanReview}.jsx + worker file
scripts/scan-eval.mjs          npm run scan:eval
tests/fixtures/scan/governor-gear/*.png + labels.json
tests/scan*.test.mjs, tests/loadoutRoute.test.mjs
```

## Phases
0. Inputs (owner): screens, game data, anchor, labelled fixtures. Move the public example out of `public/`.
1. Foundations: image check, normalisation, coordinate maths, colour maths, Otsu, zod schemas + unit tests.
2. Profile + calibration page: profile JSON v1 drawn on real fixtures; `/dev/calibrate` export.
3. Readers: quality (HSV palette), stars (count/template with alternatives), tier/label (Tesseract with
   whitelist); validation against game data.
4. Eval harness: `npm run scan:eval` with per-field and overall accuracy and a failure list; baseline it.
5. UI + API: upload and drag-and-drop on the loadout page, review screen (crop beside value, <0.8
   highlighted and must be confirmed), `/api/loadout`, corrections, route tests with
   mongodb-memory-server including the cross-user isolation test.
6. Hardening: privacy review (no image stored or logged), CSP, accessibility, Easy view, mobile, docs;
   decide on removing the third-party OCR route.
Later scan kinds: add a profile JSON, readers config and game data module under `kinds/`; no engine change.

## Acceptance
Per-field accuracy reported by `scan:eval` on the labelled fixtures, target agreed with the owner once
the first baseline exists (suggested: quality and tier >= 98%, stars >= 95% on clean fixtures).

## Update: reference screens received from the owner
Three images were supplied (small UI screenshots, not usable as test fixtures):
1. **"My Loadout" page** (reference design): left menu Overview / Backpack (Resources, SpeedUps, Gear, Other) /
   Governor Gear (0 of 6 slots) / Charms (0 of 18 charms) / Build & settings; a 6-slot gear grid around a
   character with 3 charm slots under each gear slot; a header strip "Saved on this device only" with
   "Scan a screenshot" and "Sign in to sync". We have no such page today; the scan UI will live on a new
   loadout page. Do not reuse the reference site's artwork or branding: our own visuals only.
2. **"Screenshot your Governor Profile"** guidance modal: the member screenshots the Governor Profile screen with
   all six gear pieces visible; one scan fills Governor Gear AND Charms. The modal warns "Do not crop the image"
   and "Always double-check imported values".
3. **"Screenshot your Backpack, Gear tab"** guidance modal: a grid of gear items on the Backpack Gear tab.

### What this changes in the plan
- Scan kinds become: `governor_profile` (6 gear slots + 18 charm slots, first), `backpack_gear` (items grid,
  second), then `backpack_resources`, `backpack_speedups` later. The engine stays the same; each kind is a
  profile JSON + readers + game data.
- The scan flow gets a guidance step per kind (which screen to open, correct/incorrect example, "do not crop").
- Stars: the Governor Profile example shows NO star row on the gear tiles. Where stars are visible (profile
  zoom, gear detail, backpack tab) must be confirmed before the stars reader is designed.

### Open questions added
- Is the Backpack Gear tab list HERO gear pieces (helm/gloves/chest/boots) or spare Governor gear? The items
  look like hero equipment with level numbers; confirm what each field means (level, +N, icons).
- Should the loadout page also store charms (18) and hero gear from these scans, or only the 6 Governor
  Gear slots for now?
- Full-resolution original screenshots for both screens (many devices) with true values, as in fixtures request.
