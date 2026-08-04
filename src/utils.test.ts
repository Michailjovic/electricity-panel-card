import { describe, it, expect } from 'vitest';
import {
  slotTimeMs,
  dayEndMs,
  fmtMins,
  fmtDur,
  computeDayType,
  computeTomorrowDayType,
  isWithinHolidayEvent,
  ntRemainingMins,
  buildFullDaySlots,
  buildFullDaySlotsFromWindows,
  mergeMidnightNt,
  ntWindowsForDay,
  resolveHdoStatus,
  MISMATCH_THRESHOLD_MINS,
  isNTAt,
  parseScheduleEntity,
  accumulateTariffWh,
  calcCost,
  ntFractionOfInterval,
  accumulateTariffWhFromStats,
  estimateMonthCost,
  type HistPoint,
  type Window,
  type StatBucket,
} from './utils.js';
import type { TariffDay } from './types.js';

// Fixed timezone so DST-transition tests are deterministic regardless of the
// machine/CI runner's local zone. Europe/Prague matches where this card is
// actually used (PRE HDO schedules).
process.env.TZ = 'Europe/Prague';

const fmtHM = (ms: number) => new Date(ms).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

describe('slotTimeMs / dayEndMs — DST safety', () => {
  it('dayEndMs returns next midnight on a normal 24h day', () => {
    const base = new Date(2026, 5, 15, 0, 0, 0, 0).getTime(); // 2026-06-15 (no DST transition)
    const end = dayEndMs(base);
    expect(end - base).toBe(24 * 3600_000);
    expect(new Date(end).getHours()).toBe(0);
  });

  it('dayEndMs returns next midnight on the 23h spring-forward day (2026-03-29, CZ)', () => {
    const base = new Date(2026, 2, 29, 0, 0, 0, 0).getTime(); // 2026-03-29 00:00 local
    const end = dayEndMs(base);
    // Clocks jump 02:00 -> 03:00, so the wall-clock day is only 23h long
    expect(end - base).toBe(23 * 3600_000);
    expect(new Date(end).getDate()).toBe(30);
    expect(new Date(end).getHours()).toBe(0);
  });

  it('dayEndMs returns next midnight on the 25h fall-back day (2026-10-25, CZ)', () => {
    const base = new Date(2026, 9, 25, 0, 0, 0, 0).getTime(); // 2026-10-25 00:00 local
    const end = dayEndMs(base);
    expect(end - base).toBe(25 * 3600_000);
    expect(new Date(end).getDate()).toBe(26);
    expect(new Date(end).getHours()).toBe(0);
  });

  it('slotTimeMs maps HH:MM to the correct wall-clock instant across the spring-forward gap', () => {
    const base = new Date(2026, 2, 29, 0, 0, 0, 0).getTime();
    const at0140 = slotTimeMs(base, '01:40');
    const at0500 = slotTimeMs(base, '05:00');
    // 01:40 is before the 02:00->03:00 jump; 05:00 is after it.
    // Wall-clock gap between them is 3h20m, but elapsed real time is only 2h20m.
    expect(at0500 - at0140).toBe((3 * 60 + 20 - 60) * 60_000);
    expect(new Date(at0140).getHours()).toBe(1);
    expect(new Date(at0500).getHours()).toBe(5);
  });
});

describe('fmtMins / fmtDur', () => {
  it('formats minutes under an hour without the hour part', () => {
    expect(fmtMins(0)).toBe('0m');
    expect(fmtMins(45)).toBe('45m');
  });

  it('formats minutes over an hour with both parts', () => {
    expect(fmtMins(90)).toBe('1h 30m');
    expect(fmtMins(125.9)).toBe('2h 5m');
  });

  it('fmtDur omits the minutes part on an exact hour', () => {
    expect(fmtDur(60)).toBe('1h');
    expect(fmtDur(100)).toBe('1h 40m');
    expect(fmtDur(45)).toBe('45m');
  });
});

