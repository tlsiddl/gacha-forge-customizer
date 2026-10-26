/* Gacha Forge · Customizer v0.6.1 — personal extension for Gacha Forge 1.8.12 on Marinara Engine 2.5.0.
 * Adds "커스터마이저" to the game's Settings rail and "Glimmer 교환" to its Shop rail, drawn with the game's own
 * classes (st-sect / st-plate, sh-cat / sh-card) so both look like part of the game. Landscape only, like the game.
 * Purchases happen only when the server switches them on; otherwise the shop is read-only. */
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
  const life = new AbortController();
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { ...opts, signal: life.signal });
  let disposed = false;

  /* ═════════════ Current world (run) ═════════════
   * Read from the game's own successful traffic, like the Quest extension, with three rules on top:
   *  - a run ID the game SENT (request body) or just switched to (/run, /run/activate) is "strong";
   *    /state's activeRun is only "weak": it is the server-wide last-activated world, which another device
   *    may have changed, so it never replaces a strong one;
   *  - ordering is by send time, so a slow older request cannot overwrite a newer one;
   *  - the game answers failures with HTTP 200 + {ok:false}; those, and delete/remove requests, are ignored.
   * This extension's own requests send their body as bytes, so neither observer reads them. */
  const RUN_ID_RE = /^[A-Za-z0-9:_-]{1,128}$/;
  const SKIP_RE = /(?:^|[/_-])(?:delete|remove|archive)(?:$|[/_-])/i;
  const SWITCH_RE = /^\/api\/gacha-forge\/run(?:\/activate)?$/;
  const run = { id: "", name: "", seq: 0, strong: false, manual: false };
  const runListeners = new Set();
  let sendSeq = 0;
  const cleanRunId = (v) => {
    const id = typeof v === "string" ? v.trim() : "";
    return RUN_ID_RE.test(id) ? id : "";
  };
  const nameOf = (x) => String(x?.name || x?.title || "").trim().slice(0, 100);
  function setRun(id, name, seq, { strong = false, manual = false } = {}) {
    id = cleanRunId(id);
    if (!id || disposed) return;
    if (seq < run.seq && run.id) return;
    if (!strong && run.strong && run.id && run.id !== id) return;
    const changed = run.id !== id;
    run.seq = Math.max(seq, run.seq);
    run.id = id;
    run.strong = strong || (!changed && run.strong);
    run.manual = manual;
    if (changed) run.name = "";
    if (name) run.name = name;
    for (const fn of runListeners) try { fn(changed); } catch {}
  }
  function forgetRun(id) {
    if (!id || run.id !== id) return;
    Object.assign(run, { id: "", name: "", strong: false, manual: false });
    for (const fn of runListeners) try { fn(true); } catch {}
  }
  function readReply(v, seq, requested, path) {
    if (!v || typeof v !== "object" || v.ok === false) return;
    if (requested) {
      const match = [v.run, v.activeRun].find((x) => x?.runId === requested) || (Array.isArray(v.runs) ? v.runs.find((x) => x?.runId === requested) : null);
      return setRun(requested, nameOf(match), seq, { strong: true });
    }
    if (SWITCH_RE.test(path) && v.run?.runId) return setRun(v.run.runId, nameOf(v.run), seq, { strong: true });
    const id = cleanRunId(v.activeRun?.runId) || cleanRunId(v.activeRunId);
    if (!id) return;
    const match = v.activeRun?.runId === id ? v.activeRun : Array.isArray(v.runs) ? v.runs.find((x) => x?.runId === id) : null;
    setRun(id, nameOf(match), seq, { strong: false });
  }
  const priorFetch = window.fetch;
  const observedFetch = function (input, init) {
    const result = priorFetch.apply(this, arguments);
    if (disposed) return result; // left under another wrapper after removal: pure pass-through
    try {
      const u = new URL(String(input && typeof input === "object" && "url" in input ? input.url : input), location.href);
      if (u.origin !== location.origin || !u.pathname.startsWith(API_BASE + "/")) return result;
      if (u.pathname.includes("/gf-customizer/") || SKIP_RE.test(u.pathname)) return result;
      let requested = "";
      if (typeof init?.body === "string") {
        try { requested = cleanRunId(JSON.parse(init.body)?.runId); } catch {}
      }
      const wantsBody = /\/(?:state|runs?|run\/activate)$/.test(u.pathname);
      if (!requested && !wantsBody) return result;
      const seq = ++sendSeq;
      if (result && typeof result.then === "function")
        result.then((response) => {
          if (disposed || !response?.ok) return;
          const type = response.headers?.get?.("content-type") || "";
          const size = Number(response.headers?.get?.("content-length") || 0);
          if (!type.includes("json") || size > 2 * 1024 * 1024) return requested && setRun(requested, "", seq, { strong: true });
          response.clone().json().then(
            (v) => readReply(v, seq, requested, u.pathname),
            () => requested && setRun(requested, "", seq, { strong: true }),
          );
        }, () => {});
    } catch {}
    return result;
  };
  window.fetch = observedFetch;

  /* ═════════════ Server ═════════════ */
  function headers(json) {
    const h = { "X-Marinara-CSRF": "1" };
    if (json) h["Content-Type"] = "application/json";
    try {
      const secret = window.localStorage.getItem("marinara_admin_secret")?.trim();
      if (secret) h["X-Admin-Secret"] = secret;
    } catch {}
    return h;
  }
  const ERRORS = {
    "exchange-disabled": "서버에서 교환이 꺼져 있습니다.",
    "insufficient-glimmer": "Glimmer가 부족합니다.",
    "max-facet": "이미 최대 패싯입니다.",
    "not-for-sale": "교환할 수 없는 캐릭터입니다.",
    "not-released": "아직 출시되지 않은 캐릭터입니다.",
    "cross-run-character": "다른 월드의 캐릭터입니다.",
    "write-conflict": "게임이 같은 순간에 저장 중이었습니다. 다시 눌러 주세요.",
    "request-id-reused": "요청이 꼬였습니다. 목록을 새로고침해 주세요.",
    "invalid-settings": "설정 값이 허용 범위를 벗어났습니다.",
    "settings-storage": "서버가 설정 파일을 저장하지 못했습니다. 서버 로그와 데이터 폴더의 쓰기 권한을 확인해 주세요.",
    unauthorized: "서버 패치가 이전 버전입니다. 서버 패치를 업데이트해 주세요.",
    "bad-request": "요청이 올바르지 않습니다.",
  };
  async function callApi(url, method, body) {
    // A temporarily unpatched backend instance can return 404 while others are ready.
    // Retry only reads: never replay settings updates or character purchases.
    const retryMissing = method === "GET" && url === SETTINGS_API;
    for (let attempt = 0; ; attempt++) {
      let response;
      try {
        response = await fetch(url, {
          method,
          credentials: "same-origin",
          headers: headers(!!body),
          cache: "no-store",
          // bytes, not a string: identical on the wire, invisible to other extensions' fetch observers
          body: body ? new TextEncoder().encode(JSON.stringify(body)) : undefined,
        });
      } catch {
        throw Object.assign(Error("서버에 연결하지 못했습니다."), { code: "network" });
      }
      if (response.status === 404 && retryMissing && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        continue;
      }
      let data = null;
      try { data = await response.json(); } catch {}
      if (response.status === 404) throw Object.assign(Error("설정 API가 반복해서 HTTP 404를 반환했습니다. 서버 패치 적용 상태와 API 라우팅을 확인해 주세요."), { code: "missing" });
      if (response.status === 401 || response.status === 403) throw Object.assign(Error("서버 권한 확인에 실패했습니다."), { code: "auth" });
      if (!response.ok || !data) throw Object.assign(Error("서버 오류가 발생했습니다 (HTTP " + response.status + ")."), { code: "http" });
      if (!data.ok) throw Object.assign(Error(ERRORS[data.error] || data.message || data.error || "서버 오류가 발생했습니다."), { code: data.error || "error", data });
      return data;
    }
  }
  function newRequestId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, "0")).join("");
  }

  /* ═════════════ Look ═════════════
   * Everything is drawn with the game's tokens (--f, --sp-*, --t-*, --ink*, --coral, --amber, --epic ...) and,
   * where the game already has the component, its own class. Fallbacks keep it readable if a token is missing. */
  const GLYPH_GLIMMER = '<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z"/><path d="M18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z"/></svg>';
  const GLYPH_PERSON = '<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.2-4 4.1-6 7.5-6s6.3 2 7.5 6"/></svg>';
  const GLYPH_CHECK = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4 10-11" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CSS = `
