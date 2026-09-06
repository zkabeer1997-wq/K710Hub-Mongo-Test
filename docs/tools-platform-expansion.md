# Tools Platform Expansion

## Current increment

Branch: `feature/tools-platform-expansion`

### Completed

- Extended Phase 4 with a five-day KvK Preparation calendar sourced from the Kingshot Mastery Day 1–5 guide.
- Added exact day subtotals and editable daily targets for connected Governor Charms, Governor Gear, Hero Gear, Masters, construction, and research actions when their saved resources map to a published scoring rule.
- Added manual KvK stockpile inputs for Intel Missions, Hero Roulette, Hero Shards, Taming Marks, Widgets, four speedup types, gathering batches, and troop training/promotion by tier.
- Added separate Balanced, KvK Preparation points, and Best verified stat increases objectives. Stat ranking compares percentage-point gains only and never mixes power, event points, or resource counts into a fabricated stat value.
- Added daily checklists, alternate scoring days, before-Day-1 preparation, point-gap indicators, and KvK timing in CSV/JSON/Discord exports.
- Exact pet advancement points remain withheld because the verified pet progression data does not contain advancement-score increases.
- Completed Phase 4 with a unified Account Progression Planner that reads saved Hero Gear, Governor Gear, Charm, Pet, Masters, Construction, Academy, War Academy, Advanced Research, TTG, Dragon's Caravan, and Adventure Stall inputs without modifying the source plans.
- Added editable goal profiles and per-system weights for rally leader, Bear Hunt, PvP, balanced growth, construction, research, KvK preparation, and budget planning.
- Added ranked cross-system actions with source-tool rationale, resource requirements, shortfalls, timelines, weekly actions, bottlenecks, deferred alternatives, sensitivity ranges, and CSV/JSON/Discord exports.
- Kept game calculations inside their verified source engines. The cross-system score is explicitly experimental and subjective: member weight × goal fit × feasibility × deadline fit.
- Added manual targets for systems not yet represented by a saved source plan; manual rows are labeled and never infer costs or game values.
- Added direct source-planner and Player Profile links, saved Phase 4 preferences, responsive desktop/mobile layouts, and a live connection-status workflow.
- Completed Phase 2 with active TTG, Pet Progression, Governor Charm Stats, Hero Gear, Governor Gear, and Masters calculations.
- Added dated source provenance for every Phase 2 dataset and removed all verified-data blocking states.
- Added paired Health + Lethality charm efficiency, 58 Governor Gear tiers, five TTG probability tiers, all published pet generations, six Masters, and Hero Gear reforging safeguards.

- Completed Phase 0 shared persistence, dataset provenance, admin publishing history, and tool-directory infrastructure.
- Completed Phase 1 improvements across Charm, Wavebound, Pet Pack, both event shops, Construction, and Research tools.
- Added all Phase 2 routes: TTG Production, Pet Progression, Governor Charm Stats, Hero Gear, Governor Gear, and Masters.
- Added versioned member persistence for every Phase 2 planner.
- Added deterministic TTG, pet-progression, and charm-ranking engines with fixtures. Engines return explicit missing-data states instead of guessing.
- Activated exact Charm material-feasible ordering from the existing cost table; stat-gain claims remain blocked.
- Added complete input models and visible dataset requirements for the five Phase 2 datasets that have not yet been supplied.

- Audited the current tool catalog, calculators, configuration editor, member-state API, Supabase state table, and calculator tests.
- Added a versioned saved-state envelope and legacy-state migration utilities.
- Added a shared debounced persistence hook with loading, dirty, saving, saved, signed-out, and failed states.
- Integrated Pet Pack Optimizer inputs with member persistence without storing calculated results.
- Added confirmed reset and same-page undo reset to Pet Pack Optimizer.
- Added the centralized dataset manifest foundation and the first reusable Data & assumptions panel.
- Added migration and compatibility tests.
- Added a strict server-side allowlist for member tool-state keys and validation for versioned envelopes.
- Added the saved-plan index used by authenticated “Continue your saved plan” cards.
- Reworked the Tools directory with search, workflow filters, available-tool results, and a separate restrained In development list.
- Added centralized provenance entries and Data & assumptions panels across every current calculator family.
- Added Charm bulk level controls, Infantry-to-Cavalry/Archer copy controls, and collapsible troop sections.
- Added Wavebound worst-case, expected, and best-case material ranges plus the complete binomial outcome distribution.
- Corrected Pet optimizer labeling so only exhaustive searches are called proven lowest-cost; added material-surplus reporting.

