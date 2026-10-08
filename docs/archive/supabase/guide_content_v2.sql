-- Real content for the three guides seeded as placeholders in
-- kingdom_guides.sql ("Log in as an admin to replace this starter text").
-- Written in markdown, since app/guides/[slug]/GuideArticle.js now renders
-- guide bodies through react-markdown + remark-gfm (PR 7) instead of a
-- plain white-space:pre-wrap text block.
--
-- Grounded in this app's own already-built mechanics (rallyState.mjs's
-- scoring/cap logic, the Minister's Hall prep-backpack flow) rather than
-- Kingshot combat formulas, which this plan explicitly flagged as needing
-- real player data to validate before publishing (see Wave 4 / the combat
-- model PR) - these three guides describe how K710's OWN tools work, which
-- is independently verifiable from the code, not asserted from outside it.
--
-- Idempotent: safe to re-run.

update public.kingdom_guides set
  body = $md$## What this page is for

This is the reference for anyone leading or joining a rally in K710's Rally Roster tool (Muster Hall → Player Records). It explains what the tool actually does with your input, so you can use it well instead of guessing.

## How a rally lead sets up a rally

Every rally has three controls a lead sets:

- **Troop weights** — three sliders (Infantry / Cavalry / Archer, 0–100 each) that tell the auto-assign tool which troop type this rally values. A rally weighted 100/0/0 will fill entirely from your best infantry before it looks at anyone else.
- **Lead heroes** — up to **four** heroes marked as this rally's leadership set. This cap is enforced by the tool itself, not just the UI: a fifth hero simply won't be added until you remove one first.
- **Lead member** — the member who owns the march.

## How auto-assign actually picks people

When you click "Auto-assign," the tool scores every unassigned, available member against your rally's weights:

1. Members already committed to another rally are never poached.
2. Members marked "Not available" are skipped entirely, regardless of how strong their troops are.
3. Everyone else is scored: each troop type's tier and truegold level combine into a weighted score using your sliders, and a **flat bonus is added for every lead hero the member owns** — a strong hero match can outrank a member with better raw troop levels.
4. The highest-scoring members fill the rally up to its member limit.

The practical takeaway: if you want infantry specialists, weight infantry heavily. If a specific hero matters more than raw numbers this cycle, set it as a lead hero and the tool will prioritize members who have it.

## What a rally lead should do before the window opens

- Set your troop weights first — auto-assign is only as good as the weights you give it.
- Pick your four lead heroes deliberately; changing them after members are assigned doesn't retroactively re-score anyone.
- Check the roster for members flagged "Not available" — they're excluded on purpose, not a bug.

## What a rally joiner should do

- Keep your troop tier, truegold, and hero roster current in your Player Record. The scoring above reads directly from what you've submitted — an out-of-date record can quietly cost you a rally slot.
- Set your availability honestly. "Not available" removes you from auto-assign for every rally, not just one.
- If you're not seeing lead-hero credit you expect, confirm the hero is actually in your submitted roster, not just in-game.
$md$,
  updated_at = now()
where slug = 'rally-lead';

update public.kingdom_guides set
  body = $md$## Before you're assigned

Everything in this guide comes from one place: your **Player Record**. Rally leads don't manually pick names — an auto-assign tool scores every available member against each rally's settings and fills slots with the best matches. See the *Rally Lead Guide* for the scoring details; this page covers what that means for you.

## Keep your record current

The tool only knows what you've submitted:

- **Troop tier and truegold**, per troop type (Infantry / Cavalry / Archer). This is the core of your score for any rally weighted toward that type.
- **Hero roster.** A rally's lead heroes carry a flat scoring bonus for anyone who owns them — an outdated roster can cost you a slot to someone with a real (but lower) troop score.
- **Availability.** Marking yourself "Not available" removes you from auto-assign entirely, for every rally, not just the one you meant to skip.

If your record is stale, update it before the roster locks — auto-assign runs against whatever is on file at that moment, not what's actually true in-game.

## Getting picked for the rally you want

- A rally weighted heavily toward one troop type will fill from that type first. If you're a specialist, you'll usually be picked for a rally that matches your specialty rather than the first one that opens.
- Owning a rally's lead heroes measurably helps your score. If you know which heroes a rally's lead has set, and you own them, that rally is more likely to want you.
- Being assigned already commits your slot — the tool won't double-book you into a second rally on top of it.

## What to do once you're in

- Confirm who your rally lead is and follow their timing instructions — the roster tool assigns membership, not battlefield calls.
- If your circumstances change (you go inactive, your troops change significantly), update your availability or record rather than leaving it stale for the next assignment cycle.
$md$,
  updated_at = now()
where slug = 'rally-joiner';

update public.kingdom_guides set
  body = $md$## What the Minister's Hall actually schedules

KvK prep runs through the Minister's Hall (Prep Phase Backpack), split into named days. This guide explains what each day is for and what the form is asking.

## Day 1 — Construction

If you want the Chief Minister buff on a construction day, say so here and list which **construction upgrades** you plan to run during it. You'll also submit 30-minute UTC availability windows so leadership can schedule around when you're actually online.

## Day 2 — Research

Same shape, for research: opt in for Chief Minister on a research day, and submit how many days of speedups (including general speedups, not just research-specific ones) you'll be using. This number is what leadership uses to judge how much of a push you can realistically sustain — an honest estimate is more useful than an optimistic one.

## Day 4 — Troop Training

Opt in for a troop-training push day the same way, including your T11 promotion plans if relevant — this feeds into which unit types leadership schedules for that window.

## Day 5 — Overflow

If you weren't scheduled on Day 1 or Day 2, Day 5 is where you go. Submit any times you're available here — this is the safety net that keeps a full submission from going to waste just because two specific days were already full.

## Why availability windows matter more than they look

Every day's availability is collected in the same shape: 30-minute UTC start-time slots. Leadership schedules ministers against these windows directly, so precision here is worth more than in almost any other field on this form — a window you can't actually keep is worse than an honest, narrower one.

## Before you submit

- Decide honestly which day(s) you're actually pushing, rather than opting into every buff and hoping to sort it out later.
- Line up your speedups and TG dust before the window you've picked, not during it.
- If your availability changes after submitting, that's a reason to resubmit, not to quietly no-show your scheduled slot.
$md$,
  updated_at = now()
where slug = 'kvk-preparation';
