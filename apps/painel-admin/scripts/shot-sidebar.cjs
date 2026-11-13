/* Screenshot da sidebar em viewport baixo + nav rolada — reproduz overlap. */
const { chromium } = require("playwright-core");
const fs = require("fs");

const BASE = process.env.SHOT_BASE || "http://painel-admin.projeto-hweld-crm.kiri.local";
const OUT = process.env.SHOT_OUT || "C:/Users/Vinicius Moreira/AppData/Local/Temp";
const token = fs.readFileSync(process.env.SHOT_TOKEN || "C:/msys64/tmp/tok.txt", "utf8").trim();

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 680 } });
  const page = await ctx.newPage();
  await page.addInitScript((t) => {
    sessionStorage.setItem("hw_staff_access", t);
    sessionStorage.setItem("hw_staff_refresh", "dummy-refresh");
  }, token);

  await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => {
    console.log("[goto falhou]", String(e).slice(0, 120));
  });
  await page.waitForTimeout(2500);

  // Rola a <nav> da sidebar até o fim para expor qualquer sobreposição.
  await page.evaluate(() => {
    const nav = document.querySelector("aside nav");
    if (nav) nav.scrollTop = nav.scrollHeight;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/shot-sidebar-fim.png` });
  console.log("screenshot:", `${OUT}/shot-sidebar-fim.png`);

  // Volta ao topo.
  await page.evaluate(() => {
    const nav = document.querySelector("aside nav");
    if (nav) nav.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/shot-sidebar-topo.png` });
  console.log("screenshot:", `${OUT}/shot-sidebar-topo.png`);
  await browser.close();
})();
