# Performance baseline

Recorded at the start of the portal overtake work (PR 1), so later PRs have
something honest to diff against. Regenerate with `npm run build`, or
`npm run analyze` for the interactive treemap.

Measured on `next@14.2.35`, production build, no CDN compression applied
(the byte counts below are on-disk, so they read larger than what a visitor
actually downloads over Brotli).

## Route weights

| Route | Page | First Load JS |
|---|---|---|
| `/` (the Gate) | 4.48 kB | **106 kB** |
| `/interest` | 5.95 kB | 117 kB |
| `/player-record` | 7.25 kB | 122 kB |
| `/player-record/form` | 28 kB | 115 kB |
| `/tools` | 8.19 kB | 108 kB |
| `/tools/charm-pack-optimizer` | 6.93 kB | 107 kB |
| `/guides` | 152 B | 87.6 kB |
| `/guides/[slug]` | 3.47 kB | 94.4 kB |
| `/chronometer` | 2.5 kB | 98.7 kB |
| Shared by all | — | 87.5 kB |
| Middleware | — | 26.8 kB |

Total `.next/static`: **3.0 MB**

## Largest client chunks

| Size | Chunk | What it is |
|---|---|---|
| 672 KB | `b536a0f1.*` | **three.js / react-three-fiber / drei** |
| 172 KB | `fd9d1056-*` | shared vendor |
| 140 KB | `framework-*` | React + Next runtime |
| 132 KB | `283.*` | three.js companion chunk |
| 124 KB | `117-*` | shared app chunk |
| 112 KB | `polyfills-*` | legacy polyfills |

## The three.js situation — read this before PR 5

`components/kingdom/world/GateExperience.jsx:10` already loads the scene with
`dynamic(() => import('./GateScene'), { ssr: false })`. **The 672 KB three.js
chunk is therefore NOT in the homepage's first-load bundle** and does not block
first paint. `/` is a reasonable 106 kB up front.

This corrects an earlier assumption in the overtake plan. The Gate's problem is
*not* that it blocks LCP. What is actually wrong with it:

1. **The SSR body is empty.** `/` server-renders
   `<div id="main"><div class="k-scene"></div></div>` and nothing else — no
   headings, no copy, no links. Crawlers get nothing and a new visitor gets
   nothing to read.
2. **There is no wayfinding.** Navigation is a single floating crest button.
3. **The 672 KB still lands on mobile**, just after hydration rather than
   before it — so it is a data and CPU cost on a phone, not a first-paint cost.

So PR 5 is justified primarily on **content and discoverability**, and only
secondarily on bytes. Measure it that way: the success metric is a non-empty
SSR body with real `<a href>` navigation, not a first-load JS delta.

## What to watch

- **Budget:** LCP < 2.5s on 4G mobile.
- Keep `/` first-load JS at or under 106 kB as content is added in PR 5.
- The 672 KB scene chunk should become *conditional* in PR 5 (viewport,
  `prefers-reduced-motion`, `saveData`, `deviceMemory`), not merely deferred.
- `polyfills-*` at 112 KB is worth revisiting; it serves browsers this audience
  almost certainly does not use.


## PR 5 update — the front door has content now

`/` is server-rendered with real headings, `<a href>` nav, and CTAs — no
longer an empty `<div class="k-scene">`. Verified against the built,
minified output, not just by reading the source: fetched `/` from a
production server and grepped the raw HTML for `<h1>` and `<a href>` — both
present. First Load JS is **100 kB**, down slightly from the 106 kB
pre-PR-5 baseline above (the Gate scene went from merely deferred to
genuinely conditional — see below).

The three.js scene now only mounts when `window.innerWidth >= 768`,
`prefers-reduced-motion` is not set, there's no Save-Data header, and
`detectQuality()` isn't `'mobile'` (checked once on mount in
`GateBackdrop.jsx`). Everywhere else, `.gate-backdrop-art` — a CSS gradient,
zero extra bytes, shared via the `--gate-fallback-gradient` token with the
scene's own no-WebGL fallback — renders instead, immediately, with no
loading state to wait on.

The full cinematic moved to `/gate` (5.25 kB page, 107 kB First Load JS,
statically prerendered) — unchanged behaviour, just no longer forced to be
the front door. Reached via a hero link, not an auto-redirect: an
unskippable interstitial in front of a homepage that finally has content
would undo the point of rebuilding it.

## Next.js 14 → 16 migration update

Bumped `next` 14.2.35 → 16.3.3, `eslint-config-next` to match, and
`react`/`react-dom` 18.3.1 → 19.2.8 (forced by the same upgrade: the Gate's
`@react-three/fiber@8` pins `react-reconciler@0.27`, which reads a React
internals shape Next 15+ no longer provides — confirmed broken on both
Next 15.5.24 and 16.3.3, both webpack and Turbopack, as a full white-page
crash on `/` and `/gate`, not a contained failure. Fixed by bumping
`@react-three/fiber` 8→9 and `@react-three/drei` 9→10, which hard-require
React 19). `npm audit` went from 9 vulnerabilities (2 low, 2 moderate, 5
high, several Next-CVE and a PostCSS XSS/path-traversal chain bundled
inside `next` itself) to 0.

Turbopack is now the default production builder, and its build output no
longer prints a per-route First Load JS table the way webpack's did — the
route-by-route byte counts above can't be regenerated in the same shape
without additional `@next/bundle-analyzer` work. The one number that is
directly comparable: total `.next/static` went from 3.0 MB to 3.1 MB, a
small increase consistent with React 19 plus the newer three.js/fiber/drei
majors, not a regression worth chasing.

Every route was re-verified after the migration: `npm test` (3/3), `npm
run lint` (0 errors, same 2 pre-existing warnings as before), production
build, and a boot + Playwright pass across all 15 public routes plus the
authenticated admin dashboard (dnd-kit rally board) — zero console errors
or crashes on any of them, including the previously-broken Gate scene.

## Route status update — 2026-10-15

The `/gate` page has been removed. The homepage at `/` is the public entry
point and no current homepage or site-navigation links send visitors to
`/gate`. The Gate scene components remain in the source tree but are no longer
exposed as a page route.