describe('computeDayType', () => {
  const MON = 1, SAT = 6, SUN = 0;

  it('holiday flag wins over everything else', () => {
    expect(computeDayType(MON, true, 'on')).toBe('holiday');
    expect(computeDayType(SAT, true, undefined)).toBe('holiday');
  });

  it('workday sensor "on" is authoritative for weekday, even on a weekend day-of-week', () => {
    expect(computeDayType(MON, false, 'on')).toBe('weekday');
    expect(computeDayType(SAT, false, 'on')).toBe('weekday');
  });

  it('workday sensor "off" on what would be a weekday means a public holiday', () => {
    expect(computeDayType(MON, false, 'off')).toBe('holiday');
  });

  it('workday sensor "off" on a weekend day-of-week stays weekend', () => {
    expect(computeDayType(SAT, false, 'off')).toBe('weekend');
    expect(computeDayType(SUN, false, 'off')).toBe('weekend');
  });

  it('falls through to plain day-of-week when the sensor is unavailable/unset', () => {
    expect(computeDayType(MON, false, undefined)).toBe('weekday');
    expect(computeDayType(SAT, false, 'unavailable')).toBe('weekend');
  });
});

describe('computeTomorrowDayType', () => {
  it('holiday-tomorrow flag wins', () => {
    expect(computeTomorrowDayType(1, true)).toBe('holiday');
  });
  it('otherwise plain day-of-week', () => {
    expect(computeTomorrowDayType(0, false)).toBe('weekend');
    expect(computeTomorrowDayType(6, false)).toBe('weekend');
    expect(computeTomorrowDayType(3, false)).toBe('weekday');
  });
});

describe('isWithinHolidayEvent', () => {
  it('probe inside [start,end) is a match', () => {
    const probe = new Date(2026, 3, 1, 12, 0, 0).getTime();
    expect(isWithinHolidayEvent('2026-04-01 00:00:00', '2026-04-02 00:00:00', probe)).toBe(true);
  });
  it('probe outside the range is not a match', () => {
    const probe = new Date(2026, 3, 2, 1, 0, 0).getTime();
    expect(isWithinHolidayEvent('2026-04-01 00:00:00', '2026-04-02 00:00:00', probe)).toBe(false);
  });
  it('defaults end to start+24h when not given', () => {
    const start = '2026-04-01 00:00:00';
    const probeIn = new Date(2026, 3, 1, 23, 0, 0).getTime();
    const probeOut = new Date(2026, 3, 2, 1, 0, 0).getTime();
    expect(isWithinHolidayEvent(start, undefined, probeIn)).toBe(true);
    expect(isWithinHolidayEvent(start, undefined, probeOut)).toBe(false);
  });
});

describe('ntRemainingMins', () => {
  it('sums remaining minutes across future and current windows, ignoring past ones', () => {
    const base = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
    const dayEnd = dayEndMs(base);
    const starts = ['00:00', '10:00', '20:00'];
    const offsets = [60, 60, 120]; // 00:00-01:00, 10:00-11:00, 20:00-22:00
    const now = new Date(2026, 5, 15, 10, 30, 0, 0).getTime(); // mid-way through the 2nd window
    const rem = ntRemainingMins(starts, offsets, base, dayEnd, now);
    // 1st window fully past (0), 2nd half remaining (30 min), 3rd fully ahead (120 min)
    expect(rem).toBeCloseTo(150, 5);
  });

  it('clamps a midnight-crossing window to day end', () => {
    const base = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
    const dayEnd = dayEndMs(base);
    const now = new Date(2026, 5, 15, 23, 30, 0, 0).getTime();
    // Window starts 23:30, requests 90 min but only 30 fit before midnight
    const rem = ntRemainingMins(['23:30'], [90], base, dayEnd, now);
    expect(rem).toBeCloseTo(30, 5);
  });
});

