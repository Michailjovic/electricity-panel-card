# Vizuální rozbor — Electricity Panel Card v5.2.1

Podklad: `docs/screenshot-*.png` (v5.1) + `static styles` a render metody v `src/electricity-panel-card.ts` (v5.2.1).

Cíl: atraktivnější karta, která zůstane **nástrojem** — ne dashboard-porn. Každý návrh níže
buď odebírá vizuální šum, nebo přidává čitelnost. Nic nepřidává dekoraci.

---

## 1. Diagnóza — co kartu dnes sráží

### 1.1 Zelená ztratila význam (hlavní problém)

`#22c55e` nese v kartě současně nejméně šest nesouvisejících významů:

| Kde | Co znamená |
|---|---|
| `.hdo-bar.nt`, `.hdo-cd-val`, `.stariff.nt`, `.srow-fill.nt`, `.tl-seg.nt` | nízký tarif |
| `.toggle.on` (`#16a34a`) | spínač zapnutý |
| `.status-dot.on` | entita zapnutá |
| `.circuit-card.is-on` (levý border) | okruh zapnutý |
| `sparkline_color` (v konfiguraci uživatele) | průběh spotřeby |
| `.cost-seg.nt`, `.cost-leg.nt` | podíl NT na nákladech |

Na screenshotu overview je zelené prakticky všechno. Když je barva všude, nesignalizuje nic —
oko ji přestane číst jako informaci a začne ji číst jako výplň. Přesně to je zdroj dojmu
„přeplácané": ne počet prvků, ale **počet prvků křičících stejnou barvou**.

Stejná diagnóza pro amber `#f59e0b`: je to zároveň „critical okruh" (levý border),
„stará data" (`age_warn_color`), „NT hint" a — bez jakéhokoli varovného významu —
i výchozí referenční linka ve sparklinu. V kódu už je jedna poznámka z 2026-08-12,
kde se `.cost-rate` z tohoto důvodu z amber přebarvila na `--ep-accent`. To byl správný
krok, jen se neaplikoval systémově.

### 1.2 Sparkliny přebíjejí vše ostatní

Tři grafy v main meteru zabírají největší souvislou plochu, mají nejvyšší sytost
(`stroke-width: 1.5`, plná barva, gradient `0.3`) a nejnižší akční hodnotu na této kartě —
jsou to kontextové křivky, ne stav. Navíc:

- **Baseline je `vMin`, ne nula** (`_renderSparkline`, ř. 1225). Průběh 4 W → 12 W se vykreslí
  jako dramatický skok přes celou výšku. Vizuálně to lže.
- **Čárkovaná referenční linka je oranžová** a vede přes celou šířku → čte se jako výstraha,
  přitom označuje jen min/max rozsah.
- Popisky min i max se zobrazují vždy, i když je min `0 W` (což je většina okruhů).

### 1.3 Chybí hierarchie povrchů

Main meter, 3φ okruh i 1φ jistič mají **identický** styl kontejneru:
`--ep-surface` / `border-radius: 8px` / `0.5px solid --ep-border` / `padding: 12px 14px`.
Jediné, co je odlišuje, je textový `.section-label`. Výsledek: plochý seznam boxů,
kde není periferním viděním poznat, co je nadřazené a co detail.

Navíc **vnořené prvky jsou tmavší než rodič** — `.phase-cell` a `.circuit-spark-wrap`
používají `--ep-bg` uvnitř `--ep-surface`. To čte jako díra ve kartě, ne jako vystupující
buňka. Je to obrácený vztah, než co lidé očekávají u tmavého UI.

### 1.4 Typografická škála je nahoře řídká a dole ucpaná

V CSS je devět velikostí v pásmu 8–14 px (8, 9, 10, 10, 11, 11, 12, 12, 14) a pak skok
na 20 / 22 / 24. Rozdíl 10 vs. 11 px není čitelný jako hierarchie — čte se jako nedbalost.
Naopak mezi 14 a 22 px chybí střední úroveň, kterou by potřebovaly součtové hodnoty.

Podobně tvarosloví: pět různých výšek progress prvků (2, 3, 3, 4, 8 px) a sedm hodnot
`border-radius` (3, 4, 5, 6, 8, 9, 12). Spacing skáče po 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14 px.

