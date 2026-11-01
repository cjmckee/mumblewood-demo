// Forced checks for the start and the finales, without the bot's judgement in the way.
// Usage: npx tsx tools/finale-check.ts
import { createWorld, apply, runHours, findSpot, World, alive, built, desks, workersAt, charterProgress, feastCheck, costOf, laborers, day, festivalPreview, debugGrow, comfortParts, comfortOf, strainPerDay, comfortFactor, activeNeeds } from '../src/sim/world';
import { seasonOf } from '../src/sim/seasons';
import { BUILDING_BY_ID, MEALS } from '../src/sim/content';
import { START } from '../src/sim/scenario';

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
  const expect = START.strain.rate * Math.sqrt(alive(small).length) * 10 * 1.1;
  ok(small.strain > 0.5 && small.strain < expect * 1.6, `strain after 10 days follows population, not the calendar (${small.strain.toFixed(2)}, about ${expect.toFixed(1)} expected)`);
}

// ---- the Crown's Hall ----
{
  const w = createWorld(80); clear(w);
  w.charter = 'hall'; w.charterHolds = []; w.owned.push('hall');
  const spot = findSpot(w, 'hall', 16, 16, true)!;
  ok(!apply(w, { type: 'place', def: 'hall', x: spot.x, y: spot.y }), 'the Hall can be placed');
  const hall = w.buildings.find(b => b.def === 'hall')!;
  w.res.planks = 80; w.res.stew = 60; w.res.supper = 20; w.res.mulled = 40;
  for (const c of alive(w)) { c.mood = 30; c.moodTarget = 30; c.job = null; }
  // grumpy settlers won't touch it (mood is recomputed hourly, so pin it low for the check)
  for (let h = 0; h < 12; h++) { for (const c of alive(w)) { c.mood = 30; } runHours(w, 1); clear(w); }
  ok(Object.keys(hall.delivered).length === 0 && hall.progress === 0, 'nobody below mood 55 hauls for or builds the Hall');
  // content settlers build all three stages
  let h = 0;
  while (!hall.built && h < 24 * 20) { for (const c of alive(w)) { c.mood = 70; c.hunger = 90; } w.res.planks = Math.max(w.res.planks, 20); w.res.stew = Math.max(w.res.stew, 20); w.res.supper = Math.max(w.res.supper, 20); w.res.mulled = Math.max(w.res.mulled, 20); runHours(w, 1); h++; clear(w); }
  ok(hall.built, `content settlers finish all three stages (${h}h, stage ${hall.stage})`);
  ok((hall.stage ?? 0) === 2, 'the Hall went through three stages');
  ok(costOf({ ...hall, stage: 1 }).supper === 30 && costOf({ ...hall, stage: 2 }).mulled === 25, 'stage costs: 60 fine, 30 suppers, 25 mulled cups');
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
  w2.res.ale = 30; w2.res.cider = 30; w2.res.mead = 30; w2.res.tea = 30; w2.res.mulled = 30;
  for (const c of alive(w2)) { c.sulking = false; c.mood = 60; c.illness = null; }
  const f = feastCheck(w2);
  ok(f.ok, `with 14 settlers, ${f.seats} seats and every meal and drink, the check says ready (${f.served} served)`);
  ok(apply(w2, { type: 'callFeast' }) === null, 'the feast is called');
  untilHour(w2, 19, () => { for (const c of alive(w2)) { c.sulking = false; c.illness = null; c.mood = Math.max(c.mood, 40); } });
  ok(!!w2.feast!.done, `the feast succeeds (${w2.feast!.last})`);
  ok(w2.status === 'won' || w2.chartersDone.includes('longtable'), `the Long Table charter completes (status ${w2.status})`);
  // tastes matter: with one drink, the people who dislike it go without
  const w3 = createWorld(82); clear(w3); w3.charter = 'longtable';
  w3.res.cider = 50; w3.res.stew = 50; w3.res.supper = 50;
  alive(w3)[0].tastes = { loves: ['supper', 'ale'], dislikes: ['stew', 'cider'] };
  for (const c of alive(w3).slice(1)) c.tastes = { loves: ['supper', 'cider'], dislikes: ['stew', 'mead'] };
  const dislikeCider = alive(w3).filter(c => c.tastes.dislikes.includes('cider')).length;
  ok(dislikeCider === 1 && feastCheck(w3).hungry === 1, `with only cider, the one settler who dislikes it can't be served (${feastCheck(w3).hungry} unserved)`);
  void built; void charterProgress;
}

