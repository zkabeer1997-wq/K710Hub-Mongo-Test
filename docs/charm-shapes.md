# Charm shapes and the charm reader

A Governor Gear charm shows its **level as a shape**; the **troop** sets colour and icon. On the Governor
Profile each gear piece has three charms under it. The troop of every charm is known from its position
(hat/pendant = cavalry, shirt/pants = infantry, ring/baton = archer), so the reader only ever chooses
between the 22 levels of one troop.

Sources: the owner's art (`public/images/loadout/charms/<troop>/level-<n>.webp`, 22 levels x 3 troops) and the
owner's labelled screenshots (`tests/fixtures/scan/governor_profile/`).

## The 22 shapes (identical for all three troops)

| Level | Body shape | Ornament |
|---|---|---|
| 1 | rounded triangle, point up, wide base | none |
| 2 | tall rectangle with cut corners | none |
| 3 | diamond (rotated square with cut corners) | none |
| 4 | square with cut corners | none |
| 5 | pointed-top "house": pentagon with a sharp top and flat sides (the owner calls it the "triangle") | none |
| 6 | small regular pentagon, point up | none |
| 7 | broad shield-like pentagon, flat shoulders | none |
| 8 | kite / teardrop, point up | none |
| 9 | narrow tall hexagon | none |
| 10 | large decagon | none |
| 11 | circle | none |
| 12 | tall hexagon | bronze wings flaring from the sides |
| 13 | tall hexagon | bronze curled claws / ring around the sides |
| 14 | square with cut corners | flat bronze base bar |
| 15 | square with cut corners | bronze base with a raised centre block |
| 16 | gem inside a silver shield | two upright curved silver horns |
| 17 | gem inside a slim silver shield | pointed bottom, small top spike |
| 18 | gem inside a wide silver shield | spike on top, broad shoulders |
| 19 | gem inside a silver shield | gold wings and a gold diamond on top |
| 20 | pentagon | small gold base with a diamond |
| 21 | pentagon | larger gold wing base |
| 22 | hexagon inside a gold frame | gold wings at the sides |

Three families, which also explains the colour of the ornaments: **plain gems 1-11**, **bronze 12-15**,
**silver 16-19**, **gold 20-22**.

## What the reader does (`lib/scan/readers/charmReader.mjs`)

1. Cut a small window around the gem from the position in `layout.mjs` (gem pitch 60 px on a 1284 px wide
   screenshot; measured from the owner's two screenshots).
2. Find the gem **body** by the troop's hue (blue / green / yellow); this works on any background.
3. Find the whole object (body + wings/base/frame) as the pixels that differ from a background plane fitted
   to the window border, and keep the blob connected to the body.
4. Resample the object's bounding box to 24 x 24 and score each level: silhouette overlap, body overlap,
   colour, body aspect ratio, and which ornament metal (bronze / silver / gold) and how much.
5. Confidence comes from the best score and the gap to the second best. A close second choice is flagged and
   the top three alternatives are returned, so the review screen can offer them.

Nothing is guessed: no gem found gives `null` with confidence 0.

## Evidence and its limits

The art is not drawn exactly like the in-game profile icon (for example the level 12 wings are wider in game), so
every level that appears on labelled real images also has **real exemplars** (`charmExemplars.json`, gem pixels
only, at most 12 per level). A level with no real exemplar is matched on the art only and **capped below the
review threshold** (0.79), so the player must confirm it.

Labelled data: the owner's 2 full screenshots plus 38 cropped account-listing images, labelled with the key sheet
(`charm-key-answers.json`; levels were picked per group of similar gems with single-gem overrides, 31 gems left
unlabelled). 689 labelled gems in all, levels 2 to 17.

Measured with `npm run scan:charms:eval` (each image read WITHOUT the exemplars cut from that same image):

| | Result |
|---|---|
| Correct | 612 / 689 (88.8%) |
| Confident reads (0.8 or more) | 467 (68%); 459 right, 8 wrong (1.7%); four of those 8 are on one image whose labels look off |
| Review reads (under 0.8) | 222; 153 of them right, so the review screen has a useful default |
| Rule behind "confident" | best score >= 0.8 and a gap >= 0.04 to the runner-up: 98% right on the labelled gems |

By level (right / labelled): 2: 2/2, 3: 60/71, 4: 34/42, 5: 161/174, 6: 145/149, 7: 60/65, 8: 42/45, 9: 10/10,
10: 25/32, 11: 36/43, 12: 10/18, 13: 15/17, 14: 6/7, 15: 2/2, 16: 0/6, 17: 4/6.

Weak spots: 10 vs 11 (decagon vs circle at this resolution), 3 vs 12/8, 12 (few examples), silver shields 16 to 19
(few examples: 6 of level 16, 6 of level 17, none of 18 or 19).

Not seen on any labelled image: levels 1 and 18 to 22. They stay art-only, capped, always shown for confirmation.
The synthetic test (art scaled to in-game size on gradients, `tests/charmReader.test.mjs`) separates all 22 levels
about 96% of the time; that measures the shapes, not real accuracy.

## Improving it

Add labelled images that show other levels (especially 1 and 16 to 22), then run `npm run scan:charms` (rebuilds the
templates and the exemplars) and `npm run scan:charms:eval`. Each level with a real exemplar stops being capped.