describe('buildFullDaySlots', () => {
  const base = new Date(2026, 5, 15, 0, 0, 0, 0).getTime(); // ordinary 24h day

  it('fills VT gaps around NT windows and totals a full 24h/1440 minutes', () => {
    const starts = ['01:00', '14:00'];
    const offsets = [180, 120]; // 01:00-04:00, 14:00-16:00
    const slots = buildFullDaySlots(starts, offsets, base, true, base, fmtHM);
    const total = slots.reduce((s, sl) => s + sl.durMins, 0);
    expect(total).toBe(1440);
    expect(slots.map(s => s.type)).toEqual(['vt', 'nt', 'vt', 'nt', 'vt']);
  });

  it('sorts unsorted start times before merging, matching the sorted-input result', () => {
    const sorted = buildFullDaySlots(['01:00', '14:00'], [180, 120], base, true, base, fmtHM);
    const unsorted = buildFullDaySlots(['14:00', '01:00'], [120, 180], base, true, base, fmtHM);
    expect(unsorted.map(s => [s.type, s.durMins])).toEqual(sorted.map(s => [s.type, s.durMins]));
  });

  it('clamps an NT window that crosses midnight to the day end', () => {
    const slots = buildFullDaySlots(['23:00'], [180], base, true, base, fmtHM); // would end 02:00 next day
    const nt = slots.find(s => s.type === 'nt')!;
    expect(nt.durMins).toBe(60); // only 23:00-24:00 fits in this calendar day
    const total = slots.reduce((s, sl) => s + sl.durMins, 0);
    expect(total).toBe(1440);
  });

  it('totals 1380 minutes (23h) on the DST spring-forward day', () => {
    const dstBase = new Date(2026, 2, 29, 0, 0, 0, 0).getTime();
    const slots = buildFullDaySlots(['01:00', '14:00'], [60, 60], dstBase, true, dstBase, fmtHM);
    const total = slots.reduce((s, sl) => s + sl.durMins, 0);
    expect(total).toBe(1380);
  });

  it('marks the slot containing `now` as current with a proportional pct', () => {
    const now = new Date(2026, 5, 15, 2, 0, 0, 0).getTime(); // 2h into a 01:00-04:00 NT window
    const slots = buildFullDaySlots(['01:00'], [180], base, false, now, fmtHM);
    const nt = slots.find(s => s.type === 'nt')!;
    expect(nt.isCurrent).toBe(true);
    expect(nt.pct).toBeCloseTo((60 / 180) * 100, 5);
  });

  it('showing=true (tomorrow preview) never marks past/current, regardless of `now`', () => {
    const now = new Date(2026, 5, 15, 2, 0, 0, 0).getTime();
    const slots = buildFullDaySlots(['01:00'], [180], base, true, now, fmtHM);
    expect(slots.every(s => !s.isPast && !s.isCurrent)).toBe(true);
  });

  it('buildFullDaySlotsFromWindows matches buildFullDaySlots given the same windows (Fáze 2 refactor)', () => {
    const now = new Date(2026, 5, 15, 2, 0, 0, 0).getTime();
    const starts = ['01:00', '14:00'], offsets = [180, 120];
    const fromDay = buildFullDaySlots(starts, offsets, base, false, now, fmtHM);
    const windows = ntWindowsForDay({ starts, offsets }, base, dayEndMs(base));
    const fromWindows = buildFullDaySlotsFromWindows(windows, base, dayEndMs(base), false, now, fmtHM);
    expect(fromWindows).toEqual(fromDay);
  });
});

describe('mergeMidnightNt (Fáze 1.2)', () => {
  const base = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
  const dEnd = dayEndMs(base);

  it('extends the last NT slot into tomorrow when it ends at midnight and tomorrow starts NT at 00:00', () => {
    // Today: NT 22:00-24:00 (120 min). Tomorrow: NT 00:00-01:40 (100 min).
    const now = new Date(2026, 5, 15, 23, 0, 0, 0).getTime();
    const slots = buildFullDaySlots(['22:00'], [120], base, false, now, fmtHM);
    const merged = mergeMidnightNt(slots, dEnd, 100, now, fmtHM);
    const last = merged[merged.length - 1];
    expect(last.type).toBe('nt');
    expect(last.durMins).toBe(220);
    expect(last.durStr).toBe('3h 40m');
    expect(last.isCurrent).toBe(true);
    // 1h into a 3h40m window
    expect(last.pct).toBeCloseTo((60 / 220) * 100, 5);
  });

  it('marks the merged slot past once `now` is beyond tomorrow\'s portion', () => {
    const slots = buildFullDaySlots(['22:00'], [120], base, false, new Date(2026, 5, 15, 23, 0, 0, 0).getTime(), fmtHM);
    const now = new Date(2026, 5, 16, 2, 0, 0, 0).getTime(); // past the merged 01:40 end
    const merged = mergeMidnightNt(slots, dEnd, 100, now, fmtHM);
    const last = merged[merged.length - 1];
    expect(last.isPast).toBe(true);
    expect(last.isCurrent).toBe(false);
    expect(last.pct).toBe(100);
  });

  it('does nothing when the last slot is VT (no NT window touching midnight)', () => {
    const now = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();
    const slots = buildFullDaySlots(['01:00'], [60], base, false, now, fmtHM); // NT 01-02, then VT to midnight
    const merged = mergeMidnightNt(slots, dEnd, 100, now, fmtHM);
    expect(merged).toEqual(slots);
  });

  it('does nothing when tomorrow has no NT window starting at 00:00', () => {
    const now = new Date(2026, 5, 15, 23, 0, 0, 0).getTime();
    const slots = buildFullDaySlots(['22:00'], [120], base, false, now, fmtHM);
    expect(mergeMidnightNt(slots, dEnd, undefined, now, fmtHM)).toEqual(slots);
    expect(mergeMidnightNt(slots, dEnd, 0, now, fmtHM)).toEqual(slots);
  });

  it('only reshapes the trailing slot — earlier slots are untouched', () => {
    const now = new Date(2026, 5, 15, 23, 0, 0, 0).getTime();
    const slots = buildFullDaySlots(['06:00', '22:00'], [60, 120], base, false, now, fmtHM);
    const merged = mergeMidnightNt(slots, dEnd, 100, now, fmtHM);
    expect(merged.slice(0, -1)).toEqual(slots.slice(0, -1));
  });
});

