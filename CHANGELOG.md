# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [5.0.5] — 2026-06-05
*Sparkline labels no longer overlap the graph on wide cards; new `npm run bump` for post-HACS cache-busting.*

### 🐛 Fixed

- **Sparkline label overlap on wide cards** — the graph now always fills its full
  SVG content box. The wrapper uses CSS `padding-left/right: 40 px` to reserve label
  space instead of SVG user units. With `preserveAspectRatio="none"` those SVG units
  scale with card width, so on wide single-phase cards the reserved area spanned
  hundreds of CSS pixels while the label stayed 40 px — wasting space and still
  overlapping on some widths.

### ⚙️ Tooling

- **`npm run bump`** — skips the build and only updates the Lovelace resource URL
  (`?v=<timestamp>`) via the HA REST API. Run once after a HACS update to force
  the browser to fetch the new file without a hard reload.

---

## [5.0.4] — 2026-06-05
*Patch: sparkline label/graph overlap (previous approach, superseded by 5.0.5).*

### 🐛 Fixed

- **Sparkline labels overlapping graph** — the graph path reserved horizontal space
  for HTML labels in SVG user units (`x=40` for left, `x=60` end for right). This
  partially fixed overlap but was still sensitive to card width; fully replaced in 5.0.5.

---

## [5.0.3] — 2026-06-05
*Sparkline min/max labels rendered as HTML elements — immune to SVG horizontal scaling.*

### 🐛 Fixed

- **Inconsistent label font size across card widths** — min/max labels switched from
  SVG `<text>` nodes to HTML elements overlaid on the SVG. With `preserveAspectRatio="none"`
  Chromium scaled SVG font metrics with the horizontal axis, making labels on wide
  single-phase cards appear significantly larger than on narrow 3-phase phase cells.
  HTML labels are controlled purely by CSS and scale identically everywhere.

---

## [5.0.2] — 2026-06-05
*Version logging added to console; single-phase sparkline labels re-enabled.*

### 🐛 Fixed

- **Single-phase sparkline font size** — min/max labels now use `font-size="8"` as
  an SVG presentation attribute (user units) instead of CSS `font-size: 8px`. SVG
  Y-scale is always 1:1 (viewBox height 38 = 38 px), so user units give consistent
  8 px text on any card width. Labels are fully restored on single-phase sparklines.

- **Version logging** — the card prints its version to the browser console on load
  (`electricity-panel-card v5.0.2`), making it easy to confirm which version is
  actually cached without opening DevTools network tab.

---

## [5.0.1] — 2026-06-05
*Hotfix: hidden labels on single-phase sparklines to avoid scaling artefacts.*

### 🐛 Fixed

- **Single-phase sparkline font scaling** — min/max labels hidden on single-phase
  circuit sparklines. The SVG stretches across the full card width with
  `preserveAspectRatio="none"`, causing browsers to scale CSS `font-size`
  proportionally with the X transform — labels appeared far larger than on narrow
  3-phase cells. Labels remain available on main meter and 3-phase cards where SVG
  width is constrained. *(Fully fixed in 5.0.3.)*

---

## [5.0.0] — 2026-06-05

> **Major release** — live power history graphs, real-time cost tracking, per-phase voltage,
> last-updated staleness badge, improved mobile layout, and a significantly expanded GUI editor.
> Consolidates all development since the v4.0.0 dark-theme foundation.

### ✨ Added

- **Sparkline power history graphs** — phase cells on the main meter and 3-phase circuits
  display smooth SVG graphs from the HA history API (compressed format, HA 2023.3+).
  Configurable window (1–24 h, default 3 h), line colour, min/max label position
  (left / right / hidden), and dashed reference lines with configurable colour.

- **Single-phase circuit sparkline** — breaker cards can optionally show a full-width
  power history graph below the metrics row. Off by default; enabled in Graph settings.

