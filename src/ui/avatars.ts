import { appearance, colorHex as hex, tint, Identity } from '../characters/appearance';

const hairStyles = [
  'M18 27V22C17 9 43 7 46 21L45 28 39 18 30 20 23 17Z', // swept
  'M17 29V19C17 5 47 5 47 22L45 30 40 21 24 19 22 30Z', // crop
  'M17 40 15 24Q15 7 32 8T49 25L47 42 40 39 43 25 21 23 23 39Z', // bob
  'M17 28C9 23 14 16 18 16 14 9 23 5 27 9 31 2 39 6 39 10 49 7 53 18 47 22L47 29 41 24 36 18 29 22 22 21Z', // curls
  'M18 28V20Q19 9 31 10T46 21L45 28 41 21 27 18 22 25Z', // bun, drawn separately
  'M18 28V21Q18 9 32 10T46 22L45 28 40 20 31 15 24 21Z', // close cut
  'M17 31V21Q18 8 32 9T47 21L46 39 40 38 42 24 34 19 22 24 22 31Z', // braid
  'M18 26V21L26 16 28 7 33 4 37 15 45 20 46 27 39 20 24 22Z', // crest
];
const BACKGROUNDS = ['#354b42','#4b4138','#3b4652','#514247','#454d34','#48435a'];
const cache = new Map<string,string>();

/** Inline vector portraits match the building/item artwork and need no network assets. */
export function avatar(c: Identity, className = '') {
  const a = appearance(c);
  let art = cache.get(a.signature);
  if (!art) {
    const hair = hex(a.hairColor), skin = hex(c.skin), shadow = hex(tint(c.skin,0.82));
    const faceWidth = [12,13.5,11.5,14][a.face];
    const jaw = [36,38,39,35][a.face];
    const backHair = [2,6].includes(a.hair) ? `<path d="M17 23Q15 9 32 9T48 25L48 47 16 47Z" fill="${hair}"/>` : '';
    const bun = a.hair === 4 ? `<circle cx="36" cy="10" r="8" fill="${hair}"/><path d="M31 6Q38 3 41 9" fill="none" stroke="${hex(tint(a.hairColor,1.35))}" stroke-width="2"/>` : '';
    const eyebrows = a.brow === 0 ? 'M24 25l5-1M35 24l5 1' : a.brow === 1 ? 'M24 24h5M35 24h5' : 'M24 25l5-2M35 23l5 2';
    const mouth = a.mouth === 0 ? 'M29 36q3 2 6 0' : a.mouth === 1 ? 'M29 36h6' : 'M30 36q2 1 4-1';
    art = `<rect width="64" height="64" rx="14" fill="${BACKGROUNDS[a.backdrop]}"/>
      <circle cx="47" cy="14" r="23" fill="#f1e9d8" opacity=".035"/>
      ${backHair}${bun}<path d="M7 64V57Q9 47 25 46H39Q55 47 57 57V64" fill="${hex(c.shirt)}"/>
      <path d="M39 46Q55 48 57 58V64H41Z" fill="${hex(tint(c.shirt,.75))}"/>
      <path d="M26 38H38V48L32 53 26 48Z" fill="${shadow}"/>
      <path d="M25 45 32 51 39 45 41 51 35 57 32 53 28 57 22 51Z" fill="#e2d5b5"/>
      <circle cx="${32-faceWidth}" cy="29" r="3.4" fill="${shadow}"/><circle cx="${32+faceWidth}" cy="29" r="3.4" fill="${shadow}"/>
      <path d="M${32-faceWidth} 23Q${32-faceWidth} 12 32 12T${32+faceWidth} 23V31Q${32+faceWidth} ${jaw+5} 32 43Q${32-faceWidth} ${jaw+5} ${32-faceWidth} 31Z" fill="${skin}"/>
      <path d="M39 17Q46 21 44 32 43 39 34 42 41 36 40 26Z" fill="${shadow}" opacity=".5"/>
      <path d="${hairStyles[a.hair]}" fill="${hair}"/>
      ${a.hair === 6 ? `<path d="M44 33q6 4 2 8t0 9" stroke="${hair}" stroke-width="6" fill="none"/><path d="M44 43h5" stroke="#e8a33d" stroke-width="2"/>` : ''}
      <path d="${eyebrows}" stroke="${hair}" stroke-width="1.7" stroke-linecap="round" fill="none"/>
      <ellipse cx="27" cy="28" rx="1.4" ry="1.7" fill="#292720"/><ellipse cx="37" cy="28" rx="1.4" ry="1.7" fill="#292720"/>
      <path d="M32 28l${a.nose === 0 ? '-2 5h3' : a.nose === 1 ? '2 5h-3' : '0 5h2'}" stroke="${shadow}" fill="none" stroke-width="1.5" stroke-linecap="round"/>
      ${a.freckles ? '<g fill="#7e4a32" opacity=".6"><circle cx="24" cy="32" r=".7"/><circle cx="27" cy="33" r=".7"/><circle cx="38" cy="33" r=".7"/><circle cx="41" cy="32" r=".7"/></g>' : ''}
      ${a.beard ? `<path d="M22 33 26 35 29 37 35 37 40 33 40 37 36 43 29 45 24 40Z" fill="${hair}" opacity=".9"/>` : ''}
      <path d="${mouth}" stroke="#704538" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      ${a.glasses ? '<g fill="none" stroke="#d7bc7c" stroke-width="1.4"><circle cx="26.5" cy="28" r="4.5"/><circle cx="37.5" cy="28" r="4.5"/><path d="M31 28h2M19 27h3M42 27h3"/></g>' : ''}
      ${a.accessory === 0 ? '<path d="M26 48 32 52 38 48 36 58 32 62 29 57Z" fill="#b36347"/>' : a.accessory === 1 ? '<path d="M20 49 23 49 26 64 22 64Z" fill="#382e24"/><circle cx="24" cy="59" r="2" fill="#d1ae61"/>' : a.accessory === 2 ? '<path d="M44 53l2 3-2 3-2-3Z" fill="#e7c46d"/>' : '<circle cx="32" cy="58" r="1.3" fill="#d7c494"/>'}`;
    cache.set(a.signature,art);
  }
  return `<svg class="avatar ${className}" viewBox="0 0 64 64" data-portrait="${a.signature}" aria-hidden="true" focusable="false">${art}</svg>`;
}
