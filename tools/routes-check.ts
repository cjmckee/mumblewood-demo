// Forces each drink route on a map that has its site, staffs it, and checks the drinks come out of the right recipe.
// Also checks: flower beds raise an apiary's output; maps never offer a gatherer for a site they lack.
// Usage: npx tsx tools/routes-check.ts
import { CATEGORIES, BUILDING_BY_ID } from '../src/sim/content';
import { createWorld, debugGrow, apply, runHours, findSpot, built, workersAt, alive, World, efficiencyAt, currentRecipe, canPlace, reconcileStock, WALKING_WOUNDED } from '../src/sim/world';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

/** first seed whose map has the site */
function worldWith(site: string): World {
  for (let s = 1; s < 500; s++) { const w = createWorld(s * 101); if (w.sites.includes(site as any)) { debugGrow(w, 6); while (w.decisions.length) apply(w, { type: 'resolve', option: 0 }); return w; } }
  throw new Error('no map with ' + site);
}
function put(w: World, id: string, nearGood = true) {
  if (!w.owned.includes(id)) w.owned.push(id);
  const spot = findSpot(w, id);
  if (!spot) throw new Error('no spot for ' + id);
  if (apply(w, { type: 'place', def: id, x: spot.x, y: spot.y })) throw new Error('could not place ' + id);
  const b = w.buildings[w.buildings.length - 1]; b.built = true; void nearGood;
  return b;
}
function staff(w: World, b: ReturnType<typeof put>, n: number) {
  const free = alive(w).filter(c => c.job == null).slice(0, n);
  for (const c of free) apply(w, { type: 'assign', colonist: c.id, building: b.uid });
  return workersAt(w, b.uid).length;
}
const made = (w: World, key: string) => w.flows[key] ?? 0;
/** run the clock, waving through any decision that comes up (the world pauses while one is waiting) */
function run(w: World, hours: number) { for (let h = 0; h < hours; h++) { while (w.decisions.length) apply(w, { type: 'resolve', option: 99 }); runHours(w, 1); } }

const routes: { site: string; gatherer: string; maker: string; drink: string; input: string }[] = [
  { site: 'soil', gatherer: 'field', maker: 'brewery', drink: 'ale', input: 'grain' },
  { site: 'grove', gatherer: 'orchard', maker: 'ciderpress', drink: 'cider', input: 'apples' },
  { site: 'meadow', gatherer: 'apiary', maker: 'brewery', drink: 'mead', input: 'honey' },
];
for (const r of routes) {
  const w = worldWith(r.site);
  const g = put(w, r.gatherer), m = put(w, r.maker);
  check(g.eff > 0.3, `${r.gatherer} on ${r.site}: works at ${Math.round(g.eff * 100)}% (${efficiencyAt(w, g.def, g.x, g.y).label})`);
  // start everyone as a laborer so the route gets its workers (the opening auto-assign fills the woodcutter and forager)
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  const ng = staff(w, g, 2), nm = staff(w, m, 2);
  check(ng >= 1 && nm === 2, `${ng} on the ${r.gatherer}, ${nm} on the ${r.maker}`);
  run(w, 72);
  const out = made(w, `${r.drink}:+${r.maker}`), used = made(w, `${r.input}:-${r.maker}`);
  check(out > 5 && used > 5, `${r.maker} turned ${used.toFixed(0)} ${r.input} into ${out.toFixed(0)} ${r.drink} in 3 days`);
  // whenever the input is on hand, that recipe is the one running (between deliveries it falls back to berry ale)
  let onHand = 0, right = 0;
  for (let h = 0; h < 24; h++) { run(w, 1); if (w.res[r.input as 'honey'] + (m.inbox[r.input as 'honey'] ?? 0) >= 3) { onHand++; if (currentRecipe(w, m)?.output === r.drink) right++; } }
  check(onHand > 0 && right === onHand, `${r.maker} runs its ${r.drink} recipe whenever ${r.input} is on hand (${right} of ${onHand} hours)`);
  void CATEGORIES;
}

// berry fallback: a brewery with no grain or honey makes ★ berry ale, the press ★★ berry ale for fewer berries
{
  const w = worldWith('grove');
  const b = put(w, 'brewery'), p = put(w, 'ciderpress');
  // mulling also takes berries as a flavouring; keep it out of the berries-per-ale count
  for (const x of [b, p]) x.off = (BUILDING_BY_ID[x.def].recipes ?? []).flatMap((r, i) => r.output === 'mulled' ? [i] : []);
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  staff(w, b, 1); staff(w, p, 1);
  run(w, 48);
  const brewAle = made(w, 'ale:+brewery'), pressAle = made(w, 'ale:+ciderpress');
  const brewPer = made(w, 'berries:-brewery') / Math.max(0.01, brewAle), pressPer = made(w, 'berries:-ciderpress') / Math.max(0.01, pressAle);
  check(brewAle > 0 && pressAle > 0, `both make berry ale without grain (${brewAle.toFixed(1)} vs ${pressAle.toFixed(1)})`);
  check(Math.abs(brewPer - 3) < 0.05 && Math.abs(pressPer - 2.5) < 0.05, `berries per ale: brewery ${brewPer.toFixed(2)} (★), press ${pressPer.toFixed(2)} (★★)`);
}

