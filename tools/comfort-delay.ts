// Explain seed 1000's second-charter delay with hourly requirements, resources and event history.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { World, tick, alive, avgMood, colonyComfort, charterRequirements, charterDef, workersAt, bdef, blockedReason, TICKS_PER_HOUR } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { START } from '../src/sim/scenario';
import { REWARD_COMFORT_CURVE } from '../src/sim/comfort';
const checkpoint = JSON.parse(readFileSync('dist/comfort-probe/1000/checkpoint.json', 'utf8'));
const output = 'dist/comfort-recovery/delay'; mkdirSync(output, { recursive: true });
for (const curve of ['current', 'gentler']) {
  const w: World = structuredClone(checkpoint.world); let r = checkpoint.decisionState;
  const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  START.comfortScale = { base: 1.4, slope: 1, ...(curve === 'gentler' ? { curve: REWARD_COMFORT_CURVE } : {}) };
  const charter = w.charter!, metric = charterDef(charter)!.metric;
  const events: ({ absoluteHour: number } & World['log'][number])[] = [];
  const hourly = [], blockers: Record<string, number> = {}, firstMet: Record<string, number> = {};
  const seen = new WeakSet(w.log);
  const collect = () => { for (const log of w.log) if (!seen.has(log)) { seen.add(log); events.push({ absoluteHour: w.hour, ...log }); } };
  let completion: unknown = null;
  while (w.status === 'playing' && w.chartersDone.length === 1 && w.hour < 6 + 100 * 24) {
    const requirements = charterRequirements(w).map(r => ({ kind: r.metric.kind, label: r.label, value: r.value, target: r.target, ratio: r.ratio }));
    for (const requirement of requirements) {
      if (requirement.ratio < 1) blockers[requirement.kind] = (blockers[requirement.kind] ?? 0) + 1;
      else firstMet[requirement.kind] ??= w.hour;
    }
    hourly.push({ hour: w.hour, pop: alive(w).length, mood: avgMood(w), comfort: colonyComfort(w), strain: w.strain, requirements,
      res: { ...w.res }, tally: structuredClone(w.tally), perks: [...w.perks],
      buildings: w.buildings.map(b => ({ uid: b.uid, def: b.def, built: b.built, workers: workersAt(w, b.uid).length, job: bdef(b).job, blocked: blockedReason(w, b), inbox: { ...b.inbox }, outbox: { ...b.outbox }, batch: b.batch ? { ...b.batch } : null })),
      ill: alive(w).filter(c => c.illness).length, sulkers: alive(w).filter(c => c.sulking).length,
    });
    if ([1428, 1668, 1908, 2028].includes(Math.round(w.hour))) writeFileSync(`${output}/${curve}-hour-${Math.round(w.hour)}.json`, JSON.stringify({ world: w, decisionState: r }));
    autoDecide(w, 'greedy', rand); collect();
    for (let t = 0; t < TICKS_PER_HOUR && w.status === 'playing'; t++) {
      tick(w); collect();
      if (w.chartersDone.length > 1) {
        completion = { hour: w.hour, tally: structuredClone(w.tally), moodLog: [...(w.moodLog ?? [])] };
        for (const part of metric.kind === 'all' ? metric.parts : [metric]) firstMet[part.kind] ??= w.hour;
        break;
      }
      if (w.decisions.length) { autoDecide(w, 'greedy', rand); collect(); }
    }
    if (w.chartersDone.length > 1) break;
    autoBuild(w); collect();
  }
  const summary = { curve, charter, forkHour: checkpoint.world.hour, completion, blockers, firstMet, endHour: w.hour };
  writeFileSync(`${output}/${curve}.json`, JSON.stringify({ summary, hourly, events }, null, 2));
  console.log(JSON.stringify(summary));
}
