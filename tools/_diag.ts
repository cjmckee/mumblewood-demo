import { createWorld, tick, day, alive, avgMood, TICKS_PER_HOUR, built, workersAt, charterRequirements, blockedReason, strainPerDay, remainingCost, feastCheck, colonyComfort } from '../src/sim/world';
import { autoDecide, autoBuild, finaleRoutes, charterChain, staffPlan } from '../src/sim/autoplayer';
const seed = Number(process.argv[2]), every = Number(process.argv[3] ?? 2);
const w = createWorld(seed); let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
const KEY = ['wood','planks','bricks','wicker','berries','fish','mushrooms','grain','acorns','apples','honey','herbs','flour','mash','must','stew','bread','smokedFish','skewers','pie','hotpot','fishpie','banquet','platter','supper','ale','cider','mead','mulled','spirits','cordial','hippocras'];
let lastLog = 0;
while (w.status === 'playing' && day(w) <= 90) {
  autoDecide(w, 'greedy', rand);
  for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
  autoBuild(w);
  if (Math.round(w.hour) % 24 === 12 && day(w) % every === 0) {
    const jobs: Record<string, number> = {}; for (const b of built(w)) { const n = workersAt(w, b.uid).length; if (n) jobs[b.def] = (jobs[b.def] ?? 0) + n; }
    const tr: Record<string, number> = {}; for (const c of alive(w)) tr[c.trade ?? 'labor'] = (tr[c.trade ?? 'labor'] ?? 0) + 1;
    const req = charterRequirements(w).map(x => `${x.metric.kind}${(x.metric as any).def ? ':' + (x.metric as any).def : ''} ${x.value.toFixed(0)}/${x.target}`).join('; ');
    const fin = w.buildings.filter(b => b.def === 'pavilion' || b.def === 'hall').map(b => `${b.def} built=${b.built} stage=${b.stage ?? 0} prog=${b.progress.toFixed(1)} left=${JSON.stringify(remainingCost(b))}`).join(' ');
    const routes = finaleRoutes(w).map(x => `${x.key}→${x.good} via ${x.steps.map(s => s.def + ':' + s.output).join('>')}`).join(' | ');
    const stock = KEY.filter(k => (w.res as any)[k] >= 1).map(k => `${k} ${Math.floor((w.res as any)[k])}`).join(', ');
    const blocked = built(w).filter(b => blockedReason(w, b)).map(b => `${b.def}: ${blockedReason(w, b)}`);
    console.log(`=== d${day(w)} pop ${alive(w).length} mood ${avgMood(w).toFixed(0)} (min ${Math.min(...alive(w).map(c => c.mood)).toFixed(0)}, sulk ${alive(w).filter(c => c.sulking).length}) strain ${w.strain.toFixed(1)} (+${strainPerDay(w).toFixed(2)}/d) comfort ${(colonyComfort(w)*100).toFixed(0)}% | ${w.charter} [${req}]`);
    console.log(`  trades ${JSON.stringify(tr)} at ${JSON.stringify(jobs)}`);
    console.log(`  plan ${[...staffPlan(w)].filter(([, n]) => n).map(([u, n]) => w.buildings.find(b => b.uid === u)!.def + ':' + n).join(',')} · chain ${charterChain(w).join(',')}`);
    if (fin || routes) console.log(`  finale ${fin} · routes ${routes}${w.charter === 'longtable' ? ' · feast ' + JSON.stringify(feastCheck(w)) : ''}`);
    console.log(`  stock ${stock}`);
    console.log(`  sites ${w.buildings.filter(b => !b.built).map(b => b.def).join(',')} · forbidden ${w.forbidden.join(',')}`);
    if (blocked.length) console.log(`  blocked ${blocked.join(' | ')}`);
    const newLog = w.log.slice(lastLog).filter(l => /lueprint|charter|Charter|drafted|research|study|left|died|leaves|feast|Crown|arriv|joins|joined/i.test(l.text)).map(l => l.text); lastLog = w.log.length;
    if (newLog.length) console.log(`  log: ${newLog.slice(-10).join(' | ')}`);
  }
}
console.log(`END ${w.status} day ${day(w)} charters ${w.chartersDone.join(',')} owned ${w.owned.join(',')}`);
