import { World, Decision, STANDINGS } from '../sim/world';
import { charterDef, colonyName } from '../sim/world';
import { START } from '../sim/scenario';
import type { NeedKey } from '../sim/world';
import { icon } from './icons';
import { NEED_NAMES, NEED_BUILD } from './needs';
import { escapeHtml as esc } from './dom';
import { charterScene } from './charter-scene';

export function charterCompletionCard(w: World, d: Extract<Decision, { kind: 'charter-complete' }>) {
  const tier = d.tier, next = STANDINGS[tier], prev = STANDINGS[tier - 1];
  // what a bigger town comes to expect: each shows up as a line on people's mood
  const changes: { key: NeedKey; title: string; text: string }[] = [
    { key: 'shelter', title: 'Better homes', text: tier === 1 ? 'People still in a shack now feel it a little (−1). A cottage keeps them happy.' : 'A village expects better than a shack (−2). A cottage keeps them happy.' },
  ];
  const penalty = (st: number) => START.wants.unmet[Math.min(st, START.wants.unmet.length - 1)];
  const wants = START.wants.on && penalty(tier) !== penalty(tier - 1) ? `<p class="cc-wants">Personal wants affect mood directly: <b>−${penalty(tier)} per unmet want</b> (previously −${penalty(tier - 1)}).</p>` : '';
  return `<div class="card-wrap charter-celebration">
    <header class="cc-celebrate"><p class="eyebrow">Charter ${tier} complete</p>
      ${charterScene(tier)}
      <h2>${tier === 1 ? 'A settlement takes root' : 'A village to be proud of'}</h2>
      <p class="cc-achievement">${esc(charterDef(d.charter)?.name ?? d.charter)}</p>
      <p class="lede">${esc(colonyName(w))} is now a ${next.toLowerCase()}. ${tier === 1 ? 'Someone hangs a banner. For once, it is the right way up.' : 'The Crown approves. The neighbours are trying to look unimpressed.'}</p>
    </header>
    <div class="cc-rewards" aria-label="Charter rewards"><span>${icon('gold')}<b>+${d.gold} gold</b><small>Received</small></span><span><b>${d.strainBefore.toFixed(1)} → ${d.strainAfter.toFixed(1)}</b><small>Strain eased</small></span><span><b>Cornerstone</b><small>After choosing a charter</small></span></div>
    <p class="cc-standing">${prev} <span aria-hidden="true">→</span> <b>${next}</b></p>
    <section class="cc-expectations" aria-labelledby="expectations-title"><h3 id="expectations-title">What changes now</h3><p class="lede">A growing colony expects more.</p>
      <ul>${changes.map(c => `<li><span class="cc-need-icon">${icon(c.key === 'shelter' ? 'cottage' : c.key === 'drink' ? 'drink' : NEED_BUILD[c.key])}</span><div><b>${esc(c.title)}</b><p>${esc(c.text)}</p></div></li>`).join('')}</ul>
    </section>
    ${wants}
    <p class="cc-note">Next: choose your charter, then a cornerstone to help you fulfil it.</p>
    <button type="button" class="act cc-continue" data-act="resolve" data-arg="0">Continue</button>
  </div>`;
}