describe('ntWindowsForDay', () => {
  const base = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
  const dEnd = dayEndMs(base);

  it('clamps, filters and sorts windows the same way buildFullDaySlots does', () => {
    const day: TariffDay = { starts: ['14:00', '01:00'], offsets: [120, 180] };
    const windows = ntWindowsForDay(day, base, dEnd);
    expect(windows).toEqual([
      { start: slotTimeMs(base, '01:00'), end: slotTimeMs(base, '04:00') },
      { start: slotTimeMs(base, '14:00'), end: slotTimeMs(base, '16:00') },
    ]);
  });

  it('clamps a midnight-crossing window to day end', () => {
    const day: TariffDay = { starts: ['23:00'], offsets: [180] };
    const windows = ntWindowsForDay(day, base, dEnd);
    expect(windows).toEqual([{ start: slotTimeMs(base, '23:00'), end: dEnd }]);
  });
});

describe('resolveHdoStatus — switch × schedule mismatch (Fáze 1.3, zafixováno)', () => {
  const base = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
  const dEnd = dayEndMs(base);
  const w1: Window = { start: slotTimeMs(base, '01:00'), end: slotTimeMs(base, '04:00') };
  const w2: Window = { start: slotTimeMs(base, '22:00'), end: dEnd };
  const windows: Window[] = [w1, w2];
  const t = (hm: string) => slotTimeMs(base, hm);

  it('ok — switch and schedule agree on NT: progress tracks switchSince → window end', () => {
    const switchSince = t('01:00');
    const now = t('02:00');
    const s = resolveHdoStatus(now, true, switchSince, windows, dEnd);
    expect(s).toMatchObject({ isNT: true, kind: 'ok', slotStart: switchSince, slotEnd: w1.end });
  });

  it('ok — switch and schedule agree on VT: progress tracks switchSince → next NT start', () => {
    const switchSince = t('04:00'); // switch flipped off when w1 ended
    const now = t('10:00');
    const s = resolveHdoStatus(now, false, switchSince, windows, dEnd);
    expect(s).toMatchObject({ isNT: false, kind: 'ok', slotStart: switchSince, slotEnd: w2.start });
  });

  it('late_start — switch VT inside a scheduled NT window, never turned on: NT overdue', () => {
    const switchSince = t('00:30'); // off since before the window even started
    const now = t('02:00');
    const s = resolveHdoStatus(now, false, switchSince, windows, dEnd);
    expect(s).toMatchObject({ isNT: false, kind: 'late_start', boundaryMs: w1.start, deltaMins: 60, slotEnd: w1.end });
  });

  it('early_end — switch VT inside a scheduled NT window, but flipped off mid-window', () => {
    const switchSince = t('02:00'); // was on 01:00-02:00, then off — window still runs to 04:00
    const now = t('02:30'); // within threshold of the 04:00 planned end
    const s = resolveHdoStatus(now, false, switchSince, windows, dEnd);
    expect(s).toMatchObject({ isNT: false, kind: 'early_end', boundaryMs: w1.end, slotEnd: w1.end });
  });

  it('late_end — switch NT past the scheduled window end, never turned off: NT overrunning', () => {
    const switchSince = t('03:00'); // turned on inside w1, before its 04:00 end
    const now = t('05:00'); // w1 has ended per schedule; switch still on
    const s = resolveHdoStatus(now, true, switchSince, windows, dEnd);
    expect(s).toMatchObject({ isNT: true, kind: 'late_end', boundaryMs: w1.end, deltaMins: 60, slotEnd: w2.start });
  });

  it('early_start — switch NT ahead of the next scheduled window, off since the previous one ended', () => {
    const switchSince = t('19:00'); // flipped on well after w1 ended (04:00), ahead of w2 (22:00)
    const now = t('20:00');
    const s = resolveHdoStatus(now, true, switchSince, windows, dEnd);
    expect(s).toMatchObject({ isNT: true, kind: 'early_start', boundaryMs: w2.start, slotEnd: w2.end });
  });

  it('threshold: exactly 120 min drift stays a timing mismatch, not a schedule mismatch', () => {
    const switchSince = t('00:30');
    const now = t('03:00'); // 120 min after w1.start (01:00)
    const s = resolveHdoStatus(now, false, switchSince, windows, dEnd);
    expect(s.kind).toBe('late_start');
    expect(s.deltaMins).toBe(MISMATCH_THRESHOLD_MINS);
  });

  it('threshold: 121+ min drift is reclassified as a schedule mismatch', () => {
    const switchSince = t('00:30');
    const now = t('03:01'); // 121 min after w1.start
    const s = resolveHdoStatus(now, false, switchSince, windows, dEnd);
    expect(s.kind).toBe('mismatch');
    expect(s.deltaMins).toBe(MISMATCH_THRESHOLD_MINS + 1);
  });

  it('late_end falls back to the overrun window\'s own end when there is no next window', () => {
    const only: Window[] = [w1];
    const switchSince = t('03:00');
    const now = t('05:00');
    const s = resolveHdoStatus(now, true, switchSince, only, dEnd);
    expect(s).toMatchObject({ kind: 'late_end', boundaryMs: w1.end, slotEnd: w1.end });
  });

  it('with no windows at all: matching VT is ok; NT has nothing to anchor to and reads as a schedule mismatch', () => {
    const now = t('12:00');
    const okStatus = resolveHdoStatus(now, false, t('00:00'), [], dEnd);
    expect(okStatus).toMatchObject({ kind: 'ok', slotEnd: dEnd });

    // No prev/next window to compare against — falls back to day end, which is
    // far enough from `now` to clear the mismatch threshold on its own.
    const anomalyStatus = resolveHdoStatus(now, true, t('11:00'), [], dEnd);
    expect(anomalyStatus).toMatchObject({ kind: 'mismatch', boundaryMs: dEnd, slotEnd: dEnd });
  });
});

