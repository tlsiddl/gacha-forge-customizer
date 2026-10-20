// Browser-simulation tests for extension.js (Gacha Forge Customizer personal extension).
// Runs the extension inside jsdom against a mock Gacha Forge 1.8.12 page (shadow-root host, shop/settings rails)
// and, if a path is given, together with the Quest extension to check that the two fetch observers coexist.
//
//   npm i --no-save jsdom@24
//   node test-extension-jsdom.cjs [path/to/Gacha-Forge-Quest-Extension/extension.js]
//
// What this does NOT prove: the real game's DOM/CSS on a phone, the real server's responses, or real purchases.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const CUST = fs.readFileSync(path.join(__dirname, "extension.js"), "utf8");
const QUEST_PATH = process.argv[2];
const QUEST = QUEST_PATH ? fs.readFileSync(QUEST_PATH, "utf8") : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// jsdom caches computed styles inside shadow roots and misses later style changes, so visibility is modelled
// directly: inline display:none hides; the hidden attribute hides unless an inline display overrides it (browser
// behaviour), except inside .gfc-root where the extension's own CSS forces [hidden] to display:none.
function visible(el) {
  for (let n = el; n; n = n.parentNode || n.host) {
    if (n.nodeType !== 1) continue;
    if (n.style.display === "none") return false;
    if (n.hasAttribute("hidden") && (!n.style.display || n.closest(".gfc-root"))) return false;
  }
  return true;
}