.gfc-view{display:flex;flex-direction:column;gap:var(--sp-2,10px);flex:1 1 auto;min-width:0;min-height:0}
.gfc-view[hidden],.gfc-view [hidden]{display:none!important}
.gfc-id{display:flex;align-items:center;gap:var(--sp-2,10px);flex-wrap:wrap}
.gfc-id>b{flex:none}
.gfc-sub{min-width:0;font-size:var(--t-tiny,11px);letter-spacing:.06em;color:var(--steel-faint,#7e93ae)}
.gfc-sub .gfc-world{color:var(--text,#e8ecf6);font-weight:600;letter-spacing:.02em}
.gfc-grow{flex:1 1 auto}
.gfc-seg{display:inline-flex;gap:calc(var(--f,10px)*.3)}
.gfc-seg button{cursor:pointer;font-family:var(--display,inherit);font-stretch:var(--stretch,normal);font-weight:700;font-size:var(--t-tiny,11px);
  letter-spacing:.08em;padding:calc(var(--f,10px)*.35) calc(var(--f,10px)*.8);background:var(--ink-3,#1e2a40);border:1px solid transparent;
  color:var(--steel-faint,#7e93ae);font-variant-numeric:tabular-nums;--cut:.35em;clip-path:var(--clip-chip,none);border-radius:var(--radius-sm,3px)}
.gfc-seg button:hover{color:var(--text,#e8ecf6)}
.gfc-seg button[aria-pressed="true"]{background:var(--coral,#f2643c);color:var(--on-coral,#fff)}
.gfc-seg button i{font-style:normal;opacity:.75;margin-left:.35em}
.gfc-tag{font-family:var(--display,inherit);font-weight:700;font-size:var(--t-tiny,11px);letter-spacing:.12em;padding:calc(var(--f,10px)*.2) calc(var(--f,10px)*.6);
  white-space:nowrap;--cut:.35em;clip-path:var(--clip-chip,none);border-radius:var(--radius-sm,3px);
  background:color-mix(in srgb,var(--amber,#e9b44c) 16%,transparent);color:var(--amber,#e9b44c)}
.gfc-tag.-live{background:color-mix(in srgb,var(--jade,#3cc9a0) 18%,transparent);color:var(--jade,#3cc9a0)}
.gfc-status{min-height:1.2em;font-size:var(--t-xs,12px);letter-spacing:.04em;color:var(--steel-faint,#7e93ae)}
.gfc-status:empty{display:none}
.gfc-status[data-tone="error"]{color:var(--alarm,#ff6b6b)}
.gfc-status[data-tone="ok"]{color:var(--jade,#3cc9a0)}
.gfc-shop .sh-grid-look{grid-template-columns:repeat(auto-fill,minmax(calc(var(--f,10px)*12.5),1fr))}
.gfc-shop .sh-look .sh-art-photo{position:relative;aspect-ratio:auto;height:calc(var(--f,10px)*14)}
.gfc-shop .sh-look .sh-photo{object-position:50% 18%}
.gfc-shop .sh-card.sh-look{border-top-color:var(--epic,#a77bff)}
.gfc-shop .sh-card.sh-look.gfc-r5{border-top-color:var(--amber,#e9b44c)}
.gfc-shop .sh-card.sh-look.gfc-max{opacity:.62}
.gfc-shop .gfc-r5 .sh-photo-none{background:radial-gradient(120% 80% at 50% 0%,color-mix(in srgb,var(--amber,#e9b44c) 30%,var(--ink-3,#26364E)) 0%,var(--ink,#141D2B) 70%);color:color-mix(in srgb,var(--amber,#e9b44c) 55%,var(--text,#C7D3E2))}
.gfc-shop .gfc-r4 .sh-photo-none{background:radial-gradient(120% 80% at 50% 0%,color-mix(in srgb,var(--epic,#a77bff) 26%,var(--ink-3,#26364E)) 0%,var(--ink,#141D2B) 72%);color:color-mix(in srgb,var(--epic,#a77bff) 50%,var(--text,#C7D3E2))}
.gfc-stars{position:absolute;top:calc(var(--f,10px)*.35);left:calc(var(--f,10px)*.45);z-index:1;font-size:var(--t-sm,13px);line-height:1;letter-spacing:.5px}
.gfc-r5 .gfc-stars{color:var(--amber,#e9b44c);text-shadow:0 0 6px color-mix(in srgb,var(--amber,#e9b44c) 60%,transparent)}
.gfc-r4 .gfc-stars{color:var(--epic,#a77bff);text-shadow:0 0 6px color-mix(in srgb,var(--epic,#a77bff) 55%,transparent)}
.gfc-badge{position:absolute;top:calc(var(--f,10px)*.3);right:calc(var(--f,10px)*.3);z-index:1;font-family:var(--display,inherit);font-weight:700;
  font-size:var(--t-tiny,11px);letter-spacing:.08em;padding:calc(var(--f,10px)*.12) calc(var(--f,10px)*.45);background:color-mix(in srgb,var(--ink,#0e1420) 78%,transparent);
  color:var(--text,#e8ecf6);border-radius:var(--radius-sm,3px)}
.gfc-badge.-new{background:var(--coral,#f2643c);color:var(--on-coral,#fff)}
.gfc-shop .sh-buy.gfc-arm{background:transparent;border-color:var(--coral,#f2643c);color:var(--coral,#f2643c);box-shadow:inset 0 0 0 1px var(--coral,#f2643c)}
.gfc-shop .sh-buy[disabled]{cursor:default}
.gfc-manual{display:flex;align-items:center;gap:var(--sp-1,5px);flex-wrap:wrap}
.gfc-manual input,.gfc-num input{background:var(--ink-3,#1e2a40);border:1px solid var(--steel-dark,#34435e);color:var(--text,#e8ecf6);font-family:var(--display,inherit);
  font-weight:700;font-size:var(--t-sm,13px);padding:calc(var(--f,10px)*.35) calc(var(--f,10px)*.5);--cut:.4em;clip-path:var(--clip-chip,none);border-radius:var(--radius-sm,3px)}
.gfc-manual input{flex:1 1 calc(var(--f,10px)*14);min-width:0;font-weight:500}
.gfc-manual input:focus,.gfc-num input:focus{outline:none;border-color:var(--coral,#f2643c)}
.gfc-empty{grid-column:1/-1}
.gfc-set .st-plate{flex:0 0 auto}
.gfc-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(calc(var(--f,10px)*17),1fr));gap:var(--sp-2,10px) var(--sp-3,16px)}
.gfc-field{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:calc(var(--f,10px)*.2) var(--sp-2,10px)}
.gfc-field .st-lbl,.gfc-toggle .st-lbl{grid-column:1;letter-spacing:.04em;font-size:var(--t-xs,12px);color:var(--text,#e8ecf6)}
.gfc-set .st-plate .hd .k{letter-spacing:.08em}
.gfc-set .st-done{letter-spacing:.03em}
.gfc-hint{grid-column:1;font-size:var(--t-tiny,11px);letter-spacing:.04em;color:var(--steel-faint,#7e93ae)}
.gfc-num{grid-column:2;grid-row:1/span 2;display:inline-flex;align-items:center;gap:calc(var(--f,10px)*.3)}
.gfc-num input{width:calc(var(--f,10px)*6.4);text-align:right;font-variant-numeric:tabular-nums;-moz-appearance:textfield}
.gfc-num input::-webkit-inner-spin-button,.gfc-num input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.gfc-num input[aria-invalid="true"]{border-color:var(--alarm,#ff6b6b)}
.gfc-num .st-k{font-size:var(--t-xs,12px)}
.gfc-toggle{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-2,10px)}
.gfc-foot{display:flex;align-items:center;gap:var(--sp-2,10px);flex:none}
.gfc-foot .gfc-status{flex:1 1 auto;min-width:0}
.gfc-foot .gfc-status:empty{display:block}
.gfc-foot .st-compress.-go:not([disabled]){background:var(--coral,#f2643c);color:var(--on-coral,#fff)}
`;

  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v; // only ever our own constant SVG strings
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false && kid !== "") n.append(kid);
    return n;
  };
  const fmt = (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString("ko-KR");
  function setStatus(n, text, tone = "") {
    n.textContent = text || "";
    if (tone) n.dataset.tone = tone;
    else delete n.dataset.tone;
  }
  function viewRoot(kind) {
    const root = h("div", { class: "gfc-view gfc-" + kind, "data-gfc-view": kind, "data-gfc-instance": INSTANCE });
    root.append(h("style", { text: CSS }));
    return root;
  }

  /* ═════════════ Settings → "커스터마이저" ═════════════ */
  const FIELDS = {
    characterPity: { label: "캐릭터 5성 천장", unit: "회", min: 1, max: 100, hint: (v) => "소프트 천장 " + Math.max(1, v - 6) + "회부터 · 기본 80" },
    weaponPity: { label: "무기 5성 천장", unit: "회", min: 1, max: 100, hint: (v) => "소프트 천장 " + Math.max(1, v - 6) + "회부터 · 기본 80" },
    bannerDays: { label: "픽업 배너 기간", unit: "일", min: 1, max: 30, hint: () => "새로 열리는 배너부터 · 기본 14" },
    fullFacetGlimmer4: { label: "4성 풀 패싯 중복", unit: "G", min: 0, max: 100000, hint: (v) => (v ? "중복 1회당 " + fmt(v) + " Glimmer" : "0 = 게임 기본 보상") },
    fullFacetGlimmer5: { label: "5성 풀 패싯 중복", unit: "G", min: 0, max: 100000, hint: (v) => (v ? "중복 1회당 " + fmt(v) + " Glimmer" : "0 = 게임 기본 보상") },
  };
  function createSettingsView() {
    const root = viewRoot("set");
    const inputs = {}, hints = {};
    const field = (id) => {
      const f = FIELDS[id];
      const input = h("input", { type: "number", inputmode: "numeric", min: f.min, max: f.max, step: 1, "aria-label": f.label });
      const hint = h("span", { class: "gfc-hint" });
      inputs[id] = input;
      hints[id] = hint;
      return h("label", { class: "gfc-field" }, h("span", { class: "st-lbl", text: f.label }), hint, h("span", { class: "gfc-num" }, input, h("span", { class: "st-k", text: f.unit })));
    };
    const plate = (title, kicker, ...kids) => h("div", { class: "st-plate" }, h("div", { class: "hd" }, h("h3", { text: title }), h("span", { class: "k", text: kicker })), ...kids);
    const guarantee = {
      off: h("button", { class: "st-chip", type: "button", "aria-pressed": "true", text: "끄기" }),
      on: h("button", { class: "st-chip", type: "button", "aria-pressed": "false", text: "켜기" }),
    };
    const status = h("div", { class: "gfc-status", role: "status" });
    const revert = h("button", { class: "st-compress -ghost", type: "button", text: "되돌리기" });
    const save = h("button", { class: "st-compress -go", type: "button", text: "서버에 적용" });
    root.append(
      plate("천장", "서버 공통 · 모든 월드", h("div", { class: "gfc-fields" }, field("characterPity"), field("weaponPity"))),
      plate("픽업 배너", "서버 공통",
        h("div", { class: "gfc-fields" }, field("bannerDays"),
          h("div", { class: "gfc-toggle" },
            h("div", {}, h("div", { class: "st-lbl", text: "픽업 5성 확정" }), h("div", { class: "gfc-hint", text: "5성이 나오면 항상 픽업 캐릭터" })),
            h("div", { class: "st-chips", role: "group", "aria-label": "픽업 5성 확정" }, guarantee.off, guarantee.on)))),
      plate("풀 패싯 중복 보상", "Glimmer", h("div", { class: "gfc-fields" }, field("fullFacetGlimmer4"), field("fullFacetGlimmer5"))),
      h("div", { class: "gfc-foot" }, status, revert, save),
    );
    let server = null, busy = false;
    const current = () => {
      const next = {};
      for (const id of Object.keys(FIELDS)) next[id] = inputs[id].value === "" ? NaN : Number(inputs[id].value);
      next.featuredGuarantee = guarantee.on.getAttribute("aria-pressed") === "true";
      return next;
    };
    const isDirty = () => { const next = current(); return !!server && Object.keys(next).some((k) => next[k] !== server[k]); };
    function refresh() {
      const next = current();
      let invalid = false;
      for (const [id, f] of Object.entries(FIELDS)) {
        const v = next[id], bad = !Number.isInteger(v) || v < f.min || v > f.max;
        inputs[id].setAttribute("aria-invalid", bad && server ? "true" : "false");
        hints[id].textContent = !server ? "" : bad ? f.min + "~" + f.max + " 사이로 입력해 주세요" : f.hint(v);
        invalid = invalid || bad;
      }
      const dirty = isDirty();
      save.disabled = busy || invalid || !dirty;
      revert.disabled = busy || !dirty;
    }
    function fill(settings) {
      server = { ...settings };
      for (const id of Object.keys(FIELDS)) inputs[id].value = settings[id];
      setGuarantee(!!settings.featuredGuarantee);
    }
    function setGuarantee(v) {
      guarantee.on.setAttribute("aria-pressed", String(v));
      guarantee.off.setAttribute("aria-pressed", String(!v));
      refresh();
    }
    guarantee.on.onclick = () => setGuarantee(true);
    guarantee.off.onclick = () => setGuarantee(false);
    for (const input of Object.values(inputs)) input.addEventListener("input", () => { setStatus(status, ""); refresh(); });
    revert.onclick = () => { if (server) fill(server); setStatus(status, ""); };
    async function load() {
      if (busy) return;
      busy = true;
      refresh();
      setStatus(status, "서버 설정을 불러오는 중입니다…");
      try {
        fill((await callApi(SETTINGS_API, "GET")).settings);
        setStatus(status, "");
      } catch (e) {
        setStatus(status, "설정을 불러오지 못했습니다. " + e.message, "error");
      } finally { busy = false; refresh(); }
    }
    save.onclick = async () => {
      if (busy || save.disabled) return;
      busy = true;
      refresh();
      setStatus(status, "저장하는 중입니다…");
      try {
        fill((await callApi(SETTINGS_API, "POST", { settings: current() })).settings);
        status.replaceChildren(h("span", { class: "st-done", html: GLYPH_CHECK }, "저장했습니다. 다음 뽑기부터 적용됩니다."));
        delete status.dataset.tone;
      } catch (e) {
        setStatus(status, "저장하지 못했습니다. " + e.message, "error");
      } finally { busy = false; refresh(); }
    };
    refresh();
    return {
      root,
      title: "커스터마이저",
      opened() { if (!server || !isDirty()) load(); }, // never throw away unsaved edits
    };
  }

  /* ═════════════ Shop → "Glimmer 교환" ═════════════ */
  function createShopView() {
    const root = viewRoot("shop");
    const sub = h("span", { class: "gfc-sub" });
    const tag = h("span", { class: "gfc-tag", hidden: true });
    const seg = h("div", { class: "gfc-seg", role: "group", "aria-label": "필터" });
    const FILTERS = [["all", "전체"], ["r5", "★5"], ["r4", "★4"], ["new", "미보유"]];
    const segButtons = {};
    let filter = "all";
    for (const [id, label] of FILTERS) {
      const b = h("button", { type: "button", "aria-pressed": String(id === "all") }, label, h("i"));
      b.onclick = () => { filter = id; paint(); };
      segButtons[id] = b;
      seg.append(b);
    }
    const head = h("div", { class: "sh-pane-id gfc-id" }, h("b", { text: "Glimmer 교환" }), sub, h("span", { class: "gfc-grow" }), tag, seg);
    const runInput = h("input", { type: "text", placeholder: "Run ID", autocomplete: "off", spellcheck: "false", "aria-label": "Run ID" });
    const runGo = h("button", { class: "sh-buy", type: "button", text: "조회" });
    const manual = h("div", { class: "gfc-manual", hidden: true }, h("span", { class: "gfc-sub", text: "월드를 아직 확인하지 못했습니다. 게임에서 월드를 열거나 Run ID를 입력해 주세요." }), runInput, runGo);
    const grid = h("div", { class: "sh-grid sh-grid-look" });
    const status = h("div", { class: "gfc-status", role: "status" });
    root.append(head, manual, grid, status);

    let data = null, busy = false, queued = false, shown = false, loadedFor = "", token = 0;
    let pending = null, armed = null, buying = false, tabCount = () => {};
    const empty = (title, text) => h("div", { class: "sh-empty gfc-empty" }, h("b", { text: title }), text ? h("span", { text }) : null);
    function header() {
      const world = (data && loadedFor === run.id && data.run?.name) || run.name;
      sub.replaceChildren();
      if (run.id) sub.append(h("span", { class: "gfc-world", text: world || "ID " + run.id.slice(0, 12) }), run.manual ? " (직접 입력)" : "", " · ");
      sub.append("4성 100 · 5성 300부터, 교환할 때마다 +20");
      manual.hidden = !!run.id && !run.manual;
      if (data && loadedFor === run.id) {
        tag.hidden = false;
        tag.className = "gfc-tag" + (data.exchangeEnabled ? " -live" : "");
        tag.textContent = data.exchangeEnabled ? "교환 가능" : "구매 꺼짐 · 목록만 표시";
      } else tag.hidden = true;
    }
    function card(ch, glimmer) {
      const rarity = Number(ch.rarity) === 5 ? 5 : 4;
      const price = Number(ch.price) || 0;
      const facet = Number(ch.facet) || 0, max = Number(ch.maxFacet) || 6;
      const portrait = typeof ch.portrait === "string" && /^(\/(?!\/)|https:\/\/)/.test(ch.portrait) ? ch.portrait : "";
      const art = h("span", { class: "sh-art sh-art-photo" },
        portrait ? h("img", { class: "sh-photo", src: portrait, alt: "", loading: "lazy", decoding: "async" }) : h("span", { class: "sh-photo-none", html: GLYPH_PERSON }),
        h("span", { class: "gfc-stars", text: "★".repeat(rarity) }),
        ch.owned ? h("span", { class: "gfc-badge", text: "F" + facet + "/" + max }) : h("span", { class: "gfc-badge -new", text: "NEW" }));
      const meta = [ch.owned ? "보유 · 패싯 " + facet + "/" + max : "미보유"];
      if (ch.exchangeCount) meta.push("교환 " + ch.exchangeCount + "회");
      let action;
      if (ch.maxed) action = h("span", { class: "sh-owned", text: "최대 패싯" });
      else {
        const can = data.exchangeEnabled && glimmer >= price && !buying;
        action = h("button", { class: "sh-buy", type: "button", disabled: !can, title: data.exchangeEnabled ? (glimmer < price ? "Glimmer가 부족합니다" : "") : "서버에서 교환이 꺼져 있습니다", html: GLYPH_GLIMMER }, h("b", { text: fmt(price) }));
        action.onclick = () => buy(ch, price, action);
      }
      return h("div", { class: "sh-card sh-look gfc-r" + rarity + (ch.maxed ? " gfc-max" : ""), "data-gfc-unit": ch.id },
        art, h("b", { class: "sh-name", text: ch.name || ch.id }), h("span", { class: "sh-what", text: meta.join(" · ") }), action);
    }
    function paint() {
      header();
      for (const [id, b] of Object.entries(segButtons)) b.setAttribute("aria-pressed", String(id === filter));
      if (!data || loadedFor !== run.id) {
        for (const b of Object.values(segButtons)) b.lastChild.textContent = "";
        return;
      }
      const all = (Array.isArray(data.characters) ? data.characters : []).slice().sort((a, b) =>
        (Number(b.rarity) || 0) - (Number(a.rarity) || 0) || (a.owned === b.owned ? 0 : a.owned ? 1 : -1) || String(a.name || "").localeCompare(String(b.name || ""), "ko"));
      const pick = { all: () => true, r5: (c) => Number(c.rarity) === 5, r4: (c) => Number(c.rarity) === 4, new: (c) => !c.owned };
      for (const [id, b] of Object.entries(segButtons)) b.lastChild.textContent = String(all.filter(pick[id]).length);
      const list = all.filter(pick[filter]);
      const glimmer = Math.max(0, Number(data.glimmer) || 0);
      grid.replaceChildren(...(list.length ? list.map((c) => card(c, glimmer)) :
        [all.length ? empty("해당하는 캐릭터가 없습니다", "다른 필터를 눌러 주세요.") : empty("교환할 수 있는 캐릭터가 없습니다", "출시된 4성·5성 캐릭터가 이곳에 표시됩니다.")]));
      tabCount(all.length);
    }
    async function load() {
      if (!shown) return;
      if (busy) { queued = true; return; }
      const rid = run.id;
      if (!rid) {
        data = null; loadedFor = "";
        grid.replaceChildren(empty("월드를 확인하는 중입니다", "게임에서 월드를 한 번 열면 자동으로 인식합니다."));
        setStatus(status, "");
        return paint();
      }
      busy = true;
      const mine = ++token;
      if (loadedFor !== rid) { data = null; grid.replaceChildren(empty("불러오는 중입니다", "")); }
      paint();
      try {
        const payload = await callApi(CATALOG_API, "POST", { runId: rid });
        if (mine !== token || rid !== run.id || disposed) return;
        data = payload;
        loadedFor = rid;
        if (payload.run?.name && !run.name) run.name = payload.run.name;
        paint();
      } catch (e) {
        if (mine !== token || rid !== run.id || disposed) return;
        data = null; loadedFor = "";
        if (e.code === "bad-request") {
          forgetRun(rid);
          grid.replaceChildren(empty("이 월드를 서버에서 찾지 못했습니다", "게임에서 월드를 다시 열어 주세요."));
        } else grid.replaceChildren(empty("목록을 불러오지 못했습니다", e.message));
        paint();
      } finally {
        busy = false;
        if (queued) { queued = false; if (shown && run.id !== loadedFor) load(); }
      }
    }
    function disarm() {
      if (!armed) return;
      clearTimeout(armed.timer);
      if (armed.button.isConnected) { armed.button.classList.remove("gfc-arm"); armed.button.lastChild.textContent = fmt(armed.price); }
      armed = null;
    }
    async function buy(ch, price, button) {
      if (busy || buying || button.disabled || !data?.exchangeEnabled) return;
      // Two taps: the first arms the button, the second within 4 s buys. No browser dialog.
      if (!armed || armed.id !== ch.id) {
        disarm();
        armed = { id: ch.id, button, price, timer: setTimeout(() => { disarm(); setStatus(status, ""); }, 4000) };
        button.classList.add("gfc-arm");
        button.lastChild.textContent = "한 번 더 · " + fmt(price);
        setStatus(status, (ch.name || "캐릭터") + ": 한 번 더 누르면 " + fmt(price) + " Glimmer로 교환합니다.");
        return;
      }
      disarm();
      const rid = run.id;
      if (!rid || rid !== loadedFor) return setStatus(status, "월드가 바뀌었습니다. 다시 시도해 주세요.", "error");
      const key = rid + "|" + ch.id;
      if (!pending || pending.key !== key) pending = { key, requestId: newRequestId() };
      buying = true;
      for (const b of grid.querySelectorAll(".sh-buy")) b.disabled = true;
      setStatus(status, (ch.name || "캐릭터") + " 교환 중입니다…");
      let done = null;
      try {
        done = await callApi(EXCHANGE_API, "POST", { runId: rid, characterId: ch.id, requestId: pending.requestId });
        pending = null;
      } catch (e) {
        // Same request ID only when the result is unknown or the save collided: a retry can never charge twice.
        if (!["write-conflict", "network", "http"].includes(e.code)) pending = null;
        setStatus(status, e.message, "error");
      } finally { buying = false; }
      if (done) {
        const g = done.wallet && Number.isFinite(Number(done.wallet.glimmer)) ? Number(done.wallet.glimmer) : null;
        if (g !== null) mirrorBalance(g);
        loadedFor = "";
        await load();
        setStatus(status, (ch.name || "캐릭터") + " " + (done.isNew ? "획득!" : "패싯 " + (done.facet?.facet ?? "") + " 달성!") + (g !== null ? " 남은 Glimmer " + fmt(g) : ""), "ok");
      } else paint();
    }
    // Keep the game's own balance line honest until its next refresh.
    function mirrorBalance(g) {
      const bal = root.getRootNode().querySelector?.(".sh-top .sh-bal");
      if (bal && /glimmer/i.test(bal.textContent || "")) { const b = bal.querySelector("b"); if (b) b.textContent = g.toLocaleString("en-US"); }
    }
    const manualGo = () => {
      const id = cleanRunId(runInput.value);
      if (!id) return setStatus(status, "Run ID 형식을 확인해 주세요.", "error");
      setRun(id, "", sendSeq, { strong: true, manual: true });
      loadedFor = "";
      load();
    };
    runGo.onclick = manualGo;
    runInput.addEventListener("keydown", (e) => { if (e.key === "Enter") manualGo(); });
    runListeners.add((changed) => {
      if (!changed) return header();
      pending = null;
      disarm();
      if (shown) load();
      else { data = null; loadedFor = ""; }
    });
    return {
      root,
      title: "Glimmer 교환",
      setTabCounter(fn) { tabCount = fn; },
      opened() { shown = true; setStatus(status, ""); load(); }, // one catalog request per opening
      closed() { shown = false; disarm(); },
      reattached() { shown = true; paint(); },
    };
  }

  /* ═════════════ Mounting into the game's rails ═════════════ */
  const views = { settings: createSettingsView(), shop: createShopView() };
  const SCREENS = {
    settings: { rail: ".st-rail", pane: ".st-pane", selected: (n) => n.getAttribute("aria-selected") === "true", select: (n, v) => n.setAttribute("aria-selected", String(v)) },
    shop: { rail: ".sh-rail", pane: ".sh-pane", selected: (n) => n.classList.contains("on"), select: (n, v) => n.classList.toggle("on", v) },
  };
  let nativeView = "", lastScreen = "", active = null, scheduled = false, host = null, observer = null;
  let hidden = [], deselected = [], titleSwap = null;
  const boundRails = new WeakSet();

  function gameRoots() {
    const roots = [];
    for (const el of document.querySelectorAll(HOST_TAG)) if (el.shadowRoot) roots.push(el.shadowRoot);
    roots.push(document);
    return roots;
  }
  function findScreen() {
    for (const r of gameRoots())
      for (const s of r.querySelectorAll('[data-screen="settings"],[data-screen="shop"]'))
        if (s.isConnected && s.getClientRects().length) return s;
    return null;
  }
  function makeTab(type) {
    const t = type === "settings"
      ? h("button", { class: "st-sect", type: "button", role: "tab", "aria-selected": "false" }, h("span", { class: "k", text: "Gacha" }), h("span", { class: "n", text: "커스터마이저" }))
      : h("button", { class: "sh-cat", type: "button" }, h("span", { class: "sh-cat-nm", text: "Glimmer 교환" }), h("span", { class: "sh-cat-n", text: "캐릭터" }));
    t.setAttribute("data-gf-customizer-tab", INSTANCE);
    on(t, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (disposed || nativeView === type) return;
      nativeView = type;
      mountNative(true);
    });
    return t;
  }
  views.shop.setTabCounter((n) => {
    for (const r of gameRoots()) for (const t of r.querySelectorAll('.sh-cat[data-gf-customizer-tab="' + INSTANCE + '"] .sh-cat-n')) t.textContent = n + "명";
  });
  function restorePane(closing = true) {
    for (const [n, value, priority] of hidden) if (n.isConnected) n.style.setProperty("display", value, priority);
    hidden = [];
    for (const [n, select] of deselected) if (n.isConnected) select(n, true);
    deselected = [];
    if (titleSwap && titleSwap.el.isConnected) titleSwap.el.textContent = titleSwap.text;
    titleSwap = null;
    if (active) {
      active.view.root.remove();
      if (active.tab.isConnected) SCREENS[active.type].select(active.tab, false);
      if (closing) active.view.closed?.();
    }
    active = null;
  }
  function showPane(screen, pane, type, rail, tab, fresh) {
    const view = views[type], spec = SCREENS[type];
    const same = active && active.pane === pane && active.view === view && view.root.parentNode === pane;
    if (!same) {
      const keepOpen = !fresh && active && active.type === type; // the game redrew its screen; follow quietly
      restorePane(!keepOpen);
      for (const n of Array.from(pane.children)) {
        if (n === view.root) continue;
        hidden.push([n, n.style.getPropertyValue("display"), n.style.getPropertyPriority("display")]);
        n.style.setProperty("display", "none", "important");
      }
      pane.append(view.root);
      active = { pane, view, tab, type };
      if (keepOpen) view.reattached?.();
      else view.opened();
    }
    // The game re-marks its own tab on every redraw; keep ours as the selected one.
    for (const n of rail.children) {
      if (n === tab || !spec.selected(n)) continue;
      spec.select(n, false);
      if (!deselected.some(([x]) => x === n)) deselected.push([n, spec.select]);
    }
    spec.select(tab, true);
    // Settings shows the open section's name as its heading; the shop's heading is just "Shop" and stays.
    const h2 = type === "settings" ? (screen.querySelector(".head-id h2") || screen.getRootNode().querySelector?.(".head-id h2")) : null;
    if (h2 && h2.textContent !== view.title) {
      if (!titleSwap || titleSwap.el !== h2) titleSwap = { el: h2, text: h2.textContent };
      h2.textContent = view.title;
    }
  }
  function mountNative(fresh = false) {
    if (disposed) return;
    ensureObserver();
    const screen = findScreen();
    if (!screen) { restorePane(); nativeView = ""; lastScreen = ""; return; }
    const type = screen.getAttribute("data-screen");
    if (type !== lastScreen) { restorePane(); nativeView = ""; lastScreen = type; }
    const spec = SCREENS[type];
    const rail = screen.querySelector(spec.rail), pane = screen.querySelector(spec.pane);
    if (!rail || !pane) return;
    for (const stale of rail.querySelectorAll("[data-gf-customizer-tab]"))
      if (stale.getAttribute("data-gf-customizer-tab") !== INSTANCE) stale.remove(); // left by an older install
    let tab = rail.querySelector('[data-gf-customizer-tab="' + INSTANCE + '"]');
    if (!tab) { tab = makeTab(type); rail.append(tab); }
    if (!boundRails.has(rail)) {
      boundRails.add(rail);
      // Any of the game's own tabs closes our section and hands the pane back untouched.
      on(rail, "click", (e) => {
        if (disposed || e.target.closest?.("[data-gf-customizer-tab]")) return;
        if (nativeView) { nativeView = ""; restorePane(); }
      }, { capture: true });
    }
    if (nativeView !== type) { if (active) restorePane(); return; }
    showPane(screen, pane, type, rail, tab, fresh);
  }
  function scheduleMount() {
    if (disposed || scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; mountNative(); }, 80);
  }
  function ensureObserver() {
    if (disposed) return;
    const el = document.querySelector(HOST_TAG);
    const next = el?.shadowRoot || document.body;
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
    observer.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-screen", "style", "hidden"] });
    if (host !== document.body && document.body) observer.observe(document.body, { childList: true });
  }
  function start() { if (!disposed) { ensureObserver(); mountNative(); } }
  if (document.readyState === "loading") on(document, "DOMContentLoaded", start, { once: true });
  else start();
  on(window, "hashchange", scheduleMount);
  on(window, "popstate", scheduleMount);
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
