#!/usr/bin/env bash
# Consistent-volume-snapshot preparation (read-only access to running source).
# WARNING: online file backup is not necessarily transactionally consistent.
set -euo pipefail
C="${GF_TEST_CONTAINER:-marinara-engine-marinara-1}"
ROOT="${GF_SNAPSHOT_ROOT:-$HOME/gf-customizer-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$ROOT/data-$STAMP"
mkdir -p "$DEST"; chmod 700 "$DEST"
echo "=== Online data-volume copy (no service stop or source writes) ==="
echo "CAUTION: live writes during copying can make this snapshot inconsistent."
docker inspect "$C" --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{printf "type=%s source=%s name=%s\n" .Type .Source .Name}}{{end}}{{end}}'
# Copy via docker cp to host. Never includes server environment variables.
docker cp "$C:/app/data/." "$DEST/"
echo "=== Validate archive can enumerate and required directories exist ==="
test -d "$DEST/capability-packages"
test -f "$DEST/capability-packages/versions/gacha-forge/1.8.12/server.mjs"
sha256sum "$DEST/capability-packages/versions/gacha-forge/1.8.12/server.mjs" > "$DEST-server.sha256"
du -sh "$DEST"
echo "ONLINE SNAPSHOT SAVED: $DEST"
echo "IMPORTANT: online snapshot is not guaranteed transactionally consistent. Do NOT treat as confirmed restorable DB."
