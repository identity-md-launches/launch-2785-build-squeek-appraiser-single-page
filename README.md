# Squeek Appraiser

A single-page buyer’s desk for comparing up to three Squeeks: onchain art, power, staking reward share, merge readiness, asking prices and merge partners in an optional read-only wallet. The verdict explains which candidate gives the most adjusted power per ETH.

**The delivered website is `dist/index.html`.** Its HTML, CSS, JavaScript, fonts, favicon and share image are complete, with relative asset URLs for IPFS gateways, ENS and ordinary static hosts. Hosting and GitHub publication are handled by the assignment’s publisher; this repository contains the export to publish.

## Preview, install and rebuild

Node.js 22 or newer is recommended for local tools. The website itself is native HTML/CSS/JavaScript, with no runtime dependencies, framework, backend or required compilation. `src/` is directly servable too. Serve through HTTP; ES modules do not work reliably from `file://`.

```sh
# Preview the delivered export; no dependency installation needed
npm run preview
# Open http://localhost:4173/preview/

# Optional: recreate dist/ from src/ with a built-in Node copy script
npm run build

# Install only development/checking dependencies from the lockfile
npm ci
npm run typecheck
npm test
npm run check:bundle
```

`npm run build` replaces `dist/` with a copy of `src/`, excluding type declarations. It does not download data, compile scripts or depend on `node_modules`. Commit source, package files and `dist/` together when making changes; the publisher serves the export without rebuilding. Keep dependency trees and caches out of the submission. `.gitignore` has an explicit 512-byte budget in `artifacts/bundle-budget.json`; `dist/` is deliberately included.

For repeatable browser interaction checks:

```sh
npx playwright install chromium webkit
npm run validate:browser
```

On Linux, browser system libraries may also be needed. The browser validation script records a concrete WebKit launch limitation if those libraries are absent. Check the resulting `test/scratch/browser-validation/results.json`; scratch output is disposable and is not submitted. `PLAYWRIGHT_MODULE` and `AXE_MODULE` optionally point to externally installed check tools. `PORT` changes the preview port. None of these are site settings or credentials.

`node scripts/make-social.mjs` optionally regenerates the committed 1200 × 630 share image using Playwright. It is not part of the production build.

## Use

1. Enter one to three token IDs (1–9999). Add optional ETH asking prices using a comma or dot, then select **Appraise Squeeks**.
2. Compare the rows, read the verdict and open each card’s traits, custody and full level ladder. Every displayed input or derived number links to its source.
3. Optionally type an Ethereum address under **Find merge partners in my wallet**. All account pages are loaded, including deposited NFTs. No wallet provider, account connection or signature is used.
4. **Copy comparison link** shares IDs and prices in the hash, such as `#ids=12-45-301&prices=0.02-0.01-0.008`. Missing price positions remain empty. The address and URL query parameters are excluded. When clipboard access is unavailable, a selectable link appears.
5. Re-check custody, level, scheduled power and cooldown in the same minute as a trade. A safe-block snapshot is not transaction-time confirmation: the seller can still act until transfer execution.

Zero and missing prices are accepted but unranked. Invalid IDs, duplicate candidates and malformed prices get recoverable inline errors. Ties are disclosed. Burned or missing tokens get a per-card error. Unknown service data never becomes a zero or empty portfolio. Refresh and retry actions are explicit; a 429 `Retry-After` deadline is respected per origin, without a request loop.

## Sources and the deployment mismatch

All Squeekchain sources were read live on 31 October 2026. The release discrepancy is important:

