import type { TariffDay } from './types.js';

// ── Pure HDO/schedule logic ──────────────────────────────────────────────────
//
// Everything in this file is side-effect free: no `this`, no Date.now()/`new
// Date()` without an explicit input, no HA entity access. Time is always
// passed in as a parameter (ms since epoch) so tests can pin any instant,
// including DST transitions and dates before the first history entry.
//
// Fáze 1.1 (ROADMAP.md): extracted out of ElectricityPanelCard so the
// precedence rule "real HDO switch history is always authoritative; the
// tariff schedule is only a fallback before the first history record and a
// predictor of the future" can be pinned down with unit tests before Fáze 2
// (schedule from entity) and Fáze 3 (cost from long-term statistics) change
// what feeds these functions.

export interface HistPoint {
  t: number;
  v: number;
}

export interface DaySlot {
  type: 'nt' | 'vt';
  label: string;
  isPast: boolean;
  isCurrent: boolean;
  pct: number;
  durMins: number;
  durStr: string;
}

export type DayType = 'weekday' | 'weekend' | 'holiday';

/** Wall-clock "HH:MM" on the day starting at `base` — DST-safe
 *  (unlike base + minutes*60000 on 23/25-hour days). */
export function slotTimeMs(base: number, hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/** Midnight of the following day — DST-safe day end. */
export function dayEndMs(base: number): number {
  const d = new Date(base);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Compact duration for schedule rows, e.g. "1h 40m", "1h", "45m". */
export function fmtDur(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
}

/** Today's HDO day-type from day-of-week + holiday flag + optional
 *  workday-sensor state. Sensor `on` is authoritative for "workday" even
 *  outside Mon–Fri; `off` on what would otherwise be a weekday means a
 *  public holiday; sensor unavailable/unknown falls through to plain
 *  day-of-week. */
export function computeDayType(dow: number, isHoliday: boolean, workdaySensorState?: string): DayType {
  if (isHoliday) return 'holiday';
  const isWeekendDay = dow === 0 || dow === 6;
  if (workdaySensorState === 'on') return 'weekday';
  if (workdaySensorState === 'off') return isWeekendDay ? 'weekend' : 'holiday';
  return isWeekendDay ? 'weekend' : 'weekday';
}

/** Tomorrow's day-type — no workday sensor for tomorrow, so pure
 *  day-of-week plus the tomorrow-is-holiday flag. */
export function computeTomorrowDayType(tomorrowDow: number, isHolidayTomorrow: boolean): DayType {
  if (isHolidayTomorrow) return 'holiday';
  return (tomorrowDow === 0 || tomorrowDow === 6) ? 'weekend' : 'weekday';
}

/** For calendar.* holiday sensors: is `probeMs` within [start, end)?
 *  `end` defaults to start + 24h for all-day events with no explicit end. */
export function isWithinHolidayEvent(startIso: string, endIso: string | undefined, probeMs: number): boolean {
  const s = new Date(startIso.replace(' ', 'T')).getTime();
  const e = endIso ? new Date(endIso.replace(' ', 'T')).getTime() : s + 86400000;
  return s <= probeMs && probeMs < e;
}

/** Minutes of NT remaining today across all NT windows, from `now` to each
 *  window's end (clamped to `dayEnd` for midnight-crossing windows). */
export function ntRemainingMins(
  starts: string[],
  offsets: number[],
  base: number,
  dayEnd: number,
  now: number
): number {
  let rem = 0;
  starts.forEach((s, i) => {
    const st = slotTimeMs(base, s);
    const en = Math.min(st + offsets[i] * 60000, dayEnd);
    if (en > st && now < en) rem += (en - Math.max(now, st)) / 60000;
  });
  return rem;
}

/** Same as `ntRemainingMins` but for already-resolved `Window[]` — the
 *  Fáze 2 equivalent used regardless of whether the windows came from a
 *  preset/manual `TariffDay` or a `schedule_entity`. */
export function ntRemainingMinsFromWindows(windows: Window[], dayEnd: number, now: number): number {
  let rem = 0;
  for (const w of windows) {
    const en = Math.min(w.end, dayEnd);
    if (en > w.start && now < en) rem += (en - Math.max(now, w.start)) / 60000;
  }
  return rem;
}

export interface Window {
  start: number;
  end: number;
}

/** NT windows for one schedule day, clamped to `dayEnd` (midnight-crossing
 *  windows) and sorted by start time — unsorted/overlapping raw `starts`
 *  would otherwise produce negative VT gaps downstream. Shared by
 *  `buildFullDaySlots` (Fáze 1.1) and `resolveHdoStatus` (Fáze 1.3) so both
 *  always agree on what the schedule says. */
export function ntWindowsForDay(day: TariffDay, base: number, dayEnd: number): Window[] {
  return day.starts
    .map((start, i) => {
      const s = slotTimeMs(base, start);
      return { start: s, end: Math.min(s + day.offsets[i] * 60000, dayEnd) };
    })
    .filter(w => w.end > w.start && w.start < dayEnd)
    .sort((a, b) => a.start - b.start);
}

/** Build the full-day VT/NT slot list for the schedule timeline & rows from
 *  already-resolved NT windows — shared by `buildFullDaySlots` (preset/manual
 *  schedule, Fáze 1.1) and Fáze 2's `schedule_entity` path, which produces
 *  `Window[]` directly with no day-type/HH:MM step needed. `showing` true =
 *  a future day being previewed (no past/current highlighting). `fmt`
 *  formats a ms timestamp as a locale time label. */
export function buildFullDaySlotsFromWindows(
  ntWindows: Window[],
  base: number,
  dayEnd: number,
  showing: boolean,
  now: number,
  fmt: (ms: number) => string
): DaySlot[] {
  const makeSlot = (
    type: 'nt' | 'vt',
    slotStart: number,
    slotEnd: number,
    durMins: number
  ): DaySlot => {
    const isPast = !showing && now >= slotEnd;
    const isCurrent = !showing && now >= slotStart && now < slotEnd;
    const pct = isCurrent
      ? Math.min(100, ((now - slotStart) / (slotEnd - slotStart)) * 100)
      : isPast ? 100 : 0;
    return {
      type, label: `${fmt(slotStart)}–${fmt(slotEnd)}`,
      isPast, isCurrent, pct, durMins, durStr: fmtDur(durMins),
    };
  };

  const slots: DaySlot[] = [];
  let cursor = base;

  for (const nt of ntWindows) {
    const s = Math.max(nt.start, cursor); // overlap-safe
    if (s >= nt.end) continue;
    if (s > cursor) {
      slots.push(makeSlot('vt', cursor, s, Math.round((s - cursor) / 60000)));
    }
    slots.push(makeSlot('nt', s, nt.end, Math.round((nt.end - s) / 60000)));
    cursor = nt.end;
  }

  if (cursor < dayEnd) {
    slots.push(makeSlot('vt', cursor, dayEnd, Math.round((dayEnd - cursor) / 60000)));
  }

  return slots;
}

/** Build the full-day VT/NT slot list from a preset/manual `TariffDay`
 *  (HH:MM starts + minute offsets). See `buildFullDaySlotsFromWindows` for
 *  the entity-schedule equivalent — both feed the same slot shape. */
export function buildFullDaySlots(
  starts: string[],
  offsets: number[],
  base: number,
  showing: boolean,
  now: number,
  fmt: (ms: number) => string
): DaySlot[] {
  const dayEnd = dayEndMs(base);
  const ntWindows = ntWindowsForDay({ starts, offsets }, base, dayEnd);
  return buildFullDaySlotsFromWindows(ntWindows, base, dayEnd, showing, now, fmt);
}

/**
 * Fáze 1.2 (ROADMAP.md), presentation only: when today's schedule ends with
 * an NT window that runs right up to midnight and tomorrow's schedule opens
 * with a new NT window starting at 00:00, the two are really one continuous
 * NT period — splitting them at the day boundary is a display artifact, not
 * a tariff change. This merges the two into a single trailing slot: the
 * label, duration and progress (`pct`/`isCurrent`/`isPast`) all extend past
 * midnight into tomorrow's portion.
 *
 * Internal per-day computation (`buildFullDaySlots`, cost integration,
 * `isNTAt`) is untouched — this only reshapes the array used for rendering.
 * `slots` must be the output of `buildFullDaySlots` for today (`showing`
 * false); `dayEnd` must be the same value passed to it. Returns `slots`
 * unchanged if there is nothing to merge (last slot isn't NT, or
 * `tomorrowFirstNtDurMins` is falsy).
 */
export function mergeMidnightNt(
  slots: DaySlot[],
  dayEnd: number,
  tomorrowFirstNtDurMins: number | undefined,
  now: number,
  fmt: (ms: number) => string
): DaySlot[] {
  if (!tomorrowFirstNtDurMins || tomorrowFirstNtDurMins <= 0) return slots;
  const last = slots[slots.length - 1];
  if (!last || last.type !== 'nt') return slots;

  const slotStart = dayEnd - last.durMins * 60000;
  const mergedEnd = dayEnd + tomorrowFirstNtDurMins * 60000;
  const durMins = last.durMins + tomorrowFirstNtDurMins;
  const isCurrent = now >= slotStart && now < mergedEnd;
  const isPast = now >= mergedEnd;
  const pct = isCurrent
    ? Math.min(100, ((now - slotStart) / (mergedEnd - slotStart)) * 100)
    : isPast ? 100 : 0;

  const merged: DaySlot = {
    ...last,
    label: `${fmt(slotStart)}–${fmt(mergedEnd)}`,
    durMins,
    durStr: fmtDur(durMins),
    isCurrent,
    isPast,
    pct,
  };
  return [...slots.slice(0, -1), merged];
}

/**
 * Fáze 1.3 (ROADMAP.md): the schedule is a plan; the real HDO switch is
 * always the source of truth for what the bar *displays* (`isNT` here always
 * mirrors the live switch state — never the schedule). `resolveHdoStatus`
 * only classifies how far the switch has drifted from what the schedule
 * expected, so the UI can say so instead of silently disagreeing with itself.
 */
export type HdoStatusKind = 'ok' | 'late_start' | 'early_start' | 'late_end' | 'early_end' | 'mismatch';

export interface HdoStatus {
  /** What the bar shows as NT/VT — always the real switch state. */
  isNT: boolean;
  kind: HdoStatusKind;
  /** The schedule boundary (ms) the message refers to. Absent for 'ok'. */
  boundaryMs?: number;
  /** Whole minutes between `now` and `boundaryMs`. Absent for 'ok'. */
  deltaMins?: number;
  /** Progress-bar anchors: start = switch's real last transition (`switchSince`),
   *  end = the schedule boundary the bar is tracking toward. */
  slotStart: number;
  slotEnd: number;
}

/** Beyond this drift a "late/early by N min" reading is no longer plausible —
 *  it means the schedule/day-type is wrong, not that the switch is running
 *  late. Exact value is a starting point ("přesný práh doladit" — ROADMAP.md);
 *  tune once real HDO drift data is observed. */
export const MISMATCH_THRESHOLD_MINS = 120;

/**
 * Compare the real switch (`switchOn` + `switchSince`, its last transition
 * time) against `windows` (today's scheduled NT windows) at `now`.
 *
 * - Both agree → `ok`; progress tracks from the real transition to the
 *   schedule's boundary for the *current* state (NT window end, or next NT
 *   start while in VT).
 * - Switch VT while schedule says NT (inside a window): if the switch has
 *   been off since before the window started, NT simply hasn't started yet
 *   (`late_start`, before X min). If `switchSince` falls inside the window,
 *   it *was* on and flipped off early (`early_end`).
 * - Switch NT while schedule says VT: if the switch has been on since before
 *   or at the previous window's end, NT is overrunning (`late_end`). If it
 *   flipped on after that (or there's no previous window), NT started ahead
 *   of the next one (`early_start`).
 * - Drift beyond `MISMATCH_THRESHOLD_MINS` is reclassified as `mismatch` —
 *   not a timing delay but a wrong schedule/day-type.
 */
export function resolveHdoStatus(
  now: number,
  switchOn: boolean,
  switchSince: number,
  windows: Window[],
  dayEnd: number
): HdoStatus {
  const current = windows.find(w => now >= w.start && now < w.end);
  const prev = [...windows].reverse().find(w => w.end <= now);
  const next = windows.find(w => w.start > now);
  const scheduleOn = !!current;

  if (switchOn === scheduleOn) {
    const slotEnd = switchOn ? current!.end : (next ? next.start : dayEnd);
    return { isNT: switchOn, kind: 'ok', slotStart: switchSince, slotEnd };
  }

  let kind: HdoStatusKind;
  let boundaryMs: number;
  let slotEnd: number;

  if (!switchOn && scheduleOn) {
    // Switch VT, schedule NT (inside `current`).
    if (switchSince <= current!.start) {
      kind = 'late_start'; boundaryMs = current!.start;
    } else {
      kind = 'early_end'; boundaryMs = current!.end;
    }
    slotEnd = current!.end;
  } else {
    // Switch NT, schedule VT.
    if (prev && switchSince <= prev.end) {
      kind = 'late_end'; boundaryMs = prev.end;
      slotEnd = next ? next.start : prev.end;
    } else {
      kind = 'early_start'; boundaryMs = next ? next.start : (prev ? prev.end : dayEnd);
      slotEnd = next ? next.end : dayEnd;
    }
  }

  const deltaMins = Math.round(Math.abs(now - boundaryMs) / 60000);
  if (deltaMins > MISMATCH_THRESHOLD_MINS) kind = 'mismatch';

  return { isNT: switchOn, kind, boundaryMs, deltaMins, slotStart: switchSince, slotEnd };
}

/**
 * Precedence rule (Fáze 1.1, zafixováno): the real HDO switch history is
 * always authoritative once it covers `t`. The schedule (`windows` — NT
 * windows for the day containing `t`, from whichever source is active:
 * schedule_entity, preset or manual — see Fáze 2) is used only (a) as a
 * fallback for instants before the first recorded history point, and (b) to
 * predict tariff state in the future, where no history can exist yet. If
 * neither history nor schedule is available, fall back to the switch's
 * current live state.
 */
export function isNTAt(
  t: number,
  hdoHistory: HistPoint[] | undefined,
  windows: Window[] | undefined,
  fallbackSwitchOn: boolean
): boolean {
  if (hdoHistory && hdoHistory.length > 0 && t >= hdoHistory[0].t) {
    let state = hdoHistory[0].v;
    for (const pt of hdoHistory) {
      if (pt.t <= t) state = pt.v;
      else break;
    }
    return state > 0.5; // 1 = on = NT
  }
  if (windows) {
    return windows.some(w => t >= w.start && t < w.end);
  }
  return fallbackSwitchOn;
}

/**
 * Fáze 2 (ROADMAP.md): parse a `schedule_entity`'s `schedule` attribute into
 * NT windows for one calendar day `[dayStart, dayEnd)`. Targets the shape
 * published by the `ha_cez_distribuce` integration's `sensor.cez_hdo_schedule_*`
 * (verified against its source, 2026-08):
 *
 *   attributes.schedule = [
 *     { start: "2026-01-27T00:00:00+01:00", end: "...", tariff: "NT", value: 1 },
 *     { start: "...", end: "...", tariff: "VT", value: 0 },
 *     ...
 *   ]
 *
 * Tolerant of a few reasonable key aliases so other integrations converging
 * on the same rough shape (array of dated intervals with a low/high marker)
 * have a chance of working without changes:
 *   - time bounds: start/from/begin, end/to/until
 *   - NT marker: tariff/type/rate case-insensitively matching "NT"/"LOW"/
 *     "LOW_TARIFF" (or similar), OR a truthy value/is_nt/is_low/low field
 *
 * Unlike the preset/manual path there is no day-type step — the entity
 * already resolved that (its dates are absolute) — so this returns `Window[]`
 * directly, ready for `buildFullDaySlotsFromWindows`/`resolveHdoStatus`/`isNTAt`.
 *
 * Returns `undefined` when `attributes` has no usable `schedule` array at all
 * (signals callers to fall back to the next source in the priority chain:
 * schedule_entity → tariff_preset → manual schedule). Returns `[]` when the
 * array exists but nothing falls inside the requested day (a real "no NT
 * today" answer, not a "try the next source" one).
 */
export function parseScheduleEntity(
  attributes: Record<string, unknown> | undefined,
  dayStart: number,
  dayEnd: number
): Window[] | undefined {
  const raw = attributes?.['schedule'];
  if (!Array.isArray(raw)) return undefined;

  const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
    for (const k of keys) if (o[k] !== undefined) return o[k];
    return undefined;
  };
  const isNtEntry = (o: Record<string, unknown>): boolean => {
    const tariff = pick(o, ['tariff', 'type', 'rate']);
    if (typeof tariff === 'string') {
      const t = tariff.trim().toUpperCase();
      if (t === 'NT' || t.includes('LOW')) return true;
      if (t === 'VT' || t.includes('HIGH')) return false;
    }
    const value = pick(o, ['value', 'is_nt', 'is_low', 'low']);
    if (typeof value === 'number') return value > 0.5;
    if (typeof value === 'boolean') return value;
    return false;
  };

  const windows: Window[] = [];
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const o = entry as Record<string, unknown>;
    if (!isNtEntry(o)) continue;
    const startRaw = pick(o, ['start', 'from', 'begin']);
    const endRaw = pick(o, ['end', 'to', 'until']);
    if (typeof startRaw !== 'string' || typeof endRaw !== 'string') continue;
    const s = new Date(startRaw).getTime();
    const e = new Date(endRaw).getTime();
    if (isNaN(s) || isNaN(e) || e <= s) continue;
    // Clip to the requested day — entity schedules typically span several days.
    const start = Math.max(s, dayStart);
    const end = Math.min(e, dayEnd);
    if (end > start) windows.push({ start, end });
  }

  return windows.sort((a, b) => a.start - b.start);
}

