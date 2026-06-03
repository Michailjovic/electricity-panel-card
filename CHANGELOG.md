# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.0.1] - 2026-06-03

### Fixed
- **All dashboards freezing after install** — the card was bundling its own copy of Lit (v4.2.2) alongside Home Assistant's built-in Lit. Both instances shared `globalThis.litPropertyMetadata` and other global Lit state, corrupting the reactive-element update cycle for every Lovelace card on the page — not just this one. Fixed by externalising Lit from the Vite bundle (`rollupOptions.external`); the card now uses HA's provided Lit via the import map (available since HA 2023.4). Bundle size reduced from 95 kB to 70 kB as a side effect.

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
- **Midnight VT bug** — PRE 605/606 (D57d) presets were missing two NT windows per day: `00:00–01:00` at the start and `22:00–00:00` at the end. The schedule incorrectly showed VT at midnight. Data now sourced directly from the official PRE HDO Excel (`aktualni-program-hdo-ke-stazeni.xls`, valid 2025-10-16 → 2028-01-26). All 7 windows per day are present, including midnight-bordering slots.

### Changed
- **3-phase circuit auto-sum** — when no total `power` / `current` entity is configured on a 3-phase circuit, the card automatically sums `power_l1 + power_l2 + power_l3` for the total display and uses `max(current_l1, current_l2, current_l3)` for the load bar. No manual total entity required (Shelly 3-phase, Tuya 3P breakers, etc.).
- L1/L2/L3 phase cells are always shown on 3-phase circuit cards — even before per-phase entities are configured, they display `0.00 kW / 0.0 A` as placeholders.

---

## [2.3.0] - 2026-06-02

### Added
- Per-phase monitoring for 3-phase circuits — configure `power_l1/l2/l3` and `current_l1/l2/l3` entities on any 3-phase circuit to get an L1/L2/L3 breakdown card styled exactly like the main meter. Editor shows per-phase entity pickers when a circuit is set to 3-phase.
- 24h timeline bar — a compact colour-coded bar at the top of the schedule block shows the full day NT/VT pattern at a glance (green = NT, red = VT). Active slot glows.

### Changed
- Single-phase circuit grid capped at 2 columns (was `auto-fill` which produced 8+ columns on wide screens). Falls back to 1 column on very narrow containers.
- 3-phase circuits moved out of the circuit grid into a stacked full-width layout, consistent with the main meter visual style.
- Circuit name tooltip — truncated names now show full text on hover (`title` attribute).

---

## [2.2.0] - 2026-06-02

### Added
- Full-day tariff schedule — the schedule now shows all 24 hours as alternating NT/VT blocks, not just the low-tariff windows. Each row has a colour-coded NT/VT badge, a progress bar, and a "Now" pill on the currently active slot.
- Text-only device label — a device under a circuit breaker can now be marked as a note (`note: true`). It renders as a plain italic label (e.g. "Mikrovlnka") with no entity, no toggle, and no metrics. The editor shows a checkbox to toggle this mode.

### Changed
- Responsive circuit grid — switched to `auto-fill minmax(150px, 1fr)` with a container query fallback to a single column on very narrow screens. Circuit cards no longer overflow off-screen on mobile.
- Visual redesign — modernised card appearance: subtle drop-shadows on circuit cards, coloured left-border accent (green when on, amber when critical), glow ring on active status dots, gradient HDO bar with icon pill, 18 px bold power metric, and wrappable secondary metrics so nothing clips on mobile.

### Fixed
- Device rows in the editor incorrectly carried circuit drag-and-drop handlers (`idx` reference error); removed from device rows.

---

## [2.1.0] - 2026-06-02

### Added
- NT remaining time — "Xh Ym left · Xh total" shown under today's schedule header, summarising how much low-tariff time is still available today
- Tomorrow's NT schedule — toggle button next to the schedule header switches between today and tomorrow; uses the correct weekday/weekend/holiday schedule for each day
- Tariff pricing — `nt_price` and `vt_price` (per kWh) and `currency` can now be set in the HDO config; the current price rate is shown in the HDO bar next to the NT/VT indicator
- Cost rate per circuit — when tariff prices are configured, each circuit footer shows an estimated cost rate (e.g. `0.42 Kč/h`) based on live power draw
- Drag & drop circuit reordering in the GUI editor — grab the ⠿ handle on any circuit row and drag it to a new position

