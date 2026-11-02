// Strain over one bot run: how much it rose, what brought it down (charters, festivals, events, boons), every festival
// with the strain it was called at and what it eased, and what strain cost mood on average.
// Usage: npx tsx tools/strain-ledger.ts <seed> [maxDays=90]
import { createWorld, tick, day, TICKS_PER_HOUR, alive, avgMood, strainPerDay } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
const seed = Number(process.argv[2]), maxDays = Number(process.argv[3] ?? 90);
const w = createWorld(seed); let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
let rose = 0, peak = 0, sumStrain = 0, sumMood = 0, hours = 0;
const eased: Record<string, number> = {};
const fests: string[] = [];
let seen = w.log.length ? w.log[w.log.length - 1] : undefined;
const newLogs = () => { const i = seen ? w.log.lastIndexOf(seen) : -1; const out = w.log.slice(i + 1); seen = w.log[w.log.length - 1]; return out.map(l => l.text); };
while (w.status === 'playing' && day(w) <= maxDays) {
  autoDecide(w, 'greedy', rand);
  for (let t = 0; t < TICKS_PER_HOUR; t++) {
    const before = w.strain;
    tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand);
    const d = w.strain - before, texts = newLogs();
    if (d > 0) rose += d;
    else if (d < -1e-6) {
      const why = texts.find(x => /festival:/i.test(x)) ? 'festival' : texts.find(x => /Charter complete|charter spreads/i.test(x)) ? 'charter' : texts.find(x => /bard|ballad/i.test(x)) ? 'bard' : texts.find(x => /wedding/i.test(x)) ? 'wedding' : texts.find(x => /letter/i.test(x)) ? 'letters from home' : texts.find(x => /moon/i.test(x)) ? 'harvest moon' : 'boons and other';
      eased[why] = (eased[why] ?? 0) - d;
      if (why === 'festival') fests.push(`d${day(w)} strain ${before.toFixed(1)} → ${w.strain.toFixed(1)}${texts.find(x => /festival:/i.test(x))?.match(/(\d+) of (\d+) ate/)?.[0] ? ' (' + texts.find(x => /festival:/i.test(x))!.match(/(\d+) of (\d+) ate/)![0] + ')' : ''}`);
    }
  }
  autoBuild(w);
  peak = Math.max(peak, w.strain); sumStrain += w.strain; sumMood += avgMood(w); hours++;
}
console.log(`${seed}: ${w.status} day ${day(w)} · strain rose ${rose.toFixed(0)} in all, peak ${peak.toFixed(1)}, average ${(sumStrain / hours).toFixed(1)} (so about −${(sumStrain / hours).toFixed(0)} mood each, on average) · average mood ${(sumMood / hours).toFixed(0)}`);
console.log(`  eased: ${Object.entries(eased).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')}`);
console.log(`  festivals (${fests.length}): ${fests.join(' · ') || 'none'}`);
void alive; void strainPerDay;
