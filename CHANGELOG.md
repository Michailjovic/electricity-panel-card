# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [5.6.0] — 2026-08-19
*Doladění panel view podle zpětné vazby z živého rozvaděče.*

### 🎨 Changed

- **Porovnání rozpadne 3f modul na jeho tři fáze.** Dřív každý vybraný modul
  přispěl jednou křivkou (u 3f tou nejzatíženější). Jenže porovnávat hlavní
  jistič s 3f okruhem je otázka o fázích — „sedí kuchyň na stejné fázi jako
  bojler?" — a sloučení každé strany do jedné křivky zahodí přesně tu odpověď.
  Vybrat hlavní jistič a kuchyň teď dá šest křivek na jednom měřítku, barevně
  odlišených po fázích.
- **Mřížka porovnání drží tři sloupce, jakmile je mezi vybranými 3f modul** —
  jinak se L1/L2/L3 jednoho jističe rozlomí přes dva řádky a srovnání se čte
  mnohem hůř. Pod 560 px přechází na jeden sloupec.
- **Lišta se dá vodorovně odrolovat.** Kdo má celý rozvaděč v jedné řadě
  (`rail_size` nastavený na součet všech pozic), toho na úzkém dashboardu
  moduly nezmáčknou pod čitelnou šířku — lišta se posouvá zleva doprava,
  stejně jako když se po ní díváš ve skutečnosti. Modul si drží minimum 34 px.

### 🧹 Removed

- Interní pole `sparkPhase` u modulu — po přepsání porovnání ho nikdo nečetl.

---

## [5.5.1] — 2026-08-19

### 🐞 Fixed

- **`show_nt_hint` nedělal v `view: panel` nic.** Tip „za chvíli začne NT,
  ušetříš X %" četly jen classic renderery `_renderCircuit` a
  `_renderThreePhaseCircuit`, takže se v panel view zapnutá volba tiše
  ignorovala. Nově se hint zobrazí v detailu modulu — ne na modulu samotném,
  protože je to věta a modul je 70 px široký.

---

## [5.5.0] — 2026-08-19
*ROADMAP 5.4 — nový volitelný režim `view: panel`. Rozvaděč na DIN liště.
`view: classic` zůstává výchozí a je beze změny.*

### ➕ Added

- **`view: panel`** — karta se tváří jako to, co doopravdy je: řada jističů na
  DIN liště. Modul má páčku, hladinu zatížení stoupající v těle, fázový proužek
  a číslo pozice; 3f jistič je široký tři pozice, jako ve skutečném rozvaděči.
  Celý rozvaděč se vejde na jeden pohled — 12 pozic zabere ~130 px, dnešní
  mřížka karet by na totéž potřebovala přes 1 200 px.
- **Detail pod lištou.** Kliknutí na modul rozbalí čísla, velký graf a
  **zařízení za jističem** (skupiny, kanály i „hloupá" zařízení jako poznámky —
  pro spoustu lidí je to jediná dokumentace rozvodů, kterou mají).
- **Porovnání víc modulů na společné časové ose**, s přepínačem **společné osy Y**
  (výchozí zapnuto). Bez něj se křivky porovnat nedají: okruh se 40 W a okruh
  s 2,4 kW nakreslí na vlastních osách prakticky stejný obrázek.
- **3f detail ukazuje L1/L2/L3 vedle sebe**, taky na jednom měřítku — takže
  nevyváženost fází je vidět, ne dopočítaná okem.
- Nová konfigurace: `view`, blok `panel` (`rail_size`, `main_breaker`,
  `module_spark`, `show_main`) a u okruhu `position` a `phase`. Vše volitelné —
  bez `position` si okruhy drží pořadí z konfigurace, bez `phase` nemá modul
  proužek. Editor má novou sekci **Layout** a obě pole u každého okruhu.
- Čisté funkce `comparePosition`, `buildRails`, `loadPercent` a `phaseShares`
  v `utils.ts`, pokryté testy (+18, celkem 101).

### 🎨 Changed

- **V panel view je pořadí jiné:** tarif → timeline dne → rozvaděč → detail →
  rozvrh a náklady. „Je teď levno" a „co teď jede" jsou otázky na jeden pohled,
  rozvrhová tabulka je plánování. Timeline se přesunula nahoru k tarifu a
  v bloku dole se proto nekreslí — je na kartě právě jednou.
- V panel view se stahuje historie pro **všechny** okruhy, ne jen pro ty se
  zapnutým sparklinem — režim kreslí mikro-graf v každém modulu.

### 🐞 Fixed / poznámky k implementaci

- Grafy fází se zprvu nekreslily vůbec. Dvě tiché pasti, obě stojí za zapsání:
  vnořená `html` šablona uvnitř `<svg>` se v lit připraví v HTML namespace,
  takže z `<path>` vznikne neznámý HTML prvek — je potřeba lit `svg` tag. A
  `var(--…)` se nevyhodnotí v SVG **prezentačním atributu** (`stroke=`), musí
  jít přes `style=`. Ani jedno nic nenahlásí, jen se nic nevykreslí.
- Modul hlavního jističe (a každý 3f okruh bez celkového senzoru) kreslil graf
  jen z L1, zatímco nadpis ukazoval součet — flat čára vedle 2,49 kW. Nově se
  kreslí **nejzatíženější fáze**, tedy ta, na které jistič vypadne, a je
  označená popiskem, aby se nedala splést s celkem.
- Panel view si zapíná `box-sizing: border-box` jen pro svůj podstrom. Shadow
  DOM ho nedědí ze stránky a classic layout stojí na content-boxu, takže
  globálně by se musely přepočítat všechny dosavadní výšky.
- **Řádek metrik u řídce nakonfigurovaného okruhu začínal oddělovačem** (chyba
  i v classic view, existovala dřív — jen ji nebylo vidět, dokud měl každý
  okruh senzor proudu). Každá položka si nesla vlastní čelní `·`, což sedělo
  jen dokud byla ta první vždy přítomná; okruh jen s energií nebo jen se
  spínačem pak vykreslil `· 0.35 Kč` nebo `· ↻ 2m`. Oddělovače teď určuje
  řádek podle toho, které položky skutečně zbyly (`_metricRow`), a `_ageBadge`
  už svůj oddělovač nenese.

### Nezměněno

`view: classic` je bit po bitu stejný layout jako v 5.4.0 — nová větev
v `render()` se ho nedotýká.

---

## [5.4.0] — 2026-08-19
*Balíček B z `docs/DESIGN-REVIEW.md` — hierarchie a rytmus. Opět beze změny
chování: stejná data, stejné selektory, jen tokeny a rozestupy.*

### 🎨 Changed

