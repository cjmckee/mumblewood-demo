// Decision cards: charter offers show each condition's route and what finishing pays; the next charter is offered
// before the charter's cornerstone; event options that spend goods say so. Usage: npx tsx tools/charter-card-check.ts
import { createWorld, apply, runHours, debugGrow, charterRequirements, World } from '../src/sim/world';
import { charterPreview, Route } from '../src/sim/charterplan';
import { EVENTS, PERKS } from '../src/sim/content';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const steps = (r?: Route) => (r?.steps ?? []).map(s => `${s.how}:${s.def}`);

const w: World = createWorld(777);
const settled = charterPreview(w, 'settled');
const meals = settled.conditions.find(c => c.text === '25 meals');
check(!!meals && steps(meals.route).includes('study:kitchen'), `fresh colony: meals need the stew kitchen studied (${steps(meals?.route)})`);
const smoke = charterPreview(w, 'woodsmoke').conditions.find(c => c.text === '20 smoked fish');
check(steps(smoke?.route).includes('draft:dock'), `smoked fish needs a fishing dock drafted (${steps(smoke?.route)})`);
const planks = charterPreview(w, 'firstplanks').conditions.find(c => c.text.includes('fine materials'));
check(planks?.route?.state === 'ready' && planks.route.by === 'woodcutter', 'fine materials: the woodcutter already rough-saws planks');
check(settled.rewards.includes('30 gold') && settled.rewards.some(r => r.startsWith('strain −')) && settled.rewards.includes('a cornerstone'), `tier 1 pays gold, strain relief and a cornerstone (${settled.rewards})`);
check(charterPreview(w, 'hall').rewards.join() === 'wins the run', 'a finale wins the run');
const pop = settled.conditions.find(c => c.text === '6 colonists');
check(!!pop && !pop.met && pop.have === '3 now', 'population shows how many there are now');

// once the basics are studied, the kitchen only has to be placed
debugGrow(w, 6);
const known = charterPreview(w, 'settled').conditions.find(c => c.text === '25 meals');
check(steps(known?.route).includes('build:kitchen'), `after research the kitchen is "build" (${steps(known?.route)})`);

// a map without a meadow can never make tonics
const noMeadow = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => createWorld(s)).find(x => !x.sites.includes('meadow'))!;
const tonic = charterPreview(noMeadow, 'hearty').conditions.find(c => c.text === '12 tonics');
check(tonic?.route?.state === 'never', 'tonics without a meadow: not on this map');

// variety lists a route per kind
const tasting = charterPreview(w, 'tasting').conditions.find(c => c.text.startsWith('3 kinds of drink'));
check((tasting?.routes?.length ?? 0) === 3, `three drink routes are listed (${tasting?.routes?.map(r => r.good)})`);

// finishing a charter: the next charter is offered first, then its cornerstone
const g = createWorld(4242);
while (g.decisions.length) apply(g, { type: 'resolve', option: 0 });
debugGrow(g, 7);
g.charter = 'settled'; g.charterTier = 1; g.charterHolds = [];
g.res.stew = 40; g.moodLog = Array(24).fill(90);
for (const c of g.colonists) c.mood = 90;
runHours(g, 2);
check(g.chartersDone.includes('settled'), 'the charter completes');
check(g.decisions[0]?.kind === 'charter' && g.decisions[1]?.kind === 'perk', `next charter comes before the cornerstone (${g.decisions.map(d => d.kind)})`);

// the requirement row names what it counts
const h = createWorld(5); h.charter = 'bread';
check(charterRequirements(h).some(r => r.label.endsWith('/ 20 bread')), `stock requirement names the good (${charterRequirements(h).map(r => r.label)})`);

// any option whose label spends gold, meals, drinks, food, wood or planks declares it, with what happens if short
const spends = /(\d+) (gold|meals?|drinks?|food|wood|planks)|Pay \d+|Toss them \d+|Slip him \d+/;
for (const e of EVENTS) for (const o of e.options) if (spends.test(o.label) && !o.label.startsWith('Trade') || o.effect === 'peddlerPlanks') check(!!o.needs && !!o.short, `${e.id}: "${o.label}" declares its cost`);
check(PERKS.filter(p => /−\d|faster\.$/.test(p.desc) && /mood|worse|Strain grows/.test(p.desc)).length === 0, 'cornerstone costs are kept apart from the bonus');

console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exit(1);
