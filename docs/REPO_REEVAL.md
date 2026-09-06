# Repo re-evaluation (2026-09-06)

## KvK-Tracker-710
- Role: **production source of truth** (Supabase), https://k710hub.vercel.app
- Branch policy: use **`main` only** for ports. 77 side branches; most are stale experiments.
- Do not merge `agent/*`, Discord-auth, or design-experiment branches into Mongo-Test.

## K710Hub-Mongo-Test
- Role: **Mongo + Kingshot migration target**, https://k710-hub-mongo-test.vercel.app
- Branch policy: **single `main`** — keep it that way.
- Auth: Kingshot primary; legacy PIN login/register APIs return 410; admin password remains.
- Data: Mongo collections via `lib/mongo.js` + `COLLECTIONS`.

## Parity status after this pass
| Area | Status |
|------|--------|
| adminTimeWindow + roster/prep cutoffs | Ported |
| About full layout + Mongo alliances | Restored |
| PIN public login/register | 410 |
| KvK availability PIN for Kingshot sessions | Removed |
| Interest accept without PIN | Already on Mongo path |
| Public seed helper | `scripts/seed-public-content.mjs` |
| Cutover checklist | `docs/CUTOVER.md` |

## Still environment-dependent
- Full data density (events/guides/alliances content) requires running seed/migration against live `MONGODB_URI`.
- Vercel env secrets cannot be verified from this agent against legendofzenzen710 account.
- Admin interior pixel-match after login requires authenticated session on deployed preview.
