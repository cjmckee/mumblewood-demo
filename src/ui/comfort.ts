import { World, comfortMilestoneView, standingOf, STANDINGS } from '../sim/world';
import { milestoneRewards, Track, RewardProfile } from '../sim/comfort-milestones';
import { icon } from './icons';
const names = { homes: 'Homes', meals: 'Meals', evenings: 'Evenings' };
const icons = { homes: 'cottage', meals: 'meal', evenings: 'stage' };
const roman = ['0', 'I', 'II', 'III'];
type View = ReturnType<typeof comfortMilestoneView>;
const meets = (t: View['tracks'][number]) => t.average >= t.requirement - 1e-9;
const percent = (n: number) => `${(n * 100).toFixed(1).replace(/\.0$/, '')}%`;
function rewards(profile: RewardProfile, level: number) {
  // The player profile is balanced; read its actual multipliers rather than duplicating the values.
  const r = milestoneRewards(profile, level);
  return [r.strain < 1 ? `${Math.round((1 - r.strain) * 100)}% slower strain growth` : '', r.speed > 1 ? `${Math.round((r.speed - 1) * 100)}% faster workshop work` : '', r.doubleChance > 0 ? `${percent(r.doubleChance)} chance of doubled workshop output` : ''].filter(Boolean);
}
export function comfortChip(w: World) {
  if (!w.comfortMilestones) return '';
  const v = comfortMilestoneView(w);
  return `<button type="button" class="comfort-chip" data-act="comfort-open" aria-haspopup="dialog"><span class="comfort-chip-main"><b>Comfort ${roman[v.level]}</b><small>${v.ready ? `${v.level} of 3 tracks active` : `Gathering history · ${v.samples}/24h`}</small></span><span class="comfort-dots" aria-hidden="true">${v.tracks.map(t => `<i class="${v.ready && meets(t) ? 'active' : ''}">${icon(icons[t.track])}</i>`).join('')}<span>›</span></span><small class="comfort-chip-perks">${v.level ? rewards(w.comfortMilestones.profile, v.level).join(' · ') : 'Sustained care unlocks colony rewards'}</small></button>`;
}
export function comfortCard(w: World) {
  const v = comfortMilestoneView(w), profile = w.comfortMilestones?.profile ?? 'balanced';
  const hints: Record<Track, string> = {
    homes: standingOf(w) === 0 ? 'Add lean-tos so more settlers have a bed.' : 'Add cozy cottage beds to improve homes.',
    meals: 'Serve better-quality cooked meals at a dining table.',
    evenings: 'Add a bard’s stage, or staff and supply a tavern, to improve evenings.',
  };
  const tracks = v.tracks.map(t => `<article class="comfort-track ${v.ready && meets(t) ? 'qualifies' : ''}"><div class="comfort-track-heading"><b>${icon(icons[t.track])}${names[t.track]}</b><span>${!v.ready ? 'Gathering history' : meets(t) ? 'Active' : 'Inactive'}</span></div><div class="comfort-track-numbers"><span>${percent(t.average)} <small>rolling average</small></span><span>${percent(t.requirement)} <small>needed</small></span></div><div class="comfort-meter" aria-hidden="true"><span style="width:${t.average * 100}%"></span><i style="left:${t.requirement * 100}%"></i></div>${!meets(t) ? `<p class="comfort-hint">${hints[t.track]}</p>` : ''}</article>`).join('');
  const ladder = [1, 2, 3].map(level => {
    const previous = rewards(profile, level - 1), added = rewards(profile, level).filter(r => !previous.includes(r));
    return `<li class="${v.level >= level ? 'active' : ''}"><b>${roman[level]}</b><span>${added.join(' · ')}</span><small>${v.level >= level ? 'Active' : 'Locked'}</small></li>`;
  }).join('');
  return `<div class="card-wrap comfort-card"><header class="comfort-head"><div><p class="eyebrow">Your settlement</p><h2>Comfort</h2><p>${STANDINGS[standingOf(w)]} · ${v.samples}/24 hours recorded</p></div><button type="button" class="ghost comfort-close" data-act="comfort-close" aria-label="Close comfort">×</button></header><section class="comfort-level"><p class="eyebrow">Current comfort</p><h3>Level ${roman[v.level]} <span>${v.ready ? `${v.level}/3 tracks active` : 'First day in progress'}</span></h3><p>${!v.ready ? `Rewards start after a full 24 hours of history. ${24 - v.samples} more hours to record.` : v.level ? rewards(profile, v.level).join('<br>') : 'No comfort rewards active yet.'}</p></section><p class="comfort-explain">Each track uses care over the last 24 hours. A brief dip affects part of that average; rewards change when the average crosses the requirement. Requirements rise as charters are completed.</p>${tracks}<details class="comfort-ladder" data-key="comfort-rewards"><summary>All comfort rewards</summary><ol>${ladder}</ol><p class="comfort-explain">Rewards stack. Workshop bonuses apply to batches that consume ingredients. Gathering, hauling and construction are unchanged.</p></details></div>`;
}
