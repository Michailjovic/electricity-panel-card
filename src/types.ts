export const EP_VERSION = '5.5.1';

// ── Home Assistant types ────────────────────────────────────────────────────

export interface HassEntity {
  state: string;
  attributes: Record<string, unknown>;
  entity_id: string;
  last_updated?: string;  // ISO 8601 — when any attribute or state changed
  last_changed?: string;  // ISO 8601 — when state value changed
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  locale?: { language?: string };
  callService(
    domain: string,
    service: string,
    data: Record<string, unknown>
  ): Promise<void>;
  callWS<T = unknown>(msg: Record<string, unknown>): Promise<T>;
}

// ── Card config types ────────────────────────────────────────────────────────

/** A single channel on a multi-channel device (e.g. Shelly 4PM zone) */
export interface DeviceChannel {
  name: string;
  switch?: string;   // entity_id of the relay switch
  power?: string;    // entity_id of the power sensor (W)
  current?: string;  // entity_id of the current sensor (A)
}

/** A device wired behind a circuit breaker */
export interface CircuitDevice {
  name: string;
  /** When true, renders as a plain text label — no entities, no toggle */
  note?: boolean;
  switch?: string;              // entity_id — if the device has a smart relay
  power?: string;               // entity_id — power sensor (W)
  current?: string;             // entity_id — current sensor (A)
  channels?: DeviceChannel[];   // for multi-channel devices (Shelly 4PM, 2PM …)
}

/** A single circuit breaker and everything behind it */
export interface Circuit {
  /** Unique identifier used internally — e.g. "c08" or "kotel" */
  id: string;
  /** Display name shown on the card */
  name: string;
  /** 1 or 3 phases. Default: 1 */
  phases?: 1 | 3;
  /** Mark circuit as critical — hides the toggle, shows a lock icon */
  critical?: boolean;
  /** Ask for confirmation before toggling the breaker switch */
  confirm_toggle?: boolean;
  /** Breaker rating in Amperes, used for the load bar (default: 16 A single-phase, 63 A three-phase) */
  max_current?: number;
  /**
   * Position label in the physical distribution board — e.g. "08" or "V1".
   * Only used by `view: panel`, where it is printed on the module and drives
   * the order of modules on the rail (natural sort: 01 < 08 < 10 < V1).
   * Circuits without a position keep their config order and sort last.
   */
  position?: string;
  /**
   * Which phase this single-phase circuit sits on. Only used by `view: panel`
   * for the coloured stripe at the bottom of the module; 3-phase circuits
   * derive it from `phases: 3` and ignore this. Optional — without it the
   * module simply has no stripe.
   */
  phase?: 'L1' | 'L2' | 'L3';
  // ── Tuya / smart breaker entities ──
  switch?: string;   // entity_id of the breaker switch
  power?: string;    // entity_id — W (total)
  current?: string;  // entity_id — A (total)
  energy?: string;   // entity_id — kWh today
  voltage?: string;  // entity_id — V (optional, used for display only)
  // ── Per-phase entities (3-phase circuits only) ──
  power_l1?: string;   // entity_id — W phase 1
  power_l2?: string;
  power_l3?: string;
  current_l1?: string; // entity_id — A phase 1
  current_l2?: string;
  current_l3?: string;
  // ── Per-phase voltage (3-phase circuits only) ──
  voltage_l1?: string; // entity_id — V phase 1
  voltage_l2?: string;
  voltage_l3?: string;
  /** Devices wired behind this breaker */
  devices?: CircuitDevice[];
}

/** Main 3-phase meter at the grid entry */
export interface MainMeter {
  power_l1?: string;    // W
  power_l2?: string;
  power_l3?: string;
  current_l1?: string;  // A
  current_l2?: string;
  current_l3?: string;
  energy_today?: string; // kWh
  voltage?: string;      // V — single value (backward compat)
  voltage_l1?: string;   // V phase 1
  voltage_l2?: string;
  voltage_l3?: string;
}

/** One day's NT windows — list of start times (HH:MM) + durations in minutes */
export interface TariffDay {
  starts: string[];
  offsets: number[];
}

