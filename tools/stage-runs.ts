// Charter-by-charter bot runs, read day by day (Cody, 2026-11-25): from a fresh seed or a saved world, play N branches
// until the current charter is finished (or maxDays pass), and write for each branch a day-by-day log of what the bot
// decided and what the colony did, plus a save of where it ended. Pick one save and run the next stage from it.
//
//   npx tsx tools/stage-runs.ts --seed 1000 --out runs/s1            (stage 1 from a fresh world)
//   npx tsx tools/stage-runs.ts --from runs/s1/b2.json --out runs/s2 (stage 2 from branch 2's save)
//   options: --branches 5 --maxDays 40 --quiet (summary only)
//
// Branches differ by the world's random stream and the bot's: the same start, five ways it could go.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createWorld, tick, day, alive, avgMood, TICKS_PER_HOUR, World, charterDef, charterRequirements, blockedReason, built, hourOfDay } from '../src/sim/world';
import { autoDecide, autoBuild, TRACE, BotNote } from '../src/sim/autoplayer';
import { BUILDING_BY_ID, MEALS, DRINKS, TIER, ResourceId } from '../src/sim/content';
import { seasonOf } from '../src/sim/seasons';
import { applyWinterWhatIf, applyDraftKnobs } from './winter-whatif';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const branches = Number(arg('branches', '5')), maxDays = Number(arg('maxDays', '40')), out = arg('out', 'runs/stage')!;
const quiet = process.argv.includes('--quiet');
mkdirSync(out, { recursive: true });
applyWinterWhatIf(); applyDraftKnobs();
const start: World = arg('from') ? JSON.parse(readFileSync(arg('from')!, 'utf8')) : createWorld(Number(arg('seed', '1000')));
const startJson = JSON.stringify(start);
const name = (id: string) => BUILDING_BY_ID[id]?.name ?? charterDef(id)?.name ?? id;
const fmt = (n: number) => (Math.abs(n) >= 10 || Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1));
const tierTag = (r: ResourceId) => (TIER[r] ?? '').slice(0, 1);

