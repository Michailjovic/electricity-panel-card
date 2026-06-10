import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './electricity-panel-editor.js';
import { PRE_TARIFFS } from './tariff-presets.js';
import { EP_VERSION } from './types.js';
import { localize, resolveLang, type EpLang } from './localize.js';
import type {
  HomeAssistant,
  ElectricityPanelConfig,
  Circuit,
  CircuitDevice,
  DeviceChannel,
} from './types.js';

interface DaySlot {
  type: 'nt' | 'vt';
  label: string;
  isPast: boolean;
  isCurrent: boolean;
  pct: number;
  durMins: number;
  durStr: string;
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

  private _timer?: number;
  private _historyTimer?: number;
  private _refetchDebounce?: number;
  private _trackedIds: string[] = [];
  private _historyCache = new Map<string, Array<{t: number; v: number}>>();
  private _historyFetching = false;
  private _refetchQueued = false;
  /** Timestamp of the last successful history fetch — right edge of sparkline x-axis */
  private _historyWindowEnd = 0;
  /** Computed sparkline paths, keyed by entity_id; invalidated on new data / new window */
  private _sparkCache = new Map<string, {
    data: Array<{t: number; v: number}>;
    windowEnd: number;
    line: string;
    area: string;
    vMin: number;
    vMax: number;
  }>();

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

  private _lang(): EpLang {
    return resolveLang(this._config, this._hass);
  }

  private _t(key: string, vars?: Record<string, string>): string {
    return localize(this._lang(), key, vars);
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
    if (pct > 80) return 'var(--error-color, #ef4444)';
    if (pct > 55) return 'var(--warning-color, #f59e0b)';
    return 'var(--success-color, #22c55e)';
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
    const s = new Date(start.replace(' ', 'T')).getTime();
    const e = end ? new Date(end.replace(' ', 'T')).getTime() : s + 86400000;
    return s <= probe.getTime() && probe.getTime() < e;
  }

  private _dayType(): 'weekday' | 'weekend' | 'holiday' {
    if (this._isHolidayToday()) return 'holiday';
    const d = new Date().getDay();
    const isWeekendDay = d === 0 || d === 6;
    const ws = this._config.hdo?.workday_sensor;
    if (ws) {
      const st = this._state(ws);
      if (st === 'on') return 'weekday';
      // workday sensor explicitly off on a Mon–Fri → public holiday
      if (st === 'off') return isWeekendDay ? 'weekend' : 'holiday';
      // sensor unavailable → fall through to day-of-week
    }
    return isWeekendDay ? 'weekend' : 'weekday';
  }

  private _tomorrowDayType(): 'weekday' | 'weekend' | 'holiday' {
    if (this._isHolidayTomorrow()) return 'holiday';
    const d = (new Date().getDay() + 1) % 7;
    return (d === 0 || d === 6) ? 'weekend' : 'weekday';
  }

  /** Wall-clock "HH:MM" on the day starting at `base` — DST-safe
   *  (unlike base + minutes*60000 on 23/25-hour days). */
  private _slotTimeMs(base: number, hm: string): number {
    const [h, m] = hm.split(':').map(Number);
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }

