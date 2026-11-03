import { comfortMultiplier, STRONG_COMFORT_CURVE, REWARD_COMFORT_CURVE } from '../src/sim/comfort';
import { START } from '../src/sim/scenario';
const current = START.comfortScale;
const proposed = { ...current, curve: STRONG_COMFORT_CURVE };
const gentler = { ...current, curve: REWARD_COMFORT_CURVE };
const byId = (id: string) => document.getElementById(id)!;
const input = (id: string) => Number((byId(id) as HTMLInputElement).value);
let mode: 'strong' | 'reward' = 'strong';
const signed = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}`;
function render() {
  const comfort = input('comfort') / 100, people = Math.max(1, input('people') || 10), day = Math.max(1, input('day') || 20);
  const selected = mode === 'strong' ? proposed : gentler;
  const base = START.strain.rate * Math.sqrt(people) * (1 + (day - 1) / START.strain.rampDays);
  const oldRate = base * comfortMultiplier(comfort, current), newRate = base * comfortMultiplier(comfort, selected);
  byId('comfort-value').textContent = `${Math.round(comfort * 100)}%`;
  byId('current-rate').textContent = `+${oldRate.toFixed(2)}`;
  byId('candidate-rate').textContent = `+${newRate.toFixed(2)}`;
  byId('candidate-name').textContent = mode === 'strong' ? 'Proposed curve' : 'Gentler alternative';
  byId('difference').textContent = `${signed(newRate - oldRate)} strain/day`;
  byId('difference').className = newRate <= oldRate ? 'good' : 'warm';
  byId('mode-description').textContent = mode === 'strong' ? 'The proposal rewards high comfort more and increases the penalty for low comfort.' : 'This alternative keeps current penalties through 60% comfort and strengthens the reward above that.';
  let horizonBase = 0;
  for (let hour = 1; hour <= 240; hour++) horizonBase += START.strain.rate * Math.sqrt(people) * (1 + (day - 1 + hour / 24) / START.strain.rampDays) / 24;
  const benefit = (scale: typeof current) => horizonBase * (comfortMultiplier(0.6, scale) - comfortMultiplier(comfort, scale));
  const change = (v: number) => `${v >= 0 ? 'avoids' : 'adds'} ${Math.abs(v).toFixed(1)} strain`;
  byId('upgrade').textContent = `Changing comfort from 60% to ${Math.round(comfort * 100)}% for ten days ${change(benefit(current))} with the current curve and ${change(benefit(selected))} with this candidate.`;
  const x = (n: number) => 48 + n * 532, y = (n: number) => 222 - n / 2.4 * 190;
  const path = (scale: typeof current) => Array.from({ length: 101 }, (_, i) => `${i ? 'L' : 'M'}${x(i / 100)},${y(comfortMultiplier(i / 100, scale))}`).join(' ');
  byId('curve-plot').innerHTML = `<svg viewBox="0 0 620 266" role="img" aria-label="Current and candidate strain multipliers by comfort. Higher comfort lowers strain growth.">${[0, .6, 1.2, 1.8, 2.4].map(n => `<path d="M48 ${y(n)}H580" stroke="#3b4339"/><text x="38" y="${y(n) + 4}" text-anchor="end">${n.toFixed(1)}×</text>`).join('')}${[0, .2, .4, .6, .8, 1].map(n => `<text x="${x(n)}" y="245" text-anchor="middle">${n * 100}%</text>`).join('')}<path d="${path(current)}" stroke="#e8a33d" stroke-width="3" fill="none"/><path d="${path(selected)}" stroke="#8ccf6f" stroke-width="3" fill="none"/><path d="M${x(comfort)} 26V222" stroke="#a9a594" stroke-dasharray="4 5"/><circle cx="${x(comfort)}" cy="${y(comfortMultiplier(comfort, current))}" r="5" fill="#e8a33d"/><circle cx="${x(comfort)}" cy="${y(comfortMultiplier(comfort, selected))}" r="5" fill="#8ccf6f"/></svg>`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  byId('point-table').innerHTML = [0, .3, .6, .9, 1].map(c => `<tr><th>${Math.round(c * 100)}%</th><td>${comfortMultiplier(c, current).toFixed(2)}×</td><td>${comfortMultiplier(c, selected).toFixed(2)}×</td></tr>`).join('');
}
document.addEventListener('input', render);
document.addEventListener('click', e => {
  const modeButton = (e.target as Element).closest<HTMLButtonElement>('[data-mode]');
  if (modeButton) { mode = modeButton.dataset.mode as typeof mode; render(); }
});
render();
