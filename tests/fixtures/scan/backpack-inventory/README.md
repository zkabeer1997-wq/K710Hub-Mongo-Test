# backpack_inventory fixtures

Two real owner screenshots (phone, 1284 x 2778, no player names):

| File | Screen | What it shows |
|---|---|---|
| `resources.png` | Backpack > Resources | Top row: True Gold (TG) 8,018, Tempered True Gold (TTG) 280, True Gold Dust (TG Dust) 11, then a chest (4,445) and other items that are ignored. 28 full tiles are visible. |
| `speedups.png` | Backpack > Speedups | 14 tiles: general 5 min x260 and 1 hr x20; construction 1 min x11,031, 5 min x6,808, 1 hr x542; troop 1 min x373, 5 min x272, 1 hr x31; research 1 min x145, 5 min x94, 1 hr x20; green plus 1 min x549, 5 min x2,282, 1 hr x13. |

`labels.json` holds the numbers read by eye from the images (the ground truth). For the resources screenshot it also lists the
quantity of every full tile (used to cut digit templates); `shield` marks tiles with a translucent shield icon behind the digits.

Templates in `lib/scan/kinds/backpackInventory/templates.json` are cut from these two images:

    npm run scan:backpack     # rebuild templates.json from the fixtures + labels.json
    npm run scan:eval         # accuracy (in-sample, held-out digits, leave-one-tile-out, re-encoded variants)

Adding a screenshot: copy it here, add an entry to `labels.json` (`quantities` or `speedups`, in reading order, 4 tiles per row,
only full tiles), run `npm run scan:backpack` then `npm run scan:eval`. See `docs/backpack-scan.md`.