/** Integrate one or more power-history series (W) into NT/VT watt-hour
 *  buckets. Each series is treated as an independent trapezoidal
 *  integration (correct for multi-phase circuits where each phase has its
 *  own history entity) and summed. Negative power (PV export) is clamped to
 *  zero so it can never produce negative cost. */
export function accumulateTariffWh(
  seriesList: Array<HistPoint[] | undefined>,
  isNTAtFn: (t: number) => boolean
): { ntWh: number; vtWh: number; hasData: boolean } {
  let ntWh = 0, vtWh = 0, hasData = false;
  for (const pts of seriesList) {
    if (!pts || pts.length < 2) continue;
    hasData = true;
    for (let i = 1; i < pts.length; i++) {
      const dtMs = pts[i].t - pts[i - 1].t;
      const avgW = Math.max(0, (pts[i].v + pts[i - 1].v) / 2);
      const wh = avgW * (dtMs / 3_600_000);
      const midT = (pts[i].t + pts[i - 1].t) / 2;
      if (isNTAtFn(midT)) ntWh += wh; else vtWh += wh;
    }
  }
  return { ntWh, vtWh, hasData };
}

/** NT/VT watt-hours + prices → cost in the configured currency's base unit. */
export function calcCost(ntWh: number, vtWh: number, ntPrice: number, vtPrice: number): number {
  return (ntWh / 1000) * ntPrice + (vtWh / 1000) * vtPrice;
}

