import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { PRE_TARIFFS } from './tariff-presets.js';
import type {
  HomeAssistant,
  ElectricityPanelConfig,
  Circuit,
  CircuitDevice,
  DeviceChannel,
} from './types.js';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

@customElement('electricity-panel-editor')
export class ElectricityPanelEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _config!: ElectricityPanelConfig;
  @state() private _openCircuit = -1;
  @state() private _openDevice = -1;
  @state() private _dragOverIdx = -1;
  private _dragSrcIdx = -1;
  private _datalistFilled = false;

  // Block re-renders when only hass changes (it updates constantly in HA).
  // But on the first hass set, schedule datalist population.
  protected override shouldUpdate(changedProps: Map<string, unknown>): boolean {
    if (changedProps.size === 1 && changedProps.has('hass')) {
      if (!this._datalistFilled && this.hass) {
        requestAnimationFrame(() => this._populateDatalist());
      }
      return false;
    }
    return true;
  }

  // Also populate after the first render triggered by _config being set.
  protected override updated(changedProps: Map<string, unknown>): void {
    super.updated(changedProps);
    if (!this._datalistFilled && this.hass) {
      this._populateDatalist();
    }
  }

  private _populateDatalist(): void {
    if (this._datalistFilled || !this.hass) return;
    const dl = this.shadowRoot?.getElementById('ep-entities');
    if (!dl) return;
    dl.innerHTML = Object.keys(this.hass.states)
      .sort()
      .map(id => `<option value="${id}">`)
      .join('');
    this._datalistFilled = true;
  }

  setConfig(config: ElectricityPanelConfig): void {
    this._config = deepClone(config);
  }

  private _fire(config: ElectricityPanelConfig): void {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config },
      bubbles: true,
      composed: true,
    }));
  }

  private _set(path: string[], value: unknown): void {
    const cfg = deepClone(this._config);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let node: any = cfg;
    for (let i = 0; i < path.length - 1; i++) {
      if (node[path[i]] === undefined) node[path[i]] = {};
      node = node[path[i]];
    }
    const last = path[path.length - 1];
    if (value === '' || value === undefined) delete node[last];
    else node[last] = value;
    this._config = cfg;
    this._fire(cfg);
  }

  private _inputHandler(path: string[]): (e: Event) => void {
    return (e: Event) => this._set(path, (e.target as HTMLInputElement).value);
  }

  // ── Circuit management ─────────────────────────────────────────────────────

  private _addCircuit(): void {
    const cfg = deepClone(this._config);
    cfg.circuits ??= [];
    const n = cfg.circuits.length + 1;
    cfg.circuits.push({ id: `c${String(n).padStart(2, '0')}`, name: 'New circuit', phases: 1 });
    this._config = cfg;
    this._fire(cfg);
    this._openCircuit = cfg.circuits.length - 1;
    this._openDevice = -1;
  }

  private _removeCircuit(idx: number): void {
    const cfg = deepClone(this._config);
    cfg.circuits?.splice(idx, 1);
    this._config = cfg;
    this._fire(cfg);
    this._openCircuit = -1;
  }

  private _moveCircuit(idx: number, dir: -1 | 1): void {
    const cfg = deepClone(this._config);
    const arr = cfg.circuits ?? [];
    const t = idx + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    this._config = cfg;
    this._fire(cfg);
    this._openCircuit = t;
  }

  private _moveCircuitTo(from: number, to: number): void {
    if (from === to) return;
    const cfg = deepClone(this._config);
    const arr = cfg.circuits ?? [];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    this._config = cfg;
    this._fire(cfg);
    this._openCircuit = to;
    this._dragSrcIdx = -1;
    this._dragOverIdx = -1;
  }

  private _setCircuitField(idx: number, field: keyof Circuit, val: string): void {
    const cfg = deepClone(this._config);
    const c = cfg.circuits![idx];
    if (val === '') {
      delete (c as Record<string, unknown>)[field];
    } else {
      (c as Record<string, unknown>)[field] =
        field === 'phases' ? (parseInt(val) as 1 | 3) :
        field === 'max_current' ? parseFloat(val) : val;
    }
    if (field === 'name' && val) c.id = slugify(val);
    this._config = cfg;
    this._fire(cfg);
  }

  private _setCircuitCheck(idx: number, field: keyof Circuit, val: boolean): void {
    const cfg = deepClone(this._config);
    (cfg.circuits![idx] as Record<string, unknown>)[field] = val;
    this._config = cfg;
    this._fire(cfg);
  }

  // ── Device management ──────────────────────────────────────────────────────

  private _addDevice(ci: number): void {
    const cfg = deepClone(this._config);
    cfg.circuits![ci].devices ??= [];
    cfg.circuits![ci].devices!.push({ name: 'New device' });
    this._config = cfg;
    this._fire(cfg);
    this._openDevice = cfg.circuits![ci].devices!.length - 1;
  }

  private _removeDevice(ci: number, di: number): void {
    const cfg = deepClone(this._config);
    cfg.circuits![ci].devices?.splice(di, 1);
    this._config = cfg;
    this._fire(cfg);
    this._openDevice = -1;
  }

  private _setDeviceField(ci: number, di: number, field: keyof CircuitDevice, val: string): void {
    const cfg = deepClone(this._config);
    const d = cfg.circuits![ci].devices![di];
    if (val === '') delete (d as Record<string, unknown>)[field];
    else (d as Record<string, unknown>)[field] = val;
    this._config = cfg;
    this._fire(cfg);
  }

  // ── Channel management ─────────────────────────────────────────────────────

  private _addChannel(ci: number, di: number): void {
    const cfg = deepClone(this._config);
    cfg.circuits![ci].devices![di].channels ??= [];
    cfg.circuits![ci].devices![di].channels!.push({ name: 'New channel' });
    this._config = cfg;
    this._fire(cfg);
  }

  private _removeChannel(ci: number, di: number, chi: number): void {
    const cfg = deepClone(this._config);
    cfg.circuits![ci].devices![di].channels?.splice(chi, 1);
    this._config = cfg;
    this._fire(cfg);
  }

  private _setChannelField(ci: number, di: number, chi: number, field: keyof DeviceChannel, val: string): void {
    const cfg = deepClone(this._config);
    const ch = cfg.circuits![ci].devices![di].channels![chi];
    if (val === '') delete (ch as Record<string, unknown>)[field];
    else (ch as Record<string, unknown>)[field] = val;
    this._config = cfg;
    this._fire(cfg);
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  private _entityField(label: string, value: string | undefined, onChange: (v: string) => void): TemplateResult {
    return html`
      <div class="field">
        <label>${label}</label>
        <input list="ep-entities" .value=${value ?? ''} placeholder="entity_id"
          @change=${(e: Event) => onChange((e.target as HTMLInputElement).value)} />
      </div>`;
  }

  private _textField(label: string, value: string | undefined, onChange: (v: string) => void, ph = ''): TemplateResult {
    return html`
      <div class="field">
        <label>${label}</label>
        <input type="text" .value=${value ?? ''} placeholder=${ph}
          @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)} />
      </div>`;
  }

  private _numField(label: string, value: number | undefined, onChange: (v: string) => void, ph = ''): TemplateResult {
    return html`
      <div class="field">
        <label>${label}</label>
        <input type="number" min="0" .value=${value !== undefined ? String(value) : ''} placeholder=${ph}
          @change=${(e: Event) => onChange((e.target as HTMLInputElement).value)} />
      </div>`;
  }

  // ── Section renderers ──────────────────────────────────────────────────────

  private _renderMeterSection(): TemplateResult {
    const m = this._config.main_meter ?? {};
    const s = (f: string) => (v: string) => this._set(['main_meter', f], v);
    return html`
      <details class="section">
        <summary>Main meter</summary>
        <div class="section-body">
          <div class="group-label">Power (W per phase)</div>
          ${this._entityField('L1 power', m.power_l1, s('power_l1'))}
          ${this._entityField('L2 power', m.power_l2, s('power_l2'))}
          ${this._entityField('L3 power', m.power_l3, s('power_l3'))}
          <div class="group-label">Current (A per phase)</div>
          ${this._entityField('L1 current', m.current_l1, s('current_l1'))}
          ${this._entityField('L2 current', m.current_l2, s('current_l2'))}
          ${this._entityField('L3 current', m.current_l3, s('current_l3'))}
          <div class="group-label">Energy</div>
          ${this._entityField('Energy today (kWh)', m.energy_today, s('energy_today'))}
        </div>
      </details>`;
  }

  private _renderHdoSection(): TemplateResult {
    const h = this._config.hdo ?? {};
    const s = (f: string) => (v: string) => this._set(['hdo', f], v);
    return html`
      <details class="section">
        <summary>HDO (time-of-use tariff)</summary>
        <div class="section-body">
          ${this._entityField('HDO switch (on = NT / low tariff)', h.switch, s('switch'))}
          ${this._entityField('Next high tariff start', h.next_high, s('next_high'))}
          ${this._entityField('Next low tariff start', h.next_low, s('next_low'))}
          ${this._entityField('Workday sensor', h.workday_sensor, s('workday_sensor'))}
          <div class="field">
            <label>PRE tariff preset (NT schedule)</label>
            <select @change=${(e: Event) => s('tariff_preset')((e.target as HTMLSelectElement).value)}>
              <option value="" ?selected=${!h.tariff_preset}>— none / manual schedule —</option>
              ${Object.entries(PRE_TARIFFS).map(([code, preset]) => html`
                <option value="${code}" ?selected=${h.tariff_preset === code}>
                  ${code} — ${preset.label.replace(/^PRE \d+ — /, '')}
                </option>
              `)}
            </select>
            <span class="field-hint">
              Enables the NT schedule timeline in the card.
              Weekday / weekend / holiday schedules are loaded automatically.
            </span>
          </div>
          <div class="group-label" style="margin-top:12px;">Tariff prices (optional)</div>
          ${this._numField('NT price per kWh (low tariff)', h.nt_price as number | undefined, s('nt_price'), '0.00')}
          ${this._numField('VT price per kWh (high tariff)', h.vt_price as number | undefined, s('vt_price'), '0.00')}
          ${this._textField('Currency symbol', h.currency, s('currency'), 'Kč')}
        </div>
      </details>`;
  }

  private _renderChannelRow(ci: number, di: number, ch: DeviceChannel, chi: number): TemplateResult {
    const s = (f: keyof DeviceChannel) => (v: string) => this._setChannelField(ci, di, chi, f, v);
    return html`
      <div class="channel-block">
        <div class="ch-header">
          <span>Channel ${chi + 1}: ${ch.name || '(unnamed)'}</span>
          <button class="btn-icon danger" title="Remove"
            @click=${() => this._removeChannel(ci, di, chi)}>
            <ha-icon icon="mdi:minus-circle-outline"></ha-icon>
          </button>
        </div>
        ${this._textField('Name', ch.name, s('name'), 'e.g. Living room zone')}
        ${this._entityField('Switch', ch.switch, s('switch'))}
        ${this._entityField('Power (W)', ch.power, s('power'))}
        ${this._entityField('Current (A)', ch.current, s('current'))}
      </div>`;
  }

  private _renderDeviceRow(ci: number, d: CircuitDevice, di: number): TemplateResult {
    const open = this._openDevice === di;
    const s = (f: keyof CircuitDevice) => (v: string) => this._setDeviceField(ci, di, f, v);
    return html`
      <div class="sub-item ${open ? 'open' : ''}"
        @dragover=${(e: DragEvent) => { e.preventDefault(); if (this._dragSrcIdx !== idx) this._dragOverIdx = idx; }}
        @dragleave=${() => { if (this._dragOverIdx === idx) this._dragOverIdx = -1; }}
        @drop=${(e: DragEvent) => { e.preventDefault(); if (this._dragSrcIdx >= 0 && this._dragSrcIdx !== idx) this._moveCircuitTo(this._dragSrcIdx, idx); }}>
        <div class="row-hdr" @click=${() => { this._openDevice = open ? -1 : di; }}>
          <span class="row-lbl">${d.name || '(unnamed device)'}</span>
          <div class="row-acts" @click=${(e: Event) => e.stopPropagation()}>
            <button class="btn-icon danger" @click=${() => this._removeDevice(ci, di)}>
              <ha-icon icon="mdi:minus-circle-outline"></ha-icon>
            </button>
          </div>
          <ha-icon icon="${open ? 'mdi:chevron-up' : 'mdi:chevron-down'}" class="chevron"></ha-icon>
        </div>
        ${open ? html`
          <div class="sub-fields">
            ${this._textField('Device name', d.name, s('name'), 'e.g. Washing machine')}
            ${this._entityField('Switch', d.switch, s('switch'))}
            ${this._entityField('Power (W)', d.power, s('power'))}
            ${this._entityField('Current (A)', d.current, s('current'))}
            <div class="group-label" style="margin-top:10px;">
              Channels (for multi-relay devices like Shelly 4PM)
            </div>
            ${(d.channels ?? []).map((ch, chi) => this._renderChannelRow(ci, di, ch, chi))}
            <button class="btn-add" @click=${() => this._addChannel(ci, di)}>
              <ha-icon icon="mdi:plus"></ha-icon> Add channel
            </button>
          </div>` : nothing}
      </div>`;
  }

  private _renderCircuitRow(c: Circuit, idx: number): TemplateResult {
    const open = this._openCircuit === idx;
    const total = this._config.circuits?.length ?? 0;
    const sf = (f: keyof Circuit) => (v: string) => this._setCircuitField(idx, f, v);
    return html`
      <div class="sub-item ${open ? 'open' : ''}">
        <div class="row-hdr ${this._dragOverIdx === idx ? 'drag-over' : ''}"
          @click=${() => { this._openCircuit = open ? -1 : idx; this._openDevice = -1; }}>
          <ha-icon icon="mdi:drag-vertical" class="drag-handle"
            draggable="true"
            @dragstart=${(e: DragEvent) => { e.stopPropagation(); this._dragSrcIdx = idx; e.dataTransfer!.effectAllowed = 'move'; }}
            @dragend=${(e: DragEvent) => { e.stopPropagation(); this._dragOverIdx = -1; }}
            @click=${(e: Event) => e.stopPropagation()}>
          </ha-icon>
          <span class="row-lbl">${c.name || '(unnamed circuit)'}</span>
          <div class="badges">
            ${c.phases === 3 ? html`<span class="badge info">3ph</span>` : nothing}
            ${c.critical ? html`<span class="badge warn">critical</span>` : nothing}
          </div>
          <div class="row-acts" @click=${(e: Event) => e.stopPropagation()}>
            <button class="btn-icon danger" @click=${() => this._removeCircuit(idx)}>
              <ha-icon icon="mdi:minus-circle-outline"></ha-icon>
            </button>
          </div>
          <ha-icon icon="${open ? 'mdi:chevron-up' : 'mdi:chevron-down'}" class="chevron"></ha-icon>
        </div>
        ${open ? html`
          <div class="sub-fields">
            ${this._textField('Circuit name', c.name, sf('name'), 'e.g. Kitchen left')}
            ${this._textField('Circuit ID', c.id, sf('id'), 'e.g. c08')}
            <div class="field">
              <label>Phases</label>
              <select @change=${(e: Event) => this._setCircuitField(idx, 'phases', (e.target as HTMLSelectElement).value)}>
                <option value="1" ?selected=${c.phases !== 3}>1 — single-phase</option>
                <option value="3" ?selected=${c.phases === 3}>3 — three-phase</option>
              </select>
            </div>
            <div class="field checkbox">
              <input type="checkbox" id="crit-${idx}" .checked=${c.critical ?? false}
                @change=${(e: Event) => this._setCircuitCheck(idx, 'critical', (e.target as HTMLInputElement).checked)} />
              <label for="crit-${idx}">Critical circuit (disables remote toggle)</label>
            </div>
            ${this._numField('Max current A (breaker rating)', c.max_current, sf('max_current'), c.phases === 3 ? '63' : '16')}
            <div class="group-label" style="margin-top:10px;">Breaker entities</div>
            ${this._entityField('Switch', c.switch, sf('switch'))}
            ${this._entityField('Power (W)', c.power, sf('power'))}
            ${this._entityField('Current (A)', c.current, sf('current'))}
            ${this._entityField('Energy today (kWh)', c.energy, sf('energy'))}
            ${this._entityField('Voltage (V)', c.voltage, sf('voltage'))}
            <div class="group-label" style="margin-top:10px;">Devices behind this breaker</div>
            ${(c.devices ?? []).map((d, di) => this._renderDeviceRow(idx, d, di))}
            <button class="btn-add" @click=${() => this._addDevice(idx)}>
              <ha-icon icon="mdi:plus"></ha-icon> Add device
            </button>
          </div>` : nothing}
      </div>`;
  }

  // ── Main render ────────────────────────────────────────────────────────────

  override render(): TemplateResult {
    if (!this._config) return html``;
    return html`
      <datalist id="ep-entities"></datalist>
      <div class="editor">
        ${this._textField('Card title (optional)', this._config.title,
          (v) => this._set(['title'], v), 'Electricity panel')}
        ${this._renderMeterSection()}
        ${this._renderHdoSection()}
        <div class="sec-hdr">Circuits</div>
        ${(this._config.circuits ?? []).map((c, i) => this._renderCircuitRow(c, i))}
        <button class="btn-add primary" @click=${() => this._addCircuit()}>
          <ha-icon icon="mdi:plus-circle-outline"></ha-icon> Add circuit
        </button>
      </div>`;
  }

  static override styles = css`
    :host { display: block; }
    .editor { padding: 4px 0 8px; }

    .field { margin-bottom: 8px; }
    .field label {
      display: block; font-size: 12px;
      color: var(--secondary-text-color); margin-bottom: 3px;
    }
    .field input[type="text"],
    .field input[type="number"],
    .field input:not([type]) {
      width: 100%; box-sizing: border-box;
      padding: 6px 10px; border-radius: 6px;
      border: 1px solid var(--divider-color, rgba(0,0,0,0.15));
      background: var(--primary-background-color);
      color: var(--primary-text-color); font-size: 13px;
    }
    .field select {
      padding: 6px 10px; border-radius: 6px;
      border: 1px solid var(--divider-color, rgba(0,0,0,0.15));
      background: var(--primary-background-color);
      color: var(--primary-text-color); font-size: 13px; cursor: pointer;
    }
    .field.checkbox { display: flex; align-items: center; gap: 8px; flex-direction: row-reverse; justify-content: flex-end; }
    .field.checkbox label { font-size: 13px; color: var(--primary-text-color); cursor: pointer; margin: 0; }
    .field.checkbox input { width: auto; }

    .field-hint {
      display: block;
      font-size: 11px;
      color: var(--secondary-text-color);
      margin-top: 4px;
      line-height: 1.4;
    }
    .group-label {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--disabled-text-color); margin-bottom: 6px;
    }
    .sec-hdr {
      font-size: 12px; font-weight: 500; text-transform: uppercase;
      letter-spacing: 0.8px; color: var(--secondary-text-color); margin: 12px 0 6px;
    }

    details.section {
      border: 1px solid var(--divider-color, rgba(0,0,0,0.1));
      border-radius: 8px; margin-bottom: 8px;
    }
    details.section > summary {
      padding: 10px 12px; font-size: 13px; font-weight: 500;
      color: var(--primary-text-color); cursor: pointer; user-select: none; list-style: none;
    }
    details.section > summary::-webkit-details-marker { display: none; }
    .section-body { padding: 4px 12px 12px; }

    .sub-item {
      border: 1px solid var(--divider-color, rgba(0,0,0,0.1));
      border-radius: 8px; margin-bottom: 6px; overflow: hidden;
    }
    .sub-item.open { border-color: var(--primary-color, #2196f3); }

    .row-hdr {
      display: flex; align-items: center; gap: 6px;
      padding: 9px 12px; cursor: pointer; user-select: none;
    }
    .row-hdr:hover { background: var(--secondary-background-color); }
    .row-lbl { flex: 1; font-size: 13px; color: var(--primary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badges { display: flex; gap: 4px; flex-shrink: 0; }
    .row-acts { display: flex; gap: 2px; flex-shrink: 0; }
    .chevron { --mdc-icon-size: 18px; color: var(--secondary-text-color); flex-shrink: 0; }
    .sub-fields { padding: 4px 12px 12px; }

    .channel-block {
      border: 1px solid var(--divider-color, rgba(0,0,0,0.08));
      border-radius: 6px; padding: 8px 10px; margin-bottom: 6px;
    }
    .ch-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 12px; color: var(--secondary-text-color); }

    .badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 600; }
    .badge.info { background: rgba(33,150,243,0.12); color: var(--primary-color, #2196f3); }
      .badge.warn { background: rgba(245,124,0,0.12); color: var(--warning-color, #f57c00); }

    .drag-handle {
      --mdc-icon-size: 18px;
      color: var(--disabled-text-color);
      cursor: grab;
      flex-shrink: 0;
      touch-action: none;
    }
    .drag-handle:active { cursor: grabbing; }
    .row-hdr.drag-over {
      background: var(--secondary-background-color);
      border-top: 2px solid var(--primary-color, #2196f3);
    }
    .btn-icon { background: none; border: none; cursor: pointer; color: var(--secondary-text-color); padding: 2px; border-radius: 4px; display: flex; align-items: center; }
    .btn-icon:hover { background: var(--secondary-background-color); }
    .btn-icon.danger:hover { color: var(--error-color, #e53935); }
    .btn-icon ha-icon { --mdc-icon-size: 18px; }

    .btn-add {
      display: flex; align-items: center; gap: 6px;
      background: none; border: 1px dashed var(--divider-color, rgba(0,0,0,0.2));
      border-radius: 6px; padding: 7px 12px; font-size: 13px;
      color: var(--secondary-text-color); cursor: pointer; width: 100%; margin-top: 4px;
    }
    .btn-add:hover { background: var(--secondary-background-color); }
    .btn-add.primary { border-color: var(--primary-color, #2196f3); color: var(--primary-color, #2196f3); margin-top: 8px; }
    .btn-add ha-icon { --mdc-icon-size: 18px; }
  `;
}
