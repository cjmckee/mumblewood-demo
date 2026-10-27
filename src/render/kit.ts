// A tiny 3D kit for buildings. A model is a list of parts in the blueprint's own footprint space:
//   u across the front (0..w tiles), v from back to front (0..h tiles, the doorway just past v = h), z up in pixels.
// The renderer turns each point with the building's rotation, projects it isometrically, drops faces turned away
// from the camera, lights each face by which way it points, and draws parts back to front. One model, four views.

export type P3 = [number, number, number];
export interface Poly {
  pts: P3[];
  col: number;
  /** false: drawn flat in its own colour, not lit (glass, glow, shadow) */
  lit?: boolean;
  /** seen from both sides (a sign, a wheel, a flag); never culled */
  two?: boolean;
  alpha?: number;
}
export interface Part {
  polys: Poly[];
  /** draw order: parts further back (smaller x + y once turned) first; ties go by height */
  at?: [number, number];
  /** lift the part's place in the draw order (a roof drawn after the walls under it) */
  layer?: number;
}
export type Model = Part[];

// ---------- colour ----------
export function shade(c: number, f: number) {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}
export function mix(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ---------- solids ----------
/** a vertical prism: a floor outline (u, v) raised from z0 to z1. Convex outlines only */
export function prism(outline: [number, number][], z0: number, z1: number, col: number, top = col): Part {
  const polys: Poly[] = [];
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const [a, b] = [outline[i], outline[(i + 1) % n]];
    polys.push({ pts: [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], col });
  }
  polys.push({ pts: outline.map(([u, v]) => [u, v, z1] as P3), col: top });
  return { polys };
}
export const box = (u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, col: number, top = col) =>
  prism([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], z0, z1, col, top);
/** an n-sided column, for barrels, towers, chimneys, posts */
export function column(u: number, v: number, r: number, z0: number, z1: number, col: number, top = col, sides = 10, rv = r): Part {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2 + Math.PI / sides; pts.push([u + Math.cos(a) * r, v + Math.sin(a) * rv]); }
  return prism(pts, z0, z1, col, top);
}
/** a tapered column: a ring of radius r0 at z0 narrowing to r1 at z1 (towers, tubs, kettles) */
export function frustum(u: number, v: number, r0: number, r1: number, z0: number, z1: number, col: number, top = col, sides = 8): Part {
  const a = ring(u, v, r0, sides), b = ring(u, v, r1, sides);
  const polys: Poly[] = a.map((p, i) => { const j = (i + 1) % sides; return { pts: [[p[0], p[1], z0], [a[j][0], a[j][1], z0], [b[j][0], b[j][1], z1], [b[i][0], b[i][1], z1]] as P3[], col }; });
  polys.push({ pts: b.map(([x, y]) => [x, y, z1] as P3), col: top });
  return { polys };
}
/** a cone or pyramid from a floor outline up to an apex */
export function cone(outline: [number, number][], z0: number, apex: P3, col: number): Part {
  const polys: Poly[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    polys.push({ pts: [[a[0], a[1], z0], [b[0], b[1], z0], apex], col });
  }
  return { polys };
}
export function ring(u: number, v: number, r: number, sides = 10, rv = r): [number, number][] {
  return Array.from({ length: sides }, (_, i) => { const a = (i / sides) * Math.PI * 2 + Math.PI / sides; return [u + Math.cos(a) * r, v + Math.sin(a) * rv] as [number, number]; });
}
/** a dome: stacked rings narrowing to a cap */
export function dome(u: number, v: number, r: number, z0: number, hgt: number, col: number, sides = 10, steps = 4): Part {
  const polys: Poly[] = [];
  const at = (k: number) => { const t = (k / steps) * (Math.PI / 2); return { rr: r * Math.cos(t), z: z0 + hgt * Math.sin(t) }; };
  for (let k = 0; k < steps; k++) {
    const lo = at(k), hi = at(k + 1);
    const a = ring(u, v, lo.rr, sides), b = ring(u, v, Math.max(0.001, hi.rr), sides);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      polys.push({ pts: [[a[i][0], a[i][1], lo.z], [a[j][0], a[j][1], lo.z], [b[j][0], b[j][1], hi.z], [b[i][0], b[i][1], hi.z]], col });
    }
  }
  return { polys };
}
/** a horizontal prism: a profile drawn across the v axis ([v, z] points) run along u from u0 to u1. Roofs, logs, troughs */
export function runU(profile: [number, number][], u0: number, u1: number, col: number, cap = col): Part {
  const polys: Poly[] = [];
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const [a, b] = [profile[i], profile[(i + 1) % n]];
    polys.push({ pts: [[u0, a[0], a[1]], [u1, a[0], a[1]], [u1, b[0], b[1]], [u0, b[0], b[1]]], col });
  }
  polys.push({ pts: profile.map(([v, z]) => [u0, v, z] as P3), col: cap });
  polys.push({ pts: profile.map(([v, z]) => [u1, v, z] as P3), col: cap });
  return { polys };
}
/** the same, a profile across u ([u, z] points) run along v */
export function runV(profile: [number, number][], v0: number, v1: number, col: number, cap = col): Part {
  const polys: Poly[] = [];
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const [a, b] = [profile[i], profile[(i + 1) % n]];
    polys.push({ pts: [[a[0], v0, a[1]], [a[0], v1, a[1]], [b[0], v1, b[1]], [b[0], v0, b[1]]], col });
  }
  polys.push({ pts: profile.map(([u, z]) => [u, v0, z] as P3), col: cap });
  polys.push({ pts: profile.map(([u, z]) => [u, v1, z] as P3), col: cap });
  return { polys };
}

