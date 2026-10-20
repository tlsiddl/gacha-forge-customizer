#!/bin/sh
# Read-only audit of host capability router authentication contracts. No values or secrets printed.
set -eu
CONTAINER="${1:-marinara-engine-marinara-1}"
echo "=== Capability host auth contract audit (read-only) ==="
docker exec "$CONTAINER" sh -c '
set -eu
echo "Node:"; node --version
for dir in /app/packages/shared/dist/types /app/packages/shared/dist /app/packages/server/dist; do
  if [ -d "$dir" ]; then
    echo "Type locations in $dir:"
    find "$dir" -maxdepth 2 -type f \( -name "*capability*.d.ts" -o -name "*personal-extension*.d.ts" -o -name "*route*.d.ts" \) | head -30
  fi
done
echo "=== Named type declarations referencing handler identity/auth ==="
for dir in /app/packages/shared/dist/types /app/packages/shared/dist; do
 if [ -d "$dir" ]; then
  find "$dir" -maxdepth 3 -type f -name "*.d.ts" -print0 | xargs -0 -r grep -Eih "^ *(export )?(declare )?(interface|type) +[A-Za-z0-9_]*(Auth|Principal|RequestContext|RouteContext|Identity|Actor|Session)[A-Za-z0-9_]*" | sort -u | head -50 || true
 fi
done
echo "=== End of type-name-only audit ==="
'