- **Sparkline visibility toggles** — independent on/off switches for main meter graphs,
  3-phase circuit graphs, and single-phase circuit graphs.

- **Daily cost tracking** — each circuit and the main meter show accumulated cost for the
  current day (e.g. `1.93 Kč`), computed by integrating power history and splitting
  NT / VT tariff periods using HDO switch history with schedule fallback.
  Requires `nt_price` / `vt_price` under HDO.

- **Per-phase voltage — main meter** — `voltage_l1/2/3` entity fields; shown in each phase
  cell below the current reading. Legacy single `voltage` entity still supported.

- **Per-phase voltage — 3-phase circuits** — same `voltage_l1/2/3` fields on individual
  3-phase circuit breakers, displayed identically to the main meter.

- **Voltage — single-phase circuits** — `voltage` field now shown in the circuit footer
  alongside current and energy.

- **Last-updated age badge** — `↻ Xs / Xm / Xh` indicator on each circuit and the main
  meter, showing how long ago the primary entity was last updated. Three configurable
  colour thresholds. Globally toggled in Graph settings.

- **Entity validation in editor** — entity_id fields turn amber with a warning when the
  entity does not exist in HA's state machine.

### 🔄 Changed

- **Mobile layout** — single-phase grid switches to one column at 480 px (was 360 px).
  Phase cells reduce gap at 480 px and stack vertically at 360 px.

- **Editor: "Graph settings" section** — renamed from "Sparkline graphs"; now also contains
  history period and age badge controls, grouped into subsections.

- **Editor: "Main meter (optional)"** — label updated to clarify the section is optional.

### 🐛 Fixed

- **History API format** — parser now supports both legacy (`state` / `last_changed`) and
  compressed HA 2023.3+ format (`s` / `lu` / `lc` as Unix float seconds). Previously all
  power sensor values were discarded as NaN.

- **kW unit conversion in history cache** — power entities in kW were stored raw and
  divided by 1000 again during integration, producing costs ~1000× too small. The fetcher
  now normalises all cached values to watts using `unit_of_measurement`.

- **Daily cost — multi-phase summation** — `_calcDailyCost` now sums all supplied phase
  entities independently. Cost reflects total consumption, not just L1.

- **NT/VT split accuracy** — `_isNTAt` uses HDO switch history only within the recorded
  window; falls back to the tariff schedule for earlier timestamps.

- **`setConfig` race condition** — cache was cleared unconditionally in `setConfig`. Now
  only cleared when no fetch is in progress.

- **Sparkline reference lines** — `sparkline_ref_line: true` now shows both lines
  regardless of `sparkline_labels` setting.

- **Single-phase device list layout** — devices under single-phase breakers are now
  rendered single-column instead of the 3-column grid intended for 3-phase circuits.

---

## [4.10.0] — 2026-06-05
*Per-phase voltage on main meter; styled sparkline background on single-phase cards.*

### ✨ Added

- **Per-phase voltage on main meter** — `voltage_l1/2/3` entity fields. Each phase cell
  shows voltage below the current value. Legacy single `voltage` entity still supported
  (shown on L1 when no per-phase entities are set).

- **Single-phase circuit sparkline background** — sparkline wrapped in a dark container
  matching the visual style of phase cells in 3-phase and main meter cards.

---

## [4.9.0] — 2026-06-05
*Per-phase voltage on 3-phase circuits; single-phase sparkline; sparkline visibility toggles.*

### ✨ Added

- **Per-phase voltage on 3-phase circuits** — `voltage_l1/2/3` fields added to circuit
  config. Each phase cell shows voltage below the current value.

- **Single-phase circuit sparkline** — full-width power history graph below the metrics
  row. Disabled by default; enable via Graph settings → Sparkline visibility.

- **Sparkline visibility toggles** — three independent checkboxes: main meter cells,
  3-phase circuit cells, single-phase cards.

---

## [4.8.0] — 2026-06-05
*Voltage on main meter, entity validation in editor, mobile layout improvements.*

