# Roadmapa — Electricity Panel Card

Pracovní plán dalšího vývoje. Stav k v5.1.0 (2026-06-10).

---

## Fáze 1 — Stabilizace základu → v5.2.0

### 1.1 Extrakce čisté logiky + unit testy
Výpočetní funkce (`_buildFullDaySlots`, `_isNTAt`, `_calcDailyCost`, `_ntRemainingMins`,
day-type logika) vytáhnout z komponenty do `src/utils.ts` a pokrýt testy (vitest).

**Proč:** tyhle funkce nepotřebují UI ani HA — jdou testovat automaticky v CI.
Je to pojistka: až budeme měnit zdroj rozvrhu (Fáze 2) a výpočet nákladů (Fáze 3),
testy okamžitě odhalí, že např. NT okno přes půlnoc nebo DST den počítáme špatně.
Nulový dopad na výkon karty — testy běží jen v CI, do bundle se nedostanou.

- [x] `src/utils.ts` — přesun čistých funkcí (bez `this`, vstupy parametrem)
- [x] `vitest` jako devDependency, `npm test`, job v validate.yml
- [x] Testy: sloty (vč. půlnoci, DST, neseřazených oken), `isNTAt`, cost integrace, day-type
- [x] **Test precedence zdrojů (zafixovat!):** reálný HDO switch (stav + historie) je vždy
      autoritativní; rozvrh/integrace pouze fallback (před prvním záznamem historie)
      a predikce budoucnosti. Hardwarová čtečka přepíná s odchylkou minut oproti
      rozvrhu — karta musí vždy interpretovat vůči reálnému stavu.

### 1.3 Indikace nesouladu switch × rozvrh (standardní chování, ne opt-in)
HDO switch (hardwarová čtečka) je **vždy zdroj pravdy**, dokud je dostupný
a vyplněný v GUI. Rozvrh je plán — a když se rozcházejí, karta to řekne.

**Specifikace chování HDO baru:**
- [x] Switch dostupný, souhlasí s rozvrhem → dnešní stav (beze změny)
- [x] Switch říká VT, rozvrh už NT → bar ukazuje **VT** + poznámka:
      „NT měl začít v HH:MM (před X min)"
- [x] Switch říká NT, rozvrh ještě VT → bar ukazuje **NT** + poznámka:
      „NT začal dříve — plán HH:MM"
- [x] Symetricky pro konec NT (předčasný / opožděný konec)
- [x] Nesoulad > ~120 min → nejde o zpoždění, ale o špatný rozvrh/day-type:
      místo rostoucí delty zobrazit „neodpovídá rozvrhu" (přesný práh doladit)
- [x] Switch unavailable nebo nevyplněný → tarif odvodit z rozvrhu a **explicitně
      označit** „podle rozvrhu" (místo dnešního šedého unavailable baru);
      šedý bar zůstává jen když není ani rozvrh
- [x] Progress bar slotu v HDO baru řídit reálným stavem (start = skutečné
      přepnutí switche, konec = plánovaný konec z rozvrhu)
- [x] Lokalizace cs/en; testy na všechny čtyři kombinace nesouladu

### 1.2 Sloučení NT přes půlnoc (GUI fajfka)
NT končící 24:00 + NT začínající 00:00 zobrazit v rozvrhu a horním panelu jako jedno
souvislé okno (countdown pak ukazuje skutečný konec, ne půlnoc).

- [x] Config: `hdo.merge_midnight: boolean` (default false), checkbox v editoru
- [x] Čistě prezentační vrstva — interní výpočty zůstávají per kalendářní den
- [x] Pozor na "zbývá NT dnes" — při merge ukazovat až do konce sloučeného okna

---

## Fáze 2 — Rozvrh z entity místo hardcoded presetů → v5.3.0

Cíl: zrušit závislost na ručně udržovaných PRE tabulkách v kódu.

