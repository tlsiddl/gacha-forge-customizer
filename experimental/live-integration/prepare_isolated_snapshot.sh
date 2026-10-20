#!/usr/bin/env bash
# Offline snapshot only. No Docker restart, modifications to live package, or test runtime launch.
set -euo pipefail
cd "${1:-$HOME/gf-customizer-preview}"
C="${GF_TEST_CONTAINER:-marinara-engine-marinara-1}"
LIVE="/app/data/capability-packages/versions/gacha-forge/1.8.12"
BACKUP_ROOT="${GF_SNAPSHOT_ROOT:-$HOME/gf-customizer-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DIR="$BACKUP_ROOT/$STAMP"
mkdir -p "$DIR"
chmod 700 "$DIR"
trap 'echo "ERROR: snapshot interrupted; partial directory: $DIR" >&2' ERR
bash predeploy_audit.sh
docker cp "$C:$LIVE/." "$DIR/original-package"
cp -p server-original.mjs server-test.mjs patch.py extension.js manifest.json "$DIR/"
for p in gacha-cg-runtime.cjs gacha-ko-runtime.cjs me-speedup.cjs novelai-gacha-delay.cjs; do
 if docker exec "$C" test -f "/app/$p"; then
   docker cp "$C:/app/$p" "$DIR/$p"
 fi
done
find "$DIR" -type f -print0 | sort -z | xargs -0 sha256sum > "$DIR.sha256"
chmod 600 "$DIR.sha256"
EXPECTED="$(sha256sum server-original.mjs | cut -d' ' -f1)"
ACTUAL="$(sha256sum "$DIR/original-package/server.mjs" | cut -d' ' -f1)"
test "$EXPECTED" = "$ACTUAL" || { echo 'Snapshot baseline mismatch; STOP' >&2; exit 4; }
echo "Snapshot saved: $DIR"
echo "Snapshot manifest: $DIR.sha256"
echo "Restore strategy: original files preserved under original-package; no restore applied."
echo "IMPORTANT: This is a PACKAGE snapshot, not a complete /app/data database backup."