- **Tři úrovně povrchu místo jedné.** Hlavní měřič, 3f okruh i 1f jistič měly
  identický kontejner (stejný povrch, okraj, radius i padding), takže
  hierarchii nesl jen textový `.section-label`. Nově: hlavní měřič má stín a
  **žádný okraj**, okruhy povrch + okraj, jističe jen okraj — úroveň je vidět
  periferním viděním.
- **Vnořené buňky jsou nově světlejší než rodič.** `.phase-cell` a
  `.circuit-spark-wrap` používaly `--ep-bg` uvnitř `--ep-surface`, tedy tmavší
  než rodič — četlo se to jako díra ve kartě, ne jako vystupující prvek. Nový
  token `--ep-surface-2`. Na světlém tématu se vztah správně obrací (bloky
  šedé, vnořené buňky bílé).
- **Typografická škála z devíti velikostí na pět.** Bylo 8/9/10/10/11/11/12/12/14
  plus 20/22/24 — rozdíl 10 vs. 11 px se nečte jako hierarchie, jen jako
  nekonzistence. Nově `--ep-fs-micro/meta/body/sub/hero` = 10/11/13/16/24.
  Nejviditelnější důsledek: hodnota fáze (`.phase-power`) povýšila ze 14 px
  tlumené šedi na 16 px v `--ep-text` — je to primární údaj, ne popisek.
- **Tvarosloví sjednoceno.** Sedm hodnot `border-radius` (3/4/5/6/8/9/12) na tři
  (`--ep-r-sm` 4, `--ep-r-md` 8, `--ep-r-pill`); pět výšek pruhů (2/3/3/4/8) na
  dvě — 3 px inline (`.srow-track`, `.load-track`), 6 px blok (`.hdo-prog`,
  `.timeline-bar`, `.cost-stack`). Okraje `0.5px` → `1px`; půlpixel se na
  různých DPI vykresloval nekonzistentně.
- **Rozestupy na mřížce po 4 px** místo dosavadních 1/2/3/4/5/6/7/8/10/12/14.
- **`font-variant-numeric: tabular-nums` všude, kde se čísla mění v čase** —
  metriky, fázové hodnoty, náklady, popisky sparklinů, délky slotů. Dřív to
  bylo jen na dvou místech, takže se hodnoty při každé aktualizaci mírně
  posouvaly do stran.
- **`--ep-accent` zesílen** z `#6b7db3` na `#7aa2e3`. Po balíčku A nese akcent
  i stav „zapnuto", takže musí být čitelný na první pohled; `--ep-badge-*`
  odvozeno od něj. `.meter-title` naopak zešedl na `--ep-text-mid` — nadpis
  sekce nemusí být barevný.

### ➕ Added

- Tokeny `--ep-surface-2`, `--ep-shadow`, `--ep-fs-*`, `--ep-r-*` v obou
  paletách (zabudovaná tmavá i `follow_theme`).

### Cena

Karta je vyšší o ~15 % (1003 → 1151 px na 960px širokém dashboardu, měřeno na
sestavené kartě v obou stavech). Je to cena za vzdušnější rozestupy a větší
primární hodnoty. Zamýšlená odpověď je volitelný `density: compact` (ROADMAP
5.5), ne návrat k dosavadní hustotě.

---

## [5.3.0] — 2026-08-19
*Balíček A z `docs/DESIGN-REVIEW.md` — barevná disciplína. Žádná změna chování,
jen barvy: co bylo vidět, je vidět dál, ale každá barva teď znamená jednu věc.*

### 🎨 Changed

Zjištění z rozboru: `#22c55e` nesla na kartě současně šest nesouvisejících
významů (nízký tarif, sepnutý spínač, zapnutá entita, zapnutý okruh přes levý
okraj, barva sparklinu, segment nákladů). Když barva znamená všechno,
nesignalizuje nic. Nové pravidlo: **zelená a červená výhradně tarif, amber
výhradně varování, stav a průběhy neutrálně.**

- **Stav „zapnuto" už není zelený.** `.toggle.on` bylo `#16a34a` a
  `.status-dot.on` `#22c55e` — obojí nově `var(--ep-accent)`. „Zapnuto" je
  interakce, ne tarif.
- **Zelený levý okraj u zapnutého okruhu zrušen.** `.circuit-card.is-on` a
  `.three-phase-card.is-on` kreslily 2px zelený okraj, ale stav už nesla
  stavová tečka i přepínač — tři signály pro jeden bit. Navíc u kritického
  zapnutého okruhu amber okraj zelený stejně přebil, takže jeden signál tiše
  mizel. Levý okraj teď znamená **výhradně `critical`** a je jednoznačný.
  Třída `.is-on` zůstává v DOM kvůli `card-mod`, jen už nic nekreslí.
- **Barva zátěže: neutrál → amber → červená.** `_loadColor()` vracelo pod 55 %
  zelenou, takže každý klidný okruh vypadal jako signál. Nově pod 15 %
  `var(--ep-neutral)`, do 55 % `var(--ep-accent)`, pak beze změny amber a
  červená. Prahy pro varování se nemění.
- **Výchozí `sparkline_color` je `#7c8ba1`** (neutrální modrošedá) místo
  `#ef4444`. Červená sparklinu byla stejná jako vysoký tarif a chybové stavy,
  přitom průběh spotřeby je kontext, ne signál. Explicitně nastavená barva
  v konfiguraci se nemění.
- **`.nt-hint` už není amber, ale akcentní.** Tip „za chvíli začne NT" je
  informace, ne varování — amber zůstává vyhrazený zastaralým datům,
  přetížení a `critical`.

### ➕ Added

- Nový token `--ep-neutral` v obou paletách (zabudovaná tmavá i `follow_theme`)
  pro prvky, které jsou kontext, ne signál.

---

## [5.2.2] — 2026-08-19
*Oprava `follow_theme` — napevno zadané barvy, které se nemapovaly na světlé HA téma.*

### 🐞 Fixed

