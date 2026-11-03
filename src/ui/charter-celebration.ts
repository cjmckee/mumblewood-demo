import { World, Decision, activeNeeds, STANDINGS } from '../sim/world';
import { charterDef, colonyName } from '../sim/world';
import { START } from '../sim/scenario';
import { seasonOf } from '../sim/seasons';
import type { NeedKey } from '../sim/world';
import { icon } from './icons';
import { NEED_NAMES, NEED_BUILD } from './needs';
import { escapeHtml as esc } from './dom';
import { charterScene } from './charter-scene';

export function charterCompletionCard(w: World, d: Extract<Decision, { kind: 'charter-complete' }>) {
  const tier = d.tier, next = STANDINGS[tier], prev = STANDINGS[tier - 1];
  const later = START.seasons.stricterFromYear > 0 && seasonOf(w).year >= START.seasons.stricterFromYear;
  const shelter = tier === 1 ? (later ? 60 : 75) : (later ? 25 : 50);
  const changes: { key: NeedKey; title: string; text: string }[] = [
    { key: 'shelter', title: 'Better homes', text: `A bed in a lean-to now meets ${shelter}% of the shelter need. A cottage meets it fully.` },
    { key: 'meals', title: tier === 1 ? 'Cooked meals' : 'Better meals', text: tier === 1 ? 'Settlers now expect cooked meals. Tables and favourite dishes add comfort.' : 'Higher-quality meals give more comfort. Eating at a table matters more, too.' },
  ];
  if (tier === 2) changes.push({ key: 'evenings', title: 'Livelier evenings', text: 'Settlers expect more from their free time. Tavern gatherings and music help them unwind.' });
  const added = activeNeeds(w, tier).filter(k => !activeNeeds(w, tier - 1).includes(k) && k !== 'meals');
  const descriptions: Partial<Record<NeedKey, string>> = {
    health: 'Healthy settlers are comfortable. A staffed clinic helps sick settlers recover.',
    evenings: 'Time to unwind now counts toward comfort. Staff a tavern or build a bard’s stage to help settlers relax.',
    variety: `Eating ${later ? 'three' : 'two'} kinds of meal within three days meets this need.`,
    surroundings: 'Make homes and workplaces pleasant with paths and decorations.',
    drink: 'In summer, a drink within the last 30 hours meets this need.',
    fresh: 'In spring, eating berries, apples, fish or skewers within three days meets this need.',
  };
  for (const key of added) if (descriptions[key]) changes.push({ key, title: NEED_NAMES[key], text: descriptions[key]! });
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
    <section class="cc-expectations" aria-labelledby="expectations-title"><h3 id="expectations-title">What changes now</h3><p class="lede">A growing colony expects more. Meet these needs to slow strain growth.</p>
      <ul>${changes.map(c => `<li><span class="cc-need-icon">${icon(c.key === 'shelter' ? 'cottage' : c.key === 'drink' ? 'drink' : NEED_BUILD[c.key])}</span><div><b>${esc(c.title)}</b><p>${esc(c.text)}</p></div></li>`).join('')}</ul>
    </section>
    ${wants}
    <p class="cc-note">Next: choose your charter, then a cornerstone to help you fulfil it.</p>
    <button type="button" class="act cc-continue" data-act="resolve" data-arg="0">Continue</button>
  </div>`;
}
