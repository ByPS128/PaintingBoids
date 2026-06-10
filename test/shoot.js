// Headless smoke test (Playwright + systémový Chrome) — dva profily:
//   1. desktop (myš, velké okno): plná sada tvarů, panel tlačítek, HUD s klávesami
//   2. mobil (dotyk, malé okno): kompaktní sada tvarů, užší silnice, méně boidů,
//      tap na tlačítko „tvar" a tap na plátno (atraktor)
// Spuštění: node test/shoot.js
const path = require("path");

let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(path.join(__dirname, "..", "..",
    "CPU-MOS-6502C-Sally-Visual-Simulator", "node_modules", "playwright"));
}

const url = "file:///" + path.join(__dirname, "..", "index.html").replace(/\\/g, "/");

async function runProfile(browser, name, ctxOpts, checks) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(url);
  await page.waitForTimeout(2500);
  const fails = await checks(page);
  await page.screenshot({ path: path.join(__dirname, name + ".png") });
  if (errors.length) fails.push("chyby v konzoli: " + errors.join("; "));
  await ctx.close();
  return fails.map(f => `[${name}] ${f}`);
}

(async () => {
  const browser = await playwright.chromium.launch({ channel: "chrome" });
  let fails = [];

  // --- desktop ---
  fails = fails.concat(await runProfile(browser, "desktop",
    { viewport: { width: 1280, height: 800 } },
    async (page) => {
      const s = await page.evaluate(() => ({
        touch: device.touch, small: device.small,
        shapes: controller.shapes.map(x => x.name),
        road: CONFIG.road.width,
        boids: allBoids.length,
        buttons: uiButtons.length,
      }));
      console.log("desktop:", JSON.stringify(s));
      const f = [];
      if (s.small) f.push("desktop nemá být small");
      if (s.shapes.length !== 11) f.push("čekal jsem 11 tvarů, je " + s.shapes.length);
      if (s.road !== 40) f.push("šířka silnice má být 40, je " + s.road);
      if (s.buttons !== 8) f.push("čekal jsem 8 tlačítek, je " + s.buttons);
      // klik na tlačítko „tvar" přepne stav na GATHER_TO_SHAPE
      const btn = await page.evaluate(() => uiButtons.find(b => b.id === "shape"));
      await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2);
      const st = await page.evaluate(() => controller.state);
      if (st !== "GATHER_TO_SHAPE") f.push("klik na tvar nepřepnul stav: " + st);
      return f;
    }));

  // --- mobil (na výšku, dotyk) ---
  fails = fails.concat(await runProfile(browser, "mobile",
    { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile" },
    async (page) => {
      const s = await page.evaluate(() => ({
        touch: device.touch, small: device.small,
        shapes: controller.shapes.map(x => x.name),
        road: CONFIG.road.width,
        boids: allBoids.length,
        buttons: uiButtons.length,
      }));
      console.log("mobil:  ", JSON.stringify(s));
      const f = [];
      if (!s.touch) f.push("mobil má mít touch=true");
      if (!s.small) f.push("mobil má mít small=true");
      if (s.shapes.includes("vlna") || s.shapes.includes("lissajous") ||
          s.shapes.includes("kopretina")) f.push("kompaktní sada obsahuje nevhodný tvar");
      if (!s.shapes.includes("kvitek")) f.push("chybí mobilní kvítek");
      if (s.road !== 20) f.push("šířka silnice má být 20, je " + s.road);
      if (s.boids !== 3 * 28) f.push("čekal jsem 84 boidů, je " + s.boids);
      // tap na tlačítko „tvar"
      const btn = await page.evaluate(() => uiButtons.find(b => b.id === "shape"));
      await page.touchscreen.tap(btn.x + btn.w / 2, btn.y + btn.h / 2);
      const st = await page.evaluate(() => controller.state);
      if (st !== "GATHER_TO_SHAPE") f.push("tap na tvar nepřepnul stav: " + st);
      // tap doprostřed = atraktor (ne tlačítko)
      await page.touchscreen.tap(195, 400);
      const attr = await page.evaluate(() => !!controller.attractor);
      if (!attr) f.push("tap na plátno nespustil atraktor");
      return f;
    }));

  console.log(fails.length ? "FAIL:\n" + fails.join("\n") : "SMOKE-OK");
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
