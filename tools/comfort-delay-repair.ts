// One bounded logistics counterfactual: a real laborer hauls the stranded two-acorn basket.
// Both arms hold the hourly planner for six hours; all movement/production still tick normally.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { World, alive, tradeOf, bedridden, tick, TICKS_PER_HOUR, charterRequirements } from '../src/sim/world';
import { autoBuild, autoDecide } from '../src/sim/autoplayer';
import { START } from '../src/sim/scenario';
import { REWARD_COMFORT_CURVE } from '../src/sim/comfort';
const checkpoint = JSON.parse(readFileSync('dist/comfort-recovery/delay/gentler-hour-1428.json', 'utf8'));
const results = [];
for (const repair of [false, true]) {
  const w: World = structuredClone(checkpoint.world); let r = checkpoint.decisionState;
  const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  START.comfortScale = { base: 1.4, slope: 1, curve: REWARD_COMFORT_CURVE };
  const basket = w.buildings.find(b => (b.outbox.acorns ?? 0) >= 2);
  assert(basket);
  const worker = alive(w).filter(c => tradeOf(w, c) == null && !bedridden(c) && c.errand == null && !c.carrying).sort((a, b) => Math.hypot(a.x - basket.x, a.y - basket.y) - Math.hypot(b.x - basket.x, b.y - basket.y))[0];
  assert(worker && basket);
  if (repair) { worker.task = { kind: 'haul', from: basket.uid, res: 'acorns', amount: 2 }; worker.goalKey = ''; }
  let early: unknown = null;
  const trace = [];
  while (w.status === 'playing' && w.chartersDone.length === 1 && w.hour < 6 + 100 * 24) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR && w.status === 'playing'; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    const elapsed = w.hour - checkpoint.world.hour;
    if (elapsed < 6 + 1e-6) early = { elapsed, basket: basket.outbox.acorns ?? 0, resAcorns: w.res.acorns, flourMade: w.tally?.made.flour ?? 0, workerTask: worker.task, carrying: worker.carrying };
    if (elapsed >= 6 - 1e-6) autoBuild(w);
    trace.push({ hour: w.hour, elapsed, acorns: w.res.acorns, basket: basket.outbox.acorns ?? 0, flourMade: w.tally?.made.flour ?? 0, requirements: charterRequirements(w).map(r => ({ label: r.label, ratio: r.ratio })) });
  }
  const result = { repair, startHour: checkpoint.world.hour, endHour: w.hour, completedSecondCharter: w.chartersDone.length > 1, workerId: worker.id, basketId: basket.uid, early };
  results.push(result);
  writeFileSync(`dist/comfort-recovery/delay/${repair ? 'one-haul' : 'held-planner-control'}.json`, JSON.stringify({ result, trace }, null, 2));
  console.log(JSON.stringify(result));
}
writeFileSync('dist/comfort-recovery/delay/repair-summary.json', JSON.stringify(results, null, 2));