- **`follow_theme: true` byl jen poloviční.** Mapovaly se `--ep-*` proměnné,
  ale sedm hodnot zůstávalo napevno v CSS/kódu a na světlém tématu byly
  nečitelné nebo úplně neviditelné. Nešlo o estetiku — část karty na světlém
  tématu prostě nešla přečíst.
  - `.phase-power` bylo `#a0aec0`; na bílé kartě to je kontrast ~1.9:1, tedy
    pod hranicí čitelnosti. Nově `var(--ep-text-mid)` — v zabudované tmavé
    paletě je to `#94a3b8`, tedy prakticky totéž co dosavadní `#a0aec0`,
    takže tmavé téma se opticky nemění.
  - `.spark-lbl-max` / `.spark-lbl-min` byly `rgba(255,255,255,.75)` a
    `rgba(255,255,255,.45)` — na světlém tématu bílá na bílé, popisky min/max
    u sparklinů zmizely beze stopy. Nově `var(--ep-text-mid)` /
    `var(--ep-text-dim)`; halo přes `--ep-bg` zůstává, právě ono je drží
    čitelné přes graf v obou tématech.
  - `.spark-hover-line` byla `rgba(255,255,255,.35)` → `var(--ep-text-dim)`.
  - `.timeline-now` (ryska „teď" v HDO timeline) byla `#fff` s černým lemem
    po stranách — na světlém tématu invertovaná. Nově `var(--ep-text)` s
    prstencem v `--ep-bg`.
  - `.toggle.off`, `.status-dot.off` a `.status-dot.none` byly `#374151`,
    což je na světlém pozadí těžká tmavá šeď. Nově `var(--ep-text-faint)`
    (pod `follow_theme` se mapuje na `--disabled-text-color`).

### 🎨 Changed

- **Výchozí hodnota `sparkline_ref_color` je nově `var(--ep-text-faint)`**
  místo `rgba(255,255,255,0.35)`. Explicitně nastavená barva v konfiguraci
  se nemění.
- **Výchozí hodnota `age_ok_color` je nově `var(--ep-text-faint)`** místo
  `#374151`. Ta hodnota měla znamenat „tiché, čerstvé", ale na světlém tématu
  z ní byla výrazná tmavá šeď — přesně naopak. Explicitně nastavená barva
  se nemění.
- Editor u obou barev ukazuje hint „Leave unset to follow the theme" a jeho
  swatch už nesugeruje bílou jako výchozí.

---

## [5.2.1] — 2026-08-13
*Design pass — review na živém dashboardu (`living-room/electricity`), viz design-critique v konverzaci.*

### 🎨 Changed

- **Ceny zaokrouhleny na 2 desetinná místa v HDO baru** — `nt_price`/`vt_price`
  se dřív vypisovaly s plnou přesností zdrojového senzoru (např.
  `4.61453 Kč/kWh`), teď `4.61 Kč/kWh`. Nová `_fmtPrice()`; jen zobrazení,
  výpočet nákladů je beze změny.
- **`.cost-rate` (cena u okruhu) už nekoliduje barvou s age-badge warningem** —
  obojí bylo `#f59e0b`, takže "tohle tě stojí peníze" a "tahle data jsou
  zastaralá" splývaly. Cena teď používá `var(--ep-accent)` (stejná barva
  jako `.meter-title`/`.ch-sum`), age-badge si nechává svůj vlastní
  amber/red stale-warning systém beze změny.
- **Neaktivní záložka Rozvrh/Náklady má teď klidový obrys** — dřív jen holý
  text bez jakékoli náznaku klikatelnosti; aktivní stav (vyplněné pozadí)
  zůstává stejný.

### Nezměněno, ale stojí za zvážení (config, ne kód)

- Referenční linky ve sparkline (`sparkline_ref_line`) a jejich barva
  (`sparkline_ref_color`) na živém dashboardu byly zapnuté a oranžové —
  přidávají do 38px grafu další 2 čáry + 2 čísla navrch trendu. Karta
  defaultuje na vypnuto; pokud to překáží, jde vypnout v editoru bez
  zásahu do kódu.
- Mřížka jednofázových jističů (2 sloupce) má u téměř nečinných okruhů
  (0 W) stejnou výšku jako u aktivních — kompaktnější "sbalený" řádek pro
  0 W by uvolnil místo, ale je to nová funkce (skrývání dat podle prahu),
  ne jen styl — záměrně neimplementováno bez potvrzení.

## [5.2.0] — 2026-08-12
*ROADMAP.md "Interaktivní sparkliny" — un-deferred po Fázi 3, podle schváleného mockupu.*

### ✨ Added

- **Hover tooltip na sparkline grafech** — najetí myší/prstem ukáže hodnotu
  (W/kW) a čas v daném bodě, s vodicí čárou a tečkou. Implementováno přímou
  DOM manipulací (ne přes lit `requestUpdate()`), aby se předešlo přesně
  tomu, co bylo důvodem odkladu — re-render celé karty na každý pohyb myši.
  30s countdown timer i tak sdílí stejné DOM uzly, takže hover stav přežije.
- **Přepínání časového okna přímo na kartě** — tlačítka 1h/3h/6h/24h u
  hlavního měřiče. Jedno tlačítko pro celou kartu (ne per-sparkline) —
  všechny sparkliny (hlavní měřič, 3fázové i 1fázové okruhy) sdílí stejnou
  časovou osu, takže víc přepínačů by bylo redundantní. Kliknutí přenačte
  historii z HA (`_fetchHistory`) s novým oknem; `graph_hours` v configu
  zůstává nedotčené — jde o dočasné zobrazovací přebití, ne uloženou
  hodnotu (resetuje se při reloadu karty).
- Cache invalidace sparkline path (`_sparkCache`) rozšířena o `hours` —
  dřív se okno měnilo jen přes statický config, teď runtime přepínačem,
  takže bez tohoto klíče by se po přepnutí okna zobrazila zastaralá cesta.

## [5.1.12] — 2026-08-12
*Fáze 4 (ROADMAP.md) — rozhodnuto: karta bude jen anglicky, cs lokalizace odstraněna.*

### ⚠️ Breaking

- **Config `language` odstraněn.** Karta i editor jsou nyní čistě anglicky —
  žádný cs/en přepínač, žádné `language: 'auto' | 'en' | 'cs'` pole v
  configu. Pokud ho máš v YAML nastavené, klidně ho smaž — karta ho už
  nečte, žádnou chybu tím ale nezpůsobí.
- `localize.ts` zjednodušen na jednu anglickou sadu řetězců, `_t()` v
  `electricity-panel-card.ts` volá `localize(key, vars)` bez jazykového
  parametru. Editor ztratil selektor **Language** v sekci Appearance &
  behaviour (nikdy neměl cs verzi, byl tedy zbytečný).
- README: smazán bod „Localized — English and Czech" a zmínka o
  jazykovém poli v popisu editoru.

## [5.1.11] — 2026-08-12
*Fáze 3.2 (ROADMAP.md) uzavřena — statistiky ověřené na reálné instanci, raw-history fetch zúžen zpět na `graph_hours`.*

### 🔧 Changed

- Raw-history WS fetch (`history/history_during_period`) se už nerozšiřuje
  na půlnoc, když jsou nastavené ceny — statistiky (`_fetchStatistics` /
  `_fetchEnergyStatistics`) mají vlastní midnight-anchored dotaz nezávisle
  na tomhle okně a jsou teď ověřená primární cesta výpočtu ceny. Raw history
  je opět čistě okno pro graf/sparkline (`graph_hours`); trapezoidní
  raw-history fallback v `_calcDailyCost` funguje jen pro entity bez
  usable statistik — pro ně nově pokrývá jen posledních `graph_hours`
  hodin místo celého dne od půlnoci.

