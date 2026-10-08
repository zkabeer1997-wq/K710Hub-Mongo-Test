# KvK appointments (minister / advisor buffs)

## Current flow (single source: KvK Prep & Appointments)

There is ONE member form, **KvK Prep & Appointments** (gate key `prep`, `/prep-phase-backpack`). It carries the ranking inputs (TG tier, TTG, TG, T11, TG dust, speedup days, transfer, promoting T11) and the availability on the **30-minute UTC grid** (`avail_day1/2/4/5`). The old separate Appointments apply form is retired; its `appointments` gate key remains only to hold the schedule cycle id and old data (it is not a form with open/close controls).

Bookable buffs: in KvK Prep the Chief Minister (Day 1 Construction, Day 2 Research) and the Noble Advisor (Day 4 Training); in Flamedragon Tyrant only the Noble Advisor.

### Admin: KvK event page > Appointments tab (`/admin/dashboard/events/kvk?tab=appointments`)

1. **Review answers**: this cycle's answers with each member's rank per day, filters, cycle selector for past cycles.
2. **Build schedule**: `POST /api/admin-kvk-appointments {action:'build_schedule'}` runs `prepScheduler.schedule()` (ranking rules unchanged) and saves automatic assignments (`replaceAutoAssignments`, atomic). Hand-placed (locked) rows are never touched.
3. **Adjust**: place, move or remove (`assign` / `unassign`); a hand placement is locked. Members without a slot are listed with a reason.
4. **Publish**: publish / unpublish with a confirmation; members see it in My appointment.
5. **Share**: Download Excel, Export to Google Drive, Copy as text for Discord (UTC).

`/admin/dashboard/prep-ministers` and `/admin/dashboard/kvk-appointments` redirect to that tab; `/admin/dashboard/noble-advisor` redirects to the Flamedragon `noble` tab (same scheduler, Day 4 only, same exports).

### Slot cap

`MAX_SLOTS_PER_DAY = 1` (`app/admin/dashboard/prepScheduler.mjs`, owner decision): nobody gets more than one slot per day, on Days 1, 2, 4 and 5 and in the Noble schedule. The old Day 4 rule "1 extra slot per 600 troop speedup days (max 8)" no longer grants anything; it never affected rank order, so ranking is unchanged. Duplicate answers from one member id are collapsed.

### Stored assignment shape (`kvk_appointment_assignments`)

`{cycle_id, day, buff, slot:'HH:MM', member_id, name, manual, score?}`; unique on `(cycle_id, day, buff, slot)` and `(cycle_id, day, buff, member_id)`.

| Scheduler day | day | buff |
|---|---|---|
| Day 1 | 1 | `construction` |
| Day 2 | 2 | `research` |
| Day 4 | 4 | `training` |
| Day 5 overflow (missed Day 1 and/or Day 2) | 5 | `overflow` |

`lib/kvkScheduleBridge.mjs` holds the mapping, text/Excel sheets and the "not placed" reasons; `lib/kvkSchedule.server.js` the server build. `allocateSlots()` / contribution score below are kept only for cycles that used the old Appointments form (view-only in the admin; the legacy `auto_allocate` action never touches days without old applications).

---

## Legacy (old separate Appointments form, kept for older cycles)

Members apply for a Chief Minister or Noble Advisor buff, leadership allocates 30-minute UTC slots, and members see their slot once the schedule is published.

> **Update (member side):** the separate Apply form is retired. Members ask for buffs in the single
> **KvK Prep & Appointments** form (`/prep-phase-backpack`, key `prep`): Day 1 Construction and Day 2 Research (Chief
> Minister), Day 4 Troop Training (Noble Advisor), Day 5 overflow, each with a Yes/No and a 30-minute UTC time grid.
> `/forms/kvk-appointments` is now the read-only **My appointment** page (tabs `mine`, `schedule`; `?tab=apply`
> redirects to the Prep form). `GET /api/kvk-appointments` adds `prep` (what the member asked for) and `cycleStart`;
> `/api/member-form-status` adds `appointmentsSummary` on the `prep` entry once published. The batch POST is still
> accepted for old clients but no UI calls it. The tab table below describes the retired Apply flow.

