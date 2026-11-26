import { START } from '../src/sim/scenario';

export function applyWinterWhatIf() {
  const ws = START.seasons as any;
  // what-if winters (measurement only). Winter is soft since claude/soft-winter (no flat penalties); WINTER=hard puts
  // them back (short days, slow building and walking, less wood and clay, slow recruiting); WINTER=off makes winter
  // another autumn
  if (process.env.WINTER === 'hard') {
    ws.work.winter = [7, 18]; ws.build.winter = 0.85; ws.offPath.winter = 0.85; ws.recruitEvery.winter = 3;
    ws.yield.woodcutter = { winter: 0.8 }; ws.yield.claypit = { winter: 0.5 };
  }
  if (process.env.WINTER === 'off') {
    for (const y of Object.values(ws.yield) as any[]) delete y.winter;
    ws.homeFuel = {}; ws.chill = { cold: 0, warm: 0 }; ws.spoil.winter = ws.spoil.autumn;
  }
}

/** draft and settler schedules from the environment (claude/mumblewood-draft-cadence.md), for pacing and stage-runs */
export function applyDraftKnobs() {
  // DRAFT_MODE=days|charter|settlers|standing, DRAFT_FALLBACK=6, STANDING_EACH=24 (claude/mumblewood-draft-cadence.md)
  if (process.env.DRAFT_MODE) START.drafts.mode = process.env.DRAFT_MODE as typeof START.drafts.mode;
  if (process.env.DRAFT_FALLBACK) START.drafts.fallback = Number(process.env.DRAFT_FALLBACK);
  if (process.env.CORNERSTONES) START.cornerstoneWhen = process.env.CORNERSTONES as typeof START.cornerstoneWhen;
  if (process.env.RECRUIT_MODE) START.recruitMode = process.env.RECRUIT_MODE as typeof START.recruitMode;
  if (process.env.DRAFT_PROGRESS) START.drafts.progress = process.env.DRAFT_PROGRESS as typeof START.drafts.progress;
  if (process.env.DRAFTS_ON_PICK) START.drafts.onPick = Number(process.env.DRAFTS_ON_PICK);
  if (process.env.DRAFT_BLOCKED) START.drafts.blocked = Number(process.env.DRAFT_BLOCKED);
  if (process.env.STANDING_EACH) START.drafts.standingEach = Number(process.env.STANDING_EACH);
}
