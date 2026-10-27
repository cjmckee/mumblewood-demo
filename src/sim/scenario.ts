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
  /** wood the hearth burns per night hour: a small fire for a small colony that grows with it, up to 1 */
  hearth: { base: number; perPerson: number };
  /** wood workshops (and the research desk) leave in storage for the hearth */
  woodReserve: number;
  /** outbreaks wait until this day and this many colonists */
  outbreakFrom: { day: number; pop: number };
  intro: string[];
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
  strain: { rate: 0.07, rampDays: 40 },
  hearth: { base: 0.25, perPerson: 0.06 },
  woodReserve: 10,
  outbreakFrom: { day: 6, pop: 5 },
  intro: ['Three settlers arrive at the edge of the Mumblewood with a cart, a kettle, a stack of borrowed books and great optimism.', 'Nobody knows how to build a kitchen yet. A research desk would be a start.'],
};