### ✅ Ověřeno

- Fáze 3.2 a 3.3 (long-term statistics, 7 dní/Měsíc) potvrzeny funkční na
  reálné instanci (main_meter fáze mají usable statistiky).

## [5.1.10] — 2026-08-04
*Post-3.3 (ROADMAP.md) — cost calc prefers real energy (kWh) sensors over the power-mean approximation, wherever configured.*

### ✨ Added

- **Exact cost from energy sensors**: when `main_meter.energy_today` or a
  circuit's `energy` field is configured, cost calc now requests
  `recorder/statistics_during_period` with `types: ['change']` on that
  entity — HA's own computed delta from the sensor's cumulative counter
  (resets handled by HA itself), not `mean_W × duration`. Falls back to the
  existing power-sensor path (mean statistics, then raw history) per entity
  when the energy sensor has no usable statistics, so nothing regresses for
  setups without one.
- Applies everywhere cost is shown: main-meter badge, per-circuit badges,
  and the Náklady tab (all three periods — today/7 dní/měsíc).
- New `accumulateTariffWhFromEnergyBuckets` (utils.ts) — same NT/VT-split
  shape as the power-based accumulators, just without the mean*duration step
  since the bucket's `wh` is already the real measured consumption.
- Debug log reports per-entity whether the energy sensor's statistics were
  usable (`energy stats: N/M energy entities have usable 5minute 'change'
  statistics`).
- Prompted by a question about how HA's Energy dashboard stores its data:
  it turns out to read/write the exact same `recorder` statistics tables we
  already use — no separate system to tap into — but its convention of
  pointing at a true energy sensor rather than power is worth adopting where
  the hardware supports it.

## [5.1.9] — 2026-08-03
*Fáze 3.3 (ROADMAP.md) — Náklady tab in the schedule block (design variant C from 3.1).*

### ✨ Added

- **Schedule block now has two tabs: „Rozvrh" and „Náklady"** — only shown
  once `hdo.nt_price`/`vt_price` are configured, so cards without cost
  tracking are unchanged. „Rozvrh" stays the default view.
- **Náklady tab**: period switcher (Dnes / 7 dní / Měsíc), NT/VT stacked bar
  + legend (kWh and cost per tariff), running total, and for 7 dní/Měsíc a
  secondary line (average per day / estimated month total via linear
  month-to-date extrapolation).
- Totals are the whole-installation cost (`main_meter` phases — the same
  entities the main-meter cost badge already used for "today"), not a sum of
  individual circuits.
- "7 dní"/"Měsíc" are backed by a new lazy fetch (`_fetchRangeData`): 31 days
  of hourly `recorder/statistics_during_period` for `main_meter` phases plus
  matching `hdo.switch` history, requested only the first time the Náklady
  tab is opened — sessions that never look at costs never pay for it. No
  fallback to raw history for this range (that's exactly the payload Fáze
  3.2 avoids); an entity without long-term statistics simply doesn't
  contribute to the 7d/month total.
- "Dnes" reuses the exact data path `_calcDailyCost` already used (5-minute
  stats → raw-history fallback per entity, Fáze 3.2) — unchanged.

## [5.1.8] — 2026-08-03
*Fáze 3.2 (ROADMAP.md) — daily cost calc prefers long-term statistics over raw history.*

### ✨ Added

- **Cost calc now prefers `recorder/statistics_during_period`** (5-minute
  buckets, since midnight) over raw state history for the NT/VT daily cost
  shown next to the main meter and each circuit. Falls back to the existing
  raw-history trapezoidal integration (Fáze 1.1) per entity — a 3-phase
  circuit where only some phases have long-term statistics still gets the
  benefit for those, without losing cost for the rest. Requires the power
  entity to have `state_class: measurement` (or similar) for HA to actually
  record statistics for it; entities without it just keep using raw history,
  same as before this change.
- New `ntFractionOfInterval` splits a statistics bucket across an NT/VT
  boundary that falls inside it proportionally (exact switch-transition/
  window-boundary split), instead of a single midpoint test — more accurate
  than the raw-history method for the coarser 5-minute/hourly granularity.
- Debug log (`debug: true`) now reports how many tracked entities actually
  have usable statistics — needed to verify this against a real HA instance
  per-entity, since availability depends on each sensor's `state_class`.
- Raw history fetch (today, since midnight) is unchanged for now — still the
  fallback safety net. Narrowing it once statistics are confirmed reliable
  on real entities is a follow-up, not part of this step.

## [5.1.7] — 2026-08-03
*Editor: GUI pole pro manuální (custom) HDO rozvrh.*

### ✨ Added

- **Editor — Custom NT schedule**: `hdo.schedule` (weekday/weekend/optional
  holiday, each a list of start-time + duration NT windows) now has a full
  GUI editor instead of requiring raw YAML. "Add custom schedule" creates the
  weekday/weekend blocks, each window is a time picker + minutes input with
  add/remove, holiday can be added/removed separately, and the whole block
  can be removed again. Same `starts[]`/`offsets[]` shape as the built-in PRE
  presets, so it round-trips through the card unchanged.
- Practical motivation: this is the immediate, dependency-free option when a
  user's tariff/meter changes and no `schedule_entity`-capable integration
  exists yet for their new setup — see ROADMAP.md Fáze 2 notes. The HDO
  switch itself stays authoritative for real-time NT/VT and cost regardless;
  only the predictive timeline needs a schedule source.

## [5.1.6] — 2026-08-03
*Fáze 2 (ROADMAP.md) — NT schedule can now come from a live entity instead of only hardcoded presets.*

### ✨ Added

- **`hdo.schedule_entity`** (optional) — point the card at an entity whose
  `schedule` attribute lists NT windows (targets the verified
  `sensor.cez_hdo_schedule_*` shape from the `ha_cez_distribuce` integration:
  an array of `{start, end, tariff}` ISO-timed entries, tolerant of a few
  reasonable key aliases). When it resolves data for a given day it takes
  priority over `tariff_preset` and manual `schedule`; falls back to them
  automatically when the entity is missing/unavailable or has nothing for
  that day. Editor shows which source is currently active.
- Direct API integration with ČEZ/PRE was investigated and ruled out for the
  card itself — see ROADMAP.md Fáze 2 for why (no open API, CAPTCHA/scraping
  belongs in a backend HA integration, not a browser-side Lovelace card).

### 🔧 Internal

