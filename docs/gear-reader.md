# Governor Gear reader (quality, tier, stars)

One gear piece on the Governor Profile is a rounded square: a **frame colour** (quality), a **label** top-left, up to
**three stars** up the left edge, and a red notification dot top-right. The six tiles sit straight above the middle gem of
each charm row, so the reader finds the charm rows first (`locate.mjs`) and cuts each tile from there, which also works on
cropped or zoomed images. Offsets (`gear.mjs`): tile centre 125 px above the middle gem, tile 186 px, at a gem pitch of 60 px.

| Field | How it is read (`lib/scan/readers/gearTileReader.mjs`) |
|---|---|
| quality | Colour of the frame, sampled along the bottom and right edges (away from label, stars and dot), nearest of five colours measured on the owner's art and screenshots: green 130, blue 200, purple 252, gold (Mythic, orange) 31, red (Legendary) 359 degrees of hue |
| tier | The yellow label is turned into a small map and matched, allowing a small shift, against label templates T1 to T6 (real ones from screenshots where we have them, plus art ones). No label text at all means T0 |
| stars | Three fixed spots (measured on the art); each is matched against a star template cut from real screenshots. A spot holds a star only if the shape matches, so gold item art that spills into a spot is not counted. Stars fill from the bottom; a star above an empty spot is flagged |

## What the real screenshots showed

- The label is `T<n>` on most tiles, but some tiles show **`P1` or `P2`** (on both Mythic and Legendary tiles). That is not in
  the confirmed tier list, so the reader returns **no tier value** for them, with the flag `unrecognised_tier_label_P1`
  and low confidence, so the review screen asks the player. Waiting for the owner to say what P1 / P2 mean.
- T5 and T6 have no real example yet: they are matched on the art only and flagged `tier_matched_on_art_only`.

## Evidence

| Check | Result |
|---|---|
| The 12 gear pieces on the owner's two full screenshots (quality, tier, stars all exact) | 12 / 12. Tier templates were learned from other images; the star template was cut from these tiles, so the star result is not independent |
| The 348 art tiles (quality + tier) | 348 / 348 quality, 348 / 348 tier |
| 228 gear tiles on 38 cropped account images, checked by eye on a sample of 36 | 36 / 36. The tier label text of 192 of them was read by eye from clusters (`gear-tier-labels.json`, not yet verified by the owner); the reader agrees on 191 of 192 |

Quality is the easiest field. Tier is only as good as the examples: T1 to T4 and P1/P2 have real ones; T0 is "no label".
Stars come from a template cut from six real stars.

## Improving it

Add labelled screenshots, then `npm run scan:gear` (rebuilds `gearTemplates.json` from the art, the labelled gear and
`gear-tier-labels.json`). Blue and green tiles have not appeared in any real screenshot yet: their frame colour comes from
the art only.