## Member side (legacy description): `/forms/kvk-appointments?tab=...`

Each tab is a real link, so it can be shared and works with the Back button.

| Tab | URL | What it does |
|---|---|---|
| Apply | `?tab=apply` (default) | ONE form for all three buffs: shared in-game name, then per buff a Yes/No choice, TG, TTG, speedup days and **exactly 3** preferred hours. One Save. Saying No to a buff already applied for asks to confirm, then removes the application and any slot |
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

Open/close the form in Admin > Form Gates ("KvK Appointments") or from the KvK event control (`/api/admin-event-control?type=kvk`). Every form gate (including `appointments`) accepts `opens_at`, `closes_at` and `cycle_id` through `PATCH /api/admin-form-gates`. With no window the gate is a manual open/close switch; with a window the member routes open and close it by time (`windowState`, enforced server-side by `checkFormOpen` in `lib/formGates.server.js`) and answer with "This form is closed. It closed on ..." or "This form is not open yet. It opens on ...". `cycle_id` comes from the gate (default `current`). The KvK event control's `start_cycle` action sets it to the new event cycle id on every KvK form, so the new cycle gets a clean applications/assignments/published state while old rows are kept under the old cycle id.

## Data

| Collection | Unique index | Notes |
|---|---|---|
| `kvk_appointment_applications` | `member_id, day, buff, cycle_id` | upsert target |
| `kvk_appointment_assignments` | `cycle_id, day, buff, slot` **and** `cycle_id, day, buff, member_id` | no double booking, one slot per member; `manual` flag marks admin picks |
| `kvk_appointment_cycles` | `cycle_id` | `published`, `published_at` |

Registered in `lib/mongoCollections.js`; apply with `node scripts/ensure-indexes.mjs`.

## Routes

- `GET/POST /api/kvk-appointments` (member session): my applications (+ assignments when published). POST takes `{in_game_name, applications:[...], withdraw:[{day,buff}]}` (validated all-or-nothing; withdraw also deletes the member's assignment) or the older single `{day,buff,...}` body. Closed gate -> 403.
- `GET /api/kvk-appointments/schedule` (member session): published schedule.
- `GET/POST /api/admin-kvk-appointments` (admin): list; `auto_allocate`, `assign`, `unassign`, `publish`.

Tests: `tests/kvkAppointments.test.mjs` (options, formula, validation, allocator, status text), `tests/kvkAppointmentsRoute.test.mjs` (auth, gate, upsert, allocation, publish visibility), Playwright `scripts/qa-interactions.js` (picker renders 24 options, enforces exactly 3, tab URLs).

The older Noble Advisor form (`/forms/flamedragon-tyrant/noble-advisor`, `lib/nobleAdvisor.mjs`) is untouched: it is the Flamedragon-period Troop Training booking with its own questions and admin page. This flow generalises the same idea; migrating the old form into it is not done.

## Cycle control and history

`GET/POST /api/admin-event-control` (admin) runs a whole KvK or Flamedragon Tyrant cycle: `start_cycle`, `close_forms`, `open_forms`, `set_window`, `publish`/`unpublish` (KvK only), `archive_reset` (needs `confirm: true`). Implementation: `lib/eventControl.server.js`.

History: a member has one roster row, so when a member resubmits in a newer cycle the old row is first copied into `event_cycle_snapshots` (`{event_type, event_cycle_id, label, member_id, payload, archived_at}`, PIN hash never copied). `start_cycle` and `archive_reset` also snapshot the whole roster. `GET /api/admin-submissions?cycle=<id>` and `GET /api/admin-flamedragon?cycle=<id>` read a past cycle from those snapshots. Rally planner rows (`admin_rallies`, `admin_flamedragon_rallies`) carry `event_cycle_id`; the planner only loads and replaces the current cycle's rows (untagged legacy rows count as current until the cycle is retired).