/**
 * Fáze 3.2 (ROADMAP.md): one `recorder/statistics_during_period` bucket for
 * a power entity — `mean` is the average W over `[start, end)`, already
 * unit-normalized to W like `HistPoint.v`. Unlike `HistPoint`, statistics
 * responses don't carry an explicit `end` per row — callers derive it from
 * the requested period (`start + periodMs`) before building this shape.
 */
export interface StatBucket {
  start: number;
  end: number;
  mean: number;
}

/**
 * Exact NT fraction of an arbitrary `[start, end)` interval — the piece that
 * lets `accumulateTariffWhFromStats` split a coarse (5-minute/hourly)
 * statistics bucket across a tariff boundary that falls inside it, instead of
 * a single midpoint test misattributing the whole bucket. Splits the interval
 * at every point where `isNTAt` could change state (switch-history
 * transitions and window start/end times) and re-tests each resulting
 * sub-segment with `isNTAt` itself — so this always agrees with `isNTAt`'s
 * precedence rule (switch history authoritative, windows fallback, live
 * state last resort) instead of duplicating it.
 */
export function ntFractionOfInterval(
  start: number,
  end: number,
  hdoHistory: HistPoint[] | undefined,
  windows: Window[] | undefined,
  fallbackSwitchOn: boolean
): number {
  const total = end - start;
  if (total <= 0) return 0;

  const breaks = new Set<number>([start, end]);
  if (hdoHistory) {
    for (const p of hdoHistory) if (p.t > start && p.t < end) breaks.add(p.t);
  }
  if (windows) {
    for (const w of windows) {
      if (w.start > start && w.start < end) breaks.add(w.start);
      if (w.end > start && w.end < end) breaks.add(w.end);
    }
  }
  const pts = [...breaks].sort((a, b) => a - b);

  let ntMs = 0;
  for (let i = 1; i < pts.length; i++) {
    const segStart = pts[i - 1], segEnd = pts[i];
    const mid = (segStart + segEnd) / 2;
    if (isNTAt(mid, hdoHistory, windows, fallbackSwitchOn)) ntMs += segEnd - segStart;
  }
  return ntMs / total;
}

