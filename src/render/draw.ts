// Draws a kit model (kit.ts) onto a Pixi Graphics: turned, projected, back faces dropped, lit by facing, back to front.
import type { Graphics } from 'pixi.js';
import { turnPoint } from '../sim/world';
import { Model, P3, shade, mix } from './kit';

const TW = 64, TH = 32;
const proj = (x: number, y: number, z: number) => ({ sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) - z });
/** pixels of height per tile of ground, for working out which way a face points */
const ZT = 40;

/** a face's normal by Newell's method, in tiles (z scaled), not normalised */
function normal(p: P3[]): P3 {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const az = a[2] / ZT, bz = b[2] / ZT;
    nx += (a[1] - b[1]) * (az + bz);
    ny += (az - bz) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}
/** how bright a face is from the way it points: light from up and behind-left, as on the rest of the map */
function light(n: P3) {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const x = n[0] / l, y = n[1] / l, z = n[2] / l;
  return x * x * (x > 0 ? 0.74 : 1.06) + y * y * (y > 0 ? 0.96 : 1.1) + z * z * (z > 0 ? 1.1 : 0.6);
}

/** snow (0..1) whitens every lit face that looks up: roofs, ledges, the tops of things */
export function drawModel(g: Graphics, model: Model, defId: string, bx: number, by: number, rot: number, alpha = 1, snow = 0) {
  const turn = (u: number, v: number) => { const t = turnPoint(defId, rot, u, v); return [bx + t.x, by + t.y] as [number, number]; };
  const parts = model.map((part, i) => {
    const polys = part.polys.map(p => ({ ...p, w: p.pts.map(([u, v, z]) => { const [x, y] = turn(u, v); return [x, y, z] as P3; }) }));
    const solid = polys.filter(p => !p.two).flatMap(p => p.w);
    const all = solid.length ? solid : polys.flatMap(p => p.w);
    const c: P3 = [0, 0, 0];
    for (const q of all) { c[0] += q[0] / all.length; c[1] += q[1] / all.length; c[2] += q[2] / all.length; }
    const anchor = part.at ? turn(part.at[0], part.at[1]) : [c[0], c[1]];
    return { polys, c, depth: anchor[0] + anchor[1], layer: part.layer ?? 0, i };
  });
  // ground layers (soil, floors, rugs: layer -5 or lower) go down first, then everything back to front
  const ground = (p: { layer: number }) => (p.layer <= -5 ? 0 : 1);
  parts.sort((a, b) => ground(a) - ground(b) || (Math.abs(a.depth - b.depth) > 1e-3 ? a.depth - b.depth : a.layer - b.layer || a.i - b.i));
  for (const part of parts) {
    for (const p of part.polys) {
      let pts = p.w;
      if (pts.length < 3) continue;
      let n = normal(pts);
      if (!p.two) {
        // point the normal away from the middle of the part, then keep the face only if it turns towards the camera
        const d = (part.c[0] - pts[0][0]) * n[0] + (part.c[1] - pts[0][1]) * n[1] + ((part.c[2] - pts[0][2]) / ZT) * n[2];
        if (d > 0) { pts = [...pts].reverse(); n = [-n[0], -n[1], -n[2]]; }
        // the camera looks along -(1, 1, 32px): a face is seen when its normal leans that way
        if (n[0] + n[1] + n[2] * (32 / ZT) <= 1e-6) continue;
      }
      // a two-sided face is lit from whichever side is showing
      if (p.two && n[0] + n[1] + n[2] * (32 / ZT) < 0) n = [-n[0], -n[1], -n[2]];
      let col = p.lit === false ? p.col : shade(p.col, light(n));
      if (snow && p.lit !== false && n[2] / (Math.hypot(n[0], n[1], n[2]) || 1) > 0.45) col = mix(col, 0xeef3f6, snow * 0.85);
      const flat: number[] = [];
      for (const q of pts) { const s = proj(q[0], q[1], q[2]); flat.push(s.sx, s.sy); }
      g.poly(flat).fill({ color: col, alpha: (p.alpha ?? 1) * alpha });
    }
  }
}
