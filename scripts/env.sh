# Pins every lemma call to one pod. Usage: source scripts/env.sh; cm <args>
# Reads scripts/local.env (not committed) or the environment:
#   CM_SERVER (default cloud), CM_ORG_ID, CM_POD_ID
_here="$(cd "$(dirname "${BASH_SOURCE[0]:-${(%):-%x}}")" && pwd)"
[ -f "$_here/local.env" ] && set -a && . "$_here/local.env" && set +a
export CM_SERVER="${CM_SERVER:-cloud}"
: "${CM_POD_ID:?set CM_POD_ID and CM_ORG_ID in scripts/local.env or the environment}"; : "${CM_ORG_ID:?set CM_ORG_ID}"
cm() { lemma --server "$CM_SERVER" --org "$CM_ORG_ID" --pod "$CM_POD_ID" "$@"; }
cmorg() { lemma --server "$CM_SERVER" --org "$CM_ORG_ID" "$@"; }