/**
 * Fáze 3.2 (ROADMAP.md): the `recorder/statistics_during_period` equivalent
 * of `accumulateTariffWh` — buckets carry a pre-averaged `mean` W instead of
 * instantaneous samples, so there's no trapezoidal step, just `mean *
 * duration`. Each bucket is split across the NT/VT boundary proportionally
 * via `ntFractionFn` rather than a single midpoint test, since a hardware
 * HDO switch can flip mid-bucket on coarser (hourly) statistics. Negative
 * power (PV export) is clamped to zero, same as `accumulateTariffWh`.
 */
export function accumulateTariffWhFromStats(
  bucketsList: Array<StatBucket[] | undefined>,
  ntFractionFn: (start: number, end: number) => number
): { ntWh: number; vtWh: number; hasData: boolean } {
  let ntWh = 0, vtWh = 0, hasData = false;
  for (const buckets of bucketsList) {
    if (!buckets || buckets.length === 0) continue;
    hasData = true;
    for (const b of buckets) {
      const wh = Math.max(0, b.mean) * ((b.end - b.start) / 3_600_000);
      const ntFrac = ntFractionFn(b.start, b.end);
      ntWh += wh * ntFrac;
      vtWh += wh * (1 - ntFrac);
    }
  }
  return { ntWh, vtWh, hasData };
}

