import { START } from '../src/sim/scenario';

export function applyWinterWhatIf() {
  const ws = START.seasons as any;
  // what-if winters (measurement only): WINTER=soft drops the flat penalties (short days, slow building and walking,
  // less wood and clay, slow recruiting) but keeps what asks for planning (crops sleep, homes burn wood, chills);
  // WINTER=off makes winter another autumn
  if (process.env.WINTER === 'soft' || process.env.WINTER === 'off') {
    ws.work.winter = ws.work.autumn; delete ws.build.winter; delete ws.offPath.winter; ws.recruitEvery.winter = ws.recruitEvery.autumn;
    delete ws.yield.woodcutter.winter; delete ws.yield.claypit.winter;
  }
  if (process.env.WINTER === 'off') {
    for (const y of Object.values(ws.yield) as any[]) delete y.winter;
    ws.homeFuel = {}; ws.chill = { cold: 0, warm: 0 }; ws.spoil.winter = ws.spoil.autumn;
  }
}
