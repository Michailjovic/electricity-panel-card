# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.7.1] - 2026-06-05

### Fixed

- **Sparkline font restored** — a file truncation during development caused the
  `.toggle`, `.status-dot`, `.expand-btn`, `.device-row`, `.sparkline`,
  `.spark-label` and related CSS rules to be silently dropped from the bundle,
  breaking sparkline label text and several other card styles. All rules restored.

- **Age badge GUI labels** — the colour-picker labels in the "Last-updated badge"
  editor section are now "Short / Medium / Long" instead of "Fresh / Amber / Red",
  matching the intent of the thresholds (duration since last update).

---

## [4.7.0] - 2026-06-05

### Added

- **Age badge — main meter** — the last-updated badge now also appears on the
  main meter, using the first available phase power entity as the timestamp source.

- **Age badge — GUI controls** — the card editor now exposes full control over
  the age badge: a global on/off toggle, configurable amber and red thresholds
  (in minutes, default 5 / 15), and individual colour pickers for all three
  states (fresh / amber / red).

### Changed

- **Editor: Graph settings section** — the "Sparkline graphs" editor section has
  been renamed to "Graph settings". The history period field (`graph_hours`) has
  been moved into this section. Sparkline options and the new age badge controls
  are grouped within it as subsections.

---

## [4.6.0] - 2026-06-05

### Added

- **Last-updated badge** — each circuit card now shows how long ago its primary
  entity was last updated by Home Assistant (e.g. `↻ 30s`, `↻ 2m`, `↻ 1h`).
  The badge appears in the footer of single-phase breakers and next to the total
  power of three-phase breakers. Colour indicates data freshness: muted grey
  under 5 minutes, amber above 5 minutes, red above 15 minutes. The badge is
  hidden when no power, current, or switch entity is configured for the circuit.

---

## [4.5.1] - 2026-06-05

### Fixed

- **Sparkline reference lines** — `sparkline_ref_line: true` now correctly shows
  both the max and min reference lines regardless of the `sparkline_labels` setting.
  Previously the lines were hidden whenever `sparkline_labels` was set to `none`,
  even though reference lines and labels are independent features.

---

## [4.4.0] - 2026-06-04

### Fixed

- **Daily cost: unit conversion for kW sensors** — power entities that report in kW
  (e.g. `0.223 kW`) were stored raw in the history cache and divided by 1000 again
  during cost integration, producing values ~1000x too small (e.g. `0.01 Kč` instead
  of `9 Kč`). The history fetcher now reads `unit_of_measurement` from the current
  entity state and scales every cached value to watts. `_watts()` already did this for
  live display; the history cache now matches.

- **Daily cost: multi-phase summation** — `_calcDailyCost` now accepts variadic entity
  IDs and sums energy across all of them. Main meter and 3-phase circuits pass all three
  phase entities so cost reflects total consumption, not just L1 (which is often near
  0 W while L3 carries most of the load).

- **Daily cost: consistent Kč display** — removed the `Kč/h` fallback that appeared on
  circuits without sufficient history. All circuits now show either `X.XX Kč` (today so
  far) or nothing. Results below `0.005 Kč` are suppressed.

- **NT/VT split accuracy** — `_isNTAt` now uses HDO switch history only for timestamps
  within the recorded window. For earlier timestamps it falls back to the tariff
  schedule, which is always authoritative. A single history entry at midnight previously
  caused the entire preceding day to be classified as one tariff.

---

## [4.3.0] - 2026-06-04

### Fixed

- **Sparkline graphs and daily cost not showing** — `processEntries` used the old HA
  history format (`e.state`, `e.last_changed`) but HA 2023.3+ returns a compressed
  format (`e.s` for state, `e.lu`/`e.lc` as Unix float seconds). All power sensor
  values were parsed as `NaN` and discarded; only the HDO switch survived because its
  boolean check (`=== 'on'`) returned `0` rather than `NaN`. Updated parser supports
  both formats with fallback.

- **`setConfig` race condition** — `_historyCache` was cleared unconditionally in
  `setConfig`. If called while a fetch was in progress (between the two `await` points),
  it erased freshly fetched data. Cache is now only cleared when no fetch is running.

### Changed

- `processEntries` emits a `console.warn` per entity when 0 valid data points survive
  filtering, including a raw sample to make regressions immediately visible.

---

## [4.2.2] - 2026-06-03

### Fixed

- **Devices under single-phase breakers shown in three columns** — single-phase breaker
  device lists were rendered in the `.tp-devices-grid` (3-column) intended for 3-phase
  circuits. Now uses `.devices-list` — full width, single column.

---

## [4.0.0] - 2026-06-03

### Changed — Dark visual redesign

- Card background locked to `#111318` regardless of HA theme.
- HDO bar: dark green/red tint, pulsing dot, large countdown, inline progress bar.
- Main meter: dark surface, icon, uppercase label, phase cells on darker background.
- Circuit cards: muted name, prominent power value, thin 2 px left border accent
  (green for active, amber for critical).
- 3-phase circuits: dedicated `.three-phase-card` class, consistent with single-phase.
- Schedule, timeline, devices: all updated to dark palette.
- Toggles: 32 px, dark-off (`#374151`), dark-green-on (`#16a34a`).
- Load bar: 3 px, dark track (`#1f2937`), solid colour fill.

---

## [3.0.4] - 2026-06-03

### Fixed

- **Dashboard freeze** — replaced the non-standard `shouldUpdate` override with a custom
  `hass` getter/setter. `requestUpdate` is now called only when a tracked entity
  actually changes, following the standard HA pattern for performance-sensitive cards.

---

## [3.0.3] - 2026-06-03

### Fixed

- **"Custom element doesn't exist"** — reverted Lit externalisation from 3.0.1. HA's
  import map does not reliably resolve `lit/decorators.js` as a bare specifier. Lit is
  bundled again (~93 kB).

---

## [3.0.2] - 2026-06-03

### Fixed

- **All dashboards freezing (root cause)** — removed the custom `shouldUpdate` override.
  It corrupted Lit's internal reactive-element update cycle, stalling every card on the
  page.

---

## [3.0.1] - 2026-06-03

### Fixed

- **All dashboards freezing** — externalised Lit from the bundle so the card uses HA's
  built-in Lit instance instead of shipping its own copy. *(Superseded by 3.0.2,
  reverted in 3.0.3.)*

---

## [3.0.0] - 2026-06-03

### Changed — Visual redesign (light-theme iteration, superseded by 4.0.0)

- HDO hero card with gradient background, pulsing dot, large countdown.
- Circuit cards: green glow on active, 22 px power value.
- Load bar: 3-zone gradient track.
- Section labels: left accent border.

---

## [2.7.1] - 2026-06-03

### Fixed

- Removed confusing "NT remaining" total from collapsed schedule header.

---

## [2.7.0] - 2026-06-03

### Changed

- Collapsed schedule shows current tariff badge and time range inline.
- Timeline bar shows a white marker at the current time position.

---

## [2.6.0] - 2026-06-03

### Added

- Current NT/VT slot visible in collapsed schedule header.
- Channel group header shows summed watts and amperes.

---

## [2.5.0] - 2026-06-03

### Added

- Collapsible daily schedule (collapsed by default).
- 3-phase device column layout: one column per phase under each circuit.

### Fixed

- Drag & drop reordering in the GUI editor restored.

---

## [2.4.0] - 2026-06-02

### Fixed

- **Midnight VT bug** — PRE 605/606 presets were missing `00:00–01:00` and
  `22:00–00:00` NT windows. Data re-sourced from the official PRE HDO Excel.
