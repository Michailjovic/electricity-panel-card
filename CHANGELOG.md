# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.2.3] - 2026-06-03

### Added
- Detailed `console.log` diagnostics for the history fetch — logs entity count, data point count, a sample entry, and final cache size. Useful for debugging when sparkline graphs or cost calculations do not appear. Will be removed in the next release once the root cause is confirmed.

---

## [4.2.2] - 2026-06-03

### Fixed
- **Devices under single-phase breakers shown in one column** — devices were rendered in the 3-column `.tp-devices-grid` intended for 3-phase circuits. Single-phase breakers now use a flat `.devices-list` — full width, single column.

### Changed
- History fetch errors are now logged as `console.warn` to aid debugging when sparkline graphs do not appear.

---

## [4.0.0] - 2026-06-03

### Changed — Dark visual redesign
- **Card background** — the entire card now uses a dark theme (`#111318` base) regardless of the HA theme. Designed for users who run HA in dark mode and want a consistent dark aesthetic.
- **HDO bar** — dark green / dark red background tint, uppercase label in accent colour, countdown large and coloured, progress bar inline below the label. Cleaner than the previous card-with-gradient approach.
- **Main meter** — dark surface card with icon, uppercase label, phase cells on even darker background.
- **Circuit cards** — dark surface, circuit name in muted colour, power value prominent in `#e2e8f0`; inactive circuits show the value dimmed (`#374151`). Active border accent is a thin 2 px left stripe (green or amber for critical).
- **3-phase circuits** — separate `.three-phase-card` class, consistent with single-phase style.
- **Schedule, timeline, devices** — all updated to dark palette. Section labels use left border accent on dark colour.
- **Toggles** — slightly smaller (32 px), dark-off (`#374151`), dark-green-on (`#16a34a`).
- **Load bar** — reduced to 3 px, dark track (`#1f2937`), no zone gradient (gradient was only visible on light backgrounds).

---

## [3.0.4] - 2026-06-03

### Fixed
- **Dashboards freezing after a few updates** — removing `shouldUpdate` in 3.0.2 fixed the Lit lifecycle interference but left the card re-rendering on every single entity state change in HA (potentially hundreds per second), saturating the JS event loop. Replaced with a custom `hass` getter/setter: HA can always set the property, but `requestUpdate` is only called when a tracked entity actually changes. This is the standard HA pattern for performance-sensitive cards and avoids touching any Lit internal lifecycle methods.

---

## [3.0.3] - 2026-06-03

### Fixed
- **"Custom element doesn't exist" after 3.0.1** — reverted Lit externalisation introduced in 3.0.1. HA's import map does not reliably provide `lit/decorators.js` as a resolvable bare specifier, so the card module failed to load entirely. The root cause of the dashboard freeze was the `shouldUpdate` override (removed in 3.0.2), not the bundled Lit copy. Lit is bundled again; bundle size is back to ~93 kB.

---

## [3.0.2] - 2026-06-03

### Fixed
- **All dashboards freezing after install (root cause)** — the custom `shouldUpdate` override was a non-standard intrusion into Lit's internal update lifecycle. Although intended as a performance optimisation (skip re-render when no tracked entity changed), it produced side-effects inside a lifecycle hook that is expected to be pure, and its interaction with HA's Lit-based update propagation caused the entire Lovelace reactive chain to stall for every card on the page. Removed entirely; the card now follows standard Lit behaviour and re-renders whenever `hass` changes.

---

## [3.0.1] - 2026-06-03

### Fixed
- **All dashboards freezing after install** — the card was bundling its own copy of Lit (v4.2.2) alongside Home Assistant's built-in Lit. Both instances shared `globalThis.litPropertyMetadata` and other global Lit state, potentially corrupting the reactive-element update cycle. Fixed by externalising Lit from the Vite bundle (`rollupOptions.external`); the card uses HA's provided Lit via the import map. Bundle size reduced from 95 kB to 70 kB. *(Note: this fix was superseded by 3.0.2 and reverted in 3.0.3.)*

---

## [3.0.0] - 2026-06-03

### Changed — Visual redesign
- **HDO hero card** — the tariff bar is now a proper card with gradient background (green/red), pulsing live dot, and the countdown shown large (20px bold). A thin progress bar shows how far through the current tariff window you are.
- **Circuit cards** — active circuits (is-on) now have a subtle green glow (`box-shadow`). Circuit name bumped to 14px/700. Power metric bumped to 22px/700.
- **Load bar track** — the track now has a subtle 3-zone gradient (green → amber → red) so you can see the danger zones even at low load.
- **Section labels** — left accent border for visual separation.
- **Phase cells** — subtle primary-colour tint instead of plain white background.

### Added
- Current window progress — `_getCurrentSlotPct()` computes the % elapsed in the active NT/VT window from the schedule; used for the HDO card progress bar.

---

## [2.7.1] - 2026-06-03

### Fixed
- "19h NT left" in collapsed schedule header removed — it showed the sum of ALL remaining NT windows today, which was confusing (looked like a bug). The HDO bar already shows when the current window ends. NT remaining is now shown only in the expanded view.

---

## [2.7.0] - 2026-06-03

### Changed
- Schedule collapsed view redesigned — the big progress-bar row is removed. The collapsed header now shows the current tariff badge and time range inline (e.g. `NT 00:00–01:00`). The 24h timeline bar is always visible below the header.
- Timeline bar shows a white position marker — a thin white line marks the current time within the full-day bar, so you can see at a glance where you are in the day.

---

## [2.6.0] - 2026-06-03

### Added
- Schedule shows active slot when collapsed — the current NT/VT row (with time range, progress bar and "Now" badge) is always visible even when the schedule is collapsed. No need to expand just to see where you are.
- Channel group sum — the header of a multi-channel device group (e.g. Shelly 4PM "Power strip PC Table") now shows the total watts and amperes summed across all channels that have measurement entities.

---

## [2.5.0] - 2026-06-03

### Added
- Collapsible schedule — the daily tariff schedule is now collapsed by default, showing only the current day/type and NT remaining time in the header. Click to expand the full 24h view. The Today/Tomorrow toggle appears only when expanded.
- 3-phase device column layout — devices under a 3-phase circuit are now displayed in a 3-column grid (one column per phase), so L1/L2/L3 device groups align visually with the phase cells above them.

### Fixed
- Drag & drop reordering in the GUI editor now works — the drop target (`dragover`/`drop` handlers) was missing from circuit rows after the v2.2.0 device-row bugfix. Restored on the correct element. The drag handle is now a plain `<span>⠿</span>` instead of `ha-icon`, which is reliably draggable in all browsers.

---

## [2.4.0] - 2026-06-02

### Fixed
- **Midnight VT bug** — PRE 605/606 (D57d) presets were missing two NT windows per day: `00:00–01:00` at the start and `22:00–00:00` at the end. The schedule incorrectly showed VT at midnight. Data now sourced directly from the official P