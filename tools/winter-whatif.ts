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