### Audit findings

- Charm Pack, Wavebound, Dragon's Caravan, Adventure Stall, and Cost Planner each implement persistence separately.
- Pet Pack Optimizer previously had no member persistence.
- Existing `member_tool_state.state` values are unversioned JSON objects. The new reader treats these as schema version 0 and migrates them without changing the database row until a real member edit occurs.
- Calculated results are component state and are not saved; this correctly separates inputs from results.
- Several tools use manual save while others autosave. Later Phase 0 work should move them to the shared lifecycle incrementally.
- Tool configuration has validation but no provenance, version history, preview, dependency view, or rollback yet.
- Empty categories are currently presented as normal categories with “No tools yet.”

### Dataset status

| Dataset                   | Current source                    | Status                | Missing evidence                                                                                             |
| ------------------------- | --------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Pet pack contents         | Existing repository configuration | Incomplete provenance | Original source, verification date, screenshots or published reference for pack quantities and weekly limits |
| TTG refinement outcomes   | Not supplied                      | Incomplete            | Refinement state, per-run TG cost, min/expected/max TTG output, daily limit                                  |
| Pet progression           | Not supplied                      | Incomplete            | Per-pet, generation, level, advancement, and material rows                                                   |
| Charm stat gains          | Not supplied                      | Incomplete            | Health/Lethality gains by troop, slot, and level                                                             |
| Hero Gear progression     | Not supplied                      | Incomplete            | Costs and stats across rarity, enhancement, mastery, ascension, and imbuement                                |
| Governor Gear progression | Not supplied                      | Incomplete            | Per-piece costs, stats, milestones, and set bonuses                                                          |
| Masters progression       | Not supplied                      | Incomplete            | Relationship, talent, skill, resource, time, power, and buff tables                                          |

No game values were added or changed in this increment.

### Verification

- `npm test`: 125 passed, 0 failed.
- Phase 4 focused tests: 10 passed, covering source-state immutability, weight-driven ordering, infeasible filtering, bottlenecks, manual provenance, sensitivity, safe exports, persistence allowlisting, KvK day assignment, exact point subtotals, stat ranking, and missing-score disclosure.
- `npm run build`: passed with expected missing-local-Supabase warnings during static generation.
- `npm run lint`: passed with 7 pre-existing warnings and no errors.
- Phase 4 stylesheet passes targeted Stylelint. Repository-wide Stylelint remains blocked by pre-existing violations outside Phase 4.
- Vercel preview: READY. Authenticated desktop verification confirmed four real saved-plan recommendations, source links, Player Profile link, loading/connected states, bottlenecks, weekly schedule, and sensitivity output with no Phase 4 runtime errors or horizontal overflow.

### Next work

1. Keep Phase 3 alliance-specific tools on the backburner as requested.
2. Add more saved source targets as members complete the underlying planners; Phase 4 discovers them on Refresh without migrating or overwriting those plans.
3. Re-run mobile device QA in a browser surface that exposes viewport emulation; responsive breakpoints and overflow safeguards are implemented and build-verified.

### Known limitations

- Cross-system priority is intentionally subjective. It does not claim that a percentage of gear stats, building power, research power, and event currency share a universal Kingshot value.
- One next action is imported from each eligible source plan. The source planner remains authoritative for deeper step ordering and exact game calculations.
- Player inventory is connected through the inventory saved inside each source planner; the current Player Profile schema stores power/progression snapshots, not a universal material inventory.
- Autosave currently requires an authenticated member; signed-out users retain only in-memory state for this first increment.
- Reset undo lasts only until navigation or reload.
- The optimizer still runs on the main thread; worker progress/cancellation is part of the Pet improvement phase.
- Existing Pet pack values remain explicitly unverified until source evidence is supplied.
