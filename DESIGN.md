# Squeek Appraiser design

## Overview

A buyer’s appraisal desk: warm paper, dark ink, restrained green marks and an editorial serif. The comparison and recommendation carry the page; this is a working tool with compact input controls, not a marketing landing page. Amber flags uncertainty and transfer friction; red marks errors and blockers.

Source of truth: `src/styles.css`, `src/index.html`, `src/ui.js` and `src/view.js`. `dist/` is an exact static copy, not a separate design implementation.

## Colors

Semantic tokens are declared in `src/styles.css:27`; dark variants use only `prefers-color-scheme: dark` at `src/styles.css:60`.

| Token                    | Light                 | Dark                  | Role                                                 |
| ------------------------ | --------------------- | --------------------- | ---------------------------------------------------- |
| `--paper`                | `#f6f3eb`             | `#1d241f`             | Page and input background                            |
| `--surface`              | `#fcfaf5`             | `#242d26`             | Input panel, comparison, secondary controls          |
| `--recess`               | `#ede8dc`             | `#303a31`             | Table headings, placeholders, empty/loading surfaces |
| `--ink`                  | `#272d27`             | `#f1eee4`             | Main text and card rules                             |
| `--muted`                | `#64695f`             | `#b4bdad`             | Labels, explanations, provenance                     |
| `--line`                 | `#d5d1c5`             | `#485246`             | Structural dividers                                  |
| `--input-line`           | `#92978a`             | `#7e8e7c`             | Input/control boundaries                             |
| `--green`                | `#286343`             | `#a4d5a8`             | Main action, good states, verdict and row leaders    |
| `--green-hover`          | `#1e5035`             | `#bce4bf`             | Primary hover                                        |
| `--good-bg`              | `#e6eee1`             | `#2b402f`             | Positive verdict and leading cells                   |
| `--on-accent`            | `#fffefa`             | `#18281c`             | Primary button text                                  |
| `--amber` / `--amber-bg` | `#895614` / `#f4ead4` | `#eac079` / `#3d3324` | Unknown data, cooldown and custody cautions          |
| `--red` / `--red-bg`     | `#a13c32` / `#f9e5df` | `#ffa694` / `#422d28` | Errors, stray custody, verification conflicts        |
| `--focus`                | `#286343`             | `#a4d5a8`             | 2px focus perimeter with 4px offset                  |

Status always has text as well as color. Row leaders carry a check and label; a green cell alone is not the indication. All ties share the row mark. Body and state text pairs were measured by the browser probe/axe; both theme scans reported zero contrast violations. Exact measured palette pairs are in `artifacts/contrast.json`. Do not use border tokens as text colors.

## Typography

Local WOFF2 files live in `src/assets/fonts/`. Fraunces is declared at weights 500–600; IBM Plex Sans at 400–600; Plex Mono has separate 400 and 500 faces. The variable Sans resource replaces three identical downloads. The final browser confirmed these local faces loaded. No runtime font service is contacted.

- Headings and brand: `Fraunces, Georgia, serif`, normally 500. Tight line height 1.15; large titles use −0.035em tracking, section titles −0.02em.
- Body and controls: `IBM Plex Sans, sans-serif`, 400 for prose and 500 for emphasized controls. Unitless 1.5 line height.
- Numeric values and amount inputs: `IBM Plex Mono, monospace`, 400, or 500 for row leaders; `font-variant-numeric: tabular-nums`.

The six sizes are 13px (`--text-small`), 16px (`--text-body`), 18px (`--text-subtitle`), 24px (`--text-section`), 32px (`--text-title`) and 48px (`--text-display`). The page title falls from 48px to 32px at 48rem. Inputs stay 16px on phones. Small provenance uses 13px with 1.5 line height and at least a 28px link height. Body measure is capped at 72ch; descriptions use pretty wrapping, headings balance, and critical addresses/amounts wrap without ellipsis.

## Layout

`.wrap` caps the desk at 1200px including 40px inline padding. Most groups use a 4px spacing rhythm, with 8/12px inside controls, 16/20/24px between related elements and 28/32/40px between sections. The masthead anchors the brand left and network context right. The title is followed directly by the shortlist.

Input groups form three equal columns on wide screens. Only one is present initially, with an explicit add control up to three. Verdict and reasons share two columns on desktop. Cards use three columns. The comparison precedes individual details, so the answer is encountered before the evidence.

Implemented breakpoints:

