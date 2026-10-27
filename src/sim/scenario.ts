// How a run starts. One start for now; it's kept as data so a different start (more settlers, more wood, other
// buildings), like a RimWorld scenario, is a matter of editing these numbers.
import { ResourceId } from './content';

export interface Start {
  colonists: number;
  res: Partial<Record<ResourceId, number>>;
  /** buildings placed and built around the hearth at the start, in order */
  place: string[];
  /** blueprints buildable from day 1; research unlocks the rest of the base set */
  unlocked: string[];
  /** the first research offer, fixed so it teaches "which need do I solve first?"; it comes once the first research desk is built */
  firstResearch: string[];
  /** the first charter is offered on the morning of this day; blueprint drafts start once it's picked */
  firstCharterDay: number;
  /** days between blueprint drafts, once they start */
  draftEvery: number;
  /** the colony collapses at this many lost, or with this many or fewer left */
  collapse: { lost: number; minAlive: number };
  /**
   * strain builds up each hour by rate × √population, faster as the run goes on (1 + day / rampDays). The square root
   * means a bigger colony strains a little faster, not twice as fast: growing is a trade-off, not a trap.
   */
  strain: { rate: number; rampDays: number };
  /**
   * how much the colony's comfort (0 to 1, see comfortOf) changes the strain rise: rise × (base − comfort × slope).
   * With base 1.4 and slope 1: a neglected town (0.1) strains 1.3×, a middling one (0.4) 1×, a great one (1.0) 0.4×.
   */
  comfortScale: { base: number; slope: number };
  /**
   * strain relief, each a share of the current strain so a deeper hole means a bigger climb back: finishing a charter, and
   * a festival the player calls (base share if everyone eats, more if most also get a drink, more again if most get
   * something they love), with a wait between festivals
   */
  relief: { charter: number; festival: { base: number; drinks: number; loved: number; waitDays: number } };
  /** wood the hearth burns per night hour: a small fire for a small colony that grows with it, up to 1 */
  hearth: { base: number; perPerson: number };
  /** wood workshops (and the research desk) leave in storage for the hearth */
  woodReserve: number;
  /** the body: hours of waking work from a full belly to empty, how hungry before someone goes for food, walking speed
   *  in tiles an hour, and the share of food left out (not in a storehouse) that spoils each day */
  body: { hungerHours: number; eatBelow: number; walk: number; spoilPerDay: number };
  /** outbreaks wait until this day and this many colonists */
  outbreakFrom: { day: number; pop: number };
  /** the calendar and what each season does; see seasons.ts */
  seasons: SeasonRules;
  intro: string[];
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
type BySeason<T> = Partial<Record<Season, T>>;
export interface SeasonRules {
  /** days in each season; four seasons make a year */
  days: number;
  /** the run starts on this day of this season */
  start: { season: Season; day: number };
  /** the hour work starts and ends (dusk); evenings run from dusk to 22:00 */
  work: Record<Season, [number, number]>;
  /** how fast buildings go up (1 = normal) */
  build: BySeason<number>;
  /** walking speed off laid paths (mud in spring, snow in winter) */
  offPath: BySeason<number>;
  /** how fast food left out spoils */
  spoil: BySeason<number>;
  /** output by building and season (missing = 1): lean pickings in winter, a harvest in autumn; later winters are
   *  leaner still (winter yields × harshYield) */
  yield: Record<string, BySeason<number>>;
  harshYield: number;
  /** indoor work by season: workshops that turn ingredients into goods, and study at the desk (long evenings by the fire) */
  indoor: BySeason<number>;
  /** the hearth burns this many times as much */
  hearth: BySeason<number>;
  /** wood each home burns a day in winter, by building; the second winter and later burn harsh × as much */
  homeFuel: Record<string, number>;
  harsh: number;
  /** days between recruit offers (0 = none that season) */
  recruitEvery: Record<Season, number>;
  /** chance a night spent cold gives someone a winter chill (warm settlers get a small share of it) */
  chill: { cold: number; warm: number };
  /** what a sensible colony puts by for winter (the bot's and the foreman's target): it starts `from` days before
   *  winter and is complete `full` days before. `share` of a winter's eating (foraging and fishing carry on, thinner);
   *  for wood, `fuel` of what the homes will burn (woodcutters keep chopping, and the hearth burns all year anyway) */
  prep: { from: number; full: number; share: number; fuel: number };
  /** from this year of the run on, every comfort need asks a little more (0 = never) */
  stricterFromYear: number;
  /** mood when winter comes, for having held a harvest festival in autumn or not */
  harvestHome: { held: number; missed: number; hours: number };
}

export const START: Start = {
  colonists: 3,
  res: { wood: 40, berries: 30, stew: 6 },
  place: ['stockpile', 'leanto', 'leanto', 'woodcutter', 'forager'],
  unlocked: ['stockpile', 'leanto', 'woodcutter', 'forager', 'desk'],
  firstResearch: ['cookery', 'messhall', 'physick'],
  firstCharterDay: 2,
  draftEvery: 3,
  collapse: { lost: 6, minAlive: 0 },
  strain: { rate: 0.15, rampDays: 40 },
  comfortScale: { base: 1.4, slope: 1 },
  relief: { charter: 0.3, festival: { base: 0.15, drinks: 0.05, loved: 0.05, waitDays: 4 } },
  hearth: { base: 0.125, perPerson: 0.03 },
  woodReserve: 10,
  body: { hungerHours: 34, eatBelow: 45, walk: 7, spoilPerDay: 0.035 },
  outbreakFrom: { day: 6, pop: 5 },
  seasons: {
    days: 10,
    start: { season: 'summer', day: 6 },
    work: { spring: [6, 18], summer: [5, 18], autumn: [6, 18], winter: [7, 18] },
    build: { spring: 0.85, winter: 0.85 },
    offPath: { spring: 0.85, winter: 0.85 },
    spoil: { summer: 1.25, autumn: 1.5, winter: 0.4 },
    yield: {
      forager: { spring: 0.8, summer: 1.25, winter: 0.75 },
      herbgarden: { spring: 0.8, winter: 0.5 },
      orchard: { spring: 0.4, autumn: 1.5, winter: 0 },
      field: { spring: 0.4, autumn: 1.5, winter: 0 },
      apiary: { spring: 0.8, summer: 1.25, winter: 0 },
      cellar: { autumn: 1.5 },
      dock: { spring: 1.25 },
      claypit: { winter: 0.5 },
    },
    harshYield: 0.9,
    indoor: {},
    hearth: {},
    homeFuel: { leanto: 0.7, cottage: 0.4 },
    harsh: 1.25,
    recruitEvery: { spring: 1, summer: 2, autumn: 2, winter: 3 },
    chill: { cold: 0.04, warm: 0.005 },
    prep: { from: 10, full: 3, share: 0.3, fuel: 0.6 },
    stricterFromYear: 0,
    harvestHome: { held: 4, missed: -4, hours: 96 },
  },
  intro: ['Three settlers arrive at the edge of the Mumblewood with a cart, a kettle, a stack of borrowed books and great optimism.', 'Nobody knows how to build a kitchen yet. A research desk would be a start.', 'It\u2019s late summer. Winter comes in about two weeks, and then the fields and orchards sleep.'],
};
