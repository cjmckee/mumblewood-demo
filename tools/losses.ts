// Why do bot runs fail, and where does the time go?
// Usage: npx tsx tools/losses.ts [runs=200] [seedBase=90000] [difficulty=normal]
import { createWorld, tick, day, TICKS_PER_HOUR, Difficulty, alive, avgMood } from '../src/sim/world';
import { autoDecide, autoBuild, BOT } from '../src/sim/autoplayer';
// experiments: BOT_DEPOT=food|meals, BOT_LABORERS=3.5
if (process.env.BOT_DEPOT) BOT.foodDepot = process.env.BOT_DEPOT === 'none' ? false : process.env.BOT_DEPOT as 'food' | 'meals';
if (process.env.BOT_ADVISOR) BOT.advisor = process.env.BOT_ADVISOR === '1';
if (process.env.BOT_OFF) BOT.off = process.env.BOT_OFF.split(',');
if (process.env.BOT_GATE === '0') BOT.gate = false;
if (process.env.BOT_SKIP) BOT.skip = process.env.BOT_SKIP.split(',');
if (process.env.BOT_RANKED === '0') BOT.ranked = false;
if (process.env.BOT_MOODBLOCK) BOT.moodBlock = process.env.BOT_MOODBLOCK !== '0';
if (process.env.BOT_RESCUE) { BOT.rescue = process.env.BOT_RESCUE !== '0'; if (Number(process.env.BOT_RESCUE) > 1) BOT.rescueAt = Number(process.env.BOT_RESCUE); }
if (process.env.BOT_COMFORT) BOT.comfort = process.env.BOT_COMFORT as 'strict' | 'econ' | 'none';
if (process.env.BOT_LABORERS) BOT.laborersPer = Number(process.env.BOT_LABORERS);

const runs = Number(process.argv[2] ?? 200);
const base = Number(process.argv[3] ?? 90000);
const difficulty = (process.argv[4] ?? 'normal') as Difficulty;
const med = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);

const causes: Record<string, number> = {};
const lossCharter: Record<string, number> = {};
const tierDays: number[][] = [[], [], []];
const lossDay: number[] = [], winDay: number[] = [];
const moodAtLoss: number[] = [];
let won = 0, lost = 0, timeout = 0;
for (let i = 0; i < runs; i++) {
  const w = createWorld(base + i * 104729, difficulty);
  let tierStart = w.hour, tier = 0;
  while (w.status === 'playing' && day(w) <= 50) {
    autoDecide(w);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); autoDecide(w); }
    autoBuild(w);
    if (w.chartersDone.length > tier) { tierDays[tier].push((w.hour - tierStart) / 24); tier = w.chartersDone.length; tierStart = w.hour; }
  }
  for (const l of w.log) {
    if (l.text.includes('wandered off into the woods')) causes['left: unhappy'] = (causes['left: unhappy'] ?? 0) + 1;
    else if (l.text.includes('carted off to a physician')) causes['left: untreated injury'] = (causes['left: untreated injury'] ?? 0) + 1;
    else if (l.text.includes('has died of hunger')) causes['died: starvation'] = (causes['died: starvation'] ?? 0) + 1;
    else if (l.text.includes('has died of')) causes['died: flu'] = (causes['died: flu'] ?? 0) + 1;
  }
  if (w.status === 'won') { won++; winDay.push(day(w)); }
  else if (w.status === 'lost') { lost++; lossDay.push(day(w)); moodAtLoss.push(avgMood(w)); lossCharter[w.charter ?? 'between charters'] = (lossCharter[w.charter ?? 'between charters'] ?? 0) + 1; }
  else timeout++;
  void alive;
}
console.log(`${runs} fresh runs on ${difficulty}: won ${Math.round(won / runs * 100)}%, lost ${Math.round(lost / runs * 100)}%, still going at day 50 ${Math.round(timeout / runs * 100)}%`);
console.log(`median winning day ${med(winDay)}, median losing day ${med(lossDay)}, median mood at collapse ${Math.round(med(moodAtLoss))}`);
console.log(`median days per charter: first ${med(tierDays[0]).toFixed(1)}, second ${med(tierDays[1]).toFixed(1)}, third ${med(tierDays[2]).toFixed(1)}`);
const totalLost = Object.values(causes).reduce((a, b) => a + b, 0);
console.log('How settlers were lost (all runs):');
for (const [k, v] of Object.entries(causes).sort((a, b) => b[1] - a[1])) console.log(`  ${String(Math.round(v / totalLost * 100)).padStart(3)}%  ${k} (${v})`);
console.log('Charter the colony was on when it collapsed:');
for (const [k, v] of Object.entries(lossCharter).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
