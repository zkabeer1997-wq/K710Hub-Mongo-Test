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

The art is not drawn exactly like the in-game profile icon: for example the level 12 wings are wider in game
than in the art. So every level that appears on a labelled real screenshot also gets a **real exemplar**
(`charmExemplars.json`, gem pixels only), and a level with no real exemplar is **capped below the review
threshold** (0.79), so the player must confirm it.

| Check | Result |
|---|---|
| Levels seen on real screenshots | 3, 4, 5, 6, 12, 13 (2 screenshots, one device) |
| Real screenshots, each read without its own exemplars (`npm run scan:charms:eval`) | 33/36 right; all 16 confident reads right; 0 confident-and-wrong |
| Real screenshots with the shipped exemplars | 36/36 (circular: exemplars come from the same images) |
| Synthetic (art scaled to in-game size, blurred, on gradients; `tests/charmReader.test.mjs`) | about 96% over all 22 levels x 3 troops; this measures how separable the shapes are, not real accuracy |
| Known confusion | 19 read as 17 (silver shield vs silver shield + gold top) in about a third of synthetic cases; 10/11 and 3/6 occasionally |

Not yet verified on real screenshots: levels 1, 2, 7-11, 14-22. They are matched on the art only, always shown
for confirmation, and the reader never reports them as confident.

## Improving it

Add labelled screenshots that show other levels (any troop), then run `npm run scan:charms` (rebuilds the
templates and the exemplars) and `npm run scan:charms:eval`. Each level with a real exemplar stops being capped.
