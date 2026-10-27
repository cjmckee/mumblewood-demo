// Scenarios: everything about how a run starts, like RimWorld's scenarios. `classic` is the original start and must
// play exactly as before (tools/fingerprint.ts checks it). `frontier` is the small start with research.
import { BUILDINGS, CHARTERS, CharterDef, FRONTIER_CHARTERS, JOB_KINDS, ALL_JOB_KINDS, JobKind, RESEARCH, ResearchDef, ResourceId } from './content';

export interface Scenario {
  id: string; name: string; blurb: string;
  colonists: number;
  res: Partial<Record<ResourceId, number>>;
  /** buildings placed and built around the hearth at the start, in order */
  place: string[];
  /** blueprints buildable from day 1 */
  unlocked: string[];
  /** research projects; empty means no research in this scenario */
  research: ResearchDef[];
  /** the first research offer, fixed so it teaches "which need do I solve first?" */
  firstResearch?: string[];
  /** when the first charter is offered: at the start, or once this many projects are done or on this day */
  firstCharter: 'start' | { research: number; day: number };
  /** blueprint drafts start after the first charter is picked, instead of at the start */
  draftsAfterCharter: boolean;
  charters: CharterDef[];
  /** the colony collapses at this many lost, or with this many or fewer left */
  collapse: { lost: number; minAlive: number };
  /** classic: a curve over days; population: builds up each hour with how many people there are */
  strain: 'classic' | { perPerson: number; rampDays: number };
  /** wood the hearth burns per night hour: flat (1), or a small fire for a small colony that grows with it, up to 1 */
  hearth: 'flat' | { base: number; perPerson: number };
  /** wood workshops (and the research desk) leave in storage for the hearth */
  woodReserve: number;
  /** outbreaks wait until this day and this many colonists */
  outbreakFrom: { day: number; pop: number };
  /** the jobs colonists roll skills for */
  jobs: JobKind[];
  intro: string[];
}

export const SCENARIOS: Record<string, Scenario> = {
  classic: {
    id: 'classic', name: 'Classic start', blurb: 'Six settlers and the full base set of buildings. Charters and blueprints from day one.',
    colonists: 6,
    res: { wood: 60, berries: 50, stew: 10 },
    place: ['stockpile', 'leanto', 'leanto', 'woodcutter', 'forager'],
    unlocked: BUILDINGS.filter(b => b.basic).map(b => b.id),
    research: [],
    firstCharter: 'start', draftsAfterCharter: false,
    charters: CHARTERS,
    collapse: { lost: 6, minAlive: 2 },
    strain: 'classic',
    hearth: 'flat',
    woodReserve: 20,
    outbreakFrom: { day: 3, pop: 0 },
    jobs: JOB_KINDS,
    intro: ['Six settlers arrive at the edge of the Mumblewood with a cart, a kettle, and great optimism.', 'There are only four beds for six people. Someone should build another lean-to.'],
  },
  frontier: {
    id: 'frontier', name: 'Frontier start', blurb: 'Three settlers, a woodcutter, a forager and a research desk. Learn what people need, one problem at a time.',
    colonists: 3,
    res: { wood: 40, berries: 30, stew: 6 },
    place: ['stockpile', 'leanto', 'leanto', 'woodcutter', 'forager', 'desk'],
    unlocked: ['stockpile', 'leanto', 'woodcutter', 'forager', 'desk'],
    research: RESEARCH,
    firstResearch: ['cookery', 'messhall', 'physick'],
    firstCharter: { research: 2, day: 4 }, draftsAfterCharter: true,
    charters: FRONTIER_CHARTERS,
    collapse: { lost: 6, minAlive: 0 },
    strain: { perPerson: 0.03, rampDays: 40 },
    hearth: { base: 0.25, perPerson: 0.06 },
    woodReserve: 10,
    outbreakFrom: { day: 6, pop: 5 },
    jobs: ALL_JOB_KINDS,
    intro: ['Three settlers arrive at the edge of the Mumblewood with a cart, a kettle, a stack of borrowed books and great optimism.', 'Nobody knows how to build a kitchen yet. Someone should study.'],
  },
};
export const DEFAULT_SCENARIO = 'frontier';
export const scenarioOf = (w: { scenario?: string }): Scenario => SCENARIOS[w.scenario ?? 'classic'] ?? SCENARIOS.classic;
/** the scenario tools run when none is named: SCENARIO=frontier in Node, otherwise classic */
export function envScenario(): string {
  const env = typeof process !== 'undefined' ? process.env?.SCENARIO : undefined;
  return env && SCENARIOS[env] ? env : 'classic';
}
