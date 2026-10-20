// End-to-end in Chromium: REAL Gacha Forge 1.8.12 client.js + REAL server.mjs (patched) + Quest extension + Customizer.
// Usage: node realgame.mjs <customizer.js> <quest.js> [outPrefix] [--enable]
import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createStore, activateServer, serve, PKG_DIR } from "./host.mjs";
import { seedWorld, sampleUnits } from "./seed.mjs";
const [CUST_PATH, QUEST_PATH, OUT = "real"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ENABLE = process.argv.includes("--enable");
process.env.GF_CUSTOMIZER_CONFIG_FILE = new URL("./settings-real.json", import.meta.url).pathname;
try { fs.unlinkSync(process.env.GF_CUSTOMIZER_CONFIG_FILE); } catch {}
if (ENABLE) process.env.GF_CUSTOMIZER_ENABLE_EXCHANGE = "1"; else delete process.env.GF_CUSTOMIZER_ENABLE_EXCHANGE;

// portraits: simple generated SVG busts in different colours
const svg = (hue, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,42%)"/><stop offset="1" stop-color="hsl(${hue + 30},45%,16%)"/></linearGradient></defs><rect width="200" height="300" fill="url(#g)"/><circle cx="100" cy="112" r="46" fill="hsl(${hue},30%,82%)"/><path d="M28 300c6-70 38-110 72-110s66 40 72 110z" fill="hsl(${hue},35%,70%)"/><text x="100" y="285" font-size="22" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`;
const units = sampleUnits.map((u, i) => (u.kind === "weapon" || u.rarity < 4 ? u : { ...u, portrait: `/img/${u.key}.svg` }));
const files = {};
units.forEach((u, i) => { if (u.portrait) files[`/img/${u.key}.svg`] = ["image/svg+xml", svg((i * 47) % 360, u.key)]; });

const store = createStore();
const { routes } = await activateServer(process.env.GF_SERVER || "server-patched.mjs", store);
const runA = await seedWorld(routes, store, { name: "서울 각성자 월드", glimmer: 2400, units, roster: { c1: { level: 20, bondFights: 4, facet: 1 }, c4: { level: 12, bondFights: 0, facet: 6 }, c6: { level: 5, bondFights: 0 } } });
const runB = await seedWorld(routes, store, { name: "두 번째 월드", glimmer: 50, units: units.slice(0, 3) });
// make A the active world again (B was created last)
const idx = await store.getById("gacha-forge", "index"); await store.update({ ...idx, packageId: "gacha-forge", expectedRevision: idx.revision, data: { ...idx.data, activeRunId: runA } });

const CLIENT = fs.readFileSync(PKG_DIR + "/client.js", "utf8");
const html = `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}marinara-capability-gacha-forge{position:fixed;inset:0;display:block}</style></head><body><marinara-capability-gacha-forge></marinara-capability-gacha-forge>
<script src="/quest.js"></script><script src="/customizer.js"></script><script src="/client.js"></script></body></html>`;
Object.assign(files, {
  "/": ["text/html; charset=utf-8", html],
  "/client.js": ["text/javascript; charset=utf-8", CLIENT],
  "/quest.js": ["text/javascript; charset=utf-8", () => fs.readFileSync(QUEST_PATH, "utf8")],
  "/customizer.js": ["text/javascript; charset=utf-8", () => fs.readFileSync(CUST_PATH, "utf8")],
});
const api = [];
const server = await serve({ routes, files, onApi: (m, p, b) => api.push({ m, p, runId: b && b.runId }) });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const results = [];
const t = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name + " — " + (e && e.message)]); } };

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: viewport.width < 1000 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/");
  await page.waitForTimeout(1200);
  const press = async (label) => {
    const ok = await page.evaluate((label) => {
      const r = document.querySelector("marinara-capability-gacha-forge").shadowRoot;
      const b = [...r.querySelectorAll("button")].filter((x) => x.getClientRects().length).reverse()
        .find((x) => x.textContent.trim().toLowerCase().startsWith(label.toLowerCase()) || x.getAttribute("aria-label") === label);
      if (b) { b.click(); return true; } return false;
    }, label);
    await page.waitForTimeout(700);
    return ok;
  };
  const q = (sel) => page.evaluate((sel) => { const r = document.querySelector("marinara-capability-gacha-forge").shadowRoot; return [...r.querySelectorAll(sel)].map((e) => ({ text: e.textContent.trim(), cls: e.className, visible: e.getClientRects().length > 0, sel: e.getAttribute("aria-selected") })); }, sel);
  return { ctx, page, errors, press, q };
}
const catalogs = () => api.filter((x) => x.p === "/gf-customizer/exchange/catalog");