// ---------- roofs ----------
const O = 0.12; // roof overhang, tiles
/** four slopes meeting at a ridge (or a point, on a square) */
export function hipRoof(u0: number, v0: number, u1: number, v1: number, z: number, rise: number, col: number, o = O): Part {
  const a0 = u0 - o, a1 = u1 + o, b0 = v0 - o, b1 = v1 + o;
  const w = a1 - a0, d = b1 - b0;
  const inset = Math.min(w, d) / 2;
  // ridge runs along the longer side
  const r0: P3 = w >= d ? [a0 + inset, (b0 + b1) / 2, z + rise] : [(a0 + a1) / 2, b0 + inset, z + rise];
  const r1: P3 = w >= d ? [a1 - inset, (b0 + b1) / 2, z + rise] : [(a0 + a1) / 2, b1 - inset, z + rise];
  const c00: P3 = [a0, b0, z], c10: P3 = [a1, b0, z], c11: P3 = [a1, b1, z], c01: P3 = [a0, b1, z];
  const polys: Poly[] = w >= d
    ? [{ pts: [c00, c10, r1, r0], col }, { pts: [c10, c11, r1], col }, { pts: [c11, c01, r0, r1], col }, { pts: [c01, c00, r0], col }]
    : [{ pts: [c00, c10, r0], col }, { pts: [c10, c11, r1, r0], col }, { pts: [c11, c01, r1], col }, { pts: [c01, c00, r0, r1], col }];
  polys.push({ pts: [c00, c01, c11, c10], col: shade(col, 0.6) }); // underside, seen only from below; culled
  return { polys, layer: 1 };
}
/** two slopes; `along` is the direction the ridge runs. Gable ends are filled with `gable` (the wall colour) */
export function gableRoof(u0: number, v0: number, u1: number, v1: number, z: number, rise: number, col: number, gable: number, along: 'u' | 'v' = 'u', o = O): Part[] {
  if (along === 'u') {
    const m = (v0 + v1) / 2;
    const ends = runU([[v0, z], [v1, z], [m, z + rise]], u0, u1, gable);
    const slab = runU([[v0 - o, z - 3], [m, z + rise + 1], [v1 + o, z - 3], [v1 + o, z - 1], [m, z + rise + 3.5], [v0 - o, z - 1]], u0 - o, u1 + o, col, shade(col, 0.75));
    return [ends, { ...slab, layer: 1 }];
  }
  const m = (u0 + u1) / 2;
  const ends = runV([[u0, z], [u1, z], [m, z + rise]], v0, v1, gable);
  const slab = runV([[u0 - o, z - 3], [m, z + rise + 1], [u1 + o, z - 3], [u1 + o, z - 1], [m, z + rise + 3.5], [u0 - o, z - 1]], v0 - o, v1 + o, col, shade(col, 0.75));
  return [ends, { ...slab, layer: 1 }];
}
/** one slope, high at the back (v0) and low at the front (v1) */
export function shedRoof(u0: number, v0: number, u1: number, v1: number, zFront: number, zBack: number, col: number, o = O): Part {
  return { ...runU([[v0 - o, zBack], [v1 + o, zFront], [v1 + o, zFront + 3], [v0 - o, zBack + 3]], u0 - o, u1 + o, col, shade(col, 0.8)), layer: 1 };
}

