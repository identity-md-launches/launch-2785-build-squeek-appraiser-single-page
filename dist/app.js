import { API, DEPLOYMENT } from "./config.js";
import {
  tokenId,
  parsePrice,
  validAddress,
  readHash,
  makeHash,
  number,
  integer,
} from "./domain.js";
import {
  json,
  available,
  getSqueek,
  getAccount,
  loadContracts,
  checkToken,
} from "./data.js";
import { el, get, source, button } from "./ui.js";
import { verdict, comparison, card } from "./view.js";

/** @type {import('./view.js').ViewState} */
const state = {
  cards: [],
  economy: null,
  settlements: null,
  account: null,
  ctx: null,
  busy: false,
  walletBusy: false,
};
/** @type {{id:string;price:string}[]} */ let entries = readHash(location.hash);
if (!entries.length) entries = [{ id: "", price: "" }];
let generation = 0,
  walletGeneration = 0;
/** @type {AbortController | null} */ let controller = null;
/** @type {AbortController | null} */ let walletController = null;
let economyError = "",
  settlementError = "",
  walletAddress = "",
  checkedAt = 0;
const form = /** @type {HTMLFormElement} */ (get("#appraise-form"));
const appraiseButton = /** @type {HTMLButtonElement} */ (
  get("#appraise-button")
);
const walletButton = /** @type {HTMLButtonElement} */ (get("#wallet-button"));
const walletInput = /** @type {HTMLInputElement} */ (get("#wallet-address"));
get(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  const main = get("#main");
  main.tabIndex = -1;
  main.focus();
  main.scrollIntoView({ block: "start" });
});
/** @param {string} text */ function announce(text) {
  get("#announcements").textContent = text;
}
/** @param {unknown} error */ function errorMessage(error) {
  return error instanceof Error
    ? error.message
    : "Data is unavailable. Retry in a moment.";
}
function readEntries() {
  entries = Array.from(document.querySelectorAll(".entry")).map((node) => ({
    id: /** @type {HTMLInputElement} */ (node.querySelector(".token-input"))
      .value,
    price: /** @type {HTMLInputElement} */ (node.querySelector(".price-input"))
      .value,
  }));
}
function drawEntries(focusIndex = -1) {
  const list = get("#entry-list");
  list.replaceChildren();
  entries.forEach((entry, i) => {
    const set = el("fieldset", "entry"),
      legend = el("legend", "", `Squeek ${i + 1}`);
    if (entries.length > 1) {
      const remove = button(
        "×",
        () => {
          readEntries();
          entries.splice(i, 1);
          drawEntries(Math.max(0, i - 1));
          markDirty();
        },
        "remove-entry",
      );
      remove.setAttribute("aria-label", `Remove Squeek ${i + 1} from inputs`);
      legend.append(remove);
    }
    set.append(legend);
    const fields = el("div", "entry-fields");
    const idGroup = el("div"),
      idLabel = el("label", "", "Token ID"),
      idWrap = el("div", "input-with-unit"),
      id = el("input", "token-input");
    id.id = `token-${i}`;
    id.name = `token-${i}`;
    id.type = "text";
    id.inputMode = "numeric";
    id.autocomplete = "off";
    id.placeholder = ["12", "45", "301"][i];
    id.value = entry.id;
    id.setAttribute("aria-describedby", "form-error");
    idLabel.htmlFor = id.id;
    id.maxLength = 5;
    const unit = el("span", "input-unit", "#");
    unit.setAttribute("aria-hidden", "true");
    idWrap.append(unit, id);
    idGroup.append(idLabel, idWrap);
    const priceGroup = el("div"),
      priceLabel = el("label", "", "Asking price (ETH)"),
      price = el("input", "price-input");
    price.id = `price-${i}`;
    price.name = `price-${i}`;
    price.type = "text";
    price.inputMode = "decimal";
    price.autocomplete = "off";
    price.placeholder = "Optional";
    price.value = entry.price;
    price.maxLength = 512;
    price.setAttribute("aria-describedby", "form-error");
    priceLabel.htmlFor = price.id;
    priceGroup.append(priceLabel, price);
    fields.append(idGroup, priceGroup);
    set.append(fields);
    list.append(set);
  });
  if (entries.length < 3) {
    const add = button(
      "+ Add a Squeek",
      () => {
        readEntries();
        entries.push({ id: "", price: "" });
        drawEntries(entries.length - 1);
      },
      "add-entry",
    );
    list.append(add);
  }
  if (focusIndex >= 0) document.getElementById(`token-${focusIndex}`)?.focus();
}
function markDirty() {
  if (state.cards.length)
    get("#freshness").textContent =
      "Inputs changed. Appraise again to update the comparison.";
}
form.addEventListener("input", markDirty);
/** @returns {{id:string;price:string}[] | null} */
function validate() {
  readEntries();
  get("#form-error").hidden = true;
  form
    .querySelectorAll("[aria-invalid]")
    .forEach((n) => n.removeAttribute("aria-invalid"));
  /** @type {{id:string;price:string}[]} */ const valid = [];
  const seen = new Set();
  /** @param {number} index @param {string} message @param {'token'|'price'} [field] */
  function fail(index, message, field = "token") {
    const target = get(`#${field}-${index}`);
    target.setAttribute("aria-invalid", "true");
    get("#form-error").hidden = false;
    get("#form-error").textContent = message;
    target.focus();
    return null;
  }
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.id.trim() && !entry.price.trim()) continue;
    const id = tokenId(entry.id);
    if (!id) return fail(i, "Enter a Squeek token ID from 1 to 9999.");
    if (seen.has(id))
      return fail(
        i,
        `Squeek #${id} is already on your shortlist. Choose a different ID.`,
      );
    const price = entry.price.trim() ? parsePrice(entry.price) : null;
    if (entry.price.trim() && !price)
      return fail(
        i,
        "Enter an ETH decimal, using a comma or a dot, or leave the price blank.",
        "price",
      );
    seen.add(id);
    valid.push({ id, price: price?.canonical ?? "" });
  }
  if (!valid.length)
    return fail(0, "Add at least one Squeek token ID to start your appraisal.");
  return valid;
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const valid = validate();
  if (valid) {
    entries = valid;
    drawEntries();
    void appraise(valid);
  }
});
get("#example-button").addEventListener("click", () => {
  entries = [
    { id: "12", price: "" },
    { id: "45", price: "" },
    { id: "301", price: "" },
  ];
  drawEntries();
  void appraise(entries);
});
get("#refresh-button").addEventListener("click", () => {
  if (!state.busy && state.cards.length)
    void appraise(state.cards.map((c) => ({ id: c.id, price: c.price })));
});

