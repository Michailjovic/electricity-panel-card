import { css, LitElement, html, nothing } from "lit";
import { property, state, customElement } from "lit/decorators.js";
const PRE_TARIFFS = {
  // 600: D25d/D26d appliance — Excel code 600
  "600": {
    label: "PRE 600 — D25d / D26d",
    weekday: { starts: ["00:40", "12:40"], offsets: [300, 180] },
    weekend: { starts: ["02:40", "12:40"], offsets: [180, 300] },
    holiday: { starts: ["00:40", "12:20"], offsets: [300, 180] }
  },
  // 601: C45d hot water — Excel code 601
  "601": {
    label: "PRE 601 — C45d (hot water / TUV)",
    weekday: { starts: ["01:00", "04:40", "14:00"], offsets: [180, 120, 180] },
    weekend: { starts: ["01:20", "11:00", "14:00"], offsets: [160, 140, 180] },
    holiday: { starts: ["02:00", "06:40", "15:00"], offsets: [240, 80, 160] }
  },
  // 605: D57d main NT — Excel code 605
  // 7 windows/day; starts at 00:00 and ends at 24:00 (midnight-bordering)
  "605": {
    label: "PRE 605 — D57d (main NT)",
    weekday: {
      starts: ["00:00", "01:40", "05:20", "10:00", "13:40", "18:20", "22:00"],
      offsets: [60, 180, 240, 180, 240, 180, 120]
    },
    weekend: {
      starts: ["00:00", "02:40", "06:20", "10:00", "13:40", "19:20", "23:00"],
      offsets: [120, 180, 180, 180, 300, 180, 60]
    },
    holiday: {
      starts: ["00:00", "02:20", "07:00", "11:40", "15:20", "19:00", "22:40"],
      offsets: [100, 240, 240, 180, 180, 180, 80]
    }
  },
  // 606: D57d appliance — Excel code 606 (identical schedule to 605)
  "606": {
    label: "PRE 606 — D57d (appliance)",
    weekday: {
      starts: ["00:00", "01:40", "05:20", "10:00", "13:40", "18:20", "22:00"],
      offsets: [60, 180, 240, 180, 240, 180, 120]
    },
    weekend: {
      starts: ["00:00", "02:40", "06:20", "10:00", "13:40", "19:20", "23:00"],
      offsets: [120, 180, 180, 180, 300, 180, 60]
    },
    holiday: {
      starts: ["00:00", "02:20", "07:00", "11:40", "15:20", "19:00", "22:40"],
      offsets: [100, 240, 240, 180, 180, 180, 80]
    }
  },
  // 607: D57d hot water — Excel code 607
  "607": {
    label: "PRE 607 — D57d (hot water / TUV)",
    weekday: { starts: ["01:40", "05:20", "13:40"], offsets: [180, 120, 180] },
    weekend: { starts: ["03:00", "06:20", "13:40"], offsets: [160, 120, 200] },
    holiday: { starts: ["02:20", "07:00", "15:20"], offsets: [240, 80, 160] }
  }
};
var __defProp$1 = Object.defineProperty;
var __getOwnPropDesc$1 = Object.getOwnPropertyDescriptor;
var __decorateClass$1 = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc$1(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp$1(target, key, result);
  return result;
};
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
let ElectricityPanelEditor = class extends LitElement {
  constructor() {
    super(...arguments);
    this._openCircuit = -1;
    this._openDevice = -1;
    this._dragOverIdx = -1;
    this._dragSrcIdx = -1;
    this._datalistFilled = false;
  }
  // Block re-renders when only hass changes (it updates constantly in HA).
  // But on the first hass set, schedule datalist population.
  shouldUpdate(changedProps) {
    if (changedProps.size === 1 && changedProps.has("hass")) {
      if (!this._datalistFilled && this.hass) {
        requestAnimationFrame(() => this._populateDatalist());
      }
      return false;
    }
    return true;
  }
  // Also populate after the first render triggered by _config being set.
  updated(changedProps) {
    super.updated(changedProps);
    if (!this._datalistFilled && this.hass) {
      this._populateDatalist();
    }
  }
  _populateDatalist() {
    var _a;
    if (this._datalistFilled || !this.hass) return;
    const dl = (_a = this.shadowRoot) == null ? void 0 : _a.getElementById("ep-entities");
    if (!dl) return;
    dl.innerHTML = Object.keys(this.hass.states).sort().map((id) => `<option value="${id}">`).join("");
    this._datalistFilled = true;
  }
  setConfig(config) {
    this._config = deepClone(config);
  }
  _fire(config) {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config },
      bubbles: true,
      composed: true
    }));
  }
  _set(path, value) {
    const cfg = deepClone(this._config);
    let node = cfg;
    for (let i = 0; i < path.length - 1; i++) {
      if (node[path[i]] === void 0) node[path[i]] = {};
      node = node[path[i]];
    }
    const last = path[path.length - 1];
    if (value === "" || value === void 0) delete node[last];
    else node[last] = value;
    this._config = cfg;
    this._fire(cfg);
  }
  _inputHandler(path) {
    return (e) => this._set(path, e.target.value);
  }
  // ── Circuit management ─────────────────────────────────────────────────────
  _addCircuit() {
    const cfg = deepClone(this._config);
    cfg.circuits ?? (cfg.circuits = []);
    const n = cfg.circuits.length + 1;
    cfg.circuits.push({ id: `c${String(n).padStart(2, "0")}`, name: "New circuit", phases: 1 });
    this._config = cfg;
    this._fire(cfg);
    this._openCircuit = cfg.circuits.length - 1;
    this._openDevice = -1;
  }
  _removeCircuit(idx) {
    var _a;
    const cfg = deepClone(this._config);
    (_a = cfg.circuits) == null ? void 0 : _a.splice(idx, 1);
    this._config = cfg;
    this._fire(cfg);
    this._openCircuit = -1;
  }
  _moveCircuit(idx, dir) {
    const cfg = deepClone(this._config);
    const arr = cfg.circuits ?? [];
    const t = idx + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    this._config = cfg;
    this._fire(cfg);
    this._openCircuit = t;
  }
  _moveCircuitTo(from, to) {
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
  _setCircuitField(idx, field, val) {
    const cfg = deepClone(this._config);
    const c = cfg.circuits[idx];
    if (val === "") {
      delete c[field];
    } else {
      c[field] = field === "phases" ? parseInt(val) : field === "max_current" ? parseFloat(val) : val;
    }
    if (field === "name" && val) c.id = slugify(val);
    this._config = cfg;
    this._fire(cfg);
  }
  _setCircuitCheck(idx, field, val) {
    const cfg = deepClone(this._config);
    cfg.circuits[idx][field] = val;
    this._config = cfg;
    this._fire(cfg);
  }
  // ── Device management ──────────────────────────────────────────────────────
  _addDevice(ci) {
    var _a;
    const cfg = deepClone(this._config);
    (_a = cfg.circuits[ci]).devices ?? (_a.devices = []);
    cfg.circuits[ci].devices.push({ name: "New device" });
    this._config = cfg;
    this._fire(cfg);
    this._openDevice = cfg.circuits[ci].devices.length - 1;
  }
  _removeDevice(ci, di) {
    var _a;
    const cfg = deepClone(this._config);
    (_a = cfg.circuits[ci].devices) == null ? void 0 : _a.splice(di, 1);
    this._config = cfg;
    this._fire(cfg);
    this._openDevice = -1;
  }
  _setDeviceField(ci, di, field, val) {
    const cfg = deepClone(this._config);
    const d = cfg.circuits[ci].devices[di];
    if (val === "") delete d[field];
    else d[field] = val;
    this._config = cfg;
    this._fire(cfg);
  }
  // ── Channel management ─────────────────────────────────────────────────────
  _addChannel(ci, di) {
    var _a;
    const cfg = deepClone(this._config);
    (_a = cfg.circuits[ci].devices[di]).channels ?? (_a.channels = []);
    cfg.circuits[ci].devices[di].channels.push({ name: "New channel" });
    this._config = cfg;
    this._fire(cfg);
  }
  _removeChannel(ci, di, chi) {
    var _a;
    const cfg = deepClone(this._config);
    (_a = cfg.circuits[ci].devices[di].channels) == null ? void 0 : _a.splice(chi, 1);
    this._config = cfg;
    this._fire(cfg);
  }
  _setChannelField(ci, di, chi, field, val) {
    const cfg = deepClone(this._config);
    const ch = cfg.circuits[ci].devices[di].channels[chi];
    if (val === "") delete ch[field];
    else ch[field] = val;
    this._config = cfg;
    this._fire(cfg);
  }
  // ── Render helpers ─────────────────────────────────────────────────────────
  _entityField(label, value, onChange) {
    return html`
      <div class="field">
        <label>${label}</label>
        <input list="ep-entities" .value=${value ?? ""} placeholder="entity_id"
          @change=${(e) => onChange(e.target.value)} />
      </div>`;
  }
  _textField(label, value, onChange, ph = "") {
    return html`
      <div class="field">
        <label>${label}</label>
        <input type="text" .value=${value ?? ""} placeholder=${ph}
          @input=${(e) => onChange(e.target.value)} />
      </div>`;
  }
  _numField(label, value, onChange, ph = "") {
    return html`
      <div class="field">
        <label>${label}</label>
        <input type="number" min="0" .value=${value !== void 0 ? String(value) : ""} placeholder=${ph}
          @change=${(e) => onChange(e.target.value)} />
      </div>`;
  }
  // ── Section renderers ──────────────────────────────────────────────────────
  _renderMeterSection() {
    const m = this._config.main_meter ?? {};
    const s = (f) => (v) => this._set(["main_meter", f], v);
    return html`
      <details class="section">
        <summary>Main meter</summary>
        <div class="section-body">
          <div class="group-label">Power (W per phase)</div>
          ${this._entityField("L1 power", m.power_l1, s("power_l1"))}
          ${this._entityField("L2 power", m.power_l2, s("power_l2"))}
          ${this._entityField("L3 power", m.power_l3, s("power_l3"))}
          <div class="group-label">Current (A per phase)</div>
          ${this._entityField("L1 current", m.current_l1, s("current_l1"))}
          ${this._entityField("L2 current", m.current_l2, s("current_l2"))}
          ${this._entityField("L3 current", m.current_l3, s("current_l3"))}
          <div class="group-label">Energy</div>
          ${this._entityField("Energy today (kWh)", m.energy_today, s("energy_today"))}
        </div>
      </details>`;
  }
  _renderHdoSection() {
    const h = this._config.hdo ?? {};
    const s = (f) => (v) => this._set(["hdo", f], v);
    return html`
      <details class="section">
        <summary>HDO (time-of-use tariff)</summary>
        <div class="section-body">
          ${this._entityField("HDO switch (on = NT / low tariff)", h.switch, s("switch"))}
          ${this._entityField("Next high tariff start", h.next_high, s("next_high"))}
          ${this._entityField("Next low tariff start", h.next_low, s("next_low"))}
          ${this._entityField("Workday sensor", h.workday_sensor, s("workday_sensor"))}
          <div class="field">
            <label>PRE tariff preset (NT schedule)</label>
            <select @change=${(e) => s("tariff_preset")(e.target.value)}>
              <option value="" ?selected=${!h.tariff_preset}>— none / manual schedule —</option>
              ${Object.entries(PRE_TARIFFS).map(([code, preset]) => html`
                <option value="${code}" ?selected=${h.tariff_preset === code}>
                  ${code} — ${preset.label.replace(/^PRE \d+ — /, "")}
                </option>
              `)}
            </select>
            <span class="field-hint">
              Enables the NT schedule timeline in the card.
              Weekday / weekend / holiday schedules are loaded automatically.
            </span>
          </div>
          <div class="group-label" style="margin-top:12px;">Tariff prices (optional)</div>
          ${this._numField("NT price per kWh (low tariff)", h.nt_price, s("nt_price"), "0.00")}
          ${this._numField("VT price per kWh (high tariff)", h.vt_price, s("vt_price"), "0.00")}
          ${this._textField("Currency symbol", h.currency, s("currency"), "Kč")}
        </div>
      </details>`;
  }
  _renderChannelRow(ci, di, ch, chi) {
    const s = (f) => (v) => this._setChannelField(ci, di, chi, f, v);
    return html`
      <div class="channel-block">
        <div class="ch-header">
          <span>Channel ${chi + 1}: ${ch.name || "(unnamed)"}</span>
          <button class="btn-icon danger" title="Remove"
            @click=${() => this._removeChannel(ci, di, chi)}>
            <ha-icon icon="mdi:minus-circle-outline"></ha-icon>
          </button>
        </div>
        ${this._textField("Name", ch.name, s("name"), "e.g. Living room zone")}
        ${this._entityField("Switch", ch.switch, s("switch"))}
        ${this._entityField("Power (W)", ch.power, s("power"))}
        ${this._entityField("Current (A)", ch.current, s("current"))}
      </div>`;
  }
  _setDeviceNote(ci, di, val) {
    const cfg = deepClone(this._config);
    const d = cfg.circuits[ci].devices[di];
    if (val) {
      d.note = true;
      delete d.switch;
      delete d.power;
      delete d.current;
      delete d.channels;
    } else {
      delete d.note;
    }
    this._config = cfg;
    this._fire(cfg);
  }
  _renderDeviceRow(ci, d, di) {
    const open = this._openDevice === di;
    const s = (f) => (v) => this._setDeviceField(ci, di, f, v);
    return html`
      <div class="sub-item ${open ? "open" : ""}">
        <div class="row-hdr" @click=${() => {
      this._openDevice = open ? -1 : di;
    }}>
          <ha-icon icon="${d.note ? "mdi:label-outline" : "mdi:power-plug-outline"}" class="device-type-icon"></ha-icon>
          <span class="row-lbl">${d.name || "(unnamed device)"}</span>
          ${d.note ? html`<span class="badge warn">note</span>` : nothing}
          <div class="row-acts" @click=${(e) => e.stopPropagation()}>
            <button class="btn-icon danger" @click=${() => this._removeDevice(ci, di)}>
              <ha-icon icon="mdi:minus-circle-outline"></ha-icon>
            </button>
          </div>
          <ha-icon icon="${open ? "mdi:chevron-up" : "mdi:chevron-down"}" class="chevron"></ha-icon>
        </div>
        ${open ? html`
          <div class="sub-fields">
            ${this._textField("Device name", d.name, s("name"), "e.g. Washing machine")}
            <div class="field checkbox">
              <input type="checkbox" id="note-${ci}-${di}" .checked=${d.note ?? false}
                @change=${(e) => this._setDeviceNote(ci, di, e.target.checked)} />
              <label for="note-${ci}-${di}">Text label only (no entities, no switch)</label>
            </div>
            ${!d.note ? html`
              ${this._entityField("Switch", d.switch, s("switch"))}
              ${this._entityField("Power (W)", d.power, s("power"))}
              ${this._entityField("Current (A)", d.current, s("current"))}
              <div class="group-label" style="margin-top:10px;">
                Channels (for multi-relay devices like Shelly 4PM)
              </div>
              ${(d.channels ?? []).map((ch, chi) => this._renderChannelRow(ci, di, ch, chi))}
              <button class="btn-add" @click=${() => this._addChannel(ci, di)}>
                <ha-icon icon="mdi:plus"></ha-icon> Add channel
              </button>
            ` : nothing}
          </div>` : nothing}
      </div>`;
  }
  _renderCircuitRow(c, idx) {
    var _a;
    const open = this._openCircuit === idx;
    ((_a = this._config.circuits) == null ? void 0 : _a.length) ?? 0;
    const sf = (f) => (v) => this._setCircuitField(idx, f, v);
    return html`
      <div class="sub-item ${open ? "open" : ""}"
        @dragover=${(e) => {
      e.preventDefault();
      if (this._dragSrcIdx !== idx) this._dragOverIdx = idx;
      this.requestUpdate();
    }}
        @dragleave=${() => {
      if (this._dragOverIdx === idx) {
        this._dragOverIdx = -1;
        this.requestUpdate();
      }
    }}
        @drop=${(e) => {
      e.preventDefault();
      if (this._dragSrcIdx >= 0 && this._dragSrcIdx !== idx) this._moveCircuitTo(this._dragSrcIdx, idx);
    }}>
        <div class="row-hdr ${this._dragOverIdx === idx ? "drag-over" : ""}"
          @click=${() => {
      this._openCircuit = open ? -1 : idx;
      this._openDevice = -1;
    }}>
          <span class="drag-handle"
            draggable="true"
            @dragstart=${(e) => {
      this._dragSrcIdx = idx;
      e.dataTransfer.effectAllowed = "move";
      e.stopPropagation();
    }}
            @dragend=${() => {
      this._dragOverIdx = -1;
      this.requestUpdate();
    }}
            @click=${(e) => e.stopPropagation()}>⠿</span>
          <span class="row-lbl">${c.name || "(unnamed circuit)"}</span>
          <div class="badges">
            ${c.phases === 3 ? html`<span class="badge info">3ph</span>` : nothing}
            ${c.critical ? html`<span class="badge warn">critical</span>` : nothing}
          </div>
          <div class="row-acts" @click=${(e) => e.stopPropagation()}>
            <button class="btn-icon danger" @click=${() => this._removeCircuit(idx)}>
              <ha-icon icon="mdi:minus-circle-outline"></ha-icon>
            </button>
          </div>
          <ha-icon icon="${open ? "mdi:chevron-up" : "mdi:chevron-down"}" class="chevron"></ha-icon>
        </div>
        ${open ? html`
          <div class="sub-fields">
            ${this._textField("Circuit name", c.name, sf("name"), "e.g. Kitchen left")}
            ${this._textField("Circuit ID", c.id, sf("id"), "e.g. c08")}
            <div class="field">
              <label>Phases</label>
              <select @change=${(e) => this._setCircuitField(idx, "phases", e.target.value)}>
                <option value="1" ?selected=${c.phases !== 3}>1 — single-phase</option>
                <option value="3" ?selected=${c.phases === 3}>3 — three-phase</option>
              </select>
            </div>
            <div class="field checkbox">
              <input type="checkbox" id="crit-${idx}" .checked=${c.critical ?? false}
                @change=${(e) => this._setCircuitCheck(idx, "critical", e.target.checked)} />
              <label for="crit-${idx}">Critical circuit (disables remote toggle)</label>
            </div>
            ${this._numField("Max current A (breaker rating)", c.max_current, sf("max_current"), c.phases === 3 ? "63" : "16")}
            <div class="group-label" style="margin-top:10px;">Breaker entities</div>
            ${this._entityField("Switch", c.switch, sf("switch"))}
            ${this._entityField("Total power (W)", c.power, sf("power"))}
            ${this._entityField("Total current (A)", c.current, sf("current"))}
            ${this._entityField("Energy today (kWh)", c.energy, sf("energy"))}
            ${this._entityField("Voltage (V)", c.voltage, sf("voltage"))}
            ${c.phases === 3 ? html`
              <div class="group-label" style="margin-top:10px;">Per-phase entities (3φ breakdown)</div>
              ${this._entityField("L1 power (W)", c.power_l1, sf("power_l1"))}
              ${this._entityField("L2 power (W)", c.power_l2, sf("power_l2"))}
              ${this._entityField("L3 power (W)", c.power_l3, sf("power_l3"))}
              ${this._entityField("L1 current (A)", c.current_l1, sf("current_l1"))}
              ${this._entityField("L2 current (A)", c.current_l2, sf("current_l2"))}
              ${this._entityField("L3 current (A)", c.current_l3, sf("current_l3"))}
            ` : nothing}
            <div class="group-label" style="margin-top:10px;">Devices behind this breaker</div>
            ${(c.devices ?? []).map((d, di) => this._renderDeviceRow(idx, d, di))}
            <button class="btn-add" @click=${() => this._addDevice(idx)}>
              <ha-icon icon="mdi:plus"></ha-icon> Add device
            </button>
          </div>` : nothing}
      </div>`;
  }
  // ── Main render ────────────────────────────────────────────────────────────
  render() {
    if (!this._config) return html``;
    return html`
      <datalist id="ep-entities"></datalist>
      <div class="editor">
        ${this._textField(
      "Card title (optional)",
      this._config.title,
      (v) => this._set(["title"], v),
      "Electricity panel"
    )}
        ${this._renderMeterSection()}
        ${this._renderHdoSection()}
        <div class="sec-hdr">Circuits</div>
        ${(this._config.circuits ?? []).map((c, i) => this._renderCircuitRow(c, i))}
        <button class="btn-add primary" @click=${() => this._addCircuit()}>
          <ha-icon icon="mdi:plus-circle-outline"></ha-icon> Add circuit
        </button>
      </div>`;
  }
};
ElectricityPanelEditor.styles = css`
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

    .device-type-icon {
      --mdc-icon-size: 15px;
      color: var(--disabled-text-color);
      flex-shrink: 0;
    }
    .drag-handle {
      color: var(--disabled-text-color);
      cursor: grab;
      flex-shrink: 0;
      font-size: 16px;
      line-height: 1;
      padding: 0 2px;
      user-select: none;
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
__decorateClass$1([
  property({ attribute: false })
], ElectricityPanelEditor.prototype, "hass", 2);
__decorateClass$1([
  state()
], ElectricityPanelEditor.prototype, "_config", 2);
__decorateClass$1([
  state()
], ElectricityPanelEditor.prototype, "_openCircuit", 2);
__decorateClass$1([
  state()
], ElectricityPanelEditor.prototype, "_openDevice", 2);
__decorateClass$1([
  state()
], ElectricityPanelEditor.prototype, "_dragOverIdx", 2);
ElectricityPanelEditor = __decorateClass$1([
  customElement("electricity-panel-editor")
], ElectricityPanelEditor);
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
let ElectricityPanelCard = class extends LitElement {
  constructor() {
    super(...arguments);
    this._expanded = /* @__PURE__ */ new Set();
    this._showTomorrow = false;
    this._scheduleExpanded = false;
    this._trackedIds = [];
  }
  // Only re-render when one of our tracked entities actually changes.
  // Without this, the card re-renders on every entity update in HA
  // (potentially hundreds per second), blocking the JS thread.
  shouldUpdate(changedProps) {
    if (changedProps.has("_config")) {
      this._trackedIds = this._buildTrackedIds();
      return true;
    }
    if (!changedProps.has("hass")) return true;
    const oldHass = changedProps.get("hass");
    if (!oldHass) return true;
    const newHass = this.hass;
    return this._trackedIds.some((id) => newHass.states[id] !== oldHass.states[id]);
  }
  _buildTrackedIds() {
    if (!this._config) return [];
    const ids = [];
    const hdo = this._config.hdo;
    if (hdo) ids.push(hdo.switch, hdo.next_high, hdo.next_low, hdo.workday_sensor);
    const mm = this._config.main_meter;
    if (mm) ids.push(
      mm.power_l1,
      mm.power_l2,
      mm.power_l3,
      mm.current_l1,
      mm.current_l2,
      mm.current_l3,
      mm.energy_today
    );
    for (const c of this._config.circuits ?? []) {
      ids.push(
        c.switch,
        c.power,
        c.current,
        c.energy,
        c.voltage,
        c.power_l1,
        c.power_l2,
        c.power_l3,
        c.current_l1,
        c.current_l2,
        c.current_l3
      );
      for (const d of c.devices ?? []) {
        ids.push(d.switch, d.power, d.current);
        for (const ch of d.channels ?? []) ids.push(ch.switch, ch.power, ch.current);
      }
    }
    return ids.filter(Boolean);
  }
  connectedCallback() {
    super.connectedCallback();
    this._timer = window.setInterval(() => this.requestUpdate(), 3e4);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timer);
  }
  // ── HA card API ────────────────────────────────────────────────────────────
  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = config;
    this._trackedIds = this._buildTrackedIds();
  }
  static getConfigElement() {
    return document.createElement("electricity-panel-editor");
  }
  static getStubConfig() {
    return { type: "custom:electricity-panel-card", circuits: [] };
  }
  getCardSize() {
    var _a;
    return 4 + Math.ceil((((_a = this._config.circuits) == null ? void 0 : _a.length) ?? 0) / 2);
  }
  // ── Entity helpers ─────────────────────────────────────────────────────────
  _state(id) {
    var _a, _b;
    if (!id) return "unavailable";
    return ((_b = (_a = this.hass) == null ? void 0 : _a.states[id]) == null ? void 0 : _b.state) ?? "unavailable";
  }
  _num(id) {
    const n = parseFloat(this._state(id));
    return isNaN(n) ? 0 : n;
  }
  _isOn(id) {
    return this._state(id) === "on";
  }
  _toggle(entityId) {
    const svc = this._isOn(entityId) ? "turn_off" : "turn_on";
    this.hass.callService("switch", svc, { entity_id: entityId });
  }
  _toggleExpanded(id) {
    const s = new Set(this._expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    this._expanded = s;
  }
  _loadColor(pct) {
    if (pct > 80) return "var(--error-color, #ef4444)";
    if (pct > 55) return "var(--warning-color, #f59e0b)";
    return "var(--success-color, #22c55e)";
  }
  _watts(entityId) {
    var _a;
    if (!entityId) return 0;
    const entity = (_a = this.hass) == null ? void 0 : _a.states[entityId];
    if (!entity) return 0;
    const val = parseFloat(entity.state);
    if (isNaN(val)) return 0;
    const unit = entity.attributes["unit_of_measurement"] ?? "";
    if (unit === "kW") return val * 1e3;
    if (unit === "MW") return val * 1e6;
    return val;
  }
  _fmtW(w) {
    if (w >= 1e3) return `${(w / 1e3).toFixed(2)} kW`;
    return `${w.toFixed(0)} W`;
  }
  _kwh(entityId) {
    var _a;
    if (!entityId) return 0;
    const entity = (_a = this.hass) == null ? void 0 : _a.states[entityId];
    if (!entity) return 0;
    const val = parseFloat(entity.state);
    if (isNaN(val)) return 0;
    const unit = entity.attributes["unit_of_measurement"] ?? "";
    if (unit === "Wh") return val / 1e3;
    if (unit === "MWh") return val * 1e3;
    return val;
  }
  // ── HDO helpers ────────────────────────────────────────────────────────────
  _hdoCountdown() {
    const hdo = this._config.hdo;
    if (!hdo) return "";
    const isNT = this._isOn(hdo.switch);
    const sensor = isNT ? hdo.next_high : hdo.next_low;
    const raw = this._state(sensor);
    if (!raw || ["unavailable", "unknown", ""].includes(raw)) return "";
    const diff = Math.floor((new Date(raw).getTime() - Date.now()) / 1e3);
    if (diff <= 0) return "switching…";
    const h = Math.floor(diff / 3600);
    const m = Math.floor(diff % 3600 / 60);
    return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
  }
  _dayType() {
    var _a;
    const isWorkday = this._isOn((_a = this._config.hdo) == null ? void 0 : _a.workday_sensor);
    const d = (/* @__PURE__ */ new Date()).getDay();
    if (isWorkday) return "weekday";
    if (d === 0 || d === 6) return "weekend";
    return "holiday";
  }
  _tomorrowDayType() {
    const d = ((/* @__PURE__ */ new Date()).getDay() + 1) % 7;
    return d === 0 || d === 6 ? "weekend" : "weekday";
  }
  _ntRemainingMins(starts, offsets) {
    const now = Date.now();
    const midnight = /* @__PURE__ */ new Date();
    midnight.setHours(0, 0, 0, 0);
    let rem = 0;
    starts.forEach((s, i) => {
      const [h, m] = s.split(":").map(Number);
      const st = midnight.getTime() + (h * 60 + m) * 6e4;
      const en = st + offsets[i] * 6e4;
      if (now < en) rem += (en - Math.max(now, st)) / 6e4;
    });
    return rem;
  }
  _fmtMins(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  _fmtCostRate(watts) {
    const hdo = this._config.hdo;
    if (!(hdo == null ? void 0 : hdo.nt_price) && !(hdo == null ? void 0 : hdo.vt_price)) return "";
    const isNT = this._isOn(hdo.switch);
    const price = isNT ? hdo.nt_price ?? 0 : hdo.vt_price ?? 0;
    const cur = hdo.currency ?? "Kč";
    return `${(watts / 1e3 * price).toFixed(2)} ${cur}/h`;
  }
  // ── Full-day schedule builder ──────────────────────────────────────────────
  _buildFullDaySlots(starts, offsets, base, showing) {
    const fmt = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const fmtDur = (m) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
    const now = Date.now();
    const dayEnd = base + 864e5;
    const ntWindows = starts.map((start, i) => {
      const [h, m] = start.split(":").map(Number);
      const s = base + (h * 60 + m) * 6e4;
      return { s, e: s + offsets[i] * 6e4, durMins: offsets[i] };
    });
    const makeSlot = (type, slotStart, slotEnd, durMins) => {
      const isPast = !showing && now >= slotEnd;
      const isCurrent = !showing && now >= slotStart && now < slotEnd;
      const pct = isCurrent ? Math.min(100, (now - slotStart) / (slotEnd - slotStart) * 100) : isPast ? 100 : 0;
      return {
        type,
        label: `${fmt(slotStart)}–${fmt(slotEnd)}`,
        isPast,
        isCurrent,
        pct,
        durMins,
        durStr: fmtDur(durMins)
      };
    };
    const slots = [];
    let cursor = base;
    for (const nt of ntWindows) {
      if (nt.s > cursor) {
        slots.push(makeSlot("vt", cursor, nt.s, Math.round((nt.s - cursor) / 6e4)));
      }
      slots.push(makeSlot("nt", nt.s, nt.e, nt.durMins));
      cursor = nt.e;
    }
    if (cursor < dayEnd) {
      slots.push(makeSlot("vt", cursor, dayEnd, Math.round((dayEnd - cursor) / 6e4)));
    }
    return slots;
  }
  _getCurrentSlotPct() {
    const hdo = this._config.hdo;
    if (!hdo) return -1;
    const preset = hdo.tariff_preset ? PRE_TARIFFS[hdo.tariff_preset] : void 0;
    const src = preset ?? hdo.schedule;
    if (!src) return -1;
    const dt = this._dayType();
    const day = dt === "holiday" && src.holiday ? src.holiday : dt === "weekend" ? src.weekend : src.weekday;
    const midnight = /* @__PURE__ */ new Date();
    midnight.setHours(0, 0, 0, 0);
    const slots = this._buildFullDaySlots(day.starts, day.offsets, midnight.getTime(), false);
    const current = slots.find((s) => s.isCurrent);
    return current ? current.pct : -1;
  }
  // ── Render: 24h timeline bar ───────────────────────────────────────────────
  _renderTimeline(slots, showMarker = false) {
    const midnight = /* @__PURE__ */ new Date();
    midnight.setHours(0, 0, 0, 0);
    const nowPct = showMarker ? Math.min(100, (Date.now() - midnight.getTime()) / 864e5 * 100) : -1;
    return html`
      <div class="timeline-bar" style="position:relative">
        ${slots.map((sl) => html`
          <div class="tl-seg ${sl.type} ${sl.isPast ? "past" : sl.isCurrent ? "active" : ""}"
               style="flex:${sl.durMins}"></div>
        `)}
        ${nowPct >= 0 ? html`
          <div class="timeline-now" style="left:${nowPct.toFixed(2)}%"></div>
        ` : nothing}
      </div>
    `;
  }
  // ── Render: HDO schedule ───────────────────────────────────────────────────
  _renderHdoSchedule() {
    const hdo = this._config.hdo;
    if (!hdo) return nothing;
    const preset = hdo.tariff_preset ? PRE_TARIFFS[hdo.tariff_preset] : void 0;
    const src = preset ?? hdo.schedule;
    if (!src) return nothing;
    const showing = this._showTomorrow;
    const dt = showing ? this._tomorrowDayType() : this._dayType();
    const day = dt === "holiday" && src.holiday ? src.holiday : dt === "weekend" ? src.weekend : src.weekday;
    const midnight = /* @__PURE__ */ new Date();
    midnight.setHours(0, 0, 0, 0);
    const base = showing ? midnight.getTime() + 864e5 : midnight.getTime();
    const slots = this._buildFullDaySlots(day.starts, day.offsets, base, showing);
    const remaining = showing ? null : this._ntRemainingMins(day.starts, day.offsets);
    const totalNT = day.offsets.reduce((a, b) => a + b, 0);
    const exp = this._scheduleExpanded;
    const currentSlot = slots.find((s) => s.isCurrent);
    return html`
      <div class="schedule-block">
        <div class="schedule-title" @click=${() => {
      this._scheduleExpanded = !exp;
    }}>
          <span class="schedule-when">${showing ? "Tomorrow" : "Today"}</span>
          <span class="schedule-day">${dt}</span>
          ${!exp && currentSlot ? html`
            <span class="stariff ${currentSlot.type}" style="margin-left:4px">${currentSlot.type.toUpperCase()}</span>
            <span class="nt-remaining-inline">${currentSlot.label}</span>
          ` : nothing}
          <div class="schedule-nav">
            ${exp && remaining !== null ? html`<span class="nt-remaining">${this._fmtMins(remaining)} NT left · ${this._fmtMins(totalNT)} total</span>` : nothing}
            ${exp ? html`
              <button class="sday-btn" @click=${(e) => {
      e.stopPropagation();
      this._showTomorrow = !this._showTomorrow;
    }}>
                ${showing ? "Today" : "Tomorrow"}
              </button>` : nothing}
            <ha-icon icon="${exp ? "mdi:chevron-up" : "mdi:chevron-down"}" class="schedule-chevron"></ha-icon>
          </div>
        </div>
        ${this._renderTimeline(slots, !showing)}
        ${exp ? html`
          <div class="schedule-rows">
            ${slots.map((sl) => html`
              <div class="srow ${sl.isPast ? "past" : sl.isCurrent ? "active" : "future"} ${sl.type}">
                <span class="stariff ${sl.type}">${sl.type.toUpperCase()}</span>
                <span class="srow-time">${sl.label}</span>
                <div class="srow-track">
                  <div class="srow-fill ${sl.type}" style="width:${sl.pct.toFixed(1)}%"></div>
                </div>
                ${sl.isCurrent ? html`<span class="snow ${sl.type}">Now</span>` : html`<span class="sdur">${sl.durStr}</span>`}
              </div>
            `)}
          </div>
        ` : nothing}
      </div>
    `;
  }
  // ── Render: HDO bar ────────────────────────────────────────────────────────
  _renderHdo() {
    const hdo = this._config.hdo;
    if (!(hdo == null ? void 0 : hdo.switch)) return nothing;
    const isNT = this._isOn(hdo.switch);
    const cd = this._hdoCountdown();
    const price = isNT ? hdo.nt_price : hdo.vt_price;
    const cur = hdo.currency ?? "Kč";
    const slotPct = this._getCurrentSlotPct();
    return html`
      <div class="hdo-card ${isNT ? "nt" : "vt"}">
        <div class="hdo-main">
          <div class="hdo-dot ${isNT ? "nt" : "vt"}"></div>
          <div class="hdo-info">
            <span class="hdo-label">${isNT ? "NT — Low tariff" : "VT — High tariff"}</span>
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
            <div class="hdo-win-fill ${isNT ? "nt" : "vt"}" style="width:${slotPct.toFixed(1)}%"></div>
          </div>
        ` : nothing}
      </div>
    `;
  }
  // ── Render: main meter ─────────────────────────────────────────────────────
  _renderMainMeter() {
    const m = this._config.main_meter;
    if (!m) return nothing;
    const totalW = this._watts(m.power_l1) + this._watts(m.power_l2) + this._watts(m.power_l3);
    const phases = [
      { label: "L1", power: m.power_l1, current: m.current_l1 },
      { label: "L2", power: m.power_l2, current: m.current_l2 },
      { label: "L3", power: m.power_l3, current: m.current_l3 }
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
            <span class="metric-primary">${(totalW / 1e3).toFixed(2)} kW</span>
            ${m.energy_today ? html`<span class="metric-small">${this._kwh(m.energy_today).toFixed(1)} kWh today</span>` : nothing}
          </div>
        </div>
        <div class="phases-grid">
          ${phases.map((p) => html`
            <div class="phase-cell">
              <div class="phase-label">${p.label}</div>
              <div class="phase-power">${(this._watts(p.power) / 1e3).toFixed(2)} kW</div>
              <div class="phase-detail">${this._num(p.current).toFixed(1)} A</div>
            </div>
          `)}
        </div>
      </div>
    `;
  }
  // ── Render: circuit ────────────────────────────────────────────────────────
  _renderCircuit(c) {
    var _a;
    const isOn = this._isOn(c.switch);
    const power = this._watts(c.power);
    const current = this._num(c.current);
    const energy = this._kwh(c.energy);
    const maxA = c.max_current ?? (c.phases === 3 ? 63 : 16);
    const loadPct = Math.min(100, current > 0 ? current / maxA * 100 : power / (maxA * 230) * 100);
    const barColor = this._loadColor(loadPct);
    const expanded = this._expanded.has(c.id);
    const hasDevices = (((_a = c.devices) == null ? void 0 : _a.length) ?? 0) > 0;
    const costRate = power > 0 ? this._fmtCostRate(power) : "";
    return html`
      <div class="circuit-card ${c.critical ? "critical" : ""} ${c.switch && isOn ? "is-on" : ""}">

        <div class="circuit-header">
          <div class="status-dot ${isOn ? "on" : c.switch ? "off" : "none"}"></div>
          <span class="circuit-name" title="${c.name}">${c.name}</span>
          ${c.phases === 3 ? html`<span class="badge badge-phase">3φ</span>` : nothing}
          ${c.critical ? html`<ha-icon icon="mdi:lock" class="lock-icon"></ha-icon>` : c.switch ? html`<button
                    class="toggle ${isOn ? "on" : "off"}"
                    @click=${() => this._toggle(c.switch)}
                    aria-label="${isOn ? "Turn off" : "Turn on"} ${c.name}">
                  </button>` : nothing}
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
          ${hasDevices ? html`<button class="expand-btn" @click=${() => this._toggleExpanded(c.id)}>
                <ha-icon icon="${expanded ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon>
              </button>` : nothing}
        </div>

        ${expanded && hasDevices ? html`<div class="tp-devices-grid">${c.devices.map((d) => html`<div class="tp-device-col">${this._renderDevice(d)}</div>`)}</div>` : nothing}
      </div>
    `;
  }
  // ── Render: device ─────────────────────────────────────────────────────────
  _renderDevice(d) {
    var _a;
    if (d.note) {
      return html`
        <div class="device-row note-row">
          <ha-icon icon="mdi:label-outline" class="note-icon"></ha-icon>
          <span class="device-name">${d.name}</span>
        </div>
      `;
    }
    if ((((_a = d.channels) == null ? void 0 : _a.length) ?? 0) > 0) {
      const chTotalW = d.channels.reduce((s, ch) => s + this._watts(ch.power), 0);
      const chTotalA = d.channels.reduce((s, ch) => s + this._num(ch.current), 0);
      const hasChMetrics = d.channels.some((ch) => ch.power || ch.current);
      return html`
        <div class="device-group">
          <div class="device-group-label">
            <span>${d.name}</span>
            ${hasChMetrics ? html`<span class="ch-sum">${this._fmtW(chTotalW)} · ${chTotalA.toFixed(1)} A</span>` : nothing}
          </div>
          ${d.channels.map((ch) => this._renderChannel(ch))}
        </div>
      `;
    }
    const isOn = this._isOn(d.switch);
    const power = this._num(d.power);
    const current = this._num(d.current);
    return html`
      <div class="device-row">
        <div class="status-dot sm ${isOn ? "on" : d.switch ? "off" : "none"}"></div>
        <span class="device-name">${d.name}</span>
        <span class="device-metrics">
          ${power > 0 ? html`${this._fmtW(power)}` : nothing}
          ${current > 0 ? html` · ${current.toFixed(1)} A` : nothing}
        </span>
        ${d.switch ? html`<button
                class="toggle sm ${isOn ? "on" : "off"}"
                @click=${() => this._toggle(d.switch)}
                aria-label="${isOn ? "Turn off" : "Turn on"} ${d.name}">
              </button>` : nothing}
      </div>
    `;
  }
  // ── Render: channel ────────────────────────────────────────────────────────
  _renderChannel(ch) {
    const isOn = this._isOn(ch.switch);
    const power = this._num(ch.power);
    const current = this._num(ch.current);
    return html`
      <div class="device-row channel">
        <div class="status-dot sm ${isOn ? "on" : ch.switch ? "off" : "none"}"></div>
        <span class="device-name">${ch.name}</span>
        <span class="device-metrics">
          ${power > 0 ? html`${this._fmtW(power)}` : nothing}
          ${current > 0 ? html` · ${current.toFixed(1)} A` : nothing}
        </span>
        ${ch.switch ? html`<button
                class="toggle sm ${isOn ? "on" : "off"}"
                @click=${() => this._toggle(ch.switch)}
                aria-label="${isOn ? "Turn off" : "Turn on"} ${ch.name}">
              </button>` : nothing}
      </div>
    `;
  }
  // ── Render: 3-phase circuit ───────────────────────────────────────────────
  _renderThreePhaseCircuit(c) {
    var _a;
    const isOn = this._isOn(c.switch);
    !!(c.power_l1 || c.power_l2 || c.power_l3);
    const totalPower = c.power ? this._watts(c.power) : this._watts(c.power_l1) + this._watts(c.power_l2) + this._watts(c.power_l3);
    const energy = this._kwh(c.energy);
    const maxA = c.max_current ?? 63;
    const phases = [
      { label: "L1", power: c.power_l1, current: c.current_l1 },
      { label: "L2", power: c.power_l2, current: c.current_l2 },
      { label: "L3", power: c.power_l3, current: c.current_l3 }
    ];
    const totalCurrent = c.current ? this._num(c.current) : Math.max(this._num(c.current_l1), this._num(c.current_l2), this._num(c.current_l3));
    const loadPct = Math.min(100, totalCurrent > 0 ? totalCurrent / maxA * 100 : totalPower / (maxA * 400) * 100);
    const barColor = this._loadColor(loadPct);
    const expanded = this._expanded.has(c.id);
    const hasDevices = (((_a = c.devices) == null ? void 0 : _a.length) ?? 0) > 0;
    const costRate = totalPower > 0 ? this._fmtCostRate(totalPower) : "";
    return html`
      <div class="circuit-card three-phase-card ${c.critical ? "critical" : ""} ${c.switch && isOn ? "is-on" : ""}">
        <div class="tp-header">
          <div class="tp-title-row">
            <div class="status-dot ${isOn ? "on" : c.switch ? "off" : "none"}"></div>
            <span class="circuit-name" title="${c.name}">${c.name}</span>
            <span class="badge badge-phase">3φ</span>
            ${c.critical ? html`<ha-icon icon="mdi:lock" class="lock-icon"></ha-icon>` : c.switch ? html`<button class="toggle ${isOn ? "on" : "off"}"
                    @click=${() => this._toggle(c.switch)}
                    aria-label="${isOn ? "Turn off" : "Turn on"} ${c.name}">
                  </button>` : nothing}
          </div>
          <div class="tp-total">
            <span class="metric-primary">${(totalPower / 1e3).toFixed(2)} kW</span>
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
          ${phases.map((p) => html`
            <div class="phase-cell">
              <div class="phase-label">${p.label}</div>
              <div class="phase-power">${(this._watts(p.power) / 1e3).toFixed(2)} kW</div>
              <div class="phase-detail">${this._num(p.current).toFixed(1)} A</div>
            </div>
          `)}
        </div>

        ${hasDevices ? html`
          <div class="tp-footer">
            <button class="expand-btn" @click=${() => this._toggleExpanded(c.id)}>
              <ha-icon icon="${expanded ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon>
              <span>${expanded ? "hide" : "devices"}</span>
            </button>
          </div>
        ` : nothing}

        ${expanded && hasDevices ? html`<div class="tp-devices-grid">${c.devices.map((d) => html`<div class="tp-device-col">${this._renderDevice(d)}</div>`)}</div>` : nothing}
      </div>
    `;
  }
  // ── Main render ────────────────────────────────────────────────────────────
  render() {
    if (!this.hass || !this._config) return nothing;
    const circuits = this._config.circuits ?? [];
    const threePhase = circuits.filter((c) => c.phases === 3);
    const singlePhase = circuits.filter((c) => c.phases !== 3);
    return html`
      <ha-card>
        ${this._config.title ? html`<div class="card-header">${this._config.title}</div>` : nothing}
        <div class="card-content">
          ${this._renderHdo()}
          ${this._renderHdoSchedule()}
          ${this._renderMainMeter()}

          ${threePhase.length > 0 ? html`
            <div class="section-label">3-phase circuits</div>
            <div class="three-phase-list">
              ${threePhase.map((c) => this._renderThreePhaseCircuit(c))}
            </div>
          ` : nothing}

          ${singlePhase.length > 0 ? html`
            ${threePhase.length > 0 ? html`<div class="section-label">Single-phase breakers</div>` : nothing}
            <div class="circuit-grid">
              ${singlePhase.map((c) => this._renderCircuit(c))}
            </div>
          ` : nothing}
        </div>
      </ha-card>
    `;
  }
};
ElectricityPanelCard.styles = css`
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
__decorateClass([
  property({ attribute: false })
], ElectricityPanelCard.prototype, "hass", 2);
__decorateClass([
  state()
], ElectricityPanelCard.prototype, "_config", 2);
__decorateClass([
  state()
], ElectricityPanelCard.prototype, "_expanded", 2);
__decorateClass([
  state()
], ElectricityPanelCard.prototype, "_showTomorrow", 2);
__decorateClass([
  state()
], ElectricityPanelCard.prototype, "_scheduleExpanded", 2);
ElectricityPanelCard = __decorateClass([
  customElement("electricity-panel-card")
], ElectricityPanelCard);
window["customCards"] ?? (window["customCards"] = []);
window["customCards"].push({
  type: "electricity-panel-card",
  name: "Electricity Panel Card",
  description: "Circuit breaker panel — power, current, daily energy, HDO tariff",
  preview: false
});
export {
  ElectricityPanelCard
};
