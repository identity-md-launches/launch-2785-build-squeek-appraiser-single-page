import { API, DEPLOYMENT, RPC, SELECTORS } from "./config.js";
import { identityAddress, integer, svgDataUri } from "./domain.js";

/** @type {Map<string, number>} */ const cooldowns = new Map();
export class DataError extends Error {
  /** @param {string} message @param {number} [status] @param {number} [retryAt] */
  constructor(message, status = 0, retryAt = 0) {
    super(message);
    this.name = "DataError";
    this.status = status;
    this.retryAt = retryAt;
  }
}
/** @param {string | null} header @param {number} [now] */
export function retryDeadline(header, now = Date.now()) {
  if (header && /^\d+(?:\.\d+)?$/.test(header.trim()))
    return now + Number(header) * 1000;
  const date = header ? Date.parse(header) : NaN;
  return Number.isFinite(date) && date > now ? date : now + 5000;
}
/** @template T @param {string} url @param {AbortSignal} [signal] @param {RequestInit} [options] @returns {Promise<T>} */
export async function json(url, signal, options = {}) {
  const origin = new URL(url).origin;
  const retryAt = cooldowns.get(origin) ?? 0;
  if (retryAt > Date.now())
    throw new DataError(
      `Rate limited. Retry after ${new Date(retryAt).toLocaleTimeString()}.`,
      429,
      retryAt,
    );
  const timeout = AbortSignal.timeout(20000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: combined,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { accept: "application/json", ...options.headers },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DataError(
      "The data service could not be reached. Check your connection and retry.",
    );
  }
  if (response.status === 429) {
    const deadline = retryDeadline(response.headers.get("Retry-After"));
    cooldowns.set(origin, deadline);
    throw new DataError(
      `Rate limited. Retry after ${new Date(deadline).toLocaleTimeString()}.`,
      429,
      deadline,
    );
  }
  if (!response.ok)
    throw new DataError(
      response.status === 404
        ? "This Squeek does not exist or was burned in a merge."
        : `The data service returned HTTP ${response.status}. Retry in a moment.`,
      response.status,
    );
  try {
    return /** @type {T} */ (await response.json());
  } catch {
    throw new DataError(
      "The data service sent an unreadable response. Retry in a moment.",
    );
  }
}
/** @template {import('./types.js').Envelope} T @param {T} data @returns {T} */
export function available(data) {
  if (data.status !== "available")
    throw new DataError(
      `Data is unknown: ${(data.reason ?? "service unavailable").replaceAll("_", " ")}. Retry in a moment.`,
    );
  return data;
}
/** @param {string} path @param {AbortSignal} [signal] @returns {Promise<import('./types.js').Squeek>} */
export async function getSqueek(path, signal) {
  const s = available(await json(`${API}/squeeks/${path}`, signal));
  if (s.custody?.burned)
    throw new DataError(
      `Squeek #${path} does not exist or was burned in a merge.`,
      404,
    );
  if (s.tokenId !== path || s.chain?.chainId !== "11155111")
    throw new DataError(
      "The service returned a different token or network. Retry later.",
    );
  return s;
}
/** @param {string} address @param {AbortSignal} [signal] @returns {Promise<import('./types.js').Account>} */
export async function getAccount(address, signal) {
  /** @type {import('./types.js').Account | null} */ let full = null;
  /** @type {string | null} */ let cursor = null;
  const seen = new Set();
  do {
    const query = new URLSearchParams({
      limit: "100",
      ...(cursor ? { cursor } : {}),
    });
    /** @type {import('./types.js').Account} */ const page = available(
      await json(`${API}/accounts/${address.toLowerCase()}?${query}`, signal),
    );
    if (
      page.chain?.chainId !== "11155111" ||
      page.account?.toLowerCase() !== address.toLowerCase()
    )
      throw new DataError(
        "The account response does not match this address and Sepolia. Retry later.",
      );
    if (!Array.isArray(page.tokens))
      throw new DataError("The account token list is unknown. Retry later.");
    if (!full) full = { ...page, tokens: [...page.tokens] };
    else {
      if (
        full.release?.id !== page.release?.id ||
        full.chain?.safeThroughBlock !== page.chain?.safeThroughBlock
      )
        throw new DataError(
          "The account snapshot changed between pages. Load the wallet again.",
        );
      full.tokens?.push(...page.tokens);
    }
    cursor = page.nextCursor ?? null;
    if (cursor && seen.has(cursor))
      throw new DataError(
        "The account service repeated a page. Load the wallet again.",
      );
    if (cursor) seen.add(cursor);
    if (seen.size > 100)
      throw new DataError(
        "The account returned too many pages. Load the wallet again.",
      );
  } while (cursor);
  return /** @type {import('./types.js').Account} */ (full);
}
/** @param {import('./types.js').Economy} economy @returns {import('./types.js').LadderRow[]} */
export function apiLadder(economy) {
  if (economy.status !== "available") return [];
  const max = economy.nft?.maximumLevel;
  if (!max || max > 255) return [];
  /** @type {import('./types.js').LadderRow[]} */ const rows = [];
  for (let level = 1; level <= max; level++) {
    const power = integer(economy.nft?.basePower?.[level - 1]);
    const cooldown = integer(economy.nft?.cooldownBlocks?.[level - 1]);
    if (power == null || cooldown == null) return [];
    rows.push({ level, power, cooldown, source: "api" });
  }
  return rows;
}
/** @param {import('./types.js').Economy} economy @param {import('./types.js').Deployment} record */
export function deploymentMismatch(economy, record) {
  if (
    String(record.chainId) !== "11155111" ||
    economy.chain?.chainId !== "11155111"
  )
    return "The data sources do not both identify Sepolia.";
  for (const [key, contract] of [
    ["core", "SqueekCore"],
    ["token", "SqueekToken"],
    ["mining", "SqueekMining"],
    ["staking", "SqueekStaking"],
  ]) {
    const actual = identityAddress(economy.identities?.[key]);
    const expected = record.contracts?.[contract]?.address?.toLowerCase();
    if (!actual || !expected || actual !== expected)
      return "The live API and published deployment record name different contracts. Contract verification is unavailable for this release.";
    const identity = economy.identities?.[key];
    const expectedIdentity = record.contracts?.[contract];
    if (identity && typeof identity === "object" && expectedIdentity) {
      for (const field of /** @type {const} */ ([
        "implementation",
        "implementationVersion",
        "storageLayoutDigest",
      ])) {
        if (
          expectedIdentity[field] != null &&
          String(identity[field]).toLowerCase() !==
            String(expectedIdentity[field]).toLowerCase()
        )
          return `The ${key} implementation differs from the published deployment record.`;
      }
    }
  }
  if (!record.contracts?.SqueekNFT?.address)
    return "The deployment record does not identify SqueekNFT.";
  return null;
}
/** @param {bigint | number | string} value */
export const word = (value) => BigInt(value).toString(16).padStart(64, "0");
/** @param {string} data */
export function words(data) {
  if (!/^0x(?:[0-9a-fA-F]{64})+$/.test(data))
    throw new DataError("The contract response could not be decoded.");
  return data.slice(2).match(/.{64}/g) ?? [];
}
/** @param {string} method @param {unknown[]} params @param {AbortSignal} [signal] @returns {Promise<string>} */
export async function rpc(method, params, signal) {
  if (
    ![
      "eth_chainId",
      "eth_call",
      "eth_getCode",
      "eth_getBlockByNumber",
      "eth_getStorageAt",
    ].includes(method)
  )
    throw new DataError("Only contract reads are allowed.");
  /** @type {{result?: string; error?: {message?: string}}} */
  const result = await json(RPC, signal, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (result.error || result.result == null)
    throw new DataError("The Sepolia contract read failed. Retry later.");
  return result.result;
}
/** @param {string} address @param {string} data @param {string} block @param {AbortSignal} [signal] */
export function call(address, data, block, signal) {
  return rpc("eth_call", [{ to: address, data: "0x" + data }, block], signal);
}
/** Verify API identities against the fetched docs before making contract calls.
 * @param {import('./types.js').Economy} economy @param {AbortSignal} [signal] @returns {Promise<import('./types.js').ContractContext>}
 */
export async function loadContracts(economy, signal) {
  const fallback = apiLadder(economy);
  try {
    /** @type {import('./types.js').Deployment} */ const record = await json(
      DEPLOYMENT,
      signal,
    );
    const mismatch = deploymentMismatch(economy, record);
    if (mismatch)
      return { status: "mismatch", message: mismatch, ladder: fallback };
    const mining = /** @type {string} */ (
        record.contracts?.SqueekMining?.address
      ),
      nft = /** @type {string} */ (record.contracts?.SqueekNFT?.address);
    const blockNumber = integer(economy.chain?.safeThroughBlock);
    if (blockNumber == null)
      throw new DataError(
        "The API did not provide a safe block for contract reads.",
      );
    const block = "0x" + blockNumber.toString(16);
    const [chain, miningCode, nftCode, core, token, policy] = await Promise.all(
      [
        rpc("eth_chainId", [], signal),
        rpc("eth_getCode", [mining, block], signal),
        rpc("eth_getCode", [nft, block], signal),
        call(mining, SELECTORS.core, block, signal),
        call(mining, SELECTORS.token, block, signal),
        call(mining, SELECTORS.collection + word(0), block, signal),
      ],
    );
    if (BigInt(chain) !== 11155111n || miningCode === "0x" || nftCode === "0x")
      throw new DataError(
        "The contract network or runtime could not be verified.",
      );
    if (
      "0x" + (words(core)[0] ?? "").slice(-40).toLowerCase() !==
        identityAddress(economy.identities?.core) ||
      "0x" + (words(token)[0] ?? "").slice(-40).toLowerCase() !==
        identityAddress(economy.identities?.token)
    )
      throw new DataError(
        "The contracts do not point to the API’s core and token.",
      );
    const policyWords = words(policy);
    const start = Number(BigInt("0x" + policyWords[0])) / 32;
    if (
      "0x" + policyWords[start].slice(-40).toLowerCase() !==
      nft.toLowerCase()
    )
      throw new DataError(
        "The collection does not point to the documented SqueekNFT.",
      );
    const maximum = Number(BigInt("0x" + policyWords[start + 2]));
    if (maximum < 1 || maximum > 255 || maximum !== economy.nft?.maximumLevel)
      throw new DataError(
        "The maximum level differs between API and contract.",
      );
    /** @type {import('./types.js').LadderRow[]} */ const ladder = [];
    // Groups of four reads keep pressure on public providers modest.
    for (let level = 1; level <= maximum; level += 2) {
      const levels = [level, level + 1].filter((n) => n <= maximum);
      const group = await Promise.all(
        levels.map(async (n) => {
          const [p, c] = await Promise.all([
            call(mining, SELECTORS.weight + word(0) + word(n), block, signal),
            call(mining, SELECTORS.cooldown + word(0) + word(n), block, signal),
          ]);
          return {
            level: n,
            power: BigInt(p),
            cooldown: BigInt(c),
            source: /** @type {const} */ ("contract"),
          };
        }),
      );
      ladder.push(...group);
    }
    return {
      status: "verified",
      message:
        "API addresses match the deployment record. Level policy read from Sepolia.",
      mining,
      nft,
      block,
      ladder,
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      status: "unavailable",
      message:
        error instanceof Error
          ? error.message
          : "Contract verification is unavailable.",
      ladder: fallback,
    };
  }
}
/** @param {string} data */
export function decodeString(data) {
  const chunks = words(data);
  const offset = Number(BigInt("0x" + chunks[0])) / 32;
  const length = Number(BigInt("0x" + chunks[offset]));
  if (!Number.isSafeInteger(length) || length > 2000000)
    throw new DataError("The token metadata exceeds the read limit.");
  const hex = chunks
    .slice(offset + 1)
    .join("")
    .slice(0, length * 2);
  return new TextDecoder().decode(
    new Uint8Array(hex.match(/../g)?.map((v) => parseInt(v, 16)) ?? []),
  );
}
/** @param {string} id @param {import('./types.js').ContractContext} ctx @param {AbortSignal} [signal] @returns {Promise<import('./types.js').TokenCheck>} */
export async function checkToken(id, ctx, signal) {
  if (ctx.status !== "verified" || !ctx.nft || !ctx.mining || !ctx.block)
    throw new DataError("Contract verification is unavailable.");
  const [ownerData, uriData, positionData] = await Promise.all([
    call(ctx.nft, SELECTORS.owner + word(id), ctx.block, signal),
    call(ctx.nft, SELECTORS.uri + word(id), ctx.block, signal),
    call(
      ctx.mining,
      SELECTORS.position + word(0) + word(id),
      ctx.block,
      signal,
    ),
  ]);
  const uri = decodeString(uriData);
  let metadata = {};
  if (uri.startsWith("data:application/json;base64,"))
    metadata = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(uri.split(",")[1] ?? ""), (c) => c.charCodeAt(0)),
      ),
    );
  else if (uri.startsWith("data:application/json,"))
    metadata = JSON.parse(decodeURIComponent(uri.slice(uri.indexOf(",") + 1)));
  const pos = words(positionData);
  const m = /** @type {{name?: string; image?: string}} */ (metadata);
  return {
    owner: "0x" + (words(ownerData)[0] ?? "").slice(-40),
    name: m.name,
    image: svgDataUri(m.image) ? m.image : undefined,
    pendingPower: BigInt("0x" + pos[1]),
    pendingRound: BigInt("0x" + pos[2]),
    block: ctx.block,
  };
}