// ---------- details on walls ----------
type Side = 'front' | 'back' | 'left' | 'right';
const E = 0.012; // how far a detail stands off its wall
/** a flat rectangle on a wall of the box (u0,v0)-(u1,v1): `a` runs along the wall (0..1 of its length), z in px */
export function onWall(u0: number, v0: number, u1: number, v1: number, side: Side, a0: number, a1: number, z0: number, z1: number, col: number, lit = true): Poly {
  const L = (t: number) => (side === 'front' || side === 'back' ? u0 + (u1 - u0) * t : v0 + (v1 - v0) * t);
  const q = (t: number, z: number): P3 =>
    side === 'front' ? [L(t), v1 + E, z] : side === 'back' ? [L(t), v0 - E, z] : side === 'left' ? [u0 - E, L(t), z] : [u1 + E, L(t), z];
  return { pts: [q(a0, z0), q(a1, z0), q(a1, z1), q(a0, z1)], col, lit };
}
/** a door: a dark opening with a lit frame */
export function door(u0: number, v0: number, u1: number, v1: number, side: Side, at: number, width: number, hgt: number, col = 0x3a2a1c, frame = 0xd8c39a): Poly[] {
  const len = side === 'front' || side === 'back' ? u1 - u0 : v1 - v0;
  const a = at / len, wd = width / len / 2;
  return [onWall(u0, v0, u1, v1, side, a - wd - 0.03 / len, a + wd + 0.03 / len, 0, hgt + 2.5, frame), onWall(u0, v0, u1, v1, side, a - wd, a + wd, 0, hgt, col)];
}
/** a window: frame, glass, and a glow at night */
export function windowOn(u0: number, v0: number, u1: number, v1: number, side: Side, at: number, width: number, z0: number, z1: number, lit: boolean, frame = 0x4a3a2a): Poly[] {
  const len = side === 'front' || side === 'back' ? u1 - u0 : v1 - v0;
  const a = at / len, wd = width / len / 2, f = 0.035 / len;
  return [onWall(u0, v0, u1, v1, side, a - wd - f, a + wd + f, z0 - 1.5, z1 + 1.5, frame), onWall(u0, v0, u1, v1, side, a - wd, a + wd, z0, z1, lit ? 0xf6cf6a : 0x2e3b44, false)];
}

// ---------- small props ----------
export const barrel = (u: number, v: number, r = 0.13, h = 12, col = 0x8a5a34) =>
  [column(u, v, r, 0, h, col, shade(col, 1.15), 8), { polys: [ringBand(u, v, r + 0.006, h * 0.25, 1.4, 0x4a3a2a), ringBand(u, v, r + 0.006, h * 0.72, 1.4, 0x4a3a2a)].flat() }] as Part[];
function ringBand(u: number, v: number, r: number, z: number, t: number, col: number): Poly[] {
  const rr = ring(u, v, r, 8);
  return rr.map((a, i) => { const b = rr[(i + 1) % rr.length]; return { pts: [[a[0], a[1], z], [b[0], b[1], z], [b[0], b[1], z + t], [a[0], a[1], z + t]] as P3[], col }; });
}
export const crate = (u: number, v: number, s = 0.16, h = 10, col = 0xb08a5a) => box(u - s, v - s, u + s, v + s, 0, h, col, shade(col, 1.1));
/** logs lying along u, stacked in a little pyramid */
export function logPile(u0: number, u1: number, v: number, rows = 2, r = 0.07, col = 0x8a6038): Part[] {
  const parts: Part[] = [];
  const oct = (cv: number, cz: number): [number, number][] => Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return [cv + Math.cos(a) * r, cz + Math.sin(a) * r * 26] as [number, number]; });
  for (let row = 0; row < rows; row++) for (let i = 0; i < rows - row + 1; i++) {
    const cv = v + (i - (rows - row) / 2) * r * 2.05, cz = r * 26 + row * r * 44;
    const p = runU(oct(cv, cz), u0, u1, col, 0xd8b07a);
    parts.push({ ...p, at: [(u0 + u1) / 2, cv + 0.3], layer: row * 0.1 });
  }
  return parts;
}
/** a flat two-sided board on posts, facing front */
export function sign(u: number, v: number, w: number, z0: number, z1: number, col: number, post = 0x5a4030): Part[] {
  return [box(u - w / 2, v - 0.02, u - w / 2 + 0.04, v + 0.02, 0, z1, post), box(u + w / 2 - 0.04, v - 0.02, u + w / 2, v + 0.02, 0, z1, post),
    { polys: [{ pts: [[u - w / 2, v, z0], [u + w / 2, v, z0], [u + w / 2, v, z1], [u - w / 2, v, z1]], col, two: true }], at: [u, v + 0.03] }];
}
/** a flat patch on the ground (soil, rugs, paving); never culled */
export function patch(outline: [number, number][], col: number, z = 0.6, alpha = 1, lit = false): Part {
  return { polys: [{ pts: outline.map(([u, v]) => [u, v, z] as P3), col, lit, two: true, alpha }], layer: -5 };
}
export const rect = (u0: number, v0: number, u1: number, v1: number): [number, number][] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
