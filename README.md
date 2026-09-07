# K710 Hub — MongoDB Test Stack

**This is a full parallel copy of the production K710 Hub, running on MongoDB instead of Supabase.**

Use this repository and its Vercel deployment to test changes safely before touching the live Supabase + Vercel production stack (`k710hub.vercel.app`).

- **Production (do not break)**: https://github.com/zkabeer1997-wq/KvK-Tracker-710 → k710hub.vercel.app (Supabase)
- **This test stack**: https://github.com/zkabeer1997-wq/K710Hub-Mongo-Test → (new Vercel project under legendofzenzen710@gmail.com) (MongoDB)

Kingdom 710's Kingshot portal and operations hub — Next.js 16 (App Router) + MongoDB.

Public surface: the Gate, kingdom guides, and the transfer registry.  
Member surface (Kingshot Player ID + in-game verification code): player record, war ledger, KvK prep, and the economy optimizers under `/tools`.  
Admin surface (shared password, or a Kingshot session with admin/superadmin role): roster, rally builder, transfer review, member PINs, and inline content editing.

## Setup

1. `npm install`
2. Create `.env.local` — see **Environment** below.
3. `npm run dev`

## Environment

**Required for the MongoDB test stack**

| Variable | Used by | Notes |
|---|---|---|
| `MONGODB_URI` | `lib/mongo.js` | Full connection string including password. Server only. Never expose. |
| `MONGODB_DB_NAME` | `lib/mongo.js` | Defaults to `k710hub` if unset |
| `ADMIN_PASSWORD` | `lib/adminAuth.js` | Admin auth **fails closed** if unset — nobody can log in |
| `MEMBER_SESSION_SECRET` | `lib/memberAuth.js`, `lib/memberSessionSecret.js` | **Set this explicitly in every environment.** Signs member session tokens; login **fails closed** if unset — there is no fallback to `ADMIN_PASSWORD` or any other secret. |
| `CRON_SECRET` | `app/api/cron/gift-codes/route.js` | Bearer token Vercel Cron sends; required for the daily gift-code check |

**Optional / feature-specific**

| Variable | Notes |
|---|---|
| `KINGSHOT_API_BASE_URL`, `KINGSHOT_PLAYER_API_URL`, `KINGSHOT_PLAYER_SEARCH_URL` | Upstream endpoints for the Kingshot login flow (`lib/kingshotLogin.js`) |
| `CHARM_OCR_ENDPOINT`, `GOVERNOR_CHARM_OCR_ENDPOINT`, `GOVERNOR_GEAR_OCR_ENDPOINT` | Screenshot-scanning tools; those features degrade gracefully without them |
| `K710_LIBRETRANSLATE_URLS` | Comma-separated LibreTranslate mirrors for `/api/translate-ui`; falls back to public mirrors |

This stack no longer uses Supabase for anything — all `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` variables can be removed from every environment.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Extract UI strings, then start the dev server |
| `npm run build` | Extract UI strings, then production build |
| `npm start` | Serve the production build |
| `npm test` | Unit tests (`node --test` over `tests/**/*.test.mjs`) |
| `npm run lint` | `next lint` |
| `npm run analyze` | Production build with the bundle analyzer |
| `npm run qa` | Route-level regression suite |

## Database (MongoDB)

Collections live in the database named by `MONGODB_DB_NAME` (default `k710hub`).

See `lib/mongoCollections.js` for the canonical list of collections and the indexes that must exist.

Auth:
- Kingshot Player ID + in-game verification code (`lib/kingshotLogin.js`, `lib/memberAuthKingshot.js`)
- Signed member session cookie (`k710_member_session`), also accepted by the legacy edge-safe reader in `lib/memberAuth.js`
- Shared admin password, or a Kingshot session with `admin`/`superadmin` role (`lib/adminAuth.js`)

Uploaded images (gallery, guide attachments) are stored as base64 data URLs directly in their documents rather than in object storage — see **Image storage** in `docs/CUTOVER.md` for the size caps that keeps them under MongoDB's 16 MB per-document limit.

## Migration status

- [x] Repo duplicated from production
- [x] MongoDB client + collection definitions
- [x] Data layer rewrite (every route uses MongoDB; Supabase is fully removed)
- [x] New Vercel project under legendofzenzen710@gmail.com (live)
- [ ] Full production data import
- [ ] End-to-end verification

## Documentation

- `docs/PERF-BASELINE.md` — bundle and route weights
- `docs/CUTOVER.md` — env parity, data migration checklist, image storage notes
- `docs/DEPLOYMENT_READINESS_AUDIT.md` — deployment readiness audit and fix history
