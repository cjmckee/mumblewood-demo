// Gold and the caravan: it comes on its days (not in winter), someone walks over, trading opens; buying and selling
// move gold and goods; the trader's cap; blueprints; it leaves at dusk; rent on a season's first day.
// Usage: npx tsx tools/trade-check.ts
import { createWorld, apply, runHours, World, day, hourOfDay, alive, sellPrice } from '../src/sim/world';
import { seasonOf } from '../src/sim/seasons';
import { START } from '../src/sim/scenario';
import { PRICE, TRADER_BY_ID } from '../src/sim/content';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const w: World = createWorld(2024);
// nobody runs this colony, so keep the larder topped up and it lasts the year the test needs
const feed = () => { if (w.res.stew < 30) w.res.stew += 30; if (w.res.wood < 60) w.res.wood += 60; };
// skip every choice except the ones under test, and send the first settler to the caravan
const clear = (keepTrade = true) => {
  feed();
  while (w.decisions.length && !(keepTrade && w.decisions[0].kind === 'trade')) {
    const d = w.decisions[0];
    apply(w, { type: 'resolve', option: d.kind === 'errand' ? alive(w)[0].id : 99 });
  }
};
check(w.gold === START.trade.gold, `the run starts with ${START.trade.gold} gold`);
runHours(w, 2); clear();
check(!!w.nextTrader && w.log.some(l => l.text.startsWith('Word on the road')), `word comes ahead of who's due first (${w.nextTrader})`);
const due = w.nextTrader;
// the first caravan: day 2 of the first full season (autumn)
let seen = false;
for (let h = 0; h < 24 * 12 && !seen; h++) { clear(); if (w.caravan) seen = true; else runHours(w, 1); }
const s = seasonOf(w);
check(seen && START.trade.visits.includes(s.dayOf) && s.season !== 'winter', `a caravan arrives on day ${s.dayOf} of ${s.season}`);
check(Math.round(hourOfDay(w)) === START.trade.arrive, `at ${START.trade.arrive}:00`);
check(w.errands.some(e => e.def === 'caravan'), 'someone has to walk over to trade');
const tr = TRADER_BY_ID[w.caravan!.trader], kinds = Object.keys(w.caravan!.stock);
check(w.caravan!.trader === due, `the trader who was announced came (${tr.name})`);
check(kinds.length >= START.trade.kinds[0] && kinds.length <= START.trade.kinds[1] && (!tr.sells.length || kinds.every(r => tr.sells.includes(r as never))), `they carry ${kinds.length} of their goods: ${kinds.join(', ')}`);
check(Object.values(w.caravan!.stock).every(it => it!.n >= START.trade.each[0] && it!.n <= START.trade.each[1]), 'a handful of each');
let open = false;
for (let h = 0; h < 6 && !open; h++) { clear(); open = w.decisions[0]?.kind === 'trade'; if (!open) runHours(w, 1); }
check(open, 'trading opens when they get there');
// selling: only what this trader wants (anything at the autumn fair, anything cheaply to the pedlar)
const wantsR = (tr.wants[0] ?? 'wood') as keyof typeof PRICE;
const notWanted = (Object.keys(PRICE) as (keyof typeof PRICE)[]).find(r => !tr.wants.includes(r));
if (tr.sells.length && seasonOf(w).season !== 'autumn' && notWanted) { w.res[notWanted] = 50; check(apply(w, { type: 'sell', res: notWanted, n: 5 }) !== null, `${tr.name} won’t buy ${notWanted}`); }
w.res[wantsR] = 200; const g0 = w.gold, p0 = sellPrice(w, wantsR);
check(apply(w, { type: 'sell', res: wantsR, n: 10 }) === null && w.res[wantsR] === 190 && w.gold === g0 + Math.floor(10 * p0 + 1e-9), `selling 10 ${wantsR} pays ${Math.floor(10 * p0 + 1e-9)} gold (${p0} each, list price ${PRICE[wantsR]})`);
apply(w, { type: 'sell', res: wantsR, n: 999 });
check(w.caravan!.sold[wantsR] === START.trade.sellCap, `the trader buys at most ${START.trade.sellCap} of one good a visit`);
check(apply(w, { type: 'sell', res: wantsR, n: 1 }) !== null, 'and refuses more');
// buying
const [r, item] = Object.entries(w.caravan!.stock)[0] as [keyof typeof PRICE, { n: number; price: number }];
w.gold = item.price * 2; const have = w.res[r];
check(apply(w, { type: 'buy', res: r, n: 5 }) === null && w.res[r] === have + 2 && w.gold === 0, `buying ${r} at ${item.price}: gold for 2 buys 2`);
check(apply(w, { type: 'buy', res: r, n: 1 }) !== null, 'no gold, no sale');
// blueprints
// a blueprint is a chance, not a given: put one on the cart to test buying it
if (!w.caravan!.blueprints.length) w.caravan!.blueprints.push({ id: 'tavern', price: START.trade.blueprint });
const bp = w.caravan!.blueprints[0];
check(!!bp, `a blueprint on the cart (${bp?.id}, ${bp?.price} gold)`);
if (bp) { w.gold = bp.price; check(apply(w, { type: 'buyBlueprint', id: bp.id }) === null && w.owned.includes(bp.id) && w.gold === 0, 'buying it adds it to what can be built'); }
apply(w, { type: 'resolve', option: 0 });
check(apply(w, { type: 'sell', res: wantsR, n: 1 }) !== null, 'trading closes when they leave the cart');
check(apply(w, { type: 'visitCaravan' }) === null && w.errands.some(e => e.def === 'caravan'), 'someone can be sent back while it stays');
// it leaves at dusk
for (let h = 0; h < 14; h++) { clear(false); runHours(w, 1); }
check(!w.caravan, 'it leaves at dusk');
check(!!w.nextTrader && w.log.slice(-6).some(l => l.text.startsWith('Word on the road')), `and word comes of the next (${w.nextTrader})`);
// rent: the next season's first morning
const housed = alive(w).filter(c => c.bed != null).length;
while ((seasonOf(w).dayOf !== 1 || Math.round(hourOfDay(w)) < 7) && w.status === 'playing') { clear(false); runHours(w, 1); }
check((w.flows['gold:+rent'] ?? 0) > 0, `rent day: ${w.flows['gold:+rent']} gold from about ${housed} housed settlers`);
check(w.log.some(l => l.text.startsWith('Rent day')), 'and the log says so');
// winter: no caravan
let winterCaravan = false;
while (seasonOf(w).season !== 'spring' && day(w) < 60 && w.status === 'playing') { clear(false); runHours(w, 1); if (seasonOf(w).season === 'winter' && w.caravan) winterCaravan = true; }
const pilgrims = w.perks.includes('pilgrimsRoad');
check(winterCaravan === pilgrims, pilgrims ? 'with the pilgrims’ road, a caravan in winter too' : 'no caravan in winter');
// skilled settlers: a recruit offer with a fee; refused without the gold, paid when taken
let offer: { kind: 'recruit'; options: { fee?: number; id: number }[] } | undefined;
w.perks = w.perks.filter(x => x !== 'closedGates'); // a cornerstone picked along the way could shut the gates
for (let h = 0; h < 24 * 30 && !offer && w.status === 'playing'; h++) {
  const d = w.decisions[0];
  if (d?.kind === 'recruit' && d.options.some(c => c.fee)) offer = d as never;
  else if (d) { apply(w, { type: 'resolve', option: d.kind === 'errand' ? -1 : 99 }); w.perks = w.perks.filter(x => x !== 'closedGates'); } else runHours(w, 1);
}
check(!!offer, `a skilled settler turns up among the recruits (asks ${offer?.options.find(c => c.fee)?.fee} gold)`);
if (offer) {
  const i = offer.options.findIndex(c => c.fee), fee = offer.options[i].fee!, n = alive(w).length;
  w.gold = fee - 1;
  check(apply(w, { type: 'resolve', option: i }) !== null && alive(w).length === n, 'without the gold they won’t come');
  w.gold = fee + 5;
  check(apply(w, { type: 'resolve', option: i }) === null && alive(w).length === n + 1 && w.gold === 5, 'with it they join, and the fee is paid');
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