// flower beds count as meadow for an apiary: try it on a map with no meadow at all
{
  let w = createWorld(7);
  for (let s = 1; w.sites.includes('meadow'); s++) w = createWorld(s * 13);
  debugGrow(w, 6);
  while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
  const a = put(w, 'apiary'); const before = a.eff;
  for (let i = 0; i < 3; i++) {
    let done = false;
    for (let dx = -2; dx <= 2 && !done; dx++) for (let dy = -2; dy <= 2 && !done; dy++) if (canPlace(w, 'flowerbed', a.x + dx, a.y + dy).ok) {
      apply(w, { type: 'place', def: 'flowerbed', x: a.x + dx, y: a.y + dy }); done = true;
    }
  }
  w.res.wood += 20;
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  run(w, 24);
  const beds = w.buildings.filter(b => b.def === 'flowerbed' && b.built).length;
  check(beds >= 2 && a.eff > before, `${beds} flower beds raise a meadowless apiary from ${Math.round(before * 100)}% to ${Math.round(a.eff * 100)}%`);
}

// a map without a site never offers its gatherer
{
  let offered = 0, maps = 0;
  for (let s = 1; s < 80; s++) {
    const w = createWorld(s * 37);
    const missing = (['soil', 'grove', 'meadow'] as const).find(x => !w.sites.includes(x))!;
    const gatherer = { soil: 'field', grove: 'orchard', meadow: 'apiary' }[missing];
    maps++;
    for (let h = 0; h < 24 * 20 && w.status === 'playing'; h++) {
      for (const d of w.decisions) if (d.kind === 'blueprint' && d.options.includes(gatherer)) offered++;
      while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
      runHours(w, 1);
    }
  }
  check(offered === 0, `over ${maps} maps × 20 days, a gatherer for a missing site was offered ${offered} times`);
}
// fine materials: clay → bricks, and a tavern built from bricks alone
{
  const w = worldWith('clay');
  const pit = put(w, 'claypit'), kiln = put(w, 'kiln');
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  check(pit.eff > 0.3, `clay pit by the clay bank: works at ${Math.round(pit.eff * 100)}% (${efficiencyAt(w, pit.def, pit.x, pit.y).label})`);
  staff(w, pit, 2); staff(w, kiln, 2);
  w.res.wood += 60;
  run(w, 72);
  const bricks = made(w, 'bricks:+kiln'), clay = made(w, 'clay:-kiln');
  check(bricks > 5 && Math.abs(clay / bricks - 2) < 0.05, `kiln fired ${bricks.toFixed(0)} bricks from ${clay.toFixed(0)} clay (2 each)`);
  // a tavern whose 12 fine materials are all bricks
  if (!w.owned.includes('tavern')) w.owned.push('tavern');
  w.res.planks = 0; w.res.wicker = 0; w.res.bricks = Math.max(w.res.bricks, 14); w.res.wood += 40;
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  const spot = findSpot(w, 'tavern')!;
  apply(w, { type: 'place', def: 'tavern', x: spot.x, y: spot.y });
  const t = w.buildings[w.buildings.length - 1];
  run(w, 48);
  check(t.built && (t.delivered.bricks ?? 0) >= 12 && !(t.delivered.planks ?? 0), `tavern built from ${Math.floor(t.delivered.bricks ?? 0)} bricks and no planks`);
}

// wicker: switch a dock from fish to reeds, and a carpenter's shed weaves it
{
  const w = worldWith('grove');
  const dock = put(w, 'dock'), shed = put(w, 'carpenter');
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  staff(w, dock, 2); staff(w, shed, 2);
  apply(w, { type: 'toggleRecipe', building: dock.uid, recipe: 0, on: false });
  run(w, 72);
  const reeds = made(w, 'reeds:+dock'), wicker = made(w, 'wicker:+carpenter');
  check(reeds > 5 && wicker > 2 && !made(w, 'fish:+dock'), `dock on reeds cut ${reeds.toFixed(0)} (no fish); shed wove ${wicker.toFixed(0)} wicker`);
}

