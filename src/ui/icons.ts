// Goods icons in the map's style: flat shapes, no outlines, a base colour with a shaded side and a highlight, and a soft
// ground shadow. Each is inline SVG on a 24×24 grid, so it's crisp at any size and needs no image files.
import type { ResourceId, Category, SlotId } from '../sim/content';

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
  flax: () => ln('M7 20 9 5M12 20 13 3M16 20 17 6', '#7d9a50', 2) + ci(9, 5, 2, '#9cace0') + ci(13, 3, 2, '#9cace0'),
  cloth: () => pa('M4 6h16v14H4z', '#b9c3df') + ln('M7 6v14M11 6v14M15 6v14M4 10h16M4 15h16', '#8698bd', 1),
  hides: () => pa('M8 3l4 2 4-2 2 5-2 4 3 5-5 4-2-2-2 2-5-4 3-5-2-4z', '#9b7551'),
  leather: () => pa('M5 4h13l2 15-14 2-3-12z', '#885737') + ln('M7 6l9 1 1 10-9 1z', '#b58b62', 1),
  coats: () => pa('M8 3l4 2 4-2 5 6-4 3-1-2 2 11H6L8 10l-1 2-4-3z', '#736391') + ln('M12 5v16M8 15h2M14 15h2', '#d6c6a7', 1),
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
  acornMeal: () => {
    // a small sack of coarse meal with acorns at its foot
    const c = '#c8a878', nut = '#9a6a34', cap = '#6a5034';
    const acorn = (x: number, y: number) => el(x, y + 0.6, 1.7, 2, nut) + el(x + 0.5, y + 0.9, 0.9, 1.4, sh(nut, 0.8)) + el(x, y - 0.9, 2, 1, cap) + re(x - 0.3, y - 2.6, 0.6, 1.2, cap, 0.3);
    return shadow(8) + pa('M7 10c-1.4 2.4-1.8 6-.7 8.4.4.9 1.3 1.4 2.3 1.4h6.8c1 0 1.9-.5 2.3-1.4 1.1-2.4.7-6-.7-8.4z', c)
      + pa('M12 10h5c1.4 2.4 1.8 6 .7 8.4-.4.9-1.3 1.4-2.3 1.4H12z', sh(c, 0.84)) + pa('M8.4 10.1l-.9-2.9c1.4.5 3-.2 4.5.3 1.5-.5 3.1.2 4.5-.3l-.9 2.9z', sh(c, 0.93))
      + re(8, 9.4, 8, 1.3, '#7a5a3a', 0.6) + ci(10.8, 14.6, 0.5, sh(c, 0.7)) + ci(13, 16.2, 0.5, sh(c, 0.7)) + ci(11.6, 17.4, 0.4, sh(c, 0.7))
      + acorn(5.2, 18.4) + acorn(19, 18.8);
  },
  // ---- meals ----
  hotpot: () => {
    // a lidded clay pot with steam and a ladle handle
    const pot = '#9a4e2e', lid = '#b8643a';
    return shadow(9) + pa('M4.5 11.5h15l-1 6.2c-.3 1.7-1.8 2.8-3.5 2.8H9c-1.7 0-3.2-1.1-3.5-2.8z', pot) + pa('M12 11.5h7.5l-1 6.2c-.3 1.7-1.8 2.8-3.5 2.8H12z', sh(pot, 0.8))
      + re(3.6, 10.6, 16.8, 1.8, sh(pot, 1.12), 0.9) + re(2.6, 12.6, 2.6, 1.6, sh(pot, 0.9), 0.8) + re(18.8, 12.6, 2.6, 1.6, sh(pot, 0.7), 0.8)
      + pa('M5.4 10.6c.6-2.6 3.4-4 6.6-4s6 1.4 6.6 4z', lid) + pa('M12 6.6c3.2 0 6 1.4 6.6 4H12z', sh(lid, 0.82)) + el(12, 6.4, 1.6, 0.9, sh(lid, 0.7))
      + ln('M15.4 8.4l3.6-3.8', '#c8a066', 1.2) + re(6.2, 14, 1.2, 3.6, sh(pot, 1.3), 0.6, ' opacity=".6"') + steam(8.2, 5.4);
  },
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
  mulled: () => {
    // a clay mug of dark red mulled drink with a cinnamon stick and an orange slice
    const mug = '#8a5a3a', d = '#8a2a2a';
    return shadow(8) + pa('M16.4 10.4h1.6c1.6 0 2.6 1.3 2.6 3s-1 3-2.6 3h-1.6v-1.7h1.4c.7 0 1.1-.6 1.1-1.3s-.4-1.3-1.1-1.3h-1.4z', sh(mug, 0.85))
      + re(5.4, 9, 11.4, 11, mug, 2) + re(11.1, 9, 5.7, 11, sh(mug, 0.78), 1.8) + re(6.6, 10.4, 1.3, 8, sh(mug, 1.3), 0.6, ' opacity=".6"')
      + el(11.1, 9.2, 5.7, 1.7, d) + el(9.8, 9, 2.6, 0.6, sh(d, 1.4)) + ln('M12.6 9.4l3.6-5.2', '#a0602a', 1.6) + ln('M12.9 8.6l3.1-4.4', '#c07a3a', 0.6)
      + ci(8.6, 8.7, 1.9, '#e8902a') + ci(8.6, 8.7, 1.3, '#f2b04a') + steam(9.4, 5.6);
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
const CATEGORY_ICON: Record<Category | SlotId, ResourceId> = { rawFood: 'berries', meal: 'stew', drink: 'ale', fine: 'planks', remedy: 'tonic',
  pastry: 'flour', filling: 'berries', thickener: 'flour', base: 'fish', brew: 'ale', spice: 'herbs' };

/** each building's signature object, in the same style: what you'd spot first on its lot */
const BUILDING_ART: Record<string, () => string> = {
  leanto: () => {
    const roof = '#7d8f55', wall = '#8a6e4f';
    return shadow(9) + pa('M6 8.6L18.4 13.4V20H6z', '#4a3a2a') + re(5, 7.4, 1.6, 12.6, sh(wall, 0.9)) + re(17.6, 12.8, 1.5, 7.2, sh(wall, 0.75))
      + re(7.6, 16.6, 8.4, 3, '#b85a4a', 1.5) + re(7.6, 16.6, 2.6, 3, '#e0d4b8', 1.2) + ln('M11 17.4v1.6M13.4 17.4v1.6', sh('#b85a4a', 0.75), 0.6)
      + pa('M3.4 6.2L20.8 12.6V15L3.4 8.6z', roof) + pa('M3.4 6.2L20.8 12.6V13.4L3.4 7z', sh(roof, 1.2)) + pa('M8 9.3l.8 2 .8-1.7M14 11.5l.7 1.9.8-1.6', sh(roof, 0.75));
  },
  woodcutter: () => {
    const bark = '#7a5232', top = '#d8b07a';
    return shadow(8, 21) + re(5, 14, 12, 6, bark, 1) + re(5, 14, 3, 6, sh(bark, 1.18), 1) + re(14, 14, 3, 6, sh(bark, 0.75), 1)
      + el(11, 14, 6, 2.2, top) + el(11, 14, 3.6, 1.3, sh(top, 0.88)) + el(11, 14, 1.4, 0.55, sh(top, 0.75))
      + ln('M11.4 14.2L17.6 4.6', '#6a4a2a', 1.7) + ln('M11.6 13.6L17.2 4.9', sh('#6a4a2a', 1.3), 0.6)
      + pa('M15.6 3.2l5 2.4-1.4 3.4c-1.6-1.4-3.4-2-5.2-2z', '#b8bcc0') + pa('M19.2 9l1.4-3.4.6.4-1.3 3.4z', '#e8ecef')
      + pa('M3 20.4l1.6-1.2.5 1.4zM18.4 20.2l1.8-.8.2 1.2z', top);
  },
  forager: () => {
    const c = '#c8a868', d = sh(c, 0.74);
    return shadow(8) + ln('M6.6 11.6c0-6.4 10.8-6.4 10.8 0', sh(c, 0.8), 1.4)
      + ci(8.6, 10.4, 2.4, '#b03a5c') + ci(12, 9.2, 2.6, '#c04a6a') + ci(15.4, 10.4, 2.3, '#a8385a') + ci(10.4, 11, 2.2, '#d0587a') + ci(13.8, 11.2, 2.2, '#c04a6a')
      + ci(11.4, 8.4, 0.7, '#f2a0b4') + ci(8, 9.6, 0.6, '#f2a0b4')
      + pa('M4.6 11.6h14.8l-1.8 8.4H6.4z', c) + pa('M13.4 11.6h6l-1.8 8.4h-4.2z', d) + re(4.2, 11, 15.6, 1.8, sh(c, 1.15), 0.9)
      + ln('M6 14.6h12.6M6.5 17.2h11.4', sh(c, 0.7), 0.6) + ln('M8.2 12.8l.5 7M11.6 12.8v7M15 12.8l-.4 7', sh(c, 0.82), 0.6)
      + leaf(16.6, 7.6, -30, '#5e8f42');
  },
  desk: () => {
    const book = (y: number, x: number, w: number, c: string) => re(x, y, w, 2.8, c, 0.4) + re(x + 0.8, y + 0.5, w - 1.4, 1.8, '#efe6d0', 0.2) + re(x, y + 2, w, 0.8, sh(c, 0.7), 0.3);
    return shadow(9) + book(17.2, 3.6, 12, '#8a3a3a') + book(14.4, 4.6, 10.4, '#3a5a8a') + book(11.6, 3.8, 11.2, '#4a7a4a')
      + re(17.2, 13.2, 2.8, 7, '#f0e6c8', 0.6) + re(17.2, 13.2, 1, 7, '#fff8e4', 0.5) + el(18.6, 20.2, 2.8, 1, '#8a8a80')
      + pa('M18.6 7.4c1.6 1.8 1.6 3.6 0 4.8-1.6-1.2-1.6-3 0-4.8z', '#f5c04a') + pa('M18.6 9.4c.8.9.8 1.8 0 2.4-.8-.6-.8-1.5 0-2.4z', '#fff3c0')
      + ci(18.6, 10, 4, '#ffcf5a').replace('/>', ' opacity=".18"/>');
  },
  kitchen: () => {
    const pot = '#3a3a3a';
    return shadow(9) + pa('M6.6 20.2l3.4-5.4 1.4 5.4zM13 20.2l1.8-5.4 3.6 5.4z', '#6a6258')
      + pa('M9 20.4c0-3 1.4-4.2 3-5.6 1.6 1.4 3 2.6 3 5.6z', '#e07a2e') + pa('M10.6 20.4c0-1.8.6-2.6 1.4-3.4.8.8 1.4 1.6 1.4 3.4z', '#f5c04a')
      + pa('M4.6 9.4h14.8c0 4.4-3.2 7-7.4 7s-7.4-2.6-7.4-7z', pot) + pa('M14.2 9.4h5.2c0 4.2-3 6.8-6.8 7 2.4-1.6 3.6-3.8 1.6-7z', sh(pot, 0.7))
      + el(12, 9.4, 7.6, 2.1, sh(pot, 1.5)) + el(12, 9.5, 6.2, 1.5, '#d98a3c') + ci(10, 9.3, 0.8, '#f2d24a') + ci(13.4, 9.7, 0.7, '#6aa04a')
      + re(3.2, 8.6, 1.6, 1.6, sh(pot, 1.3), 0.5) + re(19.2, 8.6, 1.6, 1.6, sh(pot, 1.3), 0.5) + steam(10, 6);
  },
  dining: () => {
    const wood = '#9a6a40';
    return shadow(10) + re(5, 13.4, 1.4, 6.6, sh(wood, 0.8)) + re(17.6, 13.4, 1.4, 6.6, sh(wood, 0.7))
      + pa('M2.6 11.4h18.8l-1.4 2.6H4z', sh(wood, 1.15)) + re(4, 14, 16, 1.4, sh(wood, 0.75))
      + re(3, 18.2, 18, 1.6, '#7a5232', 0.4) + re(4, 19.8, 1.2, 1.4, '#5a3c26') + re(18.8, 19.8, 1.2, 1.4, '#5a3c26')
      + pa('M7.4 9.4h6c0 2-1.4 2.6-3 2.6s-3-.6-3-2.6z', '#e8dcc0') + el(10.4, 9.4, 3, 0.8, '#d98a3c')
      + pa('M14.6 8.8h3.2l-.4 2.8h-2.4z', '#b8945a') + el(16.2, 8.8, 1.6, 0.5, '#e8c070') + steam(9, 6.4);
  },
  clinic: () => {
    const bag = '#7a4a2e';
    return shadow(9) + ln('M8.6 8.2c0-3.6 6.8-3.6 6.8 0', '#4a2e1c', 1.6)
      + pa('M4 9.6c0-1 .8-1.8 1.8-1.8h12.4c1 0 1.8.8 1.8 1.8l-.8 9.4c0 .8-.6 1.2-1.4 1.2H6.2c-.8 0-1.4-.4-1.4-1.2z', bag)
      + pa('M14.4 7.8h3.8c1 0 1.8.8 1.8 1.8l-.8 9.4c0 .8-.6 1.2-1.4 1.2h-3.4z', sh(bag, 0.75))
      + re(4.2, 10.6, 15.6, 1.2, sh(bag, 0.6)) + re(10.8, 10.2, 2.4, 2, '#d8c39a', 0.4)
      + ci(12, 15.6, 3.2, '#f4f1e8') + re(11.2, 13.4, 1.6, 4.4, '#3a9a5a') + re(9.8, 14.8, 4.4, 1.6, '#3a9a5a');
  },
  storehouse: () => {
    const c = '#b08a5a', top = sh(c, 1.18), side = sh(c, 0.72);
    return shadow(10) + pa('M3 11.4l3-2h9l-3 2z', top) + re(3, 11.4, 9, 8.6, c) + pa('M12 11.4l3-2v8.6l-3 2z', side)
      + ln('M3.4 12l8.2 7.6M11.6 12l-8.2 7.6', sh(c, 0.75), 0.9) + re(3, 11.4, 9, 1, sh(c, 0.85)) + re(3, 19, 9, 1, sh(c, 0.85))
      + pa('M14.6 20c-1.4 0-2-1.2-1.4-3.6.6-2.6 1.2-4.8 2-6.2-.6-.8-.4-1.6.6-1.6h2.6c1 0 1.2.8.6 1.6.8 1.4 1.4 3.6 2 6.2.6 2.4 0 3.6-1.4 3.6z', '#d8c8a0')
      + pa('M18.6 10.2c.8 1.4 1.4 3.6 2 6.2.6 2.4 0 3.6-1.4 3.6h-2c1.2-.4 1.6-1.4 1.2-3.6-.4-2.4-.9-4.4-1.6-6z', '#bfae86') + ln('M15 9.6h3.6', '#8a7a58', 0.9);
  },
  cottage: () => {
    const wall = '#c7a983', roof = '#4f6f9a';
    return shadow(9) + re(15, 3.4, 2.4, 6, '#a08a70') + steam(15.6, 2.6).replace('opacity=".7"', 'opacity=".55"')
      + re(5, 11, 14, 9, wall) + re(13, 11, 6, 9, sh(wall, 0.85)) + pa('M2.6 12.4L12 3.4l9.4 9z', roof) + pa('M12 3.4l9.4 9H12z', sh(roof, 0.78)) + pa('M2.6 12.4L12 3.4v1.6l-8 7.4z', sh(roof, 1.2))
      + pa('M7.2 20v-4.6c0-1.4 2.8-1.4 2.8 0V20z', '#4a6a8a') + re(12.6, 13.4, 3.8, 3.2, '#f6cf6a') + ln('M14.5 13.4v3.2M12.6 15h3.8', '#4a3a2a', 0.6)
      + re(12.2, 16.6, 4.6, 1.2, '#7a5232') + ci(13, 16.4, 0.7, '#d66a9a') + ci(14.6, 16.3, 0.7, '#f2d24a') + ci(16, 16.4, 0.7, '#d66a9a');
  },
  dock: () => {
    const rod = '#7a5232';
    return shadow(9) + pa('M2 17.6h20v1.6H2z', '#3d6f8a') + ln('M3 18.4h4M10 18.6h5M17 18.4h4', '#8cc0d8', 0.7, ' opacity=".7"')
      + re(3, 15.2, 18, 2.4, '#8a6a48') + re(3, 15.2, 18, 0.8, sh('#8a6a48', 1.2)) + re(5, 17.6, 1.2, 3, sh(rod, 0.8)) + re(17.8, 17.6, 1.2, 3, sh(rod, 0.8))
      + ln('M5.2 15.2L18.6 3.4', rod, 1.3) + ln('M18.6 3.4c1.4 2 1.6 4.6 1 7', '#e8e0cc', 0.6)
      + `<g transform="translate(15.4 8.2) rotate(80) scale(.42)">${fish('#5b9cc2', '#c8e0ec')}</g>`;
  },
  cellar: () => {
    const g = '#5e8a40';
    return shadow(10) + pa('M2.6 20c0-7.4 4.2-12.6 9.4-12.6S21.4 12.6 21.4 20z', g) + pa('M12 7.4c5.2 0 9.4 5.2 9.4 12.6H15c0-6.6-1-10.4-3-12.6z', sh(g, 0.8))
      + pa('M4 9.6l1 1.4M7 7.8l.6 1.6M17.6 8.6l-.8 1.4', sh(g, 1.3)) + pa('M7.6 20v-5.4c0-2.8 2-4.6 4.4-4.6s4.4 1.8 4.4 4.6V20z', '#8c8478')
      + pa('M9.4 20v-4.6c0-1.8 1.2-3 2.6-3s2.6 1.2 2.6 3V20z', '#3a2e24') + re(16.6, 4.6, 1.4, 5, '#6a6a6a')
      + re(18.4, 16.6, 1, 3.6, '#e8e0cc') + el(18.9, 16.6, 2.6, 1.6, '#8d7aa8') + el(18.4, 16.1, 1, 0.5, sh('#8d7aa8', 1.3));
  },
  pieoven: () => {
    const clay = '#c08a5a';
    return shadow(10) + re(2.6, 16, 18.8, 4.2, '#8c8478') + re(2.6, 16, 18.8, 1, sh('#8c8478', 1.18))
      + pa('M4 16c0-6.4 3.6-10.2 8-10.2s8 3.8 8 10.2z', clay) + pa('M12 5.8c4.4 0 8 3.8 8 10.2h-4.6c0-6-1.4-8.8-3.4-10.2z', sh(clay, 0.8))
      + re(14.2, 3, 2, 4, sh(clay, 0.75)) + pa('M8.6 16v-2.6c0-2 1.6-3.4 3.4-3.4s3.4 1.4 3.4 3.4V16z', '#2e1a10')
      + pa('M9.8 16v-1.8c0-1.4 1-2.2 2.2-2.2s2.2.8 2.2 2.2V16z', '#f09a3a') + pa('M11 16v-1c0-.8.4-1.2 1-1.2s1 .4 1 1.2v1z', '#ffd36a')
      + ln('M6.2 9.8c.8-1.4 2-2.4 3.2-3', sh(clay, 1.25), 0.8);
  },
  smokehouse: () => {
    const wood = '#5a4030', f = '#9c7a5a';
    const hang = (x: number) => ln(`M${x} 7v1.6`, '#d8c39a', 0.6) + pa(`M${x} 8.6c1.6 1.4 1.8 4.6 0 7.2-1.8-2.6-1.6-5.8 0-7.2z`, f) + pa(`M${x} 15.8l1.3 2.2h-2.6z`, sh(f, 0.8)) + ln(`M${x - 0.6} 11h1.2M${x - 0.6} 12.8h1.2`, sh(f, 0.65), 0.5);
    return shadow(9) + re(3, 6.2, 18, 1.4, wood, 0.5) + re(3.4, 6.2, 1.4, 14, sh(wood, 0.9)) + re(19.2, 6.2, 1.4, 14, sh(wood, 0.75))
      + hang(8) + hang(12) + hang(16) + ln('M10 4.4c-1.4-1.2 1.4-1.8 0-3.2M14.4 4.6c-1.4-1.2 1.4-1.8 0-3.2', '#b8b4ac', 1, ' opacity=".8"');
  },
  mill: () => {
    const wall = '#a08a68', roof = '#7a6a4a', sail = '#e8dcc0';
    const blade = (a: number) => `<g transform="rotate(${a} 12 9)">${re(11.4, 0.6, 1.2, 8.4, '#5a4030')}${re(12.6, 1.2, 3, 6.6, sail)}${ln('M12.6 3.4h3M12.6 5.6h3', sh(sail, 0.8), 0.4)}</g>`;
    return shadow(7) + pa('M8.4 20.4L9.6 9h4.8l1.2 11.4z', wall) + pa('M12 9h2.4l1.2 11.4H12z', sh(wall, 0.8)) + pa('M10.8 20.4v-3.6c0-1 2.4-1 2.4 0v3.6z', '#3a2a1c')
      + pa('M8.8 9.6L12 4.6l3.2 5z', roof) + pa('M12 4.6l3.2 5H12z', sh(roof, 0.78)) + blade(20) + blade(110) + blade(200) + blade(290) + ci(12, 9, 1.2, '#4a3a2a');
  },
  bakery: () => {
    const wood = '#b08458', bread = '#c89048';
    return shadow(9) + `<g transform="rotate(-30 12 12)">${re(11, 12, 2, 10, sh(wood, 0.85), 0.6)}${re(5.6, 2.6, 12.8, 10, wood, 4.4)}${re(5.6, 2.6, 4, 10, sh(wood, 1.15), 2)}</g>`
      + el(11.6, 9.4, 5.6, 3.4, bread) + pa('M6 9.4c0-1.8 2.6-3.4 5.6-3.4s5.6 1.6 5.6 3.4c-1.6-1-3.4-1.4-5.6-1.4S7.6 8.4 6 9.4z', sh(bread, 1.2))
      + ln('M8.8 8.4l1.4 1.6M11.6 7.8l1.4 1.8M14.4 8.2l1.2 1.6', sh(bread, 1.35), 0.8);
  },
  herbgarden: () => {
    const can = '#6a8a9a';
    return shadow(9) + pa('M4.6 11.4h10.4l-1 8.6H5.6z', can) + pa('M11.4 11.4H15l-1 8.6h-2.6z', sh(can, 0.78)) + re(4.4, 10.6, 10.8, 1.6, sh(can, 1.2), 0.8)
      + ln('M6.6 10.8c0-3.6 6.6-3.6 6.6 0', sh(can, 0.85), 1.3) + pa('M14.6 14.2l5.6-5 .9.9-5.4 5.6z', can) + el(20.6, 8.8, 1.4, 0.8, sh(can, 1.2), ' transform="rotate(-45 20.6 8.8)"')
      + ln('M18.6 12.2v7.6', '#4a7a3a', 1) + leaf(17.2, 15, 30, '#5a9a4a') + leaf(20, 13.6, -30, '#6aa84a') + leaf(17.4, 18, 30, '#4a8a5a') + leaf(20.2, 17, -30, '#5a9a4a');
  },
  apothecary: () => {
    const stone = '#a8a094';
    return shadow(8) + ln('M13.6 13L19.4 3.6', '#7a5232', 2) + ln('M13.8 12.4L19 4', sh('#7a5232', 1.3), 0.6) + el(19.4, 3.6, 1.4, 1.2, sh('#7a5232', 1.1))
      + pa('M4 11.4h16c0 4.6-3.2 7.4-8 7.4s-8-2.8-8-7.4z', stone) + pa('M14.2 11.4H20c0 4.4-2.8 7.2-7 7.4 1.8-1.8 2.8-4 1.2-7.4z', sh(stone, 0.78))
      + el(12, 11.4, 8.4, 2, sh(stone, 1.2)) + el(12, 11.5, 6.6, 1.4, '#4a7a3a') + ci(10, 11.3, 0.8, '#7aa860') + ci(13.4, 11.6, 0.7, '#8ab89a')
      + re(9, 18.4, 6, 1.8, sh(stone, 0.85), 0.6);
  },
  brewery: () => {
    const c = '#8a5a34', band = '#4a3a2a';
    return shadow(10) + pa('M3.4 7.8c3-1.2 14.2-1.2 17.2 0v8.4c-3 1.2-14.2 1.2-17.2 0z', c) + pa('M3.4 7.8c3-1.2 14.2-1.2 17.2 0v2c-3-1-14.2-1-17.2 0z', sh(c, 1.2))
      + pa('M3.4 14.4c3 1 14.2 1 17.2 0v1.8c-3 1.2-14.2 1.2-17.2 0z', sh(c, 0.75)) + ln('M7 6.9v10.2M17 6.9v10.2', band, 1.2)
      + el(3.6, 12, 1.4, 4.2, sh(c, 1.15)) + el(3.6, 12, 0.7, 2.6, sh(c, 0.85)) + re(11, 15.6, 2, 2, '#9a9a9a') + re(10.6, 17.4, 2.8, 1, '#7a7a7a')
      + pa('M12 18.6c.7 1 .7 1.6 0 2.2-.7-.6-.7-1.2 0-2.2z', '#d6a33c') + re(5.6, 17, 1.4, 3.4, '#5a3c26') + re(17, 17, 1.4, 3.4, '#5a3c26');
  },
  ciderpress: () => {
    const wood = '#8a6038';
    return shadow(10) + re(4, 3.6, 2, 14, sh(wood, 0.9)) + re(18, 3.6, 2, 14, sh(wood, 0.75)) + re(3, 3, 18, 2.4, wood) + re(3, 3, 18, 0.8, sh(wood, 1.2))
      + re(11.2, 5.4, 1.6, 6, '#7a7a72') + ln('M11.2 6.6l1.6 1M11.2 8.4l1.6 1M11.2 10.2l1.6 1', '#5a5a52', 0.5) + re(8, 11.2, 8, 1.6, sh(wood, 1.15))
      + pa('M5.6 13h12.8l-1 7H6.6z', wood) + pa('M14.4 13h4l-1 7h-3z', sh(wood, 0.75)) + ln('M6.2 16.4h11.6', sh(wood, 0.65), 0.7)
      + ci(9.4, 12.2, 1.6, '#d2452f') + ci(12.4, 12, 1.5, '#b8c25a') + ci(15, 12.3, 1.4, '#d2452f') + pa('M14 15l-.6 2.6h1.2z', '#e8c070');
  },
  orchard: () => {
    const lad = '#9a7044', c = '#c8a868';
    return shadow(10) + ln('M4.6 20.4L9.4 2.8M10.2 20.4L14.6 2.8', lad, 1.4) + ln('M5.6 16.8h5.4M6.6 13.2h5.2M7.6 9.6h5.2M8.6 6h5', sh(lad, 1.2), 1.1)
      + ci(14.2, 11.6, 1.8, '#d2452f') + ci(17.6, 11.4, 1.9, '#c03a28') + ci(16, 10, 1.6, '#e05a3a') + ci(19.4, 12.4, 1.5, '#d2452f') + ci(15.6, 9.2, 0.5, '#f4a090')
      + pa('M12.6 12.6h9l-1.2 7.6h-6.6z', c) + pa('M18.4 12.6h3.2l-1.2 7.6H18z', sh(c, 0.75)) + re(12.2, 12, 9.8, 1.4, sh(c, 1.15), 0.7) + ln('M13.6 15.4h7M14 17.8h6', sh(c, 0.7), 0.6);
  },
  apiary: () => {
    const s = '#d4a84a';
    const bee = (x: number, y: number) => el(x, y, 1, 0.7, '#2a2418') + el(x + 0.2, y - 0.7, 0.8, 0.5, '#e8f0f8', ' opacity=".8"');
    return shadow(8) + re(4, 18.4, 16, 2, '#7a5232') + pa('M5 18.6c0-8 3-12.6 7-12.6s7 4.6 7 12.6z', s) + pa('M12 6c4 0 7 4.6 7 12.6h-4.6C14.4 11 13.6 7.6 12 6z', sh(s, 0.8))
      + ln('M6 15.6c4 1 8 1 12 0M6.8 12.4c3.4.8 7 .8 10.4 0M8.6 9.4c2.2.6 4.6.6 6.8 0', sh(s, 0.7), 0.9)
      + pa('M10.4 18.6v-1.4c0-1.2 3.2-1.2 3.2 0v1.4z', '#3a2a1c') + bee(18.4, 6.4) + bee(20.6, 9.6) + bee(4.6, 6);
  },
  flaxfield: () => ART.flax(),
  weaver: () => ART.cloth(),
  trapper: () => ART.hides(),
  tanner: () => ART.leather(),
  tailor: () => ART.coats(),
  field: () => {
    const straw = '#d8c060', shirt = '#6a7aa8';
    return shadow(7) + re(11.2, 6, 1.6, 15, '#5a4030') + re(3.6, 8.8, 16.8, 1.4, '#5a4030')
      + pa('M8.2 9.4h7.6l-.8 7.4H9z', shirt) + pa('M12.6 9.4h3.2l-.8 7.4h-2.4z', sh(shirt, 0.78)) + re(9.6, 12.4, 1.6, 1.6, '#c4703a')
      + pa('M3.6 10.2l-1.4 1.8M3.6 10.2l-.4 2.2M20.4 10.2l1.4 1.8M20.4 10.2l.4 2.2', straw) + ln('M3.4 10.4l-1.4 1.6M3.4 10.4l-.2 2.2M20.6 10.4l1.4 1.6M20.6 10.4l.2 2.2', straw, 0.8)
      + ci(12, 6.4, 2.6, '#e8d8a8') + ci(11.1, 6.2, 0.4, '#3a2a1c') + ci(12.9, 6.2, 0.4, '#3a2a1c') + ln('M11 7.4c.6.5 1.4.5 2 0', '#3a2a1c', 0.5)
      + pa('M6.6 4.8c2.2-.6 3-3.6 5.4-3.6s3.2 3 5.4 3.6c-3.6.8-7.2.8-10.8 0z', '#b89a50') + pa('M9.4 4.4c.6-1.6 1.4-2.6 2.6-2.6s2 1 2.6 2.6c-1.8.4-3.4.4-5.2 0z', sh('#b89a50', 1.15));
  },
  sawmill: () => {
    const teeth = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 7.4 : 8.6; return `${(11 + Math.cos(a) * r).toFixed(2)} ${(10 + Math.sin(a) * r).toFixed(2)}`; }).join('L');
    return shadow(10) + log(2.6, 15, 18, 5) + pa(`M${teeth}z`, '#b8bcc0') + ci(11, 10, 6.6, '#c8ccd0') + pa('M11 3.4a6.6 6.6 0 0 1 6.6 6.6H11z', '#dde0e3') + ci(11, 10, 1.8, '#5a5a5a') + ci(11, 10, 0.7, '#9a9a9a');
  },
  kiln: () => {
    const b = '#9a5a40';
    return shadow(8) + pa('M5.4 20.4c-.2-4.4 1.8-7.4 4.4-9.6V4.2h4.4v6.6c2.6 2.2 4.6 5.2 4.4 9.6z', b) + pa('M12 4.2h2.2v6.6c2.6 2.2 4.6 5.2 4.4 9.6H14c.4-4.2-.4-7.4-2-9.6z', sh(b, 0.78))
      + re(9.2, 3, 5.6, 1.8, '#5a4a44', 0.6) + ln('M7 15.4h10M6.2 18h11.6M8.6 12.8h6.8', sh(b, 0.8), 0.6) + pa('M9.8 20.4v-2.6c0-1.6 4.4-1.6 4.4 0v2.6z', '#2e1a10')
      + pa('M10.8 20.4v-1.8c0-.8 2.4-.8 2.4 0v1.8z', '#f08a3a') + ln('M11 2c-1.2-1 1.2-1.4 0-2.4M13.4 2.2c-1.2-1 1.2-1.4 0-2.4', '#b8b4ac', 0.8, ' opacity=".8"');
  },
  carpenter: () => {
    const plank = '#d2a96a';
    return shadow(10) + pa('M2.6 15.6l16.8-2.4v3.4L2.6 19z', plank) + pa('M2.6 15.6l16.8-2.4 1.6.6-16.8 2.4z', sh(plank, 1.15)) + pa('M19.4 13.2l1.6.6V17l-1.6-.4z', sh(plank, 0.72))
      + pa('M5 13.6L15.6 3.4l2.6 2.6L7.4 15.6z', '#c8ccd0') + pa('M5 13.6L15.6 3.4l.8.8L5.8 14.4z', '#e2e5e8') + ln('M7.2 14.6l.8-.8M8.8 13l.8-.8M10.4 11.4l.8-.8M12 9.8l.8-.8M13.6 8.2l.8-.8', '#8a8e92', 0.6)
      + pa('M15.6 3.4l2.2-2.2c1 0 3 2 3 3l-2.2 2.2z', '#7a5232') + ci(19, 3.2, 0.9, sh('#7a5232', 0.6));
  },
  claypit: () => {
    const clay = '#b0603a';
    return shadow(10) + pa('M2.6 20c.6-4.4 4-7 9.4-7s8.8 2.6 9.4 7z', clay) + pa('M12 13c5.4 0 8.8 2.6 9.4 7H15.4c-.4-3.6-1.6-5.8-3.4-7z', sh(clay, 0.78)) + pa('M5 16.4c1.6-1.4 3.4-2 5-2', sh(clay, 1.25), ' stroke="none"')
      + ln('M13.6 15.4L16.2 2.6', '#6a4a2a', 1.6) + re(14.6, 1.4, 4, 1.6, '#6a4a2a', 0.8) + pa('M11 13.8l5-.2.2 3.4c-1.6 1-3.4 1-5 0z', '#9a9ea2') + pa('M13.6 13.7l2.4-.1.2 3.4c-.8.5-1.6.7-2.5.7z', sh('#9a9ea2', 0.78));
  },
  tavern: () => {
    const mug = '#8a5a34';
    return shadow(7) + re(3, 3, 16, 1.6, '#4a3a2a', 0.6) + re(3, 3, 1.6, 4, '#4a3a2a') + ln('M7 4.6v2M15 4.6v2', '#c8b88a', 0.7)
      + re(5, 6.4, 12, 14, '#2f4a3a', 1.4) + re(5, 6.4, 12, 1.4, sh('#2f4a3a', 1.3), 1) + re(5.6, 7, 10.8, 12.8, 'none', 1, ' stroke="#d6a33c" stroke-width=".6"')
      + re(7.6, 10.4, 5.4, 7, mug, 0.8) + re(7.6, 10.4, 1.6, 7, sh(mug, 1.2), 0.6) + pa('M13 11.6h1.4c1.2 0 1.8.8 1.8 2s-.6 2-1.8 2H13v-1.2h1.2c.4 0 .7-.3.7-.8s-.3-.8-.7-.8H13z', sh(mug, 0.85))
      + el(10.3, 10.2, 3.2, 1.6, '#f4ecd8') + ci(8.6, 9.6, 1.2, '#f4ecd8') + ci(11.6, 9.4, 1.3, '#fff8ea');
  },
  bathhouse: () => {
    const wood = '#8a6038';
    return shadow(10) + pa('M3.4 11.6h17.2l-1.4 8.8H4.8z', wood) + pa('M14.8 11.6h5.8l-1.4 8.8h-4.4z', sh(wood, 0.75)) + el(12, 11.6, 8.6, 2.2, sh(wood, 1.2)) + el(12, 11.7, 7.4, 1.6, '#8ac8d8')
      + el(10, 11.4, 2.4, 0.5, '#c8e8f0') + ln('M4 14.6h16M4.4 17.6h15.2', '#4a3a2a', 1) + ln('M8 9c-1.6-1.6 1.6-2.4 0-4.2M12 8.6c-1.6-1.6 1.6-2.4 0-4.2M16 9c-1.6-1.6 1.6-2.4 0-4.2', '#e9e4d8', 1.1, ' opacity=".75"');
  },
  stage: () => {
    const body = '#c8904a';
    return shadow(7) + `<g transform="rotate(-38 12 12)">${re(11, 1.6, 2.2, 10, '#5a3a24', 0.6)}${re(10.4, 0.8, 3.4, 2.4, '#4a2e1c', 0.8)}${el(12.1, 16, 5.6, 6, body)}${el(13.6, 16.6, 3.4, 4.8, sh(body, 0.85))}${ci(12.1, 14.6, 1.5, '#3a2416')}${re(10.4, 18.6, 3.4, 1, '#5a3a24', 0.4)}${ln('M11.6 3v16M12.6 3v16', '#e8dcc0', 0.3)}</g>`;
  },
  hall: () => {
    const gold = '#e8b84a';
    return shadow(9) + pa('M3.4 18.4L2.4 7.6l4.6 4.2L12 4.2l5 7.6 4.6-4.2-1 10.8z', gold) + pa('M12 4.2l5 7.6 4.6-4.2-1 10.8H12z', sh(gold, 0.82))
      + re(3.2, 17, 17.6, 3, sh(gold, 0.9), 0.6) + re(3.2, 17, 17.6, 1, sh(gold, 1.2), 0.5) + ci(12, 18.5, 1.1, '#c04a4a') + ci(7, 18.5, 0.9, '#3a6aa8') + ci(17, 18.5, 0.9, '#3a6aa8')
      + ci(2.4, 7.4, 1.2, gold) + ci(12, 3.8, 1.3, gold) + ci(21.6, 7.4, 1.2, gold) + ci(12, 11.6, 1, '#c04a4a');
  },
  stockpile: () => {
    const c = '#b08a5a';
    return shadow(10) + re(2.4, 18, 19.2, 2.2, '#7f6f50') + re(2.4, 18, 19.2, 0.7, sh('#8a7a5a', 1.2)) + log(2.8, 13.2, 10, 4.6) + log(4.4, 8.8, 8.4, 4.4)
      + pa('M13.4 9.4l2.2-1.6h5.6l-2.2 1.6z', sh(c, 1.18)) + re(13.4, 9.4, 5.6, 8.6, c) + pa('M19 9.4l2.2-1.6v8.6L19 18z', sh(c, 0.72)) + ln('M13.8 10l4.8 7.4M18.6 10l-4.8 7.4', sh(c, 0.75), 0.7);
  },
  flowerbed: () => {
    const b = '#8a6038';
    return shadow(9) + ci(5.4, 18.6, 2, '#3a2e24') + ci(5.4, 18.6, 0.8, '#8a8a80') + ln('M16 14.4l4.6 5.4M18.2 14.2l2.8 6', b, 1.2)
      + pa('M3 11.4h14.6l-2.4 5.6H6z', b) + pa('M12.6 11.4h5l-2.4 5.6h-3.6z', sh(b, 0.78))
      + [[5, 9.4, '#d66a9a'], [8.4, 8.6, '#f2c94c'], [11.6, 9, '#f4f1e8'], [14.8, 9.6, '#b07ad6'], [7, 11, '#d66a9a'], [13, 11, '#f2c94c']].map(([x, y, c]) => ci(x as number, y as number, 1.7, c as string) + ci(x as number, y as number, 0.6, '#f2d24a')).join('')
      + leaf(4.4, 11.6, 20, '#4a7a3a') + leaf(16, 11.2, -20, '#4a7a3a');
  },
  lantern: () => {
    const iron = '#3a2e24';
    return shadow(5) + re(11.2, 9, 1.6, 12, iron) + el(12, 7.8, 6, 6, '#f2c46a', ' opacity=".22"') + re(8.6, 4.6, 6.8, 7, '#f6cf6a', 1) + re(8.6, 4.6, 6.8, 7, 'none', 1, ` stroke="${iron}" stroke-width="1.2"`)
      + ln('M12 4.6v7', iron, 0.8) + pa('M7.8 4.8L12 1.6l4.2 3.2z', iron) + re(8.2, 11.4, 7.6, 1.2, iron, 0.4);
  },
  bench: () => {
    const w = '#a07448';
    return shadow(10) + re(3, 6, 18, 5.4, sh(w, 0.9), 1) + re(3, 6, 18, 1.4, sh(w, 1.15), 0.7) + ln('M3.6 8.6h16.8', sh(w, 0.75), 0.6)
      + pa('M2 13.4l2-1.8h16l2 1.8z', sh(w, 1.15)) + re(2, 13.4, 20, 2, w) + re(4, 15.4, 1.6, 5, '#5a4029') + re(18.4, 15.4, 1.6, 5, '#5a4029') + re(5, 11.4, 1.2, 2, '#5a4029') + re(17.8, 11.4, 1.2, 2, '#5a4029');
  },
  statue: () => {
    const st = '#b8b8b0';
    return shadow(7) + re(6, 16.4, 12, 4, '#8a8a82') + re(6, 16.4, 12, 1.2, '#a8a8a0') + pa('M9.4 16.4l.8-8.6h3.6l.8 8.6z', st) + pa('M12 7.8h1.8l.8 8.6H12z', sh(st, 0.82))
      + re(13.2, 9.4, 7.4, 1.8, '#b0b0a8', 0.8) + ci(12, 5.6, 2.4, '#c4c4bc') + pa('M8.8 4.2L12 0.8l3.2 3.4z', '#9a9a92') + ln('M11.2 6.6c.5-.3 1.1-.3 1.6 0', '#7a7a72', 0.5);
  },
};

