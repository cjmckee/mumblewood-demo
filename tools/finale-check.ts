// Forced checks for the start and the finales, without the bot's judgement in the way.
// Usage: npx tsx tools/finale-check.ts
import { createWorld, apply, runHours, findSpot, World, alive, built, desks, workersAt, charterProgress, feastCheck, costOf, laborers, day } from '../src/sim/world';
import { BUILDING_BY_ID, MEALS } from '../src/sim/content';

let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };
const clear = (w: World) => { for (let i = 0; i < 50 && w.decisions.length; i++) apply(w, { type: 'resolve', option: 0 }); };
const untilHour = (w: World, h: number, each: () => void = () => {}) => { for (let i = 0; i < 48 && Math.round(w.hour) % 24 !== h; i++) { each(); runHours(w, 1); clear(w); } };

// ---- the start ----
{
  const w = createWorld(77);
  ok(alive(w).length === 3, `3 settlers (got ${alive(w).length})`);
  ok(w.decisions.length === 0, 'no decisions at the start: no research offer, charter or draft yet');
  ok(!w.buildings.some(b => b.def === 'desk') && w.owned.includes('desk'), 'there is no research desk yet, but one can be built');
  ok(!w.owned.includes('kitchen') && !w.owned.includes('dining') && !w.owned.includes('clinic'), 'kitchen, dining hall and clinic start locked');
  ok(apply(w, { type: 'place', def: 'kitchen', x: 10, y: 10 }) !== null, 'placing a locked kitchen is refused');
  runHours(w, 6);
  ok(!w.decisions.some(d => d.kind === 'research'), 'no research offer without a desk');
  const ds = findSpot(w, 'desk', 16, 16, true)!;
  ok(!apply(w, { type: 'place', def: 'desk', x: ds.x, y: ds.y }), 'a research desk can be placed');
  for (let h = 0; h < 48 && !w.decisions.some(d => d.kind === 'research'); h++) { runHours(w, 1); for (let i = 0; i < 10 && w.decisions.length && w.decisions[0].kind !== 'research'; i++) apply(w, { type: 'resolve', option: 0 }); }
  const offer = w.decisions.find(d => d.kind === 'research');
  ok(!!offer && desks(w).length === 1, `finishing the desk brings the first research offer (day ${day(w)})`);
  ok(offer?.kind === 'research' && offer.options.join() === 'cookery,messhall,physick', 'the first offer is Cookery, Mess hall and Physick');
  while (w.decisions.length && w.decisions[0].kind !== 'research') apply(w, { type: 'resolve', option: 0 });
  apply(w, { type: 'resolve', option: 0 }); // Cookery
  const desk = desks(w)[0];
  const scholar = alive(w)[0];
  apply(w, { type: 'assign', colonist: scholar.id, building: desk.uid });
  let hours = 0;
  while (!w.owned.includes('kitchen') && hours < 72) { runHours(w, 1); hours++; clear(w); if (workersAt(w, desk.uid).length === 0) apply(w, { type: 'assign', colonist: scholar.id, building: desk.uid }); }
  ok(w.owned.includes('kitchen'), `Cookery unlocks the kitchen (after ${hours}h)`);
  ok(w.research!.done.includes('cookery'), 'Cookery is recorded as done');
  ok(w.flows['wood:-research'] >= 9.9 && w.flows['berries:-research'] >= 9.9, `the study used its goods (wood ${w.flows['wood:-research']?.toFixed(1)}, berries ${w.flows['berries:-research']?.toFixed(1)})`);
}

// ---- first charter timing and drafts waiting for it ----
{
  const w = createWorld(78);
  let sawBlueprint = false, charterDay = 0, charterHour = 0;
  for (let h = 0; h < 24 * 5 && !charterDay; h++) {
    runHours(w, 1);
    for (const d of w.decisions) { if (d.kind === 'blueprint') sawBlueprint = true; if (d.kind === 'charter' && !charterDay) { charterDay = day(w); charterHour = Math.round(w.hour) % 24; } }
    if (!charterDay) while (w.decisions.length && w.decisions[0].kind !== 'charter') apply(w, { type: 'resolve', option: 0 });
  }
  ok(charterDay === 2 && charterHour === 6, `the first charter is offered on the morning of day 2 (day ${charterDay}, ${charterHour}:00), with no research done`);
  ok(!sawBlueprint, 'no blueprint draft before the first charter');
  for (let i = 0; i < 20 && w.decisions.length && w.decisions[0].kind !== 'charter'; i++) apply(w, { type: 'resolve', option: 0 });
  apply(w, { type: 'resolve', option: 0 });
  ok(w.decisions.some(d => d.kind === 'blueprint'), 'picking the first charter brings the first blueprint draft');
}

// ---- strain grows with population ----
{
  const small = createWorld(79);
  for (let h = 0; h < 24 * 10; h++) { clear(small); for (const d of small.decisions) void d; runHours(small, 1); }
  // recruits are offered every other day; option 0 takes one, so the colony grows a little
  ok(day(small) >= 10, `ten days passed (day ${day(small)}, ${alive(small).length} settlers)`);
  const expect = 0.03 * alive(small).length * 10 * 1.1;
  ok(small.strain > 0.5 && small.strain < expect * 1.6, `strain after 10 days follows population, not the calendar (${small.strain.toFixed(2)}, about ${expect.toFixed(1)} expected)`);
}