/** @param {{id:string;price:string}[]} requested @param {boolean} [updateHash] */
async function appraise(requested, updateHash = true) {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal,
    run = ++generation;
  state.cards = requested.map((e) => ({ ...e, status: "loading" }));
  Object.assign(state, {
    economy: null,
    settlements: null,
    ctx: null,
    busy: true,
  });
  economyError = "";
  settlementError = "";
  checkedAt = 0;
  if (updateHash) history.replaceState(null, "", makeHash(requested));
  get("#share-button").textContent = "Copy comparison link";
  appraiseButton.disabled = true;
  appraiseButton.textContent = "Appraising…";
  render();
  announce(
    `Reading ${requested.length} Squeek${requested.length === 1 ? "" : "s"}.`,
  );
  if (walletAddress) void loadWallet(walletAddress);
  const tokens = state.cards.map(async (c) => {
    try {
      const result = await getSqueek(c.id, signal);
      if (run !== generation) return;
      c.data = result;
      c.status = "ready";
      c.checkedAt = Date.now();
    } catch (error) {
      if (run !== generation || signal.aborted) return;
      c.status = "error";
      c.error = errorMessage(error).replace("This Squeek", `Squeek #${c.id}`);
    }
    render();
  });
  const economy = (async () => {
    try {
      /** @type {import('./types.js').Economy} */ const value = available(
        await json(`${API}/economy/state`, signal),
      );
      if (value.chain?.chainId !== "11155111")
        throw new Error("The economy API is not on Sepolia.");
      if (run !== generation) return;
      state.economy = value;
      state.ctx = await loadContracts(value, signal);
    } catch (error) {
      if (run !== generation || signal.aborted) return;
      economyError = errorMessage(error);
    }
    render();
  })();
  const settlements = (async () => {
    try {
      /** @type {import('./types.js').Settlement} */ const value = available(
        await json(`${API}/settlements?range=7d`, signal),
      );
      if (value.chain?.chainId !== "11155111")
        throw new Error("The settlements are not from Sepolia.");
      if (run !== generation) return;
      state.settlements = value;
    } catch (error) {
      if (run !== generation || signal.aborted) return;
      settlementError = errorMessage(error);
    }
  })();
  await Promise.allSettled([...tokens, economy, settlements]);
  if (run !== generation || signal.aborted) return;
  if (state.ctx?.status === "verified") {
    const ctx = state.ctx;
    await Promise.allSettled(
      state.cards
        .filter((c) => c.status === "ready")
        .map(async (c) => {
          try {
            const check = await checkToken(c.id, ctx, signal);
            if (run !== generation) return;
            c.contract = check;
            if (
              check.owner.toLowerCase() !==
              c.data?.custody?.owner?.toLowerCase()
            )
              c.contractError =
                "Custody differs between API and contract. Do not rely on this appraisal until you refresh and resolve it.";
          } catch (error) {
            if (run !== generation || signal.aborted) return;
            c.contractError =
              "Token contract check is unknown. " + errorMessage(error);
          }
        }),
    );
  }
  if (run !== generation || signal.aborted) return;
  state.busy = false;
  checkedAt = Date.now();
  appraiseButton.disabled = false;
  appraiseButton.replaceChildren("Appraise Squeeks ", el("span", "", "↗"));
  render();
  const count = state.cards.filter((c) => c.status === "ready").length;
  announce(
    `${count} of ${state.cards.length} Squeeks appraised. ${economyError ? "Pool data is unknown." : state.ctx?.status !== "verified" ? "Contract verification is unavailable." : ""}`,
  );
}
const focusable = "a[href], button, summary, input";
/** Records which card disclosures are open and which card control has focus, so re-renders keep the reader's place. @param {HTMLElement} cards */
function readerPlace(cards) {
  /** @type {Set<string>} */
  const open = new Set();
  for (const d of cards.querySelectorAll(
    "article[data-key] details[open][data-disclosure]",
  ))
    open.add(
      `${d.closest("article")?.dataset.key}|${/** @type {HTMLElement} */ (d).dataset.disclosure}`,
    );
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !cards.contains(active))
    return { open, focus: null };
  const article = active.closest("article[data-key]");
  const focus =
    article instanceof HTMLElement
      ? {
          key: article.dataset.key ?? "",
          index: [...article.querySelectorAll(focusable)].indexOf(active),
          top: active.getBoundingClientRect().top,
        }
      : null;
  return { open, focus };
}
/** @param {HTMLElement} cards @param {ReturnType<typeof readerPlace>} kept */
function restorePlace(cards, kept) {
  for (const d of cards.querySelectorAll(
    "article[data-key] details[data-disclosure]",
  )) {
    const key = `${d.closest("article")?.dataset.key}|${/** @type {HTMLElement} */ (d).dataset.disclosure}`;
    if (kept.open.has(key)) /** @type {HTMLDetailsElement} */ (d).open = true;
  }
  if (!kept.focus) return;
  const article = [...cards.querySelectorAll("article[data-key]")].find(
    (a) => a instanceof HTMLElement && a.dataset.key === kept.focus?.key,
  );
  const target = article?.querySelectorAll(focusable)[kept.focus.index];
  if (!(target instanceof HTMLElement)) return;
  target.focus({ preventScroll: true });
  window.scrollBy(0, target.getBoundingClientRect().top - kept.focus.top);
}
function render() {
  const has = state.cards.length > 0;
  get("#empty-state").hidden = has;
  for (const id of [
    "#results-toolbar",
    "#verdict",
    "#comparison",
    "#card-section",
  ])
    get(id).hidden = !has;
  if (!has) return;
  const cards = get("#cards");
  const kept = readerPlace(cards);
  cards.replaceChildren(
    ...state.cards.map((c, i) => {
      const node = card(c, state, () => {
        void appraise(state.cards.map((x) => ({ id: x.id, price: x.price })));
      });
      node.dataset.key = `${i}:${c.id}`;
      return node;
    }),
  );
  restorePlace(cards, kept);
  get("#verdict").replaceChildren(verdict(state));
  get("#comparison-table").replaceChildren(...comparison(state));
  const refresh = /** @type {HTMLButtonElement} */ (get("#refresh-button"));
  refresh.disabled = state.busy;
  get("#freshness").textContent = state.busy
    ? "Reading the API and checking the published deployment…"
    : `Fetched ${new Date(checkedAt || Date.now()).toLocaleTimeString()}. ${state.economy?.chain?.safeBlockTimestamp ? "Pool safe block: " + new Date(state.economy.chain.safeBlockTimestamp).toLocaleTimeString() + "." : "Safe-block time unknown."}`;
  const notices = get("#service-notice");
  notices.replaceChildren();
  if (economyError) {
    const notice = el("div", "notice error");
    notice.append(
      el("p", "", `Pool data unknown. ${economyError}`),
      source(`${API}/economy/state`, "economy source ↗"),
    );
    notices.append(notice);
  }
  if (settlementError)
    notices.append(
      el(
        "p",
        "notice",
        `Cooldown-day estimate unavailable. ${settlementError}`,
      ),
    );
  if (state.ctx && state.ctx.status !== "verified") {
    const notice = el("details", "notice");
    notice.append(
      el("summary", "", "API appraisal · contract verification unavailable"),
    );
    notice.append(
      el("p", "", state.ctx.message),
      el(
        "p",
        "",
        "The level ladder uses the API policy as a clearly labelled fallback. Custody and scheduled power must be checked before a trade.",
      ),
    );
    notice.append(
      source(DEPLOYMENT, "deployment record ↗"),
      document.createTextNode(" · "),
      source(`${API}/economy/state`, "live identities ↗"),
    );
    notices.append(notice);
  }
  if (!state.busy && state.economy?.staking?.paused)
    notices.append(
      el(
        "p",
        "notice",
        "Staking is paused. A purchase does not guarantee you can deposit or merge now.",
      ),
    );
  if (
    !state.busy &&
    state.economy?.generatedAt &&
    Date.now() - Date.parse(state.economy.generatedAt) > 300000
  )
    notices.append(
      el(
        "p",
        "notice",
        "The pool snapshot is more than five minutes old. Refresh before relying on it.",
      ),
    );
}

