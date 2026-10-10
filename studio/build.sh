#!/usr/bin/env bash
# Rebuild Studio and publish it as the bundle's app source.
#
#   ./studio/build.sh
#
# `apps/studio/source/` is a prebuilt static site (index.html and its assets, no
# package.json). That is what lets a fresh pod import in seconds: with a package.json
# there, every import would run npm and a Vite build that needs VITE_LEMMA_* values a
# fresh pod has never had.
#
# Nothing pod-specific may be baked in. The host injects window.__LEMMA_CONFIG__ when
# it serves the app, so the same bytes serve any pod. Vite inlines VITE_LEMMA_* from
# the environment and from .env files, and this repository is public, so the
# variables are unset and .env files are moved aside for the build.
set -euo pipefail
cd "$(dirname "$0")"
OUT="../apps/studio/source"
ENVS=(.env.local .env .env.production .env.production.local)

[ -d node_modules ] || npm ci
restore() { for f in "${ENVS[@]}"; do [ -f "$f.build-aside" ] && mv "$f.build-aside" "$f"; done; return 0; }
trap restore EXIT
for f in "${ENVS[@]}"; do [ -f "$f" ] && mv "$f" "$f.build-aside"; done
env -u VITE_LEMMA_API_URL -u VITE_LEMMA_AUTH_URL -u VITE_LEMMA_POD_ID \
    -u VITE_LEMMA_APP_NAME -u VITE_LEMMA_APP_BASE_PATH \
    npm run build

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R dist/. "$OUT"/

# A pod id or a local address in the shipped bundle would be published: fail loudly.
if grep -rqE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|localhost:5180' "$OUT"; then
  echo "refusing: build output contains a uuid or a local address" >&2
  rm -rf "$OUT"
  exit 1
fi
echo "wrote $OUT"