- **`src/utils.ts`** — `isNTAt` and the slot builder now work on plain
  `Window[]` (`{start, end}` in ms) instead of a preset-shaped `TariffDay` +
  day-type, so preset/manual and entity-sourced schedules flow through the
  exact same code from `ElectricityPanelCard._scheduleWindows()` onward
  (mismatch detection, midnight merge, cost integration — all source-agnostic
  now). Added `parseScheduleEntity`, `buildFullDaySlotsFromWindows`,
  `ntRemainingMinsFromWindows`.
- **Unit tests (vitest)** — 64 tests (was 54): `parseScheduleEntity` against
  the verified shape plus malformed/multi-day/no-match inputs, and the
  `isNTAt` precedence suite re-verified against both preset-derived and
  entity-derived windows.
- Presets in `tariff-presets.ts` marked as a frozen fallback (not actively
  maintained going forward) now that `schedule_entity` can stay current on
  its own.

## [5.1.5] — 2026-08-03
*Fáze 1 (ROADMAP.md) complete — stabilization: extracted/tested core logic, midnight NT merge, switch×schedule mismatch indication.*

### ✨ Added

- **Switch × schedule mismatch indication** (standard behaviour, not opt-in) — the
  HDO bar always shows the *real* switch state as NT/VT, never the schedule. When
  the two disagree, a note explains how: `"NT měl začít v HH:MM (před X min)"` when
  NT is overdue, `"NT začal dříve — plán HH:MM"` when it started ahead of schedule,
  and the symmetric pair for NT ending late/early. Drift beyond ~120 min is no
  longer shown as a growing delay — it's flagged as `"neodpovídá rozvrhu"` (schedule/
  day-type is probably wrong, not just running late). The progress bar now tracks
  from the switch's real last transition to the schedule's expected boundary,
  instead of the schedule's own nominal start. When the switch is unavailable, the
  bar falls back to the schedule (if one is configured) and labels it `"podle
  rozvrhu"` — the grey "unavailable" state is now shown only when there's no
  schedule to fall back on either.
- **`hdo.merge_midnight`** (opt-in, default `false`) — when today's NT window ends
  exactly at midnight and tomorrow's schedule opens a new NT window at 00:00, the
  schedule timeline, expanded rows, "NT zbývá" countdown and the top HDO bar's
  progress fill now show them as one continuous window instead of splitting at the
  day boundary. Presentation only — cost calculation and per-day logic are
  unaffected. Toggle in the HDO editor section.

### 🔧 Internal

- **`src/utils.ts`** — extracted the pure schedule/tariff logic (`buildFullDaySlots`,
  `isNTAt`, day-type resolution, NT-remaining, cost integration, `mergeMidnightNt`,
  `ntWindowsForDay`, `resolveHdoStatus`) out of `ElectricityPanelCard` into
  standalone, dependency-free functions.
- **Unit tests (vitest)** — 54 tests covering slot building (midnight-crossing
  windows, unsorted inputs, DST spring-forward/fall-back days), day-type resolution,
  midnight merge, switch×schedule mismatch classification (all four combinations
  plus the drift threshold), and the cost integration math. Pins down the
  source-precedence rule for good: the real HDO switch (state + history) is always
  authoritative; the tariff schedule is only a fallback for times before the first
  history entry and a predictor of the future.
- **CI** — `validate.yml` now runs `npm test` before the typecheck/build step.

## [5.1.0] — 2026-06-10
*Accuracy release — correct daily costs, holiday-aware schedules, cs/en localization,
HA theme support, and a faster, safer card.*

### ✨ Added

- **Public holiday sensor** — new `hdo.holiday_sensor` entity field: any entity that is
  `on` on public holidays, e.g. a national holiday calendar (`calendar.czechia`).
  Today's state selects the holiday schedule; for `calendar.*` entities the next-event
  attributes (`start_time` / `end_time`) are additionally used to detect whether
  **tomorrow** is a holiday, so the Tomorrow schedule view now shows the correct
  holiday programme.

- **"Wait for NT" hint** (opt-in) — during VT, circuits drawing above a configurable
  threshold (default 100 W) show a compact amber hint with the countdown to the next
  NT window and the percentage saving (`NT in 1h 23m · save 58 %`). Disabled by
  default to keep the dashboard calm; enable in the HDO editor section. Requires
  NT/VT prices.

- **Localization (cs/en)** — all card strings are translated. Language follows the HA
  profile automatically; force with `language: en | cs`.

- **Follow HA theme** — `follow_theme: true` maps the card palette onto the active HA
  theme (light or dark) instead of the built-in dark design. Off by default —
  existing dashboards are unchanged.

- **Toggle confirmation** — per-circuit `confirm_toggle` shows a confirmation dialog
  before switching the breaker.

- **More-info dialogs** — circuit names, phase power values and the main-meter total
  are clickable and open the standard HA more-info dialog.

- **Overload pulse** — the load bar pulses when load reaches 95 % of the breaker rating.

- **Unavailable states surfaced** — an unavailable HDO switch renders a neutral grey
  bar instead of masquerading as VT; unavailable power/current sensors show `—`
  instead of a misleading `0`.

- **Sections layout support** — `getGridOptions()` reports full-width sizing for the
  HA sections (grid) dashboard layout.

- **Editor: reorder arrows** — ↑ / ↓ buttons next to each circuit (HTML5 drag & drop
  never worked on touch devices; both methods are now available).

- **Editor: "Appearance & behaviour" section** — theme, language and debug-logging
  controls.

- **`.env.example`** — template for `deploy.mjs` that the docs referenced but the
  repository never contained.

### 🐛 Fixed

- **Daily cost was not daily** — power history was fetched only `graph_hours`
  (default 3 h) back, so the "cost today" figure actually integrated just the last
  few hours. With prices configured the history window now always starts at midnight.

- **3-phase cost double-counting** — circuits with both a total power entity and
  per-phase entities summed all four signals in the cost integral (≈2× the real
  cost). The total entity is now preferred; phases are used only when no total exists.

- **Day type without a workday sensor** — with no (or an unavailable) workday sensor
  every Mon–Fri was classified as a *holiday*, silently selecting the wrong NT
  schedule. Day-of-week is now the fallback, and an unavailable sensor no longer
  flips the schedule.

- **3-phase load bar power fallback** — used `P / (maxA × 400)`; correct is
  `P / (maxA × √3 × 400)`, so the bar over-reported load by ~73 % whenever no current
  entity was configured.

- **Device & channel units ignored** — device/channel rows bypassed
  `unit_of_measurement`; a sensor reporting kW rendered as e.g. "1 W" while the
  channel-sum line above it was correct. All rows now use the same unit-aware
  conversion as circuits.

- **Toggle domain hardcoded to `switch`** — toggles now call
  `homeassistant.turn_on/off`, so `light.*`, `input_boolean.*`, `fan.*` etc. work as
  breaker/device switches.

- **Negative power (PV export)** — clamped to zero in the cost integration and the
  load bars; export periods no longer produce negative daily costs.

