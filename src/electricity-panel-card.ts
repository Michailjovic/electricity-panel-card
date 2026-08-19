import { LitElement, html, svg, css, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './electricity-panel-editor.js';
import { PRE_TARIFFS } from './tariff-presets.js';
import { EP_VERSION } from './types.js';

import { localize } from './localize.js';
import type {
  HomeAssistant,
  ElectricityPanelConfig,
  Circuit,
  CircuitDevice,
  DeviceChannel,
} from './types.js';
import {
  dayEndMs,
  fmtMins,
  computeDayType,
  computeTomorrowDayType,
  isWithinHolidayEvent,
  ntRemainingMinsFromWindows,
  buildFullDaySlotsFromWindows,
  mergeMidnightNt,
  ntWindowsForDay,
  parseScheduleEntity,
  resolveHdoStatus,
  isNTAt,
  accumulateTariffWh,
  calcCost,
  ntFractionOfInterval,
  accumulateTariffWhFromStats,
  estimateMonthCost,
  accumulateTariffWhFromEnergyBuckets,
  comparePosition,
  buildRails,
  loadPercent,
  type DaySlot,
  type DayType,
  type Window,
  type HdoStatus,
  type StatBucket,
  type HistPoint,
  type EnergyBucket,
} from './utils.js';

/** Balíček A: výchozí barva sparklinu. Byla `#ef4444`, tedy stejná červená jako
 *  vysoký tarif a chybové stavy — průběh spotřeby přitom není signál, ale
 *  kontext. Musí zůstat konkrétní hex: hodnota jde do SVG prezentačních
 *  atributů (`stroke`, `stop-color`), kde se `var()` nevyhodnotí. */
const EP_SPARK_DEFAULT = '#7c8ba1';

/** Synthetic id for the main-breaker module in `view: panel` — it has no
 *  Circuit of its own, it summarises `main_meter`. Prefixed so it can never
 *  collide with a user's circuit id. */
const EP_MAIN_ID = '__ep_main__';

/** One module on the rail in `view: panel`, with everything the render needs
 *  already resolved from hass — so the template stays declarative and the
 *  entity lookups happen once per module, not once per use. */
interface PanelModule {
  id: string;
  /** Module positions occupied: 1 for single-phase, 3 for a 3-phase breaker */
  width: number;
  /** Label printed at the bottom of the module ("08", "V1"); may be empty */
  position: string;
  name: string;
  phaseCls: 'l1' | 'l2' | 'l3' | 'l3f' | 'none';
  watts: number;
  amps: number;
  maxA: number;
  pct: number;
  isOn: boolean;
  hasSwitch: boolean;
  critical: boolean;
  /** Entity whose history backs the micro graph and the detail graph */
  sparkId?: string;
  /** Set when `sparkId` is one phase of a 3-phase module rather than its total
   *  — the label is shown next to the graph so a single phase is never read
   *  as the whole breaker. */
  sparkPhase?: string;
  /** Absent for the synthetic main-breaker module */
  circuit?: Circuit;
}

/** One entity's cached sparkline geometry — see `_sparkCache` for why each
 *  field is part of the cache key. */
interface SparkCache {
  data: Array<{t: number; v: number}>;
  windowEnd: number;
  hours: number;
  line: string;
  area: string;
  vMin: number;
  vMax: number;
  hoverPts: Array<{x: number; y: number; t: number; v: number}>;
}

@customElement('electricity-panel-card')
export class ElectricityPanelCard extends LitElement {
  // hass is NOT declared with @property — we manage reactivity manually via
  // the custom setter so we only re-render when a tracked entity actually
  // changes, without overriding Lit's internal shouldUpdate lifecycle.
  private _hass!: HomeAssistant;
  get hass(): HomeAssistant { return this._hass; }
  set hass(value: HomeAssistant) {
    const old = this._hass;
    this._hass = value;
    // First hass assignment — HA sets hass after setConfig, so fetch history now
    if (!old) {
      void this._fetchHistory();
      this.requestUpdate('hass', old);
      return;
    }
    // Re-render only when a tracked entity actually changed. With no tracked
    // entities nothing on the card depends on hass — skip the update entirely.
    if (this._trackedIds.length &&
        this._trackedIds.some(id => value.states[id] !== old.states[id])) {
      this.requestUpdate('hass', old);
    }
  }

  @state() private _config!: ElectricityPanelConfig;
  @state() private _expanded = new Set<string>();
  @state() private _showTomorrow = false;
  @state() private _scheduleExpanded = false;
  /** Fáze 3.3 (ROADMAP.md): which tab the schedule-block shows — decided in
   *  3.1 (variant C: tab inside the schedule block, not a separate section
   *  or card). Schedule stays the default so costs are a deliberate second
   *  step, not the first thing the card shows. */
  @state() private _scheduleTab: 'schedule' | 'costs' = 'schedule';
  @state() private _costsPeriod: 'today' | '7d' | 'month' = 'today';
  /** Odloženo/zamítnuto → un-deferred (ROADMAP.md, 2026-08-12): transient
   *  override for the sparkline window (1h/3h/6h/24h buttons), independent
   *  of `graph_hours` config — resets to config on reload. `undefined` means
   *  "use config default". Not persisted: this is a viewing convenience, not
   *  a card setting. */
  @state() private _sparkWindowHours?: number;
  /** view: panel — which modules are selected. Empty = hint, one = detail,
   *  more = comparison. Deliberately not persisted: it is a way of looking at
   *  the board right now, not a card setting. */
  @state() private _panelPick: string[] = [];
  /** view: panel — force one Y scale across compared graphs. On by default:
   *  comparing curves on independent axes is the failure mode this view is
   *  meant to remove. */
  @state() private _panelSharedY = true;

  private _timer?: number;
  private _historyTimer?: number;
  private _refetchDebounce?: number;
  private _trackedIds: string[] = [];
  private _historyCache = new Map<string, Array<{t: number; v: number}>>();
  /** Fáze 3.2 (ROADMAP.md): recorder/statistics_during_period buckets (5minute,
   *  since midnight), keyed by entity_id. Populated only for entities that
   *  actually have long-term statistics (state_class set) — entities absent
   *  here fall back to `_historyCache`'s raw-history integration in
   *  `_calcDailyCost`. Lighter on the recorder than raw history and survives
   *  purge, but not every power entity is guaranteed to have it. */
  private _statsCache = new Map<string, StatBucket[]>();
  /** Fáze 3.3 (ROADMAP.md): 31-day hourly statistics for the Náklady tab's
   *  "7 dní"/"Měsíc" periods, keyed by entity_id — separate from
   *  `_statsCache` (today, 5minute) since it's a different period/range and
   *  is only worth fetching once someone actually opens the tab. */
  private _rangeStatsCache = new Map<string, StatBucket[]>();
  /** Same 31-day window's hdo.switch history — kept apart from
   *  `_historyCache`'s today-only entry for that entity so `_isNTAt`'s
   *  "today only" assumption (Fáze 1.1) stays true for the always-on path. */
  private _rangeSwitchHistory: HistPoint[] | undefined;
  /** Post-3.3 (ROADMAP.md): exact 'change' statistics for entities with a
   *  real energy (kWh) sensor configured (`main_meter.energy_today`,
   *  `circuit.energy`) — preferred over the mean-W approximation in
   *  `_statsCache`/`_rangeStatsCache` wherever one exists. `_energyStatsCache`
   *  is today/5minute (always-on, circuit badges need it); the range one is
   *  hourly and only ever holds `main_meter.energy_today` (lazy, Náklady tab
   *  7d/month only). */
  private _energyStatsCache = new Map<string, EnergyBucket[]>();
  private _rangeEnergyStatsCache = new Map<string, EnergyBucket[]>();
  private _rangeFetching = false;
  /** Timestamp the range fetch last completed through — 0 means never
   *  fetched. Re-fetched on tab-open if older than 5 minutes, same cadence
   *  as the regular history/stats timer. */
  private _rangeFetchedThrough = 0;
  private _historyFetching = false;
  private _refetchQueued = false;
  /** Timestamp of the last successful history fetch — right edge of sparkline x-axis */
  private _historyWindowEnd = 0;
  /** Computed sparkline paths, keyed by entity_id; invalidated on new data / new
   *  window. `hours` joined the invalidation key alongside `data`/`windowEnd`
   *  once the window became switchable at runtime (`_sparkWindowHours`) — it
   *  used to only ever come from static config, so it never needed to be a
   *  cache-busting input before. `hoverPts` carries each plotted point's SVG
   *  x/y alongside its source t/v so the hover tooltip can look up "nearest
   *  point" by x without recomputing the whole path. */
  private _sparkCache = new Map<string, SparkCache>();

  override connectedCallback(): void {
    super.connectedCallback();
    this._timer = window.setInterval(() => this.requestUpdate(), 30_000);
    this._historyTimer = window.setInterval(() => { void this._fetchHistory(); }, 300_000);
    void this._fetchHistory();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._timer);
    clearInterval(this._historyTimer);
    clearTimeout(this._refetchDebounce);
  }

  // ── HA card API ────────────────────────────────────────────────────────────

  setConfig(config: ElectricityPanelConfig): void {
    if (!config) throw new Error('Invalid configuration');
    const prev = this._config;
    this._config = config;
    this._trackedIds = this._buildTrackedIds();
    // Appearance-only changes (color, label position, reference line) need just a
    // re-render — no cache clear or re-fetch needed.
    const appearanceOnly = prev && (
      prev.graph_hours === config.graph_hours &&
      JSON.stringify(prev.circuits) === JSON.stringify(config.circuits) &&
      JSON.stringify(prev.hdo) === JSON.stringify(config.hdo) &&
      JSON.stringify(prev.main_meter) === JSON.stringify(config.main_meter)
    );
    if (!appearanceOnly) {
      this._historyCache.clear();
      this._statsCache.clear();
      this._energyStatsCache.clear();
      this._rangeStatsCache.clear();
      this._rangeEnergyStatsCache.clear();
      this._rangeSwitchHistory = undefined;
      this._rangeFetchedThrough = 0;
      this._sparkCache.clear();
      // Debounce — the GUI editor fires config-changed on every keystroke;
      // without this each keystroke would trigger a recorder WS query.
      clearTimeout(this._refetchDebounce);
      this._refetchDebounce = window.setTimeout(() => { void this._fetchHistory(); }, 300);
    }
    // For appearance-only changes requestUpdate is triggered automatically
    // because _config is @state().
  }

  private _buildTrackedIds(): string[] {
    if (!this._config) return [];
    const ids: (string | undefined)[] = [];
    const hdo = this._config.hdo;
    if (hdo) ids.push(hdo.switch, hdo.next_high, hdo.next_low, hdo.workday_sensor, hdo.holiday_sensor);
    const mm = this._config.main_meter;
    if (mm) ids.push(mm.power_l1, mm.power_l2, mm.power_l3,
                     mm.current_l1, mm.current_l2, mm.current_l3, mm.energy_today,
                     mm.voltage, mm.voltage_l1, mm.voltage_l2, mm.voltage_l3);
    for (const c of this._config.circuits ?? []) {
      ids.push(c.switch, c.power, c.current, c.energy, c.voltage,
               c.power_l1, c.power_l2, c.power_l3, c.current_l1, c.current_l2, c.current_l3,
               c.voltage_l1, c.voltage_l2, c.voltage_l3);
      for (const d of c.devices ?? []) {
        ids.push(d.switch, d.power, d.current);
        for (const ch of d.channels ?? []) ids.push(ch.switch, ch.power, ch.current);
      }
    }
    return ids.filter(Boolean) as string[];
  }

  static getConfigElement(): HTMLElement {
    return document.createElement('electricity-panel-editor');
  }

  static getStubConfig(): ElectricityPanelConfig {
    return { type: 'custom:electricity-panel-card', circuits: [] };
  }

  getCardSize(): number {
    return 4 + Math.ceil((this._config?.circuits?.length ?? 0) / 2);
  }

  /** Sizing hint for HA sections (grid) layout */
  getGridOptions(): Record<string, unknown> {
    return { columns: 'full' };
  }

  // ── Entity helpers ─────────────────────────────────────────────────────────

  private _state(id?: string): string {
    if (!id) return 'unavailable';
    return this.hass?.states[id]?.state ?? 'unavailable';
  }

  private _num(id?: string): number {
    const n = parseFloat(this._state(id));
    return isNaN(n) ? 0 : n;
  }

  private _isOn(id?: string): boolean {
    return this._state(id) === 'on';
  }

  /** Entity exists and is not unavailable/unknown */
  private _isAvail(id?: string): boolean {
    if (!id) return false;
    const st = this.hass?.states[id]?.state;
    return st !== undefined && st !== 'unavailable' && st !== 'unknown';
  }

  private _t(key: string, vars?: Record<string, string>): string {
    return localize(key, vars);
  }

  private _log(...args: unknown[]): void {
    if (this._config?.debug) console.info('[ep-card]', ...args);
  }

  private _toggle(entityId: string, name = '', confirm = false): void {
    const isOn = this._isOn(entityId);
    if (confirm) {
      const msg = this._t(isOn ? 'confirm_turn_off' : 'confirm_turn_on', { name });
      if (!window.confirm(msg)) return;
    }
    // homeassistant domain works for switch, light, input_boolean, fan, …
    this.hass.callService('homeassistant', isOn ? 'turn_off' : 'turn_on', { entity_id: entityId });
  }

  private _moreInfo(entityId?: string): void {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent('hass-more-info', {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }));
  }

  private _toggleExpanded(id: string): void {
    const s = new Set(this._expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    this._expanded = s;
  }

  private _loadColor(pct: number): string {
    // Balíček A: zelená pod 55 % dělala z každého klidného okruhu stejný
    // signál jako "nízký tarif". Zátěž pod polovinou jističe není dobrá
    // zpráva, je to nulová informace — patří jí neutrál.
    if (pct > 80) return 'var(--error-color, #ef4444)';
    if (pct > 55) return 'var(--warning-color, #f59e0b)';
    if (pct > 15) return 'var(--ep-accent)';
    return 'var(--ep-neutral)';
  }

  private _watts(entityId?: string): number {
    if (!entityId) return 0;
    const entity = this.hass?.states[entityId];
    if (!entity) return 0;
    const val = parseFloat(entity.state);
    if (isNaN(val)) return 0;
    const unit = (entity.attributes['unit_of_measurement'] as string | undefined) ?? '';
    if (unit === 'kW') return val * 1000;
    if (unit === 'MW') return val * 1_000_000;
    return val;
  }

  private _fmtW(w: number): string {
    if (w >= 1000) return `${(w / 1000).toFixed(2)} kW`;
    return `${w.toFixed(0)} W`;
  }

  /** Design pass (2026-08-12, live-dashboard review): nt_price/vt_price are
   *  entered as free-text config values, so the HDO bar previously rendered
   *  whatever precision the user's source sensor happened to have — real
   *  spot-tariff sensors round-trip through the HA UI at full float
   *  precision (e.g. 4.61453), which reads as noise next to a 2-decimal
   *  currency. Rounded for display only; the raw value is still what
   *  feeds the actual cost math elsewhere. */
  private _fmtPrice(price: string | number | undefined): string {
    const n = parseFloat(price as unknown as string);
    return isNaN(n) ? '' : n.toFixed(2);
  }

  private _kwh(entityId?: string): number {
    if (!entityId) return 0;
    const entity = this.hass?.states[entityId];
    if (!entity) return 0;
    const val = parseFloat(entity.state);
    if (isNaN(val)) return 0;
    const unit = (entity.attributes['unit_of_measurement'] as string | undefined) ?? '';
    if (unit === 'Wh') return val / 1000;
    if (unit === 'MWh') return val * 1000;
    return val;
  }

  // ── HDO helpers ────────────────────────────────────────────────────────────

  private _hdoCountdown(): string {
    const hdo = this._config.hdo;
    if (!hdo) return '';
    const isNT = this._isOn(hdo.switch);
    const sensor = isNT ? hdo.next_high : hdo.next_low;
    const raw = this._state(sensor);
    if (!raw || ['unavailable', 'unknown', ''].includes(raw)) return '';
    const diff = Math.floor((new Date(raw).getTime() - Date.now()) / 1000);
    if (diff <= 0) return this._t('switching');
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
  }

  private _isHolidayToday(): boolean {
    const hs = this._config.hdo?.holiday_sensor;
    return !!hs && this._state(hs) === 'on';
  }

  /** For calendar.* holiday sensors: detect whether tomorrow is a public holiday
   *  from the calendar's next-event attributes (start_time / end_time). */
  private _isHolidayTomorrow(): boolean {
    const hs = this._config.hdo?.holiday_sensor;
    if (!hs || !hs.startsWith('calendar.')) return false;
    const ent = this.hass?.states[hs];
    const start = ent?.attributes['start_time'] as string | undefined;
    if (!start) return false;
    const end = ent?.attributes['end_time'] as string | undefined;
    const probe = new Date();
    probe.setDate(probe.getDate() + 1);
    probe.setHours(12, 0, 0, 0); // noon tomorrow
    return isWithinHolidayEvent(start, end, probe.getTime());
  }

  private _dayType(): 'weekday' | 'weekend' | 'holiday' {
    const ws = this._config.hdo?.workday_sensor;
    return computeDayType(new Date().getDay(), this._isHolidayToday(), ws ? this._state(ws) : undefined);
  }

  private _tomorrowDayType(): 'weekday' | 'weekend' | 'holiday' {
    const d = (new Date().getDay() + 1) % 7;
    return computeTomorrowDayType(d, this._isHolidayTomorrow());
  }

  /** Midnight of the following day — DST-safe day end. */
  private _dayEndMs(base: number): number {
    return dayEndMs(base);
  }

  private _fmtMins(mins: number): string {
    return fmtMins(mins);
  }

  /** During VT: "NT in 1h 23m · save 58 %" — per-circuit hint that deferring the
   *  load to the next NT window saves money. Opt-in via show_nt_hint. */
  private _ntHint(powerW: number): string {
    const cfg = this._config;
    const hdo = cfg.hdo;
    if (!cfg.show_nt_hint || !hdo?.switch) return '';
    if (!this._isAvail(hdo.switch) || this._isOn(hdo.switch)) return ''; // only during VT
    if (powerW < (cfg.nt_hint_min_watts ?? 100)) return '';
    const ntP = parseFloat(hdo.nt_price as unknown as string) || 0;
    const vtP = parseFloat(hdo.vt_price as unknown as string) || 0;
    if (!(vtP > 0) || ntP >= vtP) return '';
    const cd = this._hdoCountdown(); // during VT counts down to next NT start
    if (!cd) return '';
    const pct = Math.round(((vtP - ntP) / vtP) * 100);
    return `${this._t('nt_in')} ${cd} · ${this._t('save_pct')} ${pct} %`;
  }

  // ── Age badge ─────────────────────────────────────────────────────────────

  /** Returns "↻ Xs / Xm / Xh" badge showing time since entity was last updated.
   *  Hidden when show_age_badge is false/unset. Thresholds and colours configurable. */
  private _ageBadge(entityId?: string): TemplateResult | typeof nothing {
    if (!this._config.show_age_badge) return nothing;
    if (!entityId) return nothing;
    const entity = this.hass?.states[entityId];
    if (!entity?.last_updated) return nothing;
    const diffMs = Date.now() - new Date(entity.last_updated).getTime();
    const diffS = Math.floor(diffMs / 1000);
    let label: string;
    if (diffS < 60) label = `${diffS}s`;
    else if (diffS < 3600) label = `${Math.floor(diffS / 60)}m`;
    else label = `${Math.floor(diffS / 3600)}h`;
    const warnMs  = (this._config.age_warn_minutes  ?? 5)  * 60_000;
    const staleMs = (this._config.age_stale_minutes ?? 15) * 60_000;
    const color = diffMs >= staleMs
      ? (this._config.age_stale_color ?? '#ef4444')
      : diffMs >= warnMs
        ? (this._config.age_warn_color ?? '#f59e0b')
        // follow_theme fix: #374151 is near-invisible in the dark palette (by
        // design) but turns into a dark, prominent grey on a light theme —
        // exactly backwards. --ep-text-faint keeps "quiet" quiet in both.
        : (this._config.age_ok_color ?? 'var(--ep-text-faint)');
    // No leading separator here: the badge is one part of the metric row and
    // the row decides the separators, otherwise a circuit with nothing but a
    // switch renders a row that opens with a stray dot.
    return html`<span class="age-badge" style="color:${color}">↻ ${label}</span>`;
  }

  // ── Full-day schedule builder ──────────────────────────────────────────────

  private _fmtTime(ms: number): string {
    return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  /** [dayStart, dayEnd) for today (offset 0) or tomorrow (offset 1), DST-safe. */
  private _dayBounds(dayOffset: 0 | 1): { start: number; end: number } {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const start = dayOffset === 0 ? midnight.getTime() : this._dayEndMs(midnight.getTime());
    return { start, end: this._dayEndMs(start) };
  }

  /** Fáze 2: today's (dayOffset 0) or tomorrow's (dayOffset 1) NT windows
   *  from whichever schedule source is active, in priority order:
   *  `schedule_entity` → `tariff_preset` → manual `schedule`. An entity is
   *  used once it resolves a `schedule` attribute at all — even an empty
   *  window list counts as "this source answered" (a real "no NT that day"),
   *  so a misconfigured/empty preset never gets silently substituted in.
   *  Undefined only when nothing configured yields anything for that day. */
  private _scheduleWindows(dayOffset: 0 | 1): { windows: Window[]; start: number; end: number; source: 'entity' | 'preset' | 'manual' } | undefined {
    const hdo = this._config.hdo;
    if (!hdo) return undefined;
    const { start, end } = this._dayBounds(dayOffset);

    if (hdo.schedule_entity) {
      const entity = this.hass?.states[hdo.schedule_entity];
      const windows = entity ? parseScheduleEntity(entity.attributes, start, end) : undefined;
      if (windows) {
        this._log('schedule_entity', hdo.schedule_entity, 'parsed windows for day offset', dayOffset, windows);
        return { windows, start, end, source: 'entity' };
      }
      if (hdo.schedule_entity) this._log('schedule_entity', hdo.schedule_entity, 'unavailable or no schedule attribute — falling back');
    }

    const preset = hdo.tariff_preset ? PRE_TARIFFS[hdo.tariff_preset] : undefined;
    const src = preset ?? hdo.schedule;
    if (!src) return undefined;
    const dt = dayOffset === 0 ? this._dayType() : this._tomorrowDayType();
    const day = (dt === 'holiday' && src.holiday) ? src.holiday
      : dt === 'weekend' ? src.weekend : src.weekday;
    return { windows: ntWindowsForDay(day, start, end), start, end, source: preset ? 'preset' : 'manual' };
  }

  /** Fáze 1.3: today's NT windows, with the Fáze 1.2 midnight merge already
   *  folded in when enabled. Undefined when no schedule source resolves
   *  anything for today — callers fall back to switch-only behaviour. */
  private _hdoWindowsToday(): { windows: Window[]; dayEnd: number } | undefined {
    const hdo = this._config.hdo;
    const today = this._scheduleWindows(0);
    if (!hdo || !today) return undefined;
    let windows = today.windows;
    if (hdo.merge_midnight && windows.length) {
      const last = windows[windows.length - 1];
      if (last.end === today.end) {
        const firstTomorrow = this._scheduleWindows(1)?.windows[0];
        if (firstTomorrow && firstTomorrow.start === today.end) {
          windows = [...windows.slice(0, -1), { start: last.start, end: firstTomorrow.end }];
        }
      }
    }
    return { windows, dayEnd: today.end };
  }

  /** Fáze 1.3: compare the real HDO switch against the schedule. Undefined
   *  when there's no switch, it's unavailable, or no schedule is configured
   *  — callers fall back to switch-only behaviour. */
  private _hdoStatus(): HdoStatus | undefined {
    const hdo = this._config.hdo;
    if (!hdo?.switch || !this._isAvail(hdo.switch)) return undefined;
    const wd = this._hdoWindowsToday();
    if (!wd) return undefined;
    const entity = this.hass?.states[hdo.switch];
    const switchSince = entity?.last_changed ? new Date(entity.last_changed).getTime() : Date.now();
    return resolveHdoStatus(Date.now(), this._isOn(hdo.switch), switchSince, wd.windows, wd.dayEnd);
  }

  private _hdoMismatchNote(status: HdoStatus): string {
    if (status.kind === 'mismatch') return this._t('hdo_mismatch');
    const time = status.boundaryMs !== undefined ? this._fmtTime(status.boundaryMs) : '';
    const mins = status.deltaMins !== undefined ? String(status.deltaMins) : '';
    switch (status.kind) {
      case 'late_start': return this._t('nt_should_start', { time, mins });
      case 'early_start': return this._t('nt_started_early', { time });
      case 'late_end': return this._t('nt_should_end', { time, mins });
      case 'early_end': return this._t('nt_ended_early', { time });
      default: return '';
    }
  }

  // ── Render: 24h timeline bar ───────────────────────────────────────────────

  private _renderTimeline(slots: DaySlot[], showMarker = false): TemplateResult {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const nowPct = showMarker
      ? Math.min(100, ((Date.now() - midnight.getTime()) / 86400000) * 100)
      : -1;
    return html`
      <div class="timeline-bar" style="position:relative">
        ${slots.map(sl => html`
          <div class="tl-seg ${sl.type} ${sl.isPast ? 'past' : sl.isCurrent ? 'active' : ''}"
               style="flex:${sl.durMins}"></div>
        `)}
        ${nowPct >= 0 ? html`
          <div class="timeline-now" style="left:${nowPct.toFixed(2)}%"></div>
        ` : nothing}
      </div>
    `;
  }

  // ── History & sparklines ──────────────────────────────────────────────────

  private _hasPrices(): boolean {
    const hdo = this._config?.hdo;
    return !!(hdo && (hdo.nt_price || hdo.vt_price));
  }

  /** Entity IDs whose history is actually needed — driven by sparkline
   *  visibility and by cost tracking (prices configured). */
  private _graphEntityIds(): string[] {
    if (!this._config) return [];
    const cfg = this._config;
    const hasPrices = this._hasPrices();
    const spark3 = cfg.sparkline_3phase !== false;
    const sparkMm = cfg.sparkline_main_meter !== false;
    const spark1 = cfg.sparkline_1phase ?? false;
    // view: panel draws a micro graph inside every module and a full graph in
    // the detail, so it needs history for every circuit — not just the ones
    // whose sparkline is switched on in classic view.
    const panelView = cfg.view === 'panel';
    const ids: string[] = [];
    for (const circ of cfg.circuits ?? []) {
      if (circ.phases === 3) {
        // Per-phase: sparklines always; cost only when no total entity exists
        if (spark3 || panelView || (hasPrices && !circ.power)) {
          [circ.power_l1, circ.power_l2, circ.power_l3].forEach(id => { if (id) ids.push(id); });
        }
        if (hasPrices && circ.power) ids.push(circ.power);
      } else if (circ.power && (spark1 || hasPrices || panelView)) {
        ids.push(circ.power);
      }
    }
    const mm = cfg.main_meter;
    if (mm && (sparkMm || hasPrices || panelView)) {
      [mm.power_l1, mm.power_l2, mm.power_l3].forEach(id => { if (id) ids.push(id); });
    }
    return [...new Set(ids)];
  }

  /** Post-3.3 (ROADMAP.md): every configured true energy (kWh) sensor —
   *  `main_meter.energy_today` plus each circuit's `energy` — that cost calc
   *  should prefer over its power-sensor(s) mean-based approximation. Only
   *  meaningful when prices are configured; callers already gate on
   *  `_hasPrices()` same as `_graphEntityIds`. */
  private _energyEntityIds(): string[] {
    if (!this._config) return [];
    const ids: string[] = [];
    if (this._config.main_meter?.energy_today) ids.push(this._config.main_meter.energy_today);
    for (const c of this._config.circuits ?? []) { if (c.energy) ids.push(c.energy); }
    return [...new Set(ids)];
  }

  /** ROADMAP.md "Interaktivní sparkliny" (un-deferred 2026-08-12): the runtime
   *  window override wins over config so the 1h/3h/6h/24h buttons can change
   *  what's plotted without touching `graph_hours` in the saved config. */
  private _effectiveGraphHours(): number {
    return this._sparkWindowHours ?? this._config?.graph_hours ?? 3;
  }

  private static readonly SPARK_WINDOWS = [1, 3, 6, 24];

  /** One control for the whole card, not per-sparkline — all sparklines
   *  already share one x-axis (`_renderSparkline`'s comment above), so one
   *  switch is enough and keeps the extra UI to a single row instead of one
   *  per circuit. Rendered once from `_renderMainMeter`. */
  private _renderSparkWindowSwitch(inline = false): TemplateResult {
    const active = this._effectiveGraphHours();
    const color = this._config.sparkline_color ?? EP_SPARK_DEFAULT;
    return html`
      <div class="spark-win-switch ${inline ? 'inline' : ''}">
        ${ElectricityPanelCard.SPARK_WINDOWS.map(h => html`
          <button type="button" class="spark-win-btn ${active === h ? 'active' : ''}"
            style=${active === h ? `border-color:${color};color:${color}` : ''}
            @click=${() => this._setSparkWindow(h)}>${h}h</button>
        `)}
      </div>`;
  }

  private _setSparkWindow(hours: number): void {
    if (this._sparkWindowHours === hours) return;
    this._sparkWindowHours = hours;
    void this._fetchHistory();
  }

  /** Direct DOM writes, not `requestUpdate()` — a card with several sparklines
   *  (main meter × 3 phases + per-circuit) would otherwise re-run the whole
   *  render() on every pointermove. This is exactly the "listeners and
   *  re-renders" cost the ROADMAP flagged when this was deferred; writing
   *  straight to the hover line/dot/tooltip nodes sidesteps it entirely. The
   *  30 s countdown timer's requestUpdate() reuses the same DOM nodes (lit
   *  only replaces what its own bindings touch), so this state survives it. */
  private _onSparkMove(e: PointerEvent, entityId: string): void {
    const cached = this._sparkCache.get(entityId);
    const pts = cached?.hoverPts;
    if (!pts || pts.length === 0) return;
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * 100; // svg viewBox is 0..100 wide
    let nearest = pts[0], bestDist = Infinity;
    for (const p of pts) {
      const d = Math.abs(p.x - relX);
      if (d < bestDist) { bestDist = d; nearest = p; }
    }
    const wrap = svg.parentElement;
    if (!wrap) return;
    const line = wrap.querySelector<SVGLineElement>('.spark-hover-line');
    const dot = wrap.querySelector<SVGCircleElement>('.spark-hover-dot');
    const tooltip = wrap.querySelector<HTMLDivElement>('.spark-tooltip');
    if (line) { line.setAttribute('x1', `${nearest.x}`); line.setAttribute('x2', `${nearest.x}`); line.setAttribute('visibility', 'visible'); }
    if (dot) { dot.setAttribute('cx', `${nearest.x}`); dot.setAttribute('cy', `${nearest.y}`); dot.setAttribute('visibility', 'visible'); }
    if (tooltip) {
      tooltip.textContent = `${this._fmtW(nearest.v)} · ${this._fmtTime(nearest.t)}`;
      tooltip.style.left = `${nearest.x}%`;
      tooltip.style.visibility = 'visible';
    }
  }

  private _onSparkLeave(e: PointerEvent): void {
    const wrap = (e.currentTarget as SVGSVGElement).parentElement;
    if (!wrap) return;
    wrap.querySelector('.spark-hover-line')?.setAttribute('visibility', 'hidden');
    wrap.querySelector('.spark-hover-dot')?.setAttribute('visibility', 'hidden');
    const tooltip = wrap.querySelector<HTMLDivElement>('.spark-tooltip');
    if (tooltip) tooltip.style.visibility = 'hidden';
  }

  private async _fetchHistory(): Promise<void> {
    if (!this._hass || !this._config) return;
    if (this._historyFetching) {
      // A config change arrived mid-fetch — queue one refetch instead of dropping it
      this._refetchQueued = true;
      return;
    }
    const graphIds = this._graphEntityIds();
    const hdoSwitch = this._config.hdo?.switch;
    if (graphIds.length === 0 && !hdoSwitch) return;
    this._historyFetching = true;
    const hours = this._effectiveGraphHours();
    const nowMs = Date.now();
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    // Post-3.2 (ROADMAP.md, verified 2026-08-12): daily cost used to force this
    // window back to midnight so the raw-history trapezoidal fallback had the
    // whole day to integrate. Now that long-term statistics (_fetchStatistics/
    // _fetchEnergyStatistics below, each with their own midnight-anchored WS
    // call) are confirmed working, raw history is back to being purely the
    // graph/sparkline window — the per-entity cost fallback in _calcDailyCost
    // only loses "since midnight" coverage for entities that have *neither*
    // energy nor power statistics, which is now the rare case, not the norm.
    const startMs = nowMs - hours * 3_600_000;
    const graphStart = new Date(startMs).toISOString();
    const midnightStr = midnight.toISOString();
    // HA 2023.3+ compressed format: s=state, lu=last_updated, lc=last_changed (unix float seconds)
    // Older HA: state (string), last_changed (ISO string)
    type HistEntry = { s?: string; state?: string; lu?: number; lc?: number; last_changed?: string };
    // Build watts multiplier from current entity state so cached values are always in W,
    // regardless of whether the sensor reports in W, kW, or MW.
    const wattsMul = new Map<string, number>();
    for (const id of graphIds) {
      const unit = (this._hass.states[id]?.attributes?.['unit_of_measurement'] as string) ?? '';
      wattsMul.set(id, unit === 'kW' ? 1000 : unit === 'MW' ? 1_000_000 : 1);
    }
    const processEntries = (raw: Record<string, Array<HistEntry>>, switchIds: string[]) => {
      const cacheRef = this._historyCache;
      let written = 0;
      for (const [id, entries] of Object.entries(raw)) {
        if (!Array.isArray(entries)) {
          this._log(`${id}: entries not Array (${typeof entries})`);
          continue;
        }
        const isSwitch = switchIds.includes(id);
        const mul = isSwitch ? 1 : (wattsMul.get(id) ?? 1);
        const pts = entries.map(e => {
          const stateStr = e.s ?? e.state ?? '';
          const tSec = e.lc ?? e.lu;
          const t = tSec !== undefined
            ? tSec * 1000
            : e.last_changed ? new Date(e.last_changed).getTime() : NaN;
          const v = isSwitch ? (stateStr === 'on' ? 1 : 0) : parseFloat(stateStr) * mul;
          return { t, v };
        }).filter(p => !isNaN(p.v) && !isNaN(p.t) && p.t > 0);
        if (pts.length > 0) {
          cacheRef.set(id, pts);
          written++;
        } else {
          const s = JSON.stringify(entries.slice(0, 2).map(e => ({ s: e.s, state: e.state, lu: e.lu, lc: e.lc })));
          this._log(`${id}: 0 pts from ${entries.length} entries, sample: ${s}`);
        }
      }
      this._log(`processEntries: ${written}/${Object.keys(raw).length} written, cache=${cacheRef.size}`);
    };
    // Verify callWS is available
    if (typeof (this._hass as unknown as Record<string, unknown>).callWS !== 'function') {
      console.error('[ep-card] hass.callWS is not available on this HA version');
      this._historyFetching = false;
      return;
    }
    try {
      if (graphIds.length > 0) {
        this._log(`fetching history: ${graphIds.length} entities, start=${graphStart}`);
        const raw = await this._hass.callWS<Record<string, Array<{state: string; last_changed: string}>>>({
          type: 'history/history_during_period',
          start_time: graphStart,
          entity_ids: graphIds,
          minimal_response: true,
          no_attributes: true,
          significant_changes_only: false,
        });
        processEntries(raw, []);
      }
      if (hdoSwitch) {
        const hdoRaw = await this._hass.callWS<Record<string, Array<{state: string; last_changed: string}>>>({
          type: 'history/history_during_period',
          start_time: midnightStr,
          entity_ids: [hdoSwitch],
          minimal_response: true,
          no_attributes: true,
          significant_changes_only: false,
        });
        this._log(`HDO switch history: ${hdoRaw?.[hdoSwitch]?.length ?? 0} entries`);
        processEntries(hdoRaw, [hdoSwitch]);
      }
      this._log(`cache now has ${this._historyCache.size} entities`);
      this._historyWindowEnd = nowMs;
      this._sparkCache.clear();
      // Fáze 3.2: statistics are strictly an optimization for cost calc — never
      // block or fail the render on them. Raw history above is already the
      // safety net (`_calcDailyCost` falls back to it per-entity), so this
      // fetch happens after and independently.
      if (this._hasPrices() && graphIds.length > 0) {
        await this._fetchStatistics(graphIds, wattsMul, midnight.getTime(), nowMs);
      }
      // Post-3.3: exact energy-sensor statistics, preferred over the above
      // wherever a true kWh sensor is configured — always-on (not lazy like
      // the 7d/month range fetch) because per-circuit cost badges on the
      // main card face need 'today' regardless of whether the Náklady tab
      // is even open.
      const energyIds = this._hasPrices() ? this._energyEntityIds() : [];
      if (energyIds.length > 0) {
        await this._fetchEnergyStatistics(energyIds, midnight.getTime(), nowMs);
      }
      this.requestUpdate();
    } catch (err) {
      console.warn('[ep-card] history fetch failed:', err);
    } finally {
      this._historyFetching = false;
      if (this._refetchQueued) {
        this._refetchQueued = false;
        void this._fetchHistory();
      }
    }
  }

  /** Fáze 3.2 (ROADMAP.md): prefer `recorder/statistics_during_period` over
   *  raw history for the daily cost integration — pre-aggregated 5-minute
   *  buckets are far lighter on the recorder than pulling every raw state
   *  change for the whole day, and (unlike raw history) survive the
   *  recorder's purge schedule. Not every power entity has long-term
   *  statistics though — it requires `state_class` to be set on the sensor —
   *  so entities missing from the response are simply left out of
   *  `_statsCache`; `_calcDailyCost` falls back to `_historyCache` for those,
   *  entity by entity, so a partial result here never breaks cost display,
   *  only makes it marginally less light on the recorder. `wattsMul` is the
   *  same per-entity W-normalization map `_fetchHistory` already built from
   *  the entities' current `unit_of_measurement` — statistics report in the
   *  same unit as the entity's state, so it applies identically here. */
  private async _fetchStatistics(
    ids: string[],
    wattsMul: Map<string, number>,
    dayStartMs: number,
    nowMs: number
  ): Promise<void> {
    if (!this._hass) return;
    const PERIOD_MS = 300_000; // '5minute' — matches today's resolution near tariff switchover
    type StatEntry = { start: number | string; mean?: number | null };
    try {
      const raw = await this._hass.callWS<Record<string, Array<StatEntry>>>({
        type: 'recorder/statistics_during_period',
        start_time: new Date(dayStartMs).toISOString(),
        end_time: new Date(nowMs).toISOString(),
        statistic_ids: ids,
        period: '5minute',
        types: ['mean'],
      });
      let withStats = 0;
      for (const id of ids) {
        const entries = raw?.[id];
        if (!Array.isArray(entries) || entries.length === 0) {
          this._statsCache.delete(id);
          this._log(`stats: ${id} has no 5minute statistics (state_class missing, or too new) — falling back to raw history for it`);
          continue;
        }
        const mul = wattsMul.get(id) ?? 1;
        const buckets: StatBucket[] = entries
          .map((e): StatBucket => {
            // HA has shipped both epoch-seconds numbers and ISO strings for
            // statistics `start` across versions — same defensive parsing
            // style as the compressed-history handling above.
            const s = typeof e.start === 'number'
              ? (e.start < 1e12 ? e.start * 1000 : e.start)
              : new Date(e.start).getTime();
            const mean = typeof e.mean === 'number' ? e.mean * mul : NaN;
            return { start: s, end: s + PERIOD_MS, mean };
          })
          .filter(b => !isNaN(b.start) && !isNaN(b.mean));
        if (buckets.length > 0) {
          this._statsCache.set(id, buckets);
          withStats++;
        } else {
          this._statsCache.delete(id);
        }
      }
      this._log(`stats: ${withStats}/${ids.length} entities have usable 5minute statistics`);
    } catch (err) {
      this._log('stats fetch failed — cost calc falls back to raw history for all entities:', err);
    }
  }

  /** Post-3.3 (ROADMAP.md): exact 'change' statistics for real energy (kWh)
   *  sensors — a direct measurement (HA computes it from the sensor's own
   *  cumulative counter, resets included), not the mean-W-times-duration
   *  approximation `_fetchStatistics` above produces for power sensors.
   *  Preferred wherever available; `_calcDailyCost`/`_calcCostBreakdown` fall
   *  back to the power-sensor path per entity when it isn't. Requesting
   *  `types: ['change']` for these ids in the *same* call as `_fetchStatistics`'s
   *  `types: ['mean']` isn't possible — the WS command's `types` applies to
   *  the whole request — hence a separate call here. */
  private async _fetchEnergyStatistics(ids: string[], dayStartMs: number, nowMs: number): Promise<void> {
    if (!this._hass) return;
    const PERIOD_MS = 300_000; // '5minute' — same resolution as _fetchStatistics
    type StatEntry = { start: number | string; change?: number | null };
    try {
      const raw = await this._hass.callWS<Record<string, Array<StatEntry>>>({
        type: 'recorder/statistics_during_period',
        start_time: new Date(dayStartMs).toISOString(),
        end_time: new Date(nowMs).toISOString(),
        statistic_ids: ids,
        period: '5minute',
        types: ['change'],
      });
      let withStats = 0;
      for (const id of ids) {
        const entries = raw?.[id];
        if (!Array.isArray(entries) || entries.length === 0) {
          this._energyStatsCache.delete(id);
          this._log(`energy stats: ${id} has no 5minute 'change' statistics — its cost falls back to the configured power sensor(s), if any`);
          continue;
        }
        // 'change' is reported in the statistic's own unit — energy sensors
        // are virtually always kWh, but handle Wh/MWh defensively too.
        const unit = (this._hass.states[id]?.attributes?.['unit_of_measurement'] as string) ?? 'kWh';
        const whMul = unit === 'Wh' ? 1 : unit === 'MWh' ? 1_000_000 : 1000;
        const buckets: EnergyBucket[] = entries
          .map((e): EnergyBucket => {
            const s = typeof e.start === 'number'
              ? (e.start < 1e12 ? e.start * 1000 : e.start)
              : new Date(e.start).getTime();
            const wh = typeof e.change === 'number' ? e.change * whMul : NaN;
            return { start: s, end: s + PERIOD_MS, wh };
          })
          .filter(b => !isNaN(b.start) && !isNaN(b.wh));
        if (buckets.length > 0) {
          this._energyStatsCache.set(id, buckets);
          withStats++;
        } else {
          this._energyStatsCache.delete(id);
        }
      }
      this._log(`energy stats: ${withStats}/${ids.length} energy entities have usable 5minute 'change' statistics`);
    } catch (err) {
      this._log('energy stats fetch failed — cost calc falls back to configured power sensor(s):', err);
    }
  }

  /** Fáze 3.3 (ROADMAP.md): the Náklady tab's "7 dní"/"Měsíc" periods need a
   *  wider window than the always-on today/5minute fetch — 31 days of hourly
   *  statistics for the whole-installation entities (main_meter phases) plus
   *  the matching hdo.switch history. Lazy: only triggered when the tab is
   *  actually opened, so sessions that never look at costs never pay for it.
   *  A fixed 31-day lookback (not "since the 1st") keeps "7 dní" a full
   *  rolling week even on the 1st/2nd of the month. */
  private async _fetchRangeData(): Promise<void> {
    if (!this._hass || this._rangeFetching) return;
    const hdo = this._config?.hdo;
    const mm = this._config?.main_meter;
    const ids = [mm?.power_l1, mm?.power_l2, mm?.power_l3].filter((id): id is string => !!id);
    const energyId = mm?.energy_today;
    if (ids.length === 0 && !energyId) return;
    this._rangeFetching = true;
    const nowMs = Date.now();
    const startMs = nowMs - 31 * 86_400_000;
    const PERIOD_MS = 3_600_000; // 'hour' — 31 days at 5minute would be a heavy payload for little gain here
    try {
      if (ids.length > 0) {
        const wattsMul = new Map<string, number>();
        for (const id of ids) {
          const unit = (this._hass.states[id]?.attributes?.['unit_of_measurement'] as string) ?? '';
          wattsMul.set(id, unit === 'kW' ? 1000 : unit === 'MW' ? 1_000_000 : 1);
        }
        type StatEntry = { start: number | string; mean?: number | null };
        const raw = await this._hass.callWS<Record<string, Array<StatEntry>>>({
          type: 'recorder/statistics_during_period',
          start_time: new Date(startMs).toISOString(),
          end_time: new Date(nowMs).toISOString(),
          statistic_ids: ids,
          period: 'hour',
          types: ['mean'],
        });
        let withStats = 0;
        for (const id of ids) {
          const entries = raw?.[id];
          if (!Array.isArray(entries) || entries.length === 0) {
            this._rangeStatsCache.delete(id);
            continue;
          }
          const mul = wattsMul.get(id) ?? 1;
          const buckets: StatBucket[] = entries
            .map((e): StatBucket => {
              const s = typeof e.start === 'number'
                ? (e.start < 1e12 ? e.start * 1000 : e.start)
                : new Date(e.start).getTime();
              const mean = typeof e.mean === 'number' ? e.mean * mul : NaN;
              return { start: s, end: s + PERIOD_MS, mean };
            })
            .filter(b => !isNaN(b.start) && !isNaN(b.mean));
          if (buckets.length > 0) {
            this._rangeStatsCache.set(id, buckets);
            withStats++;
          } else {
            this._rangeStatsCache.delete(id);
          }
        }
        this._log(`range stats: ${withStats}/${ids.length} power entities have usable hourly statistics`);
      }
      // Post-3.3: exact hourly 'change' statistics for main_meter.energy_today,
      // preferred over the mean-power path above when available — same
      // reasoning as `_fetchEnergyStatistics` for the today/5minute case.
      if (energyId) {
        type EnergyEntry = { start: number | string; change?: number | null };
        const rawEnergy = await this._hass.callWS<Record<string, Array<EnergyEntry>>>({
          type: 'recorder/statistics_during_period',
          start_time: new Date(startMs).toISOString(),
          end_time: new Date(nowMs).toISOString(),
          statistic_ids: [energyId],
          period: 'hour',
          types: ['change'],
        });
        const entries = rawEnergy?.[energyId];
        if (Array.isArray(entries) && entries.length > 0) {
          const unit = (this._hass.states[energyId]?.attributes?.['unit_of_measurement'] as string) ?? 'kWh';
          const whMul = unit === 'Wh' ? 1 : unit === 'MWh' ? 1_000_000 : 1000;
          const buckets: EnergyBucket[] = entries
            .map((e): EnergyBucket => {
              const s = typeof e.start === 'number'
                ? (e.start < 1e12 ? e.start * 1000 : e.start)
                : new Date(e.start).getTime();
              const wh = typeof e.change === 'number' ? e.change * whMul : NaN;
              return { start: s, end: s + PERIOD_MS, wh };
            })
            .filter(b => !isNaN(b.start) && !isNaN(b.wh));
          if (buckets.length > 0) this._rangeEnergyStatsCache.set(energyId, buckets);
          else this._rangeEnergyStatsCache.delete(energyId);
          this._log(`range energy stats: ${energyId} — ${buckets.length} hourly buckets`);
        } else {
          this._rangeEnergyStatsCache.delete(energyId);
          this._log(`range energy stats: ${energyId} has no hourly 'change' statistics — 7d/month falls back to power sensors, if configured`);
        }
      }
      if (hdo?.switch) {
        type HistEntry = { s?: string; state?: string; lu?: number; lc?: number; last_changed?: string };
        const hdoRaw = await this._hass.callWS<Record<string, Array<HistEntry>>>({
          type: 'history/history_during_period',
          start_time: new Date(startMs).toISOString(),
          entity_ids: [hdo.switch],
          minimal_response: true,
          no_attributes: true,
          significant_changes_only: false,
        });
        const entries = hdoRaw?.[hdo.switch];
        this._rangeSwitchHistory = Array.isArray(entries)
          ? entries.map(e => {
              const stateStr = e.s ?? e.state ?? '';
              const tSec = e.lc ?? e.lu;
              const t = tSec !== undefined ? tSec * 1000 : e.last_changed ? new Date(e.last_changed).getTime() : NaN;
              return { t, v: stateStr === 'on' ? 1 : 0 };
            }).filter(p => !isNaN(p.t))
          : undefined;
      }
      this._rangeFetchedThrough = nowMs;
      this._log(`range fetch done — switch history ${this._rangeSwitchHistory?.length ?? 0} entries`);
      this.requestUpdate();
    } catch (err) {
      this._log('range stats fetch failed — 7d/month costs will show "no data":', err);
    } finally {
      this._rangeFetching = false;
    }
  }

  /** Precedence (Fáze 1.1, zafixováno — see utils.ts isNTAt): real HDO switch
   *  history is authoritative once it covers `t`; the tariff schedule is a
   *  fallback for times before the first history entry and for the future;
   *  the live switch state is the last resort when neither is available. */
  private _isNTAt(t: number): boolean {
    const hdo = this._config.hdo;
    if (!hdo) return false;
    // _calcDailyCost only ever integrates today's history, so `t` is always
    // within today — today's windows (whichever source resolved them) are
    // the only ones that can ever be relevant here.
    const windows = this._scheduleWindows(0)?.windows;
    return isNTAt(
      t,
      hdo.switch ? this._historyCache.get(hdo.switch) : undefined,
      windows,
      this._isOn(hdo.switch)
    );
  }

  /** Accumulate today's energy cost for one circuit/meter. Priority chain
   *  (post-3.3, ROADMAP.md): `energyId` — a configured real kWh sensor's
   *  exact `_energyStatsCache` 'change' buckets — is preferred whenever it
   *  has data; `powerIds` (Fáze 3.2/1.1: mean-stats then raw-history
   *  trapezoidal, per entity) is the fallback, used only when the energy
   *  sensor produced nothing, so a circuit with both configured never double
   *  counts. Both paths produce Wh and sum losslessly. */
  private _calcDailyCost(energyId: string | undefined, ...powerIds: (string | undefined)[]): string {
    const hdo = this._config.hdo;
    if (!hdo || (!hdo.nt_price && !hdo.vt_price)) return '';
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const midnightMs = midnight.getTime();
    const ntP = parseFloat(hdo.nt_price as unknown as string) || 0;
    const vtP = parseFloat(hdo.vt_price as unknown as string) || 0;

    const windows = this._scheduleWindows(0)?.windows;
    const hdoHist = hdo.switch ? this._historyCache.get(hdo.switch) : undefined;
    const switchOn = this._isOn(hdo.switch);
    const ntFractionFn = (s: number, e: number) => ntFractionOfInterval(s, e, hdoHist, windows, switchOn);

    let ntWh = 0, vtWh = 0, hasData = false;

    if (energyId) {
      const buckets = this._energyStatsCache.get(energyId);
      if (buckets && buckets.length > 0) {
        const r = accumulateTariffWhFromEnergyBuckets([buckets], ntFractionFn);
        ntWh += r.ntWh; vtWh += r.vtWh; hasData = hasData || r.hasData;
      }
    }
    if (!hasData) {
      for (const id of powerIds) {
        if (!id) continue;
        const stats = this._statsCache.get(id);
        if (stats && stats.length > 0) {
          const r = accumulateTariffWhFromStats([stats], ntFractionFn);
          ntWh += r.ntWh; vtWh += r.vtWh; hasData = hasData || r.hasData;
        } else {
          const raw = this._historyCache.get(id)?.filter(p => p.t >= midnightMs);
          const r = accumulateTariffWh([raw], (t) => this._isNTAt(t));
          ntWh += r.ntWh; vtWh += r.vtWh; hasData = hasData || r.hasData;
        }
      }
    }
    if (!hasData) return '';
    const cost = calcCost(ntWh, vtWh, ntP, vtP);
    if (cost < 0.005) return '';
    const cur = hdo.currency ?? 'Kč';
    return `${cost.toFixed(2)} ${cur}`;
  }

  /** Fáze 3.3 (ROADMAP.md): whole-installation NT/VT cost breakdown backing
   *  the Náklady tab — main_meter only (the house's real total, same entity
   *  the main-meter cost badge already uses), not a sum of individual
   *  circuits (would double count anything downstream of the meter).
   *  Post-3.3: `energyId` (`main_meter.energy_today`'s exact 'change'
   *  statistics) is preferred over `powerIds` (mean-based, Fáze 3.2) exactly
   *  like `_calcDailyCost`. 'today' reuses `_energyStatsCache`/`_statsCache`/
   *  `_historyCache` (5minute stats → raw history fallback, per entity);
   *  '7d'/'month' read the wider hourly range `_fetchRangeData` lazily
   *  populates (`_rangeEnergyStatsCache`/`_rangeStatsCache`) and have no
   *  further fallback — nothing missing from those just doesn't contribute
   *  (surfaced to the UI as "no data" only if nothing at all comes back).
   *  Past days pass `windows: undefined` to `ntFractionOfInterval`
   *  deliberately: a schedule describes upcoming NT windows, not history, so
   *  historical hours can only be judged from the real switch history (or,
   *  failing that, today's live switch state as the least-bad fallback for
   *  the rare gap history doesn't reach). */
  private _calcCostBreakdown(period: 'today' | '7d' | 'month'):
    { ntWh: number; vtWh: number; ntCost: number; vtCost: number; cost: number; kWh: number } | undefined {
    const hdo = this._config.hdo;
    if (!hdo || (!hdo.nt_price && !hdo.vt_price)) return undefined;
    const ntP = parseFloat(hdo.nt_price as unknown as string) || 0;
    const vtP = parseFloat(hdo.vt_price as unknown as string) || 0;
    const mm = this._config.main_meter;
    const energyId = mm?.energy_today;
    const powerIds = [mm?.power_l1, mm?.power_l2, mm?.power_l3].filter((id): id is string => !!id);
    if (!energyId && powerIds.length === 0) return undefined;

    let ntWh = 0, vtWh = 0, hasData = false;

    if (period === 'today') {
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      const midnightMs = midnight.getTime();
      const windows = this._scheduleWindows(0)?.windows;
      const hdoHist = hdo.switch ? this._historyCache.get(hdo.switch) : undefined;
      const switchOn = this._isOn(hdo.switch);
      const ntFractionFn = (s: number, e: number) => ntFractionOfInterval(s, e, hdoHist, windows, switchOn);

      if (energyId) {
        const buckets = this._energyStatsCache.get(energyId);
        if (buckets && buckets.length > 0) {
          const r = accumulateTariffWhFromEnergyBuckets([buckets], ntFractionFn);
          ntWh += r.ntWh; vtWh += r.vtWh; hasData = hasData || r.hasData;
        }
      }
      if (!hasData) {
        for (const id of powerIds) {
          const stats = this._statsCache.get(id);
          if (stats && stats.length > 0) {
            const r = accumulateTariffWhFromStats([stats], ntFractionFn);
            ntWh += r.ntWh; vtWh += r.vtWh; hasData = hasData || r.hasData;
          } else {
            const raw = this._historyCache.get(id)?.filter(p => p.t >= midnightMs);
            const r = accumulateTariffWh([raw], (t) => this._isNTAt(t));
            ntWh += r.ntWh; vtWh += r.vtWh; hasData = hasData || r.hasData;
          }
        }
      }
    } else {
      const nowMs = Date.now();
      const sinceMs = period === '7d'
        ? nowMs - 7 * 86_400_000
        : (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); })();
      const switchOn = this._isOn(hdo.switch);
      const ntFractionFn = (s: number, e: number) => ntFractionOfInterval(s, e, this._rangeSwitchHistory, undefined, switchOn);

      if (energyId) {
        const buckets = this._rangeEnergyStatsCache.get(energyId)?.filter(b => b.start >= sinceMs && b.start < nowMs);
        if (buckets && buckets.length > 0) {
          const r = accumulateTariffWhFromEnergyBuckets([buckets], ntFractionFn);
          ntWh += r.ntWh; vtWh += r.vtWh; hasData = hasData || r.hasData;
        }
      }
      if (!hasData) {
        for (const id of powerIds) {
          const stats = this._rangeStatsCache.get(id)?.filter(b => b.start >= sinceMs && b.start < nowMs);
          if (stats && stats.length > 0) {
            const r = accumulateTariffWhFromStats([stats], ntFractionFn);
            ntWh += r.ntWh; vtWh += r.vtWh; hasData = hasData || r.hasData;
          }
        }
      }
    }

    if (!hasData) return undefined;
    const ntCost = (ntWh / 1000) * ntP;
    const vtCost = (vtWh / 1000) * vtP;
    return { ntWh, vtWh, ntCost, vtCost, cost: ntCost + vtCost, kWh: (ntWh + vtWh) / 1000 };
  }

  /** Cached SVG paths for one entity's history window, or undefined when there
   *  is nothing to draw. Split out of `_renderSparkline` so `view: panel` can
   *  reuse the very same cached path for the micro graph inside a module —
   *  the paths are in a 100x38 user-space, and `preserveAspectRatio="none"`
   *  rescales them to whatever box the caller has, so no second computation
   *  (or second cache) is needed. */
  private _sparkPaths(entityId: string): SparkCache | undefined {
    const data = this._historyCache.get(entityId);
    if (!data || data.length < 2) return undefined;
    const W = 100, H = 38, pad = 3;

    // Paths are cached per entity and recomputed only after a history fetch —
    // the 30 s countdown re-render no longer recalculates every SVG path.
    // The x-axis is anchored to [windowEnd − graph_hours, windowEnd] so all
    // sparklines share the same time scale and are visually comparable.
    let cached = this._sparkCache.get(entityId);
    if (!cached || cached.data !== data || cached.windowEnd !== this._historyWindowEnd || cached.hours !== this._effectiveGraphHours()) {
      const hours = this._effectiveGraphHours();
      const windowEnd = this._historyWindowEnd || data[data.length - 1].t;
      const windowStart = windowEnd - hours * 3_600_000;
      // Trim to the display window; carry the last value before the window in
      // from the left edge and extend the last value to the right edge.
      const pts: Array<{t: number; v: number}> = [];
      let carry: {t: number; v: number} | undefined;
      for (const p of data) {
        if (p.t < windowStart) carry = p;
        else pts.push(p);
      }
      if (carry) pts.unshift({ t: windowStart, v: carry.v });
      if (pts.length === 0) return undefined;
      pts.push({ t: windowEnd, v: pts[pts.length - 1].v });
      const tRange = windowEnd - windowStart || 1;
      let vMin = Infinity, vMax = -Infinity;
      for (const p of pts) {
        if (p.v < vMin) vMin = p.v;
        if (p.v > vMax) vMax = p.v;
      }
      const vRange = vMax - vMin || 0.01;
      const coords = pts.map(p => ({
        x: ((p.t - windowStart) / tRange) * W,
        y: (H - pad) - ((p.v - vMin) / vRange) * (H - pad * 2),
      }));
      let line = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
      for (let i = 1; i < coords.length; i++) {
        const p0 = coords[i - 1], p1 = coords[i];
        const cx = ((p0.x + p1.x) / 2).toFixed(1);
        line += ` C ${cx},${p0.y.toFixed(1)} ${cx},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
      }
      const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)},${H} L ${coords[0].x.toFixed(1)},${H} Z`;
      const hoverPts = pts.map((p, i) => ({ x: coords[i].x, y: coords[i].y, t: p.t, v: p.v }));
      cached = { data, windowEnd: this._historyWindowEnd, hours, line, area, vMin, vMax, hoverPts };
      this._sparkCache.set(entityId, cached);
    }
    return cached;
  }

  private _renderSparkline(entityId: string | undefined, noLabels = false): TemplateResult | typeof nothing {
    if (!entityId) return nothing;
    const cached = this._sparkPaths(entityId);
    if (!cached) return nothing;
    const W = 100, H = 38, pad = 3;
    const color = this._config.sparkline_color ?? EP_SPARK_DEFAULT;
    const labelPos = this._config.sparkline_labels ?? 'left';
    const showRef = this._config.sparkline_ref_line ?? false;

    const gid = `sg_${entityId.replace(/[^a-z0-9]/gi, '_')}`;
    const yMax = pad.toFixed(1);
    const yMin = (H - pad).toFixed(1);
    const hideLabels = noLabels || labelPos === 'none';
    // follow_theme fix: the old default was rgba(255,255,255,0.35), which is
    // invisible on a light theme. A CSS custom property resolves fine inside an
    // inline style in the shadow root, so the default now follows the palette.
    const refColor = this._config.sparkline_ref_color ?? 'var(--ep-text-faint)';
    // Labels are flex siblings of the SVG — placed before (left) or after (right)
    // in DOM order so the SVG takes flex:1 and labels get exactly 40 px regardless
    // of card width.
    const lblEl = hideLabels ? nothing : html`
      <div class="spark-lbls spark-lbls-${labelPos}">
        <span class="spark-lbl-max">${this._fmtW(cached.vMax)}</span>
        <span class="spark-lbl-min">${this._fmtW(cached.vMin)}</span>
      </div>`;
    return html`
      <div class="sparkline-wrap">
        ${labelPos === 'left' ? lblEl : nothing}
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="sparkline"
          @pointermove=${(e: PointerEvent) => this._onSparkMove(e, entityId)}
          @pointerleave=${(e: PointerEvent) => this._onSparkLeave(e)}>
          <defs>
            <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
              <stop offset="85%" stop-color="${color}" stop-opacity="0.05"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${cached.area}" fill="url(#${gid})"/>
          <path d="${cached.line}" fill="none" stroke="${color}" stroke-width="1.5"
            stroke-linejoin="round" stroke-linecap="round"/>
          <line x1="0" y1="${yMax}" x2="${W}" y2="${yMax}"
            class="spark-ref${showRef ? '' : ' spark-hidden'}" style="stroke:${refColor}"/>
          <line x1="0" y1="${yMin}" x2="${W}" y2="${yMin}"
            class="spark-ref${showRef ? '' : ' spark-hidden'}" style="stroke:${refColor}"/>
          <line class="spark-hover-line" x1="0" y1="0" x2="0" y2="${H}" visibility="hidden"/>
          <circle class="spark-hover-dot" r="2.2" style="fill:${color}" visibility="hidden"/>
        </svg>
        <div class="spark-tooltip"></div>
        ${labelPos === 'right' ? lblEl : nothing}
      </div>`;
  }

  // ── Render: HDO schedule ───────────────────────────────────────────────────

  /** Slots + totals for the day currently being shown, or null when there is
   *  no usable schedule. Extracted from `_renderHdoSchedule` so `view: panel`
   *  can draw the day timeline on its own at the top of the card without
   *  recomputing merge_midnight and the day-type resolution a second time. */
  private _scheduleData(): {
    slots: DaySlot[]; remaining: number | null; totalNT: number;
    dt: DayType; showing: boolean;
  } | null {
    const hdo = this._config.hdo;
    if (!hdo) return null;

    const showing = this._showTomorrow;
    const dayOffset = showing ? 1 : 0;
    const resolved = this._scheduleWindows(dayOffset);
    if (!resolved) return null;
    const { windows, start: base, end: dayEnd } = resolved;
    // Day-type label is purely informational here — it no longer decides
    // which windows to show once a schedule_entity has resolved the day.
    const dt = showing ? this._tomorrowDayType() : this._dayType();

    let slots = buildFullDaySlotsFromWindows(windows, base, dayEnd, showing, Date.now(), (ms) => this._fmtTime(ms));
    let remaining = showing ? null : ntRemainingMinsFromWindows(windows, dayEnd, Date.now());
    let totalNT = windows.reduce((a, w) => a + (w.end - w.start) / 60000, 0);

    // Fáze 1.2: merge today's midnight-ending NT window with tomorrow's if it
    // starts right at day end — presentation only, today's own slots/cost
    // are untouched. Works the same regardless of which source resolved
    // today vs. tomorrow (can even mix, e.g. entity today / preset tomorrow).
    if (!showing && hdo.merge_midnight && windows.length) {
      const last = windows[windows.length - 1];
      if (last.end === dayEnd) {
        const firstTomorrow = this._scheduleWindows(1)?.windows[0];
        if (firstTomorrow && firstTomorrow.start === dayEnd) {
          const extra = (firstTomorrow.end - firstTomorrow.start) / 60000;
          slots = mergeMidnightNt(slots, dayEnd, extra, Date.now(), (ms) => this._fmtTime(ms));
          remaining = (remaining ?? 0) + extra;
          totalNT += extra;
        }
      }
    }
    return { slots, remaining, totalNT, dt, showing };
  }

  /** view: panel — the day's timeline on its own, directly under the tariff
   *  bar. In panel view the schedule block sits at the bottom of the card, but
   *  "when is it cheap again today" is a glance-level question that belongs
   *  next to the tariff; the block below therefore drops its own copy so the
   *  timeline appears exactly once. */
  private _renderDayTimeline(): TemplateResult | typeof nothing {
    const data = this._scheduleData();
    if (!data) return nothing;
    const left = data.remaining !== null
      ? html`<span class="nt-remaining">${this._fmtMins(data.remaining)} ${this._t('nt_left')}</span>`
      : nothing;
    return html`
      <div class="day-timeline">
        ${this._renderTimeline(data.slots, !data.showing)}
        ${left !== nothing ? html`<div class="day-timeline-foot">${left}</div>` : nothing}
      </div>`;
  }

  private _renderHdoSchedule(): TemplateResult | typeof nothing {
    const data = this._scheduleData();
    if (!data) return nothing;
    const { slots, remaining, totalNT, dt, showing } = data;

    const exp = this._scheduleExpanded;
    const currentSlot = slots.find(s => s.isCurrent);
    // Fáze 3.3 (ROADMAP.md): the Náklady tab only makes sense once prices are
    // configured — no tab strip at all otherwise, so cards without cost
    // tracking look exactly as before this feature existed.
    const showCostsTab = this._hasPrices();
    const tab = showCostsTab ? this._scheduleTab : 'schedule';
    return html`
      <div class="schedule-block">
        ${showCostsTab ? html`
          <div class="sblock-tabs">
            <div class="sblock-tab ${tab === 'schedule' ? 'active' : ''}" role="button" tabindex="0"
              @click=${() => { this._scheduleTab = 'schedule'; }}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._scheduleTab = 'schedule'; } }}>
              ${this._t('schedule_tab')}
            </div>
            <div class="sblock-tab ${tab === 'costs' ? 'active' : ''}" role="button" tabindex="0"
              @click=${() => {
                this._scheduleTab = 'costs';
                if (this._costsPeriod !== 'today' && Date.now() - this._rangeFetchedThrough > 300_000) void this._fetchRangeData();
              }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  this._scheduleTab = 'costs';
                  if (this._costsPeriod !== 'today' && Date.now() - this._rangeFetchedThrough > 300_000) void this._fetchRangeData();
                }
              }}>
              ${this._t('costs_tab')}
            </div>
          </div>
        ` : nothing}
        ${tab === 'costs' ? this._renderCostsPanel() : html`
          <div class="schedule-title" role="button" tabindex="0"
            aria-expanded=${exp ? 'true' : 'false'}
            @click=${() => { this._scheduleExpanded = !exp; }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._scheduleExpanded = !exp; }
            }}>
            <span class="schedule-when">${showing ? this._t('tomorrow') : this._t('today')}</span>
            <span class="schedule-day">${this._t(dt)}</span>
            ${!exp && currentSlot ? html`
              <span class="stariff ${currentSlot.type}" style="margin-left:4px">${currentSlot.type.toUpperCase()}</span>
              <span class="nt-remaining-inline">${currentSlot.label}</span>
            ` : nothing}
            <div class="schedule-nav">
              ${exp && remaining !== null
                ? html`<span class="nt-remaining">${this._fmtMins(remaining)} ${this._t('nt_left')} · ${this._fmtMins(totalNT)} ${this._t('total')}</span>`
                : nothing}
              ${exp ? html`
                <button class="sday-btn" @click=${(e: Event) => { e.stopPropagation(); this._showTomorrow = !this._showTomorrow; }}>
                  ${showing ? this._t('today') : this._t('tomorrow')}
                </button>` : nothing}
              <ha-icon icon="${exp ? 'mdi:chevron-up' : 'mdi:chevron-down'}" class="schedule-chevron"></ha-icon>
            </div>
          </div>
          ${this._isPanelView()
            ? nothing
            : this._renderTimeline(slots, !showing)}
          ${exp ? html`
            <div class="schedule-rows">
              ${slots.map(sl => html`
                <div class="srow ${sl.isPast ? 'past' : sl.isCurrent ? 'active' : 'future'} ${sl.type}">
                  <span class="stariff ${sl.type}">${sl.type.toUpperCase()}</span>
                  <span class="srow-time">${sl.label}</span>
                  <div class="srow-track">
                    <div class="srow-fill ${sl.type}" style="width:${sl.pct.toFixed(1)}%"></div>
                  </div>
                  ${sl.isCurrent
                    ? html`<span class="snow ${sl.type}">${this._t('now')}</span>`
                    : html`<span class="sdur">${sl.durStr}</span>`}
                </div>
              `)}
            </div>
          ` : nothing}
        `}
      </div>
    `;
  }

  /** Fáze 3.3 (ROADMAP.md): the Náklady tab body — period pills, NT/VT
   *  stacked bar + legend, total, and (7 dní/Měsíc only) a secondary line
   *  (average per day / estimated month total). Mirrors the 3.1 mockup's
   *  variant C layout, restyled with the card's actual `--ep-*` tokens and
   *  existing `.nt`/`.vt` color classes instead of the mockup's hardcoded hex. */
  private _renderCostsPanel(): TemplateResult {
    const hdo = this._config.hdo!;
    const cur = hdo.currency ?? 'Kč';
    const period = this._costsPeriod;
    const breakdown = this._calcCostBreakdown(period);

    let secondary: TemplateResult | typeof nothing = nothing;
    if (breakdown && period === 'month') {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const mtdDays = (now.getTime() - monthStart.getTime()) / 86_400_000;
      const est = estimateMonthCost(breakdown.cost, mtdDays, daysInMonth);
      secondary = html`<div class="cost-est">${this._t('cost_estimate_month')}: ~${est.toFixed(0)} ${cur}</div>`;
    } else if (breakdown && period === '7d') {
      const avgDay = breakdown.cost / 7;
      secondary = html`<div class="cost-est">${this._t('cost_avg_day', { price: `${avgDay.toFixed(2)} ${cur}` })}</div>`;
    }

    const totalWh = breakdown ? breakdown.ntWh + breakdown.vtWh : 0;
    const ntPct = totalWh > 0 ? (breakdown!.ntWh / totalWh) * 100 : 0;
    const vtPct = 100 - ntPct;

    return html`
      <div class="cost-panel">
        <div class="cost-pills">
          <span class="cost-pill ${period === 'today' ? 'active' : ''}"
            @click=${() => { this._costsPeriod = 'today'; }}>${this._t('today')}</span>
          <span class="cost-pill ${period === '7d' ? 'active' : ''}"
            @click=${() => { this._costsPeriod = '7d'; if (Date.now() - this._rangeFetchedThrough > 300_000) void this._fetchRangeData(); }}>${this._t('period_7d')}</span>
          <span class="cost-pill ${period === 'month' ? 'active' : ''}"
            @click=${() => { this._costsPeriod = 'month'; if (Date.now() - this._rangeFetchedThrough > 300_000) void this._fetchRangeData(); }}>${this._t('period_month')}</span>
        </div>
        ${breakdown ? html`
          <div class="cost-stack">
            <div class="cost-seg nt" style="flex:${Math.max(ntPct, 0.001)}"></div>
            <div class="cost-seg vt" style="flex:${Math.max(vtPct, 0.001)}"></div>
          </div>
          <div class="cost-legend">
            <span class="cost-leg nt">NT ${(breakdown.ntWh / 1000).toFixed(1)} kWh · ${breakdown.ntCost.toFixed(2)} ${cur}</span>
            <span class="cost-leg vt">VT ${(breakdown.vtWh / 1000).toFixed(1)} kWh · ${breakdown.vtCost.toFixed(2)} ${cur}</span>
          </div>
          <div class="cost-total">${breakdown.cost.toFixed(2)} ${cur}</div>
          ${secondary}
        ` : html`<div class="cost-empty">${this._t('no_cost_data')}</div>`}
      </div>
    `;
  }

  // ── Render: HDO bar ────────────────────────────────────────────────────────

  private _renderHdo(): TemplateResult | typeof nothing {
    const hdo = this._config.hdo;
    if (!hdo?.switch) return nothing;
    // Unavailable HDO switch: fall back to the schedule when one is
    // configured, explicitly labelled "from schedule" (Fáze 1.3) — a grey
    // neutral state remains only when there's no schedule to fall back on.
    if (!this._isAvail(hdo.switch)) {
      const wd = this._hdoWindowsToday();
      if (wd) {
        const now = Date.now();
        const isNT = wd.windows.some(w => now >= w.start && now < w.end);
        const price = isNT ? hdo.nt_price : hdo.vt_price;
        const cur = hdo.currency ?? 'Kč';
        return html`
          <div class="hdo-bar ${isNT ? 'nt' : 'vt'}">
            <div class="hdo-dot ${isNT ? 'nt' : 'vt'}"></div>
            <div class="hdo-info">
              <div class="hdo-label">${isNT ? this._t('nt_low') : this._t('vt_high')}
                <span class="hdo-src-badge">${this._t('from_schedule')}</span>
              </div>
              ${price ? html`<div class="hdo-sub">${this._fmtPrice(price)} ${cur}/kWh</div>` : nothing}
            </div>
          </div>
        `;
      }
      return html`
        <div class="hdo-bar unk">
          <div class="hdo-dot unk"></div>
          <div class="hdo-info">
            <div class="hdo-label">${this._t('hdo_unavailable')}</div>
          </div>
        </div>
      `;
    }
    // Switch is always the source of truth for what the bar shows (Fáze 1.3) —
    // the schedule only feeds the mismatch note and the progress bar's end anchor.
    const isNT = this._isOn(hdo.switch);
    const cd = this._hdoCountdown();
    const price = isNT ? hdo.nt_price : hdo.vt_price;
    const cur = hdo.currency ?? 'Kč';
    const status = this._hdoStatus();
    const slotPct = status && status.slotEnd > status.slotStart
      ? Math.min(100, Math.max(0, ((Date.now() - status.slotStart) / (status.slotEnd - status.slotStart)) * 100))
      : -1;
    const note = status && status.kind !== 'ok' ? this._hdoMismatchNote(status) : '';
    return html`
      <div class="hdo-bar ${isNT ? 'nt' : 'vt'}">
        <div class="hdo-dot ${isNT ? 'nt' : 'vt'}"></div>
        <div class="hdo-info">
          <div class="hdo-label">${isNT ? this._t('nt_low') : this._t('vt_high')}</div>
          ${price ? html`<div class="hdo-sub">${this._fmtPrice(price)} ${cur}/kWh</div>` : nothing}
          ${slotPct >= 0 ? html`
            <div class="hdo-prog"><div class="hdo-prog-fill" style="width:${slotPct.toFixed(1)}%"></div></div>
          ` : nothing}
          ${note ? html`<div class="hdo-mismatch">${note}</div>` : nothing}
        </div>
        ${cd ? html`
          <div class="hdo-cd">
            <div class="hdo-cd-lbl">${this._t('ends_in')}</div>
            <div class="hdo-cd-val">${cd}</div>
          </div>
        ` : nothing}
      </div>
    `;
  }

  // ── Render: main meter ─────────────────────────────────────────────────────

  private _renderMainMeter(): TemplateResult | typeof nothing {
    const m = this._config.main_meter;
    if (!m) return nothing;
    const totalW = this._watts(m.power_l1) + this._watts(m.power_l2) + this._watts(m.power_l3);
    const voltage = this._num(m.voltage);
    const phases = [
      { label: 'L1', power: m.power_l1, current: m.current_l1, voltage: m.voltage_l1 },
      { label: 'L2', power: m.power_l2, current: m.current_l2, voltage: m.voltage_l2 },
      { label: 'L3', power: m.power_l3, current: m.current_l3, voltage: m.voltage_l3 },
    ];
    return html`
      <div class="ep-meter">
        <div class="meter-header">
          <div class="meter-icon">
            <ha-icon icon="mdi:transmission-tower"></ha-icon>
          </div>
          <div class="meter-title-wrap">
            <span class="meter-title">${this._t('main_meter')}</span>
            <span class="badge badge-info">3φ</span>
          </div>
          <div class="meter-total">
            <span class="metric-primary ${m.energy_today || m.power_l1 ? 'clickable' : ''}"
              @click=${() => this._moreInfo(m.power_l1 ?? m.power_l2 ?? m.power_l3 ?? m.energy_today)}>
              ${(totalW / 1000).toFixed(2)} kW
            </span>
            <span class="metric-small">
              ${this._metricRow([
                m.energy_today ? html`${this._kwh(m.energy_today).toFixed(1)} ${this._t('kwh_today')}` : null,
                (() => { const cr = this._calcDailyCost(m.energy_today, m.power_l1, m.power_l2, m.power_l3);
                         return cr ? html`<span class="cost-rate">${cr}</span>` : null; })(),
                m.voltage && voltage > 0 ? html`${voltage.toFixed(0)} V` : null,
                this._ageBadgePart(m.power_l1 ?? m.power_l2 ?? m.power_l3 ?? m.energy_today),
              ])}
            </span>
          </div>
        </div>
        ${this._config.sparkline_main_meter !== false ? this._renderSparkWindowSwitch() : nothing}
        <div class="phases-grid">
          ${phases.map(p => html`
            <div class="phase-cell">
              <div class="phase-label">${p.label}</div>
              <div class="phase-power ${p.power ? 'clickable' : ''}"
                @click=${() => this._moreInfo(p.power)}>
                ${(this._watts(p.power) / 1000).toFixed(2)} kW
              </div>
              <div class="phase-detail">
                ${this._num(p.current).toFixed(1)} A
                ${p.voltage ? html`<span class="metric-sep">·</span>${this._num(p.voltage).toFixed(0)} V` : nothing}
              </div>
              ${this._config.sparkline_main_meter !== false ? this._renderSparkline(p.power) : nothing}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  // ── Render: circuit ────────────────────────────────────────────────────────

  private _renderCircuit(c: Circuit): TemplateResult {
    const isOn = this._isOn(c.switch);
    const powerUnavail = !!c.power && !this._isAvail(c.power);
    const power = this._watts(c.power);
    const current = this._num(c.current);
    const energy = this._kwh(c.energy);
    const maxA = c.max_current ?? (c.phases === 3 ? 63 : 16);
    const loadPct = Math.min(100, Math.max(0, current > 0
      ? (current / maxA) * 100
      : (power / (maxA * 230)) * 100));
    const barColor = this._loadColor(loadPct);
    const expanded = this._expanded.has(c.id);
    const hasDevices = (c.devices?.length ?? 0) > 0;
    const costRate = power > 0 ? this._calcDailyCost(c.energy, c.power) : '';
    const ntHint = this._ntHint(power);

    return html`
      <div class="circuit-card ${c.critical ? 'critical' : ''} ${c.switch && isOn ? 'is-on' : ''}">

        <div class="circuit-header">
          <div class="status-dot ${isOn ? 'on' : c.switch ? 'off' : 'none'}"></div>
          <span class="circuit-name ${c.power || c.switch ? 'clickable' : ''}" title="${c.name}"
            @click=${() => this._moreInfo(c.power ?? c.switch)}>${c.name}</span>
          ${c.phases === 3 ? html`<span class="badge badge-phase">3φ</span>` : nothing}
          ${c.critical
            ? html`<ha-icon icon="mdi:lock" class="lock-icon"></ha-icon>`
            : c.switch
              ? html`<button
                    class="toggle ${isOn ? 'on' : 'off'}"
                    @click=${() => this._toggle(c.switch!, c.name, c.confirm_toggle)}
                    aria-label="${this._t(isOn ? 'turn_off' : 'turn_on')} ${c.name}">
                  </button>`
              : nothing}
        </div>

        <div class="load-track">
          <div class="load-fill ${loadPct >= 95 ? 'overload' : ''}"
            style="width:${loadPct.toFixed(1)}%;background:${barColor}"></div>
        </div>

        <div class="circuit-footer">
          <div class="metrics">
            <span class="metric-primary ${!isOn && power === 0 ? 'inactive' : ''}">
              ${powerUnavail ? '—' : this._fmtW(power)}
            </span>
            <span class="metric-small">
              ${this._metricRow([
                c.current ? html`${this._isAvail(c.current) ? current.toFixed(1) : '—'} A` : null,
                c.voltage ? html`${this._num(c.voltage).toFixed(0)} V` : null,
                energy > 0 ? html`${energy.toFixed(2)} kWh` : null,
                costRate ? html`<span class="cost-rate">${costRate}</span>` : null,
                this._ageBadgePart(c.power ?? c.current ?? c.switch),
              ])}
            </span>
          </div>
          ${hasDevices
            ? html`<button class="expand-btn" aria-expanded=${expanded ? 'true' : 'false'}
                @click=${() => this._toggleExpanded(c.id)}>
                <ha-icon icon="${expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
              </button>`
            : nothing}
        </div>

        ${ntHint ? html`
          <div class="nt-hint"><ha-icon icon="mdi:clock-fast"></ha-icon>${ntHint}</div>
        ` : nothing}

        ${expanded && hasDevices
          ? html`<div class="devices-list">${c.devices!.map(d => this._renderDevice(d))}</div>`
          : nothing}
        ${this._config.sparkline_1phase ? html`
          <div class="circuit-spark-wrap">${this._renderSparkline(c.power)}</div>
        ` : nothing}
      </div>
    `;
  }

  // ── Render: device ─────────────────────────────────────────────────────────

  private _renderDevice(d: CircuitDevice): TemplateResult {
    // Plain text note — no entities
    if (d.note) {
      return html`
        <div class="device-row note-row">
          <ha-icon icon="mdi:label-outline" class="note-icon"></ha-icon>
          <span class="device-name">${d.name}</span>
        </div>
      `;
    }

    // Multi-channel device (Shelly 4PM etc.)
    if ((d.channels?.length ?? 0) > 0) {
      const chTotalW = d.channels!.reduce((s, ch) => s + this._watts(ch.power), 0);
      const chTotalA = d.channels!.reduce((s, ch) => s + this._num(ch.current), 0);
      const hasChMetrics = d.channels!.some(ch => ch.power || ch.current);
      return html`
        <div class="device-group">
          <div class="device-group-label">
            <span>${d.name}</span>
            ${hasChMetrics ? html`<span class="ch-sum">${this._fmtW(chTotalW)} · ${chTotalA.toFixed(1)} A</span>` : nothing}
          </div>
          ${d.channels!.map(ch => this._renderChannel(ch))}
        </div>
      `;
    }

    const isOn = this._isOn(d.switch);
    const power = this._watts(d.power);
    const current = this._num(d.current);
    return html`
      <div class="device-row">
        <div class="status-dot sm ${isOn ? 'on' : d.switch ? 'off' : 'none'}"></div>
        <span class="device-name">${d.name}</span>
        <span class="device-metrics">
          ${power > 0 ? html`${this._fmtW(power)}` : nothing}
          ${current > 0 ? html` · ${current.toFixed(1)} A` : nothing}
        </span>
        ${d.switch
          ? html`<button
                class="toggle sm ${isOn ? 'on' : 'off'}"
                @click=${() => this._toggle(d.switch!, d.name)}
                aria-label="${this._t(isOn ? 'turn_off' : 'turn_on')} ${d.name}">
              </button>`
          : nothing}
      </div>
    `;
  }

  // ── Render: channel ────────────────────────────────────────────────────────

  private _renderChannel(ch: DeviceChannel): TemplateResult {
    const isOn = this._isOn(ch.switch);
    const power = this._watts(ch.power);
    const current = this._num(ch.current);
    return html`
      <div class="device-row channel">
        <div class="status-dot sm ${isOn ? 'on' : ch.switch ? 'off' : 'none'}"></div>
        <span class="device-name">${ch.name}</span>
        <span class="device-metrics">
          ${power > 0 ? html`${this._fmtW(power)}` : nothing}
          ${current > 0 ? html` · ${current.toFixed(1)} A` : nothing}
        </span>
        ${ch.switch
          ? html`<button
                class="toggle sm ${isOn ? 'on' : 'off'}"
                @click=${() => this._toggle(ch.switch!, ch.name)}
                aria-label="${this._t(isOn ? 'turn_off' : 'turn_on')} ${ch.name}">
              </button>`
          : nothing}
      </div>
    `;
  }

  // ── Render: 3-phase circuit ───────────────────────────────────────────────

  private _renderThreePhaseCircuit(c: Circuit): TemplateResult {
    const isOn = this._isOn(c.switch);
    // Total power: use dedicated entity if set, otherwise sum L1+L2+L3
    const totalPower = c.power
      ? this._watts(c.power)
      : this._watts(c.power_l1) + this._watts(c.power_l2) + this._watts(c.power_l3);
    const energy = this._kwh(c.energy);
    const maxA = c.max_current ?? 63;
    const phases = [
      { label: 'L1', power: c.power_l1, current: c.current_l1, voltage: c.voltage_l1 },
      { label: 'L2', power: c.power_l2, current: c.current_l2, voltage: c.voltage_l2 },
      { label: 'L3', power: c.power_l3, current: c.current_l3, voltage: c.voltage_l3 },
    ];
    // Total current for load bar: use dedicated entity if set, otherwise max of phases
    const totalCurrent = c.current
      ? this._num(c.current)
      : Math.max(this._num(c.current_l1), this._num(c.current_l2), this._num(c.current_l3));
    // Power fallback: P = √3 × U_LL × I → I = P / (√3 × 400 V) per fully loaded phase
    const loadPct = Math.min(100, Math.max(0, totalCurrent > 0
      ? (totalCurrent / maxA) * 100
      : (totalPower / (maxA * Math.sqrt(3) * 400)) * 100));
    const barColor = this._loadColor(loadPct);
    const expanded = this._expanded.has(c.id);
    const hasDevices = (c.devices?.length ?? 0) > 0;
    // Cost: total entity if available, otherwise per-phase — never both
    // (summing total + phases would double-count the energy).
    const costRate = totalPower > 0
      ? (c.power
          ? this._calcDailyCost(c.energy, c.power)
          : this._calcDailyCost(c.energy, c.power_l1, c.power_l2, c.power_l3))
      : '';
    const ntHint = this._ntHint(totalPower);

    return html`
      <div class="three-phase-card ${c.critical ? 'critical' : ''} ${c.switch && isOn ? 'is-on' : ''}">
        <div class="tp-header">
          <div class="tp-title-row">
            <div class="status-dot ${isOn ? 'on' : c.switch ? 'off' : 'none'}"></div>
            <span class="circuit-name ${c.power || c.switch ? 'clickable' : ''}" title="${c.name}"
              @click=${() => this._moreInfo(c.power ?? c.switch)}>${c.name}</span>
            <span class="badge badge-phase">3φ</span>
            ${c.critical
              ? html`<ha-icon icon="mdi:lock" class="lock-icon"></ha-icon>`
              : c.switch
                ? html`<button class="toggle ${isOn ? 'on' : 'off'}"
                    @click=${() => this._toggle(c.switch!, c.name, c.confirm_toggle)}
                    aria-label="${this._t(isOn ? 'turn_off' : 'turn_on')} ${c.name}">
                  </button>`
                : nothing}
          </div>
          <div class="tp-total">
            <span class="metric-primary">${(totalPower / 1000).toFixed(2)} kW</span>
            <span class="metric-small">
              ${this._metricRow([
                energy > 0 ? html`${energy.toFixed(2)} kWh` : null,
                costRate ? html`<span class="cost-rate">${costRate}</span>` : null,
                this._ageBadgePart(c.power ?? c.power_l1 ?? c.current_l1 ?? c.switch),
              ])}
            </span>
          </div>
        </div>

        <div class="load-track">
          <div class="load-fill ${loadPct >= 95 ? 'overload' : ''}"
            style="width:${loadPct.toFixed(1)}%;background:${barColor}"></div>
        </div>

        ${ntHint ? html`
          <div class="nt-hint"><ha-icon icon="mdi:clock-fast"></ha-icon>${ntHint}</div>
        ` : nothing}

        <div class="phases-grid">
          ${phases.map(p => html`
            <div class="phase-cell">
              <div class="phase-label">${p.label}</div>
              <div class="phase-power ${p.power ? 'clickable' : ''}"
                @click=${() => this._moreInfo(p.power)}>
                ${(this._watts(p.power) / 1000).toFixed(2)} kW
              </div>
              <div class="phase-detail">
                ${this._num(p.current).toFixed(1)} A
                ${p.voltage ? html`<span class="metric-sep">·</span>${this._num(p.voltage).toFixed(0)} V` : nothing}
              </div>
              ${this._config.sparkline_3phase !== false ? this._renderSparkline(p.power) : nothing}
            </div>
          `)}
        </div>

        ${hasDevices ? html`
          <div class="tp-footer">
            <button class="expand-btn" aria-expanded=${expanded ? 'true' : 'false'}
              @click=${() => this._toggleExpanded(c.id)}>
              <ha-icon icon="${expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
              <span>${expanded ? this._t('hide') : this._t('devices')}</span>
            </button>
          </div>
        ` : nothing}

        ${expanded && hasDevices
          ? html`<div class="tp-devices-grid">${c.devices!.map(d => html`<div class="tp-device-col">${this._renderDevice(d)}</div>`)}</div>`
          : nothing}
      </div>
    `;
  }

  // ── view: panel — DIN rail (ROADMAP 5.4) ───────────────────────────────────

  private _isPanelView(): boolean {
    return this._config?.view === 'panel';
  }

  /** Panel options with defaults resolved once, so render code can read them
   *  without repeating `?? fallback` at every use. */
  private _panelCfg(): { railSize: number; mainBreaker: number; moduleSpark: boolean; showMain: boolean } {
    const p = this._config.panel ?? {};
    return {
      railSize: p.rail_size ?? 12,
      mainBreaker: p.main_breaker ?? 25,
      moduleSpark: p.module_spark !== false,
      showMain: p.show_main !== false,
    };
  }

  /**
   * Every module on the rail, already in board order.
   *
   * The main breaker is synthesised from `main_meter` rather than coming from
   * `circuits` — it is the one module a user never configures as a circuit but
   * always has in the physical board, and it is what the rail hangs off.
   */
  private _panelModules(): PanelModule[] {
    const cfg = this._panelCfg();
    const mods: PanelModule[] = [];
    const mm = this._config.main_meter;

    if (cfg.showMain && mm) {
      const w = this._watts(mm.power_l1) + this._watts(mm.power_l2) + this._watts(mm.power_l3);
      // The main breaker trips on its worst phase, not on the sum — so the
      // load level has to follow the highest phase current, not the total.
      const maxPhaseA = Math.max(
        this._num(mm.current_l1), this._num(mm.current_l2), this._num(mm.current_l3));
      const mainSpark = this._dominantPhase(
        [mm.power_l1, mm.power_l2, mm.power_l3],
        [mm.current_l1, mm.current_l2, mm.current_l3]);
      mods.push({
        id: EP_MAIN_ID,
        width: 3,
        position: 'HL',
        name: this._t('main_breaker'),
        phaseCls: 'l3f',
        watts: w,
        amps: maxPhaseA,
        maxA: cfg.mainBreaker,
        pct: loadPercent(maxPhaseA, w / 3, cfg.mainBreaker, this._mainVoltage()),
        isOn: true,
        hasSwitch: false,
        critical: true,
        sparkId: mainSpark.id,
        sparkPhase: mainSpark.label,
      });
    }

    const circuits = (this._config.circuits ?? [])
      .slice()
      .sort((a, b) => comparePosition(a.position, b.position));

    for (const c of circuits) {
      const three = c.phases === 3;
      const watts = three
        ? (c.power ? this._watts(c.power)
                   : this._watts(c.power_l1) + this._watts(c.power_l2) + this._watts(c.power_l3))
        : this._watts(c.power);
      const amps = three
        ? (c.current ? this._num(c.current)
                     : Math.max(this._num(c.current_l1), this._num(c.current_l2), this._num(c.current_l3)))
        : this._num(c.current);
      const maxA = c.max_current ?? (three ? 63 : 16);
      const volts = this._num(c.voltage) || this._num(c.voltage_l1) || 230;
      mods.push({
        id: c.id,
        width: three ? 3 : 1,
        position: c.position ?? '',
        name: c.name,
        phaseCls: three ? 'l3f' : (c.phase ? c.phase.toLowerCase() as 'l1' | 'l2' | 'l3' : 'none'),
        watts,
        amps,
        maxA,
        pct: loadPercent(amps, three ? watts / 3 : watts, maxA, volts),
        isOn: this._isOn(c.switch),
        hasSwitch: !!c.switch,
        critical: !!c.critical,
        ...(three && !c.power
          ? (() => {
              const d = this._dominantPhase(
                [c.power_l1, c.power_l2, c.power_l3],
                [c.current_l1, c.current_l2, c.current_l3]);
              return { sparkId: d.id, sparkPhase: d.label };
            })()
          : { sparkId: c.power }),
        circuit: c,
      });
    }
    return mods;
  }

  /**
   * Which phase entity to plot for a 3-phase module that has no single total
   * power sensor.
   *
   * Summing three separate history series would mean resampling three
   * differently-timed caches, and picking L1 blindly would draw a flat line
   * next to a 2.5 kW headline. The breaker trips on its worst phase, so that
   * is the phase worth plotting — labelled, so it is never mistaken for the
   * total.
   */
  private _dominantPhase(
    powers: Array<string | undefined>, currents: Array<string | undefined>,
  ): { id?: string; label?: string } {
    let best = -1, bestVal = -1;
    for (let i = 0; i < 3; i++) {
      if (!powers[i]) continue;
      const v = this._num(currents[i]) || this._watts(powers[i]);
      if (v > bestVal) { bestVal = v; best = i; }
    }
    if (best < 0) return {};
    return { id: powers[best], label: `L${best + 1}` };
  }

  /**
   * Join the small metric parts with dot separators, skipping the ones that
   * aren't configured.
   *
   * Each part used to carry its own leading separator, which was fine as long
   * as the first one (current) was always present — on a circuit configured
   * with only an energy sensor the row opened with a stray "·". Deciding the
   * separator from the position in the surviving list instead of from the
   * field makes sparse configs render cleanly.
   */
  private _metricRow(parts: Array<TemplateResult | string | null | undefined>): TemplateResult {
    const kept = parts.filter(x => x !== null && x !== undefined && x !== '') as Array<TemplateResult | string>;
    return html`${kept.map((part, i) => html`${i > 0
      ? html`<span class="metric-sep">·</span>`
      : nothing}${part}`)}`;
  }

  /** `_ageBadge` for use inside `_metricRow` — turns lit's `nothing` into null
   *  so the row's filter drops it along with the other absent parts. */
  private _ageBadgePart(entityId?: string): TemplateResult | null {
    const b = this._ageBadge(entityId);
    return b === nothing ? null : b as TemplateResult;
  }

  private _mainVoltage(): number {
    const mm = this._config.main_meter;
    if (!mm) return 230;
    return this._num(mm.voltage_l1) || this._num(mm.voltage) || 230;
  }

  /** Micro graph drawn behind a module's face. Reuses the very same cached
   *  path as the full sparkline — `preserveAspectRatio="none"` rescales the
   *  100x38 user-space into the module's strip, so there is no second
   *  computation and no second cache. */
  private _renderModuleSpark(entityId?: string): TemplateResult | typeof nothing {
    if (!entityId) return nothing;
    const cached = this._sparkPaths(entityId);
    if (!cached) return nothing;
    return html`
      <svg class="mod-spark" viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true">
        <path d="${cached.line}" fill="none" stroke="currentColor" stroke-width="1.6"
          stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      </svg>`;
  }

  private _renderPanelModule(m: PanelModule): TemplateResult {
    const picked = this._panelPick.includes(m.id);
    const cfg = this._panelCfg();
    const off = m.hasSwitch && !m.isOn;
    return html`
      <div class="mod ${off ? 'off' : 'on'} ${m.width === 3 ? 'w3' : ''} ${picked ? 'pick' : ''}"
        role="button" tabindex="0"
        aria-pressed=${picked ? 'true' : 'false'}
        aria-label="${m.position ? m.position + ' ' : ''}${m.name}"
        style="--ep-fillc:${this._loadColor(m.pct)}"
        @click=${() => this._panelTogglePick(m.id)}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._panelTogglePick(m.id); }
        }}>
        <div class="mod-lever">
          ${Array.from({ length: m.width === 3 ? 3 : 1 },
            () => html`<span class="lv"></span>`)}
        </div>
        <div class="mod-face">
          ${cfg.moduleSpark ? this._renderModuleSpark(m.sparkId) : nothing}
          <div class="mod-fill" style="height:${m.pct.toFixed(0)}%"></div>
          ${picked ? html`<span class="mod-pin"></span>` : nothing}
          <div class="mod-w">${m.watts > 0 ? this._fmtW(m.watts) : '—'}</div>
          <div class="mod-nm">${m.name}</div>
        </div>
        <div class="mod-foot">
          <span class="mod-num">${m.position}</span>
          ${m.critical ? html`<ha-icon icon="mdi:lock" class="mod-lock"></ha-icon>` : nothing}
          <span class="mod-ph ${m.phaseCls}">${m.phaseCls === 'l3f' ? '3φ'
            : m.phaseCls === 'none' ? '' : m.phaseCls.toUpperCase()}</span>
        </div>
        <div class="mod-strip ${m.phaseCls}"></div>
      </div>`;
  }

  private _panelTogglePick(id: string): void {
    this._panelPick = this._panelPick.includes(id)
      ? this._panelPick.filter(x => x !== id)
      : [...this._panelPick, id];
  }

  private _renderPanel(): TemplateResult {
    const cfg = this._panelCfg();
    const mods = this._panelModules();
    const rails = buildRails(mods, cfg.railSize);
    const mm = this._config.main_meter;
    const totalW = mm
      ? this._watts(mm.power_l1) + this._watts(mm.power_l2) + this._watts(mm.power_l3)
      : mods.reduce((a, m) => a + (m.id === EP_MAIN_ID ? 0 : m.watts), 0);
    const positions = mods.reduce((a, m) => a + m.width, 0);
    const mainMod = mods.find(m => m.id === EP_MAIN_ID);
    const isNT = this._config.hdo?.switch ? this._isOn(this._config.hdo.switch) : false;
    const costRate = mm
      ? this._calcDailyCost(mm.energy_today, mm.power_l1, mm.power_l2, mm.power_l3)
      : '';

    return html`
      <div class="rail-wrap">
        <div class="rail-top">
          <div>
            <div class="rail-lbl">${this._t('panel_board')} · ${this._t('panel_positions', { n: String(positions) })}</div>
            <div class="rail-val">${this._fmtW(totalW)}</div>
          </div>
          <div class="rail-sub">
            ${mm?.energy_today
              ? html`${this._kwh(mm.energy_today).toFixed(1)} ${this._t('kwh_today')}${costRate ? html` · <span class="cost-rate">${costRate}</span>` : nothing}<br>`
              : nothing}
            ${mainMod
              ? html`${this._t('main_breaker')} ${mainMod.amps.toFixed(1)} / ${mainMod.maxA} A`
              : nothing}
          </div>
        </div>
        <div class="busbar ${isNT ? 'nt' : 'vt'}"></div>
        <div class="busbar-note">${this._t('busbar_note')}</div>
        ${rails.map(r => {
          const used = r.reduce((a, m) => a + m.width, 0);
          const gap = Math.max(0, cfg.railSize - used);
          return html`
            <div class="rail">
              <div class="rail-mods">
                ${r.map(m => this._renderPanelModule(m))}
                ${gap > 0 ? html`<div class="rail-gap" style="flex-basis:0;flex-grow:${gap}"></div>` : nothing}
              </div>
            </div>`;
        })}
        ${this._renderPanelDetail(mods)}
      </div>`;
  }

  // ── panel detail ───────────────────────────────────────────────────────────

  private _renderPanelTools(): TemplateResult {
    const n = this._panelPick.length;
    return html`
      <div class="g-bar">
        ${this._renderSparkWindowSwitch(true)}
        ${n > 1 ? html`
          <button class="g-chk ${this._panelSharedY ? 'on' : ''}" role="switch"
            aria-checked=${this._panelSharedY ? 'true' : 'false'}
            @click=${() => { this._panelSharedY = !this._panelSharedY; }}>
            <span class="box"></span>${this._t('shared_axis')}
          </button>` : nothing}
        <span class="g-spacer"></span>
        ${n ? html`
          <button class="g-btn" @click=${() => { this._panelPick = []; }}>
            ${this._t('clear_selection', { n: String(n) })}
          </button>` : nothing}
      </div>`;
  }

  private _renderPanelDetail(mods: PanelModule[]): TemplateResult {
    const picked = this._panelPick
      .map(id => mods.find(m => m.id === id))
      .filter(Boolean) as PanelModule[];

    let body: TemplateResult;
    if (picked.length === 0) {
      body = html`<div class="rd-hint">
        ${this._t('panel_hint_pick')}<br>${this._t('panel_hint_compare')}
      </div>`;
    } else if (picked.length === 1) {
      body = this._renderPanelSingle(picked[0]);
    } else {
      body = this._renderPanelCompare(picked);
    }
    return html`<div class="rail-detail">${this._renderPanelTools()}${body}</div>`;
  }

  private _renderPanelSingle(m: PanelModule): TemplateResult {
    const c = m.circuit;
    const three = m.width === 3;
    const energy = c ? this._kwh(c.energy) : (this._config.main_meter
      ? this._kwh(this._config.main_meter.energy_today) : 0);
    const costRate = c
      ? (c.phases === 3 && !c.power
          ? this._calcDailyCost(c.energy, c.power_l1, c.power_l2, c.power_l3)
          : this._calcDailyCost(c.energy, c.power))
      : (this._config.main_meter
          ? this._calcDailyCost(this._config.main_meter.energy_today,
              this._config.main_meter.power_l1, this._config.main_meter.power_l2,
              this._config.main_meter.power_l3)
          : '');

    return html`
      <div class="rd-head">
        ${m.position ? html`<span class="rd-num">${m.position}</span>` : nothing}
        <span class="rd-name">${m.name}</span>
        ${three ? html`<span class="badge badge-phase">3φ</span>` : nothing}
        ${m.critical
          ? html`<ha-icon icon="mdi:lock" class="lock-icon"></ha-icon>`
          : m.hasSwitch && c
            ? html`<button class="toggle ${m.isOn ? 'on' : 'off'}"
                @click=${() => this._toggle(c.switch!, c.name, c.confirm_toggle)}
                aria-label="${this._t(m.isOn ? 'turn_off' : 'turn_on')} ${c.name}"></button>`
            : nothing}
      </div>
      <div class="rd-val">${this._fmtW(m.watts)}</div>
      <div class="rd-meta">
        ${m.amps > 0 ? html`${m.amps.toFixed(1)} A · ` : nothing}
        ${energy > 0 ? html`${energy.toFixed(2)} kWh · ` : nothing}
        ${costRate ? html`<span class="cost-rate">${costRate}</span> · ` : nothing}
        ${this._t('load_pct', { pct: m.pct.toFixed(0) })} ${this._t('of_rating', { max: String(m.maxA) })}
      </div>
      ${(() => {
        // `show_nt_hint` was only ever read by the two classic renderers, so in
        // panel view the setting silently did nothing. The hint belongs on the
        // detail rather than on the module: it is a sentence, and a module is
        // 70 px wide.
        const hint = this._ntHint(m.watts);
        return hint
          ? html`<div class="nt-hint"><ha-icon icon="mdi:clock-fast"></ha-icon>${hint}</div>`
          : nothing;
      })()}
      ${three ? this._renderPanelPhases(m) : html`<div class="rd-graph">${this._renderSparkline(m.sparkId)}</div>`}
      ${this._renderPanelDevices(m)}`;
  }

  /**
   * L1/L2/L3 side by side for any 3-phase module, including the main breaker.
   *
   * All three graphs are forced onto one scale — without that the phase
   * carrying 40 W and the one carrying 2.4 kW draw identical-looking curves,
   * which is exactly the comparison the detail exists to make.
   */
  private _renderPanelPhases(m: PanelModule): TemplateResult {
    const c = m.circuit;
    const mm = this._config.main_meter;
    const phases: Array<{ lbl: string; power?: string; current?: string; voltage?: string }> =
      c
        ? [
            { lbl: 'L1', power: c.power_l1, current: c.current_l1, voltage: c.voltage_l1 },
            { lbl: 'L2', power: c.power_l2, current: c.current_l2, voltage: c.voltage_l2 },
            { lbl: 'L3', power: c.power_l3, current: c.current_l3, voltage: c.voltage_l3 },
          ]
        : [
            { lbl: 'L1', power: mm?.power_l1, current: mm?.current_l1, voltage: mm?.voltage_l1 ?? mm?.voltage },
            { lbl: 'L2', power: mm?.power_l2, current: mm?.current_l2, voltage: mm?.voltage_l2 ?? mm?.voltage },
            { lbl: 'L3', power: mm?.power_l3, current: mm?.current_l3, voltage: mm?.voltage_l3 ?? mm?.voltage },
          ];

    const globalMax = Math.max(
      ...phases.map(p => (p.power ? this._sparkPaths(p.power)?.vMax ?? 0 : 0)), 0);
    const globalMin = Math.min(
      ...phases.map(p => (p.power ? this._sparkPaths(p.power)?.vMin ?? 0 : 0)), 0);

    return html`
      <div class="ph3-grid">
        ${phases.map(p => {
          const w = this._watts(p.power);
          const a = this._num(p.current);
          const v = this._num(p.voltage);
          const pct = loadPercent(a, w, m.maxA, v || 230);
          const cls = p.lbl.toLowerCase();
          return html`
            <div class="ph3-cell ${cls}">
              <div class="ph3-head">
                <span class="ph3-lbl">${p.lbl}</span>
                <span class="ph3-pct">${pct.toFixed(0)} %</span>
              </div>
              <div class="ph3-val">${this._fmtW(w)}</div>
              <div class="ph3-sub">
                ${a.toFixed(1)} A${v > 0 ? html` · ${v.toFixed(0)} V` : nothing}
              </div>
              <div class="ph3-track">
                <i style="width:${pct.toFixed(0)}%;background:${this._loadColor(pct)}"></i>
              </div>
              ${this._renderScaledSpark(p.power, globalMin, globalMax, `var(--ep-${cls})`)}
            </div>`;
        })}
      </div>
      <div class="ph3-note">${this._t('phases_shared_scale')}</div>`;
  }

  /**
   * A cached sparkline path re-projected onto a shared value axis.
   *
   * The cached path normalises each entity onto its own [vMin, vMax], which is
   * what makes a 40 W phase and a 2.4 kW phase look identical. Mapping one
   * linear scale onto another is itself linear, so instead of recomputing the
   * path we wrap it in the affine transform that turns the entity's own axis
   * into the shared one — same path object, same cache, correct comparison.
   */
  // Pozor: barva musí jít přes `style=`, ne přes prezentační atribut `stroke=`.
  // V prezentačních atributech se `var(--…)` nevyhodnotí a křivka se prostě
  // nevykreslí — tichá chyba, kterou nic nenahlásí.
  private _renderScaledSpark(
    entityId: string | undefined, gMin: number, gMax: number, color: string,
  ): TemplateResult | typeof nothing {
    if (!entityId) return nothing;
    const s = this._sparkPaths(entityId);
    if (!s) return nothing;
    const H = 38, pad = 3, inner = H - pad * 2;
    const gRange = gMax - gMin;
    const lRange = s.vMax - s.vMin;
    // Nested fragments inside an <svg> must be built with lit's `svg` tag, not
    // `html` — a nested `html` template is prepared in the HTML namespace, so
    // its <path> comes out as an unknown HTML element and silently draws
    // nothing. Colours go through `style=`, since `var(--…)` does not resolve
    // in an SVG presentation attribute either.
    let g;
    if (!(gRange > 0) || !(lRange > 0)) {
      // Nothing varies (a phase sitting at a constant, usually zero) — draw it
      // flat at its place on the shared axis rather than mid-box.
      const y = gRange > 0 ? (H - pad) - ((s.vMin - gMin) / gRange) * inner : H - pad;
      g = svg`<path d="M 0,${y.toFixed(1)} L 100,${y.toFixed(1)}" fill="none"
        style="stroke:${color}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
    } else {
      const k = lRange / gRange;
      const ty = (H - pad) * (1 - k) - (inner / gRange) * (s.vMin - gMin);
      g = svg`
        <g transform="translate(0 ${ty.toFixed(2)}) scale(1 ${k.toFixed(4)})">
          <path d="${s.line}" fill="none" style="stroke:${color}" stroke-width="1.4"
            stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        </g>`;
    }
    return html`
      <svg class="ph3-spark" viewBox="0 0 100 ${H}" preserveAspectRatio="none">${g}</svg>`;
  }

  private _renderPanelCompare(picked: PanelModule[]): TemplateResult {
    const paths = picked.map(m => (m.sparkId ? this._sparkPaths(m.sparkId) : undefined));
    const gMax = Math.max(...paths.map(p => p?.vMax ?? 0), 0);
    const gMin = Math.min(...paths.map(p => p?.vMin ?? 0), 0);
    const shared = this._panelSharedY;
    return html`
      <div class="cmp-grid">
        ${picked.map((m, i) => {
          const p = paths[i];
          const localMax = p?.vMax ?? 0;
          return html`
            <div class="cmp-cell">
              <div class="cmp-head">
                ${m.position ? html`<span class="cmp-num">${m.position}</span>` : nothing}
                <span class="cmp-name">${m.name}</span>
                <span class="cmp-val">${this._fmtW(m.watts)}</span>
              </div>
              <div class="cmp-scale">
                ${m.sparkPhase ? html`<span class="cmp-ph">${m.sparkPhase}</span> · ` : nothing}max
                ${this._fmtW(shared ? gMax : localMax)}${shared ? html` · ${this._t('shared_axis')}` : nothing}
              </div>
              ${shared
                ? this._renderScaledSpark(m.sparkId, gMin, gMax, 'var(--ep-neutral)')
                : html`<div class="cmp-plain">${this._renderSparkline(m.sparkId, true)}</div>`}
            </div>`;
        })}
      </div>`;
  }

  private _renderPanelDevices(m: PanelModule): TemplateResult {
    const devices = m.circuit?.devices ?? [];
    if (!devices.length) {
      return html`<div class="dev-empty">${this._t('no_devices')}</div>`;
    }
    return html`
      <div class="dev-wrap">
        <div class="dev-title">${this._t('devices_behind')}</div>
        <div class="devices-list" style="margin-top:0;padding-top:0;border-top:none">
          ${devices.map(d => this._renderDevice(d))}
        </div>
      </div>`;
  }

  // ── Main render ────────────────────────────────────────────────────────────

  render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    return html`
      <ha-card class=${this._config.follow_theme ? 'theme-auto' : ''}>
        ${this._config.title
          ? html`<div class="card-header">${this._config.title}</div>`
          : nothing}
        <div class="card-content">
          ${this._isPanelView() ? this._renderPanelBody() : this._renderClassicBody()}
        </div>
      </ha-card>
    `;
  }

  private _renderClassicBody(): TemplateResult {
    const circuits = this._config.circuits ?? [];
    const threePhase = circuits.filter(c => c.phases === 3);
    const singlePhase = circuits.filter(c => c.phases !== 3);
    return html`
      ${this._renderHdo()}
      ${this._renderHdoSchedule()}
      ${this._renderMainMeter()}

      ${threePhase.length > 0 ? html`
        <div class="section-label">${this._t('three_phase_section')}</div>
        <div class="three-phase-list">
          ${threePhase.map(c => this._renderThreePhaseCircuit(c))}
        </div>
      ` : nothing}

      ${singlePhase.length > 0 ? html`
        ${threePhase.length > 0
          ? html`<div class="section-label">${this._t('single_phase_section')}</div>`
          : nothing}
        <div class="circuit-grid">
          ${singlePhase.map(c => this._renderCircuit(c))}
        </div>
      ` : nothing}`;
  }

  /**
   * Order in panel view: tariff → day timeline → board → detail → schedule.
   *
   * "Is it cheap right now" and "what is drawing" are the two glance-level
   * questions, so they sit at the top; the schedule table and the costs tab
   * are planning and review, and move below the board. The timeline stays up
   * top on its own because it answers "when is it cheap again" at a glance —
   * and it appears exactly once, `_renderHdoSchedule` drops its own copy.
   */
  private _renderPanelBody(): TemplateResult {
    return html`
      ${this._renderHdo()}
      ${this._renderDayTimeline()}
      ${this._renderPanel()}
      ${this._renderHdoSchedule()}`;
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  static styles = css`
    :host { display: block; container-type: inline-size; }
    ha-card {
      /* Built-in dark palette — overridden by .theme-auto below.

         Balíček B: tři úrovně povrchu místo jedné. Vnořená buňka je
         SVĚTLEJŠÍ než rodič (--ep-surface-2 uvnitř --ep-surface); dřív
         používala --ep-bg, tedy tmavší než rodič, což se četlo jako díra
         ve kartě, ne jako vystupující prvek. */
      --ep-bg: #0f1116;
      --ep-surface: #171a21;
      --ep-surface-2: #1f232c;
      --ep-border: #262b36;
      --ep-border2: #333a48;
      --ep-text: #e6eaf2;
      --ep-text-mid: #9aa5b8;
      --ep-text-dim: #6b7688;
      --ep-text-faint: #374151;
      --ep-accent: #7aa2e3;
      --ep-accent-bg: rgba(122,162,227,.14);
      /* Balíček A: neutrál pro věci, které jsou kontext, ne signál — průběhy
         a nízké zatížení. Dřív na tato místa padala zelená, která tím ztrácela
         význam "nízký tarif". */
      --ep-neutral: #7c8ba1;
      --ep-badge-bg: rgba(122,162,227,.14);
      --ep-badge-fg: #7aa2e3;
      /* Elevace odlišuje úrovně periferním viděním: hlavní měřič má stín a
         žádný okraj, okruhy povrch + okraj, jističe jen okraj. */
      --ep-shadow: 0 1px 2px rgba(0,0,0,.4), 0 4px 14px rgba(0,0,0,.3);

      /* view: panel — fázové barvy. Vybrané tak, aby nekolidovaly s vyhrazenou
         zelenou/červenou (tarif) ani amber (varování). Reálné hnědá/černá/šedá
         podle CEE jsou na tmavé kartě nepoužitelné. */
      --ep-l1: #8b7ee8;
      --ep-l2: #45b8ac;
      --ep-l3: #5b8def;
      /* Kovový profil DIN lišty a plast modulu. */
      --ep-metal-a: #2b313d;
      --ep-metal-b: #1a1e26;
      --ep-metal-edge: #3c4454;
      --ep-mod-a: #2b303b;
      --ep-mod-b: #20242d;
      --ep-mod-chrome: #14171d;
      --ep-mod-text: #e6eaf2;
      --ep-mod-dim: #98a3b5;

      /* Balíček B: typografická škála. Bylo devět velikostí v pásmu 8-14 px —
         rozdíl 10 vs. 11 px se nečte jako hierarchie, jen jako nekonzistence.
         Pět kroků, každý s jasnou rolí. */
      --ep-fs-micro: 10px;   /* uppercase labely, badge, jednotky */
      --ep-fs-meta:  11px;   /* sekundární metriky */
      --ep-fs-body:  13px;   /* názvy okruhů a zařízení */
      --ep-fs-sub:   16px;   /* fázové hodnoty, mezisoučty */
      --ep-fs-hero:  24px;   /* primární hodnota, countdown */

      /* Tvarosloví: tři poloměry místo sedmi, dvě výšky pruhů místo pěti. */
      --ep-r-sm: 4px;
      --ep-r-md: 8px;
      --ep-r-pill: 999px;

      background: var(--ep-bg);
      overflow: hidden;
    }
    /* follow_theme: true — map palette onto the active HA theme */
    ha-card.theme-auto {
      --ep-bg: var(--ha-card-background, var(--card-background-color, #fff));
      --ep-surface: var(--secondary-background-color, #f5f5f5);
      /* Na světlém tématu je "vystupující" bílá, tedy zpět barva karty —
         opačný směr než v tmavém, stejný význam. */
      --ep-surface-2: var(--ha-card-background, var(--card-background-color, #fff));
      --ep-border: var(--divider-color, rgba(0,0,0,.12));
      --ep-border2: var(--divider-color, rgba(0,0,0,.12));
      --ep-text: var(--primary-text-color, #212121);
      --ep-text-mid: var(--secondary-text-color, #727272);
      --ep-text-dim: var(--secondary-text-color, #727272);
      --ep-text-faint: var(--disabled-text-color, #bdbdbd);
      --ep-accent: var(--primary-color, #03a9f4);
      --ep-accent-bg: rgba(33, 150, 243, 0.12);
      --ep-neutral: var(--secondary-text-color, #727272);
      --ep-badge-bg: rgba(33, 150, 243, 0.12);
      --ep-badge-fg: var(--primary-color, #03a9f4);
      --ep-shadow: 0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.07);
      --ep-l1: #6d5fd6;
      --ep-l2: #1d8f85;
      --ep-l3: #2f6fd0;
      --ep-metal-a: #dfe3ea;
      --ep-metal-b: #c6ccd7;
      --ep-metal-edge: #aeb6c4;
      --ep-mod-a: #fdfdfe;
      --ep-mod-b: #dee3eb;
      --ep-mod-chrome: #b9c0cc;
      --ep-mod-text: #1c2230;
      --ep-mod-dim: #55606f;
    }
    ha-card.theme-auto .hdo-bar.nt { background: rgba(34,197,94,.08); border-color: rgba(34,197,94,.3); }
    ha-card.theme-auto .hdo-bar.vt { background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.3); }
    ha-card.theme-auto .hdo-bar.nt .hdo-sub,
    ha-card.theme-auto .hdo-bar.vt .hdo-sub { color: var(--ep-text-mid); }
    ha-card.theme-auto .hdo-bar.nt .hdo-prog,
    ha-card.theme-auto .hdo-bar.vt .hdo-prog { background: rgba(127,127,127,.18); }
    .card-header { padding: 16px 16px 0; font-size: var(--ep-fs-sub); font-weight: 600; letter-spacing: -0.2px; color: var(--ep-text); }
    .card-content { padding: 12px 12px 16px; }

    .hdo-bar { border-radius: var(--ep-r-md); padding: 14px 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px; box-shadow: var(--ep-shadow); }
    .hdo-bar.nt { background: #0f2318; border: 1px solid #1e4d30; }
    .hdo-bar.vt { background: #200f0f; border: 1px solid #4d1e1e; }
    .hdo-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .hdo-dot.nt { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.2); animation: hdo-pulse 2.5s ease-in-out infinite; }
    .hdo-dot.vt { background: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,.18); }
    @keyframes hdo-pulse {
      0%,100% { box-shadow: 0 0 0 3px rgba(34,197,94,.2); }
      50%      { box-shadow: 0 0 0 5px rgba(34,197,94,.07); }
    }
    .hdo-info { flex: 1; min-width: 0; }
    .hdo-label { font-size: var(--ep-fs-micro); font-weight: 600; text-transform: uppercase; letter-spacing: .8px; }
    .hdo-bar.nt .hdo-label { color: #22c55e; }
    .hdo-bar.vt .hdo-label { color: #ef4444; }
    .hdo-sub { font-size: var(--ep-fs-meta); margin-top: 3px; font-variant-numeric: tabular-nums; }
    .hdo-bar.nt .hdo-sub { color: #4b7a5e; }
    .hdo-bar.vt .hdo-sub { color: #7a4b4b; }
    .hdo-prog { height: 6px; border-radius: var(--ep-r-pill); overflow: hidden; margin-top: 10px; }
    .hdo-bar.nt .hdo-prog { background: #1a2e20; }
    .hdo-bar.vt .hdo-prog { background: #2e1a1a; }
    .hdo-prog-fill { height: 100%; border-radius: var(--ep-r-pill); }
    .hdo-bar.nt .hdo-prog-fill { background: #22c55e; }
    .hdo-bar.vt .hdo-prog-fill { background: #ef4444; }
    .hdo-bar.unk { background: var(--ep-surface); border: 1px solid var(--ep-border); }
    .hdo-dot.unk { background: var(--ep-text-dim); }
    .hdo-bar.unk .hdo-label { color: var(--ep-text-mid); }
    .hdo-src-badge {
      font-size: var(--ep-fs-micro); font-weight: 600; text-transform: none; letter-spacing: 0;
      color: var(--ep-text-dim); background: rgba(127,127,127,.15);
      border-radius: var(--ep-r-sm); padding: 1px 5px; margin-left: 6px; vertical-align: middle;
    }
    .hdo-mismatch {
      font-size: var(--ep-fs-meta); margin-top: 6px; color: var(--warning-color, #f59e0b);
      display: flex; align-items: center; gap: 4px;
    }
    .hdo-cd { text-align: right; flex-shrink: 0; }
    .hdo-cd-lbl { font-size: var(--ep-fs-micro); text-transform: uppercase; letter-spacing: .6px; color: var(--ep-text-dim); margin-bottom: 4px; }
    .hdo-cd-val { font-size: var(--ep-fs-hero); font-weight: 600; line-height: 1; letter-spacing: -0.4px; font-variant-numeric: tabular-nums; }
    .hdo-bar.nt .hdo-cd-val { color: #22c55e; }
    .hdo-bar.vt .hdo-cd-val { color: #ef4444; }

    .schedule-block { background: var(--ep-surface); border-radius: var(--ep-r-md); padding: 12px; margin-bottom: 12px; border: 1px solid var(--ep-border); }
    .schedule-title { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; cursor: pointer; user-select: none; flex-wrap: wrap; }
    .schedule-title:hover { opacity: .85; }
    .schedule-when { font-size: var(--ep-fs-micro); font-weight: 600; text-transform: uppercase; letter-spacing: .8px; color: var(--ep-text-mid); }
    .schedule-day { font-size: var(--ep-fs-micro); font-weight: 500; padding: 2px 8px; border-radius: var(--ep-r-pill); background: var(--ep-badge-bg); color: var(--ep-badge-fg); text-transform: capitalize; }
    .schedule-nav { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }
    .nt-remaining { font-size: var(--ep-fs-meta); color: var(--ep-text-dim); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .nt-remaining-inline { font-size: var(--ep-fs-meta); color: var(--ep-text-dim); margin-left: 4px; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .sday-btn { font-size: var(--ep-fs-micro); padding: 3px 10px; border-radius: var(--ep-r-pill); border: 1px solid var(--ep-border2); background: transparent; color: var(--ep-accent); cursor: pointer; white-space: nowrap; font-weight: 500; }
    .sday-btn:hover { background: var(--ep-accent-bg); }
    .schedule-chevron { --mdc-icon-size: 15px; color: var(--ep-text-dim); flex-shrink: 0; }
    .schedule-rows { display: flex; flex-direction: column; gap: 1px; margin-top: 8px; }
    .srow { display: grid; grid-template-columns: 26px minmax(0,100px) 1fr auto; align-items: center; gap: 8px; padding: 5px 6px; border-radius: var(--ep-r-sm); transition: opacity .2s; }
    .srow.past { opacity: .32; }
    .srow.future { opacity: .62; }
    .srow.active.nt { background: rgba(34,197,94,.09); }
    .srow.active.vt { background: rgba(239,68,68,.09); }
    .srow.future.nt { background: rgba(34,197,94,.04); }
    .stariff { font-size: var(--ep-fs-micro); font-weight: 700; letter-spacing: .3px; padding: 1px 4px; border-radius: var(--ep-r-sm); text-align: center; }
    .stariff.nt { background: rgba(34,197,94,.16); color: #22c55e; }
    .stariff.vt { background: rgba(239,68,68,.14); color: #ef4444; }
    .srow-time { font-size: var(--ep-fs-meta); font-weight: 500; color: var(--ep-text-mid); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
    .srow-track { height: 3px; background: var(--ep-border); border-radius: var(--ep-r-pill); overflow: hidden; }
    .srow-fill { height: 100%; border-radius: var(--ep-r-pill); transition: width 1s ease; }
    .srow-fill.nt { background: #22c55e; }
    .srow-fill.vt { background: #ef4444; }
    .snow { font-size: var(--ep-fs-micro); text-transform: uppercase; letter-spacing: .6px; font-weight: 700; padding: 2px 7px; border-radius: var(--ep-r-pill); white-space: nowrap; }
    .snow.nt { background: rgba(34,197,94,.16); color: #22c55e; }
    .snow.vt { background: rgba(239,68,68,.14); color: #ef4444; }
    .sdur { font-size: var(--ep-fs-micro); color: var(--ep-text-dim); white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }

    .sblock-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
    /* Design pass (2026-08-12): the inactive tab used to be bare text with no
       border — nothing distinguished it from a plain label, so it didn't read
       as clickable until hovered. A resting border (removed only once active,
       where the filled background already signals state) fixes that without
       adding a second accent colour. */
    .sblock-tab { flex: 1; text-align: center; font-size: var(--ep-fs-micro); font-weight: 600; text-transform: uppercase; letter-spacing: .8px; padding: 6px 0; border-radius: var(--ep-r-sm); border: 1px solid var(--ep-border); color: var(--ep-text-dim); cursor: pointer; user-select: none; }
    .sblock-tab:hover { color: var(--ep-text-mid); border-color: var(--ep-border2); }
    .sblock-tab.active { background: var(--ep-accent-bg); border-color: transparent; color: var(--ep-accent); }

    .cost-pills { display: flex; gap: 6px; margin-bottom: 12px; }
    .cost-pill { font-size: var(--ep-fs-micro); padding: 4px 11px; border-radius: var(--ep-r-pill); border: 1px solid var(--ep-border2); background: transparent; color: var(--ep-accent); cursor: pointer; white-space: nowrap; font-weight: 500; }
    .cost-pill:hover { background: var(--ep-accent-bg); }
    .cost-pill.active { background: var(--ep-accent-bg); border-color: transparent; }
    .cost-stack { display: flex; height: 6px; border-radius: var(--ep-r-pill); overflow: hidden; margin-bottom: 8px; }
    .cost-seg.nt { background: #22c55e; }
    .cost-seg.vt { background: #ef4444; }
    .cost-legend { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 2px 10px; font-size: var(--ep-fs-meta); color: var(--ep-text-mid); font-variant-numeric: tabular-nums; }
    .cost-leg.nt { color: #22c55e; }
    .cost-leg.vt { color: #ef4444; }
    .cost-total { font-size: var(--ep-fs-hero); font-weight: 600; color: var(--ep-text); margin: 12px 0 2px; letter-spacing: -0.6px; font-variant-numeric: tabular-nums; }
    .cost-est { font-size: var(--ep-fs-meta); color: var(--ep-text-dim); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--ep-border); }
    .cost-empty { font-size: var(--ep-fs-meta); color: var(--ep-text-dim); text-align: center; padding: 12px 0; }

    .timeline-bar { display: flex; height: 6px; border-radius: var(--ep-r-pill); overflow: hidden; margin-bottom: 12px; gap: 1px; position: relative; }
    .tl-seg { border-radius: 1px; transition: opacity .3s; }
    .tl-seg.nt { background: #22c55e; }
    .tl-seg.vt { background: rgba(239,68,68,.35); }
    .tl-seg.past { opacity: .32; }
    .tl-seg.active.nt { box-shadow: 0 0 4px rgba(34,197,94,.5); }
    .tl-seg.active.vt { background: #ef4444; }
    /* follow_theme fix: was #fff with black side-borders, i.e. inverted and
       near-invisible on a light HA theme. The marker now takes the theme's
       text colour and separates itself from the coloured track with a ring in
       the card background instead of hardcoded black. */
    .timeline-now { position: absolute; top: -2px; bottom: -2px; width: 3px; background: var(--ep-text); border-radius: var(--ep-r-pill); pointer-events: none; box-shadow: 0 0 0 1.5px var(--ep-bg); }

    .section-label { font-size: var(--ep-fs-micro); text-transform: uppercase; letter-spacing: .9px; font-weight: 600; color: var(--ep-text-dim); margin: 20px 0 8px; padding-left: 8px; border-left: 2px solid var(--ep-border2); }

    /* Nejvyšší elevace v kartě: stín místo okraje. Dřív měl hlavní měřič
       identický kontejner jako okruh i jistič (stejný povrch, okraj, radius
       i padding), takže hierarchii nesl jen textový .section-label. */
    .ep-meter { background: var(--ep-surface); border-radius: var(--ep-r-md); padding: 16px; margin-bottom: 12px; border: none; box-shadow: var(--ep-shadow); }
    .meter-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .meter-icon { width: 32px; height: 32px; border-radius: var(--ep-r-md); background: var(--ep-accent-bg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .meter-icon ha-icon { --mdc-icon-size: 18px; color: var(--ep-accent); }
    .meter-title-wrap { display: flex; align-items: center; gap: 6px; flex: 1; }
    .meter-title { font-size: var(--ep-fs-micro); font-weight: 600; text-transform: uppercase; letter-spacing: .9px; color: var(--ep-text-mid); }
    .meter-total { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
    .phases-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
    .phase-cell { background: var(--ep-surface-2); border-radius: var(--ep-r-md); padding: 10px 12px; border: 1px solid var(--ep-border); }
    .circuit-spark-wrap { background: var(--ep-surface-2); border-radius: var(--ep-r-md); padding: 8px 10px; border: 1px solid var(--ep-border); margin-top: 8px; }
    .phase-label { font-size: var(--ep-fs-micro); color: var(--ep-text-dim); font-weight: 600; letter-spacing: .6px; margin-bottom: 4px; }
    /* follow_theme fix: bylo #a0aec0, na bílé kartě kontrast ~1.9:1.
       Balíček B: povýšeno na --ep-fs-sub a --ep-text — je to primární hodnota
       fáze, ne popisek, a dřív byla tlumenější než metriky pod ní. */
    .phase-power { font-size: var(--ep-fs-sub); font-weight: 600; color: var(--ep-text); letter-spacing: -0.2px; font-variant-numeric: tabular-nums; }
    .phase-detail { font-size: var(--ep-fs-meta); color: var(--ep-text-dim); margin-top: 2px; font-variant-numeric: tabular-nums; }

    .circuit-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 8px; }
    @container (max-width: 480px) { .circuit-grid { grid-template-columns: 1fr; } }
    @container (max-width: 480px) { .phases-grid { gap: 4px; } }
    @container (max-width: 360px) { .phases-grid { grid-template-columns: 1fr; } }
    .three-phase-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }

    .circuit-card { background: var(--ep-surface); border-radius: var(--ep-r-md); padding: 12px 14px; border: 1px solid var(--ep-border); }
    /* Balíček A: .is-on mělo zelený levý okraj, ale stav už nesou stavová
       tečka i přepínač — tři signály pro jeden bit, a u kritického zapnutého
       okruhu se stejně jeden z nich ztrácel pod amber okrajem. Okraj teď
       znamená výhradně critical, takže je jednoznačný. Třída .is-on
       v DOM zůstává kvůli card-mod, jen už nic nekreslí. */
    .circuit-card.critical  { border-left: 2px solid #f59e0b; }
    .circuit-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .circuit-name { font-size: var(--ep-fs-body); font-weight: 500; color: var(--ep-text); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lock-icon { --mdc-icon-size: 14px; color: #f59e0b; flex-shrink: 0; }

    .three-phase-card { background: var(--ep-surface); border-radius: var(--ep-r-md); padding: 14px 16px; border: 1px solid var(--ep-border); }
    .three-phase-card.critical { border-left: 2px solid #f59e0b; }
    .tp-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .tp-title-row { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
    .tp-total { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; }
    .tp-footer { display: flex; justify-content: flex-end; margin-top: 12px; }

    .load-track { height: 3px; background: var(--ep-border); border-radius: var(--ep-r-pill); overflow: hidden; margin: 10px 0; }
    .load-fill { height: 100%; border-radius: var(--ep-r-pill); transition: width 1s ease; }
    .load-fill.overload { animation: ep-overload 1s ease-in-out infinite; }
    @keyframes ep-overload {
      0%, 100% { opacity: 1; }
      50%      { opacity: .45; }
    }

    .circuit-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 6px; }
    .metrics { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .metric-primary { font-size: var(--ep-fs-hero); font-weight: 600; color: var(--ep-text); line-height: 1; letter-spacing: -0.6px; font-variant-numeric: tabular-nums; }
    .metric-primary.inactive { color: var(--ep-text-faint); }
    .metric-small { font-size: var(--ep-fs-meta); color: var(--ep-text-dim); display: flex; flex-wrap: wrap; align-items: center; gap: 1px 2px; margin-top: 3px; font-variant-numeric: tabular-nums; }
    .metric-sep { opacity: .4; margin: 0 1px; }
    /* Design pass (2026-08-12): was #f59e0b, same amber as the age-badge's
       "stale data" warning colour (_ageBadge, age_warn_color) — the two had
       no relation to each other but looked like the same signal next to each
       other on a circuit card. Reusing --ep-accent keeps cost visually
       distinct from staleness warnings without inventing a third hue. */
    .cost-rate { color: var(--ep-accent); font-weight: 600; }

    .badge { font-size: var(--ep-fs-micro); padding: 2px 6px; border-radius: var(--ep-r-sm); font-weight: 600; flex-shrink: 0; letter-spacing: .3px; }
    .badge-info  { background: var(--ep-badge-bg); color: var(--ep-badge-fg); }
    .badge-phase { background: var(--ep-badge-bg); color: var(--ep-badge-fg); }

    .toggle { width: 34px; height: 20px; border-radius: var(--ep-r-pill); border: none; cursor: pointer; position: relative; flex-shrink: 0; transition: background .2s; }
    .toggle::after { content: ''; position: absolute; top: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.4); transition: left .2s; }
    /* Balíček A: stav spínače byl zelený jako nízký tarif, takže "zapnuto" a
       "teď je levný proud" na kartě splývaly. Zapnuto je interakce, ne tarif. */
    .toggle.on  { background: var(--ep-accent); }
    .toggle.on::after  { left: 17px; }
    .toggle.off { background: var(--ep-text-faint); }
    .toggle.off::after { left: 3px; }
    .toggle.sm  { width: 28px; height: 16px; }
    .toggle.sm::after { width: 11px; height: 11px; top: 2.5px; }
    .toggle.sm.on::after  { left: 14px; }
    .toggle.sm.off::after { left: 3px; }

    .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; transition: box-shadow .3s; }
    .status-dot.on  { background: var(--ep-accent); box-shadow: 0 0 0 2.5px var(--ep-accent-bg); }
    .status-dot.off { background: var(--ep-text-faint); }
    .status-dot.none { background: transparent; border: 1px solid var(--ep-text-faint); }
    .status-dot.sm  { width: 6px; height: 6px; }

    .expand-btn { display: flex; align-items: center; gap: 4px; background: transparent; border: 1px solid var(--ep-border2); border-radius: var(--ep-r-sm); cursor: pointer; color: var(--ep-text-mid); padding: 3px 8px; flex-shrink: 0; }
    .expand-btn:hover { background: var(--ep-accent-bg); }
    .expand-btn ha-icon { --mdc-icon-size: 14px; }
    .expand-btn span { font-size: var(--ep-fs-micro); }

    .tp-devices-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ep-border); }
    .devices-list { display: flex; flex-direction: column; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ep-border); }
    .tp-device-col { min-width: 0; }
    .tp-device-col .device-group-label { padding-left: 0; }
    .tp-device-col .device-row { padding-left: 0; }
    .device-group { margin-bottom: 8px; }
    .device-group-label { display: flex; justify-content: space-between; align-items: center; font-size: var(--ep-fs-micro); font-weight: 600; text-transform: uppercase; letter-spacing: .8px; color: var(--ep-text-dim); margin-bottom: 4px; padding-left: 14px; }
    .ch-sum { font-size: var(--ep-fs-micro); font-weight: 600; color: var(--ep-accent); letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }
    .device-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--ep-border); }
    .device-row:last-child { border-bottom: none; }
    .device-row.channel { padding-left: 8px; }
    .device-name { flex: 1; font-size: var(--ep-fs-body); color: var(--ep-text-mid); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .device-metrics { font-size: var(--ep-fs-meta); color: var(--ep-text-dim); white-space: nowrap; flex-shrink: 0; font-variant-numeric: tabular-nums; }
    .note-row { opacity: .6; }
    .note-icon { --mdc-icon-size: 12px; color: var(--ep-text-dim); flex-shrink: 0; }
    .note-row .device-name { font-style: italic; }

    .sparkline-wrap { position: relative; display: flex; align-items: stretch; width: 100%; height: 38px; margin-top: 8px; }
    .sparkline { flex: 1; min-width: 0; display: block; overflow: visible; cursor: crosshair; }
    .spark-lbls { width: 44px; flex-shrink: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 1px 2px; pointer-events: none; }
    .spark-lbls-left { align-items: flex-start; }
    .spark-lbls-right { align-items: flex-end; }
    /* follow_theme fix: these were rgba(255,255,255,…) — invisible on a light
       theme. The --ep-bg halo stays; it is what keeps them legible on top of
       the graph in either theme. */
    .spark-lbl-max { font-size: var(--ep-fs-micro); color: var(--ep-text-mid); text-shadow: 0 0 3px var(--ep-bg), 0 0 3px var(--ep-bg); white-space: nowrap; font-family: inherit; font-variant-numeric: tabular-nums; }
    .spark-lbl-min { font-size: var(--ep-fs-micro); color: var(--ep-text-dim); text-shadow: 0 0 3px var(--ep-bg), 0 0 3px var(--ep-bg); white-space: nowrap; font-family: inherit; font-variant-numeric: tabular-nums; }
    .spark-ref { stroke-width: 1px; stroke-dasharray: 3 3; }
    .spark-hidden { display: none; }
    .spark-hover-line { stroke: var(--ep-text-dim); stroke-width: .5; pointer-events: none; }
    .spark-hover-dot { pointer-events: none; }
    .spark-tooltip {
      position: absolute; top: -2px; transform: translate(-50%, -100%);
      background: var(--ep-surface); border: 1px solid var(--ep-border);
      border-radius: var(--ep-r-sm); padding: 3px 7px; font-size: var(--ep-fs-micro); color: var(--ep-text-mid);
      white-space: nowrap; pointer-events: none; visibility: hidden; z-index: 1;
      font-variant-numeric: tabular-nums; box-shadow: var(--ep-shadow);
    }
    .spark-win-switch { display: flex; gap: 4px; margin: 10px 0 4px; }
    .spark-win-btn {
      flex: 1; font-size: var(--ep-fs-micro); font-weight: 500; padding: 4px 0; border-radius: var(--ep-r-sm); cursor: pointer;
      background: transparent; border: 1px solid var(--ep-border); color: var(--ep-text-dim);
    }
    .spark-win-btn.active { background: var(--ep-accent-bg); border-color: transparent; color: var(--ep-accent); }
    .age-badge { font-size: var(--ep-fs-micro); font-variant-numeric: tabular-nums; }

    /* Balíček A: amber je vyhrazený varováním (zastaralá data, přetížení,
       critical). Tip "za chvíli bude NT" je informace, ne varování. */
    .nt-hint { display: flex; align-items: center; gap: 4px; font-size: var(--ep-fs-micro); color: var(--ep-accent); opacity: .9; margin-top: 8px; }
    .nt-hint ha-icon { --mdc-icon-size: 12px; }

    .clickable { cursor: pointer; }
    .clickable:hover { opacity: .8; }

    /* ══ view: panel — DIN rail (ROADMAP 5.4) ══════════════════════════════ */

    /* Shadow DOM nedědí box-sizing ze stránky a classic layout je postavený
       na content-boxu, takže se to nedá zapnout globálně bez přepočítání
       všech dosavadních výšek. Panel view si ho zapíná jen pro svůj podstrom,
       kde na něm stojí pevná výška modulu. */
    .rail-wrap, .rail-wrap *, .rail-wrap *::before, .rail-wrap *::after,
    .day-timeline, .day-timeline * { box-sizing: border-box; }

    .day-timeline { background: var(--ep-surface); border: 1px solid var(--ep-border);
      border-radius: var(--ep-r-md); padding: 12px; margin-bottom: 12px; box-shadow: var(--ep-shadow); }
    .day-timeline .timeline-bar { margin-bottom: 0; }
    .day-timeline-foot { font-size: var(--ep-fs-micro); color: var(--ep-text-dim);
      text-align: right; margin-top: 8px; font-variant-numeric: tabular-nums; }

    .rail-wrap { background: var(--ep-surface); border-radius: var(--ep-r-md);
      padding: 16px; margin-bottom: 12px; box-shadow: var(--ep-shadow); }
    .rail-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .rail-lbl { font-size: var(--ep-fs-micro); text-transform: uppercase; letter-spacing: .9px;
      font-weight: 600; color: var(--ep-text-dim); }
    .rail-val { font-size: var(--ep-fs-hero); font-weight: 600; letter-spacing: -0.6px;
      color: var(--ep-text); font-variant-numeric: tabular-nums; }
    .rail-sub { font-size: var(--ep-fs-meta); color: var(--ep-text-dim); text-align: right;
      font-variant-numeric: tabular-nums; line-height: 1.5; }

    /* Přípojnice — proud teče shora do lišty. Tarifní barva, protože to je
       jediné místo v panel view, kde se dá říct "tohle teď teče levně". */
    .busbar { height: 6px; border-radius: var(--ep-r-pill); position: relative; overflow: hidden; }
    .busbar.nt { background: rgba(34,197,94,.18); }
    .busbar.vt { background: rgba(239,68,68,.16); }
    .busbar::after { content: ''; position: absolute; inset: 0;
      background: repeating-linear-gradient(90deg, transparent 0 14px,
        currentColor 20px 30px, transparent 36px 50px);
      animation: ep-bus 2.1s linear infinite; }
    .busbar.nt::after { color: rgba(34,197,94,.55); }
    .busbar.vt::after { color: rgba(239,68,68,.5); }
    @keyframes ep-bus { to { transform: translateX(50px); } }
    @media (prefers-reduced-motion: reduce) { .busbar::after { animation: none; } }
    .busbar-note { font-size: var(--ep-fs-micro); color: var(--ep-text-dim);
      text-align: right; margin: 6px 0 10px; }

    /* Lišta: kovový profil s hranami nahoře a dole. */
    .rail { position: relative; padding: 13px 8px 9px; margin-bottom: 9px; border-radius: 5px;
      background: linear-gradient(180deg,
        var(--ep-metal-edge) 0 3px, var(--ep-metal-a) 3px 9px,
        var(--ep-metal-b) 9px calc(100% - 9px),
        var(--ep-metal-a) calc(100% - 9px) calc(100% - 3px),
        var(--ep-metal-edge) calc(100% - 3px) 100%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06), inset 0 -1px 0 rgba(0,0,0,.3); }
    .rail:last-of-type { margin-bottom: 0; }
    .rail-mods { display: flex; gap: 3px; }
    /* Neobsazené pozice na poslední liště. Bez nich by flex roztáhl poslední
       modul přes celou šířku a moduly by na každé liště měly jinou velikost —
       reálný rozvaděč má naopak modul vždy stejně široký a lištu dojetou. */
    .rail-gap { flex-grow: 0; flex-shrink: 1; }

    /* Modul jističe. V tmavém tématu antracitový (takové jističe reálně
       existují), ve světlém klasicky bílý — identitu nese tvar, páčka
       a číslování, ne barva plastu. */
    .mod { flex: 1 1 0; min-width: 34px; cursor: pointer; border-radius: 3px; overflow: hidden;
      background: linear-gradient(180deg, var(--ep-mod-a), var(--ep-mod-b)); position: relative;
      box-shadow: 0 1px 3px rgba(0,0,0,.45); transition: transform .12s, box-shadow .12s; }
    .mod.w3 { flex: 3 3 0; }
    .mod:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,.5); }
    .mod:focus-visible { outline: 2px solid var(--ep-accent); outline-offset: 2px; }
    .mod.pick { outline: 2px solid var(--ep-accent); outline-offset: 1px; }
    .mod-lever { height: 24px; display: flex; align-items: center; justify-content: center; gap: 4px;
      background: var(--ep-mod-chrome); border-bottom: 1px solid rgba(0,0,0,.3); }
    /* Červená páčka = zapnuto je konvence evropských jističů (červené pole
       znamená "pod napětím") a je to vědomá výjimka z pravidla balíčku A
       "červená = vysoký tarif". Nepřebarvovat. */
    .lv { width: 12px; height: 16px; border-radius: 2px; transition: all .18s; }
    .mod.on  .lv { background: #d4423c; box-shadow: inset 0 6px 0 rgba(0,0,0,.2); }
    .mod.off .lv { background: #5b6473; box-shadow: inset 0 -6px 0 rgba(0,0,0,.28); }
    .mod-face { position: relative; height: 66px; padding: 6px 4px 4px; overflow: hidden; }
    .mod-spark { position: absolute; left: 0; right: 0; bottom: 0; height: 22px; width: 100%;
      color: var(--ep-mod-dim); opacity: .4; pointer-events: none; }
    .mod.off .mod-spark { opacity: .18; }
    /* Hladina zatížení — barevná náplň s výraznou hladinou nahoře. */
    .mod-fill { position: absolute; left: 0; right: 0; bottom: 0; transition: height .4s;
      background: linear-gradient(180deg, transparent, var(--ep-fillc));
      opacity: .35; border-top: 1.5px solid var(--ep-fillc); }
    .mod.off .mod-fill { display: none; }
    .mod-pin { position: absolute; top: 2px; left: 3px; width: 5px; height: 5px; border-radius: 50%;
      background: var(--ep-accent); box-shadow: 0 0 0 2px var(--ep-mod-chrome); }
    .mod-w { position: relative; font-size: 10px; font-weight: 700; color: var(--ep-mod-text);
      text-align: center; font-variant-numeric: tabular-nums; letter-spacing: -0.2px; }
    .mod-nm { position: relative; font-size: 8.5px; line-height: 1.25; color: var(--ep-mod-dim);
      overflow: hidden; text-align: center; margin-top: 3px; max-height: 22px; word-break: break-word;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .mod.off .mod-w, .mod.off .mod-nm { opacity: .45; }
    .mod-lock { --mdc-icon-size: 12px; color: var(--warning-color, #f59e0b); display: flex; }
    .mod-foot { display: flex; align-items: center; justify-content: space-between; gap: 3px;
      padding: 3px 5px 4px; background: var(--ep-mod-chrome); }
    .mod-num { font-size: 9px; font-weight: 700; color: var(--ep-mod-dim); font-variant-numeric: tabular-nums; }
    .mod-ph { font-size: 8px; font-weight: 700; letter-spacing: .3px; }
    .mod-ph.l1 { color: var(--ep-l1); }
    .mod-ph.l2 { color: var(--ep-l2); }
    .mod-ph.l3 { color: var(--ep-l3); }
    .mod-ph.l3f { color: var(--ep-mod-dim); }
    .mod-strip { height: 3px; }
    .mod-strip.l1 { background: var(--ep-l1); }
    .mod-strip.l2 { background: var(--ep-l2); }
    .mod-strip.l3 { background: var(--ep-l3); }
    .mod-strip.l3f { background: linear-gradient(90deg,
      var(--ep-l1) 33%, var(--ep-l2) 33% 66%, var(--ep-l3) 66%); }
    .mod-strip.none { background: var(--ep-mod-chrome); }
    .mod.off .mod-strip { opacity: .3; }

    /* ── detail pod lištou ── */
    .rail-detail { margin-top: 12px; border-radius: var(--ep-r-md); border: 1px solid var(--ep-border);
      background: var(--ep-surface-2); padding: 12px 14px; }
    .rd-hint { font-size: var(--ep-fs-micro); color: var(--ep-text-dim); text-align: center;
      padding: 8px 0; line-height: 1.7; }
    .rd-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .rd-num { font-size: var(--ep-fs-micro); font-weight: 700; padding: 2px 6px;
      border-radius: var(--ep-r-sm); background: var(--ep-accent-bg); color: var(--ep-accent);
      font-variant-numeric: tabular-nums; }
    .rd-name { font-size: var(--ep-fs-body); font-weight: 500; flex: 1; color: var(--ep-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rd-val { font-size: var(--ep-fs-hero); font-weight: 600; letter-spacing: -0.6px;
      color: var(--ep-text); line-height: 1; font-variant-numeric: tabular-nums; }
    .rd-meta { font-size: var(--ep-fs-meta); color: var(--ep-text-dim); margin-top: 4px;
      font-variant-numeric: tabular-nums; }
    .rd-graph { margin-top: 8px; }
    .rd-graph .sparkline-wrap { height: 74px; }

    .g-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .g-spacer { flex: 1; }
    .g-btn { font: inherit; font-size: var(--ep-fs-micro); font-weight: 500; padding: 4px 10px;
      border: 1px solid var(--ep-border2); border-radius: var(--ep-r-sm); background: transparent;
      color: var(--ep-text-dim); cursor: pointer; }
    .g-btn:hover { background: var(--ep-accent-bg); color: var(--ep-accent); }
    .g-chk { display: flex; align-items: center; gap: 6px; font: inherit;
      font-size: var(--ep-fs-micro); color: var(--ep-text-dim); cursor: pointer;
      background: none; border: none; padding: 0; }
    .g-chk .box { width: 26px; height: 15px; border-radius: var(--ep-r-pill);
      background: var(--ep-text-faint); position: relative; transition: background .18s; }
    .g-chk .box::after { content: ''; position: absolute; top: 2.5px; left: 2.5px;
      width: 10px; height: 10px; border-radius: 50%; background: #fff; transition: left .18s; }
    .g-chk.on { color: var(--ep-accent); }
    .g-chk.on .box { background: var(--ep-accent); }
    .g-chk.on .box::after { left: 13.5px; }
    .spark-win-switch.inline { margin: 0; flex: 0 0 auto; width: auto; gap: 3px; }
    .spark-win-switch.inline .spark-win-btn { flex: 0 0 auto; padding: 4px 10px; }

    /* ── 3f detail: L1/L2/L3 vedle sebe na společném měřítku ── */
    .ph3-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-top: 8px; }
    @container (max-width: 520px) { .ph3-grid { grid-template-columns: 1fr; } }
    .ph3-cell { background: var(--ep-bg); border: 1px solid var(--ep-border);
      border-radius: var(--ep-r-md); padding: 9px 10px; position: relative; overflow: hidden; }
    .ph3-cell::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
    .ph3-cell.l1::before { background: var(--ep-l1); }
    .ph3-cell.l2::before { background: var(--ep-l2); }
    .ph3-cell.l3::before { background: var(--ep-l3); }
    .ph3-head { display: flex; align-items: baseline; justify-content: space-between; }
    .ph3-lbl { font-size: var(--ep-fs-micro); font-weight: 700; letter-spacing: .9px; }
    .ph3-cell.l1 .ph3-lbl { color: var(--ep-l1); }
    .ph3-cell.l2 .ph3-lbl { color: var(--ep-l2); }
    .ph3-cell.l3 .ph3-lbl { color: var(--ep-l3); }
    .ph3-pct { font-size: var(--ep-fs-micro); color: var(--ep-text-dim); font-variant-numeric: tabular-nums; }
    .ph3-val { font-size: var(--ep-fs-sub); font-weight: 600; letter-spacing: -0.3px;
      margin-top: 1px; color: var(--ep-text); font-variant-numeric: tabular-nums; }
    .ph3-sub { font-size: var(--ep-fs-micro); color: var(--ep-text-dim); margin-top: 1px;
      font-variant-numeric: tabular-nums; }
    .ph3-track { height: 3px; background: var(--ep-border); border-radius: var(--ep-r-pill);
      overflow: hidden; margin: 7px 0 3px; }
    .ph3-track i { display: block; height: 100%; border-radius: var(--ep-r-pill); }
    .ph3-spark { width: 100%; height: 44px; display: block; overflow: hidden; }
    .ph3-note { font-size: var(--ep-fs-micro); color: var(--ep-text-dim); margin-top: 8px; text-align: center; }

    /* ── porovnání víc modulů ── */
    .cmp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .cmp-cell { background: var(--ep-bg); border: 1px solid var(--ep-border);
      border-radius: var(--ep-r-md); padding: 9px 10px; }
    .cmp-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; }
    .cmp-num { font-size: 9px; font-weight: 700; color: var(--ep-accent); font-variant-numeric: tabular-nums; }
    .cmp-name { font-size: var(--ep-fs-meta); color: var(--ep-text-mid); flex: 1;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cmp-val { font-size: var(--ep-fs-meta); font-weight: 600; color: var(--ep-text);
      font-variant-numeric: tabular-nums; }
    .cmp-scale { font-size: 9px; color: var(--ep-text-dim); margin-bottom: 2px;
      font-variant-numeric: tabular-nums; }
    .cmp-ph { font-weight: 700; color: var(--ep-text-mid); }
    .cmp-cell .ph3-spark { height: 48px; }
    .cmp-plain .sparkline-wrap { height: 48px; margin-top: 0; }

    /* ── zařízení za jističem ── */
    .dev-wrap { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ep-border); }
    .dev-title { font-size: var(--ep-fs-micro); text-transform: uppercase; letter-spacing: .9px;
      font-weight: 600; color: var(--ep-text-dim); margin-bottom: 6px; }
    .dev-empty { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ep-border);
      font-size: var(--ep-fs-micro); color: var(--ep-text-dim); text-align: center; }
  `;
}

(window as unknown as Record<string, unknown>)['customCards'] ??= [];
((window as unknown as Record<string, unknown[]>)['customCards']).push({
  type: 'electricity-panel-card',
  name: 'Electricity Panel Card',
  description: `Circuit breaker panel — power, current, daily energy, HDO tariff (v${EP_VERSION})`,
  preview: false,
});
console.info(`%c electricity-panel-card %c v${EP_VERSION} `, 'background:#22c55e;color:#fff;font-weight:bold', 'background:#1f2937;color:#22c55e');

