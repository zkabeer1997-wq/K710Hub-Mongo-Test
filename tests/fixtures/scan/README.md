# Scan fixtures

Real, labelled screenshots used by `npm run scan:eval`. None are committed yet: do not add fake or
synthetic screenshots here.

Layout (one folder per scan kind, names from `lib/scan/kinds/index.mjs`):

```
tests/fixtures/scan/governor_profile/
  labels.json
  profile.json          optional layout profile for that kind (validated by zod)
  iphone-15-001.png
tests/fixtures/scan/backpack_gear/
  labels.json
  ...
```

## labels.json

Validated by `FixtureLabels` in `lib/scan/schemas.mjs`:

```json
{
  "version": 1,
  "kind": "governor_profile",
  "images": {
    "iphone-15-001.png": {
      "device": "iPhone 15",
      "gear": { "hat": { "quality": "gold", "tier": 2, "stars": 3 } },
      "charms": { "cavalry_1": 12 }
    }
  }
}
```

- `gear` keys: `hat`, `pendant`, `shirt`, `pants`, `ring`, `baton`. `quality` is one of `green|blue|purple|gold|red`.
- `charms` keys: `infantry_1..6`, `cavalry_1..6`, `archer_1..6`; value is the level 1-22.
- `heroGear` (backpack_gear): array of `{ "troop": "infantry|cavalry|archer", "level": 1-200, "forgery": 0-20 }`.
- Every image must be a genuine, full-resolution, uncropped screenshot with the true values. Blur names/IDs.

With no fixtures the script prints a notice and exits 0. While the engine is not implemented it
reports "engine not implemented" per fixture instead of an accuracy.
