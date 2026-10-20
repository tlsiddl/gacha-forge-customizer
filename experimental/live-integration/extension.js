/* Gacha Forge · Customizer v0.5.2-dev — personal extension for Gacha Forge 1.8.12 on Marinara Engine 2.5.0.
 * Adds a "가챠 커스터마이저" section to the game's settings screen and a "Glimmer 교환" section to its shop screen.
 * Purchases stay disabled unless the server enables them; the shop is read-only otherwise. */
(() => {
  "use strict";
  const KEY = "__GF_CUSTOMIZER_UNIFIED";
  if (typeof window[KEY] === "function") {
    try { window[KEY](); } catch {}
  }

  const INSTANCE = Math.random().toString(36).slice(2, 10);
  const HOST_TAG = "marinara-capability-gacha-forge";
  const API_BASE = "/api/gacha-forge";
  const SETTINGS_API = API_BASE + "/gf-customizer/settings";
  const CATALOG_API = API_BASE + "/gf-customizer/exchange/catalog";
  const EXCHANGE_API = API_BASE + "/gf-customizer/exchange";
  const fields = {
    bannerDays: ["픽업 배너 기간 (일)", 1, 30],
    characterPity: ["캐릭터 5성 천장", 1, 100],
    weaponPity: ["무기 5성 천장", 1, 100],
    fullFacetGlimmer4: ["4성 풀 패싯 중복 Glimmer", 0, 100000],
    fullFacetGlimmer5: ["5성 풀 패싯 중복 Glimmer", 0, 100000],
  };

  const life = new AbortController();
  const listen = (target, type, fn, capture = false) =>
    target.addEventListener(type, fn, { capture, signal: life.signal });
  let disposed = false;

  /* ───────────── Current-run discovery ─────────────
   * Same passive approach as the Quest extension: watch the game's own successful /api/gacha-forge traffic,
   * never poll /state. Differences that matter for the shop:
   *  - each game request gets a sequence number when it is SENT; a slower, older request that finishes late
   *    can never replace the run of a newer one;
   *  - a run ID is only taken from requests the server answered successfully;
   *  - delete/remove/archive requests are ignored, so a world being deleted is never treated as current;
   *  - this extension's own requests are invisible to both this observer and the Quest extension's observer
   *    (their bodies are sent as bytes, which the Quest extension does not parse). */
  const RUN_ID_RE = /^[A-Za-z0-9:_-]{1,128}$/;
  const SKIP_RE = /(?:^|[/_-])(?:delete|remove|archive)(?:$|[/_-])/i;
  const BODY_RE = /\/(?:state|runs?)(?:\/|$)/;
  const run = { id: "", name: "", seq: 0, manual: false };
  const runListeners = new Set();
  let sendSeq = 0;
  const cleanRunId = (v) => {
    const id = typeof v === "string" ? v.trim() : "";
    return RUN_ID_RE.test(id) ? id : "";
  };
  const nameOf = (x) =>
    String(x?.name || x?.title || x?.worldName || x?.world?.name || "").trim().slice(0, 100);
  function setRun(id, name, seq, manual = false) {
    id = cleanRunId(id);
    if (!id || disposed || seq < run.seq) return;
    const changed = run.id !== id;
    run.seq = seq;
    run.id = id;
    run.manual = manual;
    if (changed) run.name = "";
    if (name) run.name = name;
    for (const fn of runListeners) {
      try { fn(changed); } catch {}
    }
  }
  function forgetRun(id) {
    if (!id || run.id !== id) return;
    run.id = "";
    run.name = "";
    run.manual = false;
    for (const fn of runListeners) {
      try { fn(true); } catch {}
    }
  }
  function readRunReply(v, seq, requested) {
    if (!v || typeof v !== "object") return;
    const id = requested || cleanRunId(v.activeRun?.runId) || cleanRunId(v.activeRunId) || cleanRunId(v.run?.runId);
    if (!id) return;
    let name = "";
    if (v.activeRun?.runId === id) name = nameOf(v.activeRun);
    if (!name && v.run?.runId === id) name = nameOf(v.run);
    if (!name && Array.isArray(v.runs)) name = nameOf(v.runs.find((x) => x?.runId === id));
    if (!name && Array.isArray(v.worlds)) name = nameOf(v.worlds.find((x) => x?.runId === id));
    setRun(id, name, seq);
  }
  const priorFetch = window.fetch;
  const observedFetch = function (input, init) {
    const result = priorFetch.apply(this, arguments);
    if (disposed) return result; // left in place under another wrapper: pure pass-through
    try {
      const u = new URL(String(input && typeof input === "object" && "url" in input ? input.url : input), location.href);
      if (u.origin !== location.origin || !u.pathname.startsWith(API_BASE + "/")) return result;
      if (u.pathname.includes("/gf-customizer/") || SKIP_RE.test(u.pathname)) return result;
      let requested = "";
      if (typeof init?.body === "string") {
        try { requested = cleanRunId(JSON.parse(init.body)?.runId); } catch {}
      }
      const wantsBody = BODY_RE.test(u.pathname);
      if (!requested && !wantsBody) return result;
      const seq = ++sendSeq;
      if (result && typeof result.then === "function")
        result.then(
          (response) => {
            if (disposed || !response?.ok) return;
            if (!wantsBody) return setRun(requested, "", seq);
            const type = response.headers?.get?.("content-type") || "";
            const size = Number(response.headers?.get?.("content-length") || 0);
            if ((type && !type.includes("json")) || size > 1024 * 1024) return requested && setRun(requested, "", seq);
            response.clone().json().then(
              (v) => readRunReply(v, seq, requested),
              () => requested && setRun(requested, "", seq),
            );
          },
          () => {},
        );
    } catch {}
    return result;
  };
  window.fetch = observedFetch;

  /* ───────────── Server requests ───────────── */
  function headers(json) {
    const h = { "X-Marinara-CSRF": "1" };
    if (json) h["Content-Type"] = "application/json";
    try {
      const secret = window.localStorage.getItem("marinara_admin_secret")?.trim();
      if (secret) h["X-Admin-Secret"] = secret;
    } catch {}
    return h;
  }
  // Bodies go out as bytes: identical on the wire, but other extensions' fetch observers do not read them,
  // so a run ID typed here can never relink the Quest extension's world.
  const bytes = (obj) => new TextEncoder().encode(JSON.stringify(obj));
  async function callApi(url, method, body) {
    let response;
    try {
      response = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: headers(!!body),
        body: body ? bytes(body) : undefined,
      });
    } catch {
      throw Object.assign(Error("서버에 연결하지 못했습니다."), { code: "network" });
    }
    let data = null;
    try { data = await response.json(); } catch {}
    if (response.status === 404) throw Object.assign(Error("서버에 커스터마이저 패치가 적용되어 있지 않습니다."), { code: "missing" });
    if (response.status === 401 || response.status === 403)
      throw Object.assign(Error("서버 권한 확인에 실패했습니다. 관리자 비밀키 설정을 확인해 주세요."), { code: "auth" });
    if (!response.ok || !data) throw Object.assign(Error("서버 오류가 발생했습니다 (HTTP " + response.status + ")."), { code: "http" });
    if (!data.ok) throw Object.assign(Error(data.message || data.error || "서버 오류가 발생했습니다."), { code: data.error || "error", data });
    return data;
  }

  // crypto.randomUUID only exists on HTTPS/localhost; getRandomValues also works over plain HTTP.
  function newRequestId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, "0")).join("");
  }

  /* ───────────── Styles (scoped; inserted next to each view, works inside the game's shadow root) ───────────── */
  const CSS = `
.gfc-root{all:initial;display:flex!important;flex-direction:column;gap:8px;box-sizing:border-box;width:100%;max-height:100%;
  overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:10px 12px;color:inherit;
  font:13px/1.4 system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;letter-spacing:normal}
.gfc-root *{box-sizing:border-box;font-family:inherit!important;font-size:inherit!important;line-height:inherit!important;
  letter-spacing:normal!important;text-transform:none!important;margin:0!important}
.gfc-root>*{flex-shrink:0}
.gfc-root[hidden],.gfc-root [hidden]{display:none!important}
.gfc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.gfc-title{font-weight:700;font-size:14px!important}
.gfc-sub{opacity:.72;font-size:12px!important}
.gfc-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;border:1px solid rgba(140,155,185,.45);
  font-size:12px!important;white-space:nowrap}
.gfc-status{font-size:12px!important;opacity:.85;min-height:1.4em}
.gfc-status[data-tone="error"]{color:#ff9a9a;opacity:1}
.gfc-btn{appearance:none;cursor:pointer;border:1px solid rgba(140,155,185,.55);background:rgba(127,140,170,.14);color:inherit;
  border-radius:7px;padding:5px 10px!important;min-height:30px;font-size:12.5px!important;white-space:nowrap}
.gfc-btn:disabled{cursor:default;opacity:.5}
.gfc-input{appearance:none;border:1px solid rgba(140,155,185,.55);background:rgba(0,0,0,.18);color:inherit;border-radius:7px;
  padding:5px 8px!important;min-height:30px;width:100%}
.gfc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0!important}
.gfc-row+.gfc-row{border-top:1px solid rgba(140,155,185,.22)}
.gfc-num{width:84px;flex:none;text-align:right}
.gfc-check{display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 0!important}
.gfc-actions{display:flex;gap:8px}
.gfc-actions .gfc-btn{flex:1}
.gfc-manual{display:flex;gap:6px}
.gfc-list{display:flex;flex-direction:column}
.gfc-item{display:flex;align-items:center;gap:10px;padding:7px 0!important}
.gfc-item+.gfc-item{border-top:1px solid rgba(140,155,185,.22)}
.gfc-face{width:34px;height:34px;flex:none;border-radius:7px;object-fit:cover;background:rgba(127,140,170,.2)}
.gfc-who{flex:1;min-width:0}
.gfc-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gfc-star5{color:#f3c55b}.gfc-star4{color:#b79cff}
.gfc-meta{font-size:11.5px!important;opacity:.75}
.gfc-price{flex:none;text-align:right;font-variant-numeric:tabular-nums;font-size:12.5px!important}
@media (max-width:560px){.gfc-root{padding:8px 8px;font-size:12.5px}.gfc-num{width:72px}.gfc-face{width:30px;height:30px}}`;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const setShown = (n, on) => { n.hidden = !on; };
  const setStatus = (n, text, tone = "") => {
    n.textContent = text;
    if (tone) n.dataset.tone = tone;
    else delete n.dataset.tone;
  };
  function viewRoot(name) {
    const root = el("div", "gfc-root");
    root.dataset.gfcView = name;
    root.dataset.gfcInstance = INSTANCE;
    const style = el("style");
    style.textContent = CSS;
    root.append(style);
    return root;
  }

  /* ───────────── Settings view ───────────── */
  function createSettingsView() {
    const root = viewRoot("settings");
    const head = el("div", "gfc-head");
    head.append(el("div", "gfc-title", "가챠 커스터마이저"), el("span", "gfc-sub", "서버 공통 설정"));
    const list = el("div");
    const inputs = {};
    for (const [id, [label, min, max]] of Object.entries(fields)) {
      const row = el("label", "gfc-row");
      const input = el("input", "gfc-input gfc-num");
      Object.assign(input, { type: "number", min, max, step: 1, inputMode: "numeric" });
      inputs[id] = input;
      row.append(el("span", "", label), input);
      list.append(row);
    }
    const check = el("label", "gfc-check");
    const toggle = el("input");
    toggle.type = "checkbox";
    check.append(toggle, el("span", "", "픽업 5성 확정"));
    const hint = el("div", "gfc-sub", "천장 기본값은 80이며, 소프트 천장은 천장 − 6회로 자동 조정됩니다. 풀 패싯 Glimmer를 0으로 두면 게임 기본 보상을 사용합니다.");
    const actions = el("div", "gfc-actions");
    const reload = el("button", "gfc-btn", "다시 불러오기");
    const save = el("button", "gfc-btn", "서버에 적용");
    reload.type = save.type = "button";
    actions.append(reload, save);
    const status = el("div", "gfc-status");
    status.setAttribute("role", "status");
    root.append(head, list, check, hint, actions, status);
    let busy = false;
    const lock = (on) => { busy = on; reload.disabled = save.disabled = on; };
    async function load() {
      if (busy) return;
      lock(true);
      setStatus(status, "서버 설정을 불러오는 중입니다…");
      try {
        const { settings } = await callApi(SETTINGS_API, "GET");
        for (const [id, input] of Object.entries(inputs)) input.value = settings[id];
        toggle.checked = !!settings.featuredGuarantee;
        setStatus(status, "서버 설정을 불러왔습니다.");
      } catch (e) {
        setStatus(status, "설정을 불러오지 못했습니다. " + e.message, "error");
      } finally { lock(false); }
    }
    reload.onclick = load;
    save.onclick = async () => {
      if (busy) return;
      const next = {};
      for (const [id, input] of Object.entries(inputs)) {
        const n = Number(input.value), [label, min, max] = fields[id];
        if (input.value === "" || !Number.isInteger(n) || n < min || n > max)
          return setStatus(status, label + " 값은 " + min + "~" + max + " 사이의 정수로 입력해 주세요.", "error");
        next[id] = n;
      }
      next.featuredGuarantee = toggle.checked;
      lock(true);
      setStatus(status, "서버에 저장하는 중입니다…");
      try {
        await callApi(SETTINGS_API, "POST", { settings: next });
        setStatus(status, "저장했습니다. 이후 뽑기부터 적용됩니다.");
      } catch (e) {
        setStatus(status, "저장하지 못했습니다. " + e.message, "error");
      } finally { lock(false); }
    };
    return { root, opened: load };
  }

  /* ───────────── Shop view ───────────── */
  function createShopView() {
    const root = viewRoot("shop");
    const head = el("div", "gfc-head");
    const title = el("div", "gfc-title", "Glimmer 교환");
    const balance = el("span", "gfc-chip", "Glimmer –");
    const refresh = el("button", "gfc-btn", "새로고침");
    refresh.type = "button";
    const right = el("div", "gfc-actions");
    right.append(balance, refresh);
    head.append(title, right);
    const world = el("div", "gfc-sub");
    const status = el("div", "gfc-status");
    status.setAttribute("role", "status");
    const manual = el("div", "gfc-manual");
    const runInput = el("input", "gfc-input");
    Object.assign(runInput, { placeholder: "월드 Run ID (자동 인식이 안 될 때만)", autocomplete: "off", spellcheck: false });
    const runGo = el("button", "gfc-btn", "조회");
    runGo.type = "button";
    manual.append(runInput, runGo);
    const secret = el("input", "gfc-input");
    Object.assign(secret, { type: "password", placeholder: "구매 전용 비밀키 (저장되지 않습니다)", autocomplete: "off" });
    const policy = el("div", "gfc-sub", "4성 100 · 5성 300 Glimmer부터 시작하며, 같은 캐릭터를 교환할 때마다 다음 가격이 20씩 오릅니다.");
    const list = el("div", "gfc-list");
    list.setAttribute("aria-live", "polite");
    root.append(head, world, status, manual, secret, policy, list);

    let busy = false, queued = false, shown = false, loadedFor = "", enabled = false, pending = null, token = 0;
    function renderWorld() {
      setShown(manual, !run.id || run.manual);
      if (!run.id) {
        world.textContent = "현재 월드: 확인 전";
        return;
      }
      world.textContent = "현재 월드: " + (run.name || "ID " + run.id.slice(0, 12)) + (run.manual ? " (직접 입력)" : "");
    }
    function clearList() {
      list.replaceChildren();
      balance.textContent = "Glimmer –";
      enabled = false;
      setShown(secret, false);
    }
    function render(payload) {
      enabled = payload.exchangeEnabled === true;
      setShown(secret, enabled);
      const glimmer = Math.max(0, Number(payload.glimmer) || 0);
      balance.textContent = "Glimmer " + glimmer.toLocaleString("ko-KR");
      const chars = (Array.isArray(payload.characters) ? payload.characters : []).slice().sort(
        (a, b) => (Number(b.rarity) || 0) - (Number(a.rarity) || 0) || String(a.name || "").localeCompare(String(b.name || ""), "ko"),
      );
      list.replaceChildren();
      for (const ch of chars) {
        const item = el("div", "gfc-item");
        const portrait = typeof ch.portrait === "string" && /^(\/(?!\/)|https:\/\/)/.test(ch.portrait) ? ch.portrait : "";
        if (portrait) {
          const img = el("img", "gfc-face");
          Object.assign(img, { src: portrait, alt: "", loading: "lazy", decoding: "async" });
          item.append(img);
        } else item.append(el("span", "gfc-face"));
        const who = el("div", "gfc-who");
        const name = el("div", "gfc-name");
        const rarity = Number(ch.rarity) === 5 ? 5 : 4;
        name.append(el("span", "gfc-star" + rarity, "★" + rarity + " "), document.createTextNode(ch.name || ch.id));
        const meta = el("div", "gfc-meta",
          (ch.owned ? "보유 · 패싯 " + ch.facet + "/" + ch.maxFacet : "미보유") + (ch.exchangeCount ? " · 교환 " + ch.exchangeCount + "회" : ""));
        who.append(name, meta);
        item.append(who);
        const price = Number(ch.price) || 0;
        if (enabled) {
          const buy = el("button", "gfc-btn");
          buy.type = "button";
          buy.disabled = !!ch.maxed || glimmer < price;
          buy.textContent = ch.maxed ? "최대 패싯" : price.toLocaleString("ko-KR") + " G 교환";
          buy.onclick = () => purchase(ch, price, buy);
          item.append(buy);
        } else {
          item.append(el("span", "gfc-price", ch.maxed ? "최대 패싯" : price.toLocaleString("ko-KR") + " G"));
        }
        list.append(item);
      }
      const readOnly = enabled ? "" : " · 구매는 서버에서 비활성화되어 있어 목록만 표시합니다.";
      setStatus(status, (chars.length ? "교환 가능한 캐릭터 " + chars.length + "명" : "교환할 수 있는 4성·5성 캐릭터가 없습니다.") + readOnly);
    }
    async function loadCatalog() {
      if (!shown) return;
      if (busy) { queued = true; return; }
      renderWorld();
      const rid = run.id;
      if (!rid) {
        clearList();
        loadedFor = "";
        setStatus(status, "게임에서 월드를 열면 자동으로 인식합니다. 자동 인식이 되지 않으면 Run ID를 직접 입력해 주세요.");
        return;
      }
      busy = true;
      refresh.disabled = runGo.disabled = true;
      const mine = ++token;
      if (loadedFor !== rid) clearList();
      setStatus(status, "목록을 불러오는 중입니다…");
      try {
        const payload = await callApi(CATALOG_API, "POST", { runId: rid });
        if (mine !== token || rid !== run.id || disposed) return;
        loadedFor = rid;
        render(payload);
      } catch (e) {
        if (mine !== token || rid !== run.id || disposed) return;
        loadedFor = "";
        clearList();
        if (e.code === "bad-request") {
          setStatus(status, "서버에서 이 월드를 찾지 못했습니다. 게임에서 월드를 다시 열어 주세요.", "error");
          forgetRun(rid);
        } else setStatus(status, "목록을 불러오지 못했습니다. " + e.message, "error");
      } finally {
        busy = false;
        refresh.disabled = runGo.disabled = false;
        if (queued) { queued = false; if (shown && run.id !== loadedFor) loadCatalog(); }
      }
    }
    async function purchase(ch, price, button) {
      if (busy || !enabled || button.disabled) return;
      const rid = run.id;
      if (!rid || rid !== loadedFor) return setStatus(status, "월드가 바뀌었습니다. 목록을 새로고침해 주세요.", "error");
      if (secret.value.length < 24) return setStatus(status, "구매 전용 비밀키를 입력해 주세요 (24자 이상).", "error");
      if (!window.confirm((ch.name || ch.id) + " 캐릭터를 " + price.toLocaleString("ko-KR") + " Glimmer로 교환하시겠습니까?")) return;
      const key = rid + "|" + ch.id;
      if (!pending || pending.key !== key) pending = { key, requestId: newRequestId() };
      busy = true;
      refresh.disabled = button.disabled = true;
      setStatus(status, "교환을 요청하는 중입니다…");
      let done = false;
      try {
        const r = await callApi(EXCHANGE_API, "POST", { runId: rid, characterId: ch.id, requestId: pending.requestId, secret: secret.value });
        pending = null;
        done = true;
        setStatus(status, r.replayed ? "이미 처리된 교환 요청입니다. 결과를 다시 확인했습니다." : "교환이 완료되었습니다.");
      } catch (e) {
        // Keep the same request ID only when the outcome is unknown or the save collided, so a retry cannot double-charge.
        if (!["write-conflict", "network", "http"].includes(e.code)) pending = null;
        setStatus(status, "교환을 완료하지 못했습니다. " + e.message + (pending ? " 같은 버튼을 다시 누르면 같은 요청으로 재시도합니다." : ""), "error");
      } finally {
        busy = false;
        refresh.disabled = false;
        button.disabled = false;
      }
      if (done) { loadedFor = ""; await loadCatalog(); }
    }
    refresh.onclick = () => { pending = null; loadedFor = ""; loadCatalog(); };
    const manualGo = () => {
      const id = cleanRunId(runInput.value);
      if (!id) return setStatus(status, "Run ID 형식을 확인해 주세요.", "error");
      setRun(id, "", sendSeq, true);
      loadedFor = "";
      loadCatalog();
    };
    runGo.onclick = manualGo;
    runInput.addEventListener("keydown", (e) => { if (e.key === "Enter") manualGo(); });
    runListeners.add((changed) => {
      renderWorld();
      if (!changed) return;
      pending = null;
      if (shown) loadCatalog(); // a different world: refetch once
      else { loadedFor = ""; clearList(); }
    });
    renderWorld();
    return {
      root,
      opened() { shown = true; renderWorld(); loadCatalog(); }, // one fetch per opening
      closed() { shown = false; },
    };
  }

  /* ───────────── Mounting into the game's own settings / shop rails ───────────── */
  const views = { settings: createSettingsView(), shop: createShopView() };
  let nativeView = "", lastScreen = "", active = null, scheduled = false, host = null, observer = null;
  let hiddenNodes = [], deselected = [];
  const boundRails = new WeakSet();

  function gameRoots() {
    const roots = [];
    for (const h of document.querySelectorAll(HOST_TAG)) if (h.shadowRoot) roots.push(h.shadowRoot);
    roots.push(document);
    return roots;
  }
  function findScreen() {
    for (const r of gameRoots())
      for (const s of r.querySelectorAll('[data-screen="settings"],[data-screen="shop"]'))
        if (s.isConnected && s.getClientRects().length) return s;
    return null;
  }
  function restorePane() {
    for (const [n, value, priority] of hiddenNodes) if (n.isConnected) n.style.setProperty("display", value, priority);
    hiddenNodes = [];
    for (const n of deselected) if (n.isConnected && n.getAttribute("aria-selected") === "false") n.setAttribute("aria-selected", "true");
    deselected = [];
    if (active) {
      active.view.closed?.();
      active.view.root.remove();
      active.tab?.setAttribute("aria-selected", "false");
    }
    active = null;
  }
  function showPane(pane, type, rail, tab) {
    const view = views[type];
    if (active && active.pane === pane && active.view === view && view.root.parentNode === pane) return false;
    restorePane();
    for (const n of Array.from(pane.children)) {
      if (n === view.root) continue;
      hiddenNodes.push([n, n.style.getPropertyValue("display"), n.style.getPropertyPriority("display")]);
      n.style.setProperty("display", "none", "important");
    }
    for (const n of rail.querySelectorAll('[aria-selected="true"]')) {
      if (n === tab) continue;
      n.setAttribute("aria-selected", "false");
      deselected.push(n);
    }
    tab.setAttribute("aria-selected", "true");
    pane.append(view.root);
    active = { pane, view, tab };
    view.opened();
    return true;
  }
  function nativeTab(rail, type) {
    const candidates = Array.from(rail.querySelectorAll(type === "settings" ? ".st-sect" : "[data-shop-cat]"))
      .filter((n) => !n.hasAttribute("data-gf-customizer-tab"));
    const sample = candidates.reverse().find((n) => n.getAttribute("aria-selected") !== "true") || candidates[0];
    const b = sample ? sample.cloneNode(false) : document.createElement("button");
    for (const a of ["data-view", "data-shop-cat", "disabled", "id", "aria-current", "aria-controls"]) b.removeAttribute(a);
    // Keep the game's own tab look, minus any "selected" marker the sample happened to carry.
    for (const c of Array.from(b.classList)) if (/(^|-)(active|selected|current|on)$/i.test(c)) b.classList.remove(c);
    if (b.tagName === "BUTTON") b.type = "button";
    b.textContent = type === "settings" ? "가챠 커스터마이저" : "Glimmer 교환";
    b.setAttribute("aria-selected", "false");
    b.setAttribute("data-gf-customizer-tab", INSTANCE);
    b.style.cursor = "pointer";
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (disposed) return;
      nativeView = type;
      mountNative();
    }, { signal: life.signal });
    return b;
  }
  function mountNative() {
    if (disposed) return;
    ensureObserver();
    const screen = findScreen();
    if (!screen) { restorePane(); nativeView = ""; lastScreen = ""; return; }
    const type = screen.getAttribute("data-screen");
    if (type !== lastScreen) { restorePane(); nativeView = ""; lastScreen = type; }
    const rail = screen.querySelector(type === "settings" ? ".st-rail" : ".sh-rail");
    const pane = screen.querySelector(type === "settings" ? ".st-pane" : ".sh-pane");
    if (!rail || !pane) return;
    for (const stale of rail.querySelectorAll("[data-gf-customizer-tab]"))
      if (stale.getAttribute("data-gf-customizer-tab") !== INSTANCE) stale.remove(); // left behind by an older install
    let tab = rail.querySelector('[data-gf-customizer-tab="' + INSTANCE + '"]');
    if (!tab) { tab = nativeTab(rail, type); rail.append(tab); }
    if (!boundRails.has(rail)) {
      boundRails.add(rail);
      // Any of the game's own tabs closes our section and gives the pane back untouched.
      rail.addEventListener("click", (e) => {
        if (disposed || e.target.closest?.("[data-gf-customizer-tab]")) return;
        nativeView = "";
        restorePane();
      }, { capture: true, signal: life.signal });
    }
    if (nativeView !== type) { if (active) restorePane(); return; }
    showPane(pane, type, rail, tab);
  }
  function scheduleMount() {
    if (disposed || scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; mountNative(); }, 120);
  }
  function ensureObserver() {
    if (disposed) return;
    const h = document.querySelector(HOST_TAG);
    const next = h?.shadowRoot || document.body;
    if (!next || (next === host && observer)) return;
    observer?.disconnect();
    host = next;
    observer = new MutationObserver((records) => {
      if (disposed) return;
      for (const r of records) {
        if (active && active.view.root.contains(r.target)) continue;
        return scheduleMount();
      }
    });
    observer.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-screen", "class", "style", "hidden"] });
    // While the game is not on the page yet, also watch the document so its arrival is noticed.
    if (host !== document.body && document.body) observer.observe(document.body, { childList: true });
  }

  function start() {
    if (disposed) return;
    ensureObserver();
    mountNative();
  }
  if (document.readyState === "loading") listen(document, "DOMContentLoaded", start);
  else start();
  listen(window, "hashchange", scheduleMount);
  listen(window, "popstate", scheduleMount);
  // Light safety net for a replaced game root; the observer does the real work.
  const interval = setInterval(() => {
    if (disposed) return;
    if (!host || !host.isConnected || (host === document.body && document.querySelector(HOST_TAG)?.shadowRoot)) {
      observer?.disconnect();
      observer = null;
      host = null;
      scheduleMount();
    }
  }, 5000);

  window[KEY] = () => {
    if (disposed) return;
    disposed = true;
    if (window.fetch === observedFetch) window.fetch = priorFetch;
    runListeners.clear();
    life.abort();
    clearInterval(interval);
    observer?.disconnect();
    restorePane();
    for (const r of gameRoots()) for (const t of r.querySelectorAll("[data-gf-customizer-tab]")) t.remove();
    for (const v of Object.values(views)) v.root.remove();
    if (window[KEY]) delete window[KEY];
  };
})();
