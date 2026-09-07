# K710 Hub

Kingdom 710's Kingshot portal and operations hub — Next.js 16 (App Router) +
Supabase.

Public surface: the Gate, kingdom guides, and the transfer registry.
Member surface (Member ID + PIN): player record, war ledger, KvK prep, and the
economy optimizers under `/tools`.
Admin surface (shared password): roster, rally builder, transfer review, member
PINs, and inline content editing.

## Setup

1. `npm install`
2. Create `.env.local` — see **Environment** below.
3. `npm run dev`

## Environment

**Required.** The app 500s on most routes without all four.

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | every Supabase client | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabaseClient.js` | Ships in the client bundle — treat as public |
| `SUPABASE_SERVICE_ROLE_KEY` | all server routes | Server only. Never expose |
| `ADMIN_PASSWORD` | `lib/adminAuth.js` | Admin auth **fails closed** if unset — nobody can log in |

**Optional.**

| Variable | Used by | Notes |
|---|---|---|
| `MEMBER_SESSION_SECRET` | `lib/memberAuth.js` | Set this. See the warning below |
| `K710_LIBRETRANSLATE_URLS` | `/api/translate-ui` | Comma-separated mirrors, overrides the defaults |
| `QA_BASE`, `QA_CHROMIUM` | `scripts/qa-routes.js` | Local QA only |

> **Set `MEMBER_SESSION_SECRET` explicitly.** Without it, `lib/memberAuth.js`
> falls back to `SUPABASE_SERVICE_ROLE_KEY`, then to `ADMIN_PASSWORD`. That
> couples member sessions to secrets they have no business sharing: rotating
> the service role key silently signs every member out, and the admin password
> ends up as signing material for member tokens.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Extract UI strings, then start the dev server |
| `npm run build` | Extract UI strings, then production build |
| `npm start` | Serve the production build |
| `npm test` | Unit tests (`node --test` over `tests/**/*.test.mjs`) |
| `npm run lint` | `next lint` |
| `npm run analyze` | Production build with the bundle analyzer |
| `npm run qa` | Route-level regression suite — needs a running build, see below |

`npm run build` regenerates `public/ui-strings.json`, the allowlist
`/api/translate-ui` will translate. It is committed so a bare `next build`
resolves the import on a fresh clone, and rewritten on every build so it never
goes stale.

### Route QA

```
npm run build && npm start -- -p 3111
QA_BASE=http://localhost:3111 npm run qa
```

Asserts route status, heading structure, production field counts on every form,
server-side admin gating, the PIN gate, and horizontal overflow at six widths.

## Database

SQL lives in `supabase/` and is applied by hand through the Supabase SQL editor
— there is no `supabase/migrations/` or CLI setup.

`supabase/core_tables.sql` carries `submissions`, `content_blocks`, the
`public_submissions` view, and the `verify_page_pin` RPC. It also documents two
open items: leftover `anon` write grants on the two oldest tables (currently
inert, because RLS has no permissive policy), and the fact that the full member
roster is readable with the anon key. Read it before changing either.

The pattern for every table added since: enable RLS, `revoke all` from `anon`
and `authenticated`, grant only to `service_role`, and reach it exclusively
through server-side routes.

## Documentation

- `docs/PERF-BASELINE.md` — bundle and route weights, and what the three.js
  Gate scene actually costs.