/** an inline icon for a good, a category or a building; size in CSS pixels (the class sets the default) */
/** things that are neither goods nor buildings: gold, the caravan, a cornerstone */
const EXTRA_ART: Record<string, () => string> = {
  gold: () => {
    const g = '#e2b53e', coin = (x: number, y: number) => el(x, y + 1.2, 5.2, 2.2, sh(g, 0.62)) + re(x - 5.2, y - 0.2, 10.4, 1.4, sh(g, 0.75)) + el(x, y - 0.2, 5.2, 2.2, g) + el(x, y - 0.4, 3.4, 1.3, sh(g, 1.18)) + el(x - 1, y - 0.8, 1.2, 0.45, '#fff6d0', ' opacity=".7"');
    return shadow(8) + coin(9, 18) + coin(15, 18.4) + coin(10.5, 15.4) + coin(13.5, 12.6) + coin(11.5, 9.8);
  },
  caravan: () => {
    const wood = '#8c6340', cloth = '#d8cfb4';
    return shadow(9.5) + re(4, 12, 15, 5, wood, 1) + re(4, 16, 15, 1.2, sh(wood, 0.7))
      + pa('M4.5 12.2C4.5 6 7.5 4.4 11.5 4.4s7 1.6 7 7.8z', cloth) + pa('M4.5 12.2C4.5 6 7.5 4.4 11.5 4.4 9 6 8.2 8.6 8.2 12.2z', sh(cloth, 1.12))
      + ln('M8.2 12.2C8.2 8 9.5 5.6 11.5 4.6M14.8 12.2c0-4-1.3-6.6-3.3-7.6', sh(cloth, 0.72), 0.8)
      + ci(7.5, 18.4, 2.6, '#4b3524') + ci(7.5, 18.4, 1.1, '#a7835c') + ci(16.2, 18.4, 2.6, '#4b3524') + ci(16.2, 18.4, 1.1, '#a7835c')
      + ln('M19 15.5l3 1.4', wood, 1.2);
  },
  cornerstone: () => {
    const st = '#a39d8c';
    return shadow(8) + pa('M4 11l8-4 8 4v6.5l-8 4-8-4z', sh(st, 0.78)) + pa('M4 11l8 4v6.5l-8-4z', sh(st, 0.95)) + pa('M4 11l8-4 8 4-8 4z', sh(st, 1.15))
      + pa('M12 8.6l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z', '#e8a33d', ' transform="matrix(1 0 0 .55 0 5)"');
  },
};
export function icon(id: ResourceId | Category | string, cls = '', title?: string): string {
  const art = EXTRA_ART[id] ?? BUILDING_ART[id] ?? ART[(id in ART ? id : CATEGORY_ICON[id as Category | SlotId]) as ResourceId];
  if (!art) return '';
  return `<svg class="ico${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" ${title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"'}>${art()}</svg>`;
}
export const ICON_IDS = Object.keys(ART) as ResourceId[];
export const BUILDING_ICON_IDS = Object.keys(BUILDING_ART);