**Průzkum (2026-08-03):** ani ČEZ, ani PRE nemají otevřené veřejné API — ČEZ
distribuce vyžaduje EAN + CAPTCHA (řeší se OCR na backendu), PRE se dá jen
scrapovat z HTML stavové stránky. Karta běží v prohlížeči bez backendu, takže
přímé napojení na tyto weby nedává smysl (CORS, žádné úložiště přihlašovacích
údajů) — správně to řeší komunitní HA integrace (Python), karta jen čte
entitu. Nejbohatší ověřený formát: `sensor.cez_hdo_schedule_*` z
[ha_cez_distribuce](https://github.com/Cmajda/ha_cez_distribuce) — atribut
`schedule` = pole `{start, end, tariff: "NT"|"VT"}` (ISO časy, 7 dní dopředu).
Ekvivalent pro PRE jsem nenašel — `parseScheduleEntity` je proto tolerantní
k pár aliasům klíčů (`from`/`to`, `value`/`is_low`, …), ne jen k jednomu tvaru.

- [x] Config: `hdo.schedule_entity` — sensor, jehož atributy obsahují NT okna
      (cíleno na ověřený formát `ha_cez_distribuce`, tolerantně i k aliasům)
- [x] Parser atributů → přímo `Window[]` (start/end v ms), ne `TariffDay` —
      entita už řeší konkrétní datum, den-týdne/svátek se tu neodvozuje;
      `buildFullDaySlots`/`isNTAt`/`resolveHdoStatus` teď berou `Window[]`
      jednotně bez ohledu na zdroj (viz `ElectricityPanelCard._scheduleWindows`)
- [x] Priorita zdrojů: `schedule_entity` → `tariff_preset` → manuální `schedule`
- [x] Editor: pole pro entitu + indikace, který zdroj rozvrhu je právě aktivní
- [x] Debug log: vypsat naparsovaný rozvrh při `debug: true`
- [x] Testy parseru (navazuje na 1.1)
- [x] Presety v kódu ponechat jako fallback, ale označit za zamrzlé (neudržovat)

---

## Fáze 3 — Statistiky a souhrn nákladů (design-first) → v5.4.x

**Zásada: nejdřív oditerovat design (mockupy), až pak kód.** Karta je už teď
informačně hustá — nové prvky musí být sbalitelné a volitelné.

### 3.1 Design iterace
- [x] HTML mockupy 3 variant umístění (sbalitelná sekce pod HDO blokem /
      samostatná karta `electricity-costs-card` / tab v bloku rozvrhu) —
      2026-08-03, interaktivní widget v konverzaci (Cowork), zatím nesoučást repa
- [x] **Rozhodnuto: varianta „tab v rozvrhu"** — blok rozvrhu dostane druhou
      záložku „Náklady" vedle „Rozvrh"; bez nárůstu výšky karty, cena za to je
      že rozvrh a náklady nejdou vidět současně (přijatelné)
- [x] Granularita: přepínač **Dnes / 7 dní / Měsíc** uvnitř záložky Náklady;
      NT vs VT jako jeden stacked bar (2 segmenty) + legenda kWh/Kč pod ním
- [x] Default: záložka „Rozvrh" aktivní při otevření karty (náklady jsou
      druhý krok, ne první věc, kterou uživatel vidí)

### 3.2 Přechod na long-term statistics
- [x] `recorder/statistics_during_period` (`period: '5minute'`, od půlnoci) —
      v5.1.8. `_calcDailyCost` teď pro každou entitu zvlášť preferuje
      `_statsCache`, a jen když pro ni statistiky chybí, spadne zpět na
      dosavadní raw-history trapezoidal (`_historyCache` + `accumulateTariffWh`,
      beze změny). Nová `ntFractionOfInterval` dělí bucket přesně podle
      switch-transition/window bodů (ne jen midpoint test) — přesnější než
      raw-history metoda i pro hrubší 5min/hour granularitu.
- [x] **Ověřeno na reálné instanci** (2026-08-12) — statistiky fungují.
- [x] Zúžit raw-history fetch zpět na `graph_hours` — v5.1.11. Raw history je
      teď zase čistě graf/sparkline okno; cost calc jede přes statistiky
      (midnight-anchored vlastním WS voláním), raw-history fallback zůstává
      jen pro entity bez statistik.

### 3.3 Souhrn nákladů
- [x] Dle vítězného návrhu z 3.1 (varianta C) — v5.1.9. Blok rozvrhu má
      záložky „Rozvrh"/„Náklady" (jen když jsou nastavené `nt_price`/`vt_price`,
      jinak beze změny). Náklady: přepínač Dnes/7 dní/Měsíc, NT/VT stacked
      bar + legenda, celkem, u 7 dní/Měsíc druhý řádek (průměr/den, odhad
      měsíce). Počítá se z `main_meter` fází (celá instalace, ne součet
      okruhů). Odhad měsíce = lineární extrapolace z průměru měsíce k datu
      (`estimateMonthCost`) — záměrně bez váhování všední/víkend nebo podle
      poměru NT/VT v rozvrhu; pokud to bude nepřesné, doladíme.
