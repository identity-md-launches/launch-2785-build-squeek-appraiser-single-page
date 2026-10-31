import { test } from "node:test";
import assert from "node:assert/strict";
import {
  integer,
  tokenId,
  parsePrice,
  validAddress,
  decimal,
  custody,
  blocksLeft,
  dailyPace,
  poolShare,
  mergePartner,
  score,
  compare,
  readHash,
  makeHash,
  svgDataUri,
} from "../src/domain.js";
import {
  economy,
  squeek,
  account,
  settlements,
  owner,
  proxy,
  ladder,
} from "./fixtures.mjs";

test("decimal strings remain exact above Number.MAX_SAFE_INTEGER", () => {
  assert.equal(
    integer("90071992547409931234567890"),
    90071992547409931234567890n,
  );
  assert.equal(integer(undefined), null);
  assert.equal(integer("unavailable"), null);
  assert.equal(integer(1000), null);
  assert.equal(
    decimal(90071992547409931234567890n, 10n, 1),
    "9,007,199,254,740,993,123,456,789",
  );
});
test("token IDs accept only the issued numeric range", () => {
  assert.equal(tokenId("0012"), "12");
  for (const id of ["0", "10000", "1e2", "0x12", "-12", "12.3", "abc"])
    assert.equal(tokenId(id), null);
});
test("any decimal precision and comma prices are exact, zero is not a rankable divisor", () => {
  assert.deepEqual(parsePrice(" 0,0200 "), {
    numerator: 2n,
    denominator: 100n,
    canonical: "0.02",
  });
  const tiny = parsePrice(".0000000000000000000000001");
  assert.equal(tiny.numerator, 1n);
  assert.equal(tiny.denominator, 10n ** 25n);
  for (const v of ["-1", "1,2.3", "1e2", "NaN", ""])
    assert.equal(parsePrice(v), null);
  assert.equal(
    score(
      { id: "12", status: "ready", data: squeek(), price: "0" },
      economy(),
      null,
    ),
    null,
  );
});
test("pool numerator and 18-decimal totals use the same units", () => {
  const share = poolShare(squeek(), economy());
  assert.equal(decimal(share.n * 100n, share.d, 6), "1.033058");
  assert.equal(decimal(share.n * 1000n, share.d, 4), "10.3306");
  for (const e of [
    { status: "unavailable" },
    { ...economy(), staking: null },
    { ...economy(), staking: { totalNftPower: "0", totalSqkPower: "0" } },
    { ...economy(), release: { rewardModelRevision: "future" } },
  ])
    assert.equal(poolShare(squeek(), e), null);
});
test("custody uses staking proxy identity plus depositor, with stray blocker", () => {
  assert.equal(custody(squeek(), economy()), "wallet");
  assert.equal(
    custody(
      squeek("8889", { custody: { owner: proxy, depositor: owner } }),
      economy(),
    ),
    "staking",
  );
  assert.equal(
    custody(
      squeek("8889", { custody: { owner: proxy, depositor: null } }),
      economy(),
    ),
    "stray",
  );
  assert.equal(custody(squeek(), null), "unknown");
});
test("cooldown uses Squeek block height and retains all seven days including rest", () => {
  const s = squeek("12", { nextMergeHeight: "7000", mergeState: "cooldown" });
  assert.equal(blocksLeft(s), 1796n);
  assert.deepEqual(dailyPace(settlements()), { n: 5204n, d: 7n });
  assert.equal(dailyPace({ status: "unavailable" }), null);
  assert.equal(blocksLeft({ ...s, nextMergeHeight: undefined }), null);
});
test("merge partners require same level, both ready, no pending change and open policy", () => {
  assert.equal(mergePartner(squeek(), account(), ladder).nextPower, 2200n);
  for (const changed of [
    { mergeState: "cooldown" },
    { pendingRound: "732" },
    { economy: { ...squeek().economy, mergesOpen: false } },
    { economy: { ...squeek().economy, stakingPaused: true } },
    { level: 10 },
  ])
    assert.equal(mergePartner(squeek("12", changed), account(), ladder), null);
  assert.equal(mergePartner(squeek("1"), account(), ladder), null);
  assert.equal(
    mergePartner(
      squeek(),
      {
        ...account(),
        tokens: [{ tokenId: "1", level: 2, mergeState: "ready" }],
      },
      ladder,
    ),
    null,
  );
  assert.equal(
    mergePartner(
      squeek(),
      {
        ...account(),
        tokens: [
          { tokenId: "1", level: 1, mergeState: "ready", pendingRound: "732" },
        ],
      },
      ladder,
    ),
    null,
  );
});
test("scoring applies additive 25% bonus and 10% withdrawal penalty; ties compare exactly", () => {
  const c = { id: "12", price: ".01", status: "ready", data: squeek() };
  const p = mergePartner(c.data, account(), ladder);
  assert.equal(
    decimal(score(c, economy(), null).n, score(c, economy(), null).d, 0),
    "100,000",
  );
  const staked = {
    ...c,
    data: squeek("12", { custody: { owner: proxy, depositor: owner } }),
  };
  const s = score(staked, economy(), p);
  assert.equal(decimal(s.n, s.d, 0), "115,000");
  const b = score({ ...c, price: ".008" }, economy(), null);
  assert.equal(compare(b, s), 1);
  assert.equal(compare({ n: 1n, d: 3n }, { n: 2n, d: 6n }), 0);
});
test("share hash keeps decimal positions, ignores duplicates, and never includes wallet", () => {
  const items = [
    { id: "12", price: "0,02" },
    { id: "45", price: "" },
    { id: "301", price: ".008" },
  ];
  const hash = makeHash(items);
  assert.equal(hash, "#ids=12-45-301&prices=0.02--0.008");
  assert.deepEqual(readHash(hash), [
    { id: "12", price: "0.02" },
    { id: "45", price: "" },
    { id: "301", price: "0.008" },
  ]);
  assert.equal(readHash("#ids=12-12-45-301-4&prices=1-2-3-4-5").length, 3);
  assert.equal(hash.includes(owner), false);
});
test("metadata image URLs only accept bounded SVG data images", () => {
  assert.equal(svgDataUri("javascript:alert(1)"), false);
  assert.equal(svgDataUri('<svg onload="alert(1)">'), false);
  assert.equal(svgDataUri(squeek().metadata.imageDataUri), true);
  assert.equal(validAddress(owner), true);
  assert.equal(validAddress("0x" + "0".repeat(40)), false);
});