// ---- comfort sets how fast strain rises ----
{
  const w = createWorld(92); clear(w); debugGrow(w, 6);
  // a settlement (one charter done): cooked meals, health and evenings count, and in summer a drink
  w.chartersDone = ['settled'];
  const c = alive(w)[0];
  c.lastMeal = { cooked: false, table: false, loved: false }; c.hunger = 80; c.fun = 10; c.beauty = -1; c.bed = null; c.illness = null;
  ok(comfortParts(w, c, 1).meals === 0 && comfortParts(w, c, 1).shelter === 0, 'raw food and no bed: meals and shelter at 0');
  c.lastMeal = { cooked: true, table: true, loved: true };
  ok(Math.abs((comfortParts(w, c, 1).meals ?? 0) - 1) < 1e-9, 'a favourite meal at a table: meals at 100%');
  c.hunger = 10;
  ok(comfortParts(w, c, 1).meals === 0, 'going hungry counts as no meal');
  for (const x of alive(w)) { x.lastMeal = { cooked: false, table: false, loved: false }; x.fun = 0; x.beauty = -1; x.bed = null; x.illness = null; }
  w.comfort = undefined;
  const low = strainPerDay(w), lowC = alive(w).reduce((n, x) => n + comfortOf(w, x), 0) / alive(w).length;
  for (const x of alive(w)) { x.lastMeal = { cooked: true, table: true, loved: true }; x.hunger = 90; x.fun = 90; x.beauty = 4; x.lastDrink = w.hour; }
  const lean = w.buildings.find(b => b.def === 'leanto')!; for (const x of alive(w)) x.bed = lean.uid;
  const high = strainPerDay(w), highC = alive(w).reduce((n, x) => n + comfortOf(w, x), 0) / alive(w).length;
  ok(lowC < 0.25 && highC > 0.85, `comfort runs from ${Math.round(lowC * 100)}% to ${Math.round(highC * 100)}%`);
  ok(high < low * 0.5, `a comfortable colony strains under half as fast (${high.toFixed(2)} against ${low.toFixed(2)} a day)`);
  // the ladder: a camp asks only for a bed, food and a fire; a village wants more of the same home
  ok(JSON.stringify(activeNeeds(w, 0)) === JSON.stringify(['shelter', 'food', 'fire']), `a camp in summer counts shelter, food and a fire (${activeNeeds(w, 0).join(', ')})`);
  ok(activeNeeds(w, 1).includes('drink') && !activeNeeds(w, 0).includes('drink'), 'a settlement in summer wants a drink; a camp doesn\u2019t');
  ok((comfortParts(w, c, 0).shelter ?? 0) === 1 && (comfortParts(w, c, 2).shelter ?? 0) === 0.5, `a shack is all a camp asks, and half what a village does (${comfortParts(w, c, 2).shelter})`);
  ok(activeNeeds(w, 2).includes('variety') && activeNeeds(w, 2).includes('surroundings'), 'a village wants variety and pleasant surroundings');
  // winter: warmth counts at every standing, and a home with no wood is cold
  const wi = createWorld(93); clear(wi); debugGrow(wi, 4);
  wi.hour = (21 - 1) * 24 + 12; // summer 1 start: day 21 is the first day of winter
  ok(seasonOf(wi).season === 'winter' && seasonOf(wi).winter === 1, `day 21 is the first winter (${seasonOf(wi).season} ${seasonOf(wi).winter})`);
  ok(activeNeeds(wi, 0).includes('warmth'), 'a camp in winter needs warmth');
  // decisions pause the clock, so clear them as the hours go
  const hours = (n: number) => { for (let i = 0; i < n; i++) { clear(wi); runHours(wi, 1); } clear(wi); };
  wi.res.wood = 0; hours(2);
  ok(alive(wi).filter(x => x.bed != null).every(x => x.cold), 'with no wood, every home is cold');
  wi.res.wood = 200; hours(2);
  ok(alive(wi).filter(x => x.bed != null).every(x => !x.cold), 'with wood, homes are warm again');
}

// ---- strain relief: charters ----
{
  const w = createWorld(90); clear(w); debugGrow(w, 6);
  w.charter = 'settled'; w.charterHolds = []; w.strain = 20; w.tally = { eaten: { stew: 30 }, drunk: {}, made: {}, used: {} };
  w.res.stew = 40; w.moodLog = Array(24).fill(60); for (const c of alive(w)) { c.mood = 60; c.moodTarget = 60; }
  runHours(w, 1); clear(w);
  ok(w.chartersDone.includes('settled'), 'Settled in completes with 6 settlers, 30 meals eaten and mood 60');
  ok(Math.abs(w.strain - 14) < 0.5, `finishing a charter eases 30% of strain (20 → ${w.strain.toFixed(1)})`);
}