- [x] **Ověřeno na reálné instanci** (2026-08-12) — 7 dní/Měsíc počítá
      správně, částky sedí.

### 3.3b Přesnost: energy senzory místo mean-W aproximace
Vzniklo z otázky (2026-08-04), jak vlastně HA ukládá historii a jestli se
dá napojit na Energy dashboard přímo. Zjištění: dlouhodobé (hodinové)
statistiky se nemažou nikdy — jen krátkodobé 5minutové a raw historie
(`purge_keep_days`, výchozích 10 dní) se downsamplují do nich a pak mažou.
Takže 3.2/3.3 na to už byly napojené správně. Energy dashboard navíc nemá
vlastní úložiště — čte/zapisuje do stejných `statistics` tabulek přes
stejné WS API. Rozdíl je jen v tom, na jaký typ senzoru se dashboard dívá:
skutečný energy (kWh, `state_class: total_increasing`) místo power (W,
`measurement`) — pro energy senzor HA v `statistics_during_period` vrací
přesnou `change` hodnotu (bez aproximace mean × doba).

- [x] `main_meter.energy_today` / `circuit.energy` (existující config pole,
      dosud jen pro zobrazení) — v5.1.10 mají přednost před power senzory
      všude, kde se počítá cena (badge hlavního měřiče, badge okruhů, Náklady
      tab, všechna 3 období). Fallback na power (Fáze 3.2) jen když energy
      senzor nemá use statistiky.
- [ ] **Ověřit na reálné instanci:** debug log `energy stats: N/M energy
      entities have usable 5minute 'change' statistics` — potřeba
      zkontrolovat, že se to skutečně použije místo power aproximace a že
      částky sedí (zvlášť po půlnočním resetu `energy_today`, HA by ho měl
      zvládnout sám přes `last_reset`, ale chceme to vidět na reálných datech).

---

## Fáze 4 — Komunita a publikace → v6.0.0

- [x] README sekce **Recommended automations** — v5.1.11. 3 YAML příklady
      (bojler on/off na NT, per-okruh overload notifikace, hlavní jistič
      overload notifikace) + poznámka, že karta zůstává čistě vizuální vrstva
- [x] **Rozhodnuto (2026-08-12): karta bude jen anglicky.** Cs lokalizace
      odstraněna celá — v5.1.12. `localize.ts` zjednodušen na jednu
      anglickou sadu, config pole `language` pryč, editor ztratil selektor
      Language (nikdy neměl cs verzi, byl tedy nekonzistentní). README
      aktualizováno. Breaking change (viz CHANGELOG), ale bez dopadu na
      YAML configy — `language` klíč karta jednoduše ignoruje.
- [ ] Aktualizovat screenshoty, projít a11y — a11y potřebuje živě
      renderovanou kartu, screenshoty reálný dashboard; zatím neřešeno.
- [ ] Test zájmu: post ve Facebook skupině Home Assistant CZ/SK
- [ ] Při reálném zájmu: submission do HACS default store (repo už splňuje
      technické požadavky — validace, dist, README s obrázky)

---

## Odloženo / zamítnuto

| Položka | Stav | Poznámka |
|---|---|---|
| Interaktivní sparkliny (tooltip, přepínání okna na kartě) | **Odloženo** | Malý přínos na hustém dashboardu, přidává listenery a re-rendery. Konfigurace okna zůstává v GUI. Revize po Fázi 3. |
| Neměřený zbytek okruhu | **Zamítnuto** | Rozdíly měřidel různých výrobců jsou očekávané, informace netřeba trvale zobrazovat. |
| FVE režim (export, self-consumption) | **Odloženo** | Hodnota až pro veřejné publikum — po Fázi 4. |
| Spotové ceny (OTE) | **Odloženo** | Tamtéž; potenciálně silný odlišovák pro HACS verzi. |
| Akční alerty (volání služeb z karty) | **Zamítnuto v kartě** | Karta není backend monitoring — řeší sekce Recommended automations (Fáze 4). |

---

## Verzování

| Fáze | Verze | Typ |
|---|---|---|
| 1 — testy + midnight merge | 5.2.0 | minor |
| 2 — rozvrh z entity | 5.3.0 | minor |
| 3 — statistiky + náklady | 5.4.0+ | minor |
| 4 — publikace | 6.0.0 | major (public release) |
