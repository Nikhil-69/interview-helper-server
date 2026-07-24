#!/usr/bin/env bash
# Deploy to Vercel production, first pushing any env changes from a local file.
#
# Usage:
#   ./deploy.sh              # env from .env.production
#   ./deploy.sh path/to.env  # env from a specific file
#
# Production env lives in .env.production (gitignored), NOT .env — .env holds
# local-dev values (localhost Mongo etc.) that would break the deployed app.
# On first run this script pulls the current Vercel production env into
# .env.production; edit that file and re-run to change a production var.
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE="${1:-.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ "$ENV_FILE" == ".env.production" ]]; then
    echo "==> $ENV_FILE not found — pulling current production env from Vercel"
    npx vercel env pull "$ENV_FILE" --environment=production --yes
    echo "    Created $ENV_FILE. Edit it and re-run ./deploy.sh to change values."
  else
    echo "Env file not found: $ENV_FILE" >&2
    exit 1
  fi
fi

echo "==> Syncing env vars from $ENV_FILE to Vercel (production)"
node scripts/vercel-env.js sync "$ENV_FILE"

echo "==> Deploying to production"
npx vercel deploy --prod --yes

echo "==> Done"
