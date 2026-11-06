'use strict';
// Gacha Forge 픽업 인원 추가 패치 (gf-featured-addon) — 커스터마이저 패치(gf-customizer) 위에 얹는 in-memory hook.
// 설치 파일은 건드리지 않습니다. NODE_OPTIONS에서 gf-customizer-runtime.cjs "뒤에" --require 해야 합니다
// (뒤에 등록된 훅이 앞 훅의 결과를 받아 고치므로). 커스터마이저 패치가 없으면 아무것도 바꾸지 않습니다.
const fs = require('node:fs');
const path = require('node:path');
const { registerHooks } = require('node:module');
const { fileURLToPath } = require('node:url');
const TAG = '[gf-featured]';
const TARGET = /[\\/]capability-runtime-snapshots[\\/]gacha-forge-1\.27\.5-[^\\/]+[\\/]server\.mjs$/;
const RECIPE = process.env.GF_FEATURED_EDITS_PATH || path.join(__dirname, 'gf-featured-edits.json');
const REQUIRES = ['function gfPick(', 'GF_SETTINGS', 's.get("/gf-customizer/settings",'];
const count = (h, n) => h.split(n).length - 1;
function validate(recipe) {
  if (!recipe || !Array.isArray(recipe.edits) || recipe.edits.length < 5 || recipe.edits.length > 32) throw Error('invalid edit recipe');
  for (const e of recipe.edits) if (!e || typeof e.old !== 'string' || typeof e.new !== 'string' || !e.old.length) throw Error('invalid edit entry');
  return recipe;
}
function applyEdits(source, recipe) {
  const missing = REQUIRES.filter((m) => !source.includes(m));
  if (missing.length) return { ok: false, error: 'customizer patch not applied (load gf-customizer before this hook)', source };
  if (source.includes('function gfxGet(')) return { ok: false, error: 'already applied', source };
  let next = source;
  const edits = validate(recipe).edits;
  for (let i = 0; i < edits.length; i++) {
    if (count(next, edits[i].old) !== 1) return { ok: false, error: 'signature mismatch #' + (i + 1), source };
    next = next.replace(edits[i].old, () => edits[i].new);
  }
  return { ok: true, source: next };
}
if (process.env.GF_FEATURED_HOOK_TEST !== '1') {
  if (typeof registerHooks !== 'function') process.stderr.write(TAG + ' this Node.js has no module.registerHooks (need 22.15+); disabled\n');
  else {
    let recipe = null;
    try { recipe = validate(JSON.parse(fs.readFileSync(RECIPE, 'utf8'))); }
    catch (e) { process.stderr.write(TAG + ' recipe unavailable; disabled: ' + e.message + '\n'); }
    if (recipe) {
      registerHooks({ load(url, context, nextLoad) {
        if (!url.startsWith('file:')) return nextLoad(url, context);
        let filename; try { filename = fileURLToPath(url); } catch { return nextLoad(url, context); }
        if (!TARGET.test(filename)) return nextLoad(url, context);
        const result = nextLoad(url, context);
        const source = result.source == null ? fs.readFileSync(filename, 'utf8') : Buffer.isBuffer(result.source) ? result.source.toString('utf8') : String(result.source);
        const t = applyEdits(source, recipe);
        if (!t.ok) { process.stderr.write(TAG + ' not applied: ' + t.error + '; game unchanged\n'); return result; }
        process.stderr.write(TAG + ' applied ' + recipe.edits.length + ' edits in memory (per-world featured rate-up size)\n');
        return { ...result, source: t.source, shortCircuit: true };
      } });
      process.stderr.write(TAG + ' hook registered (no package files changed)\n');
    }
  }
}
module.exports = { applyEdits, validate, TARGET };
