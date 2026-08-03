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
- [ ] **Ověřit na reálné instanci:** `debug: true` teď loguje kolik
      trackovaných entit má use statistiky (`stats: N/M entities have usable
      5minute statistics`). Nutné zkontrolovat u Michaličových power entit
      (main_meter fáze, okruhy) — vyžaduje `state_class: measurement`
      nastavený na senzoru; bez toho HA statistiky vůbec nezaznamenává.
- [ ] Zúžit raw-history fetch zpět na `graph_hours` (dnes jde kvůli cost
      calc až k půlnoci) — odloženo do potvrzení výše, ať se neztratí
      fallback bezpečnostní síť dřív, než víme, že statistiky fungují

### 3.3 Souhrn nákladů
- [ ] Dle vítězného návrhu z 3.1; odhad měsíční faktury extrapolací přes HDO rozvrh

---

## Fáze 4 — Komunita a publikace → v6.0.0

- [ ] README sekce **Recommended automations** — místo akčních alertů v kartě
      doporučit hotové HA automatizace (overload notifikace, bojler na NT, …);
      karta zůstává čistě vizuální vrstva
- [ ] Finální polish: projít cs/en texty, aktualizovat screenshoty, projít a11y
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
