#!/usr/bin/env bash
# One-time local setup for macOS (Apple Silicon or Intel).
# - Installs Node 22, MongoDB Community (local) and database tools via Homebrew
# - Writes .env.local pointing ONLY at localhost MongoDB
# - Optionally copies data from Atlas into local MongoDB (read-only dump of Atlas)
#
# Usage:
#   bash scripts/local-setup.sh                       # empty local DB + indexes
#   ATLAS_URI='mongodb+srv://...' bash scripts/local-setup.sh   # also clone Atlas data
set -euo pipefail

cd "$(dirname "$0")/.."
DB_NAME="${MONGODB_DB_NAME:-k710hub}"
LOCAL_URI="mongodb://127.0.0.1:27017"

command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh"; exit 1; }

brew list node@22 >/dev/null 2>&1 || brew install node@22
brew link --overwrite --force node@22 >/dev/null 2>&1 || true
brew tap mongodb/brew
brew list mongodb-community >/dev/null 2>&1 || brew install mongodb-community
brew list mongodb-database-tools >/dev/null 2>&1 || brew install mongodb-database-tools
brew services start mongodb-community

echo "Waiting for local MongoDB..."
for _ in $(seq 1 30); do
  nc -z 127.0.0.1 27017 && break
  sleep 1
done

npm install

if [ ! -f .env.local ]; then
  rand() { openssl rand -hex 32; }
  cat > .env.local <<ENV
# LOCAL ONLY — never put production/Atlas credentials here.
MONGODB_URI=${LOCAL_URI}
MONGODB_DB_NAME=${DB_NAME}
ADMIN_PASSWORD=local-admin
MEMBER_SESSION_SECRET=$(rand)
CRON_SECRET=$(rand)
ENV
  echo "Wrote .env.local (local Mongo, local-only secrets; admin password: local-admin)"
else
  echo ".env.local already exists — left untouched. Make sure MONGODB_URI is localhost."
fi

if [ -n "${ATLAS_URI:-}" ]; then
  DUMP_DIR="$(mktemp -d)"
  echo "Dumping Atlas (read-only) -> ${DUMP_DIR}"
  mongodump --uri="${ATLAS_URI}" --db="${DB_NAME}" --out="${DUMP_DIR}"
  echo "Restoring into local ${DB_NAME} (drops existing local collections)"
  mongorestore --uri="${LOCAL_URI}" --drop --nsInclude="${DB_NAME}.*" "${DUMP_DIR}"
  rm -rf "${DUMP_DIR}"
fi

MONGODB_URI="${LOCAL_URI}" MONGODB_DB_NAME="${DB_NAME}" node scripts/ensure-indexes.mjs

echo
echo "Done. Start the app with: npm run dev  ->  http://localhost:3000"
