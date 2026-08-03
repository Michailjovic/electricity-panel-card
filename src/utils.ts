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

/** Build the full-day VT/NT slot list for the schedule timeline & rows.
 *  `showing` true = a future day being previewed (no past/current
 *  highlighting). `fmt` formats a ms timestamp as a locale time label. */
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
 * always authoritative once it covers `t`. The tariff schedule is used only
 * (a) as a fallback for instants before the first recorded history point,
 * and (b) to predict tariff state in the future, where no history can exist
 * yet. If neither history nor schedule is available, fall back to the
 * switch's current live state.
 */
export function isNTAt(
  t: number,
  hdoHistory: HistPoint[] | undefined,
  scheduleDay: TariffDay | undefined,
  midnightBase: number,
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
  if (scheduleDay) {
    return scheduleDay.starts.some((start, i) => {
      const s = slotTimeMs(midnightBase, start);
      return t >= s && t < s + scheduleDay.offsets[i] * 60000;
    });
  }
  return fallbackSwitchOn;
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
