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

- [ ] `src/utils.ts` — přesun čistých funkcí (bez `this`, vstupy parametrem)
- [ ] `vitest` jako devDependency, `npm test`, job v validate.yml
- [ ] Testy: sloty (vč. půlnoci, DST, neseřazených oken), `isNTAt`, cost integrace, day-type
- [ ] **Test precedence zdrojů (zafixovat!):** reálný HDO switch (stav + historie) je vždy
      autoritativní; rozvrh/integrace pouze fallback (před prvním záznamem historie)
      a predikce budoucnosti. Hardwarová čtečka přepíná s odchylkou minut oproti
      rozvrhu — karta musí vždy interpretovat vůči reálnému stavu.

### 1.3 Indikace nesouladu switch × rozvrh (standardní chování, ne opt-in)
HDO switch (hardwarová čtečka) je **vždy zdroj pravdy**, dokud je dostupný
a vyplněný v GUI. Rozvrh je plán — a když se rozcházejí, karta to řekne.

**Specifikace chování HDO baru:**
- [ ] Switch dostupný, souhlasí s rozvrhem → dnešní stav (beze změny)
- [ ] Switch říká VT, rozvrh už NT → bar ukazuje **VT** + poznámka:
      „NT měl začít v HH:MM (před X min)"
- [ ] Switch říká NT, rozvrh ještě VT → bar ukazuje **NT** + poznámka:
      „NT začal dříve — plán HH:MM"
- [ ] Symetricky pro konec NT (předčasný / opožděný konec)
- [ ] Nesoulad > ~120 min → nejde o zpoždění, ale o špatný rozvrh/day-type:
      místo rostoucí delty zobrazit „neodpovídá rozvrhu" (přesný práh doladit)
- [ ] Switch unavailable nebo nevyplněný → tarif odvodit z rozvrhu a **explicitně
      označit** „podle rozvrhu" (místo dnešního šedého unavailable baru);
      šedý bar zůstává jen když není ani rozvrh
- [ ] Progress bar slotu v HDO baru řídit reálným stavem (start = skutečné
      přepnutí switche, konec = plánovaný konec z rozvrhu)
- [ ] Lokalizace cs/en; testy na všechny čtyři kombinace nesouladu

### 1.2 Sloučení NT přes půlnoc (GUI fajfka)
NT končící 24:00 + NT začínající 00:00 zobrazit v rozvrhu a horním panelu jako jedno
souvislé okno (countdown pak ukazuje skutečný konec, ne půlnoc).

- [ ] Config: `hdo.merge_midnight: boolean` (default false), checkbox v editoru
- [ ] Čistě prezentační vrstva — interní výpočty zůstávají per kalendářní den
- [ ] Pozor na "zbývá NT dnes" — při merge ukazovat až do konce sloučeného okna

---

## Fáze 2 — Rozvrh z entity místo hardcoded presetů → v5.3.0

Cíl: zrušit závislost na ručně udržovaných PRE tabulkách v kódu.

- [ ] Config: `hdo.schedule_entity` — sensor, jehož atributy obsahují NT okna
      (primárně formát PRE distribuce integrace; prozkoumat přesnou strukturu atributů)
- [ ] Parser atributů → interní `TariffDay` formát; tolerantní k formátům časů
- [ ] Priorita zdrojů: `schedule_entity` → `tariff_preset` → manuální `schedule`
- [ ] Editor: pole pro entitu + indikace, který zdroj rozvrhu je právě aktivní
- [ ] Debug log: vypsat naparsovaný rozvrh při `debug: true`
- [ ] Testy parseru (navazuje na 1.1)
- [ ] Presety v kódu ponechat jako fallback, ale označit za zamrzlé (neudržovat)

---

## Fáze 3 — Statistiky a souhrn nákladů (design-first) → v5.4.x

**Zásada: nejdřív oditerovat design (mockupy), až pak kód.** Karta je už teď
informačně hustá — nové prvky musí být sbalitelné a volitelné.

### 3.1 Design iterace
- [ ] HTML mockupy 2–3 variant umístění (sbalitelná sekce „Náklady" pod HDO blokem
      vs. samostatná karta `electricity-costs-card` vs. tab v rozvrhu)
- [ ] Rozhodnout granularitu: dnes / 7 dní / měsíc; NT vs VT stacked bar
- [ ] Rozhodnout, co je default (pravděpodobně: vše sbalené, jen řádek s dnešní sumou)

### 3.2 Přechod na long-term statistics
- [ ] `recorder/statistics_during_period` (period `hour`, pro dnešek `5minute`)
      místo raw historie pro výpočet nákladů; fallback na současnou history metodu
- [ ] Ověřit dostupnost statistik pro výkonové entity (state_class: measurement)
- [ ] Méně zátěže na recorder, data přežijí purge

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
