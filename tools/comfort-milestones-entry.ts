import { World, alive, avgMood, edibleTotal, strainPerDay, enableComfortMilestones, comfortMilestoneView, tradeOf, bedridden, apply, findSpot, tick, TICKS_PER_HOUR, siteWork, standingOf } from '../src/sim/world';
import { MilestoneState, RewardProfile, milestoneView } from '../src/sim/comfort-milestones';
import { autoBuild, autoDecide } from '../src/sim/autoplayer';
import { BUILDING_BY_ID } from '../src/sim/content';
const $ = (id: string) => document.getElementById(id)!;
const value = (id: string) => ($(id) as HTMLInputElement).value;
const cases = JSON.parse($('case-data').textContent!);
let w: World, decisionState = 0, startHour = 0, workerId = 0, projectId: number | null = null, busy = false;
const percent = (n: number) => `${Math.round(n * 100)}%`;
const profile = () => value('profile') as RewardProfile | 'off';
const rewardText = (view: ReturnType<typeof milestoneView>) => [
  view.strain < 1 ? `${Math.round((1 - view.strain) * 100)}% slower strain growth` : 'No strain reduction',
  ...(view.speed > 1 ? [`${Math.round((view.speed - 1) * 100)}% faster workshop work`] : []),
  ...(view.doubleChance > 0 ? [`${percent(view.doubleChance)} chance of doubled workshop output`] : []),
].join(' · ');
function renderLab() {
  const s: MilestoneState = { profile: profile() === 'off' ? 'balanced' : profile() as RewardProfile, history: [], rng: 1, eligibleBatches: 0, bonusBatches: 0, bonusUnits: 0 };
  for (let hour = 1; hour <= 24; hour++) s.history.push({ hour, homes: Number(value('lab-homes')) / 100, meals: Number(value('lab-meals')) / 100, evenings: Number(value('lab-evenings')) / 100 });
  const v = milestoneView(profile() === 'off' ? undefined : s, Number(value('standing')), 24);
  $('lab-level').textContent = `Level ${v.level}`;
  $('lab-reward').textContent = profile() === 'off' ? 'Prototype rewards disabled' : rewardText(v);
  for (const track of ['homes', 'meals', 'evenings']) {
    const score = Number(value(`lab-${track}`)) / 100, t = v.tracks.find(t => t.track === track)!;
    $(`lab-${track}-value`).textContent = `${percent(score)} / needs ${percent(t.requirement)}`;
  }
}
function reserveWorker() {
  if (w.hour - startHour >= 168) return;
  const c = alive(w).find(c => c.id === workerId); if (!c || c.errand || bedridden(c)) return;
  const b = w.buildings.find(b => b.uid === projectId);
  if (value('choice') === 'production' && b?.built) {
    for (let i = 0; i < BUILDING_BY_ID.kitchen.recipes!.length; i++) if ((b.off ?? []).includes(i) === (i === 0)) apply(w, { type: 'toggleRecipe', building: b.uid, recipe: i, on: i === 0 });
    if (c.job !== b.uid) {
      // Keep the original reserved worker assigned; all other allocation is ordinary bot planning.
      const occupants = alive(w).filter(p => p.job === b.uid && p.id !== c.id);
      for (const p of occupants) apply(w, { type: 'trade', colonist: p.id, trade: null });
      apply(w, { type: 'assign', colonist: c.id, building: b.uid });
    }
  } else if (tradeOf(w, c) != null) apply(w, { type: 'trade', colonist: c.id, trade: null });
}
function reset() {
  const checkpoint = cases[value('case')];
  w = structuredClone(checkpoint.world); decisionState = checkpoint.decisionState; startHour = w.hour;
  const c = alive(w).filter(c => tradeOf(w, c) == null && !bedridden(c) && !c.errand && !c.carrying).sort((a, b) => b.skills.cooking - a.skills.cooking || a.id - b.id)[0];
  workerId = c.id; projectId = null;
  if (profile() !== 'off') enableComfortMilestones(w, profile() as RewardProfile);
  const def = value('choice') === 'comfort' ? checkpoint.metadata.id : value('choice') === 'production' ? 'kitchen' : null;
  if (def) {
    const spot = findSpot(w, def); if (!spot) throw new Error('No room for selected project');
    const error = apply(w, { type: 'place', def, ...spot }); if (error) throw new Error(error);
    projectId = w.buildings.at(-1)!.uid;
  }
  reserveWorker(); renderLab(); render();
}
function render() {
  const v = comfortMilestoneView(w), elapsed = Math.round(w.hour - startHour);
  $('elapsed').textContent = `${elapsed} hours played · ${alive(w).length} settlers · ${['Camp', 'Settlement', 'Village'][standingOf(w)]} expectations · ${w.status === 'playing' ? 'colony active' : w.status}`;
  $('live-level').textContent = `Level ${v.level}`;
  $('live-level').dataset.level = String(v.level);
  $('live-level').dataset.samples = String(v.samples);
  $('live-reward').textContent = profile() === 'off' ? 'Prototype rewards disabled' : v.ready ? rewardText(v) : `Gathering a full day of history: ${v.samples}/24 hours`;
  $('live-tracks').replaceChildren(...v.tracks.map(t => {
    const row = document.createElement('p');
    row.textContent = `${{ homes: 'Homes', meals: 'Meals', evenings: 'Evenings' }[t.track]}: ${percent(t.average)} / needs ${percent(t.requirement)} · ${v.ready && t.average >= t.requirement ? 'active' : 'inactive'}`;
    row.className = v.ready && t.average >= t.requirement ? 'good' : 'note'; return row;
  }));
  $('mood').textContent = avgMood(w).toFixed(1);
  $('strain').textContent = w.strain.toFixed(2);
  $('growth').textContent = `+${strainPerDay(w).toFixed(2)}/day`;
  $('food').textContent = String(edibleTotal(w));
  const b = w.buildings.find(b => b.uid === projectId);
  $('project').textContent = b ? `${BUILDING_BY_ID[b.def].name}: ${b.built ? 'complete' : `${Math.min(99, Math.round(b.progress / siteWork(b) * 100))}% built`}` : 'Budget saved; worker available for general labor';
  const s = w.comfortMilestones;
  $('bonuses').textContent = `${s?.bonusBatches ?? 0} doubled batches / ${s?.eligibleBatches ?? 0} eligible · ${s?.bonusUnits ?? 0} extra items earned`;
  $('phase').textContent = elapsed < 168 ? 'First week: one project, one reserved worker; existing sites keep progressing.' : 'Follow-up: normal construction and staffing have resumed.';
  $('colony-log').replaceChildren(...w.log.slice(-5).reverse().map(l => { const p = document.createElement('p'); p.textContent = l.text; return p; }));
}
async function advance(hours: number) {
  if (busy) return; busy = true;
  const controls = document.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('#setup select, #setup button, [data-hours]'); controls.forEach(c => c.disabled = true);
  try {
    const end = Math.min(startHour + 336, w.hour + hours);
    const rand = () => ((decisionState = (decisionState * 1103515245 + 12345) >>> 0) / 4294967296);
    while (w.hour < end && w.status === 'playing') {
      autoDecide(w, 'greedy', rand); reserveWorker();
      for (let t = 0; t < TICKS_PER_HOUR && w.status === 'playing'; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); reserveWorker(); }
      autoBuild(w, { construction: w.hour - startHour >= 168 }); reserveWorker();
      if (Math.round(w.hour - startHour) % 6 === 0) { render(); await new Promise(resolve => setTimeout(resolve, 0)); }
    }
    render();
  } finally { busy = false; controls.forEach(c => c.disabled = false); }
}
document.querySelectorAll<HTMLInputElement>('[data-lab]').forEach(c => c.addEventListener('input', renderLab));
$('standing').addEventListener('change', renderLab);
document.querySelectorAll('#setup select').forEach(c => c.addEventListener('change', reset));
$('reset').addEventListener('click', reset);
document.querySelectorAll<HTMLButtonElement>('[data-hours]').forEach(b => b.addEventListener('click', () => { void advance(Number(b.dataset.hours)); }));
reset();
