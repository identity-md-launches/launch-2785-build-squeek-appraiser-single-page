import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreFor, ownedByBuyer, mergeText } from "../src/view.js";
import { decimal } from "../src/domain.js";
import { squeek, economy, account, settlements, ladder } from "./fixtures.mjs";

test("a loaded wallet never gets a buy recommendation for its own Squeek", () => {
  const card = { id: "1", price: "0.01", status: "ready", data: squeek("1") };
  const state = {
    cards: [card],
    economy: economy(),
    account: account(),
    settlements: settlements(),
    ctx: { status: "mismatch", message: "Test scenario", ladder },
    busy: false,
    walletBusy: false,
  };
  assert.equal(ownedByBuyer(card, state), true);
  assert.equal(scoreFor(card, state), null);
  assert.ok(scoreFor({ ...card, id: "12", data: squeek("12") }, state));
});
test("tiny positive displayed ratios are bounded rather than falsely shown as zero", () => {
  assert.equal(decimal(1n, 10n ** 30n, 6), "<0.000001");
  assert.equal(decimal(0n, 10n ** 30n, 6), "0");
});
test("cooldown labels separate readiness, terminal levels, closed merges and unknown pace", () => {
  assert.equal(mergeText(squeek(), settlements()), "Ready");
  assert.equal(
    mergeText(
      squeek("12", { level: 10, mergeState: "terminal" }),
      settlements(),
    ),
    "Maximum level",
  );
  assert.equal(
    mergeText(squeek("12", { mergeState: "merges_closed" }), settlements()),
    "Merges are closed",
  );
  assert.match(
    mergeText(
      squeek("12", { mergeState: "cooldown", nextMergeHeight: "7000" }),
      { status: "unavailable" },
    ),
    /days unknown/,
  );
});