describe('isNTAt — source precedence (Fáze 1.1, zafixováno; Fáze 2: windows are source-agnostic)', () => {
  const midnight = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
  const scheduleDay: TariffDay = { starts: ['01:00', '14:00'], offsets: [180, 120] }; // NT 01-04, 14-16
  const windows = ntWindowsForDay(scheduleDay, midnight, dayEndMs(midnight));

  it('with no history: schedule alone decides — inside a window is NT', () => {
    const t = new Date(2026, 5, 15, 2, 0, 0, 0).getTime();
    expect(isNTAt(t, undefined, windows, false)).toBe(true);
  });

  it('with no history: outside any window is VT', () => {
    const t = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    expect(isNTAt(t, undefined, windows, false)).toBe(false);
  });

  it('before the first history entry: schedule is authoritative even if history exists later', () => {
    const history: HistPoint[] = [
      { t: new Date(2026, 5, 15, 5, 0, 0, 0).getTime(), v: 0 }, // history starts at 05:00, says VT
    ];
    const t = new Date(2026, 5, 15, 2, 0, 0, 0).getTime(); // 02:00 — before first entry, inside NT window
    expect(isNTAt(t, history, windows, false)).toBe(true);
  });

  it('once history covers the instant, the real switch overrides the schedule (switch says VT, schedule says NT)', () => {
    const history: HistPoint[] = [
      { t: new Date(2026, 5, 15, 0, 0, 0, 0).getTime(), v: 0 }, // VT from midnight
    ];
    const t = new Date(2026, 5, 15, 2, 0, 0, 0).getTime(); // inside the 01-04 NT window per schedule
    expect(isNTAt(t, history, windows, false)).toBe(false);
  });

  it('once history covers the instant, the real switch overrides the schedule (switch says NT, schedule says VT)', () => {
    const history: HistPoint[] = [
      { t: new Date(2026, 5, 15, 0, 0, 0, 0).getTime(), v: 1 }, // NT from midnight
    ];
    const t = new Date(2026, 5, 15, 10, 0, 0, 0).getTime(); // outside any schedule window
    expect(isNTAt(t, history, windows, false)).toBe(true);
  });

  it('steps to the next recorded state exactly at its timestamp', () => {
    const history: HistPoint[] = [
      { t: new Date(2026, 5, 15, 0, 0, 0, 0).getTime(), v: 1 },
      { t: new Date(2026, 5, 15, 6, 0, 0, 0).getTime(), v: 0 },
    ];
    const justBefore = new Date(2026, 5, 15, 5, 59, 59, 0).getTime();
    const exactly = new Date(2026, 5, 15, 6, 0, 0, 0).getTime();
    expect(isNTAt(justBefore, history, windows, false)).toBe(true);
    expect(isNTAt(exactly, history, windows, false)).toBe(false);
  });

  it('no history and no schedule falls back to the live switch state', () => {
    const t = new Date(2026, 5, 15, 2, 0, 0, 0).getTime();
    expect(isNTAt(t, undefined, undefined, true)).toBe(true);
    expect(isNTAt(t, undefined, undefined, false)).toBe(false);
  });

  it('works identically when windows come from parseScheduleEntity instead of a preset', () => {
    const dayEnd = dayEndMs(midnight);
    const entityWindows = parseScheduleEntity(
      { schedule: [
        { start: '2026-06-15T01:00:00', end: '2026-06-15T04:00:00', tariff: 'NT' },
        { start: '2026-06-15T14:00:00', end: '2026-06-15T16:00:00', tariff: 'NT' },
      ] },
      midnight,
      dayEnd
    );
    const t = new Date(2026, 5, 15, 2, 0, 0, 0).getTime();
    expect(isNTAt(t, undefined, entityWindows, false)).toBe(true);
  });
});

