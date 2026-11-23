#!/usr/bin/env bash
# Resets the LOCAL database to the clean demo state used in DEMO_RUNBOOK.md.
# DESTRUCTIVE: wipes all users (admins too), students, courses, kurskort,
# enrollments, grades, notifications and GridFS files, then seeds the demo
# accounts (admin@mindful.se / teacher@mindful.se / student@mindful.se) and
# demo kurskort. This is what `DEMO=1 bash launch.sh` used to do; launch.sh
# itself no longer deletes anything.
#
# Usage (from anywhere):  bash backend/scripts/resetDemo.sh --yes
# Then start the app:     bash launch.sh
set -euo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"

if [ "${1:-}" != "--yes" ]; then
  echo "❌ resetDemo.sh wipes the local database and seeds demo data."
  echo "   Run with --yes to continue:  bash backend/scripts/resetDemo.sh --yes"
  exit 1
fi

cd "$BACKEND"
set -a
# shellcheck disable=SC1091
source ./.env.development
set +a

# Same local-only guard as the other reset scripts.
node --input-type=module -e '
import { assertLocalMongoUri } from "./scripts/lib/dbReset.js";
assertLocalMongoUri(process.env.MONGODB_URI, { allowRemote: process.env.ALLOW_REMOTE_DB === "1" });
'

node scripts/seedE2EData.js            # wipes, then seeds accounts + e2e data
node scripts/updateEducation.js        # restores the full GY25 catalog (the seed wipes courses)
node scripts/seedMindfulFaq.js
node scripts/seedDemoData.js           # current-dated kursinstanser with filled kurskort

echo "✅ Demo data ready. Start the app with: bash launch.sh"
