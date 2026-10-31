// Public read endpoints only. This application never accesses an Ethereum provider.
export const API = "https://api.squeekchain.com/v1";
export const DOCS = "https://docs.squeekchain.com";
export const DEPLOYMENT = `${DOCS}/assets/deployments/sepolia.json`;
export const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const EXPLORER = "https://eth-sepolia.blockscout.com";
export const POWER_SCALE = 10n ** 18n;
export const SUPPORTED_REWARD_MODEL = "funded-stream-q128-1";
// First four bytes of keccak256(signature), checked against the published ABIs.
export const SELECTORS = Object.freeze({
  weight: "f9970ffb",
  cooldown: "b223bbc7",
  collection: "b08d4bea",
  core: "f2f4eb26",
  token: "fc0c546a",
  owner: "6352211e",
  uri: "c87b56dd",
  position: "7400ef36",
});
