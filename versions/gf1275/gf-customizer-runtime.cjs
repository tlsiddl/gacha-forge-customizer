'use strict';
// Gacha Forge 1.27.5 only. All changes are in memory and fail closed.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { registerHooks } = require('node:module');
const { fileURLToPath } = require('node:url');
const TARGET = /[\\/]capability-runtime-snapshots[\\/]gacha-forge-1\.27\.5-[^\\/]+[\\/]server\.mjs$/;
const RECIPE = process.env.GF_CUSTOMIZER_1275_EDITS_PATH || '/app/gf-customizer-1275-edits.json';
const ORIGINAL = '6e99135da7e14959257860002a4478b2414cb245ebb35af5d77636120d2b23fa';
// The second allowed hash is the exact original with the Korean speaker fix applied.
const ACCEPTED = new Set([ORIGINAL, '8f2765159dd6d896857b27659a41d2830dac2ae3196ddf6eef69fb3494051944']);
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
function validate(recipe) {
  if (!recipe || recipe.originalSha256 !== ORIGINAL || !Array.isArray(recipe.edits) || recipe.edits.length !== 14) throw Error('invalid edit recipe');
  for (const e of recipe.edits) if (!e || typeof e.old !== 'string' || !e.old || typeof e.new !== 'string') throw Error('invalid edit');
  return recipe;
}
function applyEdits(source, recipe) {
  validate(recipe);
  if (!ACCEPTED.has(hash(source))) return { ok: false, error: 'source hash mismatch', source };
  let next = source;
  for (let i = 0; i < recipe.edits.length; i++) {
    const e = recipe.edits[i];
    if (next.split(e.old).length !== 2) return { ok: false, error: 'anchor mismatch', index: i + 1, source };
    next = next.replace(e.old, () => e.new);
  }
  return { ok: true, source: next };
}
module.exports = { applyEdits, validate, TARGET };
if (process.env.GF_CUSTOMIZER_1275_TEST !== '1') {
  if (typeof registerHooks !== 'function') process.stderr.write('[gf-customizer-1275] module hooks unavailable; inactive\n');
  else {
    let recipe;
    try { recipe = validate(JSON.parse(fs.readFileSync(RECIPE, 'utf8'))); }
    catch (e) { process.stderr.write('[gf-customizer-1275] recipe unavailable; inactive: ' + e.message + '\n'); }
    if (recipe) registerHooks({ load(url, context, nextLoad) {
      if (!url.startsWith('file:')) return nextLoad(url, context);
      let file;
      try { file = fileURLToPath(url); } catch { return nextLoad(url, context); }
      if (!TARGET.test(file)) return nextLoad(url, context);
      const result = nextLoad(url, context);
      const source = result.source == null ? fs.readFileSync(file, 'utf8') : Buffer.from(result.source).toString('utf8');
      const patched = applyEdits(source, recipe);
      if (!patched.ok) {
        process.stderr.write('[gf-customizer-1275] ' + patched.error + '; inactive\n');
        return result;
      }
      process.stderr.write('[gf-customizer-1275] ' + recipe.edits.length + ' edits applied in memory\n');
      return { ...result, source: patched.source, shortCircuit: true };
    }});
  }
}
