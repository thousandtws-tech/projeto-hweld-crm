/* Screenshot autenticado das rotas — uso pontual de QA visual. */
const { chromium } = require("playwright-core");
const fs = require("fs");

const BASE = process.env.SHOT_BASE || "http://painel-admin.projeto-hweld-crm.kiri.local";
const OUT = process.env.SHOT_OUT || "C:/Users/Vinicius Moreira/AppData/Local/Temp";
const token = fs.readFileSync(process.env.SHOT_TOKEN || "C:/msys64/tmp/tok.txt", "utf8").trim();
const refresh = process.env.SHOT_REFRESH
  ? fs.readFileSync(process.env.SHOT_REFRESH, "utf8").trim()
  : "dummy-refresh";

const rotas = (process.env.SHOT_ROTAS || "/catalogo/produtos/novo:novo,/catalogo/categorias:categorias")
  .split(",")
  .map((r) => r.split(":"));

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  await page.addInitScript(
    ({ access, ref }) => {
      sessionStorage.setItem("hw_staff_access", access);
      sessionStorage.setItem("hw_staff_refresh", ref);
      sessionStorage.setItem("hw_access", access);
      sessionStorage.setItem("hw_refresh", ref);
    },
    { access: token, ref: refresh },
  );

  for (const [rota, nome] of rotas) {
    await page.goto(BASE + rota, { waitUntil: "networkidle", timeout: 30000 }).catch((e) => {
      console.log("[goto falhou]", rota, String(e).slice(0, 150));
    });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/shot-${nome}.png`, fullPage: true });
    console.log("screenshot:", `${OUT}/shot-${nome}.png`, "| url final:", page.url());
  }
  await browser.close();
})();
