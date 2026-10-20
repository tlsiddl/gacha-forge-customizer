// Security / integrity tests for the customizer's exchange + catalog routes, run against the REAL
// Gacha Forge 1.8.12 server module (patched by patch.py) inside a Marinara-like in-memory host.
import assert from "node:assert/strict";
import { createStore, activateServer, call } from "./host.mjs";
import { seedWorld, sampleUnits } from "./seed.mjs";
const PKG = "gacha-forge";
const SERVER = process.argv[2] || "server-patched.mjs";
process.env.GF_CUSTOMIZER_CONFIG_FILE = new URL("./settings-test.json", import.meta.url).pathname;
const results = [];
const t = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name + " — " + (e && e.message)]); } };
const now = () => new Date().toISOString();

async function world(opts = {}) {
  const store = createStore();
  const { routes } = await activateServer(SERVER, store);
  const runId = await seedWorld(routes, store, { name: "월드 A", glimmer: opts.glimmer ?? 2000, units: sampleUnits.concat([{ key: "c9", name: "미래", rarity: 5 }, { key: "c10", name: "현재픽업", rarity: 5 }]), roster: opts.roster || {} });
  // standard pool: c1..c8 ; c10 = a rate-up unit (featured docs for seq 1..3) ; c9 = made for a future banner
  await store.remove(PKG, `${runId}:banner:standard`, 1);
  await store.create({ id: `${runId}:banner:standard`, packageId: PKG, kind: "banner", name: "std", description: "", data: { kind: "character", charIds: ["c1", "c2", "c4", "c5", "c6", "c7", "c8", "c3"].map((k) => `${runId}:unit:${k}`) }, createdAt: now(), updatedAt: now() });
  for (const seq of [1, 2, 3]) await store.create({ id: `${runId}:banner:char:f${seq}`, packageId: PKG, kind: "banner", name: "f", description: "", data: { kind: "character", fiveId: `${runId}:unit:c10` }, createdAt: now(), updatedAt: now() });
  const session = async () => (await store.getById(PKG, `${runId}:session`)).data;
  const rev = async () => (await store.getById(PKG, `${runId}:session`)).revision;
  const buy = (characterKey, requestId, extra = {}) => call(routes, "POST", "/gf-customizer/exchange", { runId, characterId: characterKey.includes(":") ? characterKey : `${runId}:unit:${characterKey}`, requestId, ...extra }).then((r) => r.json);
  const catalog = (id = runId) => call(routes, "POST", "/gf-customizer/exchange/catalog", { runId: id }).then((r) => r.json);
  return { store, routes, runId, session, rev, buy, catalog };
}
const rid = (n) => "req_" + String(n).padStart(16, "0");

