import { POWER_SCALE, SUPPORTED_REWARD_MODEL } from "./config.js";

/** @param {unknown} value @returns {bigint | null} */
export function integer(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}
/** @param {unknown} value @returns {string | null} */
export function tokenId(value) {
  if (typeof value !== "string" || !/^\d{1,5}$/.test(value.trim())) return null;
  const id = BigInt(value.trim());
  return id > 0n && id <= 9999n ? String(id) : null;
}
/** @param {string} text @returns {import('./types.js').Price | null} */
export function parsePrice(text) {
  const value = text.trim().replace(",", ".");
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || value.length > 512)
    return null;
  const [whole = "0", fraction = ""] = value.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = fraction.replace(/0+$/, "");
  return {
    numerator: BigInt(normalizedWhole + normalizedFraction),
    denominator: 10n ** BigInt(normalizedFraction.length),
    canonical:
      normalizedWhole + (normalizedFraction ? "." + normalizedFraction : ""),
  };
}
/** @param {string} address */
export function validAddress(address) {
  return /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/i.test(address);
}
/** @param {import('./types.js').Identity | null | undefined} value */
export function identityAddress(value) {
  return typeof value === "string"
    ? value.toLowerCase()
    : value?.proxy?.toLowerCase();
}
/** @param {bigint | null | undefined} n */
export function number(n) {
  return n == null ? "Unknown" : n.toLocaleString("en-US");
}
/** Fixed-point formatting without converting an onchain integer to Number.
 * @param {bigint} numerator @param {bigint} denominator @param {number} [places] @param {boolean} [trim]
 */
