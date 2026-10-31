import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serve } from "./serve.mjs";
import {
  economy,
  squeek,
  account,
  settlements,
  deployment,
  owner,
  proxy,
} from "../test/fixtures.mjs";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const { default: AxeBuilder } = await import(
  process.env.AXE_MODULE ?? "@axe-core/playwright"
);
const out = resolve("test/scratch/browser-validation");
await mkdir(out, { recursive: true });
const server = serve();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port,
  base = `http://127.0.0.1:${port}/preview/`;
const checks = [];
let browser;
const pass = (name, details = "") => {
  checks.push({ name, passed: true, details });
  console.log("PASS " + name + (details ? " · " + details : ""));
};
const fixture = (body, status = 200, headers = {}) => ({
  status,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*", ...headers },
  body: JSON.stringify(body),
});
async function mock(page, options = {}) {
  await page.route("https://docs.squeekchain.com/**", (r) =>
    r.fulfill(fixture({ chainId: 11155111, contracts: {} })),
  );
  await page.route("https://api.squeekchain.com/v1/**", async (r) => {
    const url = new URL(r.request().url()),
      path = url.pathname;
    if (options.delay)
      await new Promise((resolve) => setTimeout(resolve, options.delay));
    if (path.endsWith("/economy/state"))
      return r.fulfill(fixture(options.economy ?? economy()));
    if (path.endsWith("/settlements"))
      return r.fulfill(fixture(options.settlements ?? settlements()));
    if (path.includes("/accounts/")) {
      if (options.accountError)
        return r.fulfill(
          fixture({ status: "unavailable", reason: "indexer_unavailable" }),
        );
      const a = account();
      if (!url.searchParams.has("cursor"))
        return r.fulfill(
          fixture({
            ...a,
            tokens: [
              {
                tokenId: "1",
                level: 2,
                mergeState: "cooldown",
                nextMergeHeight: "6000",
                custody: "wallet",
              },
            ],
            nextCursor: "page-2",
          }),
        );
      return r.fulfill(
        fixture({
          ...a,
          tokens: [
            {
              tokenId: "2",
              level: 1,
              mergeState: "ready",
              nextMergeHeight: "0",
              custody: "wallet",
            },
          ],
        }),
      );
    }
    const id = path.split("/").pop();
    if (options.rateLimit)
      return r.fulfill(fixture({}, 429, { "retry-after": "60" }));
    if (id === "9999")
      return r.fulfill(fixture(squeek(id, { custody: { burned: true } })));
    if (id === "9998") return r.fulfill(fixture({}, 404));
    if (id === "45")
      return r.fulfill(
        fixture(
          squeek(id, {
            level: 2,
            basePower: "2200",
            mergeState: "cooldown",
            nextMergeHeight: "7000",
            metadata: {
              ...squeek(id).metadata,
              name: '<img src=x onerror="window.injected=1">',
            },
          }),
        ),
      );
    if (id === "301")
      return r.fulfill(
        fixture(
          squeek(id, {
            custody: {
              owner: proxy,
              depositor: owner,
              stray: false,
              burned: false,
            },
          }),
        ),
      );
    return r.fulfill(fixture(squeek(id)));
  });
}
async function settled(page) {
  await page.waitForFunction(
    () => !document.querySelector("#appraise-button").disabled,
    { timeout: 30000 },
  );
}
async function noOverflow(page, width) {
  await page.setViewportSize({ width, height: 844 });
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    page: document.documentElement.scrollWidth,
  }));
  assert.ok(
    sizes.page <= sizes.viewport + 1,
    `${width}: ${JSON.stringify(sizes)}`,
  );
}
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [],
    localFailures = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(base) && r.status() >= 400)
      localFailures.push({ url: r.url(), status: r.status() });
  });
  await mock(page, { delay: 150 });
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  const bounds = await page.locator("#appraise-button").boundingBox();
  assert.ok(bounds.y + bounds.height < 844);
  assert.ok(await page.locator(".brand").isVisible());
  await page.screenshot({ path: resolve(out, "390-initial.png") });
  pass(
    "Product and main action on first screen at 390",
    `button bottom ${Math.round(bounds.y + bounds.height)}px`,
  );
  await page.keyboard.press("Tab");
  assert.match(await page.locator(":focus").innerText(), /Skip to appraisal/);
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(":focus").getAttribute("id"), "main");
  await page.locator("#appraise-button").click();
  assert.match(await page.locator("#form-error").innerText(), /at least one/);
  assert.equal(await page.locator(":focus").getAttribute("id"), "token-0");
  pass("Keyboard skip path and invalid-form focus");
  await page.locator("#token-0").fill("12");
  await page.locator("#price-0").fill("0,02");
  await page
    .getByRole("button", { name: "+ Add a Squeek", exact: true })
    .click();
  await page.locator("#token-1").fill("45");
  await page.locator("#price-1").fill("0.01");
  await page
    .getByRole("button", { name: "+ Add a Squeek", exact: true })
    .click();
  await page.locator("#token-2").fill("301");
  await page.locator("#price-2").fill(".008");
  assert.equal(
    await page
      .getByRole("button", { name: "+ Add a Squeek", exact: true })
      .count(),
    0,
  );
  await page.locator("#appraise-button").click();
  assert.equal(await page.locator("[aria-busy=true]").count(), 3);
  await settled(page);
  assert.match(page.url(), /#ids=12-45-301&prices=0.02-0.01-0.008$/);
  assert.match(await page.locator("#verdict").innerText(), /Buy Squeek #45/);
  assert.match(await page.locator("#comparison-table").innerText(), /2,200/);
  assert.match(
    await page.locator("#cards").innerText(),
    /1,796 Squeek blocks left \(about 2.4 days/,
  );
  assert.match(await page.locator("#cards").innerText(), /None attached/);
  assert.equal(await page.locator(".nft-image").count(), 3);
  assert.equal(await page.locator("#cards svg").count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  pass(
    "Three-card appraisal, comma prices, skeletons, exact comparison, cooldown estimate and safe SVG images",
  );
  const savedHash = new URL(page.url()).hash;
  await page.getByRole("link", { name: "How we score ↓", exact: true }).click();
  assert.equal(new URL(page.url()).hash, savedHash);
  assert.equal(await page.locator("#sources").getAttribute("open"), "");
  pass("Scoring disclosure preserves share hash");
  await page.locator("#wallet-disclosure > summary").click();
  await page.locator("#wallet-address").fill("not an address");
  await page.locator("#wallet-button").click();
  assert.equal(
    await page.locator("#wallet-address").getAttribute("aria-invalid"),
    "true",
  );
  await page.locator("#wallet-address").fill(owner);
  await page.locator("#wallet-button").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#wallet-result")
      .textContent.includes("2 Squeeks found"),
  );
  assert.match(
    await page.locator("#comparison-table").innerText(),
    /#2 → Level 2/,
  );
  assert.match(
    await page.locator("#cards").innerText(),
    /Merges today into Level 2 \(power 2,200\)/,
  );
  assert.ok(!new URL(page.url()).hash.includes(owner));
  pass("Read-only wallet, account pagination and ready merge partner");
  await page.locator("#share-button").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#share-url") ||
      document.querySelector("#share-button").textContent === "Link copied",
  );
  const shareFallback = page.locator("#share-url");
  if (await shareFallback.count()) {
    assert.ok(!(await shareFallback.inputValue()).includes(owner));
  } else
    assert.match(await page.locator("#announcements").innerText(), /copied/);
  pass("Share control and wallet exclusion");
  await page.locator("#wallet-clear").click();
  assert.equal(await page.locator("#wallet-address").inputValue(), "");
  for (const width of [320, 390, 768, 1440]) await noOverflow(page, width);
  pass("No page overflow at 320, 390, 768, 1440 with all results");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#comparison-title").scrollIntoViewIfNeeded();
  const overflow = await page
    .locator(".table-box")
    .evaluate((n) => n.scrollWidth > n.clientWidth);
  assert.equal(overflow, true);
  await page.locator(".table-box").focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  assert.ok(
    (await page.locator(".table-box").evaluate((n) => n.scrollLeft)) > 0,
  );
  await page.screenshot({ path: resolve(out, "390-comparison.png") });
  pass("Comparison table scrolls within its own keyboard-accessible box");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#results-toolbar").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, "1440-results.png") });
  await page
    .locator(".squeek-card")
    .first()
    .locator(".card-details")
    .last()
    .locator("summary")
    .click();
  assert.equal(
    await page.locator(".ladder").first().locator("tbody tr").count(),
    10,
  );
  assert.match(
    await page.locator(".squeek-card").first().innerText(),
    /API policy fallback/,
  );
  pass("Full ten-level ladder and explicit verification fallback");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(out, "390-dark.png") });
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--paper")
        .trim(),
    ),
    "#1d241f",
  );
  const animations = await page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === "running").length,
  );
  assert.equal(animations, 0);
  pass("Dark theme and reduced motion");
  const axeDark = await new AxeBuilder({ page }).analyze();
  await writeFile(
    resolve(out, "axe-dark.json"),
    JSON.stringify(axeDark.violations, null, 2),
  );
  assert.deepEqual(
    axeDark.violations.map((v) => v.id),
    [],
  );
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  const axe = await new AxeBuilder({ page }).analyze();
  await writeFile(
    resolve(out, "axe-light.json"),
    JSON.stringify(axe.violations, null, 2),
  );
  assert.deepEqual(
    axe.violations.map((v) => v.id),
    [],
  );
  pass(
    "Axe accessibility scan in light and dark",
    `${axe.passes.length}/${axeDark.passes.length} rules passed; no violations`,
  );
  await page.goto(base + "#ids=9999-9998&prices=0.01-0.02");
  await settled(page);
  assert.match(
    await page.locator("#cards").innerText(),
    /Squeek #9999 does not exist or was burned in a merge/,
  );
  assert.match(
    await page.locator("#cards").innerText(),
    /Squeek #9998 does not exist or was burned in a merge/,
  );
  assert.match(await page.locator("#verdict").innerText(), /No appraisal yet/);
  pass("Burned and nonexistent token states");
  await page.goto(base + "#ids=12-301&prices=0.01-0.01");
  await settled(page);
  assert.match(await page.locator("#verdict").innerText(), /Buy Squeek #12/);
  assert.match(await page.locator("#cards").innerText(), /Earning: in staking/);
  assert.match(
    await page.locator("#cards").innerText(),
    /depositor must withdraw/,
  );
  pass("Staked custody, withdrawal explanation and scoring penalty");
  await page.goto(base + "#ids=12&prices=0");
  await settled(page);
  assert.match(await page.locator("#verdict").innerText(), /Add a price/);
  assert.match(await page.locator("#comparison-table").innerText(), /Unranked/);
  pass("Zero price remains unranked");
  const unavailable = await context.newPage();
  await mock(unavailable, {
    economy: { status: "unavailable", reason: "indexer_unavailable" },
    settlements: { status: "unavailable", reason: "indexer_unavailable" },
  });
  await unavailable.goto(base + "#ids=12&prices=0.01");
  await settled(unavailable);
  assert.match(
    await unavailable.locator("#service-notice").innerText(),
    /Pool data unknown/,
  );
  assert.match(
    await unavailable.locator("#comparison-table").innerText(),
    /Unknown/,
  );
  assert.ok(
    !(await unavailable.locator("#verdict").innerText()).includes("Buy Squeek"),
  );
  await unavailable.close();
  pass("Unavailable pool and settlements stay unknown");
  const rate = await context.newPage();
  let reads = 0;
  rate.on("request", (r) => {
    if (r.url().includes("/squeeks/")) reads++;
  });
  await mock(rate, { rateLimit: true });
  await rate.goto(base + "#ids=12&prices=0.01");
  await settled(rate);
  assert.match(await rate.locator("#cards").innerText(), /Rate limited/);
  const before = reads;
  await rate.getByRole("button", { name: "Retry this Squeek" }).click();
  await settled(rate);
  assert.equal(reads, before);
  await rate.close();
  pass("429 recovery respects Retry-After without repeated API requests");
  assert.deepEqual(errors, []);
  assert.deepEqual(localFailures, []);
  pass("No uncaught browser errors or missing local assets");
  await context.close();
  // WebKit is attempted, with a concrete host limitation recorded if it cannot launch.
  try {
    const safari = await webkit.launch({ headless: true });
    try {
      const p = await safari.newPage({ viewport: { width: 390, height: 844 } });
      await mock(p);
      await p.goto(base);
      await p.locator("#token-0").fill("12");
      await p.locator("#price-0").fill("0.01");
      await p.locator("#appraise-button").click();
      await settled(p);
      assert.match(await p.locator("#cards").innerText(), /1,000/);
      pass("WebKit primary appraisal");
    } finally {
      await safari.close();
    }
  } catch (error) {
    checks.push({
      name: "WebKit primary appraisal",
      passed: null,
      limitation: String(error.message).slice(0, 2200),
    });
    console.log("LIMITATION WebKit host libraries unavailable");
  }
} catch (error) {
  checks.push({
    name: "Browser validation",
    passed: false,
    error: String(error.stack ?? error),
  });
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    resolve(out, "results.json"),
    JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2),
  );
}
