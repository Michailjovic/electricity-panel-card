/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var _a;
const t$2 = globalThis, e$2 = t$2.ShadowRoot && (void 0 === t$2.ShadyCSS || t$2.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, s$2 = Symbol(), o$4 = /* @__PURE__ */ new WeakMap();
let n$3 = class n {
  constructor(t2, e2, o2) {
    if (this._$cssResult$ = true, o2 !== s$2) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t2, this.t = e2;
  }
  get styleSheet() {
    let t2 = this.o;
    const s2 = this.t;
    if (e$2 && void 0 === t2) {
      const e2 = void 0 !== s2 && 1 === s2.length;
      e2 && (t2 = o$4.get(s2)), void 0 === t2 && ((this.o = t2 = new CSSStyleSheet()).replaceSync(this.cssText), e2 && o$4.set(s2, t2));
    }
    return t2;
  }
  toString() {
    return this.cssText;
  }
};
const r$4 = (t2) => new n$3("string" == typeof t2 ? t2 : t2 + "", void 0, s$2), i$3 = (t2, ...e2) => {
  const o2 = 1 === t2.length ? t2[0] : e2.reduce((e3, s2, o3) => e3 + ((t3) => {
    if (true === t3._$cssResult$) return t3.cssText;
    if ("number" == typeof t3) return t3;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t3 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s2) + t2[o3 + 1], t2[0]);
  return new n$3(o2, t2, s$2);
}, S$1 = (s2, o2) => {
  if (e$2) s2.adoptedStyleSheets = o2.map((t2) => t2 instanceof CSSStyleSheet ? t2 : t2.styleSheet);
  else for (const e2 of o2) {
    const o3 = document.createElement("style"), n3 = t$2.litNonce;
    void 0 !== n3 && o3.setAttribute("nonce", n3), o3.textContent = e2.cssText, s2.appendChild(o3);
  }
}, c$2 = e$2 ? (t2) => t2 : (t2) => t2 instanceof CSSStyleSheet ? ((t3) => {
  let e2 = "";
  for (const s2 of t3.cssRules) e2 += s2.cssText;
  return r$4(e2);
})(t2) : t2;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const { is: i$2, defineProperty: e$1, getOwnPropertyDescriptor: h$1, getOwnPropertyNames: r$3, getOwnPropertySymbols: o$3, getPrototypeOf: n$2 } = Object, a$1 = globalThis, c$1 = a$1.trustedTypes, l$1 = c$1 ? c$1.emptyScript : "", p$1 = a$1.reactiveElementPolyfillSupport, d$1 = (t2, s2) => t2, u$1 = { toAttribute(t2, s2) {
  switch (s2) {
    case Boolean:
      t2 = t2 ? l$1 : null;
      break;
    case Object:
    case Array:
      t2 = null == t2 ? t2 : JSON.stringify(t2);
  }
  return t2;
}, fromAttribute(t2, s2) {
  let i2 = t2;
  switch (s2) {
    case Boolean:
      i2 = null !== t2;
      break;
    case Number:
      i2 = null === t2 ? null : Number(t2);
      break;
    case Object:
    case Array:
      try {
        i2 = JSON.parse(t2);
      } catch (t3) {
        i2 = null;
      }
  }
  return i2;
} }, f$1 = (t2, s2) => !i$2(t2, s2), b$1 = { attribute: true, type: String, converter: u$1, reflect: false, useDefault: false, hasChanged: f$1 };
Symbol.metadata ?? (Symbol.metadata = Symbol("metadata")), a$1.litPropertyMetadata ?? (a$1.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
let y$1 = class y extends HTMLElement {
  static addInitializer(t2) {
    this._$Ei(), (this.l ?? (this.l = [])).push(t2);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t2, s2 = b$1) {
    if (s2.state && (s2.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t2) && ((s2 = Object.create(s2)).wrapped = true), this.elementProperties.set(t2, s2), !s2.noAccessor) {
      const i2 = Symbol(), h2 = this.getPropertyDescriptor(t2, i2, s2);
      void 0 !== h2 && e$1(this.prototype, t2, h2);
    }
  }
  static getPropertyDescriptor(t2, s2, i2) {
    const { get: e2, set: r2 } = h$1(this.prototype, t2) ?? { get() {
      return this[s2];
    }, set(t3) {
      this[s2] = t3;
    } };
    return { get: e2, set(s3) {
      const h2 = e2 == null ? void 0 : e2.call(this);
      r2 == null ? void 0 : r2.call(this, s3), this.requestUpdate(t2, h2, i2);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t2) {
    return this.elementProperties.get(t2) ?? b$1;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d$1("elementProperties"))) return;
    const t2 = n$2(this);
    t2.finalize(), void 0 !== t2.l && (this.l = [...t2.l]), this.elementProperties = new Map(t2.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d$1("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d$1("properties"))) {
      const t3 = this.properties, s2 = [...r$3(t3), ...o$3(t3)];
      for (const i2 of s2) this.createProperty(i2, t3[i2]);
    }
    const t2 = this[Symbol.metadata];
    if (null !== t2) {
      const s2 = litPropertyMetadata.get(t2);
      if (void 0 !== s2) for (const [t3, i2] of s2) this.elementProperties.set(t3, i2);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t3, s2] of this.elementProperties) {
      const i2 = this._$Eu(t3, s2);
      void 0 !== i2 && this._$Eh.set(i2, t3);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s2) {
    const i2 = [];
    if (Array.isArray(s2)) {
      const e2 = new Set(s2.flat(1 / 0).reverse());
      for (const s3 of e2) i2.unshift(c$2(s3));
    } else void 0 !== s2 && i2.push(c$2(s2));
    return i2;
  }
  static _$Eu(t2, s2) {
    const i2 = s2.attribute;
    return false === i2 ? void 0 : "string" == typeof i2 ? i2 : "string" == typeof t2 ? t2.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    var _a2;
    this._$ES = new Promise((t2) => this.enableUpdating = t2), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), (_a2 = this.constructor.l) == null ? void 0 : _a2.forEach((t2) => t2(this));
  }
  addController(t2) {
    var _a2;
    (this._$EO ?? (this._$EO = /* @__PURE__ */ new Set())).add(t2), void 0 !== this.renderRoot && this.isConnected && ((_a2 = t2.hostConnected) == null ? void 0 : _a2.call(t2));
  }
  removeController(t2) {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.delete(t2);
  }
  _$E_() {
    const t2 = /* @__PURE__ */ new Map(), s2 = this.constructor.elementProperties;
    for (const i2 of s2.keys()) this.hasOwnProperty(i2) && (t2.set(i2, this[i2]), delete this[i2]);
    t2.size > 0 && (this._$Ep = t2);
  }
  createRenderRoot() {
    const t2 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S$1(t2, this.constructor.elementStyles), t2;
  }
  connectedCallback() {
    var _a2;
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(true), (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t2) => {
      var _a3;
      return (_a3 = t2.hostConnected) == null ? void 0 : _a3.call(t2);
    });
  }
  enableUpdating(t2) {
  }
  disconnectedCallback() {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t2) => {
      var _a3;
      return (_a3 = t2.hostDisconnected) == null ? void 0 : _a3.call(t2);
    });
  }
  attributeChangedCallback(t2, s2, i2) {
    this._$AK(t2, i2);
  }
  _$ET(t2, s2) {
    var _a2;
    const i2 = this.constructor.elementProperties.get(t2), e2 = this.constructor._$Eu(t2, i2);
    if (void 0 !== e2 && true === i2.reflect) {
      const h2 = (void 0 !== ((_a2 = i2.converter) == null ? void 0 : _a2.toAttribute) ? i2.converter : u$1).toAttribute(s2, i2.type);
      this._$Em = t2, null == h2 ? this.removeAttribute(e2) : this.setAttribute(e2, h2), this._$Em = null;
    }
  }
  _$AK(t2, s2) {
    var _a2, _b;
    const i2 = this.constructor, e2 = i2._$Eh.get(t2);
    if (void 0 !== e2 && this._$Em !== e2) {
      const t3 = i2.getPropertyOptions(e2), h2 = "function" == typeof t3.converter ? { fromAttribute: t3.converter } : void 0 !== ((_a2 = t3.converter) == null ? void 0 : _a2.fromAttribute) ? t3.converter : u$1;
      this._$Em = e2;
      const r2 = h2.fromAttribute(s2, t3.type);
      this[e2] = r2 ?? ((_b = this._$Ej) == null ? void 0 : _b.get(e2)) ?? r2, this._$Em = null;
    }
  }
  requestUpdate(t2, s2, i2, e2 = false, h2) {
    var _a2;
    if (void 0 !== t2) {
      const r2 = this.constructor;
      if (false === e2 && (h2 = this[t2]), i2 ?? (i2 = r2.getPropertyOptions(t2)), !((i2.hasChanged ?? f$1)(h2, s2) || i2.useDefault && i2.reflect && h2 === ((_a2 = this._$Ej) == null ? void 0 : _a2.get(t2)) && !this.hasAttribute(r2._$Eu(t2, i2)))) return;
      this.C(t2, s2, i2);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t2, s2, { useDefault: i2, reflect: e2, wrapped: h2 }, r2) {
    i2 && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(t2) && (this._$Ej.set(t2, r2 ?? s2 ?? this[t2]), true !== h2 || void 0 !== r2) || (this._$AL.has(t2) || (this.hasUpdated || i2 || (s2 = void 0), this._$AL.set(t2, s2)), true === e2 && this._$Em !== t2 && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(t2));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t3) {
      Promise.reject(t3);
    }
    const t2 = this.scheduleUpdate();
    return null != t2 && await t2, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    var _a2;
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
        for (const [t4, s3] of this._$Ep) this[t4] = s3;
        this._$Ep = void 0;
      }
      const t3 = this.constructor.elementProperties;
      if (t3.size > 0) for (const [s3, i2] of t3) {
        const { wrapped: t4 } = i2, e2 = this[s3];
        true !== t4 || this._$AL.has(s3) || void 0 === e2 || this.C(s3, void 0, i2, e2);
      }
    }
    let t2 = false;
    const s2 = this._$AL;
    try {
      t2 = this.shouldUpdate(s2), t2 ? (this.willUpdate(s2), (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t3) => {
        var _a3;
        return (_a3 = t3.hostUpdate) == null ? void 0 : _a3.call(t3);
      }), this.update(s2)) : this._$EM();
    } catch (s3) {
      throw t2 = false, this._$EM(), s3;
    }
    t2 && this._$AE(s2);
  }
  willUpdate(t2) {
  }
  _$AE(t2) {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t3) => {
      var _a3;
      return (_a3 = t3.hostUpdated) == null ? void 0 : _a3.call(t3);
    }), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t2)), this.updated(t2);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t2) {
    return true;
  }
  update(t2) {
    this._$Eq && (this._$Eq = this._$Eq.forEach((t3) => this._$ET(t3, this[t3]))), this._$EM();
  }
  updated(t2) {
  }
  firstUpdated(t2) {
  }
};
y$1.elementStyles = [], y$1.shadowRootOptions = { mode: "open" }, y$1[d$1("elementProperties")] = /* @__PURE__ */ new Map(), y$1[d$1("finalized")] = /* @__PURE__ */ new Map(), p$1 == null ? void 0 : p$1({ ReactiveElement: y$1 }), (a$1.reactiveElementVersions ?? (a$1.reactiveElementVersions = [])).push("2.1.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t$1 = globalThis, i$1 = (t2) => t2, s$1 = t$1.trustedTypes, e = s$1 ? s$1.createPolicy("lit-html", { createHTML: (t2) => t2 }) : void 0, h = "$lit$", o$2 = `lit$${Math.random().toFixed(9).slice(2)}$`, n$1 = "?" + o$2, r$2 = `<${n$1}>`, l = document, c = () => l.createComment(""), a = (t2) => null === t2 || "object" != typeof t2 && "function" != typeof t2, u = Array.isArray, d = (t2) => u(t2) || "function" == typeof (t2 == null ? void 0 : t2[Symbol.iterator]), f = "[ 	\n\f\r]", v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, _ = /-->/g, m = />/g, p = RegExp(`>|${f}(?:([^\\s"'>=/]+)(${f}*=${f}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), g = /'/g, $ = /"/g, y2 = /^(?:script|style|textarea|title)$/i, x = (t2) => (i2, ...s2) => ({ _$litType$: t2, strings: i2, values: s2 }), b = x(1), E = Symbol.for("lit-noChange"), A = Symbol.for("lit-nothing"), C = /* @__PURE__ */ new WeakMap(), P = l.createTreeWalker(l, 129);
function V(t2, i2) {
  if (!u(t2) || !t2.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e ? e.createHTML(i2) : i2;
}
const N = (t2, i2) => {
  const s2 = t2.length - 1, e2 = [];
  let n3, l2 = 2 === i2 ? "<svg>" : 3 === i2 ? "<math>" : "", c2 = v;
  for (let i3 = 0; i3 < s2; i3++) {
    const s3 = t2[i3];
    let a2, u2, d2 = -1, f2 = 0;
    for (; f2 < s3.length && (c2.lastIndex = f2, u2 = c2.exec(s3), null !== u2); ) f2 = c2.lastIndex, c2 === v ? "!--" === u2[1] ? c2 = _ : void 0 !== u2[1] ? c2 = m : void 0 !== u2[2] ? (y2.test(u2[2]) && (n3 = RegExp("</" + u2[2], "g")), c2 = p) : void 0 !== u2[3] && (c2 = p) : c2 === p ? ">" === u2[0] ? (c2 = n3 ?? v, d2 = -1) : void 0 === u2[1] ? d2 = -2 : (d2 = c2.lastIndex - u2[2].length, a2 = u2[1], c2 = void 0 === u2[3] ? p : '"' === u2[3] ? $ : g) : c2 === $ || c2 === g ? c2 = p : c2 === _ || c2 === m ? c2 = v : (c2 = p, n3 = void 0);
    const x2 = c2 === p && t2[i3 + 1].startsWith("/>") ? " " : "";
    l2 += c2 === v ? s3 + r$2 : d2 >= 0 ? (e2.push(a2), s3.slice(0, d2) + h + s3.slice(d2) + o$2 + x2) : s3 + o$2 + (-2 === d2 ? i3 : x2);
  }
  return [V(t2, l2 + (t2[s2] || "<?>") + (2 === i2 ? "</svg>" : 3 === i2 ? "</math>" : "")), e2];
};
class S {
  constructor({ strings: t2, _$litType$: i2 }, e2) {
    let r2;
    this.parts = [];
    let l2 = 0, a2 = 0;
    const u2 = t2.length - 1, d2 = this.parts, [f2, v2] = N(t2, i2);
    if (this.el = S.createElement(f2, e2), P.currentNode = this.el.content, 2 === i2 || 3 === i2) {
      const t3 = this.el.content.firstChild;
      t3.replaceWith(...t3.childNodes);
    }
    for (; null !== (r2 = P.nextNode()) && d2.length < u2; ) {
      if (1 === r2.nodeType) {
        if (r2.hasAttributes()) for (const t3 of r2.getAttributeNames()) if (t3.endsWith(h)) {
          const i3 = v2[a2++], s2 = r2.getAttribute(t3).split(o$2), e3 = /([.?@])?(.*)/.exec(i3);
          d2.push({ type: 1, index: l2, name: e3[2], strings: s2, ctor: "." === e3[1] ? I : "?" === e3[1] ? L : "@" === e3[1] ? z : H }), r2.removeAttribute(t3);
        } else t3.startsWith(o$2) && (d2.push({ type: 6, index: l2 }), r2.removeAttribute(t3));
        if (y2.test(r2.tagName)) {
          const t3 = r2.textContent.split(o$2), i3 = t3.length - 1;
          if (i3 > 0) {
            r2.textContent = s$1 ? s$1.emptyScript : "";
            for (let s2 = 0; s2 < i3; s2++) r2.append(t3[s2], c()), P.nextNode(), d2.push({ type: 2, index: ++l2 });
            r2.append(t3[i3], c());
          }
        }
      } else if (8 === r2.nodeType) if (r2.data === n$1) d2.push({ type: 2, index: l2 });
      else {
        let t3 = -1;
        for (; -1 !== (t3 = r2.data.indexOf(o$2, t3 + 1)); ) d2.push({ type: 7, index: l2 }), t3 += o$2.length - 1;
      }
      l2++;
    }
  }
  static createElement(t2, i2) {
    const s2 = l.createElement("template");
    return s2.innerHTML = t2, s2;
  }
}
function M(t2, i2, s2 = t2, e2) {
  var _a2, _b;
  if (i2 === E) return i2;
  let h2 = void 0 !== e2 ? (_a2 = s2._$Co) == null ? void 0 : _a2[e2] : s2._$Cl;
  const o2 = a(i2) ? void 0 : i2._$litDirective$;
  return (h2 == null ? void 0 : h2.constructor) !== o2 && ((_b = h2 == null ? void 0 : h2._$AO) == null ? void 0 : _b.call(h2, false), void 0 === o2 ? h2 = void 0 : (h2 = new o2(t2), h2._$AT(t2, s2, e2)), void 0 !== e2 ? (s2._$Co ?? (s2._$Co = []))[e2] = h2 : s2._$Cl = h2), void 0 !== h2 && (i2 = M(t2, h2._$AS(t2, i2.values), h2, e2)), i2;
}
class R {
  constructor(t2, i2) {
    this._$AV = [], this._$AN = void 0, this._$AD = t2, this._$AM = i2;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t2) {
    const { el: { content: i2 }, parts: s2 } = this._$AD, e2 = ((t2 == null ? void 0 : t2.creationScope) ?? l).importNode(i2, true);
    P.currentNode = e2;
    let h2 = P.nextNode(), o2 = 0, n3 = 0, r2 = s2[0];
    for (; void 0 !== r2; ) {
      if (o2 === r2.index) {
        let i3;
        2 === r2.type ? i3 = new k(h2, h2.nextSibling, this, t2) : 1 === r2.type ? i3 = new r2.ctor(h2, r2.name, r2.strings, this, t2) : 6 === r2.type && (i3 = new Z(h2, this, t2)), this._$AV.push(i3), r2 = s2[++n3];
      }
      o2 !== (r2 == null ? void 0 : r2.index) && (h2 = P.nextNode(), o2++);
    }
    return P.currentNode = l, e2;
  }
  p(t2) {
    let i2 = 0;
    for (const s2 of this._$AV) void 0 !== s2 && (void 0 !== s2.strings ? (s2._$AI(t2, s2, i2), i2 += s2.strings.length - 2) : s2._$AI(t2[i2])), i2++;
  }
}
class k {
  get _$AU() {
    var _a2;
    return ((_a2 = this._$AM) == null ? void 0 : _a2._$AU) ?? this._$Cv;
  }
  constructor(t2, i2, s2, e2) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t2, this._$AB = i2, this._$AM = s2, this.options = e2, this._$Cv = (e2 == null ? void 0 : e2.isConnected) ?? true;
  }
  get parentNode() {
    let t2 = this._$AA.parentNode;
    const i2 = this._$AM;
    return void 0 !== i2 && 11 === (t2 == null ? void 0 : t2.nodeType) && (t2 = i2.parentNode), t2;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t2, i2 = this) {
    t2 = M(this, t2, i2), a(t2) ? t2 === A || null == t2 || "" === t2 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t2 !== this._$AH && t2 !== E && this._(t2) : void 0 !== t2._$litType$ ? this.$(t2) : void 0 !== t2.nodeType ? this.T(t2) : d(t2) ? this.k(t2) : this._(t2);
  }
  O(t2) {
    return this._$AA.parentNode.insertBefore(t2, this._$AB);
  }
  T(t2) {
    this._$AH !== t2 && (this._$AR(), this._$AH = this.O(t2));
  }
  _(t2) {
    this._$AH !== A && a(this._$AH) ? this._$AA.nextSibling.data = t2 : this.T(l.createTextNode(t2)), this._$AH = t2;
  }
  $(t2) {
    var _a2;
    const { values: i2, _$litType$: s2 } = t2, e2 = "number" == typeof s2 ? this._$AC(t2) : (void 0 === s2.el && (s2.el = S.createElement(V(s2.h, s2.h[0]), this.options)), s2);
    if (((_a2 = this._$AH) == null ? void 0 : _a2._$AD) === e2) this._$AH.p(i2);
    else {
      const t3 = new R(e2, this), s3 = t3.u(this.options);
      t3.p(i2), this.T(s3), this._$AH = t3;
    }
  }
  _$AC(t2) {
    let i2 = C.get(t2.strings);
    return void 0 === i2 && C.set(t2.strings, i2 = new S(t2)), i2;
  }
  k(t2) {
    u(this._$AH) || (this._$AH = [], this._$AR());
    const i2 = this._$AH;
    let s2, e2 = 0;
    for (const h2 of t2) e2 === i2.length ? i2.push(s2 = new k(this.O(c()), this.O(c()), this, this.options)) : s2 = i2[e2], s2._$AI(h2), e2++;
    e2 < i2.length && (this._$AR(s2 && s2._$AB.nextSibling, e2), i2.length = e2);
  }
  _$AR(t2 = this._$AA.nextSibling, s2) {
    var _a2;
    for ((_a2 = this._$AP) == null ? void 0 : _a2.call(this, false, true, s2); t2 !== this._$AB; ) {
      const s3 = i$1(t2).nextSibling;
      i$1(t2).remove(), t2 = s3;
    }
  }
  setConnected(t2) {
    var _a2;
    void 0 === this._$AM && (this._$Cv = t2, (_a2 = this._$AP) == null ? void 0 : _a2.call(this, t2));
  }
}
class H {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t2, i2, s2, e2, h2) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t2, this.name = i2, this._$AM = e2, this.options = h2, s2.length > 2 || "" !== s2[0] || "" !== s2[1] ? (this._$AH = Array(s2.length - 1).fill(new String()), this.strings = s2) : this._$AH = A;
  }
  _$AI(t2, i2 = this, s2, e2) {
    const h2 = this.strings;
    let o2 = false;
    if (void 0 === h2) t2 = M(this, t2, i2, 0), o2 = !a(t2) || t2 !== this._$AH && t2 !== E, o2 && (this._$AH = t2);
    else {
      const e3 = t2;
      let n3, r2;
      for (t2 = h2[0], n3 = 0; n3 < h2.length - 1; n3++) r2 = M(this, e3[s2 + n3], i2, n3), r2 === E && (r2 = this._$AH[n3]), o2 || (o2 = !a(r2) || r2 !== this._$AH[n3]), r2 === A ? t2 = A : t2 !== A && (t2 += (r2 ?? "") + h2[n3 + 1]), this._$AH[n3] = r2;
    }
    o2 && !e2 && this.j(t2);
  }
  j(t2) {
    t2 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t2 ?? "");
  }
}
class I extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t2) {
    this.element[this.name] = t2 === A ? void 0 : t2;
  }
}
class L extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t2) {
    this.element.toggleAttribute(this.name, !!t2 && t2 !== A);
  }
}
class z extends H {
  constructor(t2, i2, s2, e2, h2) {
    super(t2, i2, s2, e2, h2), this.type = 5;
  }
  _$AI(t2, i2 = this) {
    if ((t2 = M(this, t2, i2, 0) ?? A) === E) return;
    const s2 = this._$AH, e2 = t2 === A && s2 !== A || t2.capture !== s2.capture || t2.once !== s2.once || t2.passive !== s2.passive, h2 = t2 !== A && (s2 === A || e2);
    e2 && this.element.removeEventListener(this.name, this, s2), h2 && this.element.addEventListener(this.name, this, t2), this._$AH = t2;
  }
  handleEvent(t2) {
    var _a2;
    "function" == typeof this._$AH ? this._$AH.call(((_a2 = this.options) == null ? void 0 : _a2.host) ?? this.element, t2) : this._$AH.handleEvent(t2);
  }
}
class Z {
  constructor(t2, i2, s2) {
    this.element = t2, this.type = 6, this._$AN = void 0, this._$AM = i2, this.options = s2;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t2) {
    M(this, t2);
  }
}
const B = t$1.litHtmlPolyfillSupport;
B == null ? void 0 : B(S, k), (t$1.litHtmlVersions ?? (t$1.litHtmlVersions = [])).push("3.3.3");
const D = (t2, i2, s2) => {
  const e2 = (s2 == null ? void 0 : s2.renderBefore) ?? i2;
  let h2 = e2._$litPart$;
  if (void 0 === h2) {
    const t3 = (s2 == null ? void 0 : s2.renderBefore) ?? null;
    e2._$litPart$ = h2 = new k(i2.insertBefore(c(), t3), t3, void 0, s2 ?? {});
  }
  return h2._$AI(t2), h2;
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const s = globalThis;
class i extends y$1 {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var _a2;
    const t2 = super.createRenderRoot();
    return (_a2 = this.renderOptions).renderBefore ?? (_a2.renderBefore = t2.firstChild), t2;
  }
  update(t2) {
    const r2 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t2), this._$Do = D(r2, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    var _a2;
    super.connectedCallback(), (_a2 = this._$Do) == null ? void 0 : _a2.setConnected(true);
  }
  disconnectedCallback() {
    var _a2;
    super.disconnectedCallback(), (_a2 = this._$Do) == null ? void 0 : _a2.setConnected(false);
  }
  render() {
    return E;
  }
}
i._$litElement$ = true, i["finalized"] = true, (_a = s.litElementHydrateSupport) == null ? void 0 : _a.call(s, { LitElement: i });
const o$1 = s.litElementPolyfillSupport;
o$1 == null ? void 0 : o$1({ LitElement: i });
(s.litElementVersions ?? (s.litElementVersions = [])).push("4.2.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t = (t2) => (e2, o2) => {
  void 0 !== o2 ? o2.addInitializer(() => {
    customElements.define(t2, e2);
  }) : customElements.define(t2, e2);
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const o = { attribute: true, type: String, converter: u$1, reflect: false, hasChanged: f$1 }, r$1 = (t2 = o, e2, r2) => {
  const { kind: n3, metadata: i2 } = r2;
  let s2 = globalThis.litPropertyMetadata.get(i2);
  if (void 0 === s2 && globalThis.litPropertyMetadata.set(i2, s2 = /* @__PURE__ */ new Map()), "setter" === n3 && ((t2 = Object.create(t2)).wrapped = true), s2.set(r2.name, t2), "accessor" === n3) {
    const { name: o2 } = r2;
    return { set(r3) {
      const n4 = e2.get.call(this);
      e2.set.call(this, r3), this.requestUpdate(o2, n4, t2, true, r3);
    }, init(e3) {
      return void 0 !== e3 && this.C(o2, void 0, t2, e3), e3;
    } };
  }
  if ("setter" === n3) {
    const { name: o2 } = r2;
    return function(r3) {
      const n4 = this[o2];
      e2.call(this, r3), this.requestUpdate(o2, n4, t2, true, r3);
    };
  }
  throw Error("Unsupported decorator location: " + n3);
};
function n2(t2) {
  return (e2, o2) => "object" == typeof o2 ? r$1(t2, e2, o2) : ((t3, e3, o3) => {
    const r2 = e3.hasOwnProperty(o3);
    return e3.constructor.createProperty(o3, t3), r2 ? Object.getOwnPropertyDescriptor(e3, o3) : void 0;
  })(t2, e2, o2);
}
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
function r(r2) {
  return n2({ ...r2, state: true, attribute: false });
}
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
  for (var i2 = decorators.length - 1, decorator; i2 >= 0; i2--)
    if (decorator = decorators[i2])
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
let ElectricityPanelEditor = class extends i {
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
    var _a2;
    if (this._datalistFilled || !this.hass) return;
    const dl = (_a2 = this.shadowRoot) == null ? void 0 : _a2.getElementById("ep-entities");
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
    for (let i2 = 0; i2 < path.length - 1; i2++) {
      if (node[path[i2]] === void 0) node[path[i2]] = {};
      node = node[path[i2]];
    }
    const last = path[path.length - 1];
    if (value === "" || value === void 0) delete node[last];
    else node[last] = value;
    this._config = cfg;
    this._fire(cfg);
  }
  _inputHandler(path) {
    return (e2) => this._set(path, e2.target.value);
  }
  // ── Circuit management ─────────────────────────────────────────────────────
  _addCircuit() {
    const cfg = deepClone(this._config);
    cfg.circuits ?? (cfg.circuits = []);
    const n3 = cfg.circuits.length + 1;
    cfg.circuits.push({ id: `c${String(n3).padStart(2, "0")}`, name: "New circuit", phases: 1 });
    this._config = cfg;
    this._fire(cfg);
    this._openCircuit = cfg.circuits.length - 1;
    this._openDevice = -1;
  }
  _removeCircuit(idx) {
    var _a2;
    const cfg = deepClone(this._config);
    (_a2 = cfg.circuits) == null ? void 0 : _a2.splice(idx, 1);
    this._config = cfg;
    this._fire(cfg);
    this._openCircuit = -1;
  }
  _moveCircuit(idx, dir) {
    const cfg = deepClone(this._config);
    const arr = cfg.circuits ?? [];
    const t2 = idx + dir;
    if (t2 < 0 || t2 >= arr.length) return;
    [arr[idx], arr[t2]] = [arr[t2], arr[idx]];
    this._config = cfg;
    this._fire(cfg);
    this._openCircuit = t2;
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
    const c2 = cfg.circuits[idx];
    if (val === "") {
      delete c2[field];
    } else {
      c2[field] = field === "phases" ? parseInt(val) : field === "max_current" ? parseFloat(val) : val;
    }
    if (field === "name" && val) c2.id = slugify(val);
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
    var _a2;
    const cfg = deepClone(this._config);
    (_a2 = cfg.circuits[ci]).devices ?? (_a2.devices = []);
    cfg.circuits[ci].devices.push({ name: "New device" });
    this._config = cfg;
    this._fire(cfg);
    this._openDevice = cfg.circuits[ci].devices.length - 1;
  }
  _removeDevice(ci, di) {
    var _a2;
    const cfg = deepClone(this._config);
    (_a2 = cfg.circuits[ci].devices) == null ? void 0 : _a2.splice(di, 1);
    this._config = cfg;
    this._fire(cfg);
    this._openDevice = -1;
  }
  _setDeviceField(ci, di, field, val) {
    const cfg = deepClone(this._config);
    const d2 = cfg.circuits[ci].devices[di];
    if (val === "") delete d2[field];
    else d2[field] = val;
    this._config = cfg;
    this._fire(cfg);
  }
  // ── Channel management ─────────────────────────────────────────────────────
  _addChannel(ci, di) {
    var _a2;
    const cfg = deepClone(this._config);
    (_a2 = cfg.circuits[ci].devices[di]).channels ?? (_a2.channels = []);
    cfg.circuits[ci].devices[di].channels.push({ name: "New channel" });
    this._config = cfg;
    this._fire(cfg);
  }
  _removeChannel(ci, di, chi) {
    var _a2;
    const cfg = deepClone(this._config);
    (_a2 = cfg.circuits[ci].devices[di].channels) == null ? void 0 : _a2.splice(chi, 1);
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
    return b`
      <div class="field">
        <label>${label}</label>
        <input list="ep-entities" .value=${value ?? ""} placeholder="entity_id"
          @change=${(e2) => onChange(e2.target.value)} />
      </div>`;
  }
  _textField(label, value, onChange, ph = "") {
    return b`
      <div class="field">
        <label>${label}</label>
        <input type="text" .value=${value ?? ""} placeholder=${ph}
          @input=${(e2) => onChange(e2.target.value)} />
      </div>`;
  }
  _numField(label, value, onChange, ph = "") {
    return b`
      <div class="field">
        <label>${label}</label>
        <input type="number" min="0" .value=${value !== void 0 ? String(value) : ""} placeholder=${ph}
          @change=${(e2) => onChange(e2.target.value)} />
      </div>`;
  }
  // ── Section renderers ──────────────────────────────────────────────────────
  _renderMeterSection() {
    const m2 = this._config.main_meter ?? {};
    const s2 = (f2) => (v2) => this._set(["main_meter", f2], v2);
    return b`
      <details class="section">
        <summary>Main meter</summary>
        <div class="section-body">
          <div class="group-label">Power (W per phase)</div>
          ${this._entityField("L1 power", m2.power_l1, s2("power_l1"))}
          ${this._entityField("L2 power", m2.power_l2, s2("power_l2"))}
          ${this._entityField("L3 power", m2.power_l3, s2("power_l3"))}
          <div class="group-label">Current (A per phase)</div>
          ${this._entityField("L1 current", m2.current_l1, s2("current_l1"))}
          ${this._entityField("L2 current", m2.current_l2, s2("current_l2"))}
          ${this._entityField("L3 current", m2.current_l3, s2("current_l3"))}
          <div class="group-label">Energy</div>
          ${this._entityField("Energy today (kWh)", m2.energy_today, s2("energy_today"))}
        </div>
      </details>`;
  }
  _renderHdoSection() {
    const h2 = this._config.hdo ?? {};
    const s2 = (f2) => (v2) => this._set(["hdo", f2], v2);
    return b`
      <details class="section">
        <summary>HDO (time-of-use tariff)</summary>
        <div class="section-body">
          ${this._entityField("HDO switch (on = NT / low tariff)", h2.switch, s2("switch"))}
          ${this._entityField("Next high tariff start", h2.next_high, s2("next_high"))}
          ${this._entityField("Next low tariff start", h2.next_low, s2("next_low"))}
          ${this._entityField("Workday sensor", h2.workday_sensor, s2("workday_sensor"))}
          <div class="field">
            <label>PRE tariff preset (NT schedule)</label>
            <select @change=${(e2) => s2("tariff_preset")(e2.target.value)}>
              <option value="" ?selected=${!h2.tariff_preset}>— none / manual schedule —</option>
              ${Object.entries(PRE_TARIFFS).map(([code, preset]) => b`
                <option value="${code}" ?selected=${h2.tariff_preset === code}>
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
          ${this._numField("NT price per kWh (low tariff)", h2.nt_price, s2("nt_price"), "0.00")}
          ${this._numField("VT price per kWh (high tariff)", h2.vt_price, s2("vt_price"), "0.00")}
          ${this._textField("Currency symbol", h2.currency, s2("currency"), "Kč")}
        </div>
      </details>`;
  }
  _renderChannelRow(ci, di, ch, chi) {
    const s2 = (f2) => (v2) => this._setChannelField(ci, di, chi, f2, v2);
    return b`
      <div class="channel-block">
        <div class="ch-header">
          <span>Channel ${chi + 1}: ${ch.name || "(unnamed)"}</span>
          <button class="btn-icon danger" title="Remove"
            @click=${() => this._removeChannel(ci, di, chi)}>
            <ha-icon icon="mdi:minus-circle-outline"></ha-icon>
          </button>
        </div>
        ${this._textField("Name", ch.name, s2("name"), "e.g. Living room zone")}
        ${this._entityField("Switch", ch.switch, s2("switch"))}
        ${this._entityField("Power (W)", ch.power, s2("power"))}
        ${this._entityField("Current (A)", ch.current, s2("current"))}
      </div>`;
  }
  _setDeviceNote(ci, di, val) {
    const cfg = deepClone(this._config);
    const d2 = cfg.circuits[ci].devices[di];
    if (val) {
      d2.note = true;
      delete d2.switch;
      delete d2.power;
      delete d2.current;
      delete d2.channels;
    } else {
      delete d2.note;
    }
    this._config = cfg;
    this._fire(cfg);
  }
  _renderDeviceRow(ci, d2, di) {
    const open = this._openDevice === di;
    const s2 = (f2) => (v2) => this._setDeviceField(ci, di, f2, v2);
    return b`
      <div class="sub-item ${open ? "open" : ""}">
        <div class="row-hdr" @click=${() => {
      this._openDevice = open ? -1 : di;
    }}>
          <ha-icon icon="${d2.note ? "mdi:label-outline" : "mdi:power-plug-outline"}" class="device-type-icon"></ha-icon>
          <span class="row-lbl">${d2.name || "(unnamed device)"}</span>
          ${d2.note ? b`<span class="badge warn">note</span>` : A}
          <div class="row-acts" @click=${(e2) => e2.stopPropagation()}>
            <button class="btn-icon danger" @click=${() => this._removeDevice(ci, di)}>
              <ha-icon icon="mdi:minus-circle-outline"></ha-icon>
            </button>
          </div>
          <ha-icon icon="${open ? "mdi:chevron-up" : "mdi:chevron-down"}" class="chevron"></ha-icon>
        </div>
        ${open ? b`
          <div class="sub-fields">
            ${this._textField("Device name", d2.name, s2("name"), "e.g. Washing machine")}
            <div class="field checkbox">
              <input type="checkbox" id="note-${ci}-${di}" .checked=${d2.note ?? false}
                @change=${(e2) => this._setDeviceNote(ci, di, e2.target.checked)} />
              <label for="note-${ci}-${di}">Text label only (no entities, no switch)</label>
            </div>
            ${!d2.note ? b`
              ${this._entityField("Switch", d2.switch, s2("switch"))}
              ${this._entityField("Power (W)", d2.power, s2("power"))}
              ${this._entityField("Current (A)", d2.current, s2("current"))}
              <div class="group-label" style="margin-top:10px;">
                Channels (for multi-relay devices like Shelly 4PM)
              </div>
              ${(d2.channels ?? []).map((ch, chi) => this._renderChannelRow(ci, di, ch, chi))}
              <button class="btn-add" @click=${() => this._addChannel(ci, di)}>
                <ha-icon icon="mdi:plus"></ha-icon> Add channel
              </button>
            ` : A}
          </div>` : A}
      </div>`;
  }
  _renderCircuitRow(c2, idx) {
    var _a2;
    const open = this._openCircuit === idx;
    ((_a2 = this._config.circuits) == null ? void 0 : _a2.length) ?? 0;
    const sf = (f2) => (v2) => this._setCircuitField(idx, f2, v2);
    return b`
      <div class="sub-item ${open ? "open" : ""}"
        @dragover=${(e2) => {
      e2.preventDefault();
      if (this._dragSrcIdx !== idx) this._dragOverIdx = idx;
      this.requestUpdate();
    }}
        @dragleave=${() => {
      if (this._dragOverIdx === idx) {
        this._dragOverIdx = -1;
        this.requestUpdate();
      }
    }}
        @drop=${(e2) => {
      e2.preventDefault();
      if (this._dragSrcIdx >= 0 && this._dragSrcIdx !== idx) this._moveCircuitTo(this._dragSrcIdx, idx);
    }}>
        <div class="row-hdr ${this._dragOverIdx === idx ? "drag-over" : ""}"
          @click=${() => {
      this._openCircuit = open ? -1 : idx;
      this._openDevice = -1;
    }}>
          <span class="drag-handle"
            draggable="true"
            @dragstart=${(e2) => {
      this._dragSrcIdx = idx;
      e2.dataTransfer.effectAllowed = "move";
      e2.stopPropagation();
    }}
            @dragend=${() => {
      this._dragOverIdx = -1;
      this.requestUpdate();
    }}
            @click=${(e2) => e2.stopPropagation()}>⠿</span>
          <span class="row-lbl">${c2.name || "(unnamed circuit)"}</span>
          <div class="badges">
            ${c2.phases === 3 ? b`<span class="badge info">3ph</span>` : A}
            ${c2.critical ? b`<span class="badge warn">critical</span>` : A}
          </div>
          <div class="row-acts" @click=${(e2) => e2.stopPropagation()}>
            <button class="btn-icon danger" @click=${() => this._removeCircuit(idx)}>
              <ha-icon icon="mdi:minus-circle-outline"></ha-icon>
            </button>
          </div>
          <ha-icon icon="${open ? "mdi:chevron-up" : "mdi:chevron-down"}" class="chevron"></ha-icon>
        </div>
        ${open ? b`
          <div class="sub-fields">
            ${this._textField("Circuit name", c2.name, sf("name"), "e.g. Kitchen left")}
            ${this._textField("Circuit ID", c2.id, sf("id"), "e.g. c08")}
            <div class="field">
              <label>Phases</label>
              <select @change=${(e2) => this._setCircuitField(idx, "phases", e2.target.value)}>
                <option value="1" ?selected=${c2.phases !== 3}>1 — single-phase</option>
                <option value="3" ?selected=${c2.phases === 3}>3 — three-phase</option>
              </select>
            </div>
            <div class="field checkbox">
              <input type="checkbox" id="crit-${idx}" .checked=${c2.critical ?? false}
                @change=${(e2) => this._setCircuitCheck(idx, "critical", e2.target.checked)} />
              <label for="crit-${idx}">Critical circuit (disables remote toggle)</label>
            </div>
            ${this._numField("Max current A (breaker rating)", c2.max_current, sf("max_current"), c2.phases === 3 ? "63" : "16")}
            <div class="group-label" style="margin-top:10px;">Breaker entities</div>
            ${this._entityField("Switch", c2.switch, sf("switch"))}
            ${this._entityField("Total power (W)", c2.power, sf("power"))}
            ${this._entityField("Total current (A)", c2.current, sf("current"))}
            ${this._entityField("Energy today (kWh)", c2.energy, sf("energy"))}
            ${this._entityField("Voltage (V)", c2.voltage, sf("voltage"))}
            ${c2.phases === 3 ? b`
              <div class="group-label" style="margin-top:10px;">Per-phase entities (3φ breakdown)</div>
              ${this._entityField("L1 power (W)", c2.power_l1, sf("power_l1"))}
              ${this._entityField("L2 power (W)", c2.power_l2, sf("power_l2"))}
              ${this._entityField("L3 power (W)", c2.power_l3, sf("power_l3"))}
              ${this._entityField("L1 current (A)", c2.current_l1, sf("current_l1"))}
              ${this._entityField("L2 current (A)", c2.current_l2, sf("current_l2"))}
              ${this._entityField("L3 current (A)", c2.current_l3, sf("current_l3"))}
            ` : A}
            <div class="group-label" style="margin-top:10px;">Devices behind this breaker</div>
            ${(c2.devices ?? []).map((d2, di) => this._renderDeviceRow(idx, d2, di))}
            <button class="btn-add" @click=${() => this._addDevice(idx)}>
              <ha-icon icon="mdi:plus"></ha-icon> Add device
            </button>
          </div>` : A}
      </div>`;
  }
  // ── Main render ────────────────────────────────────────────────────────────
  render() {
    if (!this._config) return b``;
    return b`
      <datalist id="ep-entities"></datalist>
      <div class="editor">
        ${this._textField(
      "Card title (optional)",
      this._config.title,
      (v2) => this._set(["title"], v2),
      "Electricity panel"
    )}
        ${this._numField(
      "History graph period (h, 1–24)",
      this._config.graph_hours,
      (v2) => this._set(["graph_hours"], Math.max(1, Math.min(24, parseFloat(v2) || 3))),
      "3"
    )}
        ${this._renderMeterSection()}
        ${this._renderHdoSection()}
        <div class="sec-hdr">Circuits</div>
        ${(this._config.circuits ?? []).map((c2, i2) => this._renderCircuitRow(c2, i2))}
        <button class="btn-add primary" @click=${() => this._addCircuit()}>
          <ha-icon icon="mdi:plus-circle-outline"></ha-icon> Add circuit
        </button>
      </div>`;
  }
};
ElectricityPanelEditor.styles = i$3`
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
  n2({ attribute: false })
], ElectricityPanelEditor.prototype, "hass", 2);
__decorateClass$1([
  r()
], ElectricityPanelEditor.prototype, "_config", 2);
__decorateClass$1([
  r()
], ElectricityPanelEditor.prototype, "_openCircuit", 2);
__decorateClass$1([
  r()
], ElectricityPanelEditor.prototype, "_openDevice", 2);
__decorateClass$1([
  r()
], ElectricityPanelEditor.prototype, "_dragOverIdx", 2);
ElectricityPanelEditor = __decorateClass$1([
  t("electricity-panel-editor")
], ElectricityPanelEditor);
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i2 = decorators.length - 1, decorator; i2 >= 0; i2--)
    if (decorator = decorators[i2])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
