#!/usr/bin/env bash
# Local macOS setup: Vercel env pull -> read-only Atlas mongodump -> local mongorestore -> .env.local
# Prints no secret values. Only Atlas operations: mongodump and read-only count queries.
set -euo pipefail
cd "$(dirname "$0")/.."

ask() { read -r -p "$1 [y/N] " a; [[ "$a" == [yY]* ]]; }
need() { command -v "$1" >/dev/null 2>&1; }

# Safety: secrets/dumps must be git-ignored before we create them.
for p in .env.local dump/x; do
  git check-ignore -q "$p" || { echo "ERROR: $p is not git-ignored. Fix .gitignore first."; exit 1; }
done

echo "== 1. Prerequisites (Homebrew) =="
need brew || { echo "Install Homebrew first: https://brew.sh"; exit 1; }
brew tap mongodb/brew >/dev/null
for f in node@22 git vercel-cli mongodb-community mongodb-database-tools mongosh; do
  brew list --formula "$f" >/dev/null 2>&1 || { echo "Installing $f"; brew install "$f"; }
done
brew services start mongodb-community >/dev/null
for i in {1..20}; do mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1 && break; sleep 1; done
mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null && echo "Local MongoDB responding on localhost:27017"

echo "== 2. Vercel env pull =="
if [ ! -d .vercel ]; then vercel login; vercel link; fi
PULL=.env.production.local   # matches .env*.local (git-ignored)
vercel env pull "$PULL" --environment=production --yes >/dev/null
echo "Variables pulled (names only):"; grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$PULL" | cut -d= -f1 | sed 's/^/  - /'
for v in MONGODB_URI ADMIN_PASSWORD MEMBER_SESSION_SECRET CRON_SECRET; do
  val=$(grep -E "^$v=" "$PULL" | head -1 | cut -d= -f2- | tr -d '"')
  [ -n "$val" ] || echo "  ! $v is missing/empty (Sensitive vars can't be pulled) - you must supply it"
done

get() { grep -E "^$1=" "$PULL" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
ATLAS_URI=$(get MONGODB_URI)
[ -n "$ATLAS_URI" ] || { echo "MONGODB_URI not pullable. Paste the Atlas URI into $PULL by hand (MONGODB_URI=...) and rerun."; exit 1; }
DB=$(get MONGODB_DB_NAME); DB=${DB:-k710hub}

echo "== 3. Dump Atlas (read-only) =="
export ATLAS_URI
mongodump --uri="$ATLAS_URI" --db="$DB" --out=./dump --quiet \
  || { echo "mongodump failed. If it is a connection/timeout error: Atlas > Network Access > add this Mac's IP."; exit 1; }

echo "== 4. Restore to local =="
if mongosh --quiet --eval "db.getSiblingDB('$DB').getCollectionNames().length" | grep -qv '^0$'; then
  ask "Local DB '$DB' already has data. Drop and overwrite it?" || { echo "Aborted; nothing dropped."; exit 1; }
  DROP=--drop
else DROP=; fi
mongorestore --uri="mongodb://localhost:27017" --nsInclude="$DB.*" $DROP ./dump

echo "== 5. Verify counts (Atlas read-only counts vs local) =="
JS="db.getSiblingDB('$DB').getCollectionNames().sort().map(n=>n+': '+db.getSiblingDB('$DB').getCollection(n).countDocuments()).join('\n')"
mongosh "$ATLAS_URI" --quiet --eval "$JS" > .count-atlas.tmp
mongosh --quiet --eval "$JS" > .count-local.tmp
cat .count-local.tmp
diff -q .count-atlas.tmp .count-local.tmp >/dev/null && echo "OK: counts match" || { echo "MISMATCH:"; diff .count-atlas.tmp .count-local.tmp || true; }
rm -f .count-atlas.tmp .count-local.tmp

echo "== 6. Write .env.local =="
if [ -f .env.local ]; then ask "Overwrite existing .env.local?" || { echo "Left .env.local untouched."; exit 0; }; fi
umask 077
{
  # carry over non-DB, non-Vercel-internal vars; drop live Google OAuth/cron
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$PULL" | grep -vE '^(MONGODB_URI|MONGODB_DB_NAME|VERCEL_[A-Z_]*|NX_[A-Z_]*|TURBO_[A-Z_]*|GOOGLE_DRIVE_[A-Z_]*|CRON_SECRET)=' || true
  echo "MONGODB_URI=mongodb://localhost:27017/$DB"
  echo "MONGODB_DB_NAME=$DB"
  echo "CRON_SECRET=local-cron-secret"
} > .env.local
grep -q '^ADMIN_PASSWORD=.\+' .env.local || echo "ADMIN_PASSWORD=local-admin" >> .env.local
grep -q '^MEMBER_SESSION_SECRET=.\+' .env.local || echo "MEMBER_SESSION_SECRET=$(openssl rand -base64 32)" >> .env.local
unset ATLAS_URI
echo "Done. Atlas URI is not in .env.local:"; grep -c 'mongodb+srv\|mongodb.net' .env.local || true
echo "Next: npm install && npm run dev"