- The [published deployment record](https://docs.squeekchain.com/assets/deployments/sepolia.json) identifies `squeeks-sepolia-core3-mining6-001`, with no staking proxy.
- The [economy API](https://api.squeekchain.com/v1/economy/state) identifies `stream-game-sepolia-test-20261026-01`, mining version 9 and staking version 2. Its core, token and mining addresses differ from the published record.
- A read of the documented mining deployment returned Level 2 power **3,000**; the current API returns **2,200**. These are different releases, not interchangeable numbers.

The app fetches the deployment record and compares identities before contract reads. **On the current live sources, contract verification is unavailable.** It shows a visible warning, uses a separately labelled API policy fallback for the complete ladder, and shows scheduled power as unknown. It does not guess the current NFT address, call the old deployment as if it were current, or claim the fallback came from `weightForLevel`.

The complete contract path is implemented and tested against deterministic matching-record fixtures. When the published record and API identities match, it verifies the chain, deployed mining/NFT code, core/token links, collection NFT and maximum level; reads all levels with `weightForLevel(0, level)` and `cooldownBlocks(0, level)`; and reads `ownerOf`, `tokenURI` and `position` at the API’s one safe Sepolia block. Ownership conflicts suppress scoring. This is a read consistency check, not a governance or bytecode security audit. Update the ABI-specific decoding if Squeekchain changes the published interface.

Actual observations are preserved in [artifacts/source-observations.json](artifacts/source-observations.json). This external mismatch prevents a live, contract-verified appraisal today; no requester-owned configuration or missing key is involved.

| Source                                                                                                                                                                                                                                                                                                                                                        | Use                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Complete docs](https://docs.squeekchain.com/llms-full.txt), [Squeeks](https://docs.squeekchain.com/squeeks.md), [Power](https://docs.squeekchain.com/squeeks/power.md), [Merging](https://docs.squeekchain.com/squeeks/merge.md), [Ownership](https://docs.squeekchain.com/squeeks/ownership.md), [Staking](https://docs.squeekchain.com/rewards/staking.md) | Concepts, transfer checklist, cooldown semantics and release comparison. The ownership/claim pages describe the earlier NFT-attached reward model; they are not used to overwrite current account-based rewards. |
| [API reference](https://docs.squeekchain.com/developers/api.md)                                                                                                                                                                                                                                                                                               | Public API schemas, decimal strings, safe-block freshness, account pagination and unknown/error semantics.                                                                                                       |
| `GET https://api.squeekchain.com/v1/squeeks/{id}`                                                                                                                                                                                                                                                                                                             | Live level, whole-unit base power, custody, merge state, next merge height, image and traits. Images are SVG data URIs rendered only in `<img>`.                                                                 |
| `GET https://api.squeekchain.com/v1/economy/state`                                                                                                                                                                                                                                                                                                            | Release and identities, staking pool powers, pause status, full API power/cooldown fallback and maximum level.                                                                                                   |
| `GET https://api.squeekchain.com/v1/accounts/{address}?limit=100[&cursor=…]`                                                                                                                                                                                                                                                                                  | All owned/deposited Squeeks and merge partners. Account rewards are account balances, not attached NFT credit. Mixed-release or mixed-block pages are rejected.                                                  |
| `GET https://api.squeekchain.com/v1/settlements?range=7d`                                                                                                                                                                                                                                                                                                     | `summary.completedBlockCount`, with rest and zero-work periods retained over the seven-day range.                                                                                                                |
| [Deployment record](https://docs.squeekchain.com/assets/deployments/sepolia.json)                                                                                                                                                                                                                                                                             | Expected contract addresses and implementation identities. Fetched live, never supplied by a visitor.                                                                                                            |
| [Mining ABI](https://docs.squeekchain.com/assets/abi/SqueekMining.json), [NFT ABI](https://docs.squeekchain.com/assets/abi/SqueekNFT.json), [mining reference](https://docs.squeekchain.com/developers/mining.md)                                                                                                                                             | Verified read selectors and tuple/string decoding. No transaction ABI or signing flow is used.                                                                                                                   |
| [Public Sepolia RPC](https://ethereum-sepolia-rpc.publicnode.com)                                                                                                                                                                                                                                                                                             | Browser contract reads on chain 11155111 after identity agreement. Endpoint is in `src/config.js`; only JSON-RPC reads are allowed.                                                                              |
| User-entered ETH price                                                                                                                                                                                                                                                                                                                                        | An asking-price comparison input, never a price feed or onchain amount. Source links return to the shortlist without changing the share hash.                                                                    |

API reads are independent snapshots, at 12 confirmations and potentially cached for 5 seconds. They may span safe blocks. Cards, wallet and pool expose the available block/time provenance; the app does not describe them as one atomic transaction snapshot. Unknown nested totals, zero total pool power, an unsupported reward model and cross-release data produce an unknown share.

## Calculations and scoring

All chain integers and API big-number decimal strings use `BigInt`. Prices use arbitrary-precision integer fractions (up to 512 input characters), not floating point or an 18-decimal wei truncation. Only bounded levels and display timestamps use JavaScript numbers.

- **Current pool share:** `basePower × 10^18 / (totalNftPower + totalSqkPower)`. The current funded-stream API reports pool powers in 18-decimal units, while NFT base power is in whole units. Level 1 at the observed pool is approximately 1.033058%, not 0.000000000000000001%.
- **Reward illustration:** share × 1,000 SQK distributed as staking rewards. It is not a share of every SQK minted and is not a promised daily yield.
- **Wallet-held share:** labelled **once deposited (estimate)** at the current pool composition, as requested. Depositing increases total power, so the actual post-deposit share can differ. No claim of a fixed future pool is made.
- **Cooldown:** `max(nextMergeHeight − coreBlockHeight, 0)` Squeek blocks. The seven-day pace is `completedBlockCount / 7`; estimated days are remaining blocks divided by that pace. No positive pace means days are unknown. Rest is included and can make future waits longer.
- **Power per 0.01 ETH:** `power × 0.01 / enteredPrice`.
- **Score:** `(power / enteredPrice) × (1 + mergeBonus − withdrawalPenalty)`, with `mergeBonus = 0.25` for a same-level ready partner in the loaded wallet today and `withdrawalPenalty = 0.10` when the candidate is held by the staking proxy with a depositor. Adjustments are additive; both produce ×1.15.

Fractions are compared by cross multiplication, so rounding never chooses the winner. Prices must be positive for ranking. All available, purchasable candidates need a price and known custody before a verdict is given. Unavailable candidates are explicitly excluded from a provisional verdict. Squeeks already owned or deposited by the loaded wallet are excluded from the purchase ranking. Ties stay ties.

Partner checks require both merge states ready, the same level below the maximum, open merges and unpaused staking. Known scheduled changes block the match. The partner cannot be the candidate itself. A match uses the verified ladder when available or the explicitly labelled API policy otherwise; re-check both NFTs at execution. One NFT is permanently burned in a merge. Existing partner cost, network fees, art preferences, future pool changes and actual market value are outside the score.

Ratios are rounded only for presentation; tiny positive values show an upper bound such as `<0.000001`, rather than a misleading zero. The verdict is a relative comparison of the supplied prices, not a market valuation. Testnet SQK and Squeeks have no monetary value.

For the current `funded-stream-q128-1` release, **no unclaimed SQK travels with the NFT**: rewards accrue to the depositor’s account. A staked NFT must be withdrawn by its depositor before transfer, then deposited by the buyer to earn again. Unknown reward revisions are explicitly unknown.

## Structure and validation

- `src/`: deployable source; `app.js` coordinates inputs/reads, `data.js` handles API/RPC, `domain.js` contains exact calculations, `view.js` renders decisions, and `ui.js` creates safe DOM elements.
- `src/types.d.ts` and `tsconfig.json`: strict TypeScript checking of native JavaScript through JSDoc, without compiling browser files.
- `dist/`: finished static export; no source maps, dependency archives or registry mirror.
- `scripts/`: copy build, local preview, browser validation, share-image generation and bundle checks.
- `test/`: meaningful deterministic unit tests and reusable browser fixtures. Fixtures never appear in the product.
- `DESIGN.md`: implemented tokens, typography, components and responsive behavior.
- `artifacts/validation.md`: six-domain design review, fixes, evidence and limitations.

Actual checks on the final implementation: production export and strict typecheck passed; **21 unit/data tests** passed; **19 Chromium interaction groups** passed (`npm run validate:browser`); axe reported **zero violations** in light and dark; the pinned taste probe passed **16/16** checks. The main action ends at **485px** on the 390 × 844 initial screen. Rendered result checks cover 320, 390, 768 and 1440 widths with no page overflow. The comparison scrolls inside its own box and keeps its row labels visible.

Revision checks: a 30-decimal asking price (`#ids=12-45&prices=0.000000000000000000000000000001-0.01`) keeps the page at the viewport width at 320 and 390 with the full price wrapped inside the verdict; before the fix the same fixture produced a 424px page at 320. The verdict reasons and every card's power value carry source links. Holding the `#45` read while `#12`'s Traits & custody is open and focused, then releasing it, keeps focus, the open disclosure and its on-screen position; loading and clearing a wallet keeps both open card disclosures. Before the fix, focus fell to `BODY`. The taste probe also passed 16/16 on the live tiny-price URL.

Live browser reads checked #12, #45, #301 and staked #8889, plus the public depositor account; images, staking custody, account loading, merge matches and source warnings worked with no console errors. The matching-record RPC path was fixture-tested; live verification remains unavailable because the sources disagree. WebKit was attempted but could not launch due to missing Linux libraries. Screen-reader sessions, physical devices and native browser zoom were not performed. See the validation report for the precise scope; these are worker observations, not independent certification.

## Privacy and safety

No wallet connectors, transactions, signatures, keys, analytics, cookies, local storage or backend. The app never touches a browser wallet provider. Metadata is assigned through DOM text properties, and onchain SVG is never inserted as markup. Public API/RPC/docs services receive the requests needed for your reads; wallet addresses are publicly queried only after you choose **Load Squeeks**. Clearing the wallet removes it from page state. The hash contains IDs and prices only.

Fonts are bundled locally under the SIL Open Font License. See [artifacts/THIRD_PARTY_NOTICES.md](artifacts/THIRD_PARTY_NOTICES.md) for font and design-reference attribution.
