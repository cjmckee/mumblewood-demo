// Headless check of the notables slice: a simple scripted player, printed day by day.
// npx tsx tools/slice-check.ts [seed] [days]
import { createWorld, start, tick, choose, World, day, hourOfDay, total, people, workers, spots, place, assign, festival, festivalReady, festivalCost, cookedCount, charterParts, charterAction, doCharterAction, partsMet, freeBeds, building, atLeast } from '../src/slice/sim';
import { BUILDING, ALWAYS_BUILDABLE, DISHES, CRAFT_NAME } from '../src/slice/content';

const seed = +(process.argv[2] ?? 1), days = +(process.argv[3] ?? 30), quiet = process.env.QUIET === '1';
const w = createWorld(seed); start(w);
const prefer = ['dock', 'bakery', 'field', 'smokehouse', 'sawmill', 'tavern', 'brewery', 'cottage'];
function decide(w: World) {
  while (w.decisions.length) {
    const d = w.decisions[0];
    let i = 0;
    if (d.kind === 'blueprint') i = d.options.map(o => prefer.indexOf(o)).reduce((b, v, k, a) => (v < a[b] ? k : b), 0);
    if (d.kind === 'event' && d.id === 'family') i = 0;
    choose(w, i);
  }
}
function tryBuild(def: string) {
  const s = spots(w, def).sort((a, b) => Math.hypot(a[0] - 6, a[1] - 8) - Math.hypot(b[0] - 6, b[1] - 8))[0];
  return s ? place(w, def, s[0], s[1]) === null : false;
}
function play() {
  // a building for every notable without one, preferring their passion
  for (const n of w.notables) if (n.workplace === null) {
    const free = w.buildings.find(b => b.built && !b.leader && BUILDING[b.def].craft === n.passion) ?? w.buildings.find(b => b.built && !b.leader && BUILDING[b.def].craft && BUILDING[b.def].recipes!.some(r => Object.keys(r.take).length || r.anyRaw));
    if (free) assign(w, n.id, free.id);
    else {
      const def = [...ALWAYS_BUILDABLE, ...w.owned].find(d => BUILDING[d].craft === n.passion && !w.buildings.some(b => b.def === d && !b.leader));
      if (def) tryBuild(def);
    }
  }
  if (!w.buildings.some(b => b.def === 'kitchen')) tryBuild('kitchen');
  if (freeBeds(w) < 2 && !w.buildings.some(b => !b.built && b.def === 'leanto')) tryBuild('leanto');
  for (const d of w.owned) if (!w.buildings.some(b => b.def === d)) tryBuild(d);
  if (w.strain > 35 && festivalReady(w) && cookedCount(w) >= festivalCost(w) + 4) festival(w);
  if (charterAction(w) && partsMet(w)) doCharterAction(w);
}
for (let h = 0; h < days * 24 && !w.outcome; h++) {
  decide(w); if (hourOfDay(w) === 9) play(); tick(w);
  if (hourOfDay(w) === 21 && !quiet) {
    const cp = charterParts(w).map(p => `${p.label} ${p.have}/${p.need}`).join(', ');
    console.log(`d${day(w)} pop ${people(w)} (${w.notables.length}n ${workers(w)}w, unled ${w.unled}) strain ${w.strain.toFixed(0)} food raw ${total(w, 'berries') + total(w, 'fish')} cooked ${cookedCount(w)} good+ ${atLeast(w, DISHES, 1)} fine+ ${atLeast(w, DISHES, 2)} wood ${total(w, 'wood')} planks ${total(w, 'planks')} beds ${freeBeds(w)} unfed ${w.unfed} | ${w.charter?.id ?? '-'} ${cp} | done ${w.done.join(',')}`);
    console.log('   ' + w.notables.map(n => `${n.name.split(' ')[0]}(${n.passion.slice(0, 4)}${n.workplace ? '@' + building(w, n.workplace)!.def : ' idle'} m${n.mood.toFixed(0)} c${n.crew} r${n.rep} q${n.skill[n.passion].toFixed(1)})`).join(' '));
  }
}
console.log(`outcome ${w.outcome ?? 'none'} day ${day(w)} ${w.endReason} joined ${w.stats.joined} left ${w.stats.left} departed ${w.stats.departed.join(',')} drafted ${w.stats.drafted.join(',')}`);
if (process.env.DUMP) require('node:fs').writeFileSync(process.env.DUMP, JSON.stringify(w));
