import type { HomeAssistant, ElectricityPanelConfig } from './types.js';

export type EpLang = 'en' | 'cs';

const STRINGS: Record<EpLang, Record<string, string>> = {
  en: {
    nt_low: 'NT — low tariff',
    vt_high: 'VT — high tariff',
    hdo_unavailable: 'HDO — state unavailable',
    ends_in: 'ends in',
    switching: 'switching…',
    today: 'Today',
    tomorrow: 'Tomorrow',
    weekday: 'weekday',
    weekend: 'weekend',
    holiday: 'holiday',
    nt_left: 'NT left',
    total: 'total',
    now: 'Now',
    main_meter: 'Main meter',
    three_phase_section: '3-phase circuits',
    single_phase_section: 'Single-phase breakers',
    devices: 'devices',
    hide: 'hide',
    kwh_today: 'kWh today',
    turn_on: 'Turn on',
    turn_off: 'Turn off',
    confirm_turn_on: 'Turn ON circuit "{name}"?',
    confirm_turn_off: 'Turn OFF circuit "{name}"?',
    nt_in: 'NT in',
    save_pct: 'save',
    from_schedule: 'from schedule',
    nt_should_start: 'NT should have started at {time} ({mins} min ago)',
    nt_started_early: 'NT started early — planned {time}',
    nt_should_end: 'NT should have ended at {time} ({mins} min ago)',
    nt_ended_early: 'NT ended early — planned {time}',
    hdo_mismatch: "doesn't match schedule",
    schedule_tab: 'Schedule',
    costs_tab: 'Costs',
    period_7d: '7 days',
    period_month: 'Month',
    cost_estimate_month: 'Estimated month total',
    cost_avg_day: 'Average {price}/day',
    no_cost_data: 'No data yet',
  },
  cs: {
    nt_low: 'NT — nízký tarif',
    vt_high: 'VT — vysoký tarif',
    hdo_unavailable: 'HDO — stav nedostupný',
    ends_in: 'konec za',
    switching: 'přepíná se…',
    today: 'Dnes',
    tomorrow: 'Zítra',
    weekday: 'všední den',
    weekend: 'víkend',
    holiday: 'svátek',
    nt_left: 'zbývá NT',
    total: 'celkem',
    now: 'Teď',
    main_meter: 'Hlavní elektroměr',
    three_phase_section: 'Třífázové okruhy',
    single_phase_section: 'Jednofázové jističe',
    devices: 'zařízení',
    hide: 'skrýt',
    kwh_today: 'kWh dnes',
    turn_on: 'Zapnout',
    turn_off: 'Vypnout',
    confirm_turn_on: 'Opravdu ZAPNOUT okruh „{name}"?',
    confirm_turn_off: 'Opravdu VYPNOUT okruh „{name}"?',
    nt_in: 'NT za',
    save_pct: 'úspora',
    from_schedule: 'podle rozvrhu',
    nt_should_start: 'NT měl začít v {time} (před {mins} min)',
    nt_started_early: 'NT začal dříve — plán {time}',
    nt_should_end: 'NT měl skončit v {time} (před {mins} min)',
    nt_ended_early: 'NT skončil dříve — plán {time}',
    hdo_mismatch: 'neodpovídá rozvrhu',
    schedule_tab: 'Rozvrh',
    costs_tab: 'Náklady',
    period_7d: '7 dní',
    period_month: 'Měsíc',
    cost_estimate_month: 'Odhad do konce měsíce',
    cost_avg_day: 'Průměr {price}/den',
    no_cost_data: 'Zatím žádná data',
  },
};

export function resolveLang(
  config: ElectricityPanelConfig | undefined,
  hass: HomeAssistant | undefined
): EpLang {
  const cfg = config?.language;
  if (cfg === 'en' || cfg === 'cs') return cfg;
  const haLang = hass?.locale?.language ?? '';
  return haLang.startsWith('cs') ? 'cs' : 'en';
}

export function localize(lang: EpLang, key: string, vars?: Record<string, string>): string {
  let str = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v);
  return str;
}
