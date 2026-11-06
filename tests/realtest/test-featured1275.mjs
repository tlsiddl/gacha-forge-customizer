import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createStore, activateServer, call } from './host.mjs';
import { seedWorld, sampleUnits } from './seed.mjs';

const serverFile = process.argv[2];
process.env.GF_CUSTOMIZER_CONFIG_FILE = '/tmp/gf1275-customizer-test.json';
process.env.GF_FEATURED_CONFIG_FILE = '/tmp/gf1275-featured-test.json';
for (const f of [process.env.GF_CUSTOMIZER_CONFIG_FILE, process.env.GF_FEATURED_CONFIG_FILE]) {
  try { fs.unlinkSync(f); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
const store = createStore();
const { routes } = await activateServer(serverFile, store);
const runId = await seedWorld(routes, store, { name: '격리 월드', units: sampleUnits });
const post = (route, data) => call(routes, 'POST', route, data).then(r => r.json);
const get = () => post('/gf-featured/settings/get', { runId });
assert.equal((await get()).settings.featuredFive, 1);
assert.equal((await post('/gf-featured/settings', { runId, featuredFive: 4, featuredFour: 1 })).error, 'invalid-settings');
assert.equal((await post('/gf-featured/settings', { runId, featuredFive: 2, featuredFour: 4, exchange: false })).ok, true);
assert.deepEqual((await get()).settings, { featuredFive: 2, featuredFour: 4, exchange: false });
assert.equal((await post('/gf-featured/settings/get', { runId: 'nonexistent' })).error, 'bad-request');

const source = fs.readFileSync(serverFile, 'utf8');
const promptA = source.match(/"Generate EXACTLY 1 five-star[^"]+"/);
const promptC = source.match(/"PLUS the 5[^"]+generic 4[^"]+weapon\."/);
assert.ok(promptA && promptC);
const middle = '{<the rarity-4 character, same shape>}]';
assert.ok(source.includes(middle));
const from = source.indexOf('function gfXPrompt(');
const until = source.indexOf('function gfXParseN(', from);
assert.ok(from >= 0 && until > from);
const fn = vm.runInNewContext('(' + source.slice(from, until).trim() + ')');
const message = [JSON.parse(promptA[0]), JSON.parse(promptC[0]), middle].join('\n');
const result = fn([{ content: message }], '기존 인물', 2, 3);
assert.ok(result && result[0].content.includes('2 five-star'));
assert.ok(result[0].content.includes('3 four-star'));
assert.equal(fn([{ content: 'unexpected format' }], '기존 인물', 2, 3), null);
console.log('PASS: featured settings, per-world exchange, input validation and real upstream prompt compatibility');