get("#wallet-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const address = walletInput.value.trim();
  walletInput.removeAttribute("aria-invalid");
  get("#wallet-error").hidden = true;
  if (!validAddress(address)) {
    get("#wallet-error").textContent =
      "Enter a full, non-zero Ethereum address: 0x and 40 hexadecimal characters.";
    get("#wallet-error").hidden = false;
    walletInput.setAttribute("aria-invalid", "true");
    walletInput.focus();
    return;
  }
  walletAddress = address.toLowerCase();
  void loadWallet(walletAddress);
});
/** @param {string} address */
async function loadWallet(address) {
  walletController?.abort();
  walletController = new AbortController();
  const signal = walletController.signal,
    run = ++walletGeneration;
  state.walletBusy = true;
  state.account = null;
  walletButton.disabled = true;
  walletButton.textContent = "Loading Squeeks…";
  get("#wallet-error").hidden = true;
  get("#wallet-result").textContent = "Reading all pages of your Squeeks…";
  render();
  try {
    const account = await getAccount(address, signal);
    if (run !== walletGeneration) return;
    state.account = account;
    state.walletBusy = false;
    const result = get("#wallet-result");
    result.replaceChildren();
    const tokens = account.tokens ?? [];
    result.append(
      el(
        "p",
        "wallet-summary",
        tokens.length
          ? `${tokens.length} Squeek${tokens.length === 1 ? "" : "s"} found. Ready same-level matches appear in the comparison.`
          : "No Squeeks found for this wallet at the safe block.",
      ),
    );
    const details = el("details");
    details.append(
      el("summary", "small", `Owned & deposited Squeeks (${tokens.length})`),
    );
    const list = el("ul", "wallet-tokens");
    for (const token of tokens) {
      const li = el(
        "li",
        "",
        `#${token.tokenId} · Level ${token.level ?? "?"} · ${token.mergeState ?? "readiness unknown"}`,
      );
      list.append(li);
    }
    details.append(list);
    result.append(
      details,
      source(`${API}/accounts/${address}?limit=100`, "account source ↗"),
    );
    if (account.chain?.safeThroughBlock)
      result.append(
        el(
          "p",
          "small muted",
          `Account safe Sepolia block ${account.chain.safeThroughBlock}.`,
        ),
      );
    get("#wallet-clear").hidden = false;
    announce(`${tokens.length} Squeeks loaded from your wallet.`);
  } catch (error) {
    if (run !== walletGeneration || signal.aborted) return;
    state.account = null;
    state.walletBusy = false;
    get("#wallet-result").textContent = "Merge partners are unknown.";
    get("#wallet-error").textContent = errorMessage(error);
    get("#wallet-error").hidden = false;
    get("#wallet-clear").hidden = false;
  } finally {
    if (run === walletGeneration) {
      walletButton.disabled = false;
      walletButton.textContent = "Load Squeeks";
      render();
    }
  }
}
get("#wallet-clear").addEventListener("click", () => {
  walletController?.abort();
  walletGeneration++;
  walletAddress = "";
  walletInput.value = "";
  state.account = null;
  state.walletBusy = false;
  get("#wallet-result").replaceChildren();
  get("#wallet-clear").hidden = true;
  get("#wallet-error").hidden = true;
  walletInput.removeAttribute("aria-invalid");
  walletButton.disabled = false;
  walletButton.textContent = "Load Squeeks";
  render();
  announce("Wallet reads cleared.");
});
get("#share-button").addEventListener("click", async () => {
  const link = new URL(location.href);
  link.hash = makeHash(state.cards.map((c) => ({ id: c.id, price: c.price })));
  link.search = "";
  try {
    await navigator.clipboard.writeText(link.href);
    announce("Comparison link copied. The wallet address is not included.");
    get("#share-button").textContent = "Link copied";
  } catch {
    const block = el("div", "notice");
    const label = el("label", "", "Copy this comparison link"),
      input = el("input");
    input.type = "text";
    input.readOnly = true;
    input.value = link.href;
    input.id = "share-url";
    label.htmlFor = input.id;
    block.append(
      label,
      input,
      button("Close", () => block.remove(), "text-button"),
    );
    get("#service-notice").append(block);
    input.focus();
    input.select();
    announce("Select and copy the comparison link.");
  }
});
window.addEventListener("hashchange", () => {
  const next = readHash(location.hash);
  if (next.length) {
    entries = next;
    drawEntries();
    void appraise(next, false);
  }
});
setInterval(() => {
  if (checkedAt && Date.now() - checkedAt > 60000 && !state.busy)
    get("#freshness").textContent =
      "Fetched over a minute ago. Refresh reads before a trade.";
}, 15000);
drawEntries();
if (entries.some((e) => e.id)) void appraise(entries, false);