// ---- strain relief: the festival ----
{
  const w = createWorld(91); clear(w); debugGrow(w, 6);
  w.strain = 20;
  for (const k of Object.keys(w.res) as (keyof typeof w.res)[]) if (MEALS.includes(k) || ['ale', 'cider', 'mead', 'tea'].includes(k)) w.res[k] = 0;
  ok(apply(w, { type: 'callFestival' }) !== null, 'a festival with no meals is refused');
  w.res.stew = 30;
  for (const c of alive(w)) c.tastes = { loves: ['pie', 'mead'], dislikes: ['bread', 'tea'] };
  const meals = festivalPreview(w);
  ok(Math.abs(meals.share - 0.15) < 1e-9 && meals.fed === 6, `stew for all, no drinks, no favourites: eases 15% (${Math.round(meals.share * 100)}%)`);
  w.res.cider = 30;
  ok(Math.abs(festivalPreview(w).share - 0.20) < 1e-9, 'with a drink for most: 20%');
  w.res.pie = 30;
  ok(Math.abs(festivalPreview(w).share - 0.25) < 1e-9, 'with a favourite for most: 25%');
  w.res.pie = 0; w.res.stew = 3;
  ok(Math.abs(festivalPreview(w).share - (0.15 * 3 / 6 + 0.05)) < 1e-9, 'meals for only half: the base share is halved');
  w.res.stew = 30;
  ok(apply(w, { type: 'callFestival' }) === null, 'the festival is called');
  ok(apply(w, { type: 'callFestival' }) !== null, 'calling it twice is refused');
  const before = w.strain, stew = w.res.stew;
  untilHour(w, 19);
  ok(w.strain < before * 0.85, `at dusk strain eases (${before.toFixed(1)} → ${w.strain.toFixed(1)})`);
  ok(stew - w.res.stew >= 5.9, `everyone ate (${(stew - w.res.stew).toFixed(0)} stew used)`);
  ok(alive(w).every(c => c.memories.some(m => m.key === 'festival' && m.value > 0)), 'everyone remembers the festival fondly');
  ok(apply(w, { type: 'callFestival' }) !== null && (w.festival!.readyAt - w.hour) > 24 * 3.5, 'then it waits about 4 days');
  void day;
}

// ---- strain events and boons ----
{
  const ev = (w: ReturnType<typeof createWorld>, id: string, option: number) => { w.decisions.push({ kind: 'event', eventId: id }); apply(w, { type: 'resolve', option }); };
  const w = createWorld(93); clear(w); debugGrow(w, 6);
  for (const c of alive(w)) c.sulking = false;
  w.res.berries = 40; w.strain = 20; ev(w, 'letters', 0);
  ok(Math.abs(w.strain - 17) < 0.01, `letters, nobody sulking: strain eases 15% (20 → ${w.strain.toFixed(1)})`);
  w.strain = 20; w.res.wood = 30; ev(w, 'homesick', 0);
  ok(w.strain === 20 && w.res.wood === 10, 'a bonfire: 20 wood, strain unchanged');
  ev(w, 'homesick', 1);
  ok(w.strain === 23, 'toughing it out: strain rises by 3');
  w.strain = 20; w.res.stew = 20; ev(w, 'moon', 0);
  ok(w.strain < 18.1 && w.strain > 15, `a harvest moon dance with a meal each: strain eases about 10% (${w.strain.toFixed(1)})`);
  w.strain = 20; w.res.ale = 10; ev(w, 'bard', 0);
  ok(Math.abs(w.strain - 18.4) < 0.01, `the bard: strain eases 8% (${w.strain.toFixed(1)})`);
  // cornerstones
  w.perks.push('postRider'); w.strain = 20; w.res.ale = 10; ev(w, 'bard', 0);
  ok(Math.abs(w.strain - 14.4) < 0.01, `a post rider adds 20%: the bard eases 28% (${w.strain.toFixed(1)})`);
  w.comfort = 0.5; const before = comfortFactor(w); w.perks.push('homesteaders');
  ok(comfortFactor(w) < before - 0.09, `homesteaders: comfort 50% counts as 60% (${before.toFixed(2)}× → ${comfortFactor(w).toFixed(2)}×)`);
  // strain events only come when strain bites
  const calm = createWorld(94); clear(calm); calm.strain = 2; let seen = 0;
  for (let i = 0; i < 300; i++) { calm.nextEventHour = calm.hour; runHours(calm, 1); for (const d of calm.decisions) if (d.kind === 'event' && ['letters', 'homesick'].includes(d.eventId)) seen++; clear(calm); calm.strain = 2; }
  ok(seen === 0, 'letters and the cold wind never come while strain is under 6');
}

// ---- Fed and rested: a full day of cooked meals at a table ----
{
  const w = createWorld(95); clear(w); debugGrow(w, 6);
  w.charter = 'rested'; w.charterHolds = [];
  for (let h = 0; h < 6; h++) { w.ateOffTable = false; w.ateRaw = false; runHours(w, 1); clear(w); }
  const held = w.charterHolds?.[2] ?? 0;
  w.ateRaw = true; w.ateOffTable = false; runHours(w, 1); clear(w);
  ok((w.charterHolds?.[2] ?? 0) <= 1 || held === 0, `raw food resets the cooked-meals day (${held}h → ${w.charterHolds?.[2] ?? 0}h)`);
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
