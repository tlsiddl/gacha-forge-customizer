// Seed worlds through the REAL /run handler, then add unit cards and a wallet the way the game stores them.
import { call } from "./host.mjs";
const PKG = "gacha-forge";
const now = () => new Date().toISOString();

const opts_std = (units) => units.length > 0;
export async function seedWorld(routes, store, { name, glimmer = 2000, units = [], roster = {} }) {
  const r = await call(routes, "POST", "/run", { scenario: "테스트 세계", connectionId: "conn-1", name, protagonist: { name: "주인공" }, storyNow: false });
  if (!r.json || !r.json.ok) throw new Error("run create failed: " + JSON.stringify(r.json));
  const runId = r.json.run.runId;
  for (const u of units) {
    await store.create({ id: `${runId}:unit:${u.key}`, packageId: PKG, kind: "unit", name: u.name, description: "", data: { kind: u.kind || "character", name: u.name, rarity: u.rarity, portrait: u.portrait || "", isProtagonist: !!u.isProtagonist, affinity: "Fire", role: "Mage" }, createdAt: now(), updatedAt: now() });
  }
  if (opts_std(units)) await store.create({ id: `${runId}:banner:standard`, packageId: PKG, kind: "banner", name: "Standard", description: "", data: { kind: "character", title: "Standard Banner", mode: "fresh", week: null, charIds: units.filter((u) => (u.kind || "character") === "character" && u.std !== false).map((u) => `${runId}:unit:${u.key}`), weaponIds: units.filter((u) => u.kind === "weapon").map((u) => `${runId}:unit:${u.key}`), weaponFourIds: [] }, createdAt: now(), updatedAt: now() }).catch(() => {});
  const sessionId = `${runId}:session`;
  const cur = await store.getById(PKG, sessionId);
  const data = cur ? cur.data : { progress: {} };
  data.wallet = { ...(data.wallet || {}), glimmer };
  data.roster = { ...(data.roster || {}) };
  for (const [key, v] of Object.entries(roster)) data.roster[`${runId}:unit:${key}`] = v;
  if (cur) { const ok = await store.update({ id: sessionId, packageId: PKG, expectedRevision: cur.revision, name: "session", description: "", data, updatedAt: now() }); if (!ok) throw new Error("seed update"); }
  else await store.create({ id: sessionId, packageId: PKG, kind: "session", name: "session", description: "", data, createdAt: now(), updatedAt: now() });
  return runId;
}
export const sampleUnits = [
  { key: "c1", name: "아린", rarity: 5 }, { key: "c2", name: "채원", rarity: 5 }, { key: "c3", name: "유나", rarity: 5 },
  { key: "c4", name: "보라", rarity: 4 }, { key: "c5", name: "하율", rarity: 4 }, { key: "c6", name: "서진", rarity: 4 },
  { key: "c7", name: "민서", rarity: 4 }, { key: "c8", name: "도윤", rarity: 4 }, { key: "w1", name: "검", rarity: 5, kind: "weapon" },
  { key: "p3", name: "삼성", rarity: 3 },
];