/**
 * Fáze 3.3 (ROADMAP.md): the Náklady tab's "estimated month total" line —
 * plain linear extrapolation from the month-to-date average
 * (`mtdCost / mtdDays * daysInMonth`). Deliberately not weighted by
 * weekday/weekend or the HDO schedule's NT/VT ratio — the honest simple
 * estimate ("if the rest of the month looks like it has so far"), not a
 * prediction. `mtdDays` is meant to be fractional (elapsed time / 86 400 000,
 * not a whole-day count) so the estimate doesn't jump in daily steps.
 */
export function estimateMonthCost(mtdCost: number, mtdDays: number, daysInMonth: number): number {
  if (mtdDays <= 0) return 0;
  return (mtdCost / mtdDays) * daysInMonth;
}

/**
 * Post-3.3 (ROADMAP.md — grew out of a question about how HA's Energy
 * dashboard stores its data): one `recorder/statistics_during_period`
 * `'change'` bucket for a true energy (kWh) sensor — `wh` is the exact
 * energy consumed during `[start, end)`, already converted to Wh. Unlike
 * `StatBucket.mean` (an averaged instantaneous power reading multiplied by
 * bucket duration — an approximation), this is a direct measurement: HA's
 * statistics engine derives it from the sensor's own cumulative counter and
 * handles meter resets (`state_class: total`/`total_increasing`) itself, so
 * there's nothing to reconstruct here.
 */
