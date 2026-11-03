// Presentation-only preview: no WebGL, game boot, local storage, or network assets.
import { createWorld, type Decision } from '../src/sim/world';
import { charterCompletionCard } from '../src/ui/charter-celebration';
import { animateCharterScene, CHARTER_SCENE_MS } from '../src/ui/charter-scene';

const root = document.querySelector<HTMLElement>('#game')!;
const modal = document.querySelector<HTMLElement>('#modal')!;
let tier: 1 | 2 = document.body.dataset.tier === '2' ? 2 : 1;
let calm = false;
let frame = 0;
function show() {
  cancelAnimationFrame(frame);
  document.querySelector<HTMLElement>('#preview-status')!.textContent = '';
  const w = createWorld(4242);
  w.name = 'Little Lantern'; w.named = true;
  w.chartersDone = tier === 1 ? ['settled'] : ['settled', 'bread'];
  const decision: Extract<Decision, { kind: 'charter-complete' }> = { kind: 'charter-complete', charter: tier === 1 ? 'settled' : 'bread', tier, gold: tier === 1 ? 30 : 50, strainBefore: 20, strainAfter: 14 };
  modal.innerHTML = charterCompletionCard(w, decision);
  root.classList.toggle('calm', calm);
  const began = performance.now();
  const scene = modal.querySelector<SVGElement>('.cc-scene')!;
  const update = () => {
    const elapsed = performance.now() - began;
    animateCharterScene(scene, elapsed, calm);
    if (elapsed < CHARTER_SCENE_MS && !calm) frame = requestAnimationFrame(update);
  };
  update();
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-preview-tier]')) button.setAttribute('aria-pressed', String(Number(button.dataset.previewTier) === tier));
  document.querySelector('[data-preview-calm]')!.setAttribute('aria-pressed', String(calm));
}
document.addEventListener('click', e => {
  const button = (e.target as Element).closest<HTMLButtonElement>('button');
  if (!button) return;
  if (button.dataset.previewTier) { tier = Number(button.dataset.previewTier) as 1 | 2; show(); }
  else if (button.hasAttribute('data-preview-replay')) show();
  else if (button.hasAttribute('data-preview-calm')) { calm = !calm; show(); }
  else if (button.dataset.act === 'resolve') {
    cancelAnimationFrame(frame);
    animateCharterScene(modal.querySelector<SVGElement>('.cc-scene')!, null);
    document.querySelector<HTMLElement>('#preview-status')!.textContent = 'Next comes the charter choice. Use Replay to watch the celebration again.';
  }
});
show();
