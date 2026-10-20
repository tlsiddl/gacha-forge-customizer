#!/usr/bin/env bash
# Read-only deployment risk audit. Never modifies active files, configuration or services.
set -euo pipefail
cd "${1:-$HOME/gf-customizer-preview}"
C="${GF_TEST_CONTAINER:-marinara-engine-marinara-1}"
LIVE="/app/data/capability-packages/versions/gacha-forge/1.8.12/server.mjs"
echo "=== Gacha Forge 1.8.12 — read-only deployment audit ==="
test -s server-original.mjs && test -s server-test.mjs && test -s extension.js && test -s manifest.json
printf 'Local original SHA256: '; sha256sum server-original.mjs | cut -d' ' -f1
printf 'Local patched  SHA256: '; sha256sum server-test.mjs | cut -d' ' -f1
echo '=== Running container files (fingerprints only) ==='
docker exec "$C" sh -c '
set -eu
p=/app/data/capability-packages/versions/gacha-forge/1.8.12
for f in server.mjs client.js agents.json manifest.json; do
  if [ -f "$p/$f" ]; then
    printf "%s " "$f"; sha256sum "$p/$f" | cut -d" " -f1
  else
    echo "MISSING: $f"
  fi
done
echo "Data mount writable? (metadata only)"
[ -w /app/data ] && echo yes || echo no
'
echo '=== Compare active server vs test baseline ==='
a="$(sha256sum server-original.mjs | cut -d' ' -f1)"
b="$(docker exec "$C" sha256sum "$LIVE" | cut -d' ' -f1)"
if [ "$a" != "$b" ]; then
 echo 'STOP: active server differs from the supplied baseline; do not deploy.'
 exit 4
fi
echo 'MATCH: live server matches baseline'
echo '=== Docker service mount metadata (no environment secrets) ==='
docker inspect "$C" --format '{{range .Mounts}}{{println .Destination .Type}}{{end}}'
echo '=== Original code remains untouched ==='