### 1.5 Metrikový řádek je věta, ne data

```
0.4 A · 233 V · 1.53 kWh · 6.63 Kč · ↻15m
```

Pět hodnot slepených tečkami, bez zarovnání, s různým počtem znaků → oko musí řádek
sekvenčně parsovat. Mezi naměřenými veličinami sedí `↻15m`, což je **systémová metadata
o stáří dat**, ne veličina. A zobrazuje se pořád, i když jsou data čerstvá — trvale
viditelný prvek s nulovou informací ve většině času.

### 1.6 Trojí signalizace stejného stavu

U `.circuit-card` je „zapnuto" indikováno současně `status-dot` + `toggle` + zelený
levý border. Tři signály pro jeden bit. Border navíc koliduje s `critical` (amber),
takže u kritického zapnutého okruhu se jeden ze signálů tiše ztratí
(`.circuit-card.critical.is-on` vyhrává amber).

### 1.7 `follow_theme` je jen poloviční

V `theme-auto` se mapují jen `--ep-*` proměnné. Napevno zapsané hodnoty zůstávají:
`#22c55e`, `#ef4444`, `#f59e0b`, `.phase-power: #a0aec0`, `.toggle.off: #374151`,
`.status-dot.off: #374151`, `.spark-lbl-*: rgba(255,255,255,…)`, `.spark-hover-line`,
`.timeline-now: #fff`.

Ve světlém tématu je `#a0aec0` na bílé prakticky nečitelný, bílé popisky sparklinu
zmizí úplně a `.timeline-now` (bílá ryska s černým stínem) je invertovaná.
**Tohle není estetika, ale funkční chyba** — a je to zároveň nejlevnější win.

### 1.8 Dvousloupcová mřížka jističů má zubatý spodek

`.circuit-grid { grid-template-columns: repeat(2,1fr) }` s kartami různé výšky
(rozbalené vs. sbalené, se sparklinem vs. bez) → viditelné díry, vidět na screenshotu
overview vpravo dole.

---

## 2. Návrh řešení — čtyři balíčky

Seřazeno podle poměru **dopad / riziko**. A a B dělají 80 % vizuálního rozdílu.

### Balíček A — Barevná disciplína
*Dopad: vysoký · Riziko: nulové (jen CSS) · Rozsah: ~40 řádků*

Zavést a v kódu vynutit pravidlo **jedna barva = jeden význam**:

| Barva | Vyhrazeno pro | Dnes navíc používáno na |
|---|---|---|
| zelená / červená | **výhradně tarif NT/VT** | toggle, status-dot, is-on border, sparkline |
| amber | **výhradně varování** (stará data, přetížení, critical) | referenční linka sparklinu |
| `--ep-accent` | interaktivní / zvýrazněný text | — |
| neutrální šedá | stav zapnuto/vypnuto, zátěž, průběhy | — |

Konkrétně:

- `.toggle.on` → `--ep-accent` (nebo HA `--switch-checked-color`), ne `#16a34a`
- `.status-dot.on` → `--ep-accent`, ztlumený
- `.circuit-card.is-on` levý border → **zrušit** (bod 1.6 — stav už nesou dva jiné prvky);
  border-left ponechat výhradně pro `critical`
- `.load-fill` → sekvenční škála neutrální → amber → červená podle %, žádná zelená pod 60 %
- `sparkline_color` default → neutrální modrošedá (`#7c8ba1`); dnešní `#ef4444` čte jako alarm
- `.spark-ref` default → `--ep-border` místo oranžové

**Efekt:** zelená zůstane jen tam, kde znamená „teď je levný proud". Zbytek karty
zklidní do neutrálu a HDO bar konečně vystoupí jako to nejdůležitější na kartě.
Bez odebrání jediné funkce.

### Balíček B — Hierarchie a rytmus
*Dopad: vysoký · Riziko: nízké · Rozsah: ~60 řádků CSS + tokeny*

**Tři úrovně povrchu** místo jedné, a vnořené **světlejší**, ne tmavší:

```
--ep-bg        #111318   karta
--ep-surface   #181c24   blok (meter, okruh, jistič)
--ep-surface-2 #1f2430   buňka uvnitř bloku (phase-cell, spark-wrap)
```

