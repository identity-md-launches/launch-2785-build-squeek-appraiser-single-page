export type Custody = {
  owner?: string | null;
  depositor?: string | null;
  stray?: boolean;
  burned?: boolean;
};
export type Identity =
  | string
  | {
      proxy?: string;
      implementation?: string;
      implementationVersion?: string;
      storageLayoutDigest?: string;
    };
export type Envelope = {
  status?: string;
  reason?: string;
  generatedAt?: string;
  release?: {
    id?: string;
    protocolRevision?: string;
    rewardModelRevision?: string;
  };
  chain?: {
    chainId?: string;
    safeThroughBlock?: string;
    safeBlockHash?: string;
    safeBlockTimestamp?: string;
  };
  identities?: Record<string, Identity | null>;
};
export type Context = {
  currentRound?: string;
  coreBlockHeight?: string;
  mergesOpen?: boolean;
  stakingPaused?: boolean;
  maximumLevel?: number;
};
export type Squeek = Envelope & {
  tokenId?: string;
  level?: number;
  basePower?: string;
  custody?: Custody;
  nextMergeHeight?: string;
  mergeState?: string | null;
  economy?: Context;
  pendingWeight?: string;
  pendingRound?: string;
  metadata?: {
    status?: string;
    name?: string;
    description?: string;
    imageDataUri?: string;
    attributes?: { traitType?: string; trait_type?: string; value?: unknown }[];
  } | null;
};
export type Economy = Envelope & {
  lifecycle?: { currentRound?: string; paused?: boolean };
  staking?: {
    totalNftPower?: string;
    totalSqkPower?: string;
    sqkPerPower?: string;
    referencePower?: string;
    paused?: boolean;
    rewards?: { fundedBaseUnits?: string; remainingBaseUnits?: string };
  } | null;
  mining?: { pendingCurve?: unknown };
  nft?: {
    maximumLevel?: number;
    mergesOpen?: boolean;
    basePower?: string[];
    cooldownBlocks?: string[];
  };
};
export type Settlement = Envelope & {
  window?: { startAt?: string; endAt?: string; bucketSeconds?: number };
  summary?: { completedBlockCount?: string };
  buckets?: {
    startAt?: string;
    endAt?: string;
    completedBlockCount?: string;
  }[];
};
export type AccountToken = {
  tokenId: string;
  level?: number;
  basePower?: string;
  custody?: string | Custody;
  nextMergeHeight?: string;
  mergeState?: string;
  pendingWeight?: string;
  pendingRound?: string;
};
export type Account = Envelope & {
  account?: string;
  economy?: Context;
  tokens?: AccountToken[];
  nextCursor?: string | null;
  power?: { nftPower?: string; sqkPower?: string };
  rewards?: { claimableBaseUnits?: string };
  earnings?: { date: string; earnedBaseUnits: string }[];
};
export type Deployment = {
  chainId?: number | string;
  release?: string;
  contracts?: Record<
    string,
    {
      address?: string;
      implementation?: string;
      implementationVersion?: number | string;
      storageLayoutDigest?: string;
      kind?: string;
    }
  >;
};
export type LadderRow = {
  level: number;
  power: bigint;
  cooldown: bigint;
  source: "contract" | "api";
};
export type ContractContext = {
  status: "verified" | "mismatch" | "unavailable";
  message: string;
  mining?: string;
  nft?: string;
  block?: string;
  blockHash?: string;
  ladder: LadderRow[];
};
export type TokenCheck = {
  owner: string;
  name?: string;
  image?: string;
  pendingPower?: bigint;
  pendingRound?: bigint;
  block: string;
};
export type Card = {
  id: string;
  price: string;
  status: "loading" | "ready" | "error";
  data?: Squeek;
  error?: string;
  checkedAt?: number;
  contract?: TokenCheck;
  contractError?: string;
};
export type Price = {
  numerator: bigint;
  denominator: bigint;
  canonical: string;
};
export type Fraction = { n: bigint; d: bigint };
export type Partner = {
  tokenId: string;
  level: number;
  nextLevel: number;
  nextPower: bigint;
  conditional: boolean;
};