function page(routes = {}) {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://local.test/gacha-forge", runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  if (!win.TextEncoder) win.TextEncoder = TextEncoder; // present in every browser; jsdom 24 lacks it
  win.alert = () => {}; win.prompt = () => null; win.confirm = () => true;
  win.Element.prototype.getClientRects = function () { return visible(this) ? [{ width: 1, height: 1 }] : []; };
  const log = [];
  const native = async function (input, init = {}) {
    const url = new URL(String(input && input.url ? input.url : input), "https://local.test");
    const body = init.body;
    const text = typeof body === "string" ? body : body && ArrayBuffer.isView(body) ? Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("utf8") : "";
    const parsed = text ? JSON.parse(text) : null;
    log.push({ path: url.pathname, method: init.method || "GET", body: parsed, rawType: typeof body, headers: init.headers || {} });
    const h = routes[url.pathname];
    const [b, status = 200, delay = 0] = h ? h(parsed) : [{ ok: true }];
    await sleep(delay);
    return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  };
  win.fetch = native;
  const host = doc.createElement("marinara-capability-gacha-forge");
  doc.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>p{font-size:22px} button{display:inline-block;font-size:20px;padding:14px}</style>
    <div class="gf-app"><div><button class="gf-fs-bar icon-button">⛶</button></div>
      <div data-screen="home">홈</div>
      <div data-screen="shop" style="display:none">
        <nav class="sh-rail"><button class="sh-cat is-active" data-shop-cat="gems" aria-selected="true">젬</button><button class="sh-cat" data-shop-cat="pack" aria-selected="false">패키지</button></nav>
        <div class="sh-pane"><div class="sh-native" style="display:flex">원래 상점 목록</div></div>
      </div>
      <div data-screen="settings" style="display:none">
        <nav class="st-rail"><button class="st-sect on" aria-selected="true">일반</button><button class="st-sect" aria-selected="false">화면</button></nav>
        <div class="st-pane"><div class="st-native">원래 설정</div></div>
      </div>
    </div>`;
  const show = (name) => { for (const s of root.querySelectorAll("[data-screen]")) s.style.display = s.dataset.screen === name ? "" : "none"; };
  const click = (el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, composed: true }));
  const q = (sel) => root.querySelector(sel);
  const shopView = () => root.querySelector('[data-gfc-view="shop"]');
  const catalogs = () => log.filter((e) => e.path.endsWith("/gf-customizer/exchange/catalog"));
  const game = (p, runId, init = {}) => win.fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }), ...init });
  const quest = () => JSON.parse(win.localStorage.getItem("gf-quest-v1") || "{}");
  return { dom, win, doc, host, root, log, show, click, q, shopView, catalogs, game, quest, native,
    load: (src) => win.eval(src), close: () => win.close() };
}

const characters = (runId) => [
  { id: runId + ":unit:b", name: "보라", rarity: 4, owned: true, facet: 2, maxFacet: 6, maxed: false, exchangeCount: 1, price: 120, portrait: "/img/b.png" },
  { id: runId + ":unit:a", name: "아린", rarity: 5, owned: false, facet: null, maxFacet: 6, maxed: false, exchangeCount: 0, price: 300, portrait: "javascript:alert(1)" },
  { id: runId + ":unit:c", name: "채원", rarity: 5, owned: true, facet: 6, maxFacet: 6, maxed: true, exchangeCount: 0, price: 300 },
];
const baseRoutes = (over = {}) => ({
  "/api/gacha-forge/state": () => [{ activeRun: { runId: "run-a", name: "월드 A" }, runs: [{ runId: "run-a", name: "월드 A" }, { runId: "run-b", name: "월드 B" }] }],
  "/api/gacha-forge/gf-customizer/exchange/catalog": (b) => [{ ok: true, glimmer: 1234, exchangeEnabled: false, readOnly: true, characters: characters(b.runId) }],
  "/api/gacha-forge/gf-customizer/settings": () => [{ ok: true, settings: { bannerDays: 7, characterPity: 50, weaponPity: 80, fullFacetGlimmer4: 0, fullFacetGlimmer5: 0, featuredGuarantee: true } }],
  ...over,
});

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + " — " + (e && e.message)]); }
}
async function openShop(p) {
  p.show("shop");
  await sleep(250);
  const tab = p.q("[data-gf-customizer-tab]");
  assert.ok(tab, "Glimmer 교환 tab not added to the shop rail");
  p.click(tab);
  await sleep(150);
  return tab;
}

(async () => {
  await test("상점 탭이 게임 화면 전환 직후(0.25초 안) 나타남 · 탭은 1개", async () => {
    const p = page(baseRoutes()); p.load(CUST);
    p.show("shop"); await sleep(250);
    assert.strictEqual(p.root.querySelectorAll("[data-gf-customizer-tab]").length, 1);
    assert.strictEqual(p.q("[data-gf-customizer-tab]").textContent, "Glimmer 교환");
    assert.ok(!p.q("[data-gf-customizer-tab]").classList.contains("is-active"), "copied the 'selected' class from the sample tab");
    p.close();
  });

  await test("Run ID 자동 인식 → 상점 열면 목록 1회 자동 조회 · 월드 이름/잔액 표시 · 수동 입력 숨김", async () => {
    const p = page(baseRoutes()); p.load(CUST);
    await (await p.win.fetch("/api/gacha-forge/state")).json(); await sleep(30);
    await openShop(p); await sleep(100);
    assert.deepStrictEqual(p.catalogs().map((c) => c.body.runId), ["run-a"]);
    const v = p.shopView();
    assert.ok(v && visible(v), "shop view not visible");
    assert.ok(v.textContent.includes("현재 월드: 월드 A"), v.textContent);
    assert.ok(v.textContent.includes("Glimmer 1,234"));
    assert.strictEqual(visible(v.querySelector(".gfc-manual")), false, "manual Run ID box still shown");
    assert.strictEqual(visible(v.querySelector('input[type="password"]')), false, "secret box shown while purchase disabled");
    assert.strictEqual(v.querySelectorAll(".gfc-item").length, 3);
    assert.strictEqual(v.querySelectorAll(".gfc-item button").length, 0, "purchase buttons shown while disabled");
    assert.ok(v.querySelector(".gfc-item .gfc-name").textContent.includes("★5"), "5★ not sorted first");
    assert.strictEqual(v.querySelectorAll("img").length, 1, "unsafe portrait URL rendered");
    assert.strictEqual(visible(p.q(".sh-native")), false, "native shop content not hidden");
    p.close();
  });

  await test("중복 탭 제거: 상점 화면 안에 '설정 / Glimmer 상점' 버튼이 없음", async () => {
    const p = page(baseRoutes()); p.load(CUST); await p.game("/api/gacha-forge/beat", "run-a"); await sleep(20);
    await openShop(p); await sleep(80);
    const labels = [...p.shopView().querySelectorAll("button")].filter(visible).map((b) => b.textContent);
    assert.deepStrictEqual(labels, ["새로고침"], JSON.stringify(labels));
    p.close();
  });

  await test("반복 조회 없음: 게임 DOM 변화 30회에도 목록 조회는 1회", async () => {
    const p = page(baseRoutes()); p.load(CUST); await p.game("/api/gacha-forge/beat", "run-a"); await sleep(20);
    await openShop(p); await sleep(80);
    for (let i = 0; i < 30; i++) { p.q(".sh-rail").setAttribute("class", "sh-rail x" + i); p.q(".sh-rail").append(p.doc.createElement("i")); await sleep(15); }
    await sleep(300);
    assert.strictEqual(p.catalogs().length, 1, "catalog calls: " + p.catalogs().length);
    // The same run seen again in later game traffic does not refetch either.
    await p.game("/api/gacha-forge/beat", "run-a"); await sleep(200);
    assert.strictEqual(p.catalogs().length, 1);
    p.close();
  });

  await test("월드 변경 시 목록 초기화 후 새 월드로 1회 재조회", async () => {
    const p = page(baseRoutes()); p.load(CUST); await p.game("/api/gacha-forge/beat", "run-a"); await sleep(20);
    await openShop(p); await sleep(80);
    await p.game("/api/gacha-forge/beat", "run-b"); await sleep(200);
    assert.deepStrictEqual(p.catalogs().map((c) => c.body.runId), ["run-a", "run-b"]);
    assert.ok(p.shopView().querySelector(".gfc-item").textContent.length > 0);
    p.close();
  });

  await test("늦게 끝난 이전 요청이 현재 월드를 덮어쓰지 않음 · 실패/삭제 요청 무시", async () => {
    const p = page(baseRoutes({
      "/api/gacha-forge/beat": (b) => [{ ok: true }, 200, b.runId === "run-a" ? 150 : 5],
      "/api/gacha-forge/fail": () => [{ ok: false }, 500],
      "/api/gacha-forge/run/delete": () => [{ ok: true }],
    }));
    p.load(CUST);
    const slow = p.game("/api/gacha-forge/beat", "run-a"); await sleep(2);
    await p.game("/api/gacha-forge/beat", "run-b"); await slow; await sleep(30);
    await p.game("/api/gacha-forge/fail", "run-c"); await sleep(20);
    await p.game("/api/gacha-forge/run/delete", "run-d"); await sleep(20);
    await openShop(p); await sleep(80);
    assert.deepStrictEqual(p.catalogs().map((c) => c.body.runId), ["run-b"]);
    p.close();
  });

  await test("게임 코드가 응답 본문을 그대로 읽을 수 있음 (관찰이 응답을 소비하지 않음)", async () => {
    const p = page(baseRoutes()); p.load(CUST); if (QUEST) p.load(QUEST);
    const r = await p.win.fetch("/api/gacha-forge/state");
    const body = await r.json();
    assert.strictEqual(body.activeRun.runId, "run-a");
    p.close();
  });

  await test("서버에서 월드를 찾지 못하면(bad-request) 인식값 해제 + 수동 입력 표시", async () => {
    const p = page(baseRoutes({ "/api/gacha-forge/gf-customizer/exchange/catalog": () => [{ ok: false, error: "bad-request" }] }));
    p.load(CUST); await p.game("/api/gacha-forge/beat", "run-gone"); await sleep(20);
    await openShop(p); await sleep(80);
    const v = p.shopView();
    assert.ok(v.textContent.includes("서버에서 이 월드를 찾지 못했습니다"), v.textContent);
    assert.ok(visible(v.querySelector(".gfc-manual")));
    assert.strictEqual(p.catalogs().length, 1);
    p.close();
  });

  await test("교환 패치 미적용(404) 안내", async () => {
    const p = page(baseRoutes({ "/api/gacha-forge/gf-customizer/exchange/catalog": () => [{ error: "not found" }, 404] }));
    p.load(CUST); await p.game("/api/gacha-forge/beat", "run-a"); await sleep(20);
    await openShop(p); await sleep(80);
    assert.ok(p.shopView().textContent.includes("커스터마이저 패치가 적용되어 있지 않습니다"));
    p.close();
  });

  await test("Run 미인식 상태: 조회하지 않고 안내 · 수동 입력으로 조회 가능", async () => {
    const p = page(baseRoutes()); p.load(CUST);
    await openShop(p); await sleep(60);
    assert.strictEqual(p.catalogs().length, 0);
    const v = p.shopView();
    assert.ok(v.textContent.includes("현재 월드: 확인 전"));
    v.querySelector(".gfc-manual input").value = "run-m";
    p.click(v.querySelector(".gfc-manual button")); await sleep(80);
    assert.deepStrictEqual(p.catalogs().map((c) => c.body.runId), ["run-m"]);
    assert.ok(v.textContent.includes("(직접 입력)"));
    p.close();
  });

  await test("게임의 원래 탭을 누르면 원래 상점 화면 복원", async () => {
    const p = page(baseRoutes()); p.load(CUST); await p.game("/api/gacha-forge/beat", "run-a"); await sleep(20);
    const tab = await openShop(p);
    assert.strictEqual(p.q('[data-shop-cat="gems"]').getAttribute("aria-selected"), "false");
    p.click(p.q('[data-shop-cat="gems"]')); await sleep(200);
    assert.strictEqual(p.shopView(), null);
    assert.ok(visible(p.q(".sh-native")), "native content not restored");
    assert.strictEqual(p.q(".sh-native").style.display, "flex", "native inline display not restored exactly");
    assert.strictEqual(p.q('[data-shop-cat="gems"]').getAttribute("aria-selected"), "true");
    assert.strictEqual(tab.getAttribute("aria-selected"), "false");
    // Reopen → one more fetch for the new opening (refreshes balance after pulls), not a loop.
    p.click(tab); await sleep(200);
    assert.strictEqual(p.catalogs().length, 2);
    p.close();
  });

  await test("화면 이동(상점→홈→상점) 후 원래 상점 표시, 탭 유지", async () => {
    const p = page(baseRoutes()); p.load(CUST); await p.game("/api/gacha-forge/beat", "run-a"); await sleep(20);
    await openShop(p);
    p.show("home"); await sleep(250);
    assert.strictEqual(p.shopView(), null);
    p.show("shop"); await sleep(250);
    assert.ok(visible(p.q(".sh-native")));
    assert.strictEqual(p.root.querySelectorAll("[data-gf-customizer-tab]").length, 1);
    p.close();
  });

  await test("설정 화면: 탭 1개 · 열 때 설정 1회 조회 · 저장 값 검증", async () => {
    const p = page(baseRoutes()); p.load(CUST);
    p.show("settings"); await sleep(250);
    assert.strictEqual(p.root.querySelectorAll("[data-gf-customizer-tab]").length, 1);
    p.click(p.q("[data-gf-customizer-tab]")); await sleep(120);
    const v = p.root.querySelector('[data-gfc-view="settings"]');
    assert.ok(v && visible(v));
    const gets = () => p.log.filter((e) => e.path.endsWith("/settings") && e.method === "GET").length;
    assert.strictEqual(gets(), 1);
    const nums = v.querySelectorAll('input[type="number"]');
    assert.strictEqual(nums[1].value, "50");
    nums[1].value = "0";
    p.click([...v.querySelectorAll("button")].find((b) => b.textContent === "서버에 적용")); await sleep(50);
    assert.ok(v.textContent.includes("캐릭터 5성 천장 값은 1~100"));
    assert.strictEqual(p.log.filter((e) => e.method === "POST").length, 0);
    nums[1].value = "60";
    p.click([...v.querySelectorAll("button")].find((b) => b.textContent === "서버에 적용")); await sleep(80);
    const post = p.log.find((e) => e.method === "POST" && e.path.endsWith("/settings"));
    assert.strictEqual(post.body.settings.characterPity, 60);
    assert.strictEqual(post.headers["X-Marinara-CSRF"], "1");
    p.close();
  });

  await test("구매 활성화 응답일 때만 비밀키 입력·구매 버튼 표시, 같은 캐릭터 재시도는 같은 요청 ID", async () => {
    let n = 0;
    const p = page(baseRoutes({
      "/api/gacha-forge/gf-customizer/exchange/catalog": (b) => [{ ok: true, glimmer: 500, exchangeEnabled: true, characters: characters(b.runId) }],
      "/api/gacha-forge/gf-customizer/exchange": () => (++n === 1 ? [{ ok: false, error: "write-conflict", retry: true }] : [{ ok: true, replayed: false }]),
    }));
    p.load(CUST); await p.game("/api/gacha-forge/beat", "run-a"); await sleep(20);
    await openShop(p); await sleep(80);
    const v = p.shopView();
    assert.ok(visible(v.querySelector('input[type="password"]')));
    const buttons = [...v.querySelectorAll(".gfc-item button")];
    // sorted ★5 first: 아린(300, 구매 가능) · 채원(최대 패싯) · 보라(★4)
    assert.deepStrictEqual(buttons.map((b) => [b.closest(".gfc-item").querySelector(".gfc-name").textContent, b.disabled]),
      [["★5 아린", false], ["★5 채원", true], ["★4 보라", false]]);
    v.querySelector('input[type="password"]').value = "x".repeat(30);
    p.click(buttons[0]); await sleep(80);
    p.click(buttons[0]); await sleep(120);
    const ex = p.log.filter((e) => e.path.endsWith("/gf-customizer/exchange"));
    assert.strictEqual(ex.length, 2);
    assert.strictEqual(ex[0].body.requestId, ex[1].body.requestId);
    assert.strictEqual(ex[0].body.runId, "run-a");
    assert.strictEqual(p.catalogs().length, 2, "list not refreshed after purchase");
    p.close();
  });

  await test("확장 해제: fetch 원복 · 그림자 DOM 속 탭 제거 · 원래 화면 복원 · 재설치 후 정상 동작", async () => {
    const p = page(baseRoutes()); const nativeFetch = p.win.fetch;
    p.load(CUST); await p.game("/api/gacha-forge/beat", "run-a"); await sleep(20);
    await openShop(p);
    p.win.__GF_CUSTOMIZER_UNIFIED();
    assert.strictEqual(p.win.fetch, nativeFetch, "fetch not restored");
    assert.strictEqual(p.root.querySelectorAll("[data-gf-customizer-tab]").length, 0);
    assert.ok(visible(p.q(".sh-native")));
    assert.strictEqual(p.win.__GF_CUSTOMIZER_UNIFIED, undefined);
    p.load(CUST); await sleep(250);
    assert.strictEqual(p.root.querySelectorAll("[data-gf-customizer-tab]").length, 1);
    await p.game("/api/gacha-forge/beat", "run-a"); await sleep(20);
    p.click(p.q("[data-gf-customizer-tab]")); await sleep(150);
    assert.ok(p.shopView() && visible(p.shopView()), "reinstalled tab does nothing");
    assert.strictEqual(p.catalogs().length, 2);
    p.close();
  });

  await test("이전 설치가 남긴 탭이 있어도 새 설치가 교체", async () => {
    const p = page(baseRoutes()); p.show("shop");
    const ghost = p.doc.createElement("button"); ghost.setAttribute("data-gf-customizer-tab", ""); ghost.textContent = "Glimmer 교환";
    p.q(".sh-rail").append(ghost);
    p.load(CUST); await sleep(250);
    const tabs = p.root.querySelectorAll("[data-gf-customizer-tab]");
    assert.strictEqual(tabs.length, 1);
    assert.notStrictEqual(tabs[0], ghost);
    p.close();
  });

  if (QUEST) {
    for (const order of ["퀘스트→커스터마이저", "커스터마이저→퀘스트"]) {
      await test(`퀘스트 확장 공존 (${order}): 두 확장 모두 게임 통신으로 같은 월드 인식`, async () => {
        const p = page(baseRoutes());
        if (order.startsWith("퀘스트")) { p.load(QUEST); p.load(CUST); } else { p.load(CUST); p.load(QUEST); }
        await (await p.win.fetch("/api/gacha-forge/state")).json(); await sleep(50);
        assert.strictEqual(p.quest().worlds[p.quest().world].gfRunId, "run-a");
        await openShop(p); await sleep(80);
        assert.deepStrictEqual(p.catalogs().map((c) => c.body.runId), ["run-a"]);
        await p.game("/api/gacha-forge/beat", "run-b"); await sleep(150);
        assert.strictEqual(p.quest().worlds[p.quest().world].gfRunId, "run-b");
        assert.deepStrictEqual(p.catalogs().map((c) => c.body.runId), ["run-a", "run-b"]);
        p.close();
      });
      await test(`퀘스트 확장 공존 (${order}): 커스터마이저 요청·수동 입력이 퀘스트 월드 연결을 바꾸지 않음`, async () => {
        const p = page(baseRoutes());
        if (order.startsWith("퀘스트")) { p.load(QUEST); p.load(CUST); } else { p.load(CUST); p.load(QUEST); }
        await (await p.win.fetch("/api/gacha-forge/state")).json(); await sleep(50);
        const before = JSON.stringify(p.quest());
        await openShop(p); await sleep(80);
        const v = p.shopView();
        // force the manual box open and look up a different run
        v.querySelector(".gfc-manual").hidden = false;
        v.querySelector(".gfc-manual input").value = "run-other";
        p.click(v.querySelector(".gfc-manual button")); await sleep(120);
        assert.ok(p.catalogs().some((c) => c.body.runId === "run-other"));
        assert.strictEqual(JSON.stringify(p.quest()), before, "quest world data changed");
        p.close();
      });
    }
    await test("퀘스트 확장 공존: 커스터마이저가 아래에 깔린 상태로 해제돼도 게임 통신·퀘스트 인식 정상", async () => {
      const p = page(baseRoutes()); p.load(CUST); p.load(QUEST);
      const questWrapper = p.win.fetch;
      p.win.__GF_CUSTOMIZER_UNIFIED();
      assert.strictEqual(p.win.fetch, questWrapper, "the Quest wrapper must not be removed");
      const r = await p.win.fetch("/api/gacha-forge/state"); assert.strictEqual((await r.json()).activeRun.runId, "run-a");
      await sleep(50);
      assert.strictEqual(p.quest().worlds[p.quest().world].gfRunId, "run-a");
      p.load(CUST); await p.game("/api/gacha-forge/beat", "run-b"); await sleep(30);
      await openShop(p); await sleep(80);
      assert.deepStrictEqual(p.catalogs().map((c) => c.body.runId), ["run-b"]);
      p.close();
    });
  }

  for (const [s, n] of results) console.log(s + "  " + n);
  const failed = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${results.length - failed}/${results.length} PASS` + (QUEST ? "" : " (퀘스트 확장 경로를 주지 않아 공존 테스트 생략)"));
  process.exit(failed ? 1 : 0);
})();