// no kiln or clay pit on a map without a clay bank
{
  let offered = 0;
  for (let s = 1; s < 60; s++) {
    const w = createWorld(s * 53);
    if (w.sites.includes('clay')) continue;
    for (let h = 0; h < 24 * 20 && w.status === 'playing'; h++) {
      for (const d of w.decisions) if (d.kind === 'blueprint' && d.options.some(o => o === 'kiln' || o === 'claypit')) offered++;
      while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
      runHours(w, 1);
    }
  }
  check(offered === 0, `kiln or clay pit offered ${offered} times on maps without clay`);
}
// bread: grain from a field, ground at the mill, baked at the bakery
{
  const w = worldWith('soil');
  const f = put(w, 'field'), m = put(w, 'mill'), b = put(w, 'bakery');
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  staff(w, f, 2); staff(w, m, 1); staff(w, b, 1);
  w.res.wood += 40;
  run(w, 96);
  const flour = made(w, 'flour:+mill'), bread = made(w, 'bread:+bakery');
  check(flour > 5 && bread > 3, `field → mill → bakery: ${flour.toFixed(0)} flour, ${bread.toFixed(0)} bread in 4 days`);
}

// skewers: herbs from a herb garden and mushrooms at the smokehouse, fish switched off
{
  const w = worldWith('grove');
  const g = put(w, 'herbgarden'), sm = put(w, 'smokehouse');
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  apply(w, { type: 'toggleRecipe', building: sm.uid, recipe: 0, on: false });
  w.res.mushrooms += 30; reconcileStock(w);
  staff(w, g, 1); staff(w, sm, 2);
  run(w, 72);
  check(made(w, 'skewers:+smokehouse') > 3 && made(w, 'herbs:-smokehouse') > 1, `herb garden + smokehouse: ${made(w, 'skewers:+smokehouse').toFixed(0)} skewers`);
}

// remedies: poultices from the apothecary, and a doctor with poultices heals faster than one without
{
  const heal = (withPoultice: boolean) => {
    const w = worldWith('grove');
    const clinic = put(w, 'clinic');
    for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
    const [doc, pat] = alive(w);
    doc.skills.medicine = 5;
    apply(w, { type: 'assign', colonist: doc.id, building: clinic.uid });
    pat.illness = { id: 'ankle', name: 'Sprained ankle', severity: 40, worsen: 0.2, contagious: false };
    w.res.poultice = withPoultice ? 20 : 0; w.res.tonic = 0; reconcileStock(w);
    // remedies act while the doctor treats a bedridden patient, so time how long until they're back on their feet
    let h = 0; while (pat.illness && pat.illness.severity > WALKING_WOUNDED && h < 200) { run(w, 1); h++; }
    return { h, used: made(w, 'poultice:-clinic') };
  };
  const a = heal(false), b = heal(true);
  check(b.h < a.h && b.used > 0, `sprained ankle (40): ${a.h}h in bed without remedies, ${b.h}h with poultices (${b.used.toFixed(1)} used)`);
  const w = worldWith('grove');
  const ap = put(w, 'apothecary'), hg = put(w, 'herbgarden');
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  staff(w, hg, 2); staff(w, ap, 1);
  run(w, 72);
  check(made(w, 'poultice:+apothecary') > 3, `herb garden + apothecary: ${made(w, 'poultice:+apothecary').toFixed(0)} poultices in 3 days`);
}

// tastes steer what people eat: someone who loves bread takes bread over stew
{
  const w = worldWith('grove');
  const lover = alive(w).find(c => c.tastes.loves.includes('bread'));
  const hater = alive(w).find(c => c.tastes.dislikes.includes('bread') && !c.tastes.loves.includes('stew'));
  w.res.bread = 30; w.res.stew = 30; reconcileStock(w);
  const ate: Record<string, string[]> = {};
  for (let h = 0; h < 48; h++) { run(w, 1); for (const c of [lover, hater]) if (c) { const m = c.memories.find(x => x.key === 'meal'); if (m) (ate[c.id] ??= []).push(m.label); } }
  if (lover) check((ate[lover.id] ?? []).some(l => l === 'Ate fresh bread'), `${lover.name} loves bread and ate it (${[...new Set(ate[lover.id])].join(', ')})`);
  if (hater) check(!(ate[hater.id] ?? []).includes('Ate fresh bread'), `${hater.name} dislikes bread and left it (${[...new Set(ate[hater.id])].join(', ')})`);
  check(!!lover || !!hater, 'found colonists with a taste for or against bread');
}

// the variety charter: 3 kinds of meal, 10 of each
{
  const w = worldWith('grove');
  // A varied table also asks for 10 colonists and a 24-hour average mood of 55
  debugGrow(w, 10);
  w.charter = 'menu'; w.chartersDone = []; w.charterHolds = [];
  const cheer = () => { for (const c of alive(w)) { c.mood = 70; c.moodTarget = 70; } w.moodLog = Array(24).fill(70); };
  cheer();
  w.res.stew = 12; w.res.bread = 11; w.res.skewers = 4; reconcileStock(w);
  run(w, 1);
  const pending = w.charter === 'menu';
  w.res.skewers = 12; reconcileStock(w); cheer();
  run(w, 1);
  check(pending && w.chartersDone.includes('menu'), 'A varied table waits for a third kind, then completes');
}
void built;
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