// ---- the Crown's Hall ----
{
  const w = createWorld(80); clear(w);
  w.charter = 'hall'; w.charterHolds = []; w.owned.push('hall');
  const spot = findSpot(w, 'hall', 16, 16, true)!;
  ok(!apply(w, { type: 'place', def: 'hall', x: spot.x, y: spot.y }), 'the Hall can be placed');
  const hall = w.buildings.find(b => b.def === 'hall')!;
  w.res.planks = 80; w.res.stew = 60; w.res.pie = 20; w.res.cider = 40;
  for (const c of alive(w)) { c.mood = 30; c.moodTarget = 30; c.job = null; }
  // grumpy settlers won't touch it (mood is recomputed hourly, so pin it low for the check)
  for (let h = 0; h < 12; h++) { for (const c of alive(w)) { c.mood = 30; } runHours(w, 1); clear(w); }
  ok(Object.keys(hall.delivered).length === 0 && hall.progress === 0, 'nobody below mood 55 hauls for or builds the Hall');
  // content settlers build all three stages
  let h = 0;
  while (!hall.built && h < 24 * 20) { for (const c of alive(w)) { c.mood = 70; c.hunger = 90; } w.res.planks = Math.max(w.res.planks, 20); w.res.stew = Math.max(w.res.stew, 20); w.res.cider = Math.max(w.res.cider, 20); runHours(w, 1); h++; clear(w); }
  ok(hall.built, `content settlers finish all three stages (${h}h, stage ${hall.stage})`);
  ok((hall.stage ?? 0) === 2, 'the Hall went through three stages');
  ok(costOf({ ...hall, stage: 1 }).meal === 40 && costOf({ ...hall, stage: 2 }).drink === 25, 'stage costs: 60 fine, 40 meals, 25 drinks');
  void laborers; void BUILDING_BY_ID;
}

// ---- the Long Table ----
{
  const w = createWorld(81); clear(w);
  w.charter = 'longtable';
  ok(apply(w, { type: 'callFeast' }) === null, 'the feast can be called');
  ok(apply(w, { type: 'callFeast' }) !== null, 'calling it twice is refused');
  // too few people: it falls short and can't be called again for three days
  w.res.stew = 50; w.res.pie = 50; w.res.ale = 50; w.res.cider = 50;
  untilHour(w, 19);
  ok(!w.feast!.done && w.feast!.readyAt > w.hour + 60, `a feast with 3 settlers falls short and waits 3 days (${w.feast!.last})`);
  ok(apply(w, { type: 'callFeast' }) !== null, 'it can’t be called again right away');
  // a full table: 14 settlers, seats, two kinds of meal and drink
  const w2 = createWorld(82); clear(w2);
  w2.charter = 'longtable';
  const donor = createWorld(83);
  let n = 0;
  while (alive(w2).length < 14) { const c = { ...structuredClone(donor.colonists[n % donor.colonists.length]), id: 1000 + n, partner: null, job: null, bed: null }; w2.colonists.push(c); n++; }
  for (const id of ['dining', 'dining', 'dining']) { w2.owned.push('dining'); const s = findSpot(w2, id, 16, 16, true)!; apply(w2, { type: 'place', def: id, x: s.x, y: s.y }); }
  for (const b of w2.buildings) if (b.def === 'dining') { b.built = true; b.progress = 99; }
  for (const r of MEALS) w2.res[r] = 30;
  w2.res.ale = 30; w2.res.cider = 30; w2.res.mead = 30; w2.res.tea = 30;
  for (const c of alive(w2)) { c.sulking = false; c.mood = 60; c.illness = null; }
  const f = feastCheck(w2);
  ok(f.ok, `with 14 settlers, ${f.seats} seats and every meal and drink, the check says ready (${f.served} served)`);
  ok(apply(w2, { type: 'callFeast' }) === null, 'the feast is called');
  untilHour(w2, 19, () => { for (const c of alive(w2)) { c.sulking = false; c.illness = null; c.mood = Math.max(c.mood, 40); } });
  ok(!!w2.feast!.done, `the feast succeeds (${w2.feast!.last})`);
  ok(w2.status === 'won' || w2.chartersDone.includes('longtable'), `the Long Table charter completes (status ${w2.status})`);
  // tastes matter: with one drink, the people who dislike it go without
  const w3 = createWorld(82); clear(w3); w3.charter = 'longtable';
  w3.res.cider = 50; w3.res.stew = 50; w3.res.pie = 50;
  alive(w3)[0].tastes = { loves: ['pie', 'ale'], dislikes: ['stew', 'cider'] };
  for (const c of alive(w3).slice(1)) c.tastes = { loves: ['pie', 'cider'], dislikes: ['stew', 'mead'] };
  const dislikeCider = alive(w3).filter(c => c.tastes.dislikes.includes('cider')).length;
  ok(dislikeCider === 1 && feastCheck(w3).hungry === 1, `with only cider, the one settler who dislikes it can't be served (${feastCheck(w3).hungry} unserved)`);
  void built; void charterProgress;
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
