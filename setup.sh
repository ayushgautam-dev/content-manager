#!/usr/bin/env bash
# Set a fresh pod up as Content Manager. One command, about two minutes.
#
#   LEMMA_POD_ID=<pod> ./setup.sh
#
# It reads nobody's website and fetches nothing. Setup for a person starts when they
# open Studio and answer its five questions; the pod then reads their website and
# sets up their sources, as them.
set -euo pipefail
cd "$(dirname "$0")"
: "${LEMMA_POD_ID:?set LEMMA_POD_ID to the pod to set up}"
export LEMMA_POD_ID

# 1. Everything, in one import.
#
#    --with-files is not optional: the playbooks, the default brand, the slide
#    renderer, the website reader and the guide for Lemma's assistant all ship as
#    pod files. Without them every agent arrives with nothing to read.
#
#    --set-pod-meta names the pod "Content Manager". If the organization already has
#    a pod by that name it fails in seconds with nothing created, and the fallback
#    is the same import without the rename.
#
#    The app slug is unique across the whole server; use the pod id's random tail.
TAIL="$(printf '%s' "${LEMMA_POD_ID//-/}" | tail -c 12)"
VARS=(--var "studio_slug=content-studio-$TAIL")
LOG="$(mktemp)"
echo "setting up: about two minutes"
if ! lemma pods import . --set-pod-meta --with-files "${VARS[@]}" >"$LOG" 2>&1; then
  if grep -q 'POD_CONFLICT' "$LOG"; then
    echo "note: could not name this pod 'Content Manager' (another pod has that name); importing without the rename." >&2
    if ! lemma pods import . --with-files "${VARS[@]}" >"$LOG" 2>&1; then
      echo "the import failed. Full output:" >&2; cat "$LOG" >&2; exit 1
    fi
  else
    echo "the import failed. Full output:" >&2; cat "$LOG" >&2; exit 1
  fi
fi

# 2. The importer applies grants last. If anything fails in between, workloads can
#    arrive with no grants at all. Read them back and restore any that are missing.
for kind in agents functions; do
  for dir in "$kind"/*/; do
    [ -d "$dir" ] || continue
    name="$(basename "$dir")"
    have="$(lemma "$kind" permissions get "$name" --output json 2>/dev/null \
      | python3 -c 'import json,sys
try: print(len(json.load(sys.stdin).get("grants") or []))
except Exception: print(-1)' 2>/dev/null || echo -1)"
    want="$(python3 -c 'import json,sys
print(len((json.load(open(sys.argv[1])).get("permissions") or {}).get("grants") or []))' "$dir/$name.json" 2>/dev/null || echo 0)"
    if [ "$have" = "0" ] && [ "$want" != "0" ]; then
      echo "note: $name imported with no grants; restoring them from the bundle" >&2
      lemma "$kind" permissions replace "$name" --from-bundle "$dir" >/dev/null 2>&1 || true
    fi
  done
done

URL="$(lemma apps get studio --output json 2>/dev/null | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("url") or "")
except Exception: print("")' || true)"

cat <<NOTE

Content Manager is set up.

For the agent that ran this: tell the person, in a sentence or two, to open
Studio${URL:+ at $URL} and answer its five questions (their website, their LinkedIn
profile, what they write about, what they want brought to them each day, anything
else). Setup then takes about ten minutes and they can watch it. Do not answer the
questions for them, do not open the app yourself (it needs their sign-in), and never
ask for an API key: the optional voice step uses keys the person adds in Lemma
themselves, following /guide/voice-setup.md. The daily schedules are imported
switched off; switch them on only when the person asks.
NOTE
