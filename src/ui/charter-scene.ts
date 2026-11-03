import { icon } from './icons';

export const CHARTER_SCENE_MS = 2400;

/** Reuses the game's vector buildings in a small woodland celebration. */
export function charterScene(tier: 1 | 2) {
  const art = (id: string, x: number, y: number, size: number, cls = '', delay = 0) => `<g class="${cls}" style="--cc-delay:${delay}ms"><g transform="translate(${x} ${y}) scale(${size / 24})">${icon(id).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g></g>`;
  const pine = (x: number, y: number, size: number) => `<g transform="translate(${x} ${y}) scale(${size})"><path d="M-2 0h4v30h-4z" fill="#564733"/><path d="M0-28 17 6H9L23 23H-23L-9 6H-17z" fill="#344735"/><path d="M0-28v51h-23L-9 6h-8z" fill="#2b3e30"/></g>`;
  const person = (x: number, color: string, delay: number) => `<g class="cc-settler" style="--cc-delay:${delay}ms"><g transform="translate(${x} 130)"><ellipse cy="17" rx="8" ry="2" fill="#101b12" opacity=".4"/><path d="M-4 7v10M4 7v10" stroke="#a99b79" stroke-width="3"/><path d="M-6-2h12l1 12H-7z" fill="${color}"/><path class="cc-wave" d="M-5 1-11-5" stroke="${color}" stroke-width="4" stroke-linecap="round"/><path d="M5 1 9 7" stroke="${color}" stroke-width="4" stroke-linecap="round"/><circle cy="-7" r="5" fill="#d9ac80"/><path d="M-5-8q0-8 9-3l1 3z" fill="#57422d"/></g></g>`;
  const sparks = [[110, 64], [155, 38], [203, 62], [274, 43], [326, 58], [370, 74]].map(([x, y], i) => `<rect class="cc-confetti" x="${x}" y="${y}" width="${i % 2 ? 3 : 5}" height="3" rx="1" fill="${['#e8a33d', '#9bb878', '#d69373'][i % 3]}" style="--cc-delay:${350 + i * 70}ms"/>`).join('');
  return `<svg class="cc-scene" viewBox="0 0 480 170" role="img" aria-label="${tier === 1 ? 'A woodland camp grows into a settlement: a cottage rises, a lantern lights, and a banner unfurls.' : 'The settlement becomes a village: more homes appear, warm lanterns light, and a village banner unfurls.'}">
    <defs><radialGradient id="cc-sky-${tier}"><stop stop-color="#bda15b" stop-opacity=".16"/><stop offset="1" stop-color="#bda15b" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="240" cy="104" rx="200" ry="110" fill="url(#cc-sky-${tier})"/>
    <ellipse cx="240" cy="140" rx="215" ry="24" fill="#2d3d2e"/><ellipse cx="240" cy="145" rx="166" ry="14" fill="#3b4933"/>
    ${pine(47, 93, .9)}${pine(76, 107, .65)}${pine(424, 95, .95)}${pine(397, 108, .6)}
    <path d="M139 139Q210 155 291 139T370 140" stroke="#85734e" stroke-width="6" fill="none" opacity=".35" stroke-linecap="round"/>
    ${art('leanto', 90, 81, 66)}
    ${art('cottage', 228, 49, 91, tier === 1 ? 'cc-build' : '', 260)}
    ${tier === 2 ? art('cottage', 142, 66, 77, 'cc-build', 300) + art('cottage', 321, 72, 70, 'cc-build', 650) + art('flowerbed', 326, 123, 42, 'cc-build', 950) : art('flowerbed', 303, 119, 36, 'cc-build', 750)}
    <g transform="translate(211 133)"><ellipse cy="5" rx="13" ry="4" fill="#1e2b20"/><path d="M-11 4 9 8M-9 9 10 3" stroke="#947047" stroke-width="4" stroke-linecap="round"/><path d="M-5 4Q-12-6-3-10L0-20Q10-9 7-2L4 5z" fill="#d8883e"/><path d="M-2 4Q-5-3 1-10L4 1 2 5z" fill="#f2c46a"/></g>
    <path class="cc-smoke" d="M211 109q-9-7 1-15t0-15M216 100q8-6 0-13" fill="none" stroke="#b7bba1" stroke-width="2" stroke-linecap="round"/>
    <g class="cc-lamplight" style="--cc-delay:900ms"><circle cx="349" cy="122" r="25" fill="#e8a33d" opacity=".1"/>${art('lantern', 332, 105, 34)}</g>
    ${tier === 2 ? `<g class="cc-lamplight" style="--cc-delay:1150ms"><circle cx="121" cy="133" r="23" fill="#e8a33d" opacity=".09"/>${art('lantern', 105, 116, 32)}</g>` : ''}
    ${person(176, '#c68652', 600)}${person(278, '#7b9f75', 800)}${tier === 2 ? person(309, '#b39ac1', 1000) : ''}
    <path d="M91 25Q240 49 389 25" stroke="#7d7752" stroke-width="1" fill="none"/>
    <g class="cc-banner" style="--cc-delay:1100ms"><path d="M139 15h202v31l-101 8-101-8z" fill="#af7530"/><path d="M147 20h186v21l-93 7-93-7z" fill="#d6a34f"/><path d="M139 15h8v26l-8 5z" fill="#835c2c"/><text x="240" y="35" text-anchor="middle" fill="#302719" font-family="Georgia,serif" font-weight="700" font-size="14" letter-spacing="3">${tier === 1 ? 'SETTLEMENT' : 'VILLAGE'}</text></g>
    ${sparks}
  </svg>`;
}

/** Restore elapsed time after a live DOM redraw; inspection never restarts the scene. */
export function animateCharterScene(scene: SVGElement, elapsed: number | null, calm = false) {
  if (calm || matchMedia('(prefers-reduced-motion: reduce)').matches || elapsed == null || elapsed >= CHARTER_SCENE_MS) {
    scene.classList.remove('cc-animated'); return;
  }
  scene.classList.add('cc-animated');
  for (const animation of scene.getAnimations({ subtree: true })) animation.currentTime = Math.max(0, elapsed);
}
