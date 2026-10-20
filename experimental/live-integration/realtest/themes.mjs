// Screenshot the customizer's shop and settings sections in each of Gacha Forge's five HUD styles,
// next to the game's own Key Items shelf, using the REAL client and server.
import fs from "node:fs";
import { chromium } from "playwright-core";
import { createStore, activateServer, serve, PKG_DIR, call } from "./host.mjs";
import { seedWorld, sampleUnits } from "./seed.mjs";
const [CUST_PATH, OUT = "theme"] = process.argv.slice(2);
process.env.GF_CUSTOMIZER_CONFIG_FILE = new URL("./settings-theme.json", import.meta.url).pathname;
process.env.GF_CUSTOMIZER_ENABLE_EXCHANGE = "1";
const svg = (hue, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect width="200" height="300" fill="hsl(${hue},45%,30%)"/><circle cx="100" cy="112" r="46" fill="hsl(${hue},30%,82%)"/><path d="M28 300c6-70 38-110 72-110s66 40 72 110z" fill="hsl(${hue},35%,70%)"/></svg>`;
const files = {};
const units = sampleUnits.map((u, i) => { if (u.kind === "weapon" || u.rarity < 4 || i % 3 === 2) return u; files[`/img/${u.key}.svg`] = ["image/svg+xml", svg((i * 47) % 360)]; return { ...u, portrait: `/img/${u.key}.svg` }; });
const store = createStore();
const { routes } = await activateServer(process.env.GF_SERVER || "server-patched.mjs", store);
const runId = await seedWorld(routes, store, { name: "서울 각성자 월드", glimmer: 2400, units, roster: { c1: { level: 20, bondFights: 0, facet: 1 }, c4: { level: 1, bondFights: 0, facet: 6 } } });
const CLIENT = fs.readFileSync(PKG_DIR + "/client.js", "utf8");
Object.assign(files, {
  "/": ["text/html; charset=utf-8", `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%;background:#000}marinara-capability-gacha-forge{position:fixed;inset:0;display:block}</style><marinara-capability-gacha-forge></marinara-capability-gacha-forge><script src="/c.js"></script><script src="/client.js"></script>`],
  "/client.js": ["text/javascript; charset=utf-8", CLIENT],
  "/c.js": ["text/javascript; charset=utf-8", () => fs.readFileSync(CUST_PATH, "utf8")],
});
const server = await serve({ routes, files });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const root = (page, fn, arg) => page.evaluate(fn, arg);
for (const style of ["vanguard", "aurora", "bloom", "signal", "ember"]) {
  const r = await call(routes, "POST", "/run/style", { runId, hudStyle: style });
  if (!r.json?.ok) throw new Error("style " + style + " " + JSON.stringify(r.json));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForTimeout(1200);
  const press = async (label) => { await root(page, (label) => { const r = document.querySelector("marinara-capability-gacha-forge").shadowRoot; const b = [...r.querySelectorAll("button")].filter((x) => x.getClientRects().length).reverse().find((x) => x.textContent.trim().toLowerCase().startsWith(label.toLowerCase()) || x.getAttribute("aria-label") === label); b && b.click(); }, label); await page.waitForTimeout(600); };
  for (const l of ["Claim", "Begin", "Shop", "Close"]) await press(l);
  const actual = await root(page, () => document.querySelector("marinara-capability-gacha-forge").shadowRoot.querySelector(".gf-arena")?.getAttribute("data-style"));
  await page.screenshot({ path: `${OUT}-${style}-native.png` });
  await root(page, () => document.querySelector("marinara-capability-gacha-forge").shadowRoot.querySelector("[data-gf-customizer-tab]").click());
  await page.waitForTimeout(800);
  await root(page, () => document.querySelector("marinara-capability-gacha-forge").shadowRoot.querySelector(".gfc-shop .sh-card .sh-buy:not([disabled])")?.click());
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}-${style}-shop.png` });
  await press("◀ Home"); await press("Game settings");
  await root(page, () => document.querySelector("marinara-capability-gacha-forge").shadowRoot.querySelector("[data-gf-customizer-tab]")?.click());
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}-${style}-settings.png` });
  console.log(style, "applied:", actual);
  await ctx.close();
}
await browser.close(); server.close(); process.exit(0);
