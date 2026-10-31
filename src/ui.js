/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} [className] @param {string} [text] @returns {HTMLElementTagNameMap[K]} */
export function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
/** @param {string} selector @returns {HTMLElement} */
export function get(selector) {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLElement))
    throw new Error(`Missing element: ${selector}`);
  return node;
}
/** @param {string} href @param {string} [label] @param {string} [description] */
export function source(href, label = "source ↗", description = "") {
  const a = el("a", "source-link", label);
  a.href = href;
  if (href.startsWith("https://")) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  if (href.startsWith("#"))
    a.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.getElementById(href.slice(1));
      target?.scrollIntoView({ block: "start" });
      if (target instanceof HTMLInputElement) target.focus();
    });
  if (description) {
    a.title = description;
    a.setAttribute("aria-label", description + " (source)");
  }
  return a;
}
/** @param {string} label @param {() => void} action @param {string} [className] */
export function button(label, action, className = "secondary") {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}
/** @param {string} title @param {string | HTMLElement} content @param {HTMLAnchorElement[]} [sources] @param {string} [note] */
export function fact(title, content, sources = [], note = "") {
  const row = el("div", "fact-row"),
    dd = el("dd");
  row.append(el("dt", "", title));
  dd.append(typeof content === "string" ? el("span", "", content) : content);
  if (note) dd.append(el("p", "", note));
  if (sources.length) {
    const links = el("div");
    sources.forEach((s, i) => {
      if (i) links.append(" · ");
      links.append(s);
    });
    dd.append(links);
  }
  row.append(dd);
  return row;
}
