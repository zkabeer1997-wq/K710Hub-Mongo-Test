# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Kingshot players in Kingdom 710 and the wider player community who need reliable planning tools for account progression, events, purchases, and kingdom operations.

## Product Purpose

K710Hub combines public Kingdom 710 information, member records, operational forms, administration, and calculation tools. Its optimizers turn a player’s current inventory and target state into explicit resource requirements, purchase recommendations, and schedules.

## Positioning

The site connects individual Kingshot progression tools to a saved member roadmap and Kingdom 710’s operational workflows rather than presenting isolated calculators.

## Operating Context

Players typically use the tools while reviewing their in-game inventory, planning weekly or monthly purchases, preparing for KvK, or comparing upgrade paths. Exact game data, purchase limits, resource conversions, and event cadence materially affect recommendations.

## Capabilities and Constraints

- Next.js App Router application deployed through Vercel.
- MongoDB-backed member and administrative workflows.
- Tools are grouped by progression category under `/tools`.
- Do not invent game costs, pack contents, resource values, or purchase limits.
- Exact, unavailable, inferred, and subjective values must be visibly distinguished.
- Optimizers should support current inventory, targets, time-based purchase limits, explicit results, and saved-roadmap integration where applicable.
- Masters Acuity packs are available once per month per price tier and allow one reward selection per purchased tier.
- Regular Masters pack families are available once per week per price tier.

## Brand Commitments

- Product name: K710Hub.
- Preserve the existing forge/shield identity transition.
- Public pages use Realm mode; tools, forms, records, and administration use Console mode.
- Interface language should be direct, practical, and specific to Kingshot.

## Evidence on Hand

- `DESIGN.md` records the established visual system.
- `lib/phase2Data.mjs` contains verified Masters relationship and skill progression data.
- `components/tools/Phase2Planners.jsx` contains the existing Masters Planner.
- `app/tools/PetPackOptimizer.js` and `lib/petPackOptimizer.mjs` provide the requested purchase-optimizer interaction baseline.
- User-supplied Masters Acuity and regular pack values were confirmed on 2026-09-08.

## Product Principles

- Never present guessed game data as fact.
- Show the cheapest actionable path, not only aggregate totals.
- Make purchase cadence and inventory assumptions explicit.
- Keep operational tools compact, readable, and consistent.
- Preserve member progress between sessions where the existing tool infrastructure supports it.

## Accessibility & Inclusion

All tools should remain keyboard accessible, responsive at mobile widths, readable at practical contrast, and understandable without relying on color alone.
