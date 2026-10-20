// Minimal Marinara capability host for running the REAL Gacha Forge 1.8.12 server module (original or patched)
// with an in-memory document store that mirrors Marinara 2.5.0's revision semantics (one transaction at a time,
// update succeeds only when expectedRevision matches). Also serves the REAL client.js for browser tests.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

export const PKG_DIR = process.env.GF_PKG_DIR || "Marinara-Agents/packages/gacha-forge";
const ASSET_DIR = PKG_DIR;
export function createStore() {
  const docs = new Map(); // key pkg|id -> {id, packageId, kind, name, description, data(JSON string), revision, createdAt, updatedAt}
  let queue = Promise.resolve();
  const tx = (fn) => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };
  const out = (d) => d && { ...d, data: JSON.parse(d.data) };
  const k = (p, id) => p + "|" + id;
  const store = {
    docs,
    async getById(p, id) { return out(docs.get(k(p, id))) || null; },
    async list(p, kind) { return [...docs.values()].filter((d) => d.packageId === p && d.kind === kind).map(out); },
    create(input) {
      return tx(() => {
        if (docs.has(k(input.packageId, input.id))) throw Object.assign(new Error("unique"), { code: "UNIQUE" });
        const d = { ...input, data: JSON.stringify(input.data), revision: 1 };
        docs.set(k(input.packageId, input.id), d);
        return out(d);
      });
    },
    update(input) {
      return tx(() => {
        const cur = docs.get(k(input.packageId, input.id));
        if (!cur || cur.revision !== input.expectedRevision) return null;
        const next = { ...cur, name: input.name, description: input.description, data: JSON.stringify(input.data), revision: cur.revision + 1, updatedAt: input.updatedAt };
        docs.set(k(input.packageId, input.id), next);
        return out(next);
      });
    },
    remove(p, id, rev) {
      return tx(() => {
        const cur = docs.get(k(p, id));
        if (!cur || cur.revision !== rev) return false;
        docs.delete(k(p, id));
        return true;
      });
    },
  };
  return store;
}

const stub = (label, log) =>
  new Proxy(function () {}, {
    get: (_, prop) => (prop === "then" ? undefined : stub(label + "." + String(prop), log)),
    apply: () => { log.push(label); return Promise.reject(new Error("host stub: " + label)); },
  });

export async function activateServer(serverFile, store, { quiet = true } = {}) {
  const mod = await import(path.resolve(serverFile) + "?v=" + Date.now() + Math.random());
  const routes = {};
  const stubCalls = [];
  const logger = {
    debug() {}, info: (...a) => !quiet && console.log("[info]", ...a), warn: (...a) => !quiet && console.log("[warn]", ...a),
    error: (...a) => !quiet && console.log("[error]", ...a), debugOverride() {},
  };
  const runtime = new Proxy({ persistence: { documents: store }, logger, isDebugAgentsEnabled: () => false, json: { parseJsonish: (s) => JSON.parse(s) } }, {
    get: (t, p) => (p in t ? t[p] : stub("runtime." + String(p), stubCalls)),
  });
  const router = {};
  for (const m of ["get", "post", "put", "patch", "delete"]) router[m] = (p, ...rest) => { routes[m.toUpperCase() + " " + p] = rest[rest.length - 1]; return router; };
  router.addContentTypeParser = () => router;
  const api = new Proxy({
    runtime,
    async registerPrivilegedRoutes(fn) { await fn(router, {}); return () => {}; },
  }, { get: (t, p) => (p in t ? t[p] : () => () => {}) });
  const manifest = JSON.parse(fs.readFileSync(path.join(PKG_DIR, "manifest.json"), "utf8"));
  await mod.activate({ app: {}, dataDir: "/tmp", package: { id: "gacha-forge", version: "1.8.12", manifest }, api });
  return { routes, stubCalls };
}

export async function call(routes, method, p, body) {
  const h = routes[method + " " + p];
  if (!h) return { status: 404, json: { error: "not found" } };
  const reply = { code() { return reply; }, status() { return reply; }, header() { return reply; }, type() { return reply; }, send(v) { return v; } };
  const res = await h({ body: body || {}, query: {}, headers: {}, params: {} }, reply);
  return { status: 200, json: res };
}

// HTTP front for the browser: serves page, real client.js, extensions, and the package API.
export function serve({ routes, files, port = 0, onApi }) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (req.method === "GET" && files[u.pathname]) {
      const [type, body] = files[u.pathname];
      res.writeHead(200, { "content-type": type });
      return res.end(typeof body === "function" ? body() : body);
    }
    let raw = "";
    for await (const c of req) raw += c;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    if (u.pathname.startsWith("/api/gacha-forge/")) {
      const sub = u.pathname.slice("/api/gacha-forge".length);
      onApi && onApi(req.method, sub, body, req.headers);
      try {
        const r = await call(routes, req.method, sub, body);
        res.writeHead(r.status, { "content-type": "application/json" });
        return res.end(JSON.stringify(r.json ?? null));
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: String(e && e.message) }));
      }
    }
    if (u.pathname.startsWith("/api/capability-packages/gacha-forge/assets/")) {
      const f = path.join(ASSET_DIR, path.basename(u.pathname));
      if (fs.existsSync(f)) { res.writeHead(200, { "content-type": f.endsWith(".webp") ? "image/webp" : f.endsWith(".png") ? "image/png" : "application/octet-stream" }); return res.end(fs.readFileSync(f)); }
      res.writeHead(404); return res.end();
    }
    if (u.pathname.startsWith("/api/")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(u.pathname.includes("list") || u.pathname.includes("connections") || u.pathname.includes("catalog") ? "[]" : "{}");
    }
    res.writeHead(404); res.end();
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}
