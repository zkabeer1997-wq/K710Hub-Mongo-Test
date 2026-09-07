# K710 Hub — MongoDB Test Stack

**This is a full parallel copy of the production K710 Hub, running on MongoDB instead of Supabase.**

Use this repository and its Vercel deployment to test changes safely before touching the live Supabase + Vercel production stack (`k710hub.vercel.app`).

- **Production (do not break)**: https://github.com/zkabeer1997-wq/KvK-Tracker-710 → k710hub.vercel.app (Supabase)
- **This test stack**: https://github.com/zkabeer1997-wq/K710Hub-Mongo-Test → (new Vercel project under legendofzenzen710@gmail.com) (MongoDB)

Kingdom 710's Kingshot portal and operations hub — Next.js 16 (App Router) + MongoDB.

Public surface: the Gate, kingdom guides, and the transfer registry.  
Member surface (Member ID + PIN): player record, war ledger, KvK prep, and the economy optimizers under `/tools`.  
Admin surface (shared password): roster, rally builder, transfer review, member PINs, and inline content editing.

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
| `MEMBER_SESSION_SECRET` | `lib/memberAuth.js` | **Set this explicitly.** Used to sign member session tokens |

**Legacy / transitional (still present while migration is in progress)**

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Will be removed once every route uses MongoDB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Will be removed |
| `SUPABASE_SERVICE_ROLE_KEY` | Will be removed |

> **Set `MEMBER_SESSION_SECRET` explicitly.** Do not fall back to any database secret.

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

Auth stays identical to production:
- Member ID + PIN (bcrypt hash stored on the member document)
- Signed member session cookie (`k710_member_session`)
- Shared admin password

## Migration status

- [x] Repo duplicated from production
- [x] MongoDB client + collection definitions
- [ ] Data layer rewrite (replace every Supabase call)
- [ ] Full production data import
- [ ] New Vercel project under legendofzenzen710@gmail.com
- [ ] End-to-end verification

## Documentation

- `docs/PERF-BASELINE.md` — bundle and route weights
