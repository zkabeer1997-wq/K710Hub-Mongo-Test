# Backpack scan (`backpack_inventory`)

A member picks one or two Backpack screenshots (Resources, Speedups) on the **KvK Prep & Appointments** form or the **Noble Advisor**
form. The picture is decoded and read in the browser and thrown away; only structured numbers are sent and saved.

## Owner rules

- The scan fills what the member **owns**. Form labels say "do you own". Boxes stay editable.
- **Research days = research speedups + general speedups.** **Troop days = troop speedups only** (Day 4 and Noble Advisor).
- The **green plus** speedups are **healing** speedups. They are recognised (so they are not mistaken for another category) but never
  shown, counted or saved.
- A day is 24 hours: days = minutes / 1440, never rounded in the engine. Review shows 1 decimal plus exact minutes; the form box gets up to 2 decimals.
- TG, TTG and TG Dust are found by icon anywhere on the screenshot. Not on the screenshot = "not found", never 0.

## How it reads (`lib/scan/kinds/backpackInventory/`)

1. `locate.mjs`: tiles are the squarish blobs that differ from the panel colour (the most common light colour). Their size sets the
   scale, so full, scrolled, resized and cropped screenshots work. Each tile is cut and resampled to 240 x 240.
2. `tileReader.mjs`: a tile with the light-blue double chevron is a speedup. Denomination (1 min, 5 min, 1 hr) = the label at the top,
   matched against label templates; frame colour (grey, green, blue) is only a cross-check. Category = the small bottom-left icon,
   matched on edge maps (so the frame colour does not matter). TG / TTG / TG Dust = icon colour map.
3. `digits.mjs`: the quantity is cream digits with a dark outline, bottom-right. Digits are cut by column, matched against digit
   templates (nearest exemplar) with a per-digit confidence; touching "11" pairs are tried as one or two glyphs; the comma is
   recognised by its gap and the thousands grouping is checked. Any weak digit makes the whole number "check this".
4. `scan.mjs`: tab = Resources or Speedups (auto). A failed or non-backpack picture returns a friendly message and fills nothing.

`lib/scan/backpackReview.mjs` merges up to two pictures (same item twice is counted once), builds the review rows, the totals, the
saved snapshot and the corrections. Rows under 0.8 confidence must be confirmed or corrected before "Use these numbers" turns on.

## What is saved

On the prep and noble records: `backpack_scan` = `{ scanned_at, engine_version, tg, ttg, tg_dust, speedup_minutes: { construction,
research, troop, general } }` (numbers or null) and `backpack_sources` = `{ <field>: 'scan' | 'typed' }`. Corrections (read value vs the
value the member chose, never the image) go to `scan_corrections` with `kind: 'backpack_inventory'`. The server validates every number
(finite, whole, non-negative, bounded) and never uses these for ranking: `prepScheduler.mjs` still ranks the typed/filled fields. Admin
tables show a "Scanned" tag with the breakdown and a hint when the typed number differs from the scan by more than 10 percent.

## Accuracy (`npm run scan:eval`, two fixtures only)

| View | Result |
|---|---|
| As shipped (templates cut from both images, in-sample) | TG, TTG, TG Dust exact; 14 / 14 speedup rows exact |
| Digits held out (templates from the OTHER image only) | 29 / 29 clean tiles; 7 / 13 on tiles with a shield icon behind the digits, all 6 wrong reads flagged (not scheduler items) |
| Leave-one-tile-out | denomination 14 / 14, category 14 / 14 |
| Re-encoded (1080, 828, 720 wide, enlarged to 1500, JPEG 60, cropped) | all values exact; a few reads flagged for review at 720 wide |

Limits: the three resource icons have one example each (cannot be held out); only phone 1284 x 2778 screenshots were seen; the grey
1-min general tile and any tile not in the two images were never seen. Anything uncertain goes to the review screen.

## Adding fixtures

Copy the screenshot to `tests/fixtures/scan/backpack-inventory/`, add it to `labels.json` (`quantities` or `speedups`, reading order,
full tiles only), then `npm run scan:backpack` (rebuilds `templates.json`) and `npm run scan:eval`.

QA: `QA_BASE=http://localhost:3013 QA_MONGO_DB=<own db> node scripts/dev/qa-backpack-scan.mjs` against a dev server on a local mongod.