describe('parseScheduleEntity (Fáze 2)', () => {
  const dayStart = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
  const dayEnd = dayEndMs(dayStart);

  it('parses the verified ha_cez_distribuce shape (tariff: "NT"/"VT", ISO timestamps)', () => {
    const windows = parseScheduleEntity(
      { schedule: [
        { start: '2026-06-15T00:00:00+02:00', end: '2026-06-15T07:15:00+02:00', tariff: 'NT', value: 1 },
        { start: '2026-06-15T07:15:00+02:00', end: '2026-06-15T08:15:00+02:00', tariff: 'VT', value: 0 },
        { start: '2026-06-15T08:15:00+02:00', end: '2026-06-16T00:00:00+02:00', tariff: 'NT', value: 1 },
      ] },
      dayStart,
      dayEnd
    );
    expect(windows).toEqual([
      { start: new Date('2026-06-15T00:00:00+02:00').getTime(), end: new Date('2026-06-15T07:15:00+02:00').getTime() },
      { start: new Date('2026-06-15T08:15:00+02:00').getTime(), end: new Date('2026-06-16T00:00:00+02:00').getTime() },
    ]);
  });

  it('falls back to the boolean/numeric value field when tariff/type is absent', () => {
    const windows = parseScheduleEntity(
      { schedule: [{ start: '2026-06-15T01:00:00', end: '2026-06-15T02:00:00', value: 1 }] },
      dayStart,
      dayEnd
    );
    expect(windows).toHaveLength(1);
  });

  it('accepts from/to and is_low as aliases', () => {
    const windows = parseScheduleEntity(
      { schedule: [{ from: '2026-06-15T01:00:00', to: '2026-06-15T02:00:00', is_low: true }] },
      dayStart,
      dayEnd
    );
    expect(windows).toHaveLength(1);
  });

  it('drops VT entries', () => {
    const windows = parseScheduleEntity(
      { schedule: [{ start: '2026-06-15T01:00:00', end: '2026-06-15T02:00:00', tariff: 'VT', value: 0 }] },
      dayStart,
      dayEnd
    );
    expect(windows).toEqual([]);
  });

  it('clips a multi-day entry to the requested day', () => {
    const windows = parseScheduleEntity(
      { schedule: [{ start: '2026-06-14T22:00:00', end: '2026-06-15T05:00:00', tariff: 'NT' }] },
      dayStart,
      dayEnd
    );
    expect(windows).toEqual([{ start: dayStart, end: new Date('2026-06-15T05:00:00').getTime() }]);
  });

  it('returns undefined (try next source) when there is no schedule array at all', () => {
    expect(parseScheduleEntity({}, dayStart, dayEnd)).toBeUndefined();
    expect(parseScheduleEntity(undefined, dayStart, dayEnd)).toBeUndefined();
    expect(parseScheduleEntity({ schedule: 'not-an-array' }, dayStart, dayEnd)).toBeUndefined();
  });

  it('returns [] (real "no NT today" answer) when the array exists but nothing matches the day', () => {
    const windows = parseScheduleEntity(
      { schedule: [{ start: '2026-06-20T01:00:00', end: '2026-06-20T02:00:00', tariff: 'NT' }] },
      dayStart,
      dayEnd
    );
    expect(windows).toEqual([]);
  });

  it('skips malformed entries (missing/invalid times) without throwing', () => {
    const windows = parseScheduleEntity(
      { schedule: [
        { start: 'not-a-date', end: '2026-06-15T02:00:00', tariff: 'NT' },
        { start: '2026-06-15T03:00:00', tariff: 'NT' }, // missing end
        null,
        { start: '2026-06-15T05:00:00', end: '2026-06-15T04:00:00', tariff: 'NT' }, // end before start
        { start: '2026-06-15T10:00:00', end: '2026-06-15T11:00:00', tariff: 'NT' },
      ] },
      dayStart,
      dayEnd
    );
    expect(windows).toEqual([
      { start: new Date('2026-06-15T10:00:00').getTime(), end: new Date('2026-06-15T11:00:00').getTime() },
    ]);
  });
});

