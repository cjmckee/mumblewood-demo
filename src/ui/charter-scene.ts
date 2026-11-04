import { icon } from './icons';

export const CHARTER_SCENE_MS = 2400;
export const FINALE_SCENE_MS = 3200;

/** Reuses the game's vector buildings in a small woodland celebration. */
export function charterScene(tier: 1 | 2 | 3, finale: 'hall' | 'pavilion' = 'hall') {
  const art = (id: string, x: number, y: number, size: number, cls = '', delay = 0) => `<g class="${cls}" style="--cc-delay:${delay}ms"><g transform="translate(${x} ${y}) scale(${size / 24})">${icon(id).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g></g>`;
  const pine = (x: number, y: number, size: number) => `<g transform="translate(${x} ${y}) scale(${size})"><path d="M-2 0h4v30h-4z" fill="#564733"/><path d="M0-28 17 6H9L23 23H-23L-9 6H-17z" fill="#344735"/><path d="M0-28v51h-23L-9 6h-8z" fill="#2b3e30"/></g>`;
  const person = (x: number, color: string, delay: number) => `<g class="cc-settler" style="--cc-delay:${delay}ms"><g transform="translate(${x} 130)"><ellipse cy="17" rx="8" ry="2" fill="#101b12" opacity=".4"/><path d="M-4 7v10M4 7v10" stroke="#a99b79" stroke-width="3"/><path d="M-6-2h12l1 12H-7z" fill="${color}"/><path class="cc-wave" d="M-5 1-11-5" stroke="${color}" stroke-width="4" stroke-linecap="round"/><path d="M5 1 9 7" stroke="${color}" stroke-width="4" stroke-linecap="round"/><circle cy="-7" r="5" fill="#d9ac80"/><path d="M-5-8q0-8 9-3l1 3z" fill="#57422d"/></g></g>`;
  const sparks = [[110, 64], [155, 38], [203, 62], [274, 43], [326, 58], [370, 74]].map(([x, y], i) => `<rect class="cc-confetti" x="${x}" y="${y}" width="${i % 2 ? 3 : 5}" height="3" rx="1" fill="${['#e8a33d', '#9bb878', '#d69373'][i % 3]}" style="--cc-delay:${350 + i * 70}ms"/>`).join('');
  if (tier === 3) return `<svg class="cc-scene cc-finale-scene" data-cc-duration="${FINALE_SCENE_MS}" viewBox="0 0 480 200" role="img" aria-label="The town gathers for its final celebration: ${finale === 'hall' ? 'a grand hall rises' : 'the feast pavilion fills with light'}, neighbours arrive, lanterns glow and a town banner unfurls.">
    <defs><radialGradient id="cc-town-sky"><stop stop-color="#dfbd71" stop-opacity=".28"/><stop offset="1" stop-color="#dfbd71" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="240" cy="113" rx="220" ry="114" fill="url(#cc-town-sky)"/>
    ${pine(38, 115, .9)}${pine(66, 126, .65)}${pine(440, 115, .95)}${pine(414, 125, .65)}
    <ellipse cx="240" cy="169" rx="218" ry="25" fill="#2d3d2e"/><ellipse cx="240" cy="173" rx="170" ry="14" fill="#3b4933"/>
    <path d="M105 166Q240 191 375 166" stroke="#a08a59" stroke-width="7" fill="none" opacity=".35" stroke-linecap="round"/>
    ${art('cottage', 67, 83, 75)}${art('cottage', 324, 84, 76)}
    ${art('cottage', 120, 65, 65, 'cc-build', 300)}${art('cottage', 288, 67, 61, 'cc-build', 500)}
    ${finale === 'pavilion' ? art('pavilion', 181, 43, 119, 'cc-build', 650) : `<g class="cc-build" style="--cc-delay:650ms"><path d="M193 94h94v64h-94z" fill="#c5af84"/><path d="M272 94h15v64h-15z" fill="#a48d67"/><path d="m181 96 59-49 59 49z" fill="#52714e"/><path d="m240 47 59 49h-15l-44-36z" fill="#3d593e"/><path d="M189 95h102" stroke="#304632" stroke-width="4"/><path d="M225 158v-32q15-18 30 0v32" fill="#5e4732"/><path d="M240 123v35" stroke="#ac8c5b"/><rect x="202" y="112" width="14" height="19" rx="2" fill="#e9bd68"/><rect x="264" y="112" width="14" height="19" rx="2" fill="#e9bd68"/><path d="M209 112v19m-7-10h14m55-9v19m-7-10h14" stroke="#8b714b" stroke-width="2"/>${art('hall', 229, 82, 22)}<path d="M188 158h104" stroke="#7f6c4c" stroke-width="5" stroke-linecap="round"/></g>`}
    ${art('flowerbed', 86, 146, 35, 'cc-build', 1100)}${art('flowerbed', 360, 145, 35, 'cc-build', 1250)}
    <path d="M81 87Q240 120 399 87" fill="none" stroke="#7d7752"/>
    ${[112, 164, 316, 368].map((x, i) => `<g class="cc-lamplight" style="--cc-delay:${1050 + i * 150}ms"><circle cx="${x}" cy="99" r="16" fill="#e8a33d" opacity=".12"/><path d="M${x} 91v7" stroke="#a08854"/><rect x="${x - 3}" y="98" width="6" height="8" rx="2" fill="#f0be62"/></g>`).join('')}
    <g transform="translate(0 26)">${[126, 157, 189, 279, 310, 342].map((x, i) => person(x, ['#c68652', '#7b9f75', '#b39ac1'][i % 3], 1000 + i * 90)).join('')}</g>
    <g class="cc-build" style="--cc-delay:1200ms"><path d="M212 163h53v8h-53z" fill="#a47a4b"/><path d="M217 171v9m43-9v9" stroke="#755c3b" stroke-width="3"/><ellipse cx="225" cy="162" rx="6" ry="3" fill="#d6bb80"/><ellipse cx="249" cy="162" rx="6" ry="3" fill="#d6bb80"/><path d="M234 155h6v8h-6z" fill="#b58247"/></g>
    <g class="cc-banner" style="--cc-delay:1550ms"><path d="M139 14h202v31l-101 8-101-8z" fill="#af7530"/><path d="M147 19h186v21l-93 7-93-7z" fill="#e3b65e"/><text x="240" y="34" text-anchor="middle" fill="#302719" font-family="Georgia,serif" font-weight="700" font-size="15" letter-spacing="5">TOWN</text></g>
    <g class="cc-build" style="--cc-delay:1950ms"><circle cx="393" cy="47" r="17" fill="#aa7833"/><circle cx="393" cy="47" r="13" fill="#e3b65e"/><text x="393" y="52" text-anchor="middle" fill="#49341b" font-family="Georgia,serif" font-size="14" font-weight="700">III</text></g>
    ${sparks}
  </svg>`;
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
  const duration = Number(scene.dataset.ccDuration ?? CHARTER_SCENE_MS);
  if (calm || matchMedia('(prefers-reduced-motion: reduce)').matches || elapsed == null || elapsed >= duration) {
    scene.classList.remove('cc-animated'); return;
  }
  scene.classList.add('cc-animated');
  for (const animation of scene.getAnimations({ subtree: true })) animation.currentTime = Math.max(0, elapsed);
}