- **68rem / 1088px:** reduce outer padding to 28px, wrap form help, reduce cell spacing and hide the secondary intro link.
- **48rem / 768px:** 20px gutters, stacked input groups, verdict and toolbar; cards stack as sections, with image/facts in two columns where they fit. Wallet address and buttons wrap naturally.
- **30rem / 480px:** 16px gutters, smaller masthead, full-width main action, card image and facts stack, checklist becomes one column. The initial action ends at 485px in the measured 390 × 844 viewport.

At phone widths, the comparison has a 630px minimum width inside `.table-box` with `overflow-x: auto`; the page does not scroll horizontally. First-column row headings stay sticky within that box. A “Swipe the table” cue, visible partial columns and a focusable scroll region expose the overflow. The level ladder has its own smaller scroll region. Full result layouts were checked at 320, 390, 768 and 1440px.

## Elevation & Depth

The interface is flat. Fine borders organize inputs and tables; no drop shadows, gradients or raised nested cards. Positive and caution backgrounds carry semantic grouping. NFT images get a one-pixel low-opacity outline, black in light mode and white in dark mode. The desk illustration and small appraisal mark are local SVG assets, separate from untrusted NFT art.

## Shapes

The shortlist uses an 8px radius; tables 6px; inputs, buttons and NFT images 4px. The network dot is circular. Simple horizontal rules start each Squeek detail. Nothing clips significant text, addresses or prices. Card loading placeholders are static tonal blocks, not indefinite shimmer animations.

## Components

| Component / source                                  | Behavior and states                                                                                                                                                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shortlist, `src/app.js:71`, `.entry-list`           | One to three labelled fieldsets; token ID and optional ETH price; add/remove controls restore input focus. Native form validation is replaced with explicit field errors and first-invalid focus.                                       |
| Buttons, `src/styles.css`                           | One filled green appraisal action. Secondary actions use a boundary, tertiary actions an underline. 44px minimum for main controls; inputs 48px. Disabled state waits for actual requests. Hover applies only to hover-capable devices. |
| Optional wallet, `src/index.html`, `src/app.js:422` | Native details disclosure, typed read-only address, loading/unknown/empty/all-pages results, clear control. No connection sheet. Wallet state stays out of the hash.                                                                    |
| Verdict, `src/view.js:67`                           | Positive candidate with 2–4 plain reasons; loading, missing-price, no-results, tie and already-owned variants. Provisional data and verification limitations remain explicit.                                                           |
| Comparison, `src/view.js:254`, `.table-box`         | Native table with column/row headers. Row leaders have a check plus green cell. Every numeric derivation links its inputs. Keyboard focus lets arrow keys scroll.                                                                       |
| Squeek card, `src/view.js:492`                      | Loading skeleton, clear per-token failure and retry, onchain image, power, earning, share, cooldown, rewards attachment and optional partner. Traits/custody/ladder use native details.                                                 |
| `source()`, `src/ui.js:16`                          | External links open separately with no referrer; internal source links scroll without replacing the comparison hash.                                                                                                                    |
| `fact()`, `src/ui.js:44`                            | Native definition-list row: label, value, explanation, source. Reused for appraisal facts.                                                                                                                                              |
| Notices, `.notice`                                  | Amber uncertainty and red blocking/error variants with text. Stable status region announces normal updates; field errors use alerts.                                                                                                    |
| Checklist and methodology, `src/index.html`         | Persistent trade checklist and progressive disclosure for longer provenance/calculation explanations. The seller’s ability to act remains stated.                                                                                       |

Focus uses `:focus-visible` and native controls throughout. The skip link focuses the main region without losing shared state. There are no modal dialogs or focus traps to maintain. Motion is limited to a 120ms button press transform at scale 0.96, only when reduced motion is not requested. Theme colors switch instantly; no color interpolation can temporarily lower contrast. Forced-colors mode preserves control boundaries and row marks.

## Do’s and Don’ts

- Start with `.wrap`, the existing six-size scale and semantic colors. Use a native form, table, definition list or details element before inventing a control.
- Keep one main action prominent. Place estimates and sources next to the value they qualify.
- Keep counts and values grounded in a successful read; unknown is a real state. Source conflicts must remain visible.
- Keep image markup isolated: render untrusted SVG only as an image, never inject it into the page.
- Preserve the comparison hash during local navigation and keep wallet data out of shared state.
- Do not add wallet infrastructure, new accent hues, external fonts, nested elevated cards or a marketing hero before the tool.

To add another information section, reuse `.section-head`, `.fact-row` and native details, place it after the decision surfaces, and check both themes and the 320px result layout. Review evidence and unperformed checks are in `artifacts/validation.md`; no screen-reader or physical-device certification is implied.
