// Gold and the caravan: it comes on its days (not in winter), someone walks over, trading opens; buying and selling
// move gold and goods; the trader's cap; blueprints; it leaves at dusk; rent on a season's first day.
// Usage: npx tsx tools/trade-check.ts
import { createWorld, apply, runHours, World, day, hourOfDay, alive, sellPrice } from '../src/sim/world';
import { seasonOf } from '../src/sim/seasons';
import { START } from '../src/sim/scenario';
import { PRICE } from '../src/sim/content';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const w: World = createWorld(2024);
// skip every choice except the ones under test, and send the first settler to the caravan
const clear = (keepTrade = true) => {
  while (w.decisions.length && !(keepTrade && w.decisions[0].kind === 'trade')) {
    const d = w.decisions[0];
    apply(w, { type: 'resolve', option: d.kind === 'errand' ? alive(w)[0].id : 99 });
  }
};
check(w.gold === START.trade.gold, `the run starts with ${START.trade.gold} gold`);
// the first caravan: day 2 of the first full season (autumn)
let seen = false;
for (let h = 0; h < 24 * 12 && !seen; h++) { clear(); if (w.caravan) seen = true; else runHours(w, 1); }
const s = seasonOf(w);
check(seen && START.trade.visits.includes(s.dayOf) && s.season !== 'winter', `a caravan arrives on day ${s.dayOf} of ${s.season}`);
check(Math.round(hourOfDay(w)) === START.trade.arrive, `at ${START.trade.arrive}:00`);
check(w.errands.some(e => e.def === 'caravan'), 'someone has to walk over to trade');
let open = false;
for (let h = 0; h < 6 && !open; h++) { clear(); open = w.decisions[0]?.kind === 'trade'; if (!open) runHours(w, 1); }
check(open, 'trading opens when they get there');
// selling
w.res.wood = 200; const g0 = w.gold;
check(apply(w, { type: 'sell', res: 'wood', n: 10 }) === null && w.res.wood === 190 && w.gold === g0 + Math.floor(10 * sellPrice(w, 'wood') + 1e-9), `selling 10 wood pays ${Math.floor(10 * sellPrice(w, 'wood') + 1e-9)} gold (${sellPrice(w, 'wood')} each, list price ${PRICE.wood})`);
apply(w, { type: 'sell', res: 'wood', n: 999 });
check(w.caravan!.sold.wood === START.trade.sellCap, `the trader buys at most ${START.trade.sellCap} of one good a visit`);
check(apply(w, { type: 'sell', res: 'wood', n: 1 }) !== null, 'and refuses more');
// buying
const [r, item] = Object.entries(w.caravan!.stock)[0] as [keyof typeof PRICE, { n: number; price: number }];
w.gold = item.price * 2; const have = w.res[r];
check(apply(w, { type: 'buy', res: r, n: 5 }) === null && w.res[r] === have + 2 && w.gold === 0, `buying ${r} at ${item.price}: gold for 2 buys 2`);
check(apply(w, { type: 'buy', res: r, n: 1 }) !== null, 'no gold, no sale');
// blueprints
const bp = w.caravan!.blueprints[0];
check(!!bp, `the caravan carries a blueprint (${bp?.id}, ${bp?.price} gold)`);
if (bp) { w.gold = bp.price; check(apply(w, { type: 'buyBlueprint', id: bp.id }) === null && w.owned.includes(bp.id) && w.gold === 0, 'buying it adds it to what can be built'); }
apply(w, { type: 'resolve', option: 0 });
check(apply(w, { type: 'sell', res: 'wood', n: 1 }) !== null, 'trading closes when they leave the cart');
check(apply(w, { type: 'visitCaravan' }) === null && w.errands.some(e => e.def === 'caravan'), 'someone can be sent back while it stays');
// it leaves at dusk
for (let h = 0; h < 14; h++) { clear(false); runHours(w, 1); }
check(!w.caravan, 'it leaves at dusk');
// rent: the next season's first morning
const housed = alive(w).filter(c => c.bed != null).length;
while (seasonOf(w).dayOf !== 1 || Math.round(hourOfDay(w)) < 7) { clear(false); runHours(w, 1); }
check((w.flows['gold:+rent'] ?? 0) > 0, `rent day: ${w.flows['gold:+rent']} gold from about ${housed} housed settlers`);
check(w.log.some(l => l.text.startsWith('Rent day')), 'and the log says so');
// winter: no caravan
let winterCaravan = false;
while (seasonOf(w).season !== 'spring' && day(w) < 60) { clear(false); runHours(w, 1); if (seasonOf(w).season === 'winter' && w.caravan) winterCaravan = true; }
check(!winterCaravan, 'no caravan in winter');
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
