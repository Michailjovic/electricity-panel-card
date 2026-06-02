import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './electricity-panel-editor.js';
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

  // ── Render sections ────────────────────────────────────────────────────────

  private _renderHdo(): TemplateResult | typeof nothing {
    const hdo = this._config.hdo;
    if (!hdo?.switch) return nothing;
    const isNT = this._isOn(hdo.switch);
    const cd = this._hdoCountdown();
    return html`
      <div class="hdo-bar ${isNT ? 'nt' : 'vt'}">
        <ha-icon icon="mdi:lightning-bolt-circle"></ha-icon>
        <span class="hdo-label">${isNT ? 'NT — low tariff' : 'VT — high tariff'}</span>
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
            <span class="metric-primary">${power.toFixed(0)} W</span>
            <span class="metric-small">
              ${current.toFixed(1)} A
              ${energy > 0 ? html` · ${energy.toFixed(1)} kWh today` : nothing}
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
          ${power > 0 ? html`${power.toFixed(0)} W` : nothing}
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
          ${power > 0 ? html`${power.toFixed(0)} W` : nothing}
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
