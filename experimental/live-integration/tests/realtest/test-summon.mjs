// Real /summon on the patched 1.8.12 server: a full-facet duplicate pays the configured Glimmer (default 120/600 here),
// a not-yet-full unit gains a facet instead, and 0 falls back to the game's own payout (3/5).
// Usage: node test-summon.mjs server-patched.mjs
import fs from "node:fs";
import assert from "node:assert/strict";
import { createStore, activateServer, call } from "./host.mjs";
import { seedWorld, sampleUnits } from "./seed.mjs";
const SERVER = process.argv[2] || "server-patched.mjs";
const cfg = new URL("./settings-summon.json", import.meta.url).pathname;
async function run(settings) {
  fs.writeFileSync(cfg, JSON.stringify(settings));
  process.env.GF_CUSTOMIZER_CONFIG_FILE = cfg;
  const store = createStore();
  const { routes } = await activateServer(SERVER, store);
  const roster = {};
  for (const u of sampleUnits) if ((u.kind || "character") === "character" && u.rarity >= 4) roster[u.key] = { level: 1, bondFights: 0, facet: 6 };
  roster.c5 = { level: 1, bondFights: 0, facet: 2 };
  const runId = await seedWorld(routes, store, { name: "W", glimmer: 0, units: sampleUnits, roster });
  const doc = await store.getById("gacha-forge", `${runId}:session`);
  await store.update({ ...doc, packageId: "gacha-forge", expectedRevision: doc.revision, data: { ...doc.data, wallet: { ...doc.data.wallet, aether: 1e7 } } });
  const pay = { 3: new Set(), "4full": new Set(), "5full": new Set(), "4notfull": new Set() };
  let expected = 0;
  for (let i = 0; i < 40; i++) {
    const r = (await call(routes, "POST", "/summon", { runId, banner: "char-standard", count: 10 })).json;
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
    for (const x of r.results) {
      const g = Number(x.glimmer) || 0;
      expected += g;
      if (x.rarity === 3) pay[3].add(g);
      else if (x.facet && x.facet.gained) pay["4notfull"].add(g);
      else pay[x.rarity + "full"].add(g);
    }
  }
  const wallet = (await store.getById("gacha-forge", `${runId}:session`)).data.wallet.glimmer;
  return { pay: Object.fromEntries(Object.entries(pay).map(([k, v]) => [k, [...v]])), wallet, expected };
}
const custom = await run({ fullFacetGlimmer4: 120, fullFacetGlimmer5: 600 });
assert.deepEqual(custom.pay, { 3: [1], "4full": [120], "5full": [600], "4notfull": [0] });
assert.equal(custom.wallet, custom.expected);
const original = await run({});
assert.deepEqual(original.pay, { 3: [1], "4full": [3], "5full": [5], "4notfull": [0] });
console.log("PASS 120/600 paid on full-facet duplicates, wallet", custom.wallet, "| 0 = game default 3/5");
