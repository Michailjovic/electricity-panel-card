import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
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
  @property({ attribute: false }) hass!: HomeAssistant;
  @state() private _config!: ElectricityPanelConfig;
  @state() private _expanded = new Set<string>();
  @state() private _showTomorrow = false;
  @state() private _scheduleExpanded = false;

  private _timer?: number;

  override connectedCallback(): void {
    super.connectedCallback();
    this._timer = window.setInterval(() => this.requestUpdate(), 30_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._timer);
  }

  // ── HA card API ────────────────────────────────────────────────────────────

  setConfig(config: ElectricityPanelConfig): void {
    if (!config) throw new Error('Invalid configuration');
    this._config = config;
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
    const price = isNT ? (hdo.nt_price ?? 0) : (hdo.vt_price ?? 0);
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
      <div class="hdo-card ${isNT ? 'nt' : 'vt'}">
        <div class="hdo-main">
          <div class="hdo-dot ${isNT ? 'nt' : 'vt'}"></div>
          <div class="hdo-info">
            <span class="hdo-label">${isNT ? 'NT — Low tariff' : 'VT — High tariff'}</span>
            ${price ? html`<span class="hdo-sub">${price} ${cur}/kWh</span>` : nothing}
          </div>
          ${cd ? html`
            <div class="hdo-cd-block">
              <span class="hdo-cd-label">ends in</span>
              <span class="hdo-cd-val">${cd}</span>
            </div>
          ` : nothing}
        </div>
        ${slotPct >= 0 ? html`
          <div class="hdo-win-track">
            <div class="hdo-win-fill ${isNT ? 'nt' : 'vt'}" style="width:${slotPct.toFixed(1)}%"></div>
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
      <div class="section-block meter-block">
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
            ${m.energy_today
              ? html`<span class="metric-small">${this._kwh(m.energy_today).toFixed(1)} kWh today</span>`
              : nothing}
          </div>
        </div>
        <div class="phases-grid">
          ${phases.map(p => html`
            <div class="phase-cell">
              <div class="phase-label">${p.label}</div>
              <div class="phase-power">${(this._watts(p.power) / 1000).toFixed(2)} kW</div>
              <div class="phase-detail">${this._num(p.current).toFixed(1)} A</div>
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
    const costRate = power > 0 ? this._fmtCostRate(power) : '';

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
            <span class="metric-primary">${this._fmtW(power)}</span>
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
          ? html`<div class="tp-devices-grid">${c.devices!.map(d => html`<div class="tp-device-col">${this._renderDevice(d)}</div>`)}</div>`
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
    const costRate = totalPower > 0 ? this._fmtCostRate(totalPower) : '';

    return html`
      <div class="circuit-card three-phase-card ${c.critical ? 'critical' : ''} ${c.switch && isOn ? 'is-on' : ''}">
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
    :host {
      display: block;
      container-type: inline-size;
    }

    ha-card { overflow: hidden; }

    .card-header {
      padding: 16px 16px 0;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.3px;
      color: var(--primary-text-color);
    }

    .card-content { padding: 12px 12px 16px; }

    /* ── HDO card (hero) ─────────────────────────────────────────────────── */
    .hdo-card {
      border-radius: 14px;
      padding: 14px 16px;
      margin-bottom: 10px;
      border: 1px solid transparent;
    }
    .hdo-card.nt {
      background: linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0.05) 100%);
      border-color: rgba(34,197,94,0.3);
      box-shadow: 0 0 20px rgba(34,197,94,0.08);
    }
    .hdo-card.vt {
      background: linear-gradient(135deg, rgba(239,68,68,0.14) 0%, rgba(239,68,68,0.04) 100%);
      border-color: rgba(239,68,68,0.24);
      box-shadow: 0 0 20px rgba(239,68,68,0.06);
    }
    .hdo-main {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .hdo-dot {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .hdo-dot.nt {
      background: var(--success-color, #22c55e);
      box-shadow: 0 0 0 3px rgba(34,197,94,0.2);
      animation: hdo-pulse 2.5s ease-in-out infinite;
    }
    .hdo-dot.vt {
      background: var(--error-color, #ef4444);
      box-shadow: 0 0 0 3px rgba(239,68,68,0.18);
    }
    @keyframes hdo-pulse {
      0%, 100% { box-shadow: 0 0 0 3px rgba(34,197,94,0.2); }
      50% { box-shadow: 0 0 0 6px rgba(34,197,94,0.08); }
    }
    .hdo-info {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
    }
    .hdo-label {
      font-size: 14px;
      font-weight: 700;
      color: var(--primary-text-color);
    }
    .hdo-sub {
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .hdo-cd-block {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      flex-shrink: 0;
    }
    .hdo-cd-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--secondary-text-color);
    }
    .hdo-cd-val {
      font-size: 20px;
      font-weight: 700;
      color: var(--primary-text-color);
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .hdo-win-track {
      height: 3px;
      background: rgba(255,255,255,0.07);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 10px;
    }
    .hdo-win-fill.nt { height: 100%; background: var(--success-color, #22c55e); border-radius: 2px; }
    .hdo-win-fill.vt { height: 100%; background: var(--error-color, #ef4444); border-radius: 2px; }

    /* ── Schedule ────────────────────────────────────────────────────────── */
    .schedule-block {
      background: var(--secondary-background-color, rgba(0,0,0,0.03));
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 10px;
      border: 1px solid var(--divider-color, rgba(0,0,0,0.06));
    }
    .schedule-title {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .schedule-when {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--primary-text-color);
    }
    .schedule-day {
      font-size: 10px;
      padding: 1px 7px;
      border-radius: 20px;
      background: var(--primary-color, #2196f3);
      color: #fff;
      opacity: 0.75;
      text-transform: capitalize;
    }
    .schedule-nav {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .nt-remaining {
      font-size: 10px;
      color: var(--secondary-text-color);
      white-space: nowrap;
    }
    .sday-btn {
      font-size: 10px;
      padding: 3px 10px;
      border-radius: 20px;
      border: 1px solid var(--divider-color, rgba(0,0,0,0.15));
      background: var(--primary-background-color, #fff);
      color: var(--secondary-text-color);
      cursor: pointer;
      white-space: nowrap;
      font-weight: 500;
    }
    .sday-btn:hover { background: var(--secondary-background-color); }

    .schedule-rows { display: flex; flex-direction: column; gap: 2px; }

    .srow {
      display: grid;
      grid-template-columns: 24px minmax(0, 100px) 1fr auto;
      align-items: center;
      gap: 8px;
      padding: 5px 6px;
      border-radius: 6px;
      transition: opacity 0.2s;
    }
    .srow.past { opacity: 0.35; }
    .srow.future { opacity: 0.65; }
    .srow.active { opacity: 1; }
    .srow.active.nt { background: rgba(34,197,94,0.08); }
    .srow.active.vt { background: rgba(239,68,68,0.07); }
    .srow.future.nt { background: rgba(34,197,94,0.04); }

    .stariff {
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.5px;
      padding: 2px 4px;
      border-radius: 3px;
      text-align: center;
    }
    .stariff.nt {
      background: rgba(34,197,94,0.18);
      color: var(--success-color, #16a34a);
    }
    .stariff.vt {
      background: rgba(239,68,68,0.12);
      color: var(--error-color, #dc2626);
    }
    .srow-time {
      font-size: 11px;
      font-weight: 500;
      color: var(--primary-text-color);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
    }
    .srow-track {
      height: 4px;
      background: var(--divider-color, rgba(0,0,0,0.1));
      border-radius: 2px;
      overflow: hidden;
    }
    .srow-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 1s ease;
    }
    .srow-fill.nt { background: var(--success-color, #22c55e); }
    .srow-fill.vt { background: var(--error-color, #ef4444); }
    .snow {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 10px;
      white-space: nowrap;
    }
    .snow.nt { background: rgba(34,197,94,0.2); color: var(--success-color, #16a34a); }
    .snow.vt { background: rgba(239,68,68,0.15); color: var(--error-color, #dc2626); }
    .sdur {
      font-size: 10px;
      color: var(--disabled-text-color);
      white-space: nowrap;
      text-align: right;
    }

    /* ── Section utilities ───────────────────────────────────────────────── */
    .section-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--secondary-text-color);
      margin: 14px 0 8px;
      padding-left: 9px;
      border-left: 2px solid var(--primary-color, #2196f3);
      opacity: 0.8;
    }
    .section-block {
      background: var(--secondary-background-color, rgba(0,0,0,0.03));
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 10px;
      border: 1px solid var(--divider-color, rgba(0,0,0,0.06));
    }

    /* ── Main meter ──────────────────────────────────────────────────────── */
    .meter-block {}
    .meter-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .meter-icon {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: rgba(var(--rgb-primary-color, 33,150,243), 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .meter-icon ha-icon {
      --mdc-icon-size: 18px;
      color: var(--primary-color, #2196f3);
    }
    .meter-title-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .meter-title {
      font-size: 13px;
      font-weight: 500;
      color: var(--secondary-text-color);
    }
    .meter-total {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      margin-left: auto;
      gap: 1px;
    }
    .phases-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .phase-cell {
      background: rgba(var(--rgb-primary-color, 33,150,243), 0.04);
      border-radius: 8px;
      padding: 8px 10px;
      border: 1px solid rgba(var(--rgb-primary-color, 33,150,243), 0.1);
    }
    .phase-power { font-size: 15px; font-weight: 600; color: var(--primary-text-color); }
    .phase-detail { font-size: 11px; color: var(--secondary-text-color); margin-top: 2px; }

    /* single-phase grid — max 2 columns */
    .circuit-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    @container (max-width: 360px) {
      .circuit-grid { grid-template-columns: 1fr; }
    }

    /* 3-phase list — stacked full-width */
    .three-phase-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 4px;
    }

    /* circuit card */
    .circuit-card {
      background: var(--ha-card-background, var(--card-background-color, #fff));
      border-radius: 12px;
      padding: 12px 14px;
      border: 1px solid var(--divider-color, rgba(0,0,0,0.07));
      box-shadow: 0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    }
    .circuit-card.critical { border-left: 3px solid var(--warning-color, #f59e0b); }
    .circuit-card.is-on    { border-left: 3px solid var(--success-color, #22c55e); box-shadow: 0 0 14px rgba(34,197,94,0.1), 0 1px 4px rgba(0,0,0,0.06); }
    .circuit-card.critical.is-on { border-left: 3px solid var(--warning-color, #f59e0b); }
    .circuit-header {
      display: flex; align-items: center; gap: 6px; margin-bottom: 2px;
    }
    .circuit-name {
      font-size: 14px; font-weight: 700; color: var(--primary-text-color);
      flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .lock-icon { --mdc-icon-size: 16px; color: var(--warning-color, #f59e0b); flex-shrink: 0; }

    /* load bar */
    .load-track {
      height: 5px;
      background: linear-gradient(90deg,
        rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.15) 55%,
        rgba(245,158,11,0.2) 55%, rgba(245,158,11,0.2) 80%,
        rgba(239,68,68,0.25) 80%, rgba(239,68,68,0.25) 100%);
      border-radius: 3px; overflow: hidden; margin: 8px 0;
    }
    .load-fill { height: 100%; border-radius: 3px; transition: width 1s ease; }

    /* circuit footer */
    .circuit-footer {
      display: flex; align-items: flex-end; justify-content: space-between; gap: 6px;
    }
    .metrics { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .metric-primary {
      font-size: 22px; font-weight: 700; color: var(--primary-text-color); line-height: 1; letter-spacing: -0.5px;
    }
    .metric-small {
      font-size: 11px; color: var(--secondary-text-color);
      display: flex; flex-wrap: wrap; align-items: center; gap: 1px 2px;
    }
    .metric-sep { opacity: 0.4; margin: 0 1px; }
    .cost-rate { color: var(--warning-color, #f59e0b); font-weight: 600; }

    /* badge */
    .badge {
      font-size: 9px; padding: 1px 5px; border-radius: 4px;
      font-weight: 700; flex-shrink: 0; letter-spacing: 0.3px;
    }
    .badge-info  { background: rgba(33,150,243,0.12); color: var(--primary-color, #2196f3); }
    .badge-phase { background: rgba(33,150,243,0.10); color: var(--primary-color, #2196f3); }

    /* toggle */
    .toggle {
      width: 34px; height: 20px; border-radius: 10px;
      border: none; cursor: pointer; position: relative; flex-shrink: 0; transition: background 0.2s;
    }
    .toggle::after {
      content: ''; position: absolute; top: 3px;
      width: 14px; height: 14px; border-radius: 50%; background: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.25); transition: left 0.2s;
    }
    .toggle.on  { background: var(--success-color, #22c55e); }
    .toggle.on::after  { left: 17px; }
    .toggle.off { background: var(--disabled-text-color, #9e9e9e); }
    .toggle.off::after { left: 3px; }
    .toggle.sm  { width: 28px; height: 16px; border-radius: 8px; }
    .toggle.sm::after { width: 10px; height: 10px; top: 3px; }
    .toggle.sm.on::after  { left: 15px; }
    .toggle.sm.off::after { left: 3px; }

    /* expand button */
    .expand-btn {
      display: flex; align-items: center;
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      border: none; border-radius: 6px; cursor: pointer;
      color: var(--secondary-text-color); padding: 2px 4px; flex-shrink: 0;
    }
    .expand-btn ha-icon { --mdc-icon-size: 16px; }

    /* status dot */
    .status-dot {
      width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; transition: box-shadow 0.3s;
    }
    .status-dot.on  { background: var(--success-color, #22c55e); box-shadow: 0 0 0 3px rgba(34,197,94,0.2); }
    .status-dot.off { background: var(--disabled-text-color, #9e9e9e); }
    .status-dot.none { background: transparent; border: 1.5px solid var(--divider-color, rgba(0,0,0,0.2)); }
    .status-dot.sm  { width: 7px; height: 7px; }
    .status-dot.sm.on { box-shadow: 0 0 0 2px rgba(34,197,94,0.2); }

    /* devices */
    .devices-section {
      border-top: 1px solid var(--divider-color, rgba(0,0,0,0.08));
      margin-top: 8px; padding-top: 8px;
    }
    .device-group { margin-bottom: 6px; }
    .device-group-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--disabled-text-color); margin-bottom: 4px; padding-left: 16px;
    }
    .device-row {
      display: flex; align-items: center; gap: 7px;
      padding: 4px 0; border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.05));
    }
    .device-row:last-child { border-bottom: none; }
    .device-row.channel { padding-left: 8px; }
    .device-name {
      flex: 1; font-size: 12px; color: var(--primary-text-color);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .device-metrics { font-size: 11px; color: var(--secondary-text-color); white-space: nowrap; flex-shrink: 0; }
    .note-row { opacity: 0.7; }
    .note-icon { --mdc-icon-size: 13px; color: var(--disabled-text-color); flex-shrink: 0; }
    .note-row .device-name { font-style: italic; }

    /* timeline bar */
    .timeline-bar {
      display: flex;
      height: 5px;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 10px;
      gap: 1px;
    }
    .tl-seg { border-radius: 1px; transition: opacity 0.3s; }
    .tl-seg.nt { background: var(--success-color, #22c55e); }
    .tl-seg.vt { background: rgba(239,68,68,0.35); }
    .tl-seg.past { opacity: 0.35; }
    .tl-seg.active.nt { box-shadow: 0 0 6px rgba(34,197,94,0.5); }
    .tl-seg.active.vt { background: var(--error-color, #ef4444); }

    /* 3-phase circuit card */
    .three-phase-card {
      background: var(--ha-card-background, var(--card-background-color, #fff));
      border-radius: 12px;
      padding: 14px 16px;
      border: 1px solid var(--divider-color, rgba(0,0,0,0.07));
      box-shadow: 0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    }
    .three-phase-card.critical { border-left: 3px solid var(--warning-color, #f59e0b); }
    .three-phase-card.is-on    { border-left: 3px solid var(--success-color, #22c55e); }
    .tp-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    .tp-title-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1;
      min-width: 0;
    }
    .tp-total {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 1px;
      flex-shrink: 0;
    }
    .tp-footer {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
    }
    .tp-no-phases {
      font-size: 11px; color: var(--disabled-text-color); font-style: italic; margin-top: 6px;
    }

    /* collapsible schedule */
    .schedule-title { cursor: pointer; user-select: none; }
    .schedule-title:hover { opacity: 0.85; }
    .schedule-chevron { --mdc-icon-size: 16px; color: var(--secondary-text-color); flex-shrink: 0; }
    .nt-remaining-inline {
      font-size: 10px; color: var(--secondary-text-color); margin-left: 4px; white-space: nowrap;
    }

    /* 3-phase device columns */
    .tp-devices-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--divider-color, rgba(0,0,0,0.08));
    }
    .tp-device-col { min-width: 0; }
    .tp-device-col .device-group-label { padding-left: 0; }
    .tp-device-col .device-row { padding-left: 0; }

    .note-row { opacity: 0.7; }
    .note-icon { --mdc-icon-size: 13px; color: var(--disabled-text-color); flex-shrink: 0; }
    .note-row .device-name { font-style: italic; }

    /* channel sum in device group header */
    .device-group-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--disabled-text-color);
      margin-bottom: 4px;
      padding-left: 16px;
    }
    .tp-device-col .device-group-label { padding-left: 0; }
    .ch-sum {
      font-size: 10px;
      font-weight: 600;
      color: var(--secondary-text-color);
      letter-spacing: 0;
      text-transform: none;
    }

    /* schedule current row shown when collapsed */
    /* timeline position marker */
    .timeline-now {
      position: absolute;
      top: -1px;
      bottom: -1px;
      width: 2px;
      background: rgba(255,255,255,0.85);
      border-radius: 1px;
      pointer-events: none;
      box-shadow: 0 0 4px rgba(255,255,255,0.4);
    }
  `;
}

(window as unknown as Record<string, unknown>)['customCards'] ??= [];
((window as unknown as Record<string, unknown[]>)['customCards']).push({
  type: 'electricity-panel-card',
  name: 'Electricity Panel Card',
  description: 'Circuit breaker panel — power, current, daily energy, HDO tariff',
  preview: false,
});
