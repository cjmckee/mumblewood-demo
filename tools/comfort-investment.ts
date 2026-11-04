// One-project/one-worker choice for seven days, followed by seven days of normal planning.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { World, alive, avgMood, colonyComfort, comfortGaps, strainPerDay, tradeOf, bedridden, workersAt, findSpot, apply, tick, TICKS_PER_HOUR, edibleTotal, charterRequirements, stockOf, enableComfortMilestones, comfortMilestoneView, OUTBOX_CAP } from '../src/sim/world';
import { RewardProfile, REQUIREMENTS } from '../src/sim/comfort-milestones';
import { autoBuild, autoDecide } from '../src/sim/autoplayer';
import { BUILDING_BY_ID, type InputKey } from '../src/sim/content';
import { START } from '../src/sim/scenario';
import { REWARD_COMFORT_CURVE } from '../src/sim/comfort';
const root = 'dist/comfort-investment';
const profile = process.env.MILESTONE_PROFILE;
assert(!profile || ['off', 'balanced', 'steady', 'abundance', 'resilience'].includes(profile));
const out = profile ? `dist/comfort-milestones/${profile}` : root; mkdirSync(out, { recursive: true });
if (profile) writeFileSync(`${out}/requirements.json`, JSON.stringify(REQUIREMENTS));
const cases = ['24757-cottage', '42-cottage', '1000-stage', '303-stage'];
const selectedCases = process.argv[2]?.split(',') ?? cases;
const results = [];
const scale = START.comfortScale, rate = START.strain.rate;
const sumFlow = (w: World, pattern: RegExp) => Object.entries(w.flows).filter(([k]) => pattern.test(k)).reduce((n, [, v]) => n + v, 0);
try {
 for (const name of selectedCases) {
  assert(cases.includes(name));
  const checkpoint = JSON.parse(readFileSync(`${root}/${name}-checkpoint.json`, 'utf8'));
  const initial: World = checkpoint.world, serialized = JSON.stringify(initial);
  const hash = createHash('sha256').update(serialized + ':' + checkpoint.decisionState).digest('hex');
  const comfortDef = checkpoint.metadata.id as string;
  const worker = alive(initial).filter(c => tradeOf(initial, c) == null && !bedridden(c) && !c.errand && !c.carrying).sort((a, b) => b.skills.cooking - a.skills.cooking || a.id - b.id)[0];
  assert(worker, 'choice requires an available real laborer');
  for (const def of [comfortDef, 'kitchen']) assert(Object.entries(BUILDING_BY_ID[def].cost).every(([r, n]) => stockOf(initial, r as InputKey) >= (n ?? 0)));
  for (const curve of profile ? ['current'] : ['current', 'gentler', 'no-growth']) for (const policy of ['comfort', 'production', 'save']) {
    const w: World = JSON.parse(serialized); let decisionState = checkpoint.decisionState;
    assert.equal(JSON.stringify(w), serialized);
    if (profile && profile !== 'off') enableComfortMilestones(w, profile as RewardProfile);
    START.comfortScale = { base: 1.4, slope: 1, ...(curve === 'gentler' ? { curve: REWARD_COMFORT_CURVE } : {}) };
    START.strain.rate = curve === 'no-growth' ? 0 : rate;
    const rand = () => ((decisionState = (decisionState * 1103515245 + 12345) >>> 0) / 4294967296);
    let phase = 'policy', strain = w.strain, passiveGrowth = 0, eventStrain = 0, relief = 0;
    Object.defineProperty(w, 'strain', { enumerable: true, configurable: true, get: () => strain, set: (next: number) => {
      const delta = next - strain;
      if (delta > 0) { if (phase === 'tick') passiveGrowth += delta; else eventStrain += delta; }
      else relief -= delta;
      strain = next;
    } });
    const projectDef = policy === 'comfort' ? comfortDef : policy === 'production' ? 'kitchen' : null;
    let projectId: number | null = null, completionHour: number | null = null;
    if (projectDef) {
      const spot = findSpot(w, projectDef); assert(spot);
      assert.equal(apply(w, { type: 'place', def: projectDef, ...spot }), null);
      projectId = w.buildings.at(-1)!.uid;
    }
    const baseIds = new Set(w.buildings.map(b => b.uid));
    const trace = [], seen = new WeakSet(w.log), events: ({ at: number } & World['log'][number])[] = [];
    const levelHours = [0, 0, 0, 0];
    const collect = () => { for (const log of w.log) if (!seen.has(log)) { seen.add(log); events.push({ at: w.hour - initial.hour, ...log }); } };
    const exposure = { sulkingPersonHours: 0, hungryPersonHours: 0, projectBuildPersonHours: 0, reservedWorkerBuildHours: 0, reservedWorkerHaulHours: 0, reservedWorkerProductionHours: 0 };
    const override = () => {
      if (w.hour - initial.hour >= 168 - 1e-6) return;
      const c = alive(w).find(c => c.id === worker.id);
      if (!c || c.errand || bedridden(c)) return;
      const project = w.buildings.find(b => b.uid === projectId);
      if (policy === 'production' && project?.built) {
        // An explicit stew assignment: no flour dependency or recipe-selection ambiguity.
        for (let i = 0; i < BUILDING_BY_ID.kitchen.recipes!.length; i++) assert.equal(apply(w, { type: 'toggleRecipe', building: project.uid, recipe: i, on: i === 0 }), null);
        if (c.job !== project.uid) {
          for (const other of workersAt(w, project.uid).filter(other => other.id !== c.id)) assert.equal(apply(w, { type: 'trade', colonist: other.id, trade: null }), null);
          assert.equal(apply(w, { type: 'assign', colonist: c.id, building: project.uid }), null);
        }
      } else if (tradeOf(w, c) != null) assert.equal(apply(w, { type: 'trade', colonist: c.id, trade: null }), null);
    };
    const sample = () => ({ at: w.hour - initial.hour, mood: avgMood(w), lowestMood: Math.min(...alive(w).map(c => c.mood)),
      comfort: colonyComfort(w), gaps: comfortGaps(w), strain: w.strain, rate: strainPerDay(w), passiveGrowth, eventStrain, relief,
      population: alive(w).length, food: edibleTotal(w), wood: w.res.wood, fine: stockOf(w, 'fine'),
      departures: w.stats.departures - initial.stats.departures, deaths: w.stats.deaths - initial.stats.deaths,
      chartersDone: [...w.chartersDone], requirements: charterRequirements(w).map(r => ({ kind: r.metric.kind, value: r.value, target: r.target })),
      daytimeSulking: sumFlow(w, /^time:(worker|laborer):sulking$/) - sumFlow(initial, /^time:(worker|laborer):sulking$/),
      foodMade: sumFlow(w, /^(stew|bread|smokedFish|skewers|pie|hotpot|porridge|driedMushrooms|supper|fishpie|banquet|platter):\+/) - sumFlow(initial, /^(stew|bread|smokedFish|skewers|pie|hotpot|porridge|driedMushrooms|supper|fishpie|banquet|platter):\+/),
      festivalGoods: sumFlow(w, /:-festival$/) - sumFlow(initial, /:-festival$/), ...exposure });
    override(); trace.push(sample());
    for (let hour = 0; hour < 336 && w.status === 'playing'; hour++) {
      phase = 'decision'; autoDecide(w, 'greedy', rand); override(); collect();
      for (let t = 0; t < TICKS_PER_HOUR && w.status === 'playing'; t++) {
        levelHours[comfortMilestoneView(w).level] += 1 / TICKS_PER_HOUR;
        for (const c of alive(w)) {
          if (c.sulking) exposure.sulkingPersonHours += 1 / TICKS_PER_HOUR;
          if (c.hunger < 25) exposure.hungryPersonHours += 1 / TICKS_PER_HOUR;
          if (c.activity === 'building' && c.task?.kind === 'build' && c.task.site === projectId) exposure.projectBuildPersonHours += 1 / TICKS_PER_HOUR;
          if (c.id === worker.id && w.hour - initial.hour < 168) {
            if (c.activity === 'building') exposure.reservedWorkerBuildHours += 1 / TICKS_PER_HOUR;
            if (c.activity === 'hauling') exposure.reservedWorkerHaulHours += 1 / TICKS_PER_HOUR;
            if (c.activity === 'working' && c.job === projectId) exposure.reservedWorkerProductionHours += 1 / TICKS_PER_HOUR;
          }
        }
        phase = 'tick'; tick(w); collect();
        phase = 'decision'; if (w.decisions.length) autoDecide(w, 'greedy', rand);
        override(); collect();
      }
      const project = w.buildings.find(b => b.uid === projectId);
      if (project?.built && completionHour == null) completionHour = w.hour - initial.hour;
      phase = 'policy';
      const commitment = w.hour - initial.hour < 168 - 1e-6;
      autoBuild(w, { construction: !commitment }); override(); collect();
      if (commitment) assert(w.buildings.every(b => baseIds.has(b.uid)), 'only selected project may be placed during commitment');
      assert(Math.abs(w.strain - (initial.strain + passiveGrowth + eventStrain - relief)) < 1e-7);
      assert(w.buildings.every(b => Object.values(b.outbox).reduce((n, v) => n + (v ?? 0), 0) <= OUTBOX_CAP + 1e-7), 'bonus output must respect shelf capacity');
      trace.push({ ...sample(), milestoneLevel: comfortMilestoneView(w).level, levelHours: [...levelHours], bonusBatches: w.comfortMilestones?.bonusBatches ?? 0, bonusUnits: w.comfortMilestones?.bonusUnits ?? 0 });
    }
    const end = trace.at(-1)!;
    const materials = { ...(w.buildings.find(b => b.uid === projectId)?.delivered ?? {}) };
    const summary = { case: name, curve, policy, milestoneProfile: profile ?? 'off', levelHours, eligibleBatches: w.comfortMilestones?.eligibleBatches ?? 0, bonusBatches: w.comfortMilestones?.bonusBatches ?? 0, bonusUnits: w.comfortMilestones?.bonusUnits ?? 0, checkpointHash: hash, forkHour: initial.hour, initialStrain: initial.strain, initialComfort: colonyComfort(initial), workerId: worker.id,
      projectDef, projectId, completionHour, materials, observedHours: end.at, status: w.status, addedCharters: w.chartersDone.length - initial.chartersDone.length,
      initialCharter: initial.charter, initialRequirements: trace[0].requirements, endRequirements: end.requirements,
      endStrain: w.strain, passiveGrowth, eventStrain, relief, meanMood: trace.slice(1).reduce((n, t) => n + t.mood, 0) / (trace.length - 1),
      minimumMood: Math.min(...trace.map(t => t.lowestMood)), meanComfort: trace.slice(1).reduce((n, t) => n + t.comfort, 0) / (trace.length - 1),
      daytimeSulking: end.daytimeSulking, foodMade: end.foodMade, endFood: end.food, endWood: end.wood, endFine: end.fine, festivalGoods: end.festivalGoods,
      departures: end.departures, deaths: end.deaths, ...exposure };
    results.push(summary);
    writeFileSync(`${out}/${name}-${curve}-${policy}.json`, JSON.stringify({ summary, trace, events }, null, 2));
    console.log(JSON.stringify(summary));
  }
 }
 writeFileSync(`${out}/summary-${selectedCases.join('_')}.json`, JSON.stringify({ commitmentHours: 168, horizonHours: 336, cases: selectedCases, results }, null, 2));
} finally { START.comfortScale = scale; START.strain.rate = rate; }
