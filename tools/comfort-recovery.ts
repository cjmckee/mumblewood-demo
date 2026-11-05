// Three bounded situational plays, each with a no-shock control under both curves.
// Prepare with comfort-scout.ts and comfort-service-prep.ts, then run this file with --import tsx.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { World, Colonist, alive, avgMood, colonyComfort, comfortParts, beds, onHand, useUp, FOODS, apply, tick, tradeOf, workersAt, bedridden, TICKS_PER_HOUR, drinkableTotal } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { START } from '../src/sim/scenario';
import { REWARD_COMFORT_CURVE } from '../src/sim/comfort';

type Scenario = 'food' | 'housing' | 'service';
const root = 'dist/comfort-recovery';
const controlled = process.env.CONTROLLED === '1';
const out = controlled ? `${root}/controlled` : root; mkdirSync(out, { recursive: true });
const load = (name: string) => JSON.parse(readFileSync(`${root}/${name}`, 'utf8'));
const foodAvailable = (w: World) => FOODS.filter(r => !w.forbidden.includes(r)).reduce((n, r) => n + onHand(w, r), 0);
const drinkFlow = (w: World) => Object.entries(w.flows).filter(([key]) => key.endsWith(':-drunk')).reduce((n, [, value]) => n + value, 0);
const housingFlow = (w: World) => Object.fromEntries(['wood', 'planks', 'bricks', 'wicker'].map(r => [r, ['leanto', 'cottage'].reduce((n, b) => n + (w.flows[`${r}:-build ${b}`] ?? 0), 0)]));
const checkpoints = {
  food: load('1000-food-checkpoint.json'),
  housing: load('1000-full-beds-checkpoint.json'),
  service: load('service-checkpoint.json'),
};
const oldOffer = load('1000-recruit-checkpoint.json').world.decisions.find((d: { kind: string }) => d.kind === 'recruit');
const housingWorld = checkpoints.housing.world as World;
const returning: Colonist = oldOffer.options.find((c: Colonist) => !c.fee && !housingWorld.colonists.some(p => p.id === c.id || p.name === c.name));
assert(returning && returning.id < housingWorld.nextColonistId);
const durations = { food: 336, housing: 336, service: 336 };
const results = [];
const initialHashes: Record<string, string> = {};
for (const scenario of ['food', 'housing', 'service'] as const) {
  const checkpoint = checkpoints[scenario], serialized = JSON.stringify(checkpoint.world);
  const checkpointHash = createHash('sha256').update(serialized + ':' + checkpoint.decisionState).digest('hex');
  const tavern = scenario === 'service' ? checkpoint.metadata.tavern as number : null;
  const originalBartender = tavern == null ? null : workersAt(checkpoint.world, tavern)[0]?.id;
  if (scenario === 'housing') assert.equal(beds(checkpoint.world), alive(checkpoint.world).length);
  if (scenario === 'service') assert(originalBartender != null && drinkableTotal(checkpoint.world) > 0);
  for (const curve of ['current', 'gentler']) for (const shock of [false, true]) {
    const w: World = JSON.parse(serialized); let state = checkpoint.decisionState;
    assert.equal(JSON.stringify(w), serialized);
    if (controlled) w.nextEventHour = w.hour + durations[scenario] + 24;
    START.comfortScale = { base: 1.4, slope: 1, ...(curve === 'gentler' ? { curve: REWARD_COMFORT_CURVE } : {}) };
    const rand = () => ((state = (state * 1103515245 + 12345) >>> 0) / 4294967296);
    const decide = () => {
      if (controlled) for (let i = w.decisions.findIndex(d => d.kind === 'recruit'); i >= 0; i = w.decisions.findIndex(d => d.kind === 'recruit')) {
        const [offer] = w.decisions.splice(i, 1); w.decisions.unshift(offer);
        assert.equal(apply(w, { type: 'resolve', option: 99 }), null);
      }
      autoDecide(w, 'greedy', rand);
    };
    const initialFood = foodAvailable(w), initialPeople = alive(w).length, initialLosses = w.stats.departures + w.stats.deaths;
    const flowStart = housingFlow(w), eventStart = new WeakSet(w.log);
    const events: object[] = [], trace: ReturnType<typeof sample>[] = [];
    const intervention: Record<string, unknown> = { kind: scenario, shock, ...(scenario === 'service' ? { commonPolicy: 'Reserve the serving trade for a bartender; defer the founders feast during the observation window.', divertedServiceHours: shock ? 48 : 0 } : {}) };
    let reliefEvents = 0;
    const collectEvents = () => {
      for (const log of w.log) if (!eventStart.has(log)) {
        eventStart.add(log); events.push({ at: w.hour - checkpoint.world.hour, ...log });
        if (/strain eases|strain eased|festival:/i.test(log.text)) reliefEvents++;
      }
    };
    if (shock && scenario === 'food') {
      const removed: Record<string, number> = {};
      let remaining = Math.max(0, initialFood - initialPeople * 0.5);
      for (const r of [...FOODS].filter(r => !w.forbidden.includes(r)).sort((a, b) => onHand(w, b) - onHand(w, a))) {
        const amount = useUp(w, r, Math.min(remaining, onHand(w, r)), 'recovery-probe-loss');
        if (amount) removed[r] = amount; remaining -= amount;
      }
      intervention.removed = removed; intervention.foodBefore = initialFood; intervention.foodAfter = foodAvailable(w);
      assert(Math.abs(foodAvailable(w) - initialPeople * 0.5) < 1e-6);
    }
    if (shock && scenario === 'housing') {
      assert.equal(w.decisions.length, 0);
      w.decisions.push({ kind: 'recruit', options: [structuredClone(returning)] });
      assert.equal(apply(w, { type: 'resolve', option: 0 }), null);
      assert.equal(alive(w).length, initialPeople + 1);
      assert.equal(new Set(w.colonists.map(c => c.id)).size, w.colonists.length);
      intervention.returningRecruit = { id: returning.id, name: returning.name };
      intervention.populationBefore = initialPeople; intervention.populationAfter = alive(w).length;
    }
    const servicePolicy = () => {
      if (scenario !== 'service') return;
      const elapsed = w.hour - checkpoint.world.hour;
      if (shock && elapsed < 48 - 1e-6) {
        for (const c of alive(w).filter(c => tradeOf(w, c) === 'serving')) assert.equal(apply(w, { type: 'trade', colonist: c.id, trade: null }), null);
        assert.equal(workersAt(w, tavern!).length, 0, 'the 48-hour service interruption must be real');
      } else {
        const person = alive(w).find(c => c.id === originalBartender && !bedridden(c) && c.errand == null)
          ?? alive(w).find(c => tradeOf(w, c) == null && !bedridden(c) && c.errand == null);
        if (person) assert.equal(apply(w, { type: 'trade', colonist: person.id, trade: 'serving' }), null);
      }
    };
    servicePolicy();
    const interventionHash = createHash('sha256').update(JSON.stringify(w)).digest('hex');
    const key = `${scenario}:${shock}`;
    if (initialHashes[key]) assert.equal(interventionHash, initialHashes[key], 'both curves start from the exact same treated/control world');
    initialHashes[key] = interventionHash;
    const exposure = { hungryPersonHours: 0, homelessPersonHours: 0, sulkerPersonHours: 0, tavernStaffHours: 0, buildingPersonHours: 0 };
    function sample() {
      const people = alive(w), parts = people.map(c => comfortParts(w, c));
      const average = (key: 'shelter' | 'meals' | 'evenings' | 'drink') => parts.reduce((n, p) => n + (p[key] ?? 0), 0) / Math.max(1, parts.length);
      return { at: w.hour - checkpoint.world.hour, hour: w.hour, pop: people.length, food: foodAvailable(w), beds: beds(w), hungry: people.filter(c => c.hunger < 25).length,
        homeless: people.filter(c => c.bed == null).length, mood: avgMood(w), lowestMood: Math.min(...people.map(c => c.mood)),
        comfort: colonyComfort(w), strain: w.strain, shelter: average('shelter'), meals: average('meals'), evenings: average('evenings'), drink: average('drink'),
        serviceStaff: tavern == null ? 0 : workersAt(w, tavern).length, regularDrinkFlow: drinkFlow(w),
        departures: w.stats.departures, deaths: w.stats.deaths, status: w.status, chartersDone: w.chartersDone.length,
        housingMaterials: housingFlow(w), ...exposure };
    }
    trace.push(sample());
    for (let hour = 0; hour < durations[scenario] && w.status === 'playing'; hour++) {
      decide(); servicePolicy(); collectEvents();
      for (let t = 0; t < TICKS_PER_HOUR && w.status === 'playing'; t++) {
        const people = alive(w);
        exposure.hungryPersonHours += people.filter(c => c.hunger < 25).length / TICKS_PER_HOUR;
        exposure.homelessPersonHours += people.filter(c => c.bed == null).length / TICKS_PER_HOUR;
        exposure.sulkerPersonHours += people.filter(c => c.sulking).length / TICKS_PER_HOUR;
        exposure.buildingPersonHours += people.filter(c => c.activity === 'building').length / TICKS_PER_HOUR;
        if (tavern != null) exposure.tavernStaffHours += workersAt(w, tavern).length / TICKS_PER_HOUR;
        tick(w); if (w.decisions.length) decide(); servicePolicy(); collectEvents();
        assert(FOODS.every(r => w.res[r] >= -1e-6));
      }
      if (w.status === 'playing') {
        if (scenario === 'service') {
          // A player can defer the founders' feast. Suppress only the bot's automatic
          // call during planning, restoring the field before any simulation tick.
          const previous = w.feast;
          w.feast = { ...(previous ?? { readyAt: 0, done: false }), called: true };
          try { autoBuild(w); } finally { w.feast = previous; }
          assert(!w.feast?.called);
        } else autoBuild(w);
      }
      servicePolicy(); collectEvents(); trace.push(sample());
    }
    const end = trace[trace.length - 1];
    const sustained = (predicate: (s: typeof end) => boolean, length: number, after = 0) => {
      for (let i = 0; i + length <= trace.length; i++) {
        if (trace[i].at < after - 1e-6) continue;
        const group = trace.slice(i, i + length);
        if (group.every(predicate)) return trace[i].at;
      }
      return null;
    };
    const serviceRelease = trace.find(s => s.at >= 48 - 1e-6);
    const summary = { scenario, curve, shock, variant: controlled ? 'controlled' : 'event-on', checkpointHash, interventionHash, intervention, forkHour: checkpoint.world.hour,
      observedHours: end.at, outcome: w.status, initialPopulation: initialPeople, endPopulation: end.pop,
      minFood: Math.min(...trace.map(t => t.food)), minimumMood: Math.min(...trace.map(t => t.lowestMood)), peakStrain: Math.max(...trace.map(t => t.strain)), endStrain: end.strain,
      losses: w.stats.departures + w.stats.deaths - initialLosses, reliefEvents,
      resourceRecoveryHours: scenario === 'food' ? sustained(s => s.food >= s.pop * 2 && s.hungry === 0, 13)
        : scenario === 'housing' ? sustained(s => s.homeless === 0 && s.beds >= initialPeople + (shock ? 1 : 0), 25)
        : !shock ? 0 : sustained(s => s.serviceStaff > 0 && s.regularDrinkFlow > (serviceRelease?.regularDrinkFlow ?? Infinity), 1, 48),
      recoveryCriterion: scenario === 'food' ? 'At least two accessible stored food units per settler and nobody hungry, sustained for 12 hours.'
        : scenario === 'housing' ? 'Everyone has a bed and initial population capacity is restored, sustained for 24 hours.'
        : 'After hour 48, a staffed tavern and a new regular drink stock charge since release; excludes festival charges.',
      housingMaterialsUsed: Object.fromEntries(Object.entries(housingFlow(w)).map(([r, n]) => [r, n - (flowStart[r] ?? 0)])), ...exposure,
    };
    results.push(summary);
    writeFileSync(`${out}/${scenario}-${curve}-${shock ? 'shock' : 'control'}.json`, JSON.stringify({ summary, trace, events }, null, 2));
    console.log(JSON.stringify(summary));
  }
}
START.comfortScale = { base: 1.4, slope: 1 };
writeFileSync(`${out}/summary.json`, JSON.stringify({ variant: controlled ? 'controlled' : 'event-on', commonRestrictions: controlled ? 'New storyteller events deferred beyond the window; routine recruit offers declined. Other simulation, trade, weather, disease and festival rules remain active.' : 'Normal events and routine recruitment.', durationHours: 336, serviceInterruptionHours: 48, results }, null, 2));
