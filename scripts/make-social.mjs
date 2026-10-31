// Optional asset regeneration. Not part of the static production build.
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const font = (
  await readFile(
    new URL("../src/assets/fonts/fraunces-latin.woff2", import.meta.url),
  )
).toString("base64");
const sans = (
  await readFile(
    new URL("../src/assets/fonts/plex-sans-latin.woff2", import.meta.url),
  )
).toString("base64");
const mark = (
  await readFile(new URL("../src/assets/mark.svg", import.meta.url))
).toString("base64");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>@font-face{font-family:Fraunces;src:url(data:font/woff2;base64,${font});font-weight:500}@font-face{font-family:Plex;src:url(data:font/woff2;base64,${sans})}*{box-sizing:border-box}body{margin:0;background:#f6f3eb;color:#272d27;padding:56px 64px;font-family:Plex}.top{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d5d1c5;padding-bottom:30px}.brand{font-family:Fraunces;font-size:30px;display:flex;align-items:center;gap:16px}.network{color:#64695f;font-size:20px}h1{font-family:Fraunces;font-weight:500;font-size:84px;line-height:1.05;letter-spacing:-3px;margin:52px 0 24px;max-width:800px}p{font-size:28px;color:#64695f}.bottom{display:flex;gap:20px;margin-top:40px;font-size:20px;color:#286343}.item{border-top:2px solid #286343;width:260px;padding-top:16px}</style><div class="top"><div class="brand"><img src="data:image/svg+xml;base64,${mark}" width="44" height="44">Squeek Appraiser</div><div class="network">Sepolia / Read only</div></div><h1>Know your<br>next Squeek.</h1><p>A buyer’s tool for Squeekchain.</p><div class="bottom"><div class="item">Power in context</div><div class="item">Prices side by side</div><div class="item">Ready merge partners</div></div>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: new URL("../src/assets/social-card.png", import.meta.url).pathname,
  });
  console.log("Generated src/assets/social-card.png (1200 × 630).");
} finally {
  await browser.close();
}