- **Midnight-crossing NT windows** — schedule slots are clamped to 24:00 and sorted;
  malformed or unsorted manual schedules can no longer produce negative VT gaps or a
  timeline wider than 24 h.

- **DST transition days** — slot times are computed as wall-clock times instead of
  `midnight + minutes`, so the schedule stays aligned on 23/25-hour days.

- **Config-change race** — a `setConfig` arriving while a history fetch was in flight
  silently dropped the refetch until the next 5-minute timer. Refetches are now
  queued and run as soon as the active fetch finishes.

- **Prices stored as strings** — the GUI editor saved `nt_price` / `vt_price` as
  strings; they are now stored as numbers, matching the documented config schema.

- **Editor: renaming overwrote custom IDs** — the circuit `id` is only auto-derived
  from the name when it was itself auto-generated; manually set IDs survive renames.

- **Editor: stale per-phase entities** — switching a circuit from 3φ to 1φ now
  removes the per-phase entity fields from the config instead of leaving dead keys.

- **Main meter voltage duplication** — a single `voltage` entity no longer renders
  both in the meter header and inside the L1 phase cell.

### ⚡ Performance

- **Sparkline path caching** — SVG paths are computed once per history fetch instead
  of on every 30-second countdown re-render.

- **Time-aligned sparklines** — all graphs now share the same x-axis
  `[fetch − graph_hours, fetch]` and extend the last value to the right edge, making
  phases visually comparable (previously each graph auto-scaled to its own data span).

- **Leaner history fetches** — only entities that are actually displayed (or needed
  for cost tracking) are queried; `minimal_response: true` added to the WS call; GUI
  editor keystrokes are debounced (300 ms) instead of triggering a recorder query per
  character.

- **No-op hass updates skipped** — with no tracked entities the card no longer
  re-renders on every state change in HA.

### 🎨 Design & accessibility

- Palette refactored to CSS custom properties (`--ep-*`) — the basis for
  `follow_theme`.
- Dim text colour bumped `#4b5568` → `#5d6a80` for better small-text contrast.
- Schedule header is keyboard-accessible (`role="button"`, `tabindex`, Enter/Space);
  expand buttons expose `aria-expanded`.

### 🛠 Internal

- `npm run build` now runs `tsc --noEmit` before bundling, and the validate workflow
  gained a typecheck+build job — the build was previously never type-checked.
- Dead code removed: `_fmtCostRate`, unused `_inputHandler`; `_moveCircuit` is back
  in use by the new reorder arrows.
- Debug console logging is opt-in via `debug: true`; production console spam removed.
- `package.json` version synced with `EP_VERSION` (was 2.0.0 vs 5.0.8).
- Removed stray `vite.config.ts.timestamp-*.mjs` artefacts; README's broken
  screenshot links removed.

---

## [5.0.8] — 2026-06-05
*Third and final sparkline label fix — flex layout, labels always 40 px, no overlap.*

### 🐛 Fixed

- **Sparkline label sizing** — replaced all previous approaches (SVG user-unit reservation,
  CSS padding, absolute SVG positioning) with a flex layout: the `.sparkline-wrap` is now
  `display: flex`, the label `<div>` is a fixed `width: 40px` flex sibling placed before
  or after the SVG in DOM order depending on `sparkline_labels`, and the SVG takes
  `flex: 1`. This gives the label exactly 40 CSS px at every card width without any
  coordinate tricks, and the graph fills the remaining space without overlap.

---

## [5.0.7] — 2026-06-05
*Sparkline labels correctly overlaid on graph; version badge in GUI editor.*

### 🐛 Fixed

- **Sparkline labels pushed outside graph area** — the CSS padding approach from v5.0.5
  caused min/max labels to sit in empty space beside the graph rather than overlaid on
  it. Replaced with absolute SVG positioning: the SVG is anchored to `left: 40px / right: 0`
  (or `left: 0 / right: 40px` for right-side labels), so the label zone is exactly 40 CSS px
  and the graph fills the remainder — pixel-accurate at any card width, no overlap.

### ✨ Added

- **Version badge in GUI editor** — the card editor now shows
  `electricity-panel-card vX.Y.Z` at the bottom, making it easy to confirm which
  version is active without opening DevTools.

### 🛠 Internal

- `EP_VERSION` extracted to `src/types.ts` and shared between the card and editor,
  so version only needs to be updated in one place.

---

## [5.0.6] — 2026-06-05
*Hotfix: corrects a file corruption in v5.0.5 that caused the GitHub Actions build to fail.*

### 🐛 Fixed

- **Build failure in v5.0.5** — a stale staged version of `electricity-panel-card.ts`
  was committed, containing a duplicate orphaned line introduced during a previous
  repair attempt. The source file and built `dist/` are now correct.

---

## [5.0.5] — 2026-06-05
*Sparkline labels no longer overlap the graph on wide cards; new `npm run bump` for post-HACS cache-busting.*

### 🐛 Fixed

- **Sparkline label overlap on wide cards** — the graph now always fills its full
  SVG content box. The wrapper uses CSS `padding-left/right: 40 px` to reserve label
  space instead of SVG user units. With `preserveAspectRatio="none"` those SVG units
  scale with card width, so on wide single-phase cards the reserved area spanned
  hundreds of CSS pixels while the label stayed 40 px — wasting space and still
  overlapping on some widths.

### ⚙️ Tooling

- **`npm run bump`** — skips the build and only updates the Lovelace resource URL
  (`?v=<timestamp>`) via the HA REST API. Run once after a HACS update to force
  the browser to fetch the new file without a hard reload.

---

## [5.0.4] — 2026-06-05
*Patch: sparkline label/graph overlap (previous approach, superseded by 5.0.5).*

### 🐛 Fixed

- **Sparkline labels overlapping graph** — the graph path reserved horizontal space
  for HTML labels in SVG user units (`x=40` for left, `x=60` end for right). This
  partially fixed overlap but was still sensitive to card width; fully replaced in 5.0.5.

---

## [5.0.3] — 2026-06-05
*Sparkline min/max labels rendered as HTML elements — immune to SVG horizontal scaling.*

### 🐛 Fixed

- **Inconsistent label font size across card widths** — min/max labels switched from
  SVG `<text>` nodes to HTML elements overlaid on the SVG. With `preserveAspectRatio="none"`
  Chromium scaled SVG font metrics with the horizontal axis, making labels on wide
  single-phase cards appear significantly larger than on narrow 3-phase phase cells.
  HTML labels are controlled purely by CSS and scale identically everywhere.

---

## [5.0.2] — 2026-06-05
*Version logging added to console; single-phase sparkline labels re-enabled.*

### 🐛 Fixed

