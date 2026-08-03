import type { TariffDay } from "./types.js";

export interface TariffPreset {
  label: string;
  weekday: TariffDay;
  weekend: TariffDay;
  holiday?: TariffDay;
}

/**
 * Pre-defined NT schedules for PRE distributor (Prague, Czech Republic).
 * Source: PRE HDO schedule Excel, valid from 2025-10-16 to 2028-01-26.
 * Parsed directly from official "aktualni-program-hdo-ke-stazeni.xls".
 * NT windows bordering midnight (00:00 start / 24:00 end) are included.
 *
 * Fáze 2 (ROADMAP.md): frozen fallback, not actively maintained. Now that
 * `hdo.schedule_entity` (e.g. sensor.cez_hdo_schedule_* from the
 * ha_cez_distribuce integration) can supply NT windows directly and stays
 * current automatically, these hardcoded tables are a last-resort default
 * for users without such an integration — kept for backward compatibility,
 * but not updated to track future PRE schedule revisions.
 */
export const PRE_TARIFFS: Record<string, TariffPreset> = {

  // 600: D25d/D26d appliance — Excel code 600
  "600": {
    label: "PRE 600 — D25d / D26d",
    weekday:  { starts: ["00:40","12:40"],           offsets: [300,180] },
    weekend:  { starts: ["02:40","12:40"],           offsets: [180,300] },
    holiday:  { starts: ["00:40","12:20"],           offsets: [300,180] },
  },

  // 601: C45d hot water — Excel code 601
  "601": {
    label: "PRE 601 — C45d (hot water / TUV)",
    weekday:  { starts: ["01:00","04:40","14:00"], offsets: [180,120,180] },
    weekend:  { starts: ["01:20","11:00","14:00"], offsets: [160,140,180] },
    holiday:  { starts: ["02:00","06:40","15:00"], offsets: [240,80,160] },
  },

  // 605: D57d main NT — Excel code 605
  // 7 windows/day; starts at 00:00 and ends at 24:00 (midnight-bordering)
  "605": {
    label: "PRE 605 — D57d (main NT)",
    weekday: {
      starts:  ["00:00","01:40","05:20","10:00","13:40","18:20","22:00"],
      offsets: [60,     180,    240,    180,    240,    180,    120],
    },
    weekend: {
      starts:  ["00:00","02:40","06:20","10:00","13:40","19:20","23:00"],
      offsets: [120,    180,    180,    180,    300,    180,    60],
    },
    holiday: {
      starts:  ["00:00","02:20","07:00","11:40","15:20","19:00","22:40"],
      offsets: [100,    240,    240,    180,    180,    180,    80],
    },
  },

  // 606: D57d appliance — Excel code 606 (identical schedule to 605)
  "606": {
    label: "PRE 606 — D57d (appliance)",
    weekday: {
      starts:  ["00:00","01:40","05:20","10:00","13:40","18:20","22:00"],
      offsets: [60,     180,    240,    180,    240,    180,    120],
    },
    weekend: {
      starts:  ["00:00","02:40","06:20","10:00","13:40","19:20","23:00"],
      offsets: [120,    180,    180,    180,    300,    180,    60],
    },
    holiday: {
      starts:  ["00:00","02:20","07:00","11:40","15:20","19:00","22:40"],
      offsets: [100,    240,    240,    180,    180,    180,    80],
    },
  },

  // 607: D57d hot water — Excel code 607
  "607": {
    label: "PRE 607 — D57d (hot water / TUV)",
    weekday:  { starts: ["01:40","05:20","13:40"], offsets: [180,120,180] },
    weekend:  { starts: ["03:00","06:20","13:40"], offsets: [160,120,200] },
    holiday:  { starts: ["02:20","07:00","15:20"], offsets: [240,80,160] },
  },
};
