#!/usr/bin/env bash
# Read-only preflight. Never deploys, restarts, or touches active data.
set -euo pipefail
cd "${1:-$HOME/gf-customizer-preview}"
CONTAINER="${GF_TEST_CONTAINER:-marinara-engine-marinara-1}"
echo "=== Gacha Forge Customizer — offline preflight ==="
test -s server-original.mjs
test -s patch.py
test -s extension.js
test -s manifest.json
python3 -m py_compile patch.py
python3 -m json.tool manifest.json >/dev/null
docker exec -i "$CONTAINER" node --check < extension.js
python3 patch.py server-original.mjs server-test.mjs
docker exec -i "$CONTAINER" node --input-type=module --check < server-test.mjs
for t in test_rules.py test_banner_rotation.py test_banner_persistence.py test_exchange.py test_exchange_concurrency.py test_catalog.py test_storage_contract.py; do
  if [ ! -f "$t" ]; then echo "MISSING TEST: $t"; exit 3; fi
  if [ "$t" = test_storage_contract.py ]; then
    python3 "$t" server-original.mjs --container "$CONTAINER"
  else
    python3 "$t" server-test.mjs --container "$CONTAINER"
  fi
done
echo "PASS: all available offline checks; LIVE INSTALLATION NOT VERIFIED"