/** HDO (time-of-use tariff) entities and schedule */
export interface HdoConfig {
  /** switch.hdo — on = NT (low tariff), off = VT (high tariff) */
  switch?: string;
  /** Sensor: datetime of next switch to high tariff */
  next_high?: string;
  /** Sensor: datetime of next switch to low tariff */
  next_low?: string;
  /** Workday sensor for weekday/weekend schedule switching */
  workday_sensor?: string;
  /**
   * Public holiday sensor — `on` means today is a public holiday.
   * Supports `calendar.*` entities (e.g. the Czechia holiday calendar):
   * besides today's state, the calendar's next-event attributes are used
   * to detect whether TOMORROW is a holiday for the tomorrow schedule view.
   */
  holiday_sensor?: string;
  /**
   * Entity whose `schedule` attribute provides the NT windows directly —
   * e.g. `sensor.cez_hdo_schedule_*` from the `ha_cez_distribuce` integration:
   * an array of `{ start, end, tariff }` (ISO datetimes, "NT"/"VT"). Highest
   * priority schedule source (Fáze 2, ROADMAP.md) — when it resolves usable
   * windows for a given day, `tariff_preset`/`schedule` are not consulted for
   * that day. Falls through to them when the entity is missing/unavailable
   * or its `schedule` attribute doesn't cover the day.
   */
  schedule_entity?: string;
  /**
   * PRE tariff preset code — e.g. '605'. When set, the card loads the
   * built-in schedule for that tariff. Used when `schedule_entity` isn't
   * configured or doesn't resolve for the day; takes precedence over `schedule`.
   */
  tariff_preset?: string;
  /** Price per kWh during low tariff (NT) — used for cost rate display */
  nt_price?: number;
  /** Price per kWh during high tariff (VT) — used for cost rate display */
  vt_price?: number;
  /** Currency symbol shown next to prices (default: Kč) */
  currency?: string;
  /** Manual NT schedule (used when tariff_preset is not set) */
  schedule?: {
    weekday: TariffDay;
    weekend: TariffDay;
    holiday?: TariffDay;
  };
  /**
   * When an NT window ends exactly at midnight and tomorrow's schedule starts
   * a new NT window at 00:00, display them as one continuous window in the
   * schedule timeline/rows and the countdown (default: false). Presentation
   * only — internal per-day computation and cost integration are unaffected.
   */
  merge_midnight?: boolean;
}

/**
 * `view: panel` — the DIN-rail layout. Everything here is optional; the
 * defaults produce a usable rail from a config that only added `position`
 * to its circuits.
 */
export interface PanelConfig {
  /**
   * How many module widths fit on one rail row before it wraps (default: 12).
   * A single-phase breaker is 1 width, a 3-phase breaker is 3 — same as in a
   * real board.
   */
  rail_size?: number;
  /** Main breaker rating in Amperes (default: 25). Drives its load level. */
  main_breaker?: number;
  /** Draw a micro sparkline inside each module as background (default: true) */
  module_spark?: boolean;
  /** Show the synthetic main-breaker module at the head of the rail (default: true) */
  show_main?: boolean;
}

/** Top-level card configuration */
export interface ElectricityPanelConfig {
  type: string;
  /** Optional card title */
  title?: string;
  /**
   * Layout mode. `classic` (default) is the original card — main meter card
   * plus a grid of circuit cards. `panel` renders the breakers as modules on
   * a DIN rail with an expandable detail below, and moves the schedule/costs
   * block underneath it.
   */
  view?: 'classic' | 'panel';
  /** Options for `view: panel` — ignored in classic view. */
  panel?: PanelConfig;
  main_meter?: MainMeter;
  hdo?: HdoConfig;
  /** Ordered list of circuits — 3-phase circuits are rendered in their own row */
  circuits?: Circuit[];
  /** History window for sparkline graphs in 3-phase phase cells (hours, 1–24, default 3) */
  graph_hours?: number;
  /** Sparkline line / fill colour — any CSS colour string (default: #7c8ba1,
   *  a neutral blue-grey). It used to be #ef4444, the same red as high tariff
   *  and error states; the graph is context, not a signal. Must be a concrete
   *  colour, not `var(...)` — it goes into SVG presentation attributes. */
  sparkline_color?: string;
  /** Where min/max labels appear: left (start of period) | right (current end) | none */
  sparkline_labels?: 'left' | 'right' | 'none';
  /** Draw a horizontal dashed reference line at the min and max values */
  sparkline_ref_line?: boolean;
  /** Colour of the dashed reference lines — CSS colour string.
   *  Unset follows the theme (`var(--ep-text-faint)`); it used to default to
   *  semi-transparent white, which was invisible under `follow_theme` on a
   *  light HA theme. */
  sparkline_ref_color?: string;
  /** Show sparkline on main meter phase cells (default: true) */
  sparkline_main_meter?: boolean;
  /** Show sparkline on 3-phase circuit phase cells (default: true) */
  sparkline_3phase?: boolean;
  /** Show sparkline on single-phase circuit cards (default: false) */
  sparkline_1phase?: boolean;
  /** Show last-updated age badge on all circuits and main meter */
  show_age_badge?: boolean;
  /** Follow the active HA theme colours instead of the built-in dark palette (default: false) */
  follow_theme?: boolean;
  /** Enable verbose console logging for history fetch debugging (default: false) */
  debug?: boolean;
  /** During VT, show a per-circuit hint with next NT start and potential saving (default: false) */
  show_nt_hint?: boolean;
  /** Minimum circuit power draw (W) for the NT hint to appear (default: 100) */
  nt_hint_min_watts?: number;
  /** Minutes since last update before badge turns amber (default: 5) */
  age_warn_minutes?: number;
  /** Minutes since last update before badge turns red (default: 15) */
  age_stale_minutes?: number;
  /** Badge colour when data is fresh. Unset follows the theme
   *  (`var(--ep-text-faint)`) so "quiet" stays quiet in dark and light alike. */
  age_ok_color?: string;
  /** Badge colour at warn threshold */
  age_warn_color?: string;
  /** Badge colour at stale threshold */
  age_stale_color?: string;
}
