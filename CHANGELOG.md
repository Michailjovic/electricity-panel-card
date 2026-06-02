# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
