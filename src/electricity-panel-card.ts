import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './electricity-panel-editor.js';
import { PRE_TARIFFS } from './tariff-presets.js';
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
    if (!old) void this._fetchHistory();
    if (!old || !this._trackedIds.length ||
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
  private _trackedIds: string[] = [];
  private _historyCache = new Map<string, Array<{t: number; v: number}>>();
  private _historyFetching = false;

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
  }

  // ── HA card API ────────────────────────────────────────────────────────────

  setConfig(config: ElectricityPanelConfig): void {
    if (!config) throw new Error('Invalid configuration');
    this._config = config;
    this._trackedIds = this._buildTrackedIds();
    // Avoid clearing cache while a fetch is in progress (race condition)
    if (!this._historyFetching) this._historyCache.clear();
    void this._fetchHistory();
  }

  private _buildTrackedIds(): string[] {
    if (!this._config) return [];
    const ids: (string | undefined)[] = [];
    const hdo = this._config.hdo;
    if (hdo) ids.push(hdo.switch, hdo.next_high, hdo.next_low, hdo.workday_sensor);
    const mm = this._config.main_meter;
    if (mm) ids.push(mm.power_l1, mm.power_l2, mm.power_l3,
                     mm.current_l1, mm.current_l2, mm.current_l3, mm.energy_today);
    for (const c of this._config.circuits ?? []) {
      ids.push(c.switch, c.power, c.current, c.energy, c.voltage,
               c.power_l1, c.power_l2, c.power_l3, c.current_l1, c.current_l2, c.current_l3);
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
    return 4 + Math.ceil((this._config.circuits?.length ?? 0) / 2);
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

  private _toggle(entityId: string): void {
    const svc = this._isOn(entityId) ? 'turn_off' : 'turn_on';
    this.hass.callService('switch', svc, { entity_id: entityId });
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
    if (diff <= 0) return 'switching…';
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
  }

  private _dayType(): 'weekday' | 'weekend' | 'holiday' {
    const isWorkday = this._isOn(this._config.hdo?.workday_sensor);
    const d = new Date().getDay();
    if (isWorkday) return 'weekday';
    if (d === 0 || d === 6) return 'weekend';
    return 'holiday';
  }

  private _tomorrowDayType(): 'weekday' | 'weekend' {
    const d = (new Date().getDay() + 1) % 7;
    return (d === 0 || d === 6) ? 'weekend' : 'weekday';
  }

  private _ntRemainingMins(starts: string[], offsets: number[]): number {
    const now = Date.now();
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    let rem = 0;
    starts.forEach((s, i) => {
      const [h, m] = s.split(':').map(Number);
      const st = midnight.getTime() + (h * 60 + m) * 60000;
      const en = st + offsets[i] * 60000;
      if (now < en) rem += (en - Math.max(now, st)) / 60000;
    });
    return rem;
  }

  private _fmtMins(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  private _fmtCostRate(watts: number): string {
    const hdo = this._config.hdo;
    if (!hdo?.nt_price && !hdo?.vt_price) return '';
    const isNT = this._isOn(hdo.switch);
    const ntPrice = parseFloat(hdo.nt_price as unknown as string) || 0;
    const vtPrice = parseFloat(hdo.vt_price as unknown as string) || 0;
    const price = isNT ? ntPrice : vtPrice;
    const cur = hdo.currency ?? 'Kč';
    return `${((watts / 1000) * price).toFixed(2)} ${cur}/h`;
  }

  // ── Full-day schedule builder ──────────────────────────────────────────────

  private _buildFullDaySlots(
    starts: string[],
    offsets: number[],
    base: number,
    showing: boolean
  ): DaySlot[] {
    const fmt = (ms: number) =>
      new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const fmtDur = (m: number) =>
      m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
    const now = Date.now();
    const dayEnd = base + 86400000;

    const ntWindows = starts.map((start, i) => {
      const [h, m] = start.split(':').map(Number);
      const s = base + (h * 60 + m) * 60000;
      return { s, e: s + offsets[i] * 60000, durMins: offsets[i] };
    });

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
      if (nt.s > cursor) {
        slots.push(makeSlot('vt', cursor, nt.s, Math.round((nt.s - cursor) / 60000)));
      }
      slots.push(makeSlot('nt', nt.s, nt.e, nt.durMins));
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

  private _graphEntityIds(): string[] {
    if (!this._config) return [];
    const ids: string[] = [];
    // 3-phase per-phase entities (for sparklines)
    for (const circ of this._config.circuits ?? []) {
      if (circ.phases === 3) {
        [circ.power_l1, circ.power_l2, circ.power_l3].forEach(id => { if (id) ids.push(id); });
      } else if (circ.power) {
        ids.push(circ.power);
      }
      // Also fetch total power for 3-phase circuits (for cost calc)
      if (circ.phases === 3 && circ.power) ids.push(circ.power);
    }
    // Main meter phases for cost calc
    const mm = this._config.main_meter;
    if (mm) [mm.power_l1, mm.power_l2, mm.power_l3].forEach(id => { if (id) ids.push(id); });
    return [...new Set(ids)];
  }

  private async _fetchHistory(): Promise<void> {
    if (!this._hass || !this._config || this._historyFetching) return;
    const graphIds = this._graphEntityIds();
    const hdoSwitch = this._config.hdo?.switch;
    if (graphIds.length === 0 && !hdoSwitch) return;
    this._historyFetching = true;
    const hours = this._config.graph_hours ?? 3;
    const graphStart = new Date(Date.now() - hours * 3_600_000).toISOString();
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
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
          console.warn(`[ep-card] ${id}: entries not Array (${typeof entries})`);
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
          console.warn(`[ep-card] ${id}: 0 pts from ${entries.length} entries, sample: ${s}`);
        }
      }
      console.log(`[ep-card] processEntries: ${written}/${Object.keys(raw).length} written, cache=${cacheRef.size}`);
    };
    // Verify callWS is available
    if (typeof (this._hass as Record<string, unknown>).callWS !== 'function') {
      console.error('[ep-card] hass.callWS is not available on this HA version');
      this._historyFetching = false;
      return;
    }
    try {
      if (graphIds.length > 0) {
        console.log(`[ep-card] fetching history: ${graphIds.length} entities, start=${graphStart}`);
        const raw = await this._hass.callWS<Record<string, Array<{state: string; last_changed: string}>>>({
          type: 'history/history_during_period',
          start_time: graphStart,
          entity_ids: graphIds,
          no_attributes: true,
          significant_changes_only: false,
        });
        const keys = Object.keys(raw ?? {});
        const totalPts = keys.reduce((s, k) => s + (raw[k]?.length ?? 0), 0);
        console.log(`[ep-card] history result: ${keys.length} entities, ${totalPts} total points`);
        if (keys.length > 0) {
          const sample = raw[keys[0]];
          console.log(`[ep-card] sample entry (${keys[0]}):`, JSON.stringify(sample?.[0]));
        }
        processEntries(raw, []);
      }
      if (hdoSwitch) {
        const hdoRaw = await this._hass.callWS<Record<string, Array<{state: string; last_changed: string}>>>({
          type: 'history/history_during_period',
          start_time: midnightStr,
          entity_ids: [hdoSwitch],
          no_attributes: true,
          significant_changes_only: false,
        });
        console.log(`[ep-card] HDO switch history: ${hdoRaw?.[hdoSwitch]?.length ?? 0} entries`);
        processEntries(hdoRaw, [hdoSwitch]);
      }
      console.log(`[ep-card] cache now has ${this._historyCache.size} entities`);
      this.requestUpdate();
    } catch (err) {
      console.warn('[ep-card] history fetch failed:', err);
    } finally {
      this._historyFetching = false;
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
        const [h, m] = start.split(':').map(Number);
        const s = midnight.getTime() + (h * 60 + m) * 60000;
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
        const avgW = (todayPts[i].v + todayPts[i - 1].v) / 2;
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

  private _renderSparkline(entityId: string | undefined): TemplateResult | typeof nothing {
    if (!entityId) return nothing;
    const data = this._historyCache.get(entityId);
    if (!data || data.length < 2) return nothing;
    const W = 100, H = 38, pad = 3;
    const tMin = data[0].t, tMax = data[data.length - 1].t;
    const tRange = tMax - tMin || 1;
    const vals = data.map(p => p.v);
    const vMin = Math.min(...vals), vMax = Math.max(...vals);
    const vRange = vMax - vMin || 0.01;
    // Smooth cubic-bezier path (midpoint control points)
    const coords = data.map(p => ({
      x: ((p.t - tMin) / tRange) * W,
      y: (H - pad) - ((p.v - vMin) / vRange) * (H - pad * 2),
    }));
    let linePath = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
    for (let i = 1; i < coords.length; i++) {
      const p0 = coords[i - 1], p1 = coords[i];
      const cx = ((p0.x + p1.x) / 2).toFixed(1);
      linePath += ` C ${cx},${p0.y.toFixed(1)} ${cx},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
    }
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)},${H} L ${coords[0].x.toFixed(1)},${H} Z`;
    const gid = `sg_${entityId.replace(/[^a-z0-9]/gi, '_')}`;
    const labelMax = this._fmtW(vMax);
    const labelMin = this._fmtW(vMin);
    return html`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="sparkline">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ef4444" stop-opacity="0.3"/>
          <stop offset="85%" stop-color="#ef4444" stop-opacity="0.05"/>
          <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gid})"/>
      <path d="${linePath}" fill="none" stroke="#ef4444" stroke-width="1.5"
        stroke-linejoin="round" stroke-linecap="round"/>
      <text x="2" y="10" text-anchor="start" class="spark-label">${labelMax}</text>
      <text x="2" y="${H - 2}" text-anchor="start" class="spark-label spark-label-min">${labelMin}</text>
    </svg>`;
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
    const base = showing ? midnight.getTime() + 86400000 : midnight.getTime();

    const slots = this._buildFullDaySlots(day.starts, day.offsets, base, showing);
    const remaining = showing ? null : this._ntRemainingMins(day.starts, day.offsets);
    const totalNT = day.offsets.reduce((a, b) => a + b, 0);

    const exp = this._scheduleExpanded;
    const currentSlot = slots.find(s => s.isCurrent);
    return html`
      <div class="schedule-block">
        <div class="schedule-title" @click=${() => { this._scheduleExpanded = !exp; }}>
          <span class="schedule-when">${showing ? 'Tomorrow' : 'Today'}</span>
          <span class="schedule-day">${dt}</span>
          ${!exp && currentSlot ? html`
            <span class="stariff ${currentSlot.type}" style="margin-left:4px">${currentSlot.type.toUpperCase()}</span>
            <span class="nt-remaining-inline">${currentSlot.label}</span>
          ` : nothing}
          <div class="schedule-nav">
            ${exp && remaining !== null
              ? html`<span class="nt-remaining">${this._fmtMins(remaining)} NT left · ${this._fmtMins(totalNT)} total</span>`
              : nothing}
            ${exp ? html`
              <button class="sday-btn" @click=${(e: Event) => { e.stopPropagation(); this._showTomorrow = !this._showTomorrow; }}>
                ${showing ? 'Today' : 'Tomorrow'}
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
                  ? html`<span class="snow ${sl.type}">Now</span>`
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
    const isNT = this._isOn(hdo.switch);
    const cd = this._hdoCountdown();
    const price = isNT ? hdo.nt_price : hdo.vt_price;
    const cur = hdo.currency ?? 'Kč';
    const slotPct = this._getCurrentSlotPct();
    return html`
      <div class="hdo-bar ${isNT ? 'nt' : 'vt'}">
        <div class="hdo-dot ${isNT ? 'nt' : 'vt'}"></div>
        <div class="hdo-info">
          <div class="hdo-label">${isNT ? 'NT — low tariff' : 'VT — high tariff'}</div>
          ${price ? html`<div class="hdo-sub">${price} ${cur}/kWh</div>` : nothing}
          ${slotPct >= 0 ? html`
            <div class="hdo-prog"><div class="hdo-prog-fill" style="width:${slotPct.toFixed(1)}%"></div></div>
          ` : nothing}
        </div>
        ${cd ? html`
          <div class="hdo-cd">
            <div class="hdo-cd-lbl">ends in</div>
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
    const phases = [
      { label: 'L1', power: m.power_l1, current: m.current_l1 },
      { label: 'L2', power: m.power_l2, current: m.current_l2 },
      { label: 'L3', power: m.power_l3, current: m.current_l3 },
    ];
    return html`
      <div class="ep-meter">
        <div class="meter-header">
          <div class="meter-icon">
            <ha-icon icon="mdi:transmission-tower"></ha-icon>
          </div>
          <div class="meter-title-wrap">
            <span class="meter-title">Main meter</span>
            <span class="badge badge-info">3φ</span>
          </div>
          <div class="meter-total">
            <span class="metric-primary">${(totalW / 1000).toFixed(2)} kW</span>
            <span class="metric-small">
              ${m.energy_today ? html`${this._kwh(m.energy_today).toFixed(1)} kWh today` : nothing}
              ${(() => { const cr = this._calcDailyCost(m.power_l1, m.power_l2, m.power_l3); return cr ? html`<span class="metric-sep">·</span><span class="cost-rate">${cr}</span>` : nothing; })()}
            </span>
          </div>
        </div>
        <div class="phases-grid">
          ${phases.map(p => html`
            <div class="phase-cell">
              <div class="phase-label">${p.label}</div>
              <div class="phase-power">${(this._watts(p.power) / 1000).toFixed(2)} kW</div>
              <div class="phase-detail">${this._num(p.current).toFixed(1)} A</div>
              ${this._renderSparkline(p.power)}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  // ── Render: circuit ────────────────────────────────────────────────────────

  private _renderCircuit(c: Circuit): TemplateResult {
    const isOn = this._isOn(c.switch);
    const power = this._watts(c.power);
    const current = this._num(c.current);
    const energy = this._kwh(c.energy);
    const maxA = c.max_current ?? (c.phases === 3 ? 63 : 16);
    const loadPct = Math.min(100, current > 0
      ? (current / maxA) * 100
      : (power / (maxA * 230)) * 100);
    const barColor = this._loadColor(loadPct);
    const expanded = this._expanded.has(c.id);
    const hasDevices = (c.devices?.length ?? 0) > 0;
    const costRate = power > 0 ? this._calcDailyCost(c.power) : '';

    return html`
      <div class="circuit-card ${c.critical ? 'critical' : ''} ${c.switch && isOn ? 'is-on' : ''}">

        <div class="circuit-header">
          <div class="status-dot ${isOn ? 'on' : c.switch ? 'off' : 'none'}"></div>
          <span class="circuit-name" title="${c.name}">${c.name}</span>
          ${c.phases === 3 ? html`<span class="badge badge-phase">3φ</span>` : nothing}
          ${c.critical
            ? html`<ha-icon icon="mdi:lock" class="lock-icon"></ha-icon>`
            : c.switch
              ? html`<button
                    class="toggle ${isOn ? 'on' : 'off'}"
                    @click=${() => this._toggle(c.switch!)}
                    aria-label="${isOn ? 'Turn off' : 'Turn on'} ${c.name}">
                  </button>`
              : nothing}
        </div>

        <div class="load-track">
          <div class="load-fill" style="width:${loadPct.toFixed(1)}%;background:${barColor}"></div>
        </div>

        <div class="circuit-footer">
          <div class="metrics">
            <span class="metric-primary ${!isOn && power === 0 ? 'inactive' : ''}">${this._fmtW(power)}</span>
            <span class="metric-small">
              ${current.toFixed(1)} A
              ${c.voltage ? html`<span class="metric-sep">·</span>${this._num(c.voltage).toFixed(0)} V` : nothing}
              ${energy > 0 ? html`<span class="metric-sep">·</span>${energy.toFixed(2)} kWh` : nothing}
              ${costRate ? html`<span class="metric-sep">·</span><span class="cost-rate">${costRate}</span>` : nothing}
            </span>
          </div>
          ${hasDevices
            ? html`<button class="expand-btn" @click=${() => this._toggleExpanded(c.id)}>
                <ha-icon icon="${expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
              </button>`
            : nothing}
        </div>

        ${expanded && hasDevices
          ? html`<div class="devices-list">${c.devices!.map(d => this._renderDevice(d))}</div>`
          : nothing}
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
    const power = this._num(d.power);
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
                @click=${() => this._toggle(d.switch!)}
                aria-label="${isOn ? 'Turn off' : 'Turn on'} ${d.name}">
              </button>`
          : nothing}
      </div>
    `;
  }

  // ── Render: channel ────────────────────────────────────────────────────────

  private _renderChannel(ch: DeviceChannel): TemplateResult {
    const isOn = this._isOn(ch.switch);
    const power = this._num(ch.power);
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
                @click=${() => this._toggle(ch.switch!)}
                aria-label="${isOn ? 'Turn off' : 'Turn on'} ${ch.name}">
              </button>`
          : nothing}
      </div>
    `;
  }

  // ── Render: 3-phase circuit ───────────────────────────────────────────────

  private _renderThreePhaseCircuit(c: Circuit): TemplateResult {
    const isOn = this._isOn(c.switch);
    const hasPhaseData = !!(c.power_l1 || c.power_l2 || c.power_l3);
    // Total power: use dedicated entity if set, otherwise sum L1+L2+L3
    const totalPower = c.power
      ? this._watts(c.power)
      : this._watts(c.power_l1) + this._watts(c.power_l2) + this._watts(c.power_l3);
    const energy = this._kwh(c.energy);
    const maxA = c.max_current ?? 63;
    const phases = [
      { label: 'L1', power: c.power_l1, current: c.current_l1 },
      { label: 'L2', power: c.power_l2, current: c.current_l2 },
      { label: 'L3', power: c.power_l3, current: c.current_l3 },
    ];
    // Total current for load bar: use dedicated entity if set, otherwise max of phases
    const totalCurrent = c.current
      ? this._num(c.current)
      : Math.max(this._num(c.current_l1), this._num(c.current_l2), this._num(c.current_l3));
    const loadPct = Math.min(100, totalCurrent > 0
      ? (totalCurrent / maxA) * 100
      : (totalPower / (maxA * 400)) * 100);
    const barColor = this._loadColor(loadPct);
    const expanded = this._expanded.has(c.id);
    const hasDevices = (c.devices?.length ?? 0) > 0;
    const costRate = totalPower > 0 ? this._calcDailyCost(c.power, c.power_l1, c.power_l2, c.power_l3) : '';

    return html`
      <div class="three-phase-card ${c.critical ? 'critical' : ''} ${c.switch && isOn ? 'is-on' : ''}">
        <div class="tp-header">
          <div class="tp-title-row">
            <div class="status-dot ${isOn ? 'on' : c.switch ? 'off' : 'none'}"></div>
            <span class="circuit-name" title="${c.name}">${c.name}</span>
            <span class="badge badge-phase">3φ</span>
            ${c.critical
              ? html`<ha-icon icon="mdi:lock" class="lock-icon"></ha-icon>`
              : c.switch
                ? html`<button class="toggle ${isOn ? 'on' : 'off'}"
                    @click=${() => this._toggle(c.switch!)}
                    aria-label="${isOn ? 'Turn off' : 'Turn on'} ${c.name}">
                  </button>`
                : nothing}
          </div>
          <div class="tp-total">
            <span class="metric-primary">${(totalPower / 1000).toFixed(2)} kW</span>
            <span class="metric-small">
              ${energy > 0 ? html`${energy.toFixed(2)} kWh` : nothing}
              ${costRate ? html`<span class="metric-sep">·</span><span class="cost-rate">${costRate}</span>` : nothing}
            </span>
          </div>
        </div>

        <div class="load-track">
          <div class="load-fill" style="width:${loadPct.toFixed(1)}%;background:${barColor}"></div>
        </div>

        <div class="phases-grid">
          ${phases.map(p => html`
            <div class="phase-cell">
              <div class="phase-label">${p.label}</div>
              <div class="phase-power">${(this._watts(p.power) / 1000).toFixed(2)} kW</div>
              <div class="phase-detail">${this._num(p.current).toFixed(1)} A</div>
              ${this._renderSparkline(p.power)}
            </div>
          `)}
        </div>

        ${hasDevices ? html`
          <div class="tp-footer">
            <button class="expand-btn" @click=${() => this._toggleExpanded(c.id)}>
              <ha-icon icon="${expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
              <span>${expanded ? 'hide' : 'devices'}</span>
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
      <ha-card>
        ${this._config.title
          ? html`<div class="card-header">${this._config.title}</div>`
          : nothing}
        <div class="card-content">
          ${this._renderHdo()}
          ${this._renderHdoSchedule()}
          ${this._renderMainMeter()}

          ${threePhase.length > 0 ? html`
            <div class="section-label">3-phase circuits</div>
            <div class="three-phase-list">
              ${threePhase.map(c => this._renderThreePhaseCircuit(c))}
            </div>
          ` : nothing}

          ${singlePhase.length > 0 ? html`
            ${threePhase.length > 0
              ? html`<div class="section-label">Single-phase breakers</div>`
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
    ha-card { background: #111318; overflow: hidden; }
    .card-header { padding: 16px 16px 0; font-size: 16px; font-weight: 500; letter-spacing: -0.2px; color: #e2e8f0; }
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
    .hdo-cd { text-align: right; flex-shrink: 0; }
    .hdo-cd-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: #4b5568; }
    .hdo-cd-val { font-size: 24px; font-weight: 500; line-height: 1; font-variant-numeric: tabular-nums; }
    .hdo-bar.nt .hdo-cd-val { color: #22c55e; }
    .hdo-bar.vt .hdo-cd-val { color: #ef4444; }

    .schedule-block { background: #181c24; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; border: 0.5px solid #252a35; }
    .schedule-title { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; cursor: pointer; user-select: none; flex-wrap: wrap; }
    .schedule-title:hover { opacity: .85; }
    .schedule-when { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .7px; color: #94a3b8; }
    .schedule-day { font-size: 10px; padding: 1px 6px; border-radius: 12px; background: #1e2a4a; color: #6b9bdb; text-transform: capitalize; }
    .schedule-nav { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }
    .nt-remaining { font-size: 10px; color: #4b5568; white-space: nowrap; }
    .nt-remaining-inline { font-size: 10px; color: #4b5568; margin-left: 4px; white-space: nowrap; }
    .sday-btn { font-size: 10px; padding: 2px 8px; border-radius: 12px; border: 0.5px solid #252a35; background: #111318; color: #6b7db3; cursor: pointer; white-space: nowrap; font-weight: 500; }
    .sday-btn:hover { background: #252a35; }
    .schedule-chevron { --mdc-icon-size: 15px; color: #4b5568; flex-shrink: 0; }
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
    .srow-time { font-size: 11px; font-weight: 500; color: #94a3b8; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
    .srow-track { height: 3px; background: #252a35; border-radius: 2px; overflow: hidden; }
    .srow-fill { height: 100%; border-radius: 2px; transition: width 1s ease; }
    .srow-fill.nt { background: #22c55e; }
    .srow-fill.vt { background: #ef4444; }
    .snow { font-size: 8px; text-transform: uppercase; letter-spacing: .8px; font-weight: 800; padding: 2px 5px; border-radius: 8px; white-space: nowrap; }
    .snow.nt { background: rgba(34,197,94,.15); color: #22c55e; }
    .snow.vt { background: rgba(239,68,68,.12); color: #ef4444; }
    .sdur { font-size: 10px; color: #4b5568; white-space: nowrap; text-align: right; }

    .timeline-bar { display: flex; height: 4px; border-radius: 2px; overflow: hidden; margin-bottom: 8px; gap: 1px; position: relative; }
    .tl-seg { border-radius: 1px; transition: opacity .3s; }
    .tl-seg.nt { background: #22c55e; }
    .tl-seg.vt { background: rgba(239,68,68,.35); }
    .tl-seg.past { opacity: .3; }
    .tl-seg.active.nt { box-shadow: 0 0 4px rgba(34,197,94,.5); }
    .tl-seg.active.vt { background: #ef4444; }
    .timeline-now { position: absolute; top: -2px; bottom: -2px; width: 4px; background: #fff; border-radius: 2px; pointer-events: none; box-shadow: -1px 0 0 #000, 1px 0 0 #000; }

    .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: .7px; color: #4b5568; margin: 12px 0 6px; padding-left: 7px; border-left: 2px solid #252a35; }

    .ep-meter { background: #181c24; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; border: 0.5px solid #252a35; }
    .meter-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .meter-icon { width: 28px; height: 28px; border-radius: 6px; background: #1e2435; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .meter-icon ha-icon { --mdc-icon-size: 16px; color: #6b7db3; }
    .meter-title-wrap { display: flex; align-items: center; gap: 6px; flex: 1; }
    .meter-title { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .5px; color: #6b7db3; }
    .meter-total { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
    .phases-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; }
    .phase-cell { background: #111318; border-radius: 6px; padding: 8px 10px; border: 0.5px solid #252a35; }
    .phase-label { font-size: 10px; color: #4b5568; font-weight: 500; margin-bottom: 3px; }
    .phase-power { font-size: 14px; font-weight: 500; color: #a0aec0; }
    .phase-detail { font-size: 11px; color: #4b5568; margin-top: 1px; }

    .circuit-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 8px; }
    @container (max-width: 360px) { .circuit-grid { grid-template-columns: 1fr; } }
    .three-phase-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }

    .circuit-card { background: #181c24; border-radius: 8px; padding: 12px 14px; border: 0.5px solid #252a35; }
    .circuit-card.critical  { border-left: 2px solid #f59e0b; }
    .circuit-card.is-on     { border-left: 2px solid #22c55e; }
    .circuit-card.critical.is-on { border-left: 2px solid #f59e0b; }
    .circuit-header { display: flex; align-items: center; gap: 6px; margin-bottom: 1px; }
    .circuit-name { font-size: 12px; font-weight: 500; color: #94a3b8; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lock-icon { --mdc-icon-size: 14px; color: #f59e0b; flex-shrink: 0; }

    .three-phase-card { background: #181c24; border-radius: 8px; padding: 12px 14px; border: 0.5px solid #252a35; }
    .three-phase-card.critical { border-left: 2px solid #f59e0b; }
    .three-phase-card.is-on    { border-left: 2px solid #22c55e; }
    .tp-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .tp-title-row { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
    .tp-total { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; }
    .tp-footer { display: flex; justify-content: flex-end; margin-top: 8px; }

    .load-track { height: 3px; background: #1f2937; border-radius: 2px; overflow: hidden; margin: 7px 0; }
    .load-fill { height: 100%; border-radius: 2px; transition: width 1s ease; }

    .circuit-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 6px; }
    .metrics { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .metric-primary { font-size: 22px; font-weight: 500; color: #e2e8f0; line-height: 1; letter-spacing: -0.4px; }
    .metric-primary.inactive { color: #374151; }
    .metric-small { font-size: 11px; color: #4b5568; display: flex; flex-wrap: wrap; align-items: center; gap: 1px 2px; }
    .metric-sep { opacity: .4; margin: 0 1px; }
    .cost-rate { color: #f59e0b; font-weight: 500; }

    .badge { font-size: 9px; padding: 2px 5px; border-radius: 4px; font-weight: 500; flex-shrink: 0; letter-spacing: .3px; }
    .badge-info  { background: #1e2a4a; color: #6b9bdb; }
    .badge-phase { background: #1e2a4a; color: #6b9bdb; }

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

    .expand-btn { display: flex; align-items: center; gap: 4px; background: #111318; border: 0.5px solid #252a35; border-radius: 5px; cursor: pointer; color: #4b5568; padding: 2px 6px; flex-shrink: 0; }
    .expand-btn ha-icon { --mdc-icon-size: 14px; }
    .expand-btn span { font-size: 10px; }

    .tp-devices-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 0.5px solid #252a35; }
    .devices-list { display: flex; flex-direction: column; margin-top: 8px; padding-top: 8px; border-top: 0.5px solid #252a35; }
    .tp-device-col { min-width: 0; }
    .tp-device-col .device-group-label { padding-left: 0; }
    .tp-device-col .device-row { padding-left: 0; }
    .device-group { margin-bottom: 6px; }
    .device-group-label { display: flex; justify-content: space-between; align-items: center; font-size: 10px; text-transform: uppercase; letter-spacing: .7px; color: #4b5568; margin-bottom: 4px; padding-left: 14px; }
    .ch-sum { font-size: 10px; font-weight: 500; color: #6b7db3; letter-spacing: 0; text-transform: none; }
    .device-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; border-bottom: 0.5px solid #1f2937; }
    .device-row:last-child { border-bottom: none; }
    .device-row.channel { padding-left: 8px; }
    .device-name { flex: 1; font-size: 12px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .device-metrics { font-size: 11px; color: #4b5568; white-space: nowrap; flex-shrink: 0; }
    .note-row { opacity: .6; }
    .note-icon { --mdc-icon-size: 12px; color: #4b5568; flex-shrink: 0; }
    .note-row .device-name { font-style: italic; }

    .sparkline { width: 100%; height: 38px; display: block; margin-top: 6px; overflow: visible; }
    .spark-label { font-size: 8px; fill: rgba(255,255,255,.75); font-family: inherit; stroke: #111318; stroke-width: 3px; paint-order: stroke fill; }
    .spark-label-min { fill: rgba(255,255,255,.45); }
  `;
}

(window as unknown as Record<string, unknown>)['customCards'] ??= [];
((window as unknown as Record<string, unknown[]>)['customCards']).push({
  type: 'electricity-panel-card',
  name: 'Electricity Panel Card',
  description: 'Circuit breaker panel — power, current, daily energy, HDO tariff',
  preview: false,
});