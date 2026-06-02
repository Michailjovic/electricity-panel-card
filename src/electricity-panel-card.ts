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
  MainMeter,
} from './types.js';

@customElement('electricity-panel-card')
export class ElectricityPanelCard extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @state() private _config!: ElectricityPanelConfig;
  @state() private _expanded = new Set<string>();
  @state() private _showTomorrow = false;

  private _timer?: number;

  override connectedCallback(): void {
    super.connectedCallback();
    // Refresh every 30 s so countdowns stay accurate between entity updates
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
    return {
      type: 'custom:electricity-panel-card',
      circuits: [],
    };
  }

  getCardSize(): number {
    return 4 + Math.ceil((this._config.circuits?.length ?? 0) / 2);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _state(id?: string): string {
    if (!id) return 'unavailable';
    return this.hass?.states[id]?.state ?? 'unavailable';
  }

  private _num(id?: string): number {
    const s = this._state(id);
    const n = parseFloat(s);
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
    if (pct > 80) return 'var(--error-color, #e53935)';
    if (pct > 55) return 'var(--warning-color, #f57c00)';
    return 'var(--success-color, #43a047)';
  }

  /** Return power in W, auto-converting from kW/MW if needed */
  private _watts(entityId?: string): number {
    if (!entityId) return 0;
    const entity = this.hass?.states[entityId];
    if (!entity) return 0;
    const val = parseFloat(entity.state);
    if (isNaN(val)) return 0;
    const unit = (entity.attributes['unit_of_measurement'] as string | undefined) ?? '';
    if (unit === 'kW') return val * 1000;
    if (unit === 'MW') return val * 1_000_000;
    return val; // assumes W
  }

  /** Format watts for display: W below 1 kW, kW above */
  private _fmtW(w: number): string {
    if (w >= 1000) return `${(w / 1000).toFixed(2)} kW`;
    return `${w.toFixed(0)} W`;
  }

  /** Return energy in kWh, auto-converting from Wh/MWh if needed */
  private _kwh(entityId?: string): number {
    if (!entityId) return 0;
    const entity = this.hass?.states[entityId];
    if (!entity) return 0;
    const val = parseFloat(entity.state);
    if (isNaN(val)) return 0;
    const unit = (entity.attributes['unit_of_measurement'] as string | undefined) ?? '';
    if (unit === 'Wh') return val / 1000;
    if (unit === 'MWh') return val * 1000;
    return val; // assumes kWh
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

  // ── HDO schedule ───────────────────────────────────────────────────────────

  private _dayType(): 'weekday' | 'weekend' | 'holiday' {
    const isWorkday = this._isOn(this._config.hdo?.workday_sensor);
    const d = new Date().getDay(); // 0=Sun, 6=Sat
    if (isWorkday) return 'weekday';
    if (d === 0 || d === 6) return 'weekend';
    return 'holiday';
  }

  private _ntRemainingMins(starts: string[], offsets: number[]): number {
    const now = Date.now();
    const midnight = new Date(); midnight.setHours(0,0,0,0);
    let rem = 0;
    starts.forEach((s, i) => {
      const [h, m] = s.split(':').map(Number);
      const st = midnight.getTime() + (h*60+m)*60000;
      const en = st + offsets[i]*60000;
      if (now < en) rem += (en - Math.max(now, st)) / 60000;
    });
    return rem;
  }

  private _fmtMins(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  private _tomorrowDayType(): 'weekday' | 'weekend' {
    const d = (new Date().getDay() + 1) % 7;
    return (d === 0 || d === 6) ? 'weekend' : 'weekday';
  }

  private _fmtCostRate(watts: number): string {
    const hdo = this._config.hdo;
    if (!hdo?.nt_price && !hdo?.vt_price) return '';
    const isNT = this._isOn(hdo.switch);
    const price = isNT ? (hdo.nt_price ?? 0) : (hdo.vt_price ?? 0);
    const cur = hdo.currency ?? 'Kč';
    return `${((watts / 1000) * price).toFixed(2)} ${cur}/h`;
  }

  private _renderHdoSchedule(): TemplateResult | typeof nothing {
    const hdo = this._config.hdo;
    if (!hdo) return nothing;
    const preset = hdo.tariff_preset ? PRE_TARIFFS[hdo.tariff_preset] : undefined;
    const src = preset ?? hdo.schedule;
    if (!src) return nothing;

    const showing = this._showTomorrow;
    const dt = showing ? this._tomorrowDayType() : this._dayType();
    const day = dt === 'holiday' && src.holiday ? src.holiday
      : dt === 'weekend' ? src.weekend : src.weekday;

    const isNT = this._isOn(hdo.switch);
    const color = isNT ? 'var(--success-color,#43a047)' : 'var(--error-color,#e53935)';
    const now = Date.now();
    const midnight = new Date(); midnight.setHours(0,0,0,0);
    const base = showing ? midnight.getTime() + 86400000 : midnight.getTime();
    const fmt = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});

    const slots = day.starts.map((start, i) => {
      const [h, m] = start.split(':').map(Number);
      const s = base + (h*60+m)*60000;
      const e = s + day.offsets[i]*60000;
      const isPast = !showing && now >= e;
      const isCurrent = !showing && now >= s && now < e;
      const pct = isCurrent ? Math.min(100, ((now-s)/(e-s))*100) : isPast ? 100 : 0;
      const dur = day.offsets[i];
      const durStr = dur >= 60 ? `${Math.floor(dur/60)}h${dur%60 ? ` ${dur%60}m` : ''}` : `${dur}m`;
      return { label: `${fmt(s)}–${fmt(e)}`, isPast, isCurrent, pct, durStr };
    });

    const remaining = showing ? null : this._ntRemainingMins(day.starts, day.offsets);
    const totalNT = day.offsets.reduce((a, b) => a + b, 0);

    return html`
      <div class="schedule-block">
        <div class="schedule-title">
          <span>${showing ? "Tomorrow's" : "Today's"} NT schedule
            <span class="schedule-day">${dt}</span>
          </span>
          <div class="schedule-nav">
            ${remaining !== null ? html`<span class="nt-remaining">${this._fmtMins(remaining)} left · ${this._fmtMins(totalNT)} total</span>` : nothing}
            <button class="sday-btn" @click=${() => { this._showTomorrow = !this._showTomorrow; }}>
              ${showing ? 'Today' : 'Tomorrow'}
            </button>
          </div>
        </div>
        ${slots.map(sl => html`
          <div class="srow ${sl.isPast ? 'past' : sl.isCurrent ? 'active' : ''}">
            <span class="srow-time">${sl.label}</span>
            <div class="srow-track">
              <div class="srow-fill" style="width:${sl.pct.toFixed(1)}%;background:${color}"></div>
            </div>
            ${sl.isCurrent
              ? html`<span class="snow" style="background:${color}">Now</span>`
              : html`<span class="sdur">${sl.durStr}</span>`}
          </div>
        `)}
      </div>
    `;
  }

  // ── Render sections ────────────────────────────────────────────────────────

  private _renderHdo(): TemplateResult | typeof nothing {
    const hdo = this._config.hdo;
    if (!hdo?.switch) return nothing;
    const isNT = this._isOn(hdo.switch);
    const cd = this._hdoCountdown();
    const price = isNT ? hdo.nt_price : hdo.vt_price;
    const cur = hdo.currency ?? 'Kč';
    return html`
      <div class="hdo-bar ${isNT ? 'nt' : 'vt'}">
        <ha-icon icon="mdi:lightning-bolt-circle"></ha-icon>
        <span class="hdo-label">${isNT ? 'NT — low tariff' : 'VT — high tariff'}</span>
        ${price ? html`<span class="hdo-price">${price} ${cur}/kWh</span>` : nothing}
        ${cd ? html`<span class="hdo-cd">ends in ${cd}</span>` : nothing}
      </div>
    `;
  }

  private _renderMainMeter(): TemplateResult | typeof nothing {
    const m = this._config.main_meter;
    if (!m) return nothing;
    const totalW = this._watts(m.power_l1) + this._watts(m.power_l2) + this._watts(m.power_l3);
    const phases: Array<{ label: string; power: string | undefined; current: string | undefined }> = [
      { label: 'L1', power: m.power_l1, current: m.current_l1 },
      { label: 'L2', power: m.power_l2, current: m.current_l2 },
      { label: 'L3', power: m.power_l3, current: m.current_l3 },
    ];
    return html`
      <div class="section-block">
        <div class="meter-header">
          <ha-icon icon="mdi:transmission-tower"></ha-icon>
          <span class="meter-title">Main meter</span>
          <span class="badge badge-info">3φ</span>
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

  private _renderCircuit(c: Circuit): TemplateResult {
    const isOn = this._isOn(c.switch);
    const power = this._watts(c.power);
    const current = this._num(c.current);
    const energy = this._kwh(c.energy);
    const maxA = c.max_current ?? (c.phases === 3 ? 63 : 16);
    const loadPct = Math.min(100, current > 0 ? (current / maxA) * 100 : (power / (maxA * 230)) * 100);
    const barColor = this._loadColor(loadPct);
    const expanded = this._expanded.has(c.id);
    const hasDevices = (c.devices?.length ?? 0) > 0;

    return html`
      <div class="circuit-card ${c.critical ? 'critical' : ''} ${c.phases === 3 ? 'three-phase' : ''}">

        <div class="circuit-header">
          <div class="status-dot ${isOn ? 'on' : 'off'}"></div>
          <span class="circuit-name">${c.name}</span>
          <span class="circuit-id">${c.id}</span>
          ${c.phases === 3 ? html`<span class="badge badge-info">3φ</span>` : nothing}
          ${c.critical
            ? html`<ha-icon icon="mdi:lock" class="lock-icon" title="Critical circuit — remote off disabled"></ha-icon>`
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
              ${c.voltage ? html` · ${this._num(c.voltage).toFixed(0)} V` : nothing}
              ${energy > 0 ? html` · ${energy.toFixed(2)} kWh` : nothing}
              ${power > 0 && this._fmtCostRate(power) ? html` · <span class="cost-rate">${this._fmtCostRate(power)}</span>` : nothing}
            </span>
          </div>
          ${hasDevices
            ? html`<button class="expand-btn" @click=${() => this._toggleExpanded(c.id)}>
                <ha-icon icon="${expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
                <span>${expanded ? 'hide' : 'devices'}</span>
              </button>`
            : nothing}
        </div>

        ${expanded && hasDevices
          ? html`<div class="devices-section">${c.devices!.map(d => this._renderDevice(d))}</div>`
          : nothing}
      </div>
    `;
  }

  private _renderDevice(d: CircuitDevice): TemplateResult {
    const hasChannels = (d.channels?.length ?? 0) > 0;
    if (hasChannels) {
      return html`
        <div class="device-group">
          <div class="device-group-label">${d.name}</div>
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
            <div class="circuit-grid three-phase-row">
              ${threePhase.map(c => this._renderCircuit(c))}
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
    :host { display: block; }

    ha-card { overflow: hidden; }

    .card-header {
      padding: 16px 16px 0;
      font-size: 16px;
      font-weight: 500;
      color: var(--primary-text-color);
    }

    .card-content { padding: 12px 12px 16px; }

    /* HDO schedule */
    .schedule-block {
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 10px;
    }
    .schedule-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--secondary-text-color);
      margin-bottom: 10px;
    }
    .schedule-day {
      font-size: 9px;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--primary-color, #2196f3);
      color: white;
      opacity: 0.7;
      text-transform: capitalize;
      letter-spacing: 0.3px;
    }
    .srow {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 5px 0;
      border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.06));
      opacity: 0.4;
    }
    .srow:last-child { border-bottom: none; }
    .srow.active { opacity: 1; }
    .srow:not(.past):not(.active) { opacity: 0.65; }
    .srow-time {
      font-size: 12px;
      font-weight: 500;
      color: var(--primary-text-color);
      white-space: nowrap;
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
      min-width: 110px;
    }
    .srow-track {
      flex: 1;
      height: 3px;
      background: var(--divider-color, rgba(0,0,0,0.1));
      border-radius: 2px;
      overflow: hidden;
    }
    .srow-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 1s ease;
    }
    .snow {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 4px;
      color: #000;
      flex-shrink: 0;
    }
    .sdur {
      font-size: 10px;
      color: var(--disabled-text-color);
      flex-shrink: 0;
      min-width: 30px;
      text-align: right;
    }
    .schedule-nav {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }
    .nt-remaining {
      font-size: 10px;
      color: var(--secondary-text-color);
      white-space: nowrap;
    }
    .sday-btn {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid var(--divider-color, rgba(0,0,0,0.15));
      background: none;
      color: var(--secondary-text-color);
      cursor: pointer;
      white-space: nowrap;
    }
    .sday-btn:hover { background: var(--secondary-background-color); }
    .cost-rate {
      color: var(--warning-color, #f57c00);
      font-weight: 500;
    }

    /* HDO bar */
    .hdo-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      margin-bottom: 12px;
      font-size: 13px;
      font-weight: 500;
    }
    .hdo-bar.nt { background: rgba(67,160,71,0.12); color: var(--success-color, #43a047); }
    .hdo-bar.vt { background: rgba(229,57,53,0.12); color: var(--error-color, #e53935); }
    .hdo-bar ha-icon { --mdc-icon-size: 18px; }
    .hdo-label { flex: 1; }
    .hdo-cd { font-size: 12px; opacity: 0.75; }
    .hdo-price {
      font-size: 12px;
      opacity: 0.8;
      font-weight: 600;
      margin-left: auto;
      margin-right: 4px;
    }

    /* Section utilities */
    .section-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--secondary-text-color);
      margin: 12px 0 6px;
    }
    .section-block {
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 10px;
    }

    /* Main meter */
    .meter-header {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 10px;
    }
    .meter-header ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
    .meter-title { font-size: 13px; color: var(--secondary-text-color); }
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
      background: var(--primary-background-color, #fff);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .phase-label { font-size: 11px; color: var(--disabled-text-color); margin-bottom: 2px; }
    .phase-power { font-size: 15px; font-weight: 500; color: var(--primary-text-color); }
    .phase-detail { font-size: 11px; color: var(--secondary-text-color); margin-top: 2px; }

    /* Circuit grid */
    .circuit-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    /* Circuit card */
    .circuit-card {
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      border-radius: 10px;
      padding: 12px 14px;
      border: 1px solid transparent;
    }
    .circuit-card.critical {
      border-left: 3px solid var(--warning-color, #f57c00);
    }

    .circuit-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 2px;
    }
    .circuit-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--primary-text-color);
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .circuit-id {
      font-size: 11px;
      color: var(--disabled-text-color);
      flex-shrink: 0;
    }
    .lock-icon {
      --mdc-icon-size: 16px;
      color: var(--warning-color, #f57c00);
      flex-shrink: 0;
    }

    /* Load bar */
    .load-track {
      height: 3px;
      background: var(--divider-color, rgba(0,0,0,0.1));
      border-radius: 2px;
      overflow: hidden;
      margin: 8px 0 6px;
    }
    .load-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 1s ease;
    }

    /* Footer */
    .circuit-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .metrics {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    .metric-primary {
      font-size: 15px;
      font-weight: 500;
      color: var(--primary-text-color);
    }
    .metric-small {
      font-size: 11px;
      color: var(--secondary-text-color);
      white-space: nowrap;
    }

    /* Badge */
    .badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .badge-info {
      background: rgba(var(--rgb-primary-color, 33,150,243), 0.12);
      color: var(--primary-color, #2196f3);
    }

    /* Toggle switch */
    .toggle {
      width: 34px;
      height: 18px;
      border-radius: 9px;
      border: none;
      cursor: pointer;
      position: relative;
      flex-shrink: 0;
      transition: background 0.2s;
    }
    .toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: white;
      transition: left 0.2s;
    }
    .toggle.on  { background: var(--success-color, #43a047); }
    .toggle.on::after  { left: 18px; }
    .toggle.off { background: var(--disabled-text-color, #9e9e9e); }
    .toggle.off::after { left: 2px; }
    .toggle.sm  { width: 28px; height: 16px; border-radius: 8px; }
    .toggle.sm::after { width: 12px; height: 12px; }
    .toggle.sm.on::after  { left: 14px; }
    .toggle.sm.off::after { left: 2px; }

    /* Expand button */
    .expand-btn {
      display: flex;
      align-items: center;
      gap: 2px;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--secondary-text-color);
      font-size: 11px;
      padding: 0;
      flex-shrink: 0;
    }
    .expand-btn ha-icon { --mdc-icon-size: 16px; }

    /* Status dot */
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .status-dot.on  { background: var(--success-color, #43a047); }
    .status-dot.off { background: var(--disabled-text-color, #9e9e9e); }
    .status-dot.none { background: transparent; border: 1px solid var(--divider-color); }
    .status-dot.sm  { width: 7px; height: 7px; }

    /* Devices section */
    .devices-section {
      border-top: 1px solid var(--divider-color, rgba(0,0,0,0.1));
      margin-top: 8px;
      padding-top: 8px;
    }
    .device-group { margin-bottom: 6px; }
    .device-group-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--disabled-text-color);
      margin-bottom: 4px;
      padding-left: 16px;
    }
    .device-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.06));
    }
    .device-row:last-child { border-bottom: none; }
    .device-row.channel { padding-left: 8px; }
    .device-name {
      flex: 1;
      font-size: 12px;
      color: var(--primary-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .device-metrics {
      font-size: 11px;
      color: var(--secondary-text-color);
      white-space: nowrap;
      flex-shrink: 0;
    }
  `;
}

// Register the card in the HA card picker
(window as unknown as Record<string, unknown>)['customCards'] ??= [];
((window as unknown as Record<string, unknown[]>)['customCards']).push({
  type: 'electricity-panel-card',
  name: 'Electricity Panel Card',
  description: 'Circuit breaker panel — power, current, daily energy, HDO tariff',
  preview: false,
});