### ✨ Added

- **Voltage on main meter** — `voltage` entity displayed in the meter header next to
  energy and cost.

- **Entity validation in editor** — entity_id fields turn amber with a warning when the
  configured entity does not exist in HA.

### 🔄 Changed

- **Mobile layout** — single-phase circuit grid switches to one column at 480 px
  (previously 360 px). Phase cells grid reduces gap at 480 px, stacks at 360 px.

- **Editor: "Main meter (optional)"** — section label updated for clarity.

---

## [4.7.1] — 2026-06-05
*Hotfix: CSS truncation restored sparklines and several other styles.*

### 🐛 Fixed

- **Sparkline font and card styles restored** — a file truncation silently dropped
  `.toggle`, `.status-dot`, `.expand-btn`, `.device-row`, `.sparkline`, `.spark-label`
  and related CSS rules from the bundle. All rules restored.

- **Age badge GUI labels** — colour-picker labels in the editor are now
  "Short / Medium / Long" instead of "Fresh / Amber / Red".

---

## [4.7.0] — 2026-06-05
*Age badge on main meter; full GUI controls for badge thresholds and colours.*

### ✨ Added

- **Age badge — main meter** — last-updated badge appears on the main meter, using the
  first available phase power entity as the timestamp source.

- **Age badge — GUI controls** — global on/off toggle, configurable amber and red
  thresholds (minutes, default 5 / 15), and colour pickers for all three states.

### 🔄 Changed

- **Editor: "Graph settings" section** — renamed from "Sparkline graphs". History period
  and age badge controls moved here, grouped as subsections.

---

## [4.6.0] — 2026-06-05
*New: last-updated age badge on all circuit cards.*

### ✨ Added

- **Last-updated badge** — `↻ 30s / 2m / 1h` indicator in the footer of every circuit
  card. Colour: grey < 5 min, amber > 5 min, red > 15 min. Hidden when no entity is
  configured.

---

## [4.5.1] — 2026-06-05
*Fix: sparkline reference lines now independent of label position.*

### 🐛 Fixed

- **Sparkline reference lines** — `sparkline_ref_line: true` shows both min and max
  lines regardless of `sparkline_labels`. Previously hidden whenever labels were `none`.

---

## [4.4.0] — 2026-06-04
*Major cost tracking fixes: kW unit conversion, multi-phase summation, NT/VT accuracy.*

### 🐛 Fixed

- **Daily cost: kW unit conversion** — power entities reporting in kW were stored raw
  and divided by 1000 again during integration (costs ~1000× too small). Fetcher now
  normalises to watts via `unit_of_measurement`.

- **Daily cost: multi-phase summation** — `_calcDailyCost` accepts variadic entity IDs
  and sums across all phases. Cost now reflects total consumption, not just L1.

- **Daily cost: consistent display** — removed the `Kč/h` live-rate fallback; all
  circuits show either `X.XX Kč` (today so far) or nothing. Results below `0.005 Kč`
  are suppressed.

- **NT/VT split accuracy** — `_isNTAt` uses HDO switch history only within the recorded
  window, falling back to the tariff schedule for earlier timestamps.

---

## [4.3.0] — 2026-06-04
*Root cause fix: HA 2023.3+ compressed history format now parsed correctly.*

### 🐛 Fixed

- **Sparkline graphs and daily cost not showing** — `processEntries` used the old HA
  history format (`e.state` / `e.last_changed`) but HA 2023.3+ returns a compressed
  format (`e.s` / `e.lu` / `e.lc` as Unix float seconds). All power sensor values were
  parsed as NaN. Updated parser supports both formats.

- **`setConfig` race condition** — history cache cleared unconditionally in `setConfig`
  could erase freshly fetched data mid-fetch. Cache now only cleared when no fetch is
  in progress.

### 🔄 Changed

- `processEntries` emits a `console.warn` with a raw sample when 0 valid data points
  survive filtering, making regressions immediately visible in DevTools.

