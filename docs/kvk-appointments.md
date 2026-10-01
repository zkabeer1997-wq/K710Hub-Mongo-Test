# KvK appointments (minister / advisor buffs)

Members apply for a Chief Minister or Noble Advisor buff, leadership allocates 30-minute UTC slots, and members see their slot once the schedule is published.

## Member side: `/forms/kvk-appointments?tab=...`

Each tab is a real link, so it can be shared and works with the Back button.

| Tab | URL | What it does |
|---|---|---|
| Apply | `?tab=apply` (default) | Pick day + buff, enter TG, TTG, speedup days, pick **exactly 3** preferred hours |
| My Appointments | `?tab=mine` | One row per day/buff with the status in words: `Day 1 Construction: Not applied` / `Pending` / `Assigned 02:00-02:30`. The coloured chip is decoration, never the only signal |
| View Schedule | `?tab=schedule` | Published 30-minute slots per day, UTC and local time, your own slots highlighted. Shows names only (no member IDs) |

Types (`lib/kvkAppointments.mjs`, `APPOINTMENT_TYPES`): Day 1 Construction and Day 2 Research (Chief Minister), Day 4 Troop Training (Noble Advisor). They mirror the existing Prep Week scheduler (`app/admin/dashboard/prepScheduler.mjs`). Day 5 there is an overflow re-run; admins place leftovers by hand, members do not apply for it.

The hour picker renders 24 UTC hours (`HOUR_OPTIONS`), each with the viewer's local time added after mount (server render is UTC only, so there is no hydration mismatch). Once 3 are chosen the others are disabled; the API validates "exactly 3 distinct valid hours" again.

Saving is an upsert on `(member_id, day, buff, cycle_id)`. The page shows the same notice as the other member forms ("No entry on file yet..." / "Last updated ...", "Saving replaces your previous entry").

## Contribution formula (one place)

`contributionScore()` in `lib/kvkAppointments.mjs`:

```
score = tg * 1 + ttg * 2 + speedup_days * 100
```

The weights (`CONTRIBUTION_WEIGHTS`) are an **assumption**, not game data: TTG counts double because the Prep Week scheduler already ranks TTG ahead of TG; one speedup day counts as 100 units so a few hundred days is comparable to millions of TG. Leadership can retune them in that single place. Tests pin the ordering behaviour (more of any input never lowers the score), not the exact numbers.

## Allocation

`allocateSlots(applications, locked)` (pure, deterministic):

1. Rank by score (desc), then earlier application, then member id (numeric order when both are numeric).
2. In that order each applicant takes the first free 30-minute slot inside their preferred hours (pick order; `HH:00` before `HH:30`).
3. At most one slot per member per day/buff; a slot is never given twice.
4. `locked` (admin manual placements) keep their slot and their member is skipped.
5. Applicants with no free slot in their hours stay unassigned for an admin to place by hand.

## Admin: `/admin/dashboard/kvk-appointments` (KvK menu)

Ranked applicant table per day/buff, a slot dropdown per applicant (booked slots disabled), **Auto-allocate** (this day) / **all days** (manual placements are kept, the rest are recomputed), and **Publish / Unpublish**. Until published, members only ever see "Pending" and `/api/kvk-appointments/schedule` returns `{published:false}`. Publish state is per cycle; edits made while published are visible immediately.

Open/close the form in Admin > Form Gates ("KvK Appointments"). `cycle_id` comes from that gate (default `current`); start a new cycle by changing it, old rows are kept.

## Data

| Collection | Unique index | Notes |
|---|---|---|
| `kvk_appointment_applications` | `member_id, day, buff, cycle_id` | upsert target |
| `kvk_appointment_assignments` | `cycle_id, day, buff, slot` **and** `cycle_id, day, buff, member_id` | no double booking, one slot per member; `manual` flag marks admin picks |
| `kvk_appointment_cycles` | `cycle_id` | `published`, `published_at` |

Registered in `lib/mongoCollections.js`; apply with `node scripts/ensure-indexes.mjs`.

## Routes

- `GET/POST /api/kvk-appointments` (member session): my applications (+ assignments when published); upsert one application. Closed gate -> 403.
- `GET /api/kvk-appointments/schedule` (member session): published schedule.
- `GET/POST /api/admin-kvk-appointments` (admin): list; `auto_allocate`, `assign`, `unassign`, `publish`.

Tests: `tests/kvkAppointments.test.mjs` (options, formula, validation, allocator, status text), `tests/kvkAppointmentsRoute.test.mjs` (auth, gate, upsert, allocation, publish visibility), Playwright `scripts/qa-interactions.js` (picker renders 24 options, enforces exactly 3, tab URLs).

The older Noble Advisor form (`/forms/flamedragon-tyrant/noble-advisor`, `lib/nobleAdvisor.mjs`) is untouched: it is the Flamedragon-period Troop Training booking with its own questions and admin page. This flow generalises the same idea; migrating the old form into it is not done.