- **Single-phase sparkline font size** — min/max labels now use `font-size="8"` as
  an SVG presentation attribute (user units) instead of CSS `font-size: 8px`. SVG
  Y-scale is always 1:1 (viewBox height 38 = 38 px), so user units give consistent
  8 px text on any card width. Labels are fully restored on single-phase sparklines.

- **Version logging** — the card prints its version to the browser console on load
  (`electricity-panel-card v5.0.2`), making it easy to confirm which version is
  actually cached without opening DevTools network tab.

---

## [5.0.1] — 2026-06-05
*Hotfix: hidden labels on single-phase sparklines to avoid scaling artefacts.*

### 🐛 Fixed

- **Single-phase sparkline font scaling** — min/max labels hidden on single-phase
  circuit sparklines. The SVG stretches across the full card width with
  `preserveAspectRatio="none"`, causing browsers to scale CSS `font-size`
  proportionally with the X transform — labels appeared far larger than on narrow
  3-phase cells. Labels remain available on main meter and 3-phase cards where SVG
  width is constrained. *(Fully fixed in 5.0.3.)*

---

## [5.0.0] — 2026-06-05

> **Major release** — live power history graphs, real-time cost tracking, per-phase voltage,
> last-updated staleness badge, improved mobile layout, and a significantly expanded GUI editor.
> Consolidates all development since the v4.0.0 dark-theme foundation.

### ✨ Added

- **Sparkline power history graphs** — phase cells on the main meter and 3-phase circuits
  display smooth SVG graphs from the HA history API (compressed format, HA 2023.3+).
  Configurable window (1–24 h, default 3 h), line colour, min/max label position
  (left / right / hidden), and dashed reference lines with configurable colour.

- **Single-phase circuit sparkline** — breaker cards can optionally show a full-width
  power history graph below the metrics row. Off by default; enabled in Graph settings.

- **Sparkline visibility toggles** — independent on/off switches for main meter graphs,
  3-phase circuit graphs, and single-phase circuit graphs.

- **Daily cost tracking** — each circuit and the main meter show accumulated cost for the
  current day (e.g. `1.93 Kč`), computed by integrating power history and splitting
  NT / VT tariff periods using HDO switch history with schedule fallback.
  Requires `nt_price` / `vt_price` under HDO.

- **Per-phase voltage — main meter** — `voltage_l1/2/3` entity fields; shown in each phase
  cell below the current reading. Legacy single `voltage` entity still supported.

- **Per-phase voltage — 3-phase circuits** — same `voltage_l1/2/3` fields on individual
  3-phase circuit breakers, displayed identically to the main meter.

- **Voltage — single-phase circuits** — `voltage` field now shown in the circuit footer
  alongside current and energy.

- **Last-updated age badge** — `↻ Xs / Xm / Xh` indicator on each circuit and the main
  meter, showing how long ago the primary entity was last updated. Three configurable
  colour thresholds. Globally toggled in Graph settings.

- **Entity validation in editor** — entity_id fields turn amber with a warning when the
  entity does not exist in HA's state machine.

### 🔄 Changed

- **Mobile layout** — single-phase grid switches to one column at 480 px (was 360 px).
  Phase cells reduce gap at 480 px and stack vertically at 360 px.

- **Editor: "Graph settings" section** — renamed from "Sparkline graphs"; now also contains
  history period and age badge controls, grouped into subsections.

- **Editor: "Main meter (optional)"** — label updated to clarify the section is optional.

### 🐛 Fixed

- **History API format** — parser now supports both legacy (`state` / `last_changed`) and
  compressed HA 2023.3+ format (`s` / `lu` / `lc` as Unix float seconds). Previously all
  power sensor values were discarded as NaN.

- **kW unit conversion in history cache** — power entities in kW were stored raw and
  divided by 1000 again during integration, producing costs ~1000× too small. The fetcher
  now normalises all cached values to watts using `unit_of_measurement`.

- **Daily cost — multi-phase summation** — `_calcDailyCost` now sums all supplied phase
  entities independently. Cost reflects total consumption, not just L1.

- **NT/VT split accuracy** — `_isNTAt` uses HDO switch history only within the recorded
  window; falls back to the tariff schedule for earlier timestamps.

- **`setConfig` race condition** — cache was cleared unconditionally in `setConfig`. Now
  only cleared when no fetch is in progress.

- **Sparkline reference lines** — `sparkline_ref_line: true` now shows both lines
  regardless of `sparkline_labels` setting.

- **Single-phase device list layout** — devices under single-phase breakers are now
  rendered single-column instead of the 3-column grid intended for 3-phase circuits.

---

## [4.10.0] — 2026-06-05
*Per-phase voltage on main meter; styled sparkline background on single-phase cards.*

### ✨ Added

- **Per-phase voltage on main meter** — `voltage_l1/2/3` entity fields. Each phase cell
  shows voltage below the current value. Legacy single `voltage` entity still supported
  (shown on L1 when no per-phase entities are set).

- **Single-phase circuit sparkline background** — sparkline wrapped in a dark container
  matching the visual style of phase cells in 3-phase and main meter cards.

---

## [4.9.0] — 2026-06-05
*Per-phase voltage on 3-phase circuits; single-phase sparkline; sparkline visibility toggles.*

### ✨ Added

- **Per-phase voltage on 3-phase circuits** — `voltage_l1/2/3` fields added to circuit
  config. Each phase cell shows voltage below the current value.

- **Single-phase circuit sparkline** — full-width power history graph below the metrics
  row. Disabled by default; enable via Graph settings → Sparkline visibility.

- **Sparkline visibility toggles** — three independent checkboxes: main meter cells,
  3-phase circuit cells, single-phase cards.

---

## [4.8.0] — 2026-06-05
*Voltage on main meter, entity validation in editor, mobile layout improvements.*

### ✨ Added

- **Voltage on main meter** — `voltage` entity displayed in the meter header next to
  energy and cost.

- **Entity validation in editor** — entity_id fields turn amber with a warning when the
  configured entity does not exist in HA.

### 🔄 Changed

- **Mobile layout** — single-phase circuit grid switches to one column at 480 px
  (previously 360 px). Phase cells grid reduces gap at 480 px, stacks at 360 px.

- **Editor: "Main meter (optional)"** — section label updated for clarity.

---

## [4.7.1] — 2026-06-05
*Hotfix: CSS truncation restored sparklines and several other styles.*

### 🐛 Fixed

- **Sparkline font and card styles restored** — a file truncation silently dropped
  `.toggle`, `.status-dot`, `.expand-btn`, `.device-row`, `.sparkline`, `.spark-label`
  and related CSS rules from the bundle. All rules restored.

- **Age badge GUI labels** — colour-picker labels in the editor are now
  "Short / Medium / Long" instead of "Fresh / Amber / Red".