**Elevace odlišuje úrovně:** main meter dostane světlejší povrch + jemný stín
a žádný border; okruhy povrch + border; jističe border only. Hierarchie je pak
čitelná periferním viděním, bez čtení `.section-label`.

**Typografická škála na 5 kroků** — zrušit 8, 9, 12, 14, 20, 22:

```
--ep-fs-micro  10px   uppercase labely, badge
--ep-fs-meta   11px   sekundární metriky
--ep-fs-body   13px   názvy okruhů, zařízení
--ep-fs-sub    16px   fázové hodnoty, mezisoučty
--ep-fs-hero   24px   primární W, countdown
```

**Tvarosloví na tři hodnoty:** radius `4 / 8 / 999`, výška track `3px` (inline) a `6px` (blok),
spacing na mřížce po 4 px.

### Balíček C — Metriky jako mřížka
*Dopad: střední · Riziko: nízké · Rozsah: `_renderCircuit` + `_ageBadge` + CSS*

- `.metric-small` rozdělit na 2–3 sloupce s tabulkovým zarovnáním
  (`font-variant-numeric: tabular-nums` je dnes jen na dvou místech — dát všude,
  kde se čísla mění v čase, jinak metriky poskakují)
- Hodnota v `--ep-text`, jednotka v `--ep-text-dim` a menším řezu → číslo vystoupí
- **Age badge z řádku pryč**: vlastní pozice v rohu karty a **zobrazit až po překročení
  prahu**. Čerstvá data nepotřebují razítko.
- Kč zvýraznit jako druhou nejdůležitější hodnotu po W (dnes splývá s A / V / kWh)

### Balíček D — Zklidnit sparkliny
*Dopad: střední · Riziko: nízké (jedna změna mění vzhled grafu — bod 1) · Rozsah: `_renderSparkline`*

- **Baseline od nuly**, ne od `vMin` (nebo konfigurovatelně, default nula) — dnešní chování
  vizuálně zveličuje malé výkyvy
- `stroke-width` 1.5 → 1.25, gradient area `0.3 → 0.18`
- min popisek jen když `vMin > 0`
- referenční linka neutrální (viz balíček A)

---

## 3. Návrh navíc — hustota jako konfigurace

Karta má dnes jedinou hustotu. Zdroj pocitu „přeplácané" není počet funkcí, ale to,
že se **všechny zobrazují najednou a se stejnou vahou**.

Přidat `density: compact | normal` (default `normal`, zpětně kompatibilní):

- **compact** — jistič = jeden řádek: dot · název · W · toggle. Žádné fázové buňky,
  žádný sparkline, žádný load-track. Rozbalení klikem na detail.
- **normal** — dnešní vzhled po úpravách A–D.

Řeší přeplácanost bez odebrání jediné funkce — jen je schová do druhé úrovně.
Pro dashboard s deseti jističi je to rozdíl mezi „přehled" a „zeď dat".

---

## 4. Co vědomě nedělat

- Gradienty na pozadí karet, glow, neonové okraje — po balíčku A by rovnou zabily zisk
- Ikona ke každému okruhu — přidá 20 objektů, které se všechny čtou stejně
- Animace nad rámec dnešních dvou (`hdo-pulse`, `ep-overload`) — obě jsou funkční, ne dekorační
- Zaoblení > 8 px na kartách — u husté mřížky ubírá plochu a působí hračkovitě

---

## 5. Doporučené pořadí

1. **1.7 (`follow_theme` napevno zapsané barvy)** — funkční chyba, ne estetika. Samostatný krok, samostatný tag.
2. **Balíček A** — největší vizuální rozdíl za nejméně řádků, čistě CSS.
3. **Balíček B** — tokeny + hierarchie.
4. **Balíček C + D** — dolaďování.
5. **Hustota (kap. 3)** — až po A–D, protože compact režim se navrhuje proti finálnímu vzhledu.

Body 1–2 jsou nezávislé na Fázi 3 z `ROADMAP.md`. Balíček B by ale bylo dobré dokončit
**před** 3.1 (HTML mockupy statistik), aby mockupy vznikaly už proti novým tokenům
a ne proti dnešní škále.