for (const [vpName, viewport] of [["pc", { width: 1280, height: 720 }], ["phone", { width: 844, height: 390 }]]) {
  const before = catalogs().length;
  const g = await open(viewport);
  await g.press("Claim"); await g.press("Begin"); await g.press("Shop"); await g.press("Close");
  await t(`[${vpName}] 상점 레일에 'Glimmer 교환' 탭 1개, 게임 탭과 같은 모양(sh-cat)`, async () => {
    const tabs = await g.q("[data-gf-customizer-tab]");
    assert.equal(tabs.length, 1); assert.match(tabs[0].cls, /sh-cat/); assert.ok(tabs[0].visible);
  });
  await g.page.screenshot({ path: `${OUT}-${vpName}-shop-native.png` });
  await g.page.evaluate(() => document.querySelector("marinara-capability-gacha-forge").shadowRoot.querySelector("[data-gf-customizer-tab]").click());
  await g.page.waitForTimeout(900);
  await g.page.screenshot({ path: `${OUT}-${vpName}-shop-exchange.png` });
  await t(`[${vpName}] 탭을 누르면 실제 게임 통신에서 인식한 월드로 목록 1회 자동 조회`, async () => {
    const mine = catalogs().slice(before);
    assert.equal(mine.length, 1, JSON.stringify(mine));
    assert.equal(mine[0].runId, runA);
  });
  await t(`[${vpName}] 교환 화면: 선택 표시 이동, 게임 목록 숨김, 카드 렌더`, async () => {
    const cats = await g.q(".sh-cat");
    assert.deepEqual(cats.filter((c) => /\bon\b/.test(c.cls)).map((c) => c.text.slice(0, 12)), ["Glimmer 교환8명"].map((s) => s.slice(0, 12)));
    const cards = await g.q(".gfc-shop .sh-card");
    assert.equal(cards.length, 8);
    const native = await g.q(".sh-pane > .item-board");
    assert.ok(native.every((n) => !n.visible));

  });
  await t(`[${vpName}] 가로 화면에서 가로 스크롤 없음, 스크롤은 카드 영역 하나`, async () => {
    const m = await g.page.evaluate(() => {
      const r = document.querySelector("marinara-capability-gacha-forge").shadowRoot;
      const grid = r.querySelector(".gfc-shop .sh-grid");
      const scrollers = [...r.querySelectorAll(".gfc-shop *")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1);
      return { docOverflow: document.documentElement.scrollWidth > innerWidth, gridX: grid.scrollWidth > grid.clientWidth + 1, scrollers: scrollers.map((e) => e.className) };
    });
    assert.equal(m.docOverflow, false); assert.equal(m.gridX, false);
    assert.ok(m.scrollers.length <= 1 && m.scrollers.every((c) => /sh-grid/.test(c)), JSON.stringify(m.scrollers));
  });
  if (vpName === "pc") {
    await t("[pc] 필터(★5)·게임 원래 탭 복귀", async () => {
      await g.page.evaluate(() => [...document.querySelector("marinara-capability-gacha-forge").shadowRoot.querySelectorAll(".gfc-seg button")][1].click());
      await g.page.waitForTimeout(200);
      assert.equal((await g.q(".gfc-shop .sh-card")).length, 3);
      await g.press("Key Items");
      await g.page.waitForTimeout(400);
      assert.equal((await g.q(".gfc-shop")).length, 0);
      assert.ok((await g.q(".sh-pane > .item-board")).some((n) => n.visible));
      assert.equal((await g.q(".head-id h2"))[0].text.toLowerCase(), "shop");
    });
    // settings
    await g.press("◀ Home"); await g.press("Game settings");
    await g.page.waitForTimeout(500);
    await g.page.evaluate(() => document.querySelector("marinara-capability-gacha-forge").shadowRoot.querySelector("[data-gf-customizer-tab]")?.click());
    await g.page.waitForTimeout(800);
    await g.page.screenshot({ path: `${OUT}-pc-settings.png` });
    await t("[pc] 설정 레일에 '커스터마이저'(st-sect), 저장 동작", async () => {
      const tabs = await g.q("[data-gf-customizer-tab]");
      assert.equal(tabs.length, 1); assert.match(tabs[0].cls, /st-sect/); assert.equal(tabs[0].sel, "true");
      await g.page.evaluate(() => { const r = document.querySelector("marinara-capability-gacha-forge").shadowRoot; const i = r.querySelector('.gfc-set input[aria-label="캐릭터 5성 천장"]'); i.value = "50"; i.dispatchEvent(new Event("input", { bubbles: true })); r.querySelector(".gfc-set .st-compress.-go").click(); });
      await g.page.waitForTimeout(500);
      const saved = JSON.parse(fs.readFileSync(process.env.GF_CUSTOMIZER_CONFIG_FILE, "utf8"));
      assert.equal(saved.characterPity, 50);
      const txt = (await g.q(".gfc-set .gfc-status"))[0].text;
      assert.match(txt, /저장했습니다/);
    });
    await g.page.screenshot({ path: `${OUT}-pc-settings-saved.png` });
  }
  if (vpName === "phone") await g.page.screenshot({ path: `${OUT}-phone-final.png` });
  await t(`[${vpName}] 페이지 오류 없음`, async () => assert.deepEqual(g.errors, []));
  await g.ctx.close();
}

