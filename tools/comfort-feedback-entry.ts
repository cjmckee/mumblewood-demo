import { milestoneView, milestoneRewards, MilestoneState, Track } from '../src/sim/comfort-milestones';
import { icon } from '../src/ui/icons';
const $ = (id: string) => document.getElementById(id)!;
const dialog = $('comfort-dialog') as HTMLDialogElement;
const names = { homes: 'Homes', meals: 'Meals', evenings: 'Evenings' };
const icons = { homes: 'cottage', meals: 'meal', evenings: 'stage' };
const stages = ['Camp', 'Settlement', 'Village'];
const roman = ['0', 'I', 'II', 'III'];
const examples = {
  preparing: { standing: 1, scores: [70, 75, 45], hours: 24 },
  basics: { standing: 0, scores: [60, 30, 30], hours: 24 },
  thriving: { standing: 1, scores: [85, 75, 65], hours: 24 },
  village: { standing: 2, scores: [75, 80, 70], hours: 24 },
  warming: { standing: 1, scores: [70, 75, 45], hours: 8 },
};
let tab: 'now' | 'next' = 'now';
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
  const s = state(), standing = input('standing'), current = milestoneView(s, standing, 24), next = milestoneView(s, Math.min(2, standing + 1), 24);
  const hasNext = standing < 2;
  if (!hasNext) tab = 'now';
  $('settlement-standing').textContent = stages[standing];
  $('hud-level').textContent = `Comfort ${roman[current.level]}`;
  $('hud-count').textContent = current.ready ? `${current.level} of 3 tracks active` : `Gathering history · ${current.samples}/24h`;
  $('hud-perks').textContent = current.level ? perks(current.level).join(' · ') : 'Sustained provision unlocks colony rewards';
  $('hud-dots').innerHTML = current.tracks.map(t => `<span class="track-dot ${current.ready && meets(t) ? 'active' : ''}" aria-hidden="true">${icon(icons[t.track])}</span>`).join('');
  const warning = !current.ready ? 'Still gathering history. Review the next requirements.' : next.level < current.level ? `After this charter: comfort ${roman[current.level]} → ${roman[next.level]}` : `After this charter: comfort stays ${roman[next.level]}`;
  $('charter-note').textContent = hasNext ? warning : 'Final charter: no further comfort requirements';
  $('charter-warning').classList.toggle('at-risk', hasNext && current.ready && next.level < current.level);
  ($('open-next') as HTMLButtonElement).hidden = !hasNext;
  $('dialog-context').textContent = `${stages[standing]} · ${current.samples}/24 hours recorded`;
  for (const t of ['now', 'next']) {
    const button = $(`tab-${t}`) as HTMLButtonElement;
    button.setAttribute('aria-selected', String(tab === t));
    button.tabIndex = tab === t ? 0 : -1;
    button.hidden = t === 'next' && !hasNext;
  }
  $('comfort-body').innerHTML = nowPanel(current) + (hasNext ? nextPanel(current, next) : '');
  $('panel-now').hidden = tab !== 'now';
  const nextPanelElement = document.getElementById('panel-next');
  if (nextPanelElement) nextPanelElement.hidden = tab !== 'next';
  for (const track of ['homes', 'meals', 'evenings']) $(`example-${track}-value`).textContent = `${input(track)}%`;
  $('example-hours-value').textContent = `${input('hours')} hours`;
}
type View = ReturnType<typeof milestoneView>;
function trackRows(view: View, future = false, current?: View) {
  return view.tracks.map(t => {
    const active = view.ready && meets(t), was = current?.ready && meets(current.tracks.find(c => c.track === t.track)!);
    const status = !view.ready ? 'Gathering history' : active ? 'Active' : future && was ? 'Would become inactive' : 'Inactive';
    return `<article class="track-row ${active ? 'qualifies' : ''}"><div class="track-heading"><b>${icon(icons[t.track])}${names[t.track]}</b><span class="status">${status}</span></div><div class="track-numbers"><span>${pct(t.average)} <small>rolling average</small></span><span>${pct(t.requirement)} <small>${future ? 'needed next' : 'needed'}</small></span></div><div class="meter" aria-hidden="true"><span style="width:${pct(t.average)}"></span><i style="left:${pct(t.requirement)}"></i></div></article>`;
  }).join('');
}
function nowPanel(v: View) {
  const inactive = v.tracks.filter(t => !meets(t)).sort((a, b) => (a.requirement - a.average) - (b.requirement - b.average));
  const target = inactive[0];
  const actions: Record<Track, string> = { homes: 'Provide cozy cottage beds for more settlers.', meals: 'Serve better-quality cooked meals at a table.', evenings: 'Improve recreation with music or tavern evenings.' };
  const nextReward = v.level === 0 ? '5% slower strain growth' : v.level === 1 ? '5% faster workshop work' : '5% chance of doubled workshop output';
  return `<section role="tabpanel" id="panel-now" aria-labelledby="tab-now"><div class="level-card"><span class="eyebrow">Current comfort</span><h3>Level ${roman[v.level]} <span>${v.ready ? `${v.level}/3 tracks active` : 'First day in progress'}</span></h3><p>${!v.ready ? `Rewards start after a full 24 hours of history. ${24 - v.samples} more hours to record.` : v.level ? perks(v.level).join('<br>') : 'No comfort rewards active yet.'}</p></div><p class="explain">Each track uses provision over the last 24 hours. A brief dip affects part of that average; rewards change when the average crosses the requirement.</p>${trackRows(v)}<section class="next-step"><p class="eyebrow">${!v.ready ? 'While history builds' : v.level === 3 ? 'Keep it thriving' : 'Your next level'}</p><h4>${!v.ready ? 'Keep provision steady through the first day' : v.level === 3 ? 'All three tracks are active' : `Level ${roman[Math.min(3, v.level + 1)]} adds ${nextReward}`}</h4><p>${target ? `${names[target.track]}: ${Math.round((target.requirement - target.average) * 100)} points below the requirement. ${actions[target.track]} Improvements need time to affect the rolling average.` : 'Keep provision above the requirements to retain your rewards.'}</p></section>${rewardLadder(v.level)}</section>`;
}
function rewardLadder(level: number) {
  const rewards = ['5% slower strain growth', 'Also 5% faster workshop work', 'Also 5% chance of doubled workshop output'];
  return `<details class="ladder"><summary>All comfort rewards</summary><ol>${rewards.map((r, i) => `<li class="${level > i ? 'good' : ''}"><b>${roman[i + 1]}</b><span>${r}</span><small>${level > i ? 'Active' : 'Locked'}</small></li>`).join('')}</ol><p class="explain">Rewards stack. Workshop bonuses apply to batches that consume ingredients. Gathering, hauling and construction are unchanged.</p></details>`;
}
function nextPanel(current: View, future: View) {
  const lost = perks(current.level).filter(p => !perks(future.level).includes(p));
  return `<section role="tabpanel" id="panel-next" aria-labelledby="tab-next"><div class="level-card ${current.ready && future.level < current.level ? 'warning-card' : ''}"><span class="eyebrow">${stages[Math.min(2, input('standing') + 1)]} · at today’s provision</span><h3>${current.ready ? `Level ${roman[current.level]} → ${roman[future.level]}` : 'Gathering the first day’s history'}</h3><p>${!current.ready ? 'There is not yet a full day of history to forecast active rewards.' : lost.length ? `You would lose: ${lost.join(' and ')}.` : 'Your current rewards would remain active.'}</p></div><p class="explain">Completing this charter raises the requirements. This compares the same averages with the next standards; provision can still change before you finish.</p>${trackRows(future, true, current)}<p class="forecast-note">${current.ready ? 'The change applies when the charter completes. Preparing ahead can help you keep your comfort level.' : 'The requirements below are definite; which tracks will qualify depends on the provision history you build.'}</p></section>`;
}
function open(which: 'now' | 'next') { tab = which; render(); dialog.showModal(); }
$('open-comfort').addEventListener('click', () => open('now'));
$('open-next').addEventListener('click', () => open('next'));
$('close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
for (const which of ['now', 'next'] as const) $(`tab-${which}`).addEventListener('click', () => { tab = which; render(); });
$('tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); tab = e.key === 'Home' || e.key === 'ArrowLeft' ? 'now' : input('standing') < 2 ? 'next' : 'now'; render(); $(`tab-${tab}`).focus();
});
document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-example]').forEach(el => el.addEventListener('input', () => render()));
$('example-scenario').addEventListener('change', () => {
  const example = examples[($('example-scenario') as HTMLSelectElement).value as keyof typeof examples];
  ($('example-standing') as HTMLSelectElement).value = String(example.standing);
  for (const [i, track] of ['homes', 'meals', 'evenings'].entries()) ($(`example-${track}`) as HTMLInputElement).value = String(example.scores[i]);
  ($('example-hours') as HTMLInputElement).value = String(example.hours); render();
});
render();
