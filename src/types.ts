// ── Home Assistant types ────────────────────────────────────────────────────

export interface HassEntity {
  state: string;
  attributes: Record<string, unknown>;
  entity_id: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  callService(
    domain: string,
    service: string,
    data: Record<string, unknown>
  ): Promise<void>;
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
  /** Breaker rating in Amperes, used for the load bar (default: 16 A single-phase, 63 A three-phase) */
  max_current?: number;
  // ── Tuya / smart breaker entities ──
  switch?: string;   // entity_id of the breaker switch
  power?: string;    // entity_id — W
  current?: string;  // entity_id — A
  energy?: string;   // entity_id — kWh today
  voltage?: string;  // entity_id — V (optional, used for display only)
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
  voltage?: string;      // V — displayed per phase if present
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
   * PRE tariff preset code — e.g. '605'. When set, the card loads the
   * built-in schedule for that tariff. Takes precedence over `schedule`.
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
}

/** Top-level card configuration */
export interface ElectricityPanelConfig {
  type: string;
  /** Optional card title */
  title?: string;
  main_meter?: MainMeter;
  hdo?: HdoConfig;
  /** Ordered list of circuits — 3-phase circuits are rendered in their own row */
  circuits?: Circuit[];
}
