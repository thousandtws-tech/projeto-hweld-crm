const { chromium } = require("playwright-core");
const fs = require("fs");
const token = fs.readFileSync("C:/Users/Vinicius Moreira/AppData/Local/Temp/tok.txt", "utf8").trim();
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript((t) => {
    sessionStorage.setItem("hw_staff_access", t);
    sessionStorage.setItem("hw_staff_refresh", "x");
  }, token);
  for (const [rota, nome] of [["/catalogo/produtos/novo","novo-m"],["/catalogo/categorias","cat-m"]]) {
    await page.goto("http://painel-admin.projeto-hweld-crm.kiri.local" + rota, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `C:/Users/Vinicius Moreira/AppData/Local/Temp/shot-${nome}.png`, fullPage: true });
    console.log("ok", nome);
  }
  await browser.close();
})();