  /** Midnight of the following day — DST-safe day end. */
  private _dayEndMs(base: number): number {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  private _ntRemainingMins(starts: string[], offsets: number[]): number {
    const now = Date.now();
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const base = midnight.getTime();
    const dayEnd = this._dayEndMs(base);
    let rem = 0;
    starts.forEach((s, i) => {
      const st = this._slotTimeMs(base, s);
      const en = Math.min(st + offsets[i] * 60000, dayEnd);
      if (en > st && now < en) rem += (en - Math.max(now, st)) / 60000;
    });
    return rem;
  }

  private _fmtMins(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
        : (this._config.age_ok_color ?? '#374151');
    return html`<span class="metric-sep">·</span><span class="age-badge" style="color:${color}">↻ ${label}</span>`;
  }

  // ── Full-day schedule builder ──────────────────────────────────────────────

  private _buildFullDaySlots(
    starts: string[],
    offsets: number[],
    base: number,
    showing: boolean
  ): DaySlot[] {
    const loc = this._lang() === 'cs' ? 'cs-CZ' : 'en-GB';
    const fmt = (ms: number) =>
      new Date(ms).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    const fmtDur = (m: number) =>
      m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
    const now = Date.now();
    const dayEnd = this._dayEndMs(base);

    // Clamp windows to the day end (midnight-crossing schedules) and sort —
    // unsorted starts would otherwise produce negative VT gaps.
    const ntWindows = starts
      .map((start, i) => {
        const s = this._slotTimeMs(base, start);
        return { s, e: Math.min(s + offsets[i] * 60000, dayEnd) };
      })
      .filter(w => w.e > w.s && w.s < dayEnd)
      .sort((a, b) => a.s - b.s);

    const makeSlot = (
      type: 'nt' | 'vt',
      slotStart: number,
      slotEnd: number,
      durMins: number
    ): DaySlot => {
      const isPast = !showing && now >= slotEnd;
      const isCurrent = !showing && now >= slotStart && now < slotEnd;
      const pct = isCurrent
        ? Math.min(100, ((now - slotStart) / (slotEnd - slotStart)) * 100)
        : isPast ? 100 : 0;
      return {
        type, label: `${fmt(slotStart)}–${fmt(slotEnd)}`,
        isPast, isCurrent, pct, durMins, durStr: fmtDur(durMins),
      };
    };

    const slots: DaySlot[] = [];
    let cursor = base;

    for (const nt of ntWindows) {
      const s = Math.max(nt.s, cursor); // overlap-safe
      if (s >= nt.e) continue;
      if (s > cursor) {
        slots.push(makeSlot('vt', cursor, s, Math.round((s - cursor) / 60000)));
      }
      slots.push(makeSlot('nt', s, nt.e, Math.round((nt.e - s) / 60000)));
      cursor = nt.e;
    }

    if (cursor < dayEnd) {
      slots.push(makeSlot('vt', cursor, dayEnd, Math.round((dayEnd - cursor) / 60000)));
    }

    return slots;
  }



  private _getCurrentSlotPct(): number {
    const hdo = this._config.hdo;
    if (!hdo) return -1;
    const preset = hdo.tariff_preset ? PRE_TARIFFS[hdo.tariff_preset] : undefined;
    const src = preset ?? hdo.schedule;
    if (!src) return -1;
    const dt = this._dayType();
    const day = (dt === 'holiday' && src.holiday) ? src.holiday
      : dt === 'weekend' ? src.weekend : src.weekday;
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const slots = this._buildFullDaySlots(day.starts, day.offsets, midnight.getTime(), false);
    const current = slots.find(s => s.isCurrent);
    return current ? current.pct : -1;
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
    const ids: string[] = [];
    for (const circ of cfg.circuits ?? []) {
      if (circ.phases === 3) {
        // Per-phase: sparklines always; cost only when no total entity exists
        if (spark3 || (hasPrices && !circ.power)) {
          [circ.power_l1, circ.power_l2, circ.power_l3].forEach(id => { if (id) ids.push(id); });
        }
        if (hasPrices && circ.power) ids.push(circ.power);
      } else if (circ.power && (spark1 || hasPrices)) {
        ids.push(circ.power);
      }
    }
    const mm = cfg.main_meter;
    if (mm && (sparkMm || hasPrices)) {
      [mm.power_l1, mm.power_l2, mm.power_l3].forEach(id => { if (id) ids.push(id); });
    }
    return [...new Set(ids)];
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
    const hours = this._config.graph_hours ?? 3;
    const nowMs = Date.now();
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    // Daily cost integrates since midnight — when prices are configured the
    // power history window must cover the whole day, not just graph_hours.
    const startMs = this._hasPrices()
      ? Math.min(nowMs - hours * 3_600_000, midnight.getTime())
      : nowMs - hours * 3_600_000;
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


  private _isNTAt(t: number): boolean {
    const hdo = this._config.hdo;
    if (!hdo) return false;
    // Use HDO switch history only for times within the recorded period.
    // For times before the first history entry the switch state is unknown
    // — fall through to the tariff schedule which is always authoritative.
    if (hdo.switch) {
      const hdoHist = this._historyCache.get(hdo.switch);
      if (hdoHist && hdoHist.length > 0 && t >= hdoHist[0].t) {
        let state = hdoHist[0].v;
        for (const pt of hdoHist) {
          if (pt.t <= t) state = pt.v;
          else break;
        }
        return state > 0.5; // 1 = on = NT
      }
    }
    // Tariff schedule — primary source for everything before first history entry
    const preset = hdo.tariff_preset ? PRE_TARIFFS[hdo.tariff_preset] : undefined;
    const src = preset ?? hdo.schedule;
    if (src) {
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      const dt = this._dayType();
      const day = (dt === 'holiday' && src.holiday) ? src.holiday
        : dt === 'weekend' ? src.weekend : src.weekday;
      return day.starts.some((start, i) => {
        const s = this._slotTimeMs(midnight.getTime(), start);
        return t >= s && t < s + day.offsets[i] * 60000;
      });
    }
    return this._isOn(hdo.switch);
  }

  /** Accumulate today's energy cost across one or more power entities (W).
   *  Entities are integrated independently and summed — correct for multi-phase
   *  circuits where each phase has its own history entity. */
  private _calcDailyCost(...entityIds: (string | undefined)[]): string {
    const hdo = this._config.hdo;
    if (!hdo || (!hdo.nt_price && !hdo.vt_price)) return '';
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const ntP = parseFloat(hdo.nt_price as unknown as string) || 0;
    const vtP = parseFloat(hdo.vt_price as unknown as string) || 0;
    let ntWh = 0, vtWh = 0, hasData = false;
    for (const id of entityIds) {
      if (!id) continue;
      const data = this._historyCache.get(id);
      if (!data || data.length < 2) continue;
      const todayPts = data.filter(p => p.t >= midnight.getTime());
      if (todayPts.length < 2) continue;
      hasData = true;
      for (let i = 1; i < todayPts.length; i++) {
        const dtMs = todayPts[i].t - todayPts[i - 1].t;
        // Clamp to consumption only — negative power (PV export) must not
        // produce negative cost.
        const avgW = Math.max(0, (todayPts[i].v + todayPts[i - 1].v) / 2);
        const wh = avgW * (dtMs / 3_600_000);
        const midT = (todayPts[i].t + todayPts[i - 1].t) / 2;
        if (this._isNTAt(midT)) ntWh += wh; else vtWh += wh;
      }
    }
    if (!hasData) return '';
    const cost = (ntWh / 1000) * ntP + (vtWh / 1000) * vtP;
    if (cost < 0.005) return '';
    const cur = hdo.currency ?? 'Kč';
    return `${cost.toFixed(2)} ${cur}`;
  }

  private _renderSparkline(entityId: string | undefined, noLabels = false): TemplateResult | typeof nothing {
    if (!entityId) return nothing;
    const data = this._historyCache.get(entityId);
    if (!data || data.length < 2) return nothing;
    const W = 100, H = 38, pad = 3;
    const color = this._config.sparkline_color ?? '#ef4444';
    const labelPos = this._config.sparkline_labels ?? 'left';
    const showRef = this._config.sparkline_ref_line ?? false;

    // Paths are cached per entity and recomputed only after a history fetch —
    // the 30 s countdown re-render no longer recalculates every SVG path.
    // The x-axis is anchored to [windowEnd − graph_hours, windowEnd] so all
    // sparklines share the same time scale and are visually comparable.
    let cached = this._sparkCache.get(entityId);
    if (!cached || cached.data !== data || cached.windowEnd !== this._historyWindowEnd) {
      const hours = this._config.graph_hours ?? 3;
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
      if (pts.length === 0) return nothing;
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
      cached = { data, windowEnd: this._historyWindowEnd, line, area, vMin, vMax };
      this._sparkCache.set(entityId, cached);
    }

    const gid = `sg_${entityId.replace(/[^a-z0-9]/gi, '_')}`;
    const yMax = pad.toFixed(1);
    const yMin = (H - pad).toFixed(1);
    const hideLabels = noLabels || labelPos === 'none';
    const refColor = this._config.sparkline_ref_color ?? 'rgba(255,255,255,0.35)';
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
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="sparkline">
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
        </svg>
        ${labelPos === 'right' ? lblEl : nothing}
      </div>`;
  }

  // ── Render: HDO schedule ───────────────────────────────────────────────────

  private _renderHdoSchedule(): TemplateResult | typeof nothing {
    const hdo = this._config.hdo;
    if (!hdo) return nothing;
    const preset = hdo.tariff_preset ? PRE_TARIFFS[hdo.tariff_preset] : undefined;
    const src = preset ?? hdo.schedule;
    if (!src) return nothing;

    const showing = this._showTomorrow;
    const dt = showing ? this._tomorrowDayType() : this._dayType();
    const day = (dt === 'holiday' && src.holiday) ? src.holiday
      : dt === 'weekend' ? src.weekend : src.weekday;

    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const base = showing ? this._dayEndMs(midnight.getTime()) : midnight.getTime();

    const slots = this._buildFullDaySlots(day.starts, day.offsets, base, showing);
    const remaining = showing ? null : this._ntRemainingMins(day.starts, day.offsets);
    const totalNT = day.offsets.reduce((a, b) => a + b, 0);

    const exp = this._scheduleExpanded;
    const currentSlot = slots.find(s => s.isCurrent);
    return html`
      <div class="schedule-block">
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
        ${this._renderTimeline(slots, !showing)}
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
      </div>
    `;
  }

  // ── Render: HDO bar ────────────────────────────────────────────────────────

  private _renderHdo(): TemplateResult | typeof nothing {
    const hdo = this._config.hdo;
    if (!hdo?.switch) return nothing;
    // Unavailable HDO switch must not masquerade as VT — show a neutral state
    if (!this._isAvail(hdo.switch)) {
      return html`
        <div class="hdo-bar unk">
          <div class="hdo-dot unk"></div>
          <div class="hdo-info">
            <div class="hdo-label">${this._t('hdo_unavailable')}</div>
          </div>
        </div>
      `;
    }
    const isNT = this._isOn(hdo.switch);
    const cd = this._hdoCountdown();
    const price = isNT ? hdo.nt_price : hdo.vt_price;
    const cur = hdo.currency ?? 'Kč';
    const slotPct = this._getCurrentSlotPct();
    return html`
      <div class="hdo-bar ${isNT ? 'nt' : 'vt'}">
        <div class="hdo-dot ${isNT ? 'nt' : 'vt'}"></div>
        <div class="hdo-info">
          <div class="hdo-label">${isNT ? this._t('nt_low') : this._t('vt_high')}</div>
          ${price ? html`<div class="hdo-sub">${price} ${cur}/kWh</div>` : nothing}
          ${slotPct >= 0 ? html`
            <div class="hdo-prog"><div class="hdo-prog-fill" style="width:${slotPct.toFixed(1)}%"></div></div>
          ` : nothing}
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
              ${m.energy_today ? html`${this._kwh(m.energy_today).toFixed(1)} ${this._t('kwh_today')}` : nothing}
              ${(() => { const cr = this._calcDailyCost(m.power_l1, m.power_l2, m.power_l3); return cr ? html`<span class="metric-sep">·</span><span class="cost-rate">${cr}</span>` : nothing; })()}
              ${m.voltage && voltage > 0 ? html`<span class="metric-sep">·</span>${voltage.toFixed(0)} V` : nothing}
              ${this._ageBadge(m.power_l1 ?? m.power_l2 ?? m.power_l3 ?? m.energy_today)}
            </span>
          </div>
        </div>
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
    const costRate = power > 0 ? this._calcDailyCost(c.power) : '';
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
              ${c.current ? html`${this._isAvail(c.current) ? current.toFixed(1) : '—'} A` : nothing}
              ${c.voltage ? html`<span class="metric-sep">·</span>${this._num(c.voltage).toFixed(0)} V` : nothing}
              ${energy > 0 ? html`<span class="metric-sep">·</span>${energy.toFixed(2)} kWh` : nothing}
              ${costRate ? html`<span class="metric-sep">·</span><span class="cost-rate">${costRate}</span>` : nothing}
              ${this._ageBadge(c.power ?? c.current ?? c.switch)}
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
          ? this._calcDailyCost(c.power)
          : this._calcDailyCost(c.power_l1, c.power_l2, c.power_l3))
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
              ${energy > 0 ? html`${energy.toFixed(2)} kWh` : nothing}
              ${costRate ? html`<span class="metric-sep">·</span><span class="cost-rate">${costRate}</span>` : nothing}
              ${this._ageBadge(c.power ?? c.power_l1 ?? c.current_l1 ?? c.switch)}
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

  // ── Main render ────────────────────────────────────────────────────────────

  render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;

    const circuits = this._config.circuits ?? [];
    const threePhase = circuits.filter(c => c.phases === 3);
    const singlePhase = circuits.filter(c => c.phases !== 3);

    return html`
      <ha-card class=${this._config.follow_theme ? 'theme-auto' : ''}>
        ${this._config.title
          ? html`<div class="card-header">${this._config.title}</div>`
          : nothing}
        <div class="card-content">
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
          ` : nothing}
        </div>
      </ha-card>
    `;
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  static styles = css`
    :host { display: block; container-type: inline-size; }
    ha-card {
      /* Built-in dark palette — overridden by .theme-auto below */
      --ep-bg: #111318;
      --ep-surface: #181c24;
      --ep-border: #252a35;
      --ep-border2: #1f2937;
      --ep-text: #e2e8f0;
      --ep-text-mid: #94a3b8;
      --ep-text-dim: #5d6a80;
      --ep-text-faint: #374151;
      --ep-accent: #6b7db3;
      --ep-accent-bg: #1e2435;
      --ep-badge-bg: #1e2a4a;
      --ep-badge-fg: #6b9bdb;
      background: var(--ep-bg);
      overflow: hidden;
    }
    /* follow_theme: true — map palette onto the active HA theme */
    ha-card.theme-auto {
      --ep-bg: var(--ha-card-background, var(--card-background-color, #fff));
      --ep-surface: var(--secondary-background-color, #f5f5f5);
      --ep-border: var(--divider-color, rgba(0,0,0,.12));
      --ep-border2: var(--divider-color, rgba(0,0,0,.12));
      --ep-text: var(--primary-text-color, #212121);
      --ep-text-mid: var(--secondary-text-color, #727272);
      --ep-text-dim: var(--secondary-text-color, #727272);
      --ep-text-faint: var(--disabled-text-color, #bdbdbd);
      --ep-accent: var(--primary-color, #03a9f4);
      --ep-accent-bg: rgba(33, 150, 243, 0.12);
      --ep-badge-bg: rgba(33, 150, 243, 0.12);
      --ep-badge-fg: var(--primary-color, #03a9f4);
    }
    ha-card.theme-auto .hdo-bar.nt { background: rgba(34,197,94,.08); border-color: rgba(34,197,94,.3); }
    ha-card.theme-auto .hdo-bar.vt { background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.3); }
    ha-card.theme-auto .hdo-bar.nt .hdo-sub,
    ha-card.theme-auto .hdo-bar.vt .hdo-sub { color: var(--ep-text-mid); }
    ha-card.theme-auto .hdo-bar.nt .hdo-prog,
    ha-card.theme-auto .hdo-bar.vt .hdo-prog { background: rgba(127,127,127,.18); }
    .card-header { padding: 16px 16px 0; font-size: 16px; font-weight: 500; letter-spacing: -0.2px; color: var(--ep-text); }
    .card-content { padding: 12px 12px 16px; }

    .hdo-bar { border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; }
    .hdo-bar.nt { background: #0f2318; border: 0.5px solid #1e4d30; }
    .hdo-bar.vt { background: #200f0f; border: 0.5px solid #4d1e1e; }
    .hdo-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .hdo-dot.nt { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.2); animation: hdo-pulse 2.5s ease-in-out infinite; }
    .hdo-dot.vt { background: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,.18); }
    @keyframes hdo-pulse {
      0%,100% { box-shadow: 0 0 0 3px rgba(34,197,94,.2); }
      50%      { box-shadow: 0 0 0 5px rgba(34,197,94,.07); }
    }
    .hdo-info { flex: 1; min-width: 0; }
    .hdo-label { font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: .5px; }
    .hdo-bar.nt .hdo-label { color: #22c55e; }
    .hdo-bar.vt .hdo-label { color: #ef4444; }
    .hdo-sub { font-size: 11px; margin-top: 1px; }
    .hdo-bar.nt .hdo-sub { color: #4b7a5e; }
    .hdo-bar.vt .hdo-sub { color: #7a4b4b; }
    .hdo-prog { height: 2px; border-radius: 1px; overflow: hidden; margin-top: 8px; }
    .hdo-bar.nt .hdo-prog { background: #1a2e20; }
    .hdo-bar.vt .hdo-prog { background: #2e1a1a; }
    .hdo-prog-fill { height: 100%; border-radius: 1px; }
    .hdo-bar.nt .hdo-prog-fill { background: #22c55e; }
    .hdo-bar.vt .hdo-prog-fill { background: #ef4444; }
    .hdo-bar.unk { background: var(--ep-surface); border: 0.5px solid var(--ep-border); }
    .hdo-dot.unk { background: var(--ep-text-dim); }
    .hdo-bar.unk .hdo-label { color: var(--ep-text-mid); }
    .hdo-cd { text-align: right; flex-shrink: 0; }
    .hdo-cd-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: var(--ep-text-dim); }
    .hdo-cd-val { font-size: 24px; font-weight: 500; line-height: 1; font-variant-numeric: tabular-nums; }
    .hdo-bar.nt .hdo-cd-val { color: #22c55e; }
    .hdo-bar.vt .hdo-cd-val { color: #ef4444; }

    .schedule-block { background: var(--ep-surface); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; border: 0.5px solid var(--ep-border); }
    .schedule-title { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; cursor: pointer; user-select: none; flex-wrap: wrap; }
    .schedule-title:hover { opacity: .85; }
    .schedule-when { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .7px; color: var(--ep-text-mid); }
    .schedule-day { font-size: 10px; padding: 1px 6px; border-radius: 12px; background: var(--ep-badge-bg); color: var(--ep-badge-fg); text-transform: capitalize; }
    .schedule-nav { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }
    .nt-remaining { font-size: 10px; color: var(--ep-text-dim); white-space: nowrap; }
    .nt-remaining-inline { font-size: 10px; color: var(--ep-text-dim); margin-left: 4px; white-space: nowrap; }
    .sday-btn { font-size: 10px; padding: 2px 8px; border-radius: 12px; border: 0.5px solid var(--ep-border); background: var(--ep-bg); color: var(--ep-accent); cursor: pointer; white-space: nowrap; font-weight: 500; }
    .sday-btn:hover { background: var(--ep-border); }
    .schedule-chevron { --mdc-icon-size: 15px; color: var(--ep-text-dim); flex-shrink: 0; }
    .schedule-rows { display: flex; flex-direction: column; gap: 1px; margin-top: 6px; }
    .srow { display: grid; grid-template-columns: 22px minmax(0,100px) 1fr auto; align-items: center; gap: 7px; padding: 4px 5px; border-radius: 5px; transition: opacity .2s; }
    .srow.past { opacity: .3; }
    .srow.future { opacity: .6; }
    .srow.active.nt { background: rgba(34,197,94,.07); }
    .srow.active.vt { background: rgba(239,68,68,.07); }
    .srow.future.nt { background: rgba(34,197,94,.03); }
    .stariff { font-size: 8px; font-weight: 800; letter-spacing: .4px; padding: 2px 4px; border-radius: 3px; text-align: center; }
    .stariff.nt { background: rgba(34,197,94,.15); color: #22c55e; }
    .stariff.vt { background: rgba(239,68,68,.12); color: #ef4444; }
    .srow-time { font-size: 11px; font-weight: 500; color: var(--ep-text-mid); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
    .srow-track { height: 3px; background: var(--ep-border); border-radius: 2px; overflow: hidden; }
    .srow-fill { height: 100%; border-radius: 2px; transition: width 1s ease; }
    .srow-fill.nt { background: #22c55e; }
    .srow-fill.vt { background: #ef4444; }
    .snow { font-size: 8px; text-transform: uppercase; letter-spacing: .8px; font-weight: 800; padding: 2px 5px; border-radius: 8px; white-space: nowrap; }
    .snow.nt { background: rgba(34,197,94,.15); color: #22c55e; }
    .snow.vt { background: rgba(239,68,68,.12); color: #ef4444; }
    .sdur { font-size: 10px; color: var(--ep-text-dim); white-space: nowrap; text-align: right; }

    .timeline-bar { display: flex; height: 4px; border-radius: 2px; overflow: hidden; margin-bottom: 8px; gap: 1px; position: relative; }
    .tl-seg { border-radius: 1px; transition: opacity .3s; }
    .tl-seg.nt { background: #22c55e; }
    .tl-seg.vt { background: rgba(239,68,68,.35); }
    .tl-seg.past { opacity: .3; }
    .tl-seg.active.nt { box-shadow: 0 0 4px rgba(34,197,94,.5); }
    .tl-seg.active.vt { background: #ef4444; }
    .timeline-now { position: absolute; top: -2px; bottom: -2px; width: 4px; background: #fff; border-radius: 2px; pointer-events: none; box-shadow: -1px 0 0 #000, 1px 0 0 #000; }

    .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: .7px; color: var(--ep-text-dim); margin: 12px 0 6px; padding-left: 7px; border-left: 2px solid var(--ep-border); }

    .ep-meter { background: var(--ep-surface); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; border: 0.5px solid var(--ep-border); }
    .meter-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .meter-icon { width: 28px; height: 28px; border-radius: 6px; background: var(--ep-accent-bg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .meter-icon ha-icon { --mdc-icon-size: 16px; color: var(--ep-accent); }
    .meter-title-wrap { display: flex; align-items: center; gap: 6px; flex: 1; }
    .meter-title { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .5px; color: var(--ep-accent); }
    .meter-total { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
    .phases-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; }
    .phase-cell { background: var(--ep-bg); border-radius: 6px; padding: 8px 10px; border: 0.5px solid var(--ep-border); }
    .circuit-spark-wrap { background: var(--ep-bg); border-radius: 6px; padding: 6px 10px; border: 0.5px solid var(--ep-border); margin-top: 6px; }
    .phase-label { font-size: 10px; color: var(--ep-text-dim); font-weight: 500; margin-bottom: 3px; }
    .phase-power { font-size: 14px; font-weight: 500; color: #a0aec0; }
    .phase-detail { font-size: 11px; color: var(--ep-text-dim); margin-top: 1px; }

    .circuit-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 8px; }
    @container (max-width: 480px) { .circuit-grid { grid-template-columns: 1fr; } }
    @container (max-width: 480px) { .phases-grid { gap: 4px; } }
    @container (max-width: 360px) { .phases-grid { grid-template-columns: 1fr; } }
    .three-phase-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }

    .circuit-card { background: var(--ep-surface); border-radius: 8px; padding: 12px 14px; border: 0.5px solid var(--ep-border); }
    .circuit-card.critical  { border-left: 2px solid #f59e0b; }
    .circuit-card.is-on     { border-left: 2px solid #22c55e; }
    .circuit-card.critical.is-on { border-left: 2px solid #f59e0b; }
    .circuit-header { display: flex; align-items: center; gap: 6px; margin-bottom: 1px; }
    .circuit-name { font-size: 12px; font-weight: 500; color: var(--ep-text-mid); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lock-icon { --mdc-icon-size: 14px; color: #f59e0b; flex-shrink: 0; }

    .three-phase-card { background: var(--ep-surface); border-radius: 8px; padding: 12px 14px; border: 0.5px solid var(--ep-border); }
    .three-phase-card.critical { border-left: 2px solid #f59e0b; }
    .three-phase-card.is-on    { border-left: 2px solid #22c55e; }
    .tp-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .tp-title-row { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
    .tp-total { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; }
    .tp-footer { display: flex; justify-content: flex-end; margin-top: 8px; }

    .load-track { height: 3px; background: var(--ep-border2); border-radius: 2px; overflow: hidden; margin: 7px 0; }
    .load-fill { height: 100%; border-radius: 2px; transition: width 1s ease; }
    .load-fill.overload { animation: ep-overload 1s ease-in-out infinite; }
    @keyframes ep-overload {
      0%, 100% { opacity: 1; }
      50%      { opacity: .45; }
    }

    .circuit-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 6px; }
    .metrics { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .metric-primary { font-size: 22px; font-weight: 500; color: var(--ep-text); line-height: 1; letter-spacing: -0.4px; }
    .metric-primary.inactive { color: var(--ep-text-faint); }
    .metric-small { font-size: 11px; color: var(--ep-text-dim); display: flex; flex-wrap: wrap; align-items: center; gap: 1px 2px; }
    .metric-sep { opacity: .4; margin: 0 1px; }
    .cost-rate { color: #f59e0b; font-weight: 500; }

    .badge { font-size: 9px; padding: 2px 5px; border-radius: 4px; font-weight: 500; flex-shrink: 0; letter-spacing: .3px; }
    .badge-info  { background: var(--ep-badge-bg); color: var(--ep-badge-fg); }
    .badge-phase { background: var(--ep-badge-bg); color: var(--ep-badge-fg); }

    .toggle { width: 32px; height: 18px; border-radius: 9px; border: none; cursor: pointer; position: relative; flex-shrink: 0; transition: background .2s; }
    .toggle::after { content: ''; position: absolute; top: 3px; width: 12px; height: 12px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.4); transition: left .2s; }
    .toggle.on  { background: #16a34a; }
    .toggle.on::after  { left: 17px; }
    .toggle.off { background: #374151; }
    .toggle.off::after { left: 3px; }
    .toggle.sm  { width: 28px; height: 16px; border-radius: 8px; }
    .toggle.sm::after { width: 10px; height: 10px; top: 3px; }
    .toggle.sm.on::after  { left: 15px; }
    .toggle.sm.off::after { left: 3px; }

    .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; transition: box-shadow .3s; }
    .status-dot.on  { background: #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,.2); }
    .status-dot.off { background: #374151; }
    .status-dot.none { background: transparent; border: 1px solid #374151; }
    .status-dot.sm  { width: 6px; height: 6px; }

    .expand-btn { display: flex; align-items: center; gap: 4px; background: var(--ep-bg); border: 0.5px solid var(--ep-border); border-radius: 5px; cursor: pointer; color: var(--ep-text-dim); padding: 2px 6px; flex-shrink: 0; }
    .expand-btn ha-icon { --mdc-icon-size: 14px; }
    .expand-btn span { font-size: 10px; }

    .tp-devices-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 0.5px solid var(--ep-border); }
    .devices-list { display: flex; flex-direction: column; margin-top: 8px; padding-top: 8px; border-top: 0.5px solid var(--ep-border); }
    .tp-device-col { min-width: 0; }
    .tp-device-col .device-group-label { padding-left: 0; }
    .tp-device-col .device-row { padding-left: 0; }
    .device-group { margin-bottom: 6px; }
    .device-group-label { display: flex; justify-content: space-between; align-items: center; font-size: 10px; text-transform: uppercase; letter-spacing: .7px; color: var(--ep-text-dim); margin-bottom: 4px; padding-left: 14px; }
    .ch-sum { font-size: 10px; font-weight: 500; color: var(--ep-accent); letter-spacing: 0; text-transform: none; }
    .device-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; border-bottom: 0.5px solid var(--ep-border2); }
    .device-row:last-child { border-bottom: none; }
    .device-row.channel { padding-left: 8px; }
    .device-name { flex: 1; font-size: 12px; color: var(--ep-text-mid); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .device-metrics { font-size: 11px; color: var(--ep-text-dim); white-space: nowrap; flex-shrink: 0; }
    .note-row { opacity: .6; }
    .note-icon { --mdc-icon-size: 12px; color: var(--ep-text-dim); flex-shrink: 0; }
    .note-row .device-name { font-style: italic; }

    .sparkline-wrap { display: flex; align-items: stretch; width: 100%; height: 38px; margin-top: 6px; }
    .sparkline { flex: 1; min-width: 0; display: block; overflow: visible; }
    .spark-lbls { width: 40px; flex-shrink: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 2px 2px; pointer-events: none; }
    .spark-lbls-left { align-items: flex-start; }
    .spark-lbls-right { align-items: flex-end; }
    .spark-lbl-max { font-size: 8px; color: rgba(255,255,255,.75); text-shadow: 0 0 3px var(--ep-bg), 0 0 3px var(--ep-bg); white-space: nowrap; font-family: inherit; }
    .spark-lbl-min { font-size: 8px; color: rgba(255,255,255,.45); text-shadow: 0 0 3px var(--ep-bg), 0 0 3px var(--ep-bg); white-space: nowrap; font-family: inherit; }
    .spark-ref { stroke-width: 1px; stroke-dasharray: 3 3; }
    .spark-hidden { display: none; }
    .age-badge { font-size: 10px; font-variant-numeric: tabular-nums; }

    .nt-hint { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #f59e0b; opacity: .85; margin-top: 6px; }
    .nt-hint ha-icon { --mdc-icon-size: 12px; }

    .clickable { cursor: pointer; }
    .clickable:hover { opacity: .8; }
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

