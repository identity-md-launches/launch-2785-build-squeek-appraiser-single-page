// Deterministic test scenarios. These are not shown in the application or represented as live data.
export const owner = "0x598958abf7d8db8dd468cb53dd6ba705581bff54";
export const proxy = "0x4b67b739dfd832f4eac67a7aa3bc244fb74cea4f";
export const mining = "0xcd46990f8349057335289ef282c276204b6cdc62";
export const nft = "0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6";
export const core = "0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44";
export const token = "0x5501e1fa81be1c3f49225fa7668da0245d07db60";
export const release = {
  id: "stream-game-sepolia-test-20261026-01",
  rewardModelRevision: "funded-stream-q128-1",
};
export const context = {
  currentRound: "731",
  coreBlockHeight: "5204",
  maximumLevel: 10,
  mergesOpen: true,
  stakingPaused: false,
};
export const powers = [
  "1000",
  "2200",
  "4840",
  "10648",
  "23426",
  "51536",
  "113380",
  "249436",
  "548759",
  "1207269",
];
export const cooldowns = [
  "0",
  "3000",
  "7000",
  "14000",
  "21000",
  "28000",
  "35000",
  "42000",
  "49000",
  "0",
];
export function economy() {
  return {
    status: "available",
    generatedAt: new Date().toISOString(),
    release,
    chain: {
      chainId: "11155111",
      safeThroughBlock: "12034760",
      safeBlockTimestamp: new Date().toISOString(),
    },
    identities: { core, token, mining: { proxy: mining }, staking: { proxy } },
    staking: {
      totalNftPower: "96800000000000000000000",
      totalSqkPower: "0",
      sqkPerPower: "40000000000000000000",
      paused: false,
    },
    nft: {
      maximumLevel: 10,
      mergesOpen: true,
      basePower: powers,
      cooldownBlocks: cooldowns,
    },
  };
}
export function squeek(id = "12", opts = {}) {
  return {
    status: "available",
    tokenId: id,
    generatedAt: new Date().toISOString(),
    chain: { chainId: "11155111", safeThroughBlock: "12034760" },
    release,
    economy: { ...context },
    level: 1,
    basePower: "1000",
    mergeState: "ready",
    nextMergeHeight: "0",
    custody: { owner, depositor: null, stray: false, burned: false },
    metadata: {
      status: "available",
      name: `Squeek #${id}`,
      imageDataUri:
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#cbdba8"/><circle cx="150" cy="145" r="75" fill="#4c6244"/><circle cx="122" cy="130" r="7" fill="#faf5e2"/><circle cx="175" cy="130" r="7" fill="#faf5e2"/></svg>',
        ),
      attributes: [{ traitType: "Palette", value: "Test fixture" }],
    },
    ...opts,
  };
}
export function account() {
  return {
    status: "available",
    account: owner,
    release,
    chain: { chainId: "11155111", safeThroughBlock: "12034760" },
    economy: { ...context },
    tokens: [
      {
        tokenId: "1",
        level: 1,
        basePower: "1000",
        custody: "wallet",
        mergeState: "ready",
        nextMergeHeight: "0",
      },
    ],
    nextCursor: null,
  };
}
export function settlements() {
  return {
    status: "available",
    chain: { chainId: "11155111" },
    summary: { completedBlockCount: "5204" },
    window: { startAt: "2026-10-25T12:00:00Z", endAt: "2026-11-01T12:00:00Z" },
    buckets: [{ completedBlockCount: "0" }, { completedBlockCount: "5204" }],
  };
}
export function deployment() {
  return {
    chainId: 11155111,
    contracts: {
      SqueekCore: { address: core },
      SqueekToken: { address: token },
      SqueekMining: { address: mining },
      SqueekStaking: { address: proxy },
      SqueekNFT: { address: nft },
    },
  };
}
export const ladder = powers.map((p, i) => ({
  level: i + 1,
  power: BigInt(p),
  cooldown: BigInt(cooldowns[i]),
  source: "api",
}));