describe('accumulateTariffWh / calcCost', () => {
  it('splits Wh between NT/VT using the supplied predicate and integrates trapezoidally', () => {
    // Constant 1000 W for exactly 1 hour => 1000 Wh
    const series: HistPoint[] = [
      { t: 0, v: 1000 },
      { t: 3_600_000, v: 1000 },
    ];
    const { ntWh, vtWh, hasData } = accumulateTariffWh([series], () => true);
    expect(hasData).toBe(true);
    expect(ntWh).toBeCloseTo(1000, 5);
    expect(vtWh).toBe(0);
  });

  it('sums multiple independent series (e.g. per-phase entities)', () => {
    const phaseA: HistPoint[] = [{ t: 0, v: 1000 }, { t: 3_600_000, v: 1000 }];
    const phaseB: HistPoint[] = [{ t: 0, v: 500 }, { t: 3_600_000, v: 500 }];
    const { ntWh } = accumulateTariffWh([phaseA, phaseB], () => true);
    expect(ntWh).toBeCloseTo(1500, 5);
  });

  it('clamps negative power (PV export) to zero instead of subtracting cost', () => {
    const series: HistPoint[] = [{ t: 0, v: -500 }, { t: 3_600_000, v: -500 }];
    const { ntWh, vtWh } = accumulateTariffWh([series], () => true);
    expect(ntWh).toBe(0);
    expect(vtWh).toBe(0);
  });

  it('ignores series with fewer than 2 points and reports hasData=false when nothing usable', () => {
    const { hasData } = accumulateTariffWh([undefined, [{ t: 0, v: 100 }]], () => true);
    expect(hasData).toBe(false);
  });

  it('calcCost combines NT/VT watt-hours with their respective prices', () => {
    expect(calcCost(1000, 2000, 3, 5)).toBeCloseTo(1 * 3 + 2 * 5, 5);
  });
});

