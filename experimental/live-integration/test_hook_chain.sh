#!/usr/bin/env bash
# Isolated Node ESM load chain, with all four existing preloads and customizer hook.
# Never imports the actual Gacha Forge server or writes game data.
set -euo pipefail
cd "${1:-$HOME/marinara-migration/Marinara-Engine/gf-customizer-integration}"
CONTAINER="${GF_TEST_CONTAINER:-marinara-engine-marinara-1}"
for f in gf-customizer-runtime.cjs gf-customizer-edits.json server-original.mjs server-test.mjs; do test -s "$f" || { echo "MISSING: $f"; exit 3; }; done
TARGET='/app/data/capability-runtime-snapshots/gacha-forge-1.8.12-hook-integration-test/server.mjs'
SOURCE_SHA="$(sha256sum server-original.mjs | cut -d' ' -f1)"
test "$SOURCE_SHA" = "6bd9ec1f95f5296b65e974ea723e50e59a0335efabc97b6585c0979fb6153284" || { echo "ABORT: original hash mismatch"; exit 4; }
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
cp server-original.mjs "$TMPDIR/server.mjs"
cp gf-customizer-runtime.cjs "$TMPDIR/gf-customizer-runtime.cjs"
cp gf-customizer-edits.json "$TMPDIR/gf-customizer-edits.json"
# Use an ES module probe with the target module's URL, but intercept the load
# before evaluating the actual module. This checks hook composition only.
cat > "$TMPDIR/probe.mjs" <<'EOF'
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
const target=process.env.GF_TEST_TARGET;
const original=readFileSync(process.env.GF_TEST_BASELINE,'utf8');
const expected=readFileSync(process.env.GF_TEST_PATCHED,'utf8');
registerHooks({
  load(url,context,nextLoad){
    if(url!==pathToFileURL(target).href)return nextLoad(url,context);
    const response=nextLoad(url,context);
    const actual=Buffer.isBuffer(response.source)?response.source.toString('utf8'):String(response.source);
    // Full hook chain composition must preserve customizer marker.
    if(!actual.includes('function gfPity(')||!actual.includes('/gf-customizer/settings'))throw Error('customizer edits missing');
    if(!actual.includes('function gs('))throw Error('baseline server signature missing');
    console.log('PASS actual loader chain reached target and customizer edits survived');
    // No live Gacha Forge server execution.
    return {format:'module',shortCircuit:true,source:'export default true;'};
  }
});
await import(pathToFileURL(target).href);
EOF
# The actual chain must execute from inside the image/container paths; use an
# isolated temporary Docker container instead of changing the running service.
IMAGE_ID="$(sudo docker inspect "$CONTAINER" --format '{{.Image}}')"
DATA_DIR="$(sudo docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}')"
test -n "$DATA_DIR"
# The source dataset is bind-mounted read-only. Target test URL is not created
# on live data: the probe's synthetic path is served by a separate hook.
# Deliberately stop at preflight until synthetic interception wiring is ready.
echo "PREPARED: image=$IMAGE_ID; source volume located (path not shown)"
echo "NOT RUN: chain injection requires synthetic source hook integration; no live data touched"