### Fixed
- Escaped backtick syntax errors introduced by the Python-based patch script in v2.1.0-dev; all template literals restored to valid TypeScript

---

## [2.0.5] - 2026-06-02

### Added
- NT schedule visualization — shows all of today's low-tariff windows with individual progress bars, a "Now" badge on the active window, and dimmed past slots. Updates automatically every 30 seconds.
- Built-in PRE tariff presets (600, 601, 605, 606, 607) extracted from official PRE HDO schedule. Select your tariff code in the editor — weekday, weekend and public holiday schedules are loaded automatically.
- Tariff preset selector dropdown in the GUI editor (HDO section)

---

## [2.0.4] - 2026-06-02

### Added
- Countdown timer is now live — card auto-refreshes every 30 seconds via `setInterval`, so the time-to-next-switch stays accurate without waiting for an entity state change
- Smart power formatting: values below 1 kW display as W (e.g. `85 W`), values above display as kW (e.g. `2.20 kW`)
- Voltage (V) now shown in circuit footer when `voltage` entity is configured

---

## [2.0.3] - 2026-06-02

### Added
- GitHub Actions workflow (`.github/workflows/release.yml`) — pushing a tag now automatically builds the card and creates a full GitHub release with the JS file attached as a release asset

### Fixed
- Power and energy sensors are now unit-aware: values in kW, MW, Wh, or MWh are automatically converted for display. No configuration needed — the card reads `unit_of_measurement` from the entity attribute. Tuya breakers reporting in kW now show correct values.

---

## [2.0.2] - 2026-06-02

### Fixed
- Visual editor failing with "Cannot read properties of undefined (reading 'bind')"
- Editor now uses standard `@property()` + `shouldUpdate()` lifecycle, preventing unnecessary re-renders on every hass state update

---

## [2.0.1] - 2026-06-02

### Fixed
- Editor not rendering in the HA card configuration dialog — the editor module was not imported in the main card file, causing it to be excluded from the bundle
- Build failing on Windows-mounted filesystem — added `emptyOutDir: false` to Vite config to prevent the `EPERM unlink` error
- Vite cache files (`.mjs`) added to `.gitignore` to prevent them from appearing as uncommitted changes

---

## [2.0.0] - unreleased

### Changed
- Project rewritten as a proper custom Lovelace card (TypeScript + Lit + Vite)
- Single distributable JS file (`dist/electricity-panel-card.js`) — installable via HACS

### Added
- Full electrical panel layout: main 3-phase meter + 3-phase circuits row + single-phase breaker grid
- Per-circuit live metrics: watts (W), amperes (A), kWh today
- Load bar with colour thresholds (green / amber / red) relative to rated breaker current
- Remote toggle on all circuits including 3-phase
- Critical circuit protection: replaces toggle with a lock icon
- Device hierarchy: expandable sub-list per circuit showing wired devices
- Multi-channel device support for Shelly 4PM / 2PM (per-channel name, switch, power, current)
- Built-in GUI config editor with entity searchboxes (input + datalist pattern)
- HDO tariff status bar with NT/VT indicator and countdown to next switch
- `getStubConfig()` for HA card picker preview

### Moved
- Standalone HDO button-card dashboard YAML moved to `examples/hdo-dashboard.yaml`

---

## [1.0.0] - 2026-06-02

### Added
- Initial release of the Electricity HDO Dashboard
- NT/VT tariff indicator with animated glow and pulsing status dot
- Countdown to next tariff switch with exact switch time
- Period progress bar showing completion percentage of the current NT/VT window
- Daily NT schedule with per-slot progress bars and active-slot *Now* badge
- Clock chip and workday/weekend/holiday chip
- Dark glassmorphism design with green (NT) / red (VT) color theming
- Hardcoded NT schedule for PRE distributor, tariff D25d, code 605
- Automatic weekday/weekend schedule switching via `binary_sensor.workday_sensor`
