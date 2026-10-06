# Local development (Mac mini)

Runs the whole stack on your machine, isolated from Atlas and Vercel.

## Quick start

```bash
git clone https://github.com/zkabeer1997-wq/K710Hub-Mongo-Test.git
cd K710Hub-Mongo-Test
# Optional: copy Atlas data locally (read-only on Atlas, writes only to localhost)
ATLAS_URI='mongodb+srv://USER:PASS@cluster.mongodb.net' bash scripts/local-setup.sh
# or, for an empty local database:
bash scripts/local-setup.sh
npm run dev
```

Admin password locally: `local-admin` (edit `.env.local`).

## What maps to what

| Live | Local |
|---|---|
| GitHub repo | your clone (use a feature branch; Vercel only deploys what you push) |
| MongoDB Atlas | Homebrew `mongodb-community` on `127.0.0.1:27017`, db `k710hub` |
| Vercel env vars | `.env.local` with freshly generated local secrets |
| Vercel hosting / cron | `npm run dev`; trigger cron manually: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/gift-codes` |

## Safety rules

- Do **not** run `vercel link`, `vercel env pull`, or `vercel deploy` — `env pull` would copy the live Atlas URI into `.env.local`.
- Keep `MONGODB_URI` at `127.0.0.1` in `.env.local`.
- Don't push to the branch Vercel deploys to production; work on branches.
- Optional Google Drive / OCR / Kingshot variables aren't copied; add them only if you need those features (use dev credentials where possible).
- Re-sync data any time by re-running the script with `ATLAS_URI` (it drops and replaces local collections).
