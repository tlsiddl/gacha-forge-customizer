'use strict';
process.env.GF_CUSTOMIZER_1275_TEST = '1';
process.env.GF_FEATURED_HOOK_TEST = '1';
process.env.GACHA_KO_1275_TEST = '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('./gf-customizer-runtime.cjs');
const featured = require('./gf-featured-runtime.cjs');
const korean = require(process.argv[3]);
const server = fs.readFileSync(process.argv[2], 'utf8');
const coreRecipe = JSON.parse(fs.readFileSync(path.join(__dirname, 'gf-customizer-edits.json'), 'utf8'));
const featuredRecipe = JSON.parse(fs.readFileSync(path.join(__dirname, 'gf-featured-edits.json'), 'utf8'));
assert.equal(core.applyEdits(server + ' ', coreRecipe).ok, false);
assert.equal(featured.applyEdits(server, featuredRecipe).ok, false);
const koreanServer = korean.transformServer(server);
assert.ok(koreanServer);
for (const input of [server, koreanServer]) {
  const a = core.applyEdits(input, coreRecipe);
  assert.ok(a.ok, a.error);
  const b = featured.applyEdits(a.source, featuredRecipe);
  assert.ok(b.ok, b.error);
  assert.ok(b.source.includes('function gfxGet('));
  if (process.argv[4] && input === koreanServer) fs.writeFileSync(process.argv[4], b.source);
}
console.log('PASS: original and Korean-patched source, combined loaders, safe signature failures');
