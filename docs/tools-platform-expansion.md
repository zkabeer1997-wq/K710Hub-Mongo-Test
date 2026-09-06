# Tools Platform Expansion

## Current increment

Branch: `feature/tools-platform-expansion`

### Completed

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

- `npm test`: 89 passed, 0 failed.
- `npm run build`: passed with expected missing-local-Supabase warnings during static generation.
- `npm run lint`: blocked by a pre-existing unescaped apostrophe in `components/GiftCodeRewards.jsx`; no lint findings were reported in the new files.
- Local production server: Next.js compiled, but this environment failed while enumerating network interfaces (`uv_interface_addresses`), so browser visual verification remains pending.

### Next work

1. Add API validation for the versioned envelope and tool-key allowlisting.
2. Migrate Charm Pack, Wavebound, Dragon's Caravan, Adventure Stall, and Cost Planner to the shared persistence lifecycle.
3. Add safe reset/undo and input/result invalidation consistently.
4. Expand the dataset manifest to every existing calculator dataset.
5. Rework the Tools directory into available and in-development sections with search, filters, and saved-plan continuation.
6. Extend admin tool configuration with provenance metadata and version history.

### Known limitations

- Phase 2 calculation surfaces dependent on missing datasets deliberately show “Verified dataset required”; they do not claim projections or optimal recommendations.
- Governor Gear and Hero Gear profile synchronization is structurally ready but cannot safely map OCR labels to progression rows until the corresponding dataset defines canonical piece identifiers.

- Autosave currently requires an authenticated member; signed-out users retain only in-memory state for this first increment.
- Reset undo lasts only until navigation or reload.
- The optimizer still runs on the main thread; worker progress/cancellation is part of the Pet improvement phase.
- Existing Pet pack values remain explicitly unverified until source evidence is supplied.
