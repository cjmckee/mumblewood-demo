import { milestoneView, milestoneRewards, MilestoneState, Track } from '../src/sim/comfort-milestones';
import { icon } from '../src/ui/icons';
const $ = (id: string) => document.getElementById(id)!;
const dialog = $('comfort-dialog') as HTMLDialogElement;
const names = { homes: 'Homes', meals: 'Meals', evenings: 'Evenings' };
const icons = { homes: 'cottage', meals: 'meal', evenings: 'stage' };
const stages = ['Camp', 'Settlement', 'Village'];
const improvements: Record<Track, string> = { homes: 'Add cozy cottage beds to improve homes.', meals: 'Serve better-quality cooked meals at a dining table.', evenings: 'Add a bard’s stage, or staff and supply a tavern, to improve evenings.' };
const roman = ['0', 'I', 'II', 'III'];
const examples = {
  preparing: { standing: 1, scores: [70, 75, 45], hours: 24 },
  basics: { standing: 0, scores: [60, 30, 30], hours: 24 },
  thriving: { standing: 1, scores: [85, 75, 65], hours: 24 },
  village: { standing: 2, scores: [75, 80, 70], hours: 24 },
  warming: { standing: 1, scores: [70, 75, 45], hours: 8 },
};
const input = (id: string) => Number(($(`example-${id}`) as HTMLInputElement).value);
function state(): MilestoneState {
  return { profile: 'balanced', history: Array.from({ length: input('hours') }, (_, i) => ({ hour: 25 - input('hours') + i, homes: input('homes') / 100, meals: input('meals') / 100, evenings: input('evenings') / 100 })), rng: 1, eligibleBatches: 0, bonusBatches: 0, bonusUnits: 0 };
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
const meets = (t: { average: number; requirement: number }) => t.average >= t.requirement - 1e-9;
function perks(level: number) {
  const r = milestoneRewards('balanced', level);
  return [r.strain < 1 ? '5% slower strain growth' : '', r.speed > 1 ? '5% faster workshop work' : '', r.doubleChance > 0 ? '5% chance of doubled output' : ''].filter(Boolean);
}
function render() {
  const s = state(), standing = input('standing'), current = milestoneView(s, standing, 24);
  $('settlement-standing').textContent = stages[standing];
  $('hud-level').textContent = `Comfort ${roman[current.level]}`;
  $('hud-count').textContent = current.ready ? `${current.level} of 3 tracks active` : `Gathering history · ${current.samples}/24h`;
  $('hud-perks').textContent = current.level ? perks(current.level).join(' · ') : 'Sustained provision unlocks colony rewards';
  $('hud-dots').innerHTML = current.tracks.map(t => `<span class="track-dot ${current.ready && meets(t) ? 'active' : ''}" aria-hidden="true">${icon(icons[t.track])}</span>`).join('');
  $('dialog-context').textContent = `${stages[standing]} · ${current.samples}/24 hours recorded`;
  $('comfort-body').innerHTML = nowPanel(current);
  for (const track of ['homes', 'meals', 'evenings']) $(`example-${track}-value`).textContent = `${input(track)}%`;
  $('example-hours-value').textContent = `${input('hours')} hours`;
}
type View = ReturnType<typeof milestoneView>;
function trackRows(view: View) {
  return view.tracks.map(t => {
    const active = view.ready && meets(t);
    const status = !view.ready ? 'Gathering history' : active ? 'Active' : 'Inactive';
    return `<article class="track-row ${active ? 'qualifies' : ''}"><div class="track-heading"><b>${icon(icons[t.track])}${names[t.track]}</b><span class="status">${status}</span></div><div class="track-numbers"><span>${pct(t.average)} <small>rolling average</small></span><span>${pct(t.requirement)} <small>needed</small></span></div><div class="meter" aria-hidden="true"><span style="width:${pct(t.average)}"></span><i style="left:${pct(t.requirement)}"></i></div>${!meets(t) ? `<p class="track-hint">${improvements[t.track]}</p>` : ''}</article>`;
  }).join('');
}
function nowPanel(v: View) {
  return `<section id="comfort-overview" aria-label="Current comfort"><div class="level-card"><span class="eyebrow">Current comfort</span><h3>Level ${roman[v.level]} <span>${v.ready ? `${v.level}/3 tracks active` : 'First day in progress'}</span></h3><p>${!v.ready ? `Rewards start after a full 24 hours of history. ${24 - v.samples} more hours to record.` : v.level ? perks(v.level).join('<br>') : 'No comfort rewards active yet.'}</p></div><p class="explain">Each track uses provision over the last 24 hours. A brief dip affects part of that average; rewards change when the average crosses the requirement. Requirements rise as charters are completed.</p>${trackRows(v)}${rewardLadder(v.level)}</section>`;
}
function rewardLadder(level: number) {
  const rewards = ['5% slower strain growth', 'Also 5% faster workshop work', 'Also 5% chance of doubled workshop output'];
  return `<details class="ladder"><summary>All comfort rewards</summary><ol>${rewards.map((r, i) => `<li class="${level > i ? 'good' : ''}"><b>${roman[i + 1]}</b><span>${r}</span><small>${level > i ? 'Active' : 'Locked'}</small></li>`).join('')}</ol><p class="explain">Rewards stack. Workshop bonuses apply to batches that consume ingredients. Gathering, hauling and construction are unchanged.</p></details>`;
}
$('open-comfort').addEventListener('click', () => { render(); dialog.showModal(); });
$('close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-example]').forEach(el => el.addEventListener('input', () => render()));
$('example-scenario').addEventListener('change', () => {
  const example = examples[($('example-scenario') as HTMLSelectElement).value as keyof typeof examples];
  ($('example-standing') as HTMLSelectElement).value = String(example.standing);
  for (const [i, track] of ['homes', 'meals', 'evenings'].entries()) ($(`example-${track}`) as HTMLInputElement).value = String(example.scores[i]);
  ($('example-hours') as HTMLInputElement).value = String(example.hours); render();
});
render();
