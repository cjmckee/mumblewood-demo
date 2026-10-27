// How income, laborers, food and wood play out over a run, split by winning and losing colonies.
// Usage: npx tsx tools/economy.ts [runs=60] [seedBase=52000]
import { createWorld, tick, day, hourOfDay, TICKS_PER_HOUR, alive, avgMood } from '../src/sim/world';
import { autoDecide, autoBuild, BOT } from '../src/sim/autoplayer';
import { economy } from '../src/sim/economy';
if (process.env.BOT_ADVISOR) BOT.advisor = process.env.BOT_ADVISOR === '1';

const runs = Number(process.argv[2] ?? 60);
const base = Number(process.argv[3] ?? 52000);
type Row = { day: number; pop: number; lab: number; busy: number; foodNet: number; foodStock: number; woodNet: number; woodStock: number; chopped: number; gathered: number; eaten: number; planks: number; mood: number; workers: number };
const runsData: { status: string; rows: Row[] }[] = [];
for (let i = 0; i < runs; i++) {
  const w = createWorld(base + i * 7919);
  const rows: Row[] = [];
  while (w.status === 'playing' && day(w) <= 40) {
    autoDecide(w); for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); autoDecide(w); } autoBuild(w);
    if (Math.round(hourOfDay(w)) === 6 && day(w) > 1) {
      const e = economy(w);
      const line = (a: typeof e.food, l: string) => a.lines.find(x => x.label === l)?.perDay ?? 0;
      rows.push({ day: day(w) - 1, pop: alive(w).length, lab: e.laborers.length, busy: e.busyShare, foodNet: e.food.net, foodStock: e.food.stock, woodNet: e.wood.net, woodStock: e.wood.stock,
        chopped: line(e.wood, 'Chopped'), gathered: line(e.food, 'Gathered'), eaten: -line(e.food, 'Eaten'), planks: line(e.planks, 'Sawn'), mood: avgMood(w), workers: e.jobs.reduce((n, j) => n + j.workers, 0) });
    }
  }
  runsData.push({ status: w.status, rows });
}
const med = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '-');
for (const group of ['won', 'lost']) {
  const rs = runsData.filter(r => r.status === group);
  console.log(`\n=== ${group}: ${rs.length} runs (medians per colony, per day)`);
  console.log('days    pop  laborers  busy  workers | gathered eaten food-net food-stock | chopped wood-net wood-stock planks | mood');
  for (const [lo, hi] of [[1, 3], [4, 6], [7, 10], [11, 15], [16, 20], [21, 30]]) {
    const rows = rs.flatMap(r => r.rows.filter(x => x.day >= lo && x.day <= hi));
    if (rows.length < 5) continue;
    const m = (k: keyof Row) => med(rows.map(x => x[k] as number));
    console.log(`${String(lo).padStart(2)}-${String(hi).padEnd(3)} ${f1(m('pop')).padStart(5)} ${f1(m('lab')).padStart(8)} ${(Math.round(m('busy') * 100) + '%').padStart(5)} ${f1(m('workers')).padStart(8)} | ${f1(m('gathered')).padStart(8)} ${f1(m('eaten')).padStart(5)} ${f1(m('foodNet')).padStart(8)} ${f1(m('foodStock')).padStart(10)} | ${f1(m('chopped')).padStart(7)} ${f1(m('woodNet')).padStart(8)} ${f1(m('woodStock')).padStart(10)} ${f1(m('planks')).padStart(6)} | ${f1(m('mood'))}`);
  }
}
// per-person rates, the numbers a player could plan with
const all = runsData.flatMap(r => r.rows.filter(x => x.day >= 4));
const perHead = (k: keyof Row) => med(all.map(x => (x[k] as number) / Math.max(1, x.pop)));
console.log(`\nPer colonist per day (day 4+): eats ${f1(perHead('eaten'))} food · laborer share ${Math.round(perHead('lab') * 100)}%`);