describe('ntFractionOfInterval (Fáze 3.2)', () => {
  const midnight = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
  const scheduleDay: TariffDay = { starts: ['01:00', '14:00'], offsets: [180, 120] }; // NT 01-04, 14-16
  const windows = ntWindowsForDay(scheduleDay, midnight, dayEndMs(midnight));
  const h = (hh: number) => new Date(2026, 5, 15, hh, 0, 0, 0).getTime();

  it('bucket fully inside a schedule NT window is 1', () => {
    expect(ntFractionOfInterval(h(1), h(2), undefined, windows, false)).toBe(1);
  });

  it('bucket fully outside any NT window is 0', () => {
    expect(ntFractionOfInterval(h(5), h(6), undefined, windows, false)).toBe(0);
  });

  it('an hourly bucket straddling a schedule window boundary splits proportionally', () => {
    // 00:30–01:30, NT starts at 01:00 — first half VT, second half NT
    const start = h(0) + 30 * 60_000;
    const end = h(1) + 30 * 60_000;
    expect(ntFractionOfInterval(start, end, undefined, windows, false)).toBeCloseTo(0.5, 5);
  });

  it('splits proportionally at a real switch-history transition, not just the schedule', () => {
    // Switch flips NT->VT at 01:15 inside the 01:00-01:30 bucket — history wins over schedule
    const history: HistPoint[] = [
      { t: h(0), v: 1 }, // NT from midnight
      { t: h(1) + 15 * 60_000, v: 0 }, // VT from 01:15
    ];
    const start = h(1);
    const end = h(1) + 30 * 60_000;
    expect(ntFractionOfInterval(start, end, history, windows, false)).toBeCloseTo(0.5, 5);
  });

  it('zero-length or inverted interval is 0', () => {
    expect(ntFractionOfInterval(h(1), h(1), undefined, windows, false)).toBe(0);
    expect(ntFractionOfInterval(h(2), h(1), undefined, windows, false)).toBe(0);
  });

  it('with no history and no windows, falls back to the live switch state for the whole bucket', () => {
    expect(ntFractionOfInterval(h(1), h(2), undefined, undefined, true)).toBe(1);
    expect(ntFractionOfInterval(h(1), h(2), undefined, undefined, false)).toBe(0);
  });
});

describe('accumulateTariffWhFromStats (Fáze 3.2)', () => {
  it('mean W * bucket duration => Wh, split via the supplied NT-fraction function', () => {
    const buckets: StatBucket[] = [{ start: 0, end: 3_600_000, mean: 1000 }]; // 1000 W for 1h => 1000 Wh
    const { ntWh, vtWh, hasData } = accumulateTariffWhFromStats([buckets], () => 1);
    expect(hasData).toBe(true);
    expect(ntWh).toBeCloseTo(1000, 5);
    expect(vtWh).toBe(0);
  });

  it('splits a single bucket across NT/VT using a fractional ntFractionFn', () => {
    const buckets: StatBucket[] = [{ start: 0, end: 3_600_000, mean: 1000 }];
    const { ntWh, vtWh } = accumulateTariffWhFromStats([buckets], () => 0.25);
    expect(ntWh).toBeCloseTo(250, 5);
    expect(vtWh).toBeCloseTo(750, 5);
  });

  it('sums multiple independent bucket series (e.g. per-phase entities)', () => {
    const a: StatBucket[] = [{ start: 0, end: 3_600_000, mean: 1000 }];
    const b: StatBucket[] = [{ start: 0, end: 3_600_000, mean: 500 }];
    const { ntWh } = accumulateTariffWhFromStats([a, b], () => 1);
    expect(ntWh).toBeCloseTo(1500, 5);
  });

  it('clamps a negative mean (PV export) to zero instead of subtracting cost', () => {
    const buckets: StatBucket[] = [{ start: 0, end: 3_600_000, mean: -500 }];
    const { ntWh, vtWh } = accumulateTariffWhFromStats([buckets], () => 1);
    expect(ntWh).toBe(0);
    expect(vtWh).toBe(0);
  });

  it('ignores empty/missing series and reports hasData=false when nothing usable', () => {
    const { hasData } = accumulateTariffWhFromStats([undefined, []], () => 1);
    expect(hasData).toBe(false);
  });
});

describe('estimateMonthCost (Fáze 3.3)', () => {
  it('extrapolates linearly from the month-to-date average', () => {
    expect(estimateMonthCost(300, 10, 30)).toBeCloseTo(900, 5);
  });

  it('handles fractional mtdDays (elapsed time, not whole-day count)', () => {
    expect(estimateMonthCost(150, 5.5, 31)).toBeCloseTo((150 / 5.5) * 31, 5);
  });

  it('returns 0 when no time has elapsed yet (avoids division by zero)', () => {
    expect(estimateMonthCost(0, 0, 30)).toBe(0);
    expect(estimateMonthCost(50, -1, 30)).toBe(0);
  });
});