(async () => {
  delete process.env.GF_CUSTOMIZER_ENABLE_EXCHANGE;
  await t("목록: 출시된 4·5성 캐릭터만 (무기·3성·주인공·미래 픽업 제외), 월드 이름 포함, 기본은 구매 비활성", async () => {
    const w = await world();
    const c = await w.catalog();
    assert.equal(c.ok, true);
    const names = c.characters.map((x) => x.name).sort();
    assert.deepEqual(names, ["도윤", "민서", "보라", "서진", "아린", "유나", "채원", "하율", "현재픽업"].sort());
    assert.equal(c.run.name, "월드 A");
    assert.equal(c.exchangeEnabled, false);
    assert.equal(c.glimmer, 2000);
  });
  await t("목록: 없는 월드 ID는 bad-request", async () => {
    const w = await world();
    assert.equal((await w.catalog("run-nope")).error, "bad-request");
  });
  await t("구매 스위치가 꺼져 있으면 거부하고 저장하지 않음", async () => {
    const w = await world(); const before = await w.rev();
    assert.equal((await w.buy("c4", rid(1))).error, "exchange-disabled");
    assert.equal(await w.rev(), before);
  });
  process.env.GF_CUSTOMIZER_ENABLE_EXCHANGE = "1";
  await t("미보유 4성 구매: Glimmer 100 차감, 게임과 같은 형태로 지급, 다음 가격 120", async () => {
    const w = await world();
    const r = await w.buy("c4", rid(1));
    assert.equal(r.ok, true); assert.equal(r.price, 100); assert.equal(r.nextPrice, 120); assert.equal(r.isNew, true);
    const s = await w.session();
    assert.equal(s.wallet.glimmer, 1900);
    assert.deepEqual(s.roster[`${w.runId}:unit:c4`], { level: 1, bondFights: 0 });
    assert.equal(r.wallet.glimmer, 1900);
    const c = await w.catalog(); assert.equal(c.characters.find((x) => x.name === "보라").price, 120);
  });
  await t("보유 5성 구매: 패싯 +1, 300 차감", async () => {
    const w = await world({ roster: { c1: { level: 10, bondFights: 3, facet: 2 } } });
    const r = await w.buy("c1", rid(2));
    assert.equal(r.ok, true); assert.equal(r.facet.facet, 3);
    const s = await w.session();
    assert.equal(s.roster[`${w.runId}:unit:c1`].facet, 3); assert.equal(s.roster[`${w.runId}:unit:c1`].level, 10);
    assert.equal(s.wallet.glimmer, 1700);
  });
  await t("최대 패싯·잔액 부족은 거부하고 저장하지 않음", async () => {
    const w = await world({ glimmer: 50, roster: { c2: { level: 1, bondFights: 0, facet: 6 } } });
    const snap = async () => { const x = await w.session(); return JSON.stringify({ g: x.wallet.glimmer, f: x.roster[`${w.runId}:unit:c2`].facet, c4: x.roster[`${w.runId}:unit:c4`] || null }); };
    const before = await snap();
    assert.equal((await w.buy("c2", rid(3))).error, "max-facet");
    const r = await w.buy("c4", rid(4)); assert.equal(r.error, "insufficient-glimmer"); assert.equal(r.price, 100);
    assert.equal(await snap(), before);
    assert.equal((await w.session()).gfCustomizer, undefined, "nothing of ours written");
  });
  await t("같은 요청 ID 재전송: 추가 차감 없음 · 다른 캐릭터에 재사용 거부", async () => {
    const w = await world();
    assert.equal((await w.buy("c4", rid(5))).ok, true);
    const again = await w.buy("c4", rid(5));
    assert.equal(again.replayed, true); assert.equal(again.ok, true);
    assert.equal((await w.session()).wallet.glimmer, 1900);
    assert.equal((await w.buy("c5", rid(5))).error, "request-id-reused");
  });
  await t("다른 월드 캐릭터·무기·주인공·미출시(미래 픽업) 캐릭터 거부", async () => {
    const w = await world();
    const before = await w.rev();
    assert.equal((await w.buy("other-run:unit:c4", rid(6))).error, "cross-run-character");
    assert.equal((await w.buy("w1", rid(7))).error, "not-for-sale");
    assert.equal((await w.buy("p3", rid(8))).error, "not-for-sale");
    assert.equal((await w.buy("protagonist", rid(9))).error, "not-for-sale");
    assert.equal((await w.buy("c9", rid(10))).error, "not-released");
    assert.ok((await w.rev()) - before <= 1, "only the game's own account stamp may write");
  });
  await t("잘못된 요청 형식 거부 (요청 ID 형식, 빈 값, 없는 월드)", async () => {
    const w = await world();
    assert.equal((await w.buy("c4", "short")).error, "bad-request");
    assert.equal((await w.buy("c4", "bad id with spaces!!")).error, "bad-request");
    assert.equal((await call(w.routes, "POST", "/gf-customizer/exchange", { runId: "nope", characterId: "nope:unit:c4", requestId: rid(11) })).json.error, "bad-request");
  });
  await t("동시 구매 20건: 이중 차감·유실 없음 (성공 건수 × 가격 = 차감액)", async () => {
    const w = await world({ glimmer: 100000 });
    const keyOf = (i) => ["c4", "c5", "c6", "c7"][i % 4]; // ≤ 5 buys each: new + 4 facets, below the 6-facet cap
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => w.buy(keyOf(i), rid(100 + i))));
    const ok = rs.filter((r) => r.ok), conflicts = rs.filter((r) => r.error === "write-conflict");
    assert.equal(ok.length + conflicts.length, 20, JSON.stringify(rs.filter((r) => !r.ok && r.error !== "write-conflict")));
    assert.ok(ok.length >= 1);
    const s = await w.session();
    const spent = ok.reduce((a, r) => a + r.price, 0);
    assert.equal(s.wallet.glimmer, 100000 - spent);
    const counts = s.gfCustomizer.exchangeCounts;
    assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), ok.length);
    // retry the conflicted ones with the SAME request IDs, sequentially: all succeed exactly once
    for (const [i, r] of rs.entries()) if (r.error === "write-conflict") assert.equal((await w.buy(keyOf(i), rid(100 + i))).ok, true);
    for (const [i] of rs.entries()) assert.equal((await w.buy(keyOf(i), rid(100 + i))).replayed, true);
    const s2 = await w.session();
    const total = Object.values(s2.gfCustomizer.exchangeReceipts).reduce((a, r) => a + r.price, 0);
    assert.equal(s2.wallet.glimmer, 100000 - total);
    assert.equal(Object.keys(s2.gfCustomizer.exchangeReceipts).length, 20);
  });
  await t("게임 상점 구매와 동시에 실행돼도 지갑 합계가 맞음", async () => {
    const w = await world({ glimmer: 100000 });
    const shopItem = "vigor-s";
    const rs = await Promise.all([
      ...Array.from({ length: 6 }, (_, i) => w.buy("c6", rid(300 + i))),
      ...Array.from({ length: 6 }, () => call(w.routes, "POST", "/shop/buy", { runId: w.runId, itemId: shopItem }).then((r) => r.json)),
    ]);
    const s = await w.session();
    const spentEx = rs.slice(0, 6).filter((r) => r.ok).reduce((a, r) => a + r.price, 0);
    const spentShop = rs.slice(6).filter((r) => r.ok).reduce((a, r) => a + (r.spent || 0), 0);
    assert.equal(s.wallet.glimmer, 100000 - spentEx - spentShop);
  });
  await t("영수증은 최근 200건만 보관 (오래된 것부터 정리)", async () => {
    const w = await world({ glimmer: 100000 });
    const doc = await w.store.getById(PKG, `${w.runId}:session`);
    const receipts = {};
    for (let i = 0; i < 199; i++) receipts[rid(5000 + i)] = { characterId: `${w.runId}:unit:c8`, price: 1, at: 1000 + i };
    await w.store.update({ id: doc.id, packageId: PKG, expectedRevision: doc.revision, name: doc.name, description: "", data: { ...doc.data, gfCustomizer: { exchangeReceipts: receipts } }, updatedAt: now() });
    assert.equal((await w.buy("c4", rid(9001))).ok, true);
    assert.equal((await w.buy("c5", rid(9002))).ok, true);
    const kept = (await w.session()).gfCustomizer.exchangeReceipts;
    assert.equal(Object.keys(kept).length, 200);
    assert.ok(!kept[rid(5000)] && kept[rid(5001)] && kept[rid(9001)] && kept[rid(9002)]);
  });
  await t("원래 게임 기능 유지: /state, 설정 API, 기존 상점 구매 정상", async () => {
    const w = await world();
    const st = (await call(w.routes, "GET", "/state")).json;
    assert.equal(st.ok, true); assert.equal(st.activeRunId, w.runId);
    const g = (await call(w.routes, "GET", "/gf-customizer/settings")).json; assert.equal(g.ok, true);
    const bad = (await call(w.routes, "POST", "/gf-customizer/settings", { settings: { characterPity: 0 } })).json; assert.equal(bad.ok, false);
  });
  for (const [s, n] of results) console.log(s + "  " + n);
  const failed = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
})();