---

## [4.2.2] — 2026-06-03
*Fix: device list under single-phase breakers uses correct single-column layout.*

### 🐛 Fixed

- **Devices under single-phase breakers in 3 columns** — device lists were rendered in
  the `.tp-devices-grid` (3-column) intended for 3-phase circuits. Now uses
  `.devices-list` — full width, single column.

---

## [4.0.0] — 2026-06-03

> **Major release** — complete dark visual redesign. Card background locked to `#111318`;
> every component updated to the dark palette.

### 🎨 Design

- HDO bar: dark green/red tint, pulsing dot, large countdown, inline progress bar.
- Main meter: dark surface, icon, uppercase label, phase cells on a darker background.
- Circuit cards: muted name, prominent 22 px power value, 2 px left border accent
  (green for active, amber for critical).
- 3-phase circuits: dedicated `.three-phase-card` class, consistent with single-phase.
- Schedule, timeline, devices: all updated to the dark palette.
- Toggles: 32 px, dark-off (`#374151`), dark-green-on (`#16a34a`).
- Load bar: 3 px height, dark track (`#1f2937`), solid colour fill.

---

## [3.0.4] — 2026-06-03
*Fix: dashboard freeze caused by non-standard `shouldUpdate` override.*

### 🐛 Fixed

- **Dashboard freeze** — replaced the non-standard `shouldUpdate` override with a custom
  `hass` getter/setter. `requestUpdate` is now called only when a tracked entity actually
  changes, following the standard HA pattern for performance-sensitive cards.

---

## [3.0.3] — 2026-06-03
*Reverted Lit externalisation; Lit is bundled again.*

### 🐛 Fixed

- **"Custom element doesn't exist"** — reverted Lit externalisation from 3.0.1. HA's
  import map does not reliably resolve `lit/decorators.js` as a bare specifier. Lit is
  bundled again (~93 kB).

---

## [3.0.2] — 2026-06-03
*Root cause fix: removed `shouldUpdate` override that froze all dashboards.*

### 🐛 Fixed

- **All dashboards freezing** — removed the custom `shouldUpdate` override that corrupted
  Lit's internal reactive-element update cycle, stalling every card on the page.

---

## [3.0.1] — 2026-06-03
*Attempted fix: externalised Lit — superseded by 3.0.2 / reverted in 3.0.3.*

### 🐛 Fixed

- **All dashboards freezing** — externalised Lit so the card uses HA's built-in instance.
  *(Superseded by 3.0.2, reverted in 3.0.3.)*

---

## [3.0.0] — 2026-06-03

> **Major release** — light-theme visual redesign. Superseded by the dark redesign in 4.0.0.

### 🎨 Design

- HDO hero card with gradient background, pulsing dot, large countdown.
- Circuit cards: green glow on active, 22 px power value.
- Load bar: 3-zone gradient track.
- Section labels: left accent border.

---

## [2.7.1] — 2026-06-03

### 🐛 Fixed

- Removed confusing "NT remaining" total from the collapsed schedule header.

---

## [2.7.0] — 2026-06-03

### 🔄 Changed

- Collapsed schedule shows current tariff badge and time range inline.
- Timeline bar shows a white marker at the current time position.

---

## [2.6.0] — 2026-06-03

### ✨ Added

- Current NT/VT slot visible in collapsed schedule header.
- Channel group header shows summed watts and amperes.

---

## [2.5.0] — 2026-06-03

### ✨ Added

- Collapsible daily schedule (collapsed by default).
- 3-phase device column layout: one column per phase under each circuit.

### 🐛 Fixed

- Drag & drop reordering in the GUI editor restored.

---

## [2.4.0] — 2026-06-02

### 🐛 Fixed

- **Midnight VT bug** — PRE 605/606 presets were missing `00:00–01:00` and
  `22:00–00:00` NT windows. Data re-sourced from the official PRE HDO Excel.
