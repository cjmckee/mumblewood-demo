// Ten-day seasons, four to a year. Summer 1 gives twenty days before the first winter.
// Each world retains its starting date; defaults and seasonal rules live in scenario.ts.
import { START, Season, SEASONS } from './scenario';

/** days since the start of the first spring, counting from 0, for a run day (1-based) */
function calendarDay(runDay: number, start = START.seasons.start) {
  const sc = START.seasons;
  return SEASONS.indexOf(start.season) * sc.days + (start.day - 1) + (runDay - 1);
}
export interface SeasonInfo {
  season: Season;
  /** 1 to days */
  dayOf: number;
  /** which year of the run (1 = the first), counted from the start, so the second year starts 40 days in */
  year: number;
  /** which winter this is, or the last one if it isn't winter (0 before the first) */
  winter: number;
  /** days until winter starts (0 in winter) */
  toWinter: number;
}
export function seasonOn(runDay: number, start = START.seasons.start): SeasonInfo {
  const n = START.seasons.days, cd = calendarDay(runDay, start);
  const idx = Math.floor(cd / n) % 4, dayOf = (cd % n) + 1;
  const season = SEASONS[idx];
  const first = calendarDay(1, start);
  // calendar days on which winters start, from the run's start on
  const winterStarts = (k: number) => { const y0 = Math.floor(first / (4 * n)); return (y0 + k) * 4 * n + 3 * n; };
  let winter = 0;
  for (let k = 0; winterStarts(k) <= cd; k++) if (winterStarts(k) + n > first) winter++;
  let next = 0; while (winterStarts(next) <= cd) next++;
  const toWinter = season === 'winter' ? 0 : winterStarts(next) - cd;
  return { season, dayOf, year: 1 + Math.floor((runDay - 1) / (4 * n)), winter, toWinter };
}
export const seasonOf = (w: { hour: number; startDate?: { season: Season; day: number } }) => seasonOn(Math.floor(w.hour / 24) + 1, w.startDate);
export const SEASON_NAMES: Record<Season, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
/** a season's rule from a by-season table, with a default */
export const rule = <T>(table: Partial<Record<Season, T>>, s: Season, fallback: T) => table[s] ?? fallback;
