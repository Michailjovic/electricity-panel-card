// English-only (decision 2026-08-12, ROADMAP.md Fáze 4): the cs/en toggle
// was dropped — the card ships one language. Keeping this module (rather
// than inlining strings at each call site) so `_t()` call sites in
// electricity-panel-card.ts didn't need to change, and so template
// interpolation (`{name}`, `{time}`, …) stays in one place.
const STRINGS: Record<string, string> = {
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
  // view: panel (ROADMAP 5.4)
  panel_board: 'Distribution board',
  panel_positions: '{n} positions',
  main_breaker: 'Main breaker',
  busbar_note: 'busbar — flow speed follows consumption',
  panel_hint_pick: 'Tap a module for its detail and graph.',
  panel_hint_compare: 'Tap more modules to line their graphs up on one time axis.',
  shared_axis: 'shared Y axis',
  clear_selection: 'clear selection ({n})',
  devices_behind: 'Devices behind this breaker',
  no_devices: 'No devices listed for this breaker in the config.',
  of_rating: 'of {max} A',
  load_pct: '{pct} % load',
  phases_shared_scale: 'All three graphs share one scale, so they compare directly.',
};

export function localize(key: string, vars?: Record<string, string>): string {
  let str = STRINGS[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v);
  return str;
}
