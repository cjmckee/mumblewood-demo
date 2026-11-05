import { World, alive, charterDef, colonyName, day } from '../sim/world';
import { escapeHtml as esc } from './dom';
import { charterScene } from './charter-scene';

/** Presentation uses the completed world's actual counters; no new rewards or simulation steps. */
export function finalCelebrationCard(w: World, ledger = '') {
  const last = w.chartersDone[w.chartersDone.length - 1];
  const s = w.stats;
  const highlights = [
    ['Days to town', day(w)], ['Settlers at home', alive(w).length],
    ['Buildings raised', s.built], ['Meals eaten', s.mealsEaten],
  ];
  const details = [
    ['Charters completed', `${w.chartersDone.length} / 3`], ['Peak population', s.peakPop],
    ['Couples formed', s.couples], ['Breakups', s.breakups], ['Errands completed', s.errands],
    ['Recoveries', s.cured], ['Departures', s.departures], ['Deaths', s.deaths], ['Festivals held', w.festival?.held ?? 0],
  ];
  const rows = (stats: (string | number)[][]) => stats.map(([label, value]) => `<div><dt>${esc(String(label))}</dt><dd>${esc(String(value))}</dd></div>`).join('');
  return `<div class="card-wrap end won charter-celebration final-celebration">
    <header class="cc-celebrate"><p class="eyebrow">All three charters complete</p>
      ${charterScene(3, last === 'longtable' ? 'pavilion' : 'hall')}
      <h2>${esc(colonyName(w))} is a town</h2>
      <p class="cc-achievement">${esc(charterDef(last)?.name ?? 'Final charter complete')}</p>
      <p class="lede">From a camp in the woods to a place to call home.</p>
    </header>
    <dl class="stats finale-highlights" aria-label="Settlement highlights">${rows(highlights)}</dl>
    <details class="finale-details" data-key="finale-stats"><summary>Your settlement in numbers</summary><dl class="stats">${rows(details)}</dl></details>
    <section class="finale-thanks"><h3>Thank you for playing Mumblewood.</h3><p>We hope you enjoyed making a little home in the woods.</p></section>
    ${ledger}
    <div class="finale-actions"><button type="button" class="act" data-act="restart">Start a new settlement</button><button type="button" class="ghost" data-act="finale-peek">Look around your town</button></div>
    <p class="cc-note">Your finished run stays in the ledger when you begin again.</p>
  </div>`;
}