const summary: string[] = [];
for (let b = 0; b < branches; b++) {
  const w: World = JSON.parse(startJson);
  // a different future for each branch: perturb the world's stream, seed the bot's
  w.rngState = (w.rngState ^ Math.imul(b + 1, 0x9e3779b1)) >>> 0;
  let r = (w.seed * 31 + b * 7919) >>> 0; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  TRACE.on = true; TRACE.notes = [];
  const done0 = w.chartersDone.length, day0 = day(w);
  const lines: string[] = [];
  const say = (s: string) => lines.push(s);
  say(`# Branch ${b} from day ${day0} (${start.chartersDone.length} charters done, seed ${w.seed})`);
  let flows0 = { ...w.flows } as Record<string, number>, log0 = w.log.length, notes0 = 0;
  const use: Record<string, number> = {};
  const blockedHours: Record<string, number> = {};
  const unmetHours: Record<string, number> = {};
  const drafts: string[] = [];
  let curDay = day(w), finished = false, charterName = charterDef(w.charter)?.name ?? '(none yet)';
  const endDay = () => {
    const pop = alive(w);
    const moods = pop.map(c => c.mood);
    const reqs = w.charter ? charterRequirements(w) : [];
    charterName = charterDef(w.charter)?.name ?? charterName;
    say(`\n## Day ${curDay} (${seasonOf(w).season} ${seasonOf(w).dayOf}) · pop ${pop.length} · mood ${fmt(avgMood(w))} (min ${fmt(Math.min(...moods))}) · strain ${fmt(w.strain)} · gold ${fmt(w.gold)}`);
    say(`charter: ${charterDef(w.charter)?.name ?? '—'} ${reqs.map(q => `[${q.metric.kind} ${fmt(q.value)}/${fmt(q.target)}]`).join(' ')}`);
    // time: colony hours by what people were doing (working is by building)
    const total = Object.values(use).reduce((a, c) => a + c, 0) || 1;
    say(`time: ${Object.entries(use).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / total)}%`).join(', ')}`);
    // made and eaten today
    const delta: Record<string, number> = {};
    for (const [k, v] of Object.entries(w.flows)) { const d = v - (flows0[k] ?? 0); if (Math.abs(d) > 0.01) delta[k] = d; }
    const made: Record<string, number> = {}, eaten: Record<string, number> = {};
    for (const [k, v] of Object.entries(delta)) {
      const [res, how] = k.split(':');
      if (how.startsWith('+')) made[res] = (made[res] ?? 0) + v;
      if (how === '-eaten' || how === '-drunk') eaten[res] = (eaten[res] ?? 0) + v;
    }
    say(`made: ${Object.entries(made).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', ') || '—'}`);
    const used: Record<string, number> = {};
    for (const [k, v] of Object.entries(delta)) if (k.split(':')[1]?.startsWith('-') && !k.endsWith(':-eaten') && !k.endsWith(':-drunk')) used[k] = v;
    say(`used: ${Object.entries(used).sort((a, c) => c[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${fmt(v)}`).join(', ') || '—'}`);
    say(`eaten/drunk: ${Object.entries(eaten).map(([k, v]) => `${k}${tierTag(k as ResourceId) ? '(' + tierTag(k as ResourceId) + ')' : ''} ${fmt(v)}`).join(', ') || '—'}`);
    const stock = (Object.keys(w.res) as ResourceId[]).filter(k => w.res[k] >= 1).map(k => `${k} ${fmt(w.res[k])}`);
    say(`stock: ${stock.join(', ')}`);
    if (w.forbidden.length) say(`held back: ${w.forbidden.join(', ')}`);
    const sites = w.buildings.filter(x => !x.built).map(x => name(x.def));
    say(`built: ${[...new Set(built(w).map(x => x.def))].map(name).join(', ')}${sites.length ? ` · sites: ${sites.join(', ')}` : ''}`);
    const blocked = built(w).map(x => [x, blockedReason(w, x)] as const).filter(([, why]) => why);
    if (blocked.length) say(`blocked: ${blocked.map(([x, why]) => `${name(x.def)}: ${why}`).join(' | ')}`);
    say(`people: ${pop.map(c => `${c.name} ${fmt(c.mood)}${c.illness ? ' sick' : ''}${c.breakKind ? ' ' + c.breakKind : ''}`).join(', ')}`);
    // bot decisions and plans
    // the same build or staffing line every hour is one line with a count
    const seen = new Map<string, number>();
    const emit = (s: string) => { if (seen.has(s)) { seen.set(s, seen.get(s)! + 1); return; } seen.set(s, 1); };
    for (const n of TRACE.notes.slice(notes0) as BotNote[]) {
      if (n.kind === 'decision') {
        const opts = (n.options ?? []).map(o => `${o.id === n.chosen ? '*' : ''}${name(o.id)} ${fmt(o.score)}${o.id === n.chosen ? ' (' + Object.entries(o.parts).filter(([, v]) => v).map(([k, v]) => `${k} ${fmt(v)}`).join('; ') + ')' : ''}`);
        say(`decide ${String(n.hour).padStart(2, '0')}h ${n.title}: ${opts.join(' · ') || n.chosen || ''}${n.lines?.length ? ' — ' + n.lines.join(' / ') : ''}`);
        if (n.title === 'Blueprint pick' && n.chosen) drafts.push(`${name(n.chosen)}@${curDay}`);
      } else if (n.kind === 'staff') emit(`staff ${n.title}: ${(n.lines ?? []).join(' / ')}`);
      else if (n.kind === 'build') emit(`build ${n.title}: ${(n.lines ?? []).join(' / ')}`);
    }
    for (const [s2, k] of seen) say(k > 1 ? `${s2}  (×${k})` : s2);
    notes0 = TRACE.notes.length;
    for (const e of w.log.slice(log0)) say(`log ${String(e.hour).padStart(2, '0')}h ${e.text}`);
    log0 = w.log.length; flows0 = { ...w.flows } as Record<string, number>;
    for (const k of Object.keys(use)) delete use[k];
  };
  while (w.status === 'playing' && day(w) - day0 < maxDays) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    autoBuild(w);
    // an hour of everyone's time
    for (const c of alive(w)) {
      const at = c.place != null ? w.buildings.find(x => x.uid === c.place) : undefined;
      const k = c.activity === 'working' && at ? `work:${at.def}` : c.activity;
      use[k] = (use[k] ?? 0) + 1;
    }
    for (const x of built(w)) { const why = blockedReason(w, x); if (why) blockedHours[`${x.def}: ${why.split('.')[0]}`] = (blockedHours[`${x.def}: ${why.split('.')[0]}`] ?? 0) + 1; }
    if (w.charter) for (const q of charterRequirements(w)) if (q.value < q.target) unmetHours[q.metric.kind] = (unmetHours[q.metric.kind] ?? 0) + 1;
    if (Math.floor(hourOfDay(w)) === 0 && day(w) !== curDay) { endDay(); curDay = day(w); }
    if (w.chartersDone.length > done0) { finished = true; endDay(); break; }
  }
  TRACE.on = false;
  writeFileSync(`${out}/b${b}.json`, JSON.stringify(w));
  const topBlocked = Object.entries(blockedHours).sort((a, c) => c[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v}h`).join('; ');
  const unmet = Object.entries(unmetHours).map(([k, v]) => `${k} ${v}h`).join(', ');
  const line = `b${b}: ${finished ? `finished ${w.chartersDone.at(-1) ? name(w.chartersDone.at(-1)!) : ''} on day ${day(w)} (${day(w) - day0}d)` : `not finished by day ${day(w)} (${charterName})`} · pop ${alive(w).length} · mood ${fmt(avgMood(w))} · drafts ${drafts.join(', ') || '—'} · unmet ${unmet || '—'} · most blocked ${topBlocked || '—'}`;
  summary.push(line);
  writeFileSync(`${out}/b${b}.log`, [line, '', ...lines].join('\n'));
  if (!quiet) console.log(line);
}
writeFileSync(`${out}/summary.txt`, summary.join('\n') + '\n');
if (quiet) console.log(summary.join('\n'));