await t("퀘스트 확장도 실제 게임 통신으로 같은 월드를 인식", async () => {
  const g = await open({ width: 1280, height: 720 });
  await g.page.waitForTimeout(500);
  const quest = await g.page.evaluate(() => JSON.parse(localStorage.getItem("gf-quest-v1") || "{}"));
  assert.equal(quest.worlds?.[quest.world]?.gfRunId, runA);
  await g.ctx.close();
});

if (ENABLE) {
  await t("구매 켜짐: 두 번 눌러 교환 → Glimmer 차감·카드 갱신·게임 잔액 표시 갱신", async () => {
    const g = await open({ width: 1280, height: 720 });
    await g.press("Claim"); await g.press("Begin"); await g.press("Shop"); await g.press("Close");
    await g.page.evaluate(() => document.querySelector("marinara-capability-gacha-forge").shadowRoot.querySelector("[data-gf-customizer-tab]").click());
    await g.page.waitForTimeout(800);
    const clickBuy = () => g.page.evaluate(() => { const r = document.querySelector("marinara-capability-gacha-forge").shadowRoot; const c = [...r.querySelectorAll(".gfc-shop .sh-card")].find((x) => x.querySelector(".sh-name").textContent === "보라" || x.querySelector(".sh-name").textContent === "하율"); c.querySelector(".sh-buy").click(); return c.querySelector(".sh-name").textContent; });
    const name = await clickBuy(); await g.page.waitForTimeout(200);
    await g.page.screenshot({ path: `${OUT}-pc-armed.png` });
    assert.equal(api.filter((x) => x.p === "/gf-customizer/exchange").length, 0, "first tap must not buy");
    await clickBuy(); await g.page.waitForTimeout(900);
    assert.equal(api.filter((x) => x.p === "/gf-customizer/exchange").length, 1);
    const s = (await store.getById("gacha-forge", `${runA}:session`)).data;
    assert.equal(s.wallet.glimmer, 2300);
    const bal = (await g.q(".sh-top .sh-bal b"))[0].text;
    assert.equal(bal, "2,300");
    await g.page.screenshot({ path: `${OUT}-pc-bought.png` });
    assert.match((await g.q(".gfc-shop .gfc-status"))[0].text, new RegExp(name));
    await g.ctx.close();
  });
}

await browser.close(); server.close();
for (const [s, n] of results) console.log(s + "  " + n);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