export function decimal(numerator, denominator, places = 2, trim = true) {
  if (denominator <= 0n) return "Unknown";
  const scale = 10n ** BigInt(places);
  const rounded = (numerator * scale + denominator / 2n) / denominator;
  if (rounded === 0n && numerator > 0n)
    return places > 0 ? "<0." + "0".repeat(places - 1) + "1" : "<1";
  const whole = rounded / scale;
  let fraction = (rounded % scale).toString().padStart(places, "0");
  if (trim) fraction = fraction.replace(/0+$/, "");
  return number(whole) + (fraction ? "." + fraction : "");
}
/** @param {import('./types.js').Squeek} s @param {import('./types.js').Economy | null} economy */
export function custody(s, economy) {
  if (s.custody?.burned) return "burned";
  if (s.custody?.stray) return "stray";
  const owner = s.custody?.owner?.toLowerCase();
  const proxy = identityAddress(economy?.identities?.staking);
  if (!owner || !proxy || !economy || economy.status !== "available")
    return "unknown";
  if (owner === proxy) return s.custody?.depositor ? "staking" : "stray";
  return "wallet";
}
/** @param {import('./types.js').Squeek} s @returns {bigint | null} */
export function blocksLeft(s) {
  const next = integer(s.nextMergeHeight),
    current = integer(s.economy?.coreBlockHeight);
  if (next == null || current == null) return null;
  return next > current ? next - current : 0n;
}
/** @param {import('./types.js').Settlement | null} settlements @returns {import('./types.js').Fraction | null} */
export function dailyPace(settlements) {
  if (settlements?.status !== "available") return null;
  const count = integer(settlements.summary?.completedBlockCount);
  if (count == null) return null;
  // The requested range is seven days, including rest and zero-work buckets.
  // Do not extrapolate only the active buckets or a partial current day.
  return { n: count, d: 7n };
}
/** @param {import('./types.js').Squeek} s @param {import('./types.js').Economy | null} economy @returns {import('./types.js').Fraction | null} */
export function poolShare(s, economy) {
  if (
    economy?.status !== "available" ||
    economy.release?.rewardModelRevision !== SUPPORTED_REWARD_MODEL
  )
    return null;
  if (economy.release?.id && s.release?.id !== economy.release.id) return null;
  const power = integer(s.basePower),
    nft = integer(economy.staking?.totalNftPower),
    sqk = integer(economy.staking?.totalSqkPower);
  if (power == null || nft == null || sqk == null || nft + sqk <= 0n)
    return null;
  return { n: power * POWER_SCALE, d: nft + sqk };
}
/** @param {import('./types.js').Squeek} s @param {import('./types.js').Account | null} account @param {import('./types.js').LadderRow[]} ladder @returns {import('./types.js').Partner | null} */
export function mergePartner(s, account, ladder) {
  const level = s.level;
  if (
    !level ||
    s.mergeState !== "ready" ||
    s.economy?.mergesOpen !== true ||
    s.economy?.stakingPaused !== false ||
    s.custody?.burned ||
    s.custody?.stray ||
    (integer(s.pendingRound) ?? 0n) > 0n
  )
    return null;
  if (
    account?.status !== "available" ||
    account.economy?.mergesOpen !== true ||
    account.economy?.stakingPaused !== false ||
    (account.release?.id && account.release.id !== s.release?.id)
  )
    return null;
  const next = ladder.find((row) => row.level === level + 1);
  if (!next || level >= (s.economy?.maximumLevel ?? 0)) return null;
  const partner = account.tokens?.find(
    (t) =>
      t.tokenId !== s.tokenId &&
      t.level === level &&
      t.mergeState === "ready" &&
      !(
        typeof t.custody === "object" &&
        (t.custody.burned || t.custody.stray)
      ) &&
      !((integer(t.pendingRound) ?? 0n) > 0n),
  );
  if (!partner) return null;
  return {
    tokenId: partner.tokenId,
    level,
    nextLevel: level + 1,
    nextPower: next.power,
    conditional: next.source !== "contract",
  };
}
/** @param {import('./types.js').Card} card @param {import('./types.js').Economy | null} economy @param {import('./types.js').Partner | null} partner @returns {import('./types.js').Fraction | null} */
export function score(card, economy, partner) {
  if (
    card.status !== "ready" ||
    !card.data ||
    card.data.custody?.burned ||
    card.data.custody?.stray
  )
    return null;
  const price = parsePrice(card.price),
    power = integer(card.data.basePower),
    held = custody(card.data, economy);
  if (
    !price ||
    price.numerator <= 0n ||
    power == null ||
    held === "unknown" ||
    held === "stray" ||
    held === "burned"
  )
    return null;
  // Bonuses are additive: +25% and -10% together give a 1.15 multiplier.
  const bonus = 100n + (partner ? 25n : 0n) - (held === "staking" ? 10n : 0n);
  return { n: power * price.denominator * bonus, d: price.numerator * 100n };
}
/** @param {import('./types.js').Fraction} a @param {import('./types.js').Fraction} b */
export function compare(a, b) {
  const delta = a.n * b.d - b.n * a.d;
  return delta > 0n ? 1 : delta < 0n ? -1 : 0;
}
/** @param {string} hash */
export function readHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const ids = (params.get("ids") ?? "").split("-");
  const prices = (params.get("prices") ?? "").split("-");
  /** @type {{id: string; price: string}[]} */ const entries = [];
  const seen = new Set();
  for (let i = 0; i < ids.length && entries.length < 3; i++) {
    const id = tokenId(ids[i]);
    if (id && !seen.has(id)) {
      entries.push({ id, price: parsePrice(prices[i] ?? "")?.canonical ?? "" });
      seen.add(id);
    }
  }
  return entries;
}
/** @param {{id:string; price:string}[]} entries */
export function makeHash(entries) {
  return (
    "#ids=" +
    entries.map((e) => e.id).join("-") +
    "&prices=" +
    entries.map((e) => parsePrice(e.price)?.canonical ?? "").join("-")
  );
}
/** @param {unknown} value @returns {value is string} */
export function svgDataUri(value) {
  return (
    typeof value === "string" &&
    /^data:image\/svg\+xml(?:;charset=[a-z0-9-]+)?[;,]/i.test(value) &&
    value.length < 1000000
  );
}