export interface EnergyBucket {
  start: number;
  end: number;
  wh: number;
}

/**
 * Energy-sensor counterpart to `accumulateTariffWhFromStats` — no
 * `mean * duration` step since `wh` is already the bucket's real
 * consumption. Negative values (a counter glitch HA's reset-handling didn't
 * catch) are clamped to zero, same defensive stance as the power-based
 * accumulators.
 */
export function accumulateTariffWhFromEnergyBuckets(
  bucketsList: Array<EnergyBucket[] | undefined>,
  ntFractionFn: (start: number, end: number) => number
): { ntWh: number; vtWh: number; hasData: boolean } {
  let ntWh = 0, vtWh = 0, hasData = false;
  for (const buckets of bucketsList) {
    if (!buckets || buckets.length === 0) continue;
    hasData = true;
    for (const b of buckets) {
      const wh = Math.max(0, b.wh);
      const ntFrac = ntFractionFn(b.start, b.end);
      ntWh += wh * ntFrac;
      vtWh += wh * (1 - ntFrac);
    }
  }
  return { ntWh, vtWh, hasData };
}

// ── view: panel — DIN rail layout (ROADMAP 5.4) ─────────────────────────────

/** One module on the rail. `width` is in module positions, as in a real board. */
export interface RailModule {
  /** Circuit id, or the synthetic id of the main breaker */
  id: string;
  width: number;
}

