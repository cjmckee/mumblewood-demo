import { createWorld, alive, day } from '../src/sim/world';
import { finalCelebrationCard } from '../src/ui/final-celebration';
import { animateCharterScene, FINALE_SCENE_MS } from '../src/ui/charter-scene';
import { finalPreviewWorld } from './final-preview-fixture';
const modal = document.getElementById('modal')!;
const root = document.getElementById('game')!;
const status = document.getElementById('preview-status')!;
let route: 'hall' | 'longtable' = 'hall', calm = false, frame = 0;
let world = finalPreviewWorld(route);
function show() {
  cancelAnimationFrame(frame); world = finalPreviewWorld(route);
  modal.innerHTML = finalCelebrationCard(world); status.textContent = '';
  root.classList.toggle('calm', calm);
  const began = performance.now(), scene = modal.querySelector<SVGElement>('.cc-scene')!;
  const update = () => {
    const elapsed = performance.now() - began;
    animateCharterScene(scene, elapsed, calm);
    if (elapsed < FINALE_SCENE_MS && !calm) frame = requestAnimationFrame(update);
  };
  update();
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-route]')) b.setAttribute('aria-pressed', String(b.dataset.route === route));
  document.querySelector('[data-calm]')!.setAttribute('aria-pressed', String(calm));
}
document.addEventListener('click', e => {
  const b = (e.target as Element).closest<HTMLButtonElement>('button'); if (!b) return;
  if (b.dataset.route) { route = b.dataset.route as typeof route; show(); }
  else if (b.hasAttribute('data-replay')) show();
  else if (b.hasAttribute('data-calm')) { calm = !calm; show(); }
  else if (b.dataset.act === 'restart') {
    cancelAnimationFrame(frame); world = createWorld(4243);
    modal.innerHTML = `<div class="card-wrap"><p class="eyebrow">A new beginning</p><h2>Your next settlement awaits</h2><p class="lede">Day ${day(world)} · ${alive(world).length} settlers · no charters completed.</p><button class="act" type="button" data-replay>Back to the celebration preview</button></div>`;
    status.textContent = 'A fresh settlement was created for this preview. Your saved game is unchanged.';
  } else if (b.dataset.act === 'finale-peek') {
    // Presentation-only page; the game build lets the player inspect their actual town.
    animateCharterScene(modal.querySelector<SVGElement>('.cc-scene')!, null);
    status.textContent = 'In the game, this closes the card so you can look around your finished town. A button brings the celebration back.';
  }
});
show();
