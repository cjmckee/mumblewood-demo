// Goods icons in the map's style: flat shapes, no outlines, a base colour with a shaded side and a highlight, and a soft
// ground shadow. Each is inline SVG on a 24×24 grid, so it's crisp at any size and needs no image files.
import type { ResourceId, Category } from '../sim/content';

const hex = (n: number) => `#${Math.max(0, Math.min(0xffffff, n)).toString(16).padStart(6, '0')}`;
/** the renderer's shade(): multiply each channel, so 0.75 is the shadow side and 1.15 a highlight */
function sh(c: string, f: number) {
  const n = parseInt(c.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return hex((ch(16) << 16) | (ch(8) << 8) | ch(0));
}
const el = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${extra}/>`;
const ci = (cx: number, cy: number, r: number, fill: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const re = (x: number, y: number, w: number, h: number, fill: string, rx = 0, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${extra}/>`;
const pa = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const ln = (d: string, stroke: string, w = 1, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const shadow = (w = 8, y = 21) => el(12, y, w, 1.7, '#000', ' opacity=".22"');

// shared parts
const steam = (x: number, y: number) => ln(`M${x} ${y}c-1.2-1.2 1.2-2 0-3.4M${x + 3} ${y + 0.6}c-1.2-1.2 1.2-2 0-3.4`, '#e9e4d8', 1, ' opacity=".7"');
const leaf = (x: number, y: number, rot: number, c = '#5e8f42') => `<g transform="translate(${x} ${y}) rotate(${rot})">${el(0, 0, 2.6, 1.3, c)}${el(0.4, -0.3, 1.6, 0.6, sh(c, 1.18))}</g>`;
/** a log seen side-on, its cut end facing right */
function log(x: number, y: number, len: number, d: number) {
  const bark = '#7f5634', end = '#d9a66a';
  return re(x, y, len, d, bark, d / 2) + re(x + 1, y + 0.7, len - 2.5, d * 0.24, sh(bark, 1.25), d * 0.12)
    + re(x + 1, y + d * 0.68, len - 2.5, d * 0.22, sh(bark, 0.75), d * 0.11)
    + el(x + len - d * 0.35, y + d / 2, d * 0.38, d / 2, end) + el(x + len - d * 0.35, y + d / 2, d * 0.2, d * 0.27, sh(end, 0.8)) + ci(x + len - d * 0.35, y + d / 2, 0.45, sh(end, 0.62));
}
/** a fish facing left: body, tail, belly, eye */
function fish(c: string, belly: string, stripes = false) {
  return pa('M3.5 12c2.6-4.2 8.5-5.6 12.6-2.4l3.6-2.6-.6 5 .6 5-3.6-2.6C12 17.6 6.1 16.2 3.5 12z', c)
    + pa('M4.2 12.4c3 2.4 7.8 3.6 11.6 1.4-4 .6-8 .3-11.6-1.4z', belly)
    + pa('M6 9.6c2.6-1.7 6-2 8.6-.9-3-.2-5.9.2-8.6.9z', sh(c, 1.25))
    + (stripes ? ln('M8.5 9.4v5.2M11.2 8.8v6.2M13.8 9.2v5.4', sh(c, 0.62), 1) : '')
    + ci(6.4, 11.3, 0.95, '#1d1a17') + ci(6.15, 11.05, 0.3, '#fff');
}

/** each good's drawing, centred in a 24×24 box with its ground shadow at y≈21 */
const ART: Record<ResourceId, () => string> = {
  // ---- materials ----
  wood: () => shadow(9) + log(2.5, 12.2, 17, 6.6) + log(5.5, 6.4, 14, 6.2),
  planks: () => {
    const c = '#d2a96a', side = sh(c, 0.72), top = sh(c, 1.12);
    let s = shadow(9);
    for (const [i, y] of [[0, 15], [1, 11], [2, 7]] as const) {
      const x = 3 + i * 0.6;
      s += pa(`M${x} ${y}l15.4-1.6 0 3.2-15.4 1.6z`, top) + pa(`M${x} ${y + 3.2}l15.4-1.6 0 2.4-15.4 1.6z`, c) + pa(`M${x + 15.4} ${y - 1.6}l2 .8v4.8l-2 .8z`, side);
      s += ln(`M${x + 3} ${y + 0.9}l8-.8`, sh(c, 0.85), 0.6);
    }
    return s;
  },
  bricks: () => {
    // a neat stack: two bricks side by side, one across the top
    const c = '#b04a32', top = sh(c, 1.24), side = sh(c, 0.68), front = c;
    const brick = (x: number, y: number, w: number) => pa(`M${x} ${y}l2.4-1.8h${w}l-2.4 1.8z`, top) + re(x, y, w, 3.8, front) + pa(`M${x + w} ${y}l2.4-1.8v3.8l-2.4 1.8z`, side) + ln(`M${x + 1} ${y + 1.2}h${w - 2}`, sh(c, 1.1), 0.5, ' opacity=".6"');
    return shadow(9) + brick(3, 15.2, 8) + brick(11.6, 15.2, 8) + brick(6.4, 11.4, 9.6) + brick(8.8, 7.6, 7);
  },
  wicker: () => {
    const c = '#c8a868', d = sh(c, 0.72);
    return shadow(8) + pa('M4 9.5h16l-2.2 9.8H6.2z', c) + pa('M13 9.5h7l-2.2 9.8H13z', sh(c, 0.88))
      + ln('M5 12.5h14M5.6 15.5h12.8', d, 1) + ln('M8 9.8l.8 9.3M12 9.8v9.3M16 9.8l-.8 9.3', d, 0.8, ' opacity=".7"')
      + el(12, 9.5, 8.6, 2, sh(c, 1.15)) + el(12, 9.6, 6.6, 1.2, sh(c, 0.6)) + ln('M7.5 9C8 4.5 16 4.5 16.5 9', sh(c, 0.85), 1.4);
  },
  clay: () => {
    const c = '#b0603a';
    return shadow(8) + pa('M4.5 17.5c-1.4-4 1-8.6 5.2-9.6 3-.7 4.8 1 7.4.8 2.6.6 3.8 4.4 2.4 8.1-.6 1.4-2 1.7-3.6 1.7H6.6c-1 0-1.8-.4-2.1-1z', c)
      + pa('M6 13.5c.4-3 2.7-4.8 5.2-5 2.4-.1 3.6 1.2 6 1 1.4.3 2.2 1.4 2.4 2.8-2.6-1.1-4.6.7-7.6.4-2.4-.2-4.1.1-6 .8z', sh(c, 1.18))
      + pa('M12.5 18.5c2.4-.4 5-.2 7.1-1.1-.3.8-1 1.1-2.3 1.1z', sh(c, 0.7)) + ci(9, 15.5, 0.7, sh(c, 0.75)) + ci(15.5, 14.8, 0.6, sh(c, 0.75));
  },
  reeds: () => {
    const g = '#8fa356', b = '#7a4a2a';
    return shadow(6) + ln('M8 21V8M12 21V5.5M16 21V9', g, 1.4) + ln('M10 21c0-5 1-8-2.5-10.5M14 21c0-4.5-.2-7 3-9.2', sh(g, 1.15), 1.1)
      + re(6.9, 8, 2.2, 5.4, b, 1.1) + re(10.9, 5.5, 2.2, 6, b, 1.1) + re(14.9, 9, 2.2, 5, b, 1.1)
      + re(7.3, 8.6, 0.7, 4, sh(b, 1.35), 0.35) + re(11.3, 6.1, 0.7, 4.6, sh(b, 1.35), 0.35) + re(15.3, 9.6, 0.7, 3.6, sh(b, 1.35), 0.35);
  },
  // ---- raw food and ingredients ----
  berries: () => {
    const c = '#c04a6a';
    const b = (x: number, y: number, r: number) => ci(x, y, r, c) + ci(x + r * 0.35, y + r * 0.35, r * 0.62, sh(c, 0.78)) + ci(x - r * 0.38, y - r * 0.38, r * 0.3, sh(c, 1.45));
    return shadow(7) + leaf(15, 6.8, -25) + leaf(10.5, 6, 30, '#4a7a3a') + b(8.4, 14.6, 3.9) + b(15.4, 14.8, 3.7) + b(12, 10.6, 3.6);
  },
  fish: () => shadow(8) + fish('#5b9cc2', '#cfe4ef'),
  mushrooms: () => {
    const cap = '#a0705a', stem = '#efe3c8';
    const m = (x: number, y: number, s: number) => re(x - 1.6 * s, y, 3.2 * s, 6 * s, stem, 1.2 * s) + re(x, y, 1.6 * s, 6 * s, sh(stem, 0.85), 0.8 * s)
      + pa(`M${x - 6 * s} ${y + 0.6 * s}c0-4.6 3-6.6 ${6 * s}-6.6s${6 * s} 2 ${6 * s} 6.6z`, cap) + pa(`M${x} ${y - 6 * s}c3 0 ${6 * s} 2 ${6 * s} 6.6H${x}z`, sh(cap, 0.82))
      + ci(x - 2.4 * s, y - 2.6 * s, 0.9 * s, sh(cap, 1.45)) + ci(x + 1.2 * s, y - 3.8 * s, 0.7 * s, sh(cap, 1.45));
    return shadow(8) + m(15.5, 13.2, 0.72) + m(9.4, 12.2, 1);
  },
  apples: () => {
    const c = '#d2452f';
    return shadow(7) + pa('M12 8.2c-2.6-1.9-7.2-.9-7.2 4.5 0 4.4 3.4 7.9 5.6 7.6.8-.1 1-.4 1.6-.4s.8.3 1.6.4c2.2.3 5.6-3.2 5.6-7.6 0-5.4-4.6-6.4-7.2-4.5z', c)
      + pa('M12 8.2c2.6-1.9 7.2-.9 7.2 4.5 0 4.4-3.4 7.9-5.6 7.6-.8-.1-1-.4-1.6-.4z', sh(c, 0.78))
      + el(8, 11.5, 1.4, 2.4, sh(c, 1.4), ' transform="rotate(20 8 11.5)"') + ln('M12 8.3c0-1.6.4-2.6 1.4-3.6', '#5a4030', 1.2) + leaf(15.4, 5.6, -20);
  },
  grain: () => {
    const c = '#d8c060', st = '#b89a40';
    let s = shadow(6) + ln('M12 21V7M12 21c-.6-5-2.2-8-4.6-11M12 21c.6-5 2.2-8 4.6-11', st, 1.1);
    const ear = (x: number, y: number, rot: number) => {
      let e = '';
      for (let i = 0; i < 4; i++) e += el(-1.1, -i * 2.1, 1.1, 1.6, i % 2 ? sh(c, 1.12) : c, ' transform="rotate(-25)"') + el(1.1, -i * 2.1 - 1, 1.1, 1.6, sh(c, 0.82), ' transform="rotate(25)"');
      return `<g transform="translate(${x} ${y}) rotate(${rot})">${e}</g>`;
    };
    s += ear(12, 9, 0) + ear(7.6, 11, -32) + ear(16.4, 11, 32);
    return s;
  },
  honey: () => {
    const jar = '#c9d6d8', h = '#e8a21c';
    return shadow(7) + pa('M6.5 10.5c0-1.4 1-2 2-2h7c1 0 2 .6 2 2v7.3c0 1.6-1.2 2.7-2.8 2.7H9.3c-1.6 0-2.8-1.1-2.8-2.7z', h)
      + pa('M12 8.5h3.5c1 0 2 .6 2 2v7.3c0 1.6-1.2 2.7-2.8 2.7H12z', sh(h, 0.8)) + re(7.6, 11, 1.6, 6.5, sh(h, 1.3), 0.8)
      + re(7.2, 6, 9.6, 3.2, '#8a5a34', 1) + re(7.2, 6, 9.6, 1.3, sh('#8a5a34', 1.25), 0.6)
      + pa('M9 9.2h6v1.3c0 .7-.5 1-1 1s-.9.6-.9 1.4c0 .7-.4 1.1-1 1.1s-1-.4-1-1.1v-.9c0-.5-.4-.8-.9-.8H9z', sh(h, 1.15));
  },
  herbs: () => {
    const g = '#5a9a4a';
    return shadow(6) + ln('M12 21V6.5', sh(g, 0.75), 1.2) + leaf(9.4, 16, 35, g) + leaf(14.6, 14.4, -35, g) + leaf(9.6, 11.4, 35, sh(g, 1.12)) + leaf(14.4, 9.6, -35, sh(g, 1.12)) + leaf(12, 6, 90, sh(g, 1.2))
      + `<g transform="translate(9.4 16) rotate(35) scale(1.5)">${el(0, 0, 2.6, 1.3, g)}</g>` + `<g transform="translate(14.6 14.4) rotate(-35) scale(1.5)">${el(0, 0, 2.6, 1.3, sh(g, 0.85))}</g>`;
  },
  flour: () => {
    const c = '#e8e0c8';
    return shadow(8) + pa('M6 9.5c-1.6 2.6-2 6.5-.8 9.2.5 1 1.5 1.5 2.6 1.5h8.4c1.1 0 2.1-.5 2.6-1.5 1.2-2.7.8-6.6-.8-9.2z', c)
      + pa('M12 9.5h6c1.6 2.6 2 6.5.8 9.2-.5 1-1.5 1.5-2.6 1.5H12z', sh(c, 0.84)) + pa('M7.6 9.6l-1-3.2c1.6.6 3.4-.2 5.4.4 2-.6 3.8.2 5.4-.4l-1 3.2z', sh(c, 0.93))
      + re(7.2, 8.8, 9.6, 1.4, '#a07a4c', 0.7) + ci(10, 14.8, 2.2, sh(c, 0.92)) + ci(10, 14.8, 1.1, '#c4a46a');
  },
  // ---- meals ----
  stew: () => {
    const bowl = '#8a5a34', s = '#d98a3c';
    return shadow(9) + pa('M3.5 12h17c0 4.6-3.6 8.2-8.5 8.2S3.5 16.6 3.5 12z', bowl) + pa('M12 12h8.5c0 4.6-3.6 8.2-8.5 8.2z', sh(bowl, 0.78))
      + el(12, 12, 8.5, 2.6, s) + el(12, 11.7, 6.4, 1.6, sh(s, 1.12)) + ci(9, 11.7, 1, '#e8c25a') + ci(14.5, 12.2, 1.1, '#6a8d3a') + ci(12.2, 11.2, 0.8, '#c8553d')
      + re(4.6, 13.2, 14.8, 1, sh(bowl, 1.25), 0.5, ' opacity=".7"') + steam(9.6, 8.6);
  },
  pie: () => {
    const c = '#e6c25a', dish = '#9a6a4a';
    return shadow(9) + el(12, 15.4, 9, 3.6, dish) + el(12, 13.6, 8.6, 3.4, sh(c, 0.82)) + re(3.4, 13.6, 17.2, 2.2, sh(c, 0.78)) + el(12, 13.4, 8.6, 3.4, c)
      + pa('M12 13.4l8.4-1.2c-.4-1.2-1.6-2.1-3.2-2.7z', '#a8324a') + pa('M12 13.4l5.2-3.9c1.1.4 2.1 1 2.8 1.8z', sh('#a8324a', 1.2), ' opacity=".6"')
      + ln('M6 12.6l4 1.4M7.4 11l3.6 2.4M10.2 10.2l1.6 3', sh(c, 0.75), 0.8) + el(9, 12.4, 2.4, 0.9, sh(c, 1.2));
  },
  smokedFish: () => shadow(8) + `<g transform="rotate(-12 12 12)">${fish('#9c7a5a', '#c8ab88', true)}</g>` + ln('M18.4 4.5v3.6', '#5a4030', 1.2) + ln('M16.6 4.4h3.6', '#5a4030', 1.2),
  bread: () => {
    const c = '#c89048';
    return shadow(9) + pa('M3.6 15.5c0-4.4 3.8-7.6 8.4-7.6s8.4 3.2 8.4 7.6c0 2.6-1.5 3.6-3.6 3.6H7.2c-2.1 0-3.6-1-3.6-3.6z', c)
      + pa('M12 7.9c4.6 0 8.4 3.2 8.4 7.6 0 2.6-1.5 3.6-3.6 3.6H12z', sh(c, 0.8)) + pa('M5.4 13c.8-2.6 3.6-4.2 6.6-4.2-2.6.6-5 2-6.6 4.2z', sh(c, 1.25))
      + ln('M7.6 11.6l1.6 2.6M11 10.2l1.6 2.8M14.4 10.4l1.4 2.6', sh(c, 1.32), 1.3);
  },
  skewers: () => {
    const stick = '#c8a066';
    const chunk = (x: number, y: number, c: string) => re(x - 2, y - 2, 4, 4, c, 1.2) + re(x - 2, y - 2, 4, 1.4, sh(c, 1.25), 0.7);
    return shadow(8) + ln('M4 19.5L20 4.5', stick, 1.2) + `<g transform="rotate(-43 12 12)">${chunk(7.2, 12, '#9a6a4a')}${chunk(11.2, 12, '#5a9a4a')}${chunk(15.2, 12, '#a0705a')}${chunk(19, 12, '#9a6a4a')}</g>`;
  },
  // ---- drinks ----
  ale: () => {
    const wood = '#9a6a3a', beer = '#d6a33c';
    return shadow(8) + pa('M16.5 10h1.8c1.6 0 2.6 1.2 2.6 3s-1 3-2.6 3h-1.8v-1.8h1.6c.6 0 1-.5 1-1.2s-.4-1.2-1-1.2h-1.6z', sh(wood, 0.85))
      + re(5.5, 8.5, 11.5, 11.5, wood, 1.4) + re(11.5, 8.5, 5.5, 11.5, sh(wood, 0.78), 1.2) + re(5.5, 11, 11.5, 1.1, sh(wood, 0.62)) + re(5.5, 16.6, 11.5, 1.1, sh(wood, 0.62))
      + re(6.8, 9.6, 1.4, 9, sh(beer, 1.1), 0.6, ' opacity=".55"') + el(11.25, 8.5, 6.4, 2, '#f3ead6') + ci(7.4, 7.6, 1.8, '#f3ead6') + ci(10.4, 6.9, 2.2, '#f3ead6') + ci(14, 7.3, 1.9, '#e6dcc4');
  },
  cider: () => {
    const glass = '#b8c25a';
    return shadow(7) + re(10.6, 4.5, 2.8, 4, '#6e7f3a', 0.6) + re(10.2, 3.6, 3.6, 1.6, '#8a5a34', 0.6)
      + pa('M10.6 8.5c0 1.2-4.1 2.5-4.1 6v4c0 1.1.9 2 2 2h7c1.1 0 2-.9 2-2v-4c0-3.5-4.1-4.8-4.1-6z', glass)
      + pa('M12 8.5h1.4c0 1.2 4.1 2.5 4.1 6v4c0 1.1-.9 2-2 2H12z', sh(glass, 0.78)) + re(7.8, 13, 1.4, 5.6, sh(glass, 1.32), 0.7)
      + el(12, 15.6, 2.6, 2.4, '#f3ead6', ' opacity=".9"') + ci(12, 15.6, 1.3, '#d2452f');
  },
  mead: () => {
    // a goblet of amber mead with a drip of honey down the side
    const cup = '#b8aa8a', m = '#c07a2a';
    return shadow(7) + el(12, 19.6, 5, 1.3, sh(cup, 0.8)) + re(11.1, 14.5, 1.8, 5, cup) + re(12, 14.5, 0.9, 5, sh(cup, 0.8))
      + pa('M5.5 6.5h13c0 4.6-2.6 8.6-6.5 8.6S5.5 11.1 5.5 6.5z', cup) + pa('M12 6.5h6.5c0 4.6-2.6 8.6-6.5 8.6z', sh(cup, 0.8))
      + el(12, 6.6, 6.5, 1.8, m) + el(10.6, 6.4, 3, 0.7, sh(m, 1.3)) + pa('M15.6 7.6c.6 1.4.4 2.6 0 3.4-.5.9-1.3.6-1.2-.3.1-.7.4-1.4.2-3z', '#e8a21c')
      + re(6.8, 8, 1.2, 3.6, sh(cup, 1.3), 0.6);
  },
  tea: () => {
    const cup = '#e9e4d8', t = '#8aa84a';
    return shadow(9) + el(12, 18.6, 8.4, 1.8, sh(cup, 0.82)) + el(12, 18.2, 8.4, 1.6, cup)
      + pa('M16.6 11.4h1.2c1.4 0 2.4 1 2.4 2.3s-1 2.3-2.4 2.3h-1.6v-1.5h1.5c.6 0 1-.4 1-.8s-.4-.8-1-.8h-1.1z', sh(cup, 0.85))
      + pa('M5.6 10.5h12c0 4-2.4 7.6-6 7.6s-6-3.6-6-7.6z', cup) + pa('M11.6 10.5h6c0 4-2.4 7.6-6 7.6z', sh(cup, 0.85)) + el(11.6, 10.5, 6, 1.6, t) + el(10.6, 10.3, 3, 0.7, sh(t, 1.25)) + steam(9.6, 7.4);
  },
  // ---- remedies ----
  poultice: () => {
    // a rolled linen bandage with a sprig tucked in
    const cloth = '#ece2c8', g = '#6aa88a';
    return shadow(8) + re(4, 9, 13, 9, sh(cloth, 0.86), 4.5) + re(4, 9, 13, 4, cloth, 2) + pa('M4 13.5h13v-0.2', 'none')
      + el(17, 13.5, 3.2, 4.5, cloth) + el(17, 13.5, 1.8, 2.6, sh(cloth, 0.78)) + el(17, 13.5, 0.7, 1, sh(cloth, 0.6))
      + ln('M6.5 9.4v8.2M10 9.2v8.6M13.5 9.2v8.6', sh(cloth, 0.78), 0.6, ' opacity=".7"') + re(3.6, 16.6, 4, 2.4, sh(cloth, 0.95), 1.2)
      + ln('M9 9.6c-1-2.4-.4-4.6 1.4-5.6', '#4a7a3a', 1) + leaf(8.2, 6.8, 40, g) + leaf(11, 5, -20, sh(g, 1.1));
  },
  tonic: () => {
    const g = '#6a5aa8', glass = '#c9d6d8';
    return shadow(7) + re(10.4, 4, 3.2, 3.2, '#9a6a3a', 0.8) + re(10.8, 6.6, 2.4, 3, glass, 0.4)
      + ci(12, 14.5, 6.2, glass) + pa('M5.8 14.5a6.2 6.2 0 0 0 12.4 0z', g) + pa('M12 14.5h6.2a6.2 6.2 0 0 1-6.2 6.2z', sh(g, 0.78))
      + el(12, 14.5, 6.2, 1.1, sh(g, 1.25)) + el(9.4, 11.6, 1.2, 2, '#fff', ' opacity=".55" transform="rotate(30 9.4 11.6)"');
  },
};

/** "any meal", "any drink" and the like use a representative good */
const CATEGORY_ICON: Record<Category, ResourceId> = { rawFood: 'berries', meal: 'stew', drink: 'ale', fine: 'planks', remedy: 'tonic' };

/** an inline icon for a good or a category; size in CSS pixels (the class sets the default) */
export function icon(id: ResourceId | Category | string, cls = '', title?: string): string {
  const key = (id in ART ? id : CATEGORY_ICON[id as Category]) as ResourceId | undefined;
  if (!key) return '';
  return `<svg class="ico${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" ${title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"'}>${ART[key]()}</svg>`;
}
export const ICON_IDS = Object.keys(ART) as ResourceId[];