let ElectricityPanelCard = class extends i {
  constructor() {
    super(...arguments);
    this._expanded = /* @__PURE__ */ new Set();
    this._showTomorrow = false;
    this._scheduleExpanded = false;
    this._trackedIds = [];
    this._historyCache = /* @__PURE__ */ new Map();
    this._historyFetching = false;
  }
  get hass() {
    return this._hass;
  }
  set hass(value) {
    const old = this._hass;
    this._hass = value;
    if (!old) void this._fetchHistory();
    if (!old || !this._trackedIds.length || this._trackedIds.some((id) => value.states[id] !== old.states[id])) {
      this.requestUpdate("hass", old);
    }
  }
  connectedCallback() {
    super.connectedCallback();
    this._timer = window.setInterval(() => this.requestUpdate(), 3e4);
    this._historyTimer = window.setInterval(() => {
      void this._fetchHistory();
    }, 3e5);
    void this._fetchHistory();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timer);
    clearInterval(this._historyTimer);
  }
  // ── HA card API ────────────────────────────────────────────────────────────
  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = config;
    this._trackedIds = this._buildTrackedIds();
    if (!this._historyFetching) this._historyCache.clear();
    void this._fetchHistory();
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
    for (const c2 of this._config.circuits ?? []) {
      ids.push(
        c2.switch,
        c2.power,
        c2.current,
        c2.energy,
        c2.voltage,
        c2.power_l1,
        c2.power_l2,
        c2.power_l3,
        c2.current_l1,
        c2.current_l2,
        c2.current_l3
      );
      for (const d2 of c2.devices ?? []) {
        ids.push(d2.switch, d2.power, d2.current);
        for (const ch of d2.channels ?? []) ids.push(ch.switch, ch.power, ch.current);
      }
    }
    return ids.filter(Boolean);
  }
  static getConfigElement() {
    return document.createElement("electricity-panel-editor");
  }
  static getStubConfig() {
    return { type: "custom:electricity-panel-card", circuits: [] };
  }
  getCardSize() {
    var _a2;
    return 4 + Math.ceil((((_a2 = this._config.circuits) == null ? void 0 : _a2.length) ?? 0) / 2);
  }
  // ── Entity helpers ─────────────────────────────────────────────────────────
  _state(id) {
    var _a2, _b;
    if (!id) return "unavailable";
    return ((_b = (_a2 = this.hass) == null ? void 0 : _a2.states[id]) == null ? void 0 : _b.state) ?? "unavailable";
  }
  _num(id) {
    const n3 = parseFloat(this._state(id));
    return isNaN(n3) ? 0 : n3;
  }
  _isOn(id) {
    return this._state(id) === "on";
  }
  _toggle(entityId) {
    const svc = this._isOn(entityId) ? "turn_off" : "turn_on";
    this.hass.callService("switch", svc, { entity_id: entityId });
  }
  _toggleExpanded(id) {
    const s2 = new Set(this._expanded);
    s2.has(id) ? s2.delete(id) : s2.add(id);
    this._expanded = s2;
  }
  _loadColor(pct) {
    if (pct > 80) return "var(--error-color, #ef4444)";
    if (pct > 55) return "var(--warning-color, #f59e0b)";
    return "var(--success-color, #22c55e)";
  }
  _watts(entityId) {
    var _a2;
    if (!entityId) return 0;
    const entity = (_a2 = this.hass) == null ? void 0 : _a2.states[entityId];
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
    var _a2;
    if (!entityId) return 0;
    const entity = (_a2 = this.hass) == null ? void 0 : _a2.states[entityId];
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
    const h2 = Math.floor(diff / 3600);
    const m2 = Math.floor(diff % 3600 / 60);
    return h2 > 0 ? `${h2} h ${String(m2).padStart(2, "0")} min` : `${m2} min`;
  }
  _dayType() {
    var _a2;
    const isWorkday = this._isOn((_a2 = this._config.hdo) == null ? void 0 : _a2.workday_sensor);
    const d2 = (/* @__PURE__ */ new Date()).getDay();
    if (isWorkday) return "weekday";
    if (d2 === 0 || d2 === 6) return "weekend";
    return "holiday";
  }
  _tomorrowDayType() {
    const d2 = ((/* @__PURE__ */ new Date()).getDay() + 1) % 7;
    return d2 === 0 || d2 === 6 ? "weekend" : "weekday";
  }
  _ntRemainingMins(starts, offsets) {
    const now = Date.now();
    const midnight = /* @__PURE__ */ new Date();
    midnight.setHours(0, 0, 0, 0);
    let rem = 0;
    starts.forEach((s2, i2) => {
      const [h2, m2] = s2.split(":").map(Number);
      const st = midnight.getTime() + (h2 * 60 + m2) * 6e4;
      const en = st + offsets[i2] * 6e4;
      if (now < en) rem += (en - Math.max(now, st)) / 6e4;
    });
    return rem;
  }
  _fmtMins(mins) {
    const h2 = Math.floor(mins / 60);
    const m2 = Math.floor(mins % 60);
    return h2 > 0 ? `${h2}h ${m2}m` : `${m2}m`;
  }
  _fmtCostRate(watts) {
    const hdo = this._config.hdo;
    if (!(hdo == null ? void 0 : hdo.nt_price) && !(hdo == null ? void 0 : hdo.vt_price)) return "";
    const isNT = this._isOn(hdo.switch);
    const ntPrice = parseFloat(hdo.nt_price) || 0;
    const vtPrice = parseFloat(hdo.vt_price) || 0;
    const price = isNT ? ntPrice : vtPrice;
    const cur = hdo.currency ?? "Kč";
    return `${(watts / 1e3 * price).toFixed(2)} ${cur}/h`;
  }
  // ── Full-day schedule builder ──────────────────────────────────────────────
  _buildFullDaySlots(starts, offsets, base, showing) {
    const fmt = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const fmtDur = (m2) => m2 >= 60 ? `${Math.floor(m2 / 60)}h${m2 % 60 ? ` ${m2 % 60}m` : ""}` : `${m2}m`;
    const now = Date.now();
    const dayEnd = base + 864e5;
    const ntWindows = starts.map((start, i2) => {
      const [h2, m2] = start.split(":").map(Number);
      const s2 = base + (h2 * 60 + m2) * 6e4;
      return { s: s2, e: s2 + offsets[i2] * 6e4, durMins: offsets[i2] };
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
    const current = slots.find((s2) => s2.isCurrent);
    return current ? current.pct : -1;
  }
  // ── Render: 24h timeline bar ───────────────────────────────────────────────
  _renderTimeline(slots, showMarker = false) {
    const midnight = /* @__PURE__ */ new Date();
    midnight.setHours(0, 0, 0, 0);
    const nowPct = showMarker ? Math.min(100, (Date.now() - midnight.getTime()) / 864e5 * 100) : -1;
    return b`
      <div class="timeline-bar" style="position:relative">
        ${slots.map((sl) => b`
          <div class="tl-seg ${sl.type} ${sl.isPast ? "past" : sl.isCurrent ? "active" : ""}"
               style="flex:${sl.durMins}"></div>
        `)}
        ${nowPct >= 0 ? b`
          <div class="timeline-now" style="left:${nowPct.toFixed(2)}%"></div>
        ` : A}
      </div>
    `;
  }
  // ── History & sparklines ──────────────────────────────────────────────────
  _graphEntityIds() {
    if (!this._config) return [];
    const ids = [];
    for (const circ of this._config.circuits ?? []) {
      if (circ.phases === 3) {
        [circ.power_l1, circ.power_l2, circ.power_l3].forEach((id) => {
          if (id) ids.push(id);
        });
      } else if (circ.power) {
        ids.push(circ.power);
      }
      if (circ.phases === 3 && circ.power) ids.push(circ.power);
    }
    const mm = this._config.main_meter;
    if (mm) [mm.power_l1, mm.power_l2, mm.power_l3].forEach((id) => {
      if (id) ids.push(id);
    });
    return [...new Set(ids)];
  }
  async _fetchHistory() {
    var _a2, _b;
    if (!this._hass || !this._config || this._historyFetching) return;
    const graphIds = this._graphEntityIds();
    const hdoSwitch = (_a2 = this._config.hdo) == null ? void 0 : _a2.switch;
    if (graphIds.length === 0 && !hdoSwitch) return;
    this._historyFetching = true;
    const hours = this._config.graph_hours ?? 3;
    const graphStart = new Date(Date.now() - hours * 36e5).toISOString();
    const midnight = /* @__PURE__ */ new Date();
    midnight.setHours(0, 0, 0, 0);
    const midnightStr = midnight.toISOString();
    const processEntries = (raw, switchIds) => {
      const cacheRef = this._historyCache;
      let written = 0;
      for (const [id, entries] of Object.entries(raw)) {
        if (!Array.isArray(entries)) {
          console.warn(`[ep-card] ${id}: entries not Array (${typeof entries})`);
          continue;
        }
        const isSwitch = switchIds.includes(id);
        const pts = entries.map((e2) => {
          const stateStr = e2.s ?? e2.state ?? "";
          const tSec = e2.lc ?? e2.lu;
          const t2 = tSec !== void 0 ? tSec * 1e3 : e2.last_changed ? new Date(e2.last_changed).getTime() : NaN;
          const v2 = isSwitch ? stateStr === "on" ? 1 : 0 : parseFloat(stateStr);
          return { t: t2, v: v2 };
        }).filter((p2) => !isNaN(p2.v) && !isNaN(p2.t) && p2.t > 0);
        if (pts.length > 0) {
          cacheRef.set(id, pts);
          written++;
        } else {
          const s2 = JSON.stringify(entries.slice(0, 2).map((e2) => ({ s: e2.s, state: e2.state, lu: e2.lu, lc: e2.lc })));
          console.warn(`[ep-card] ${id}: 0 pts from ${entries.length} entries, sample: ${s2}`);
        }
      }
      console.log(`[ep-card] processEntries: ${written}/${Object.keys(raw).length} written, cache=${cacheRef.size}`);
    };
    if (typeof this._hass.callWS !== "function") {
      console.error("[ep-card] hass.callWS is not available on this HA version");
      this._historyFetching = false;
      return;
    }
    try {
      if (graphIds.length > 0) {
        console.log(`[ep-card] fetching history: ${graphIds.length} entities, start=${graphStart}`);
        const raw = await this._hass.callWS({
          type: "history/history_during_period",
          start_time: graphStart,
          entity_ids: graphIds,
          no_attributes: true,
          significant_changes_only: false
        });
        const keys = Object.keys(raw ?? {});
        const totalPts = keys.reduce((s2, k2) => {
          var _a3;
          return s2 + (((_a3 = raw[k2]) == null ? void 0 : _a3.length) ?? 0);
        }, 0);
        console.log(`[ep-card] history result: ${keys.length} entities, ${totalPts} total points`);
        if (keys.length > 0) {
          const sample = raw[keys[0]];
          console.log(`[ep-card] sample entry (${keys[0]}):`, JSON.stringify(sample == null ? void 0 : sample[0]));
        }
        processEntries(raw, []);
      }
      if (hdoSwitch) {
        const hdoRaw = await this._hass.callWS({
          type: "history/history_during_period",
          start_time: midnightStr,
          entity_ids: [hdoSwitch],
          no_attributes: true,
          significant_changes_only: false
        });
        console.log(`[ep-card] HDO switch history: ${((_b = hdoRaw == null ? void 0 : hdoRaw[hdoSwitch]) == null ? void 0 : _b.length) ?? 0} entries`);
        processEntries(hdoRaw, [hdoSwitch]);
      }
      console.log(`[ep-card] cache now has ${this._historyCache.size} entities`);
      this.requestUpdate();
    } catch (err) {
      console.warn("[ep-card] history fetch failed:", err);
    } finally {
      this._historyFetching = false;
    }
  }
  _isNTAt(t2) {
    const hdo = this._config.hdo;
    if (!hdo) return false;
    if (hdo.switch) {
      const hdoHist = this._historyCache.get(hdo.switch);
      if (hdoHist && hdoHist.length > 0 && t2 >= hdoHist[0].t) {
        let state2 = hdoHist[0].v;
        for (const pt of hdoHist) {
          if (pt.t <= t2) state2 = pt.v;
          else break;
        }
        return state2 > 0.5;
      }
    }
    const preset = hdo.tariff_preset ? PRE_TARIFFS[hdo.tariff_preset] : void 0;
    const src = preset ?? hdo.schedule;
    if (src) {
      const midnight = /* @__PURE__ */ new Date();
      midnight.setHours(0, 0, 0, 0);
      const dt = this._dayType();
      const day = dt === "holiday" && src.holiday ? src.holiday : dt === "weekend" ? src.weekend : src.weekday;
      return day.starts.some((start, i2) => {
        const [h2, m2] = start.split(":").map(Number);
        const s2 = midnight.getTime() + (h2 * 60 + m2) * 6e4;
        return t2 >= s2 && t2 < s2 + day.offsets[i2] * 6e4;
      });
    }
    return this._isOn(hdo.switch);
  }
  _calcDailyCost(powerEntityId) {
    const hdo = this._config.hdo;
    if (!hdo || !hdo.nt_price && !hdo.vt_price || !powerEntityId) return "";
    const data = this._historyCache.get(powerEntityId);
    if (!data || data.length < 2) return "";
    const midnight = /* @__PURE__ */ new Date();
    midnight.setHours(0, 0, 0, 0);
    const todayPts = data.filter((p2) => p2.t >= midnight.getTime());
    if (todayPts.length < 2) return "";
    const ntP = parseFloat(hdo.nt_price) || 0;
    const vtP = parseFloat(hdo.vt_price) || 0;
    let ntWh = 0, vtWh = 0;
    for (let i2 = 1; i2 < todayPts.length; i2++) {
      const dtMs = todayPts[i2].t - todayPts[i2 - 1].t;
      const avgW = (todayPts[i2].v + todayPts[i2 - 1].v) / 2;
      const wh = avgW * (dtMs / 36e5);
      const midT = (todayPts[i2].t + todayPts[i2 - 1].t) / 2;
      if (this._isNTAt(midT)) ntWh += wh;
      else vtWh += wh;
    }
    const cost = ntWh / 1e3 * ntP + vtWh / 1e3 * vtP;
    if (cost < 5e-3) return "";
    const cur = hdo.currency ?? "Kč";
    return `${cost.toFixed(2)} ${cur}`;
  }
  _renderSparkline(entityId) {
    if (!entityId) return A;
    const data = this._historyCache.get(entityId);
    if (!data || data.length < 2) return A;
    const W = 100, H2 = 34, pad = 2;
    const tMin = data[0].t, tMax = data[data.length - 1].t;
    const tRange = tMax - tMin || 1;
    const vals = data.map((p2) => p2.v);
    const vMin = Math.min(...vals), vMax = Math.max(...vals);
    const vRange = vMax - vMin || 0.01;
    const pts = data.map((p2) => {
      const x2 = (p2.t - tMin) / tRange * W;
      const y3 = H2 - pad - (p2.v - vMin) / vRange * (H2 - pad * 2);
      return `${x2.toFixed(1)},${y3.toFixed(1)}`;
    }).join(" ");
    return b`<svg viewBox="0 0 ${W} ${H2}" preserveAspectRatio="none" class="sparkline">
      <polyline points="${pts}" fill="none" stroke="#ef4444" stroke-width="1.5"
        stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }
  // ── Render: HDO schedule ───────────────────────────────────────────────────
  _renderHdoSchedule() {
    const hdo = this._config.hdo;
    if (!hdo) return A;
    const preset = hdo.tariff_preset ? PRE_TARIFFS[hdo.tariff_preset] : void 0;
    const src = preset ?? hdo.schedule;
    if (!src) return A;
    const showing = this._showTomorrow;
    const dt = showing ? this._tomorrowDayType() : this._dayType();
    const day = dt === "holiday" && src.holiday ? src.holiday : dt === "weekend" ? src.weekend : src.weekday;
    const midnight = /* @__PURE__ */ new Date();
    midnight.setHours(0, 0, 0, 0);
    const base = showing ? midnight.getTime() + 864e5 : midnight.getTime();
    const slots = this._buildFullDaySlots(day.starts, day.offsets, base, showing);
    const remaining = showing ? null : this._ntRemainingMins(day.starts, day.offsets);
    const totalNT = day.offsets.reduce((a2, b2) => a2 + b2, 0);
    const exp = this._scheduleExpanded;
    const currentSlot = slots.find((s2) => s2.isCurrent);
    return b`
      <div class="schedule-block">
        <div class="schedule-title" @click=${() => {
      this._scheduleExpanded = !exp;
    }}>
          <span class="schedule-when">${showing ? "Tomorrow" : "Today"}</span>
          <span class="schedule-day">${dt}</span>
          ${!exp && currentSlot ? b`
            <span class="stariff ${currentSlot.type}" style="margin-left:4px">${currentSlot.type.toUpperCase()}</span>
            <span class="nt-remaining-inline">${currentSlot.label}</span>
          ` : A}
          <div class="schedule-nav">
            ${exp && remaining !== null ? b`<span class="nt-remaining">${this._fmtMins(remaining)} NT left · ${this._fmtMins(totalNT)} total</span>` : A}
            ${exp ? b`
              <button class="sday-btn" @click=${(e2) => {
      e2.stopPropagation();
      this._showTomorrow = !this._showTomorrow;
    }}>
                ${showing ? "Today" : "Tomorrow"}
              </button>` : A}
            <ha-icon icon="${exp ? "mdi:chevron-up" : "mdi:chevron-down"}" class="schedule-chevron"></ha-icon>
          </div>
        </div>
        ${this._renderTimeline(slots, !showing)}
        ${exp ? b`
          <div class="schedule-rows">
            ${slots.map((sl) => b`
              <div class="srow ${sl.isPast ? "past" : sl.isCurrent ? "active" : "future"} ${sl.type}">
                <span class="stariff ${sl.type}">${sl.type.toUpperCase()}</span>
                <span class="srow-time">${sl.label}</span>
                <div class="srow-track">
                  <div class="srow-fill ${sl.type}" style="width:${sl.pct.toFixed(1)}%"></div>
                </div>
                ${sl.isCurrent ? b`<span class="snow ${sl.type}">Now</span>` : b`<span class="sdur">${sl.durStr}</span>`}
              </div>
            `)}
          </div>
        ` : A}
      </div>
    `;
  }
  // ── Render: HDO bar ────────────────────────────────────────────────────────
  _renderHdo() {
    const hdo = this._config.hdo;
    if (!(hdo == null ? void 0 : hdo.switch)) return A;
    const isNT = this._isOn(hdo.switch);
    const cd = this._hdoCountdown();
    const price = isNT ? hdo.nt_price : hdo.vt_price;
    const cur = hdo.currency ?? "Kč";
    const slotPct = this._getCurrentSlotPct();
    return b`
      <div class="hdo-bar ${isNT ? "nt" : "vt"}">
        <div class="hdo-dot ${isNT ? "nt" : "vt"}"></div>
        <div class="hdo-info">
          <div class="hdo-label">${isNT ? "NT — low tariff" : "VT — high tariff"}</div>
          ${price ? b`<div class="hdo-sub">${price} ${cur}/kWh</div>` : A}
          ${slotPct >= 0 ? b`
            <div class="hdo-prog"><div class="hdo-prog-fill" style="width:${slotPct.toFixed(1)}%"></div></div>
          ` : A}
        </div>
        ${cd ? b`
          <div class="hdo-cd">
            <div class="hdo-cd-lbl">ends in</div>
            <div class="hdo-cd-val">${cd}</div>
          </div>
        ` : A}
      </div>
    `;
  }
  // ── Render: main meter ─────────────────────────────────────────────────────
  _renderMainMeter() {
    const m2 = this._config.main_meter;
    if (!m2) return A;
    const totalW = this._watts(m2.power_l1) + this._watts(m2.power_l2) + this._watts(m2.power_l3);
    const phases = [
      { label: "L1", power: m2.power_l1, current: m2.current_l1 },
      { label: "L2", power: m2.power_l2, current: m2.current_l2 },
      { label: "L3", power: m2.power_l3, current: m2.current_l3 }
    ];
    return b`
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
            <span class="metric-primary">${(totalW / 1e3).toFixed(2)} kW</span>
            <span class="metric-small">
              ${m2.energy_today ? b`${this._kwh(m2.energy_today).toFixed(1)} kWh today` : A}
              ${(() => {
      const cr = this._calcDailyCost(m2.power_l1 ?? m2.power_l2 ?? m2.power_l3);
      return cr ? b`<span class="metric-sep">·</span><span class="cost-rate">${cr}</span>` : A;
    })()}
            </span>
          </div>
        </div>
        <div class="phases-grid">
          ${phases.map((p2) => b`
            <div class="phase-cell">
              <div class="phase-label">${p2.label}</div>
              <div class="phase-power">${(this._watts(p2.power) / 1e3).toFixed(2)} kW</div>
              <div class="phase-detail">${this._num(p2.current).toFixed(1)} A</div>
              ${this._renderSparkline(p2.power)}
            </div>
          `)}
        </div>
      </div>
    `;
  }
  // ── Render: circuit ────────────────────────────────────────────────────────
  _renderCircuit(c2) {
    var _a2;
    const isOn = this._isOn(c2.switch);
    const power = this._watts(c2.power);
    const current = this._num(c2.current);
    const energy = this._kwh(c2.energy);
    const maxA = c2.max_current ?? (c2.phases === 3 ? 63 : 16);
    const loadPct = Math.min(100, current > 0 ? current / maxA * 100 : power / (maxA * 230) * 100);
    const barColor = this._loadColor(loadPct);
    const expanded = this._expanded.has(c2.id);
    const hasDevices = (((_a2 = c2.devices) == null ? void 0 : _a2.length) ?? 0) > 0;
    const costRate = power > 0 ? this._calcDailyCost(c2.power) : "";
    return b`
      <div class="circuit-card ${c2.critical ? "critical" : ""} ${c2.switch && isOn ? "is-on" : ""}">

        <div class="circuit-header">
          <div class="status-dot ${isOn ? "on" : c2.switch ? "off" : "none"}"></div>
          <span class="circuit-name" title="${c2.name}">${c2.name}</span>
          ${c2.phases === 3 ? b`<span class="badge badge-phase">3φ</span>` : A}
          ${c2.critical ? b`<ha-icon icon="mdi:lock" class="lock-icon"></ha-icon>` : c2.switch ? b`<button
                    class="toggle ${isOn ? "on" : "off"}"
                    @click=${() => this._toggle(c2.switch)}
                    aria-label="${isOn ? "Turn off" : "Turn on"} ${c2.name}">
                  </button>` : A}
        </div>

        <div class="load-track">
          <div class="load-fill" style="width:${loadPct.toFixed(1)}%;background:${barColor}"></div>
        </div>

        <div class="circuit-footer">
          <div class="metrics">
            <span class="metric-primary ${!isOn && power === 0 ? "inactive" : ""}">${this._fmtW(power)}</span>
            <span class="metric-small">
              ${current.toFixed(1)} A
              ${c2.voltage ? b`<span class="metric-sep">·</span>${this._num(c2.voltage).toFixed(0)} V` : A}
              ${energy > 0 ? b`<span class="metric-sep">·</span>${energy.toFixed(2)} kWh` : A}
              ${costRate ? b`<span class="metric-sep">·</span><span class="cost-rate">${costRate}</span>` : A}
            </span>
          </div>
          ${hasDevices ? b`<button class="expand-btn" @click=${() => this._toggleExpanded(c2.id)}>
                <ha-icon icon="${expanded ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon>
              </button>` : A}
        </div>

        ${expanded && hasDevices ? b`<div class="devices-list">${c2.devices.map((d2) => this._renderDevice(d2))}</div>` : A}
      </div>
    `;
  }
  // ── Render: device ─────────────────────────────────────────────────────────
  _renderDevice(d2) {
    var _a2;
    if (d2.note) {
      return b`
        <div class="device-row note-row">
          <ha-icon icon="mdi:label-outline" class="note-icon"></ha-icon>
          <span class="device-name">${d2.name}</span>
        </div>
      `;
    }
    if ((((_a2 = d2.channels) == null ? void 0 : _a2.length) ?? 0) > 0) {
      const chTotalW = d2.channels.reduce((s2, ch) => s2 + this._watts(ch.power), 0);
      const chTotalA = d2.channels.reduce((s2, ch) => s2 + this._num(ch.current), 0);
      const hasChMetrics = d2.channels.some((ch) => ch.power || ch.current);
      return b`
        <div class="device-group">
          <div class="device-group-label">
            <span>${d2.name}</span>
            ${hasChMetrics ? b`<span class="ch-sum">${this._fmtW(chTotalW)} · ${chTotalA.toFixed(1)} A</span>` : A}
          </div>
          ${d2.channels.map((ch) => this._renderChannel(ch))}
        </div>
      `;
    }
    const isOn = this._isOn(d2.switch);
    const power = this._num(d2.power);
    const current = this._num(d2.current);
    return b`
      <div class="device-row">
        <div class="status-dot sm ${isOn ? "on" : d2.switch ? "off" : "none"}"></div>
        <span class="device-name">${d2.name}</span>
        <span class="device-metrics">
          ${power > 0 ? b`${this._fmtW(power)}` : A}
          ${current > 0 ? b` · ${current.toFixed(1)} A` : A}
        </span>
        ${d2.switch ? b`<button
                class="toggle sm ${isOn ? "on" : "off"}"
                @click=${() => this._toggle(d2.switch)}
                aria-label="${isOn ? "Turn off" : "Turn on"} ${d2.name}">
              </button>` : A}
      </div>
    `;
  }
  // ── Render: channel ────────────────────────────────────────────────────────
  _renderChannel(ch) {
    const isOn = this._isOn(ch.switch);
    const power = this._num(ch.power);
    const current = this._num(ch.current);
    return b`
      <div class="device-row channel">
        <div class="status-dot sm ${isOn ? "on" : ch.switch ? "off" : "none"}"></div>
        <span class="device-name">${ch.name}</span>
        <span class="device-metrics">
          ${power > 0 ? b`${this._fmtW(power)}` : A}
          ${current > 0 ? b` · ${current.toFixed(1)} A` : A}
        </span>
        ${ch.switch ? b`<button
                class="toggle sm ${isOn ? "on" : "off"}"
                @click=${() => this._toggle(ch.switch)}
                aria-label="${isOn ? "Turn off" : "Turn on"} ${ch.name}">
              </button>` : A}
      </div>
    `;
  }
  // ── Render: 3-phase circuit ───────────────────────────────────────────────
  _renderThreePhaseCircuit(c2) {
    var _a2;
    const isOn = this._isOn(c2.switch);
    !!(c2.power_l1 || c2.power_l2 || c2.power_l3);
    const totalPower = c2.power ? this._watts(c2.power) : this._watts(c2.power_l1) + this._watts(c2.power_l2) + this._watts(c2.power_l3);
    const energy = this._kwh(c2.energy);
    const maxA = c2.max_current ?? 63;
    const phases = [
      { label: "L1", power: c2.power_l1, current: c2.current_l1 },
      { label: "L2", power: c2.power_l2, current: c2.current_l2 },
      { label: "L3", power: c2.power_l3, current: c2.current_l3 }
    ];
    const totalCurrent = c2.current ? this._num(c2.current) : Math.max(this._num(c2.current_l1), this._num(c2.current_l2), this._num(c2.current_l3));
    const loadPct = Math.min(100, totalCurrent > 0 ? totalCurrent / maxA * 100 : totalPower / (maxA * 400) * 100);
    const barColor = this._loadColor(loadPct);
    const expanded = this._expanded.has(c2.id);
    const hasDevices = (((_a2 = c2.devices) == null ? void 0 : _a2.length) ?? 0) > 0;
    const costRate = totalPower > 0 ? this._calcDailyCost(c2.power ?? c2.power_l1) : "";
    return b`
      <div class="three-phase-card ${c2.critical ? "critical" : ""} ${c2.switch && isOn ? "is-on" : ""}">
        <div class="tp-header">
          <div class="tp-title-row">
            <div class="status-dot ${isOn ? "on" : c2.switch ? "off" : "none"}"></div>
            <span class="circuit-name" title="${c2.name}">${c2.name}</span>
            <span class="badge badge-phase">3φ</span>
            ${c2.critical ? b`<ha-icon icon="mdi:lock" class="lock-icon"></ha-icon>` : c2.switch ? b`<button class="toggle ${isOn ? "on" : "off"}"
                    @click=${() => this._toggle(c2.switch)}
                    aria-label="${isOn ? "Turn off" : "Turn on"} ${c2.name}">
                  </button>` : A}
          </div>
          <div class="tp-total">
            <span class="metric-primary">${(totalPower / 1e3).toFixed(2)} kW</span>
            <span class="metric-small">
              ${energy > 0 ? b`${energy.toFixed(2)} kWh` : A}
              ${costRate ? b`<span class="metric-sep">·</span><span class="cost-rate">${costRate}</span>` : A}
            </span>
          </div>
        </div>

        <div class="load-track">
          <div class="load-fill" style="width:${loadPct.toFixed(1)}%;background:${barColor}"></div>
        </div>

        <div class="phases-grid">
          ${phases.map((p2) => b`
            <div class="phase-cell">
              <div class="phase-label">${p2.label}</div>
              <div class="phase-power">${(this._watts(p2.power) / 1e3).toFixed(2)} kW</div>
              <div class="phase-detail">${this._num(p2.current).toFixed(1)} A</div>
              ${this._renderSparkline(p2.power)}
            </div>
          `)}
        </div>

        ${hasDevices ? b`
          <div class="tp-footer">
            <button class="expand-btn" @click=${() => this._toggleExpanded(c2.id)}>
              <ha-icon icon="${expanded ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon>
              <span>${expanded ? "hide" : "devices"}</span>
            </button>
          </div>
        ` : A}

        ${expanded && hasDevices ? b`<div class="tp-devices-grid">${c2.devices.map((d2) => b`<div class="tp-device-col">${this._renderDevice(d2)}</div>`)}</div>` : A}
      </div>
    `;
  }
  // ── Main render ────────────────────────────────────────────────────────────
  render() {
    if (!this.hass || !this._config) return A;
    const circuits = this._config.circuits ?? [];
    const threePhase = circuits.filter((c2) => c2.phases === 3);
    const singlePhase = circuits.filter((c2) => c2.phases !== 3);
    return b`
      <ha-card>
        ${this._config.title ? b`<div class="card-header">${this._config.title}</div>` : A}
        <div class="card-content">
          ${this._renderHdo()}
          ${this._renderHdoSchedule()}
          ${this._renderMainMeter()}

          ${threePhase.length > 0 ? b`
            <div class="section-label">3-phase circuits</div>
            <div class="three-phase-list">
              ${threePhase.map((c2) => this._renderThreePhaseCircuit(c2))}
            </div>
          ` : A}

          ${singlePhase.length > 0 ? b`
            ${threePhase.length > 0 ? b`<div class="section-label">Single-phase breakers</div>` : A}
            <div class="circuit-grid">
              ${singlePhase.map((c2) => this._renderCircuit(c2))}
            </div>
          ` : A}
        </div>
      </ha-card>
    `;
  }
};
ElectricityPanelCard.styles = i$3`
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
    .timeline-now { position: absolute; top: -1px; bottom: -1px; width: 2px; background: rgba(255,255,255,.6); border-radius: 1px; pointer-events: none; }

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

    .sparkline { width: 100%; height: 34px; display: block; margin-top: 5px; overflow: visible; }
  `;
__decorateClass([
  r()
], ElectricityPanelCard.prototype, "_config", 2);
__decorateClass([
  r()
], ElectricityPanelCard.prototype, "_expanded", 2);
__decorateClass([
  r()
], ElectricityPanelCard.prototype, "_showTomorrow", 2);
__decorateClass([
  r()
], ElectricityPanelCard.prototype, "_scheduleExpanded", 2);
ElectricityPanelCard = __decorateClass([
  t("electricity-panel-card")
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
