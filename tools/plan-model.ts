// Planning model for the root-families ladder (option A): routes per map, how many drafts a win takes under the real
// offer rules, and whether the labour fits the proposed targets. Not a test. npx tsx tools/plan-model.ts
import { BUILDINGS, BuildingDef, membersOf, InputKey, ResourceId, SiteId, SITES, MEALS, DRINKS, BASE_RATE, STAR_MULT, TIER } from '../src/sim/content';
import { createWorld, DRINK_SITES, siteOk, World } from '../src/sim/world';

type Route = { d: Set<string>; h: number };
function prune(list: Route[]) {
  const best = new Map<string, Route>();
  for (const c of list) { const k = [...c.d].sort().join('+'); if (!best.has(k) || best.get(k)!.h > c.h) best.set(k, c); }
  const xs = [...best.values()];
  return xs.filter(a => !xs.some(b => b !== a && b.d.size <= a.d.size && [...b.d].every(x => a.d.has(x)) && b.h <= a.h && (b.d.size < a.d.size || b.h < a.h)));
}
/** every way to make a good on this map: the drafted buildings it needs and worker-hours per unit (speed 1, no walking) */
function routesOn(w: World, keepAll = false) {
  const memo = new Map<string, Route[]>();
  const routes = (good: ResourceId, depth = 7): Route[] => {
    const key = good + depth; if (memo.has(key)) return memo.get(key)!;
    if (depth < 0) return [];
    let out: Route[] = [];
    for (const d of BUILDINGS as BuildingDef[]) {
      if (!siteOk(w, d)) continue;
      for (const rec of d.recipes ?? []) {
        if (rec.output !== good) continue;
        let combos: Route[] = [{ d: new Set(d.draftable ? [d.id] : []), h: 1 / (BASE_RATE[rec.output] * STAR_MULT[rec.stars]) }];
        for (const [k, amt] of Object.entries(rec.inputs) as [InputKey, number][]) {
          const opts = membersOf(k).flatMap(m => routes(m, depth - 1));
          if (!opts.length) { combos = []; break; }
          // per unit of output: a recipe making `make` from `amt` takes amt/make of each input per unit
          const per = amt / rec.make;
          combos = prune(combos.flatMap(c => opts.map(x => ({ d: new Set([...c.d, ...x.d]), h: c.h + per * x.h }))));
        }
        out.push(...combos);
      }
    }
    out = keepAll ? out : prune(out); memo.set(key, out); return out;
  };
  return routes;
}

const SITE_IDS = SITES.map(s => s.id);
const maps: SiteId[][] = [];
for (let i = 0; i < SITE_IDS.length; i++) for (let j = i + 1; j < SITE_IDS.length; j++) if ([SITE_IDS[i], SITE_IDS[j]].some(x => DRINK_SITES.includes(x))) maps.push([SITE_IDS[i], SITE_IDS[j]]);

const QM = MEALS.filter(r => TIER[r] === 'quality'), QD = DRINKS.filter(r => TIER[r] === 'quality');
const fmt = (r: Route) => `${r.d.size}d ${r.h.toFixed(1)}h [${[...r.d].sort().join(' ')}]`;

// ---- 1. routes per map
console.log('=== 1. Cheapest routes per map (drafts, worker-hours per unit at speed 1 incl. gathering) ===');
const perMap = new Map<string, Record<string, Route[]>>();
for (const m of maps) {
  const w = createWorld(3); w.sites = m;
  const R = routesOn(w);
  const table: Record<string, Route[]> = {};
  for (const g of [...QM, ...QD, 'bread', 'hotpot', 'pie', 'ale', 'cider', 'mead', 'stew', 'planks'] as ResourceId[]) table[g] = R(g).sort((a, b) => a.d.size - b.d.size || a.h - b.h);
  perMap.set(m.join('+'), table);
  const best = (gs: ResourceId[]) => gs.flatMap(g => table[g].slice(0, 1).map(r => `${g} ${fmt(r)}`));
  console.log(`${m.join('+').padEnd(12)} meals: ${best(QM).join(' | ')}`);
  console.log(`${''.padEnd(12)} drinks: ${best(QD).join(' | ')}`);
}

