# Local setup (macOS)

Runs `npm run dev` against a local MongoDB with no dependence on production.
Production is treated as read-only: the only Atlas operations are `mongodump` and read-only `countDocuments` checks.

## Stack
Next.js 16 (App Router), React 19, npm (`package-lock.json`), Node >= 22 (`.nvmrc` = 22), MongoDB driver 6.
Database name: `MONGODB_DB_NAME` (default `k710hub`).

## One-shot setup
```bash
git clone https://github.com/zkabeer1997-wq/K710Hub-Mongo-Test.git && cd K710Hub-Mongo-Test
git checkout claude/local-dev-setup-p36qh6    # until merged
./scripts/local-setup.sh
npm install
npm run dev                                   # http://localhost:3000
```
The script installs (Homebrew) node@22, git, vercel-cli, mongodb-community, mongodb-database-tools, mongosh; starts MongoDB; runs `vercel login/link/env pull` into the git-ignored `.env.production.local`; dumps Atlas to `./dump` (git-ignored); restores into local; compares collection counts; writes `.env.local`. It prompts before dropping a local DB or overwriting `.env.local`, and never prints secret values.

## Things only you can do
- `vercel login` (browser) and `vercel link`.
- Atlas > Network Access: add this Mac's IP if `mongodump` times out.
- Sensitive Vercel variables can't be pulled. Likely `MONGODB_URI`, `ADMIN_PASSWORD`, `MEMBER_SESSION_SECRET`. For the URI, add `MONGODB_URI=...` to `.env.production.local` and rerun. The script falls back to a local `ADMIN_PASSWORD` and a generated `MEMBER_SESSION_SECRET`.

## Env vars the code reads
`MONGODB_URI`, `MONGODB_DB_NAME`, `ADMIN_PASSWORD`, `MEMBER_SESSION_SECRET`, `CRON_SECRET`, `GOOGLE_DRIVE_CLIENT_ID/SECRET`, `KINGSHOT_API_BASE_URL`, `KINGSHOT_PLAYER_API_URL`, `KINGSHOT_PLAYER_SEARCH_URL`, `CHARM_OCR_ENDPOINT`, `GOVERNOR_CHARM_OCR_ENDPOINT`, `GOVERNOR_GEAR_OCR_ENDPOINT`, `K710_LIBRETRANSLATE_URLS`, `VERCEL_ENV` (set by Vercel), `QA_BASE`/`QA_CHROMIUM` (QA scripts).

## Differences locally
- Google Drive export is disabled (OAuth client vars are not copied). To enable it, register `http://localhost:3000/api/google-drive/callback` in the Google Cloud OAuth client and add the vars.
- Vercel cron (`/api/cron/gift-codes`) doesn't run; call it with `Authorization: Bearer $CRON_SECRET` to test.
- Kingshot login, OCR and translate endpoints call external services (read-only upstream APIs, no production writes).
- Image uploads are base64 in MongoDB, so they are included in the dump.

## Re-sync data from Atlas
```bash
./scripts/local-setup.sh   # answers "y" to drop/overwrite prompts to refresh
```
or manually: `mongodump --uri="$ATLAS_URI" --db=k710hub --out=./dump && mongorestore --nsInclude='k710hub.*' --drop ./dump`

## Start / stop
```bash
brew services start mongodb-community   # / stop
npm run dev                             # Ctrl+C to stop
```
Optional: `node --env-file=.env.local scripts/ensure-indexes.mjs`.