---

## [4.7.0] — 2026-06-05
*Age badge on main meter; full GUI controls for badge thresholds and colours.*

### ✨ Added

- **Age badge — main meter** — last-updated badge appears on the main meter, using the
  first available phase power entity as the timestamp source.

- **Age badge — GUI controls** — global on/off toggle, configurable amber and red
  thresholds (minutes, default 5 / 15), and colour pickers for all three states.

### 🔄 Changed

- **Editor: "Graph settings" section** — renamed from "Sparkline graphs". History period
  and age badge controls moved here, grouped as subsections.

---

## [4.6.0] — 2026-06-05
*New: last-updated age badge on all circuit cards.*

### ✨ Added

- **Last-updated badge** — `↻ 30s / 2m / 1h` indicator in the footer of every circuit
  card. Colour: grey < 5 min, amber > 5 min, red > 15 min. Hidden when no entity is
  configured.

---

## [4.5.1] — 2026-06-05
*Fix: sparkline reference lines now independent of label position.*

### 🐛 Fixed

- **Sparkline reference lines** — `sparkline_ref_line: true` shows both min and max
  lines regardless of `sparkline_labels`. Previously hidden whenever labels were `none`.

---

## [4.4.0] — 2026-06-04
*Major cost tracking fixes: kW unit conversion, multi-phase summation, NT/VT accuracy.*

### 🐛 Fixed

- **Daily cost: kW unit conversion** — power entities reporting in kW were stored raw
  and divided by 1000 again during integration (costs ~1000× too small). Fetcher now
  normalises to watts via `unit_of_measurement`.

- **Daily cost: multi-phase summation** — `_calcDailyCost` accepts variadic entity IDs
  and sums across all phases. Cost now reflects total consumption, not just L1.

- **Daily cost: consistent display** — removed the `Kč/h` live-rate fallback; all
  circuits show either `X.XX Kč` (today so far) or nothing. Results below `0.005 Kč`
  are suppressed.

- **NT/VT split accuracy** — `_isNTAt` uses HDO switch history only within the recorded
  window, falling back to the tariff schedule for earlier timestamps.

---

## [4.3.0] — 2026-06-04
*Root cause fix: HA 2023.3+ compressed history format now parsed correctly.*

### 🐛 Fixed

- **Sparkline graphs and daily cost not showing** — `processEntries` used the old HA
  history format (`e.state` / `e.last_changed`) but HA 2023.3+ returns a compressed
  format (`e.s` / `e.lu` / `e.lc` as Unix float seconds). All power sensor values were
  parsed as NaN. Updated parser supports both formats.

- **`setConfig` race condition** — history cache cleared unconditionally in `setConfig`
  could erase freshly fetched data mid-fetch. Cache now only cleared when no fetch is
  in progress.

### 🔄 Changed

- `processEntries` emits a `console.warn` with a raw sample when 0 valid data points
  survive filtering, making regressions immediately visible in DevTools.

---

## [4.2.2] — 2026-06-03
*Fix: device list under single-phase breakers uses correct single-column layout.*

### 🐛 Fixed

- **Devices under single-phase breakers in 3 columns** — device lists were rendered in
  the `.tp-devices-grid` (3-column) intended for 3-phase circuits. Now uses
  `.devices-list` — full width, single column.

---

## [4.0.0] — 2026-06-03

> **Major release** — complete dark visual redesign. Card background locked to `#111318`;
> every component updated to the dark palette.

### 🎨 Design

- HDO bar: dark green/red tint, pulsing dot, large countdown, inline progress bar.
- Main meter: dark surface, icon, uppercase label, phase cells on a darker background.
- Circuit cards: muted name, prominent 22 px power value, 2 px left border accent
  (green for active, amber for critical).
- 3-phase circuits: dedicated `.three-phase-card` class, consistent with single-phase.
- Schedule, timeline, devices: all updated to the dark palette.
- Toggles: 32 px, dark-off (`#374151`), dark-green-on (`#16a34a`).
- Load bar: 3 px height, dark track (`#1f2937`), solid colour fill.

---

## [3.0.4] — 2026-06-03
*Fix: dashboard freeze caused by non-standard `shouldUpdate` override.*

### 🐛 Fixed

- **Dashboard freeze** — replaced the non-standard `shouldUpdate` override with a custom
  `hass` getter/setter. `requestUpdate` is now called only when a tracked entity actually
  changes, following the standard HA pattern for performance-sensitive cards.

---

## [3.0.3] — 2026-06-03
*Reverted Lit externalisation; Lit is bundled again.*

### 🐛 Fixed

- **"Custom element doesn't exist"** — reverted Lit externalisation from 3.0.1. HA's
  import map does not reliably resolve `lit/decorators.js` as a bare specifier. Lit is
  bundled again (~93 kB).

---

## [3.0.2] — 2026-06-03
*Root cause fix: removed `shouldUpdate` override that froze all dashboards.*

### 🐛 Fixed

- **All dashboards freezing** — removed the custom `shouldUpdate` override that corrupted
  Lit's internal reactive-element update cycle, stalling every card on the page.

---

## [3.0.1] — 2026-06-03
*Attempted fix: externalised Lit — superseded by 3.0.2 / reverted in 3.0.3.*

### 🐛 Fixed

- **All dashboards freezing** — externalised Lit so the card uses HA's built-in instance.
  *(Superseded by 3.0.2, reverted in 3.0.3.)*

---

## [3.0.0] — 2026-06-03

> **Major release** — light-theme visual redesign. Superseded by the dark redesign in 4.0.0.

### 🎨 Design

- HDO hero card with gradient background, pulsing dot, large countdown.
- Circuit cards: green glow on active, 22 px power value.
- Load bar: 3-zone gradient track.
- Section labels: left accent border.

---

## [2.7.1] — 2026-06-03

### 🐛 Fixed

- Removed confusing "NT remaining" total from the collapsed schedule header.

---

## [2.7.0] — 2026-06-03

### 🔄 Changed

- Collapsed schedule shows current tariff badge and time range inline.
- Timeline bar shows a white marker at the current time position.

---

## [2.6.0] — 2026-06-03

### ✨ Added

- Current NT/VT slot visible in collapsed schedule header.
- Channel group header shows summed watts and amperes.

---

## [2.5.0] — 2026-06-03

### ✨ Added

- Collapsible daily schedule (collapsed by default).
- 3-phase device column layout: one column per phase under each circuit.

### 🐛 Fixed

- Drag & drop reordering in the GUI editor restored.

---

## [2.4.0] — 2026-06-02

### 🐛 Fixed

- **Midnight VT bug** — PRE 605/606 presets were missing `00:00–01:00` and
  `22:00–00:00` NT windows. Data re-sourced from the official PRE HDO Excel.