/**
 * Natural-order comparison of two position labels ("01" < "08" < "10" < "V1").
 *
 * A plain string sort puts "10" before "8", and a plain numeric sort throws
 * away labels like "V1" that real boards use for grouped or auxiliary
 * positions. So: leading digits compare numerically, the rest compares as
 * text, and anything without a position sorts last (keeping config order
 * among themselves, since Array.prototype.sort is stable).
 */
export function comparePosition(a?: string, b?: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const ma = /^(\d+)(.*)$/.exec(a.trim());
  const mb = /^(\d+)(.*)$/.exec(b.trim());
  if (ma && mb) {
    const d = parseInt(ma[1], 10) - parseInt(mb[1], 10);
    return d !== 0 ? d : ma[2].localeCompare(mb[2]);
  }
  // Numbered positions come before lettered ones (01…15, then V1, K1).
  if (ma) return -1;
  if (mb) return 1;
  return a.localeCompare(b);
}

/**
 * Split modules into rail rows of at most `railSize` module widths.
 *
 * A module never straddles two rows — a 3-phase breaker that would overflow
 * moves to the next rail whole, exactly like the physical thing. A module
 * wider than `railSize` still gets its own row rather than disappearing.
 */
export function buildRails<T extends RailModule>(mods: T[], railSize: number): T[][] {
  const size = Math.max(1, Math.floor(railSize));
  const rails: T[][] = [];
  let row: T[] = [];
  let used = 0;
  for (const m of mods) {
    const w = Math.max(1, Math.floor(m.width));
    if (row.length && used + w > size) {
      rails.push(row);
      row = [];
      used = 0;
    }
    row.push(m);
    used += w;
  }
  if (row.length) rails.push(row);
  return rails;
}

/**
 * Load as a percentage of the breaker rating, clamped to 0–100.
 *
 * Prefers a measured current; falls back to deriving it from power, which is
 * why the caller passes the voltage it actually read rather than assuming 230.
 */
export function loadPercent(
  amps: number,
  watts: number,
  maxAmps: number,
  volts = 230,
): number {
  if (!(maxAmps > 0)) return 0;
  const a = amps > 0 ? amps : (volts > 0 ? watts / volts : 0);
  return Math.min(100, Math.max(0, (a / maxAmps) * 100));
}

/**
 * Per-phase share of a total, used by the panel view's phase columns.
 * Returns percentages that sum to 100 (or all zeros when there is no load).
 */
export function phaseShares(l1: number, l2: number, l3: number): [number, number, number] {
  const total = l1 + l2 + l3;
  if (!(total > 0)) return [0, 0, 0];
  return [(l1 / total) * 100, (l2 / total) * 100, (l3 / total) * 100];
}
