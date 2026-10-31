import { test } from "node:test";
import assert from "node:assert/strict";
import {
  available,
  apiLadder,
  deploymentMismatch,
  retryDeadline,
  getAccount,
  json,
  loadContracts,
  checkToken,
  word,
  decodeString,
  DataError,
} from "../src/data.js";
import {
  economy,
  account,
  owner,
  deployment,
  core,
  token,
  mining,
  nft,
  powers,
  cooldowns,
} from "./fixtures.mjs";
import { SELECTORS, RPC, DEPLOYMENT } from "../src/config.js";
const ok = (data) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const abiString = (s) => {
  const hex = Buffer.from(s).toString("hex");
  return (
    "0x" +
    word(32) +
    word(hex.length / 2) +
    hex.padEnd(Math.ceil(hex.length / 64) * 64, "0")
  );
};

test("unavailable data throws instead of becoming zero or an empty list", () => {
  assert.throws(
    () => available({ status: "unavailable", reason: "projection_rebuilding" }),
    /Data is unknown: projection rebuilding/,
  );
  assert.deepEqual(apiLadder({ status: "unavailable" }), []);
  assert.equal(apiLadder(economy()).length, 10);
});
test("deployment verification rejects mismatching records and absent staking identities", () => {
  assert.equal(deploymentMismatch(economy(), deployment()), null);
  const d = deployment();
  d.contracts.SqueekCore.address = token;
  assert.match(deploymentMismatch(economy(), d), /different contracts/);
  delete d.contracts.SqueekStaking;
  assert.ok(deploymentMismatch(economy(), d));
});
test("Retry-After supports seconds, HTTP dates, and unknown values", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");
  assert.equal(retryDeadline("120", now), now + 120000);
  assert.equal(
    retryDeadline("Sat, 31 Oct 2026 12:02:00 GMT", now),
    now + 120000,
  );
  assert.equal(retryDeadline(null, now), now + 5000);
});
test("429 blocks repeated fetches to the origin until the Retry-After deadline", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("", { status: 429, headers: { "retry-after": "60" } });
  };
  try {
    await assert.rejects(
      json("https://rate-limit-test.invalid/data"),
      (e) => e instanceof DataError && e.status === 429,
    );
    await assert.rejects(
      json("https://rate-limit-test.invalid/another"),
      /Rate limited/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("account loader follows all pages and refuses mixed safe-block snapshots", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return ok(
      calls === 1
        ? { ...account(), nextCursor: "second" }
        : {
            ...account(),
            tokens: [{ tokenId: "2", level: 1, mergeState: "ready" }],
          },
    );
  };
  try {
    const result = await getAccount(owner);
    assert.equal(result.tokens.length, 2);
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return ok(
        calls === 1
          ? { ...account(), nextCursor: "second" }
          : {
              ...account(),
              chain: { chainId: "11155111", safeThroughBlock: "12034761" },
            },
      );
    };
    await assert.rejects(getAccount(owner), /changed between pages/);
  } finally {
    globalThis.fetch = original;
  }
});
test("mismatched docs make no RPC requests and produce a labelled API ladder", async () => {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return ok({ chainId: 11155111, contracts: {} });
  };
  try {
    const ctx = await loadContracts(economy());
    assert.equal(ctx.status, "mismatch");
    assert.equal(ctx.ladder.length, 10);
    assert.equal(ctx.ladder[1].source, "api");
    assert.deepEqual(urls, [DEPLOYMENT]);
  } finally {
    globalThis.fetch = original;
  }
});
test("matching contract graph reads full level policy and ownership/token URI at one block", async () => {
  const original = globalThis.fetch;
  const blocks = [];
  const methods = [];
  globalThis.fetch = async (url, options) => {
    if (url === DEPLOYMENT) return ok(deployment());
    assert.equal(url, RPC);
    const req = JSON.parse(options.body);
    methods.push(req.method);
    let result;
    if (req.method === "eth_chainId") result = "0xaa36a7";
    else if (req.method === "eth_getCode") {
      blocks.push(req.params[1]);
      result = "0x6000";
    } else if (req.method === "eth_call") {
      const [{ data }, block] = req.params;
      blocks.push(block);
      const selector = data.slice(2, 10);
      if (selector === SELECTORS.core)
        result = "0x" + core.slice(2).padStart(64, "0");
      else if (selector === SELECTORS.token)
        result = "0x" + token.slice(2).padStart(64, "0");
      else if (selector === SELECTORS.collection)
        result =
          "0x" +
          word(32) +
          nft.slice(2).toLowerCase().padStart(64, "0") +
          word(9999) +
          word(10) +
          word(128) +
          word(10) +
          powers.map((p, i) => word(p) + word(cooldowns[i])).join("");
      else if (
        selector === SELECTORS.weight ||
        selector === SELECTORS.cooldown
      ) {
        const level = Number(BigInt("0x" + data.slice(-64)));
        result =
          "0x" +
          word(
            selector === SELECTORS.weight
              ? powers[level - 1]
              : cooldowns[level - 1],
          );
      } else if (selector === SELECTORS.owner)
        result = "0x" + owner.slice(2).padStart(64, "0");
      else if (selector === SELECTORS.uri)
        result = abiString(
          "data:application/json;base64," +
            Buffer.from(
              JSON.stringify({
                name: "Test fixture",
                image: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
              }),
            ).toString("base64"),
        );
      else if (selector === SELECTORS.position)
        result = "0x" + [1000, 0, 0, 0, 1, 0, 0].map(word).join("");
      else throw Error("Unexpected selector " + selector);
    } else throw Error("Unexpected method " + req.method);
    return ok({ jsonrpc: "2.0", id: 1, result });
  };
  try {
    const ctx = await loadContracts(economy());
    assert.equal(ctx.status, "verified", ctx.message);
    assert.equal(ctx.ladder.length, 10);
    assert.equal(ctx.ladder[1].power, 2200n);
    assert.equal(ctx.ladder[1].cooldown, 3000n);
    const checked = await checkToken("12", ctx);
    assert.equal(checked.owner, owner);
    assert.equal(checked.pendingRound, 0n);
    assert.equal(checked.name, "Test fixture");
    assert.equal(new Set(blocks).size, 1);
    assert.ok(
      methods.every((m) =>
        ["eth_chainId", "eth_getCode", "eth_call"].includes(m),
      ),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("ABI string decoding preserves onchain metadata without injecting HTML", () => {
  const text = 'data:application/json,{"name":"<script>alert(1)</script>"}';
  assert.equal(decodeString(abiString(text)), text);
});