// ---- 2. drafts for a win, Monte Carlo with the real offer rules (3 random, a helper for the charter until two are
// owned, the missing link). The player wants: one tier-2 charter (cheapest of bread / hotpot / cellar), then a quality
// meal and a quality drink. Greedy: take the offer that cuts the drafts still needed the most.
console.log('\n=== 2. Drafts a win takes (Monte Carlo, 400 runs per map) ===');
function seeded(seed: number) { let r = seed; return () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296); }
const T2: Record<string, ResourceId[]> = { bread: ['bread'], hotpot: ['hotpot'], taproom: ['ale', 'cider', 'mead'] };
const helpersOf: Record<string, string[]> = { bread: ['mill', 'bakery', 'field'], hotpot: ['smokehouse', 'cookhouse', 'dock', 'herbgarden'], taproom: ['brewery', 'ciderpress', 'tavern', 'field', 'orchard'] };
const summary: string[] = [];
for (const m of maps) {
  const w = createWorld(3); w.sites = m;
  const R = routesOn(w);
  const pool0 = BUILDINGS.filter(b => b.draftable && siteOk(w, b)).map(b => b.id);
  const needSets = (goods: ResourceId[]) => goods.flatMap(g => R(g)).map(r => r.d);
  const meal = needSets(QM), drink = needSets(QD);
  const t2 = Object.fromEntries(Object.entries(T2).map(([k, gs]) => [k, needSets(gs)])) as Record<string, Set<string>[]>;
  const left = (owned: Set<string>, sets: Set<string>[]) => Math.min(...sets.map(s => [...s].filter(x => !owned.has(x)).length));
  const charters = new Map<string, number>();
  const res: number[] = [], t2at: number[] = [], fin: number[] = [], kinds = new Map<string, number>();
  for (let run = 0; run < 400; run++) {
    const rand = seeded(run * 7919 + 13);
    const owned = new Set<string>();
    // the tier-2 charter: PLAN=1 picks the one whose route overlaps the cheapest finale most (a planning player);
    // otherwise the one cheapest on its own (ties at random)
    const winCost = (c: string) => Math.min(...t2[c].flatMap(s => meal.flatMap(a => drink.map(d => new Set([...s, ...a, ...d]).size))));
    const order = Object.keys(T2).sort((a, b) => (process.env.PLAN ? winCost(a) - winCost(b) : left(owned, t2[a]) - left(owned, t2[b])) || rand() - 0.5);
    const charter = order[0];
    let drafts = 0, phase: 'c2' | 'fin' = 'c2';
    const remaining = () => phase === 'c2' ? left(owned, t2[charter]) : (() => {
      // the finale: the cheapest meal + drink pair given what's owned
      let best = 99;
      for (const a of meal) for (const b of drink) { const u = new Set([...a, ...b]); best = Math.min(best, [...u].filter(x => !owned.has(x)).length); }
      return best;
    })();
    while (drafts < 40) {
      if (phase === 'c2' && remaining() === 0) { phase = 'fin'; t2at.push(drafts); }
      if (phase === 'fin' && remaining() === 0) break;
      drafts++;
      const pool = pool0.filter(id => !owned.has(id));
      const opts = [...pool].sort(() => rand() - 0.5).slice(0, 3);
      // a helper for the current charter until two are owned
      if (phase === 'c2') {
        const hs = helpersOf[charter].filter(h => pool.includes(h));
        if (hs.length && helpersOf[charter].filter(h => owned.has(h)).length < 2 && !opts.some(o => hs.includes(o))) opts[2] = hs[Math.floor(rand() * hs.length)];
      }
      // FIN_HELP=1: the finale guarantees a helper too: one offer always advances the cheapest finale pair
      const FH = ['pieoven', 'supperhouse', 'stillhouse', 'apothecary'];
      if (phase === 'fin' && process.env.FIN_HELP === '2') {
        const hs = FH.filter(h => pool.includes(h));
        if (hs.length && FH.filter(h => owned.has(h)).length < 2 && !opts.some(o => hs.includes(o))) opts[2] = hs[Math.floor(rand() * hs.length)];
      }
      if (phase === 'fin' && process.env.FIN_HELP === '1') {
        const pairs = meal.flatMap(a => drink.map(d => new Set([...a, ...d])));
        const need = Math.min(...pairs.map(p => [...p].filter(x => !owned.has(x)).length));
        const hs = [...new Set(pairs.filter(p => [...p].filter(x => !owned.has(x)).length === need).flatMap(p => [...p].filter(x => !owned.has(x))))];
        if (hs.length && !opts.some(o => hs.includes(o))) opts[2] = hs[Math.floor(rand() * hs.length)];
      }
      // the missing link: when the current target waits on one blueprint, it's offered
      const sets = phase === 'c2' ? t2[charter] : meal.flatMap(a => drink.map(b => new Set([...a, ...b])));
      const links = [...new Set(sets.filter(s => [...s].filter(x => !owned.has(x)).length === 1).flatMap(s => [...s].filter(x => !owned.has(x))))];
      if (links.length && !opts.some(o => links.includes(o))) opts[1] = links[Math.floor(rand() * links.length)];
      // take the offer that cuts the remaining count most (finale lookahead during charter 2 breaks ties)
      const score = (id: string) => { owned.add(id); const a = remaining(); const pf = phase; phase = 'fin'; const b = remaining(); phase = pf; owned.delete(id); return a * 10 + b; };
      const pickId = opts.sort((a, b) => score(a) - score(b))[0];
      owned.add(pickId);
    }
    charters.set(charter, (charters.get(charter) ?? 0) + 1);
    res.push(drafts); fin.push(drafts - (t2at.at(-1) ?? 0));
    // which meal route the run ended on
    const done = QM.filter(g => R(g).some(r => [...r.d].every(x => owned.has(x))));
    for (const g of done) kinds.set(g, (kinds.get(g) ?? 0) + 1);
  }
  const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
  summary.push(`${m.join('+').padEnd(12)} drafts to win: median ${q(res, 0.5)} (p10 ${q(res, 0.1)}, p90 ${q(res, 0.9)}) · charter 2 route by draft ${q(t2at, 0.5)} · finale needs ${q(fin, 0.5)} more · charter 2: ${[...charters].map(([g, n]) => `${g} ${Math.round(n / 4)}%`).join(', ')} · meal routes owned: ${[...kinds].map(([g, n]) => `${g} ${Math.round(n / 4)}%`).join(', ')}`);
}
console.log(summary.join('\n'));

// ---- 3. per-unit labour of the basics (grove+soil), and the finale bill at 8 colonists
{
  const w = createWorld(3); w.sites = ['grove', 'soil'];
  const R = routesOn(w);
  const h = (g: ResourceId) => Math.min(...R(g).map(r => r.h));
  console.log('\n=== 3. Labour per unit (grove+soil, cheapest) ===');
  console.log((['stew', 'smokedFish', 'flour', 'bread', 'pie', 'hotpot', 'honeycake', 'harvest', 'ale', 'cider', 'hippocras', 'cordial', 'planks', 'wood'] as ResourceId[]).map(g => `${g} ${h(g).toFixed(2)}h`).join(' · '));
  const meal = Math.min(...QM.map(h)), drink = Math.min(...QD.map(h));
  console.log(`finale at 8 colonists: 8 quality meals ${(8 * meal).toFixed(1)}h + 8 quality drinks ${(8 * drink).toFixed(1)}h + 30 planks ${(30 * h('planks')).toFixed(1)}h = ${(8 * meal + 8 * drink + 30 * h('planks')).toFixed(1)} worker-hours at speed 1`);
}
