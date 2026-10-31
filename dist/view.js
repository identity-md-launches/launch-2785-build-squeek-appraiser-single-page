import {
  API,
  DOCS,
  EXPLORER,
  POWER_SCALE,
  SUPPORTED_REWARD_MODEL,
} from "./config.js";
import {
  integer,
  number,
  decimal,
  parsePrice,
  custody,
  blocksLeft,
  dailyPace,
  poolShare,
  mergePartner,
  score,
  compare,
  svgDataUri,
} from "./domain.js";
import { el, source, button, fact } from "./ui.js";

/** @typedef {{cards: import('./types.js').Card[]; economy: import('./types.js').Economy | null; settlements: import('./types.js').Settlement | null; account: import('./types.js').Account | null; ctx: import('./types.js').ContractContext | null; busy: boolean; walletBusy: boolean}} ViewState */
/** @param {import('./types.js').Card} c @param {ViewState} state */
export function partnerFor(c, state) {
  if (!c.data || c.contractError || (c.contract?.pendingRound ?? 0n) > 0n)
    return null;
  if (
    state.economy?.release?.id &&
    c.data.release?.id !== state.economy.release.id
  )
    return null;
  return mergePartner(c.data, state.account, state.ctx?.ladder ?? []);
}
/** @param {import('./types.js').Card} c @param {ViewState} state */
export function heldFor(c, state) {
  if (
    !c.data ||
    c.contractError ||
    (state.economy?.release?.id &&
      c.data.release?.id !== state.economy.release.id)
  )
    return "unknown";
  return custody(c.data, state.economy);
}
/** @param {import('./types.js').Card} card @param {ViewState} state */
export function scoreFor(card, state) {
  if (
    card.contractError ||
    state.walletBusy ||
    state.busy ||
    ownedByBuyer(card, state) ||
    heldFor(card, state) === "unknown"
  )
    return null;
  return score(card, state.economy, partnerFor(card, state));
}
/** @param {import('./types.js').Card} card @param {ViewState} state */
export function ownedByBuyer(card, state) {
  return (
    state.account?.status === "available" &&
    Boolean(state.account.tokens?.some((t) => t.tokenId === card.id))
  );
}
/** @param {ViewState} state */
export function verdict(state) {
  const panel = el("div", "verdict waiting");
  if (state.busy || state.walletBusy) {
    panel.append(
      el("h2", "", "Reading your shortlist…"),
      el("p", "muted", "Each card fills in as its public reads arrive."),
    );
    return panel;
  }
  const ready = state.cards.filter(
    (c) => c.status === "ready" && !ownedByBuyer(c, state),
  );
  if (!ready.length && state.cards.some((c) => ownedByBuyer(c, state))) {
    panel.append(
      el("h2", "", "These Squeeks are already yours"),
      el(
        "p",
        "muted",
        "Owned and deposited Squeeks are kept out of the purchase ranking. Add a Squeek you are considering buying.",
      ),
    );
    return panel;
  }
  if (!ready.length) {
    panel.append(
      el("h2", "", "No appraisal yet"),
      el(
        "p",
        "muted",
        "Check the card errors, then retry or enter another Squeek.",
      ),
    );
    return panel;
  }
  const ranked = ready.map((card) => ({ card, score: scoreFor(card, state) }));
  if (ranked.some((item) => !item.score)) {
    const missingPrice = ready.some(
      (card) => (parsePrice(card.price)?.numerator ?? 0n) <= 0n,
    );
    panel.append(
      el(
        "h2",
        "",
        missingPrice
          ? "Add a price for your best pick"
          : "Some details need a re-check",
      ),
      el(
        "p",
        "muted",
        missingPrice
          ? "Enter a positive asking price for each available Squeek, then appraise again for a best pick."
          : "Custody or power is unknown, or a card has a blocker. Read the card notices and refresh the public reads before comparing prices.",
      ),
    );
    panel.append(formulaLink());
    return panel;
  }
  const scored =
    /** @type {{card: import('./types.js').Card; score: import('./types.js').Fraction}[]} */ (
      ranked
    );
  scored.sort((a, b) => compare(b.score, a.score));
  const best = scored[0];
  const ties = scored.filter((item) => compare(best.score, item.score) === 0);
  panel.classList.remove("waiting");
  const heading = el("div");
  if (ties.length > 1)
    heading.append(
      el("h2", "verdict-heading", "A tie on value. Pick your favorite."),
    );
  else
    heading.append(
      el(
        "h2",
        "verdict-heading",
        `Buy Squeek #${best.card.id} if you buy one of these`,
      ),
    );
  const incomplete = state.cards.some((c) => c.status !== "ready");
  heading.append(
    el(
      "p",
      "verdict-caption",
      incomplete
        ? "Provisional: compares available Squeeks only. Unavailable cards are excluded."
        : state.ctx?.status !== "verified"
          ? "Based on API data. Contract verification is unavailable; re-check before buying."
          : "A comparison of your asking prices, at this snapshot.",
    ),
  );
  if (state.cards.some((c) => ownedByBuyer(c, state)))
    heading.append(
      el(
        "p",
        "verdict-caption",
        "Squeeks already in your loaded wallet are excluded from the purchase ranking.",
      ),
    );
  heading.append(formulaLink());
  panel.append(heading);
  const reasons = el("ul");
  if (ties.length > 1)
    reasons.append(
      el(
        "li",
        "",
        ties.map((t) => `#${t.card.id}`).join(", ") +
          " have equal scores under this formula.",
      ),
    );
  else {
    const price = parsePrice(best.card.price),
      power = integer(best.card.data?.basePower);
    if (price && power != null)
      reasons.append(
        el(
          "li",
          "",
          `${number(power)} power for ${price.canonical} ETH: ${decimal(power * price.denominator, price.numerator * 100n)} power per 0.01 ETH.`,
        ),
      );
    if (scored.length > 1) {
      const second = scored[1];
      const diffN =
        best.score.n * second.score.d - second.score.n * best.score.d;
      reasons.append(
        el(
          "li",
          "",
          `${decimal(diffN * 100n, best.score.d * second.score.n, 1)}% higher adjusted score than #${second.card.id}.`,
        ),
      );
    } else
      reasons.append(
        el(
          "li",
          "",
          "It is the only available candidate. Add another to compare value.",
        ),
      );
  }
  const partner = partnerFor(best.card, state),
    held = heldFor(best.card, state);
  if (partner)
    reasons.append(
      el(
        "li",
        "",
        `Ready match with your #${partner.tokenId}: Level ${partner.nextLevel} with ${number(partner.nextPower)} power (+25% score).${held === "staking" ? " Withdraw before transfer and deposit again." : ""}`,
      ),
    );
  else if (held === "wallet")
    reasons.append(
      el(
        "li",
        "",
        "Held in a wallet, so there is no staking withdrawal step before transfer. Deposit it to start earning.",
      ),
    );
  if (held === "staking")
    reasons.append(
      el(
        "li",
        "",
        "It must be withdrawn by its depositor before transfer (−10% score). Earning resumes only after your deposit.",
      ),
    );
  panel.append(reasons);
  return panel;
}
function formulaLink() {
  const link = el("a", "formula-link", "How we score ↓");
  link.href = "#sources";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const detail = document.querySelector("#sources");
    if (detail instanceof HTMLDetailsElement) {
      detail.open = true;
      detail.scrollIntoView({ block: "start" });
      detail.querySelector("summary")?.focus();
    }
  });
  return link;
}
/** @typedef {{label:string; numeric?:boolean; direction?:'max'|'min'; value:(c:import('./types.js').Card)=>string; rank?:(c:import('./types.js').Card)=>import('./types.js').Fraction|null; note?:(c:import('./types.js').Card)=>string; sources?:(c:import('./types.js').Card)=>HTMLAnchorElement[]}} ComparisonRow */
/** @param {ViewState} state */
export function comparison(state) {
  const head = el("thead"),
    hr = el("tr");
  hr.append(el("th", "", "At a glance"));
  for (const c of state.cards) {
    const th = el("th", "", `Squeek #${c.id}`);
    th.scope = "col";
    hr.append(th);
  }
  head.append(hr);
  const body = el("tbody");
  /** @param {import('./types.js').Card} c */ const tokenSource = (c) =>
    source(`${API}/squeeks/${c.id}`, "source ↗", `Squeek #${c.id} API`);
  /** @type {ComparisonRow[]} */ const rows = [
    {
      label: "Level",
      numeric: true,
      direction: "max",
      value: (c) => String(c.data?.level ?? "Unknown"),
      rank: (c) => (c.data?.level ? { n: BigInt(c.data.level), d: 1n } : null),
      sources: (c) => [tokenSource(c)],
    },
    {
      label: "Base power",
      numeric: true,
      direction: "max",
      value: (c) => number(integer(c.data?.basePower)),
      rank: (c) => {
        const n = integer(c.data?.basePower);
        return n == null ? null : { n, d: 1n };
      },
      sources: (c) => [tokenSource(c)],
    },
    {
      label: "Earning status",
      value: (c) =>
        ({
          staking: "In staking",
          wallet: "In wallet",
          stray: "Stray in staking",
          burned: "Burned",
          unknown: "Unknown",
        })[heldFor(c, state)],
      direction: "max",
      rank: (c) => {
        const h = heldFor(c, state);
        return h === "staking"
          ? { n: 1n, d: 1n }
          : h === "wallet"
            ? { n: 0n, d: 1n }
            : null;
      },
      note: (c) =>
        heldFor(c, state) === "staking"
          ? "Earning; depositor must withdraw"
          : heldFor(c, state) === "wallet"
            ? "Not earning; deposit after buying"
            : "Custody must be checked",
      sources: (c) => [tokenSource(c)],
    },
    {
      label: "Share of staking rewards",
      numeric: true,
      direction: "max",
      value: (c) => {
        const s = c.data ? poolShare(c.data, state.economy) : null;
        return s ? decimal(s.n * 100n, s.d, 6) + "%" : "Unknown";
      },
      rank: (c) => (c.data ? poolShare(c.data, state.economy) : null),
      note: (c) =>
        heldFor(c, state) === "wallet"
          ? "Estimate once deposited"
          : "At the current pool composition",
      sources: (c) => [
        tokenSource(c),
        source(`${API}/economy/state`, "pool source ↗"),
      ],
    },
    {
      label: "Cooldown blocks left",
      numeric: true,
      direction: "min",
      value: (c) => {
        const left = c.data ? blocksLeft(c.data) : null;
        return left === 0n && c.data?.mergeState === "ready"
          ? "Ready · 0"
          : number(left);
      },
      rank: (c) => {
        if (!c.data || !["ready", "cooldown"].includes(c.data.mergeState ?? ""))
          return null;
        const n = blocksLeft(c.data);
        return n == null ? null : { n, d: 1n };
      },
      note: (c) =>
        c.data?.mergeState === "terminal"
          ? "Maximum level"
          : c.data?.economy?.mergesOpen === false
            ? "Merges are closed"
            : "Squeek blocks, not Ethereum blocks",
      sources: (c) => [tokenSource(c)],
    },
    {
      label: "Asking price",
      numeric: true,
      direction: "min",
      value: (c) => {
        const p = parsePrice(c.price);
        return p ? p.canonical + " ETH" : "Not supplied";
      },
      rank: (c) => {
        const p = parsePrice(c.price);
        return p ? { n: p.numerator, d: p.denominator } : null;
      },
      sources: () => [
        source(
          "#shortlist-title",
          "your input ↑",
          "Asking price entered in the shortlist",
        ),
      ],
    },
    {
      label: "Power per 0.01 ETH",
      numeric: true,
      direction: "max",
      value: (c) => {
        const p = parsePrice(c.price),
          n = integer(c.data?.basePower);
        return p && p.numerator > 0n && n != null
          ? decimal(n * p.denominator, p.numerator * 100n)
          : "Unranked";
      },
      rank: (c) => {
        const p = parsePrice(c.price),
          n = integer(c.data?.basePower);
        return p && p.numerator > 0n && n != null
          ? { n: n * p.denominator, d: p.numerator * 100n }
          : null;
      },
      sources: (c) => [
        tokenSource(c),
        source("#shortlist-title", "price input ↑"),
      ],
    },
    {
      label: "Merges with yours",
      direction: "max",
      value: (c) => {
        const p = partnerFor(c, state);
        return state.walletBusy
          ? "Checking…"
          : p
            ? `#${p.tokenId} → Level ${p.nextLevel}`
            : state.account
              ? "No ready partner"
              : "Load your wallet";
      },
      rank: (c) =>
        state.account ? { n: partnerFor(c, state) ? 1n : 0n, d: 1n } : null,
      note: (c) => {
        const p = partnerFor(c, state);
        return p
          ? `${number(p.nextPower)} power${p.conditional ? " · API policy" : ""}`
          : "";
      },
      sources: (c) =>
        state.account?.account
          ? [
              source(
                `${API}/accounts/${state.account.account}?limit=100`,
                "wallet source ↗",
              ),
              tokenSource(c),
            ]
          : [],
    },
  ];
  for (const row of rows) {
    const tr = el("tr"),
      th = el("th", "", row.label);
    th.scope = "row";
    tr.append(th);
    const ranks = state.cards.map((c) =>
      c.status === "ready" && row.rank ? row.rank(c) : null,
    );
    /** @type {import('./types.js').Fraction | null} */ let best = null;
    for (const rank of ranks)
      if (
        rank &&
        (!best ||
          (row.direction === "min"
            ? compare(rank, best) < 0
            : compare(rank, best) > 0))
      )
        best = rank;
    for (let i = 0; i < state.cards.length; i++) {
      const c = state.cards[i],
        td = el("td");
      if (c.status !== "ready")
        td.append(
          el(
            "span",
            "muted",
            c.status === "loading" ? "Reading…" : "Unavailable",
          ),
        );
      else {
        const rank = ranks[i],
          winner =
            best && rank && compare(rank, best) === 0 && state.cards.length > 1;
        // A no-partner result is not a positive merge signal, even when tied.
        const meaningful = !(
          row.label === "Merges with yours" && rank?.n === 0n
        );
        if (winner && meaningful) {
          td.classList.add("row-winner");
          td.append(el("span", "row-mark", "✓ Row leader"));
        }
        td.append(
          el("span", "value" + (row.numeric ? " numeric" : ""), row.value(c)),
        );
        const note = row.note?.(c);
        if (note) td.append(el("span", "table-note", note));
        const links = el("div");
        for (const a of row.sources?.(c) ?? []) {
          if (links.childNodes.length) links.append(" · ");
          links.append(a);
        }
        td.append(links);
      }
      tr.append(td);
    }
    body.append(tr);
  }
  return [head, body];
}
/** @param {import('./types.js').Card} c @param {ViewState} state @param {() => void} retry */
export function card(c, state, retry) {
  const article = el("article", "squeek-card");
  article.setAttribute("aria-label", `Squeek #${c.id}`);
  if (c.status === "loading") {
    article.setAttribute("aria-busy", "true");
    article.append(
      el("h3", "", `Squeek #${c.id}`),
      el("p", "loading-label", "Reading public data…"),
    );
    for (const cls of [
      "skeleton skeleton-image",
      "skeleton skeleton-line",
      "skeleton skeleton-line short",
    ]) {
      const line = el("div", cls);
      line.setAttribute("aria-hidden", "true");
      article.append(line);
    }
    return article;
  }
  if (c.status === "error" || !c.data) {
    const error = el("div", "card-error");
    error.append(
      el("h3", "", `Squeek #${c.id}`),
      el("p", "", c.error ?? "Data is unknown."),
      button("Retry this Squeek", retry),
    );
    article.append(error);
    return article;
  }
  const s = c.data,
    held = heldFor(c, state),
    partner = partnerFor(c, state);
  const tokenSource = () =>
    source(
      `${API}/squeeks/${c.id}`,
      "source ↗",
      `Squeek #${c.id} API snapshot`,
    );
  const heading = el("div", "card-heading");
  heading.append(
    el("h3", "", `Squeek #${c.id}`),
    el("span", "card-level", `Level ${s.level ?? "?"}`),
  );
  article.append(heading);
  const visual = el("div", "card-visual");
  const uri = s.metadata?.imageDataUri ?? c.contract?.image;
  if (svgDataUri(uri)) {
    const image = el("img", "nft-image");
    image.src = uri;
    image.alt = s.metadata?.name ?? `Onchain image of Squeek #${c.id}`;
    image.width = 384;
    image.height = 384;
    image.addEventListener("error", () => {
      image.replaceWith(
        el("div", "image-fallback", "Onchain image could not be displayed."),
      );
    });
    visual.append(image);
  } else
    visual.append(
      el(
        "div",
        "image-fallback",
        s.metadata?.status === "pending"
          ? "Onchain image is awaiting a metadata refresh."
          : "Onchain image is unavailable.",
      ),
    );
  visual.append(tokenSource());
  article.append(visual);
  const facts = el("div", "card-facts"),
    power = el("div", "card-power");
  power.append(
    el("span", "numeric", number(integer(s.basePower))),
    el("span", "muted", "base power"),
  );
  facts.append(power);
  if (ownedByBuyer(c, state))
    facts.append(
      el("p", "small good", "Already yours · excluded from purchase ranking"),
    );
  const statusText =
    held === "staking"
      ? "Earning: in staking"
      : held === "wallet"
        ? "Not earning: in wallet"
        : held === "stray"
          ? "Blocked: stray in staking"
          : "Earning status unknown";
  facts.append(
    el(
      "p",
      "card-status " +
        (held === "staking"
          ? "good"
          : held === "stray"
            ? "blocker"
            : "caution"),
      statusText,
    ),
  );
  const list = el("dl", "fact-list");
  const share = poolShare(s, state.economy),
    shareBlock = el("div");
  shareBlock.append(
    el(
      "span",
      "numeric",
      share ? decimal(share.n * 100n, share.d, 6) + "%" : "Unknown",
    ),
  );
  if (share)
    shareBlock.append(
      el(
        "p",
        "",
        `${decimal(share.n * 1000n, share.d, 4)} SQK per 1,000 SQK distributed as staking rewards.`,
      ),
    );
  list.append(
    fact(
      "Share of every staking reward" +
        (held === "wallet" ? " · once deposited (estimate)" : ""),
      shareBlock,
      [tokenSource(), source(`${API}/economy/state`, "pool source ↗")],
      held === "wallet"
        ? "Estimate at the current pool composition; the pool changes when you deposit."
        : "Share changes as the pool changes. Being in staking does not guarantee a positive reward stream.",
    ),
  );
  const readyText = mergeText(s, state.settlements);
  list.append(
    fact(
      "Next merge",
      el(
        "span",
        s.mergeState === "ready" && s.economy?.mergesOpen ? "good" : "caution",
        readyText,
      ),
      [tokenSource(), source(`${API}/settlements?range=7d`, "pace source ↗")],
      s.mergeState === "cooldown"
        ? "Days are an estimate, slower when Squeektoshi rests."
        : "",
    ),
  );
  const recognized = s.release?.rewardModelRevision === SUPPORTED_REWARD_MODEL;
  list.append(
    fact(
      "Unclaimed SQK travelling with it",
      recognized ? "None attached" : "Unknown for this release",
      [
        source(
          `${API}/accounts/${s.custody?.depositor ?? s.custody?.owner ?? ""}`,
          "account rewards ↗",
        ),
        source(`${API}/squeeks/${c.id}`, "release source ↗"),
      ],
      recognized
        ? "In this release, rewards accrue to the depositor’s account. They stay with that account after withdrawal or sale."
        : "Check the release’s reward rules before trading.",
    ),
  );
  if (state.account || state.walletBusy)
    list.append(
      fact(
        "Merge partner in your wallet",
        state.walletBusy
          ? "Checking your Squeeks…"
          : partner
            ? `Merges today into Level ${partner.nextLevel} (power ${number(partner.nextPower)})`
            : "No ready same-level partner found",
        state.account?.account
          ? [
              source(
                `${API}/accounts/${state.account.account}?limit=100`,
                "wallet source ↗",
              ),
              source(`${API}/economy/state`, "level policy ↗"),
            ]
          : [],
        partner
          ? `With your #${partner.tokenId}. You must control both Squeeks at execution; re-check custody first. One NFT is permanently burned.${partner.conditional ? " Uses API policy; contract verification is unavailable." : ""}`
          : "",
      ),
    );
  facts.append(list);
  article.append(facts);
  const bottom = el("div", "card-bottom");
  if (held === "staking")
    bottom.append(
      el(
        "p",
        "notice",
        "The depositor must withdraw this Squeek before it can be transferred. It stops earning on withdrawal until you deposit it again.",
      ),
    );
  else if (held === "wallet")
    bottom.append(
      el(
        "p",
        "small muted",
        "It starts earning only after you deposit it. No seller’s unclaimed account rewards are included.",
      ),
    );
  else if (held === "stray")
    bottom.append(
      el(
        "p",
        "notice error",
        "The staking contract holds this Squeek without a recorded depositor. Ownership and recovery must be resolved before a trade.",
      ),
    );
  if (s.economy?.stakingPaused)
    bottom.append(
      el(
        "p",
        "notice",
        "Staking is paused. Deposits and merges may be unavailable.",
      ),
    );
  if (c.contractError) bottom.append(el("p", "notice error", c.contractError));
  if (state.economy?.release?.id && s.release?.id !== state.economy.release.id)
    bottom.append(
      el(
        "p",
        "notice error",
        "This token and the pool are from different releases. Reward share and scoring are unknown; refresh the reads.",
      ),
    );
  const details = el("details", "card-details");
  details.append(el("summary", "", "Traits & custody"));
  const traits = el("dl", "traits");
  for (const attr of s.metadata?.attributes ?? []) {
    const pair = el("div");
    pair.append(
      el("dt", "", attr.traitType ?? attr.trait_type ?? "Trait"),
      el(
        "dd",
        "",
        typeof attr.value === "string" || typeof attr.value === "number"
          ? String(attr.value)
          : "Unknown",
      ),
    );
    traits.append(pair);
  }
  if (!traits.children.length)
    traits.append(el("p", "muted small", "Traits are unavailable."));
  details.append(traits, tokenSource());
  details.append(
    el("p", "small muted", "Current owner"),
    el("p", "custody-address", s.custody?.owner ?? "Unknown"),
  );
  if (s.custody?.depositor)
    details.append(
      el("p", "small muted", "Depositor"),
      el("p", "custody-address", s.custody.depositor),
    );
  const pending = c.contract?.pendingRound;
  details.append(
    el(
      "p",
      "small muted",
      pending != null
        ? pending > 0n
          ? `Scheduled power change: ${number(c.contract?.pendingPower)} power in round ${number(pending)}.`
          : "Scheduled power change: none at the contract snapshot."
        : "Scheduled power change: unknown. The current Squeek API does not expose it; check the contract immediately before trading.",
    ),
  );
  if (c.contract && state.ctx?.nft)
    details.append(
      source(
        `${EXPLORER}/address/${state.ctx.nft}#readContract`,
        "ownerOf / tokenURI ↗",
        `SqueekNFT ownerOf(${c.id}) and tokenURI(${c.id}) at Sepolia block ${BigInt(c.contract.block)}`,
      ),
    );
  bottom.append(details, ladder(s.level, state));
  const block = s.chain?.safeThroughBlock ?? "unknown",
    generated = s.generatedAt
      ? new Date(s.generatedAt).toLocaleString()
      : "unknown";
  bottom.append(
    el(
      "p",
      "card-snapshot",
      `API read: ${generated}. Safe Sepolia block ${block}.`,
    ),
  );
  if (c.contract)
    bottom.append(
      el(
        "p",
        "card-snapshot",
        `Contract reads pinned to Sepolia block ${BigInt(c.contract.block)}.`,
      ),
    );
  article.append(bottom);
  return article;
}
/** @param {import('./types.js').Squeek} s @param {import('./types.js').Settlement | null} settlements */
export function mergeText(s, settlements) {
  if (
    s.mergeState === "terminal" ||
    (s.level != null && s.level === (s.economy?.maximumLevel ?? 0))
  )
    return "Maximum level";
  if (s.economy?.mergesOpen === false || s.mergeState === "merges_closed")
    return "Merges are closed";
  if (s.mergeState === "ready") return "Ready";
  const left = blocksLeft(s),
    pace = dailyPace(settlements);
  if (s.mergeState !== "cooldown" || left == null) return "Unknown";
  if (left === 0n) return "Cooldown reached; refresh readiness";
  return (
    `${number(left)} Squeek blocks left` +
    (pace && pace.n > 0n
      ? ` (about ${decimal(left * pace.d, pace.n, 1)} days at the 7-day pace; estimate)`
      : " (days unknown: no positive 7-day pace)")
  );
}
/** @param {number | undefined} level @param {ViewState} state */
function ladder(level, state) {
  const detail = el("details", "card-details");
  detail.append(el("summary", "", "Full power & cooldown ladder"));
  if (!state.ctx?.ladder.length) {
    detail.append(
      el(
        "p",
        "small muted",
        "Level policy is unknown. Refresh the public reads.",
      ),
    );
    return detail;
  }
  const verified = state.ctx.status === "verified";
  detail.append(
    el(
      "p",
      "small " + (verified ? "muted" : "caution"),
      verified
        ? "Read from weightForLevel(0, level) and cooldownBlocks(0, level)."
        : "API policy fallback. Contract verification is unavailable; these are not contract-verified values.",
    ),
  );
  const box = el("div", "ladder-box");
  box.tabIndex = 0;
  box.setAttribute("role", "region");
  box.setAttribute("aria-label", "Full level ladder, scroll horizontally");
  const table = el("table", "ladder"),
    head = el("thead"),
    hr = el("tr");
  for (const label of ["Level", "Power", "Cooldown"]) {
    const th = el("th", "", label);
    th.scope = "col";
    hr.append(th);
  }
  head.append(hr);
  const body = el("tbody");
  for (const row of state.ctx.ladder) {
    const tr = el("tr", row.level === level ? "current-level" : "");
    const th = el(
      "th",
      "",
      String(row.level) + (row.level === level ? " · current" : ""),
    );
    th.scope = "row";
    tr.append(th);
    for (const [value, method] of [
      [row.power, "weightForLevel"],
      [row.cooldown, "cooldownBlocks"],
    ]) {
      const td = el("td");
      td.append(
        el("span", "numeric", number(/** @type {bigint} */ (value))),
        source(
          verified
            ? `${EXPLORER}/address/${state.ctx.mining}#readProxyContract`
            : `${API}/economy/state`,
          "source ↗",
          verified
            ? `${method}(0, ${row.level}) at Sepolia block ${BigInt(state.ctx.block ?? "0x0")}`
            : `Economy API level ${row.level} policy`,
        ),
      );
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(head, body);
  box.append(table);
  detail.append(box);
  return detail;
}
