import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serve } from "./serve.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const server = serve();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const pairs = [
  ["--ink", "--paper"],
  ["--muted", "--paper"],
  ["--ink", "--surface"],
  ["--muted", "--surface"],
  ["--green", "--good-bg"],
  ["--muted", "--good-bg"],
  ["--amber", "--amber-bg"],
  ["--red", "--red-bg"],
  ["--on-accent", "--green"],
  ["--on-accent", "--green-hover"],
];
const report = {
  method:
    "WCAG sRGB relative luminance of browser-computed semantic tokens; rendered components also checked separately by axe.",
  themes: {},
};
try {
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ colorScheme: theme });
    await page.goto(`http://127.0.0.1:${server.address().port}/preview/`);
    const values = await page.evaluate(() =>
      Object.fromEntries(
        [
          "--ink",
          "--paper",
          "--muted",
          "--surface",
          "--green",
          "--good-bg",
          "--amber",
          "--amber-bg",
          "--red",
          "--red-bg",
          "--on-accent",
          "--green-hover",
        ].map((k) => [
          k,
          getComputedStyle(document.documentElement).getPropertyValue(k).trim(),
        ]),
      ),
    );
    const lum = (hex) => {
      const channels = hex
        .slice(1)
        .match(/../g)
        .map((c) => parseInt(c, 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    report.themes[theme] = pairs.map(([fg, bg]) => {
      const a = lum(values[fg]),
        b = lum(values[bg]),
        ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return {
        foreground: fg,
        background: bg,
        colors: [values[fg], values[bg]],
        ratio: Number(ratio.toFixed(2)),
        threshold: 4.5,
        passed: ratio >= 4.5,
      };
    });
    await page.close();
  }
  await writeFile(
    resolve("artifacts/contrast.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  const all = Object.values(report.themes).flat();
  console.log(
    `${all.filter((p) => p.passed).length}/${all.length} computed text token pairs meet 4.5:1.`,
  );
  if (all.some((p) => !p.passed)) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
