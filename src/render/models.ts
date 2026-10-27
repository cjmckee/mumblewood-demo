// Every building as a small model in its own footprint space (see kit.ts): u across the front, v from back (0) to
// front (h), where the doorway is. Drawn once facing +y; the renderer turns it for the other three directions.
import { BuildingDef } from '../sim/content';
import {
  Model, Part, P3, box, column, cone, dome, frustum, prism, runU, runV, hipRoof, gableRoof, shedRoof, onWall, door, windowOn,
  barrel, crate, logPile, sign, patch, rect, shade, ring,
} from './kit';

export interface ModelCtx {
  def: BuildingDef;
  /** unturned footprint */
  W: number; H: number;
  /** lamps are lit */
  night: boolean;
  /** someone is working there */
  busy: boolean;
  /** staged buildings: how far along */
  stage: number;
  /** is the tile under this point of the footprint (u, v, may be outside it) water? */
  water?: (u: number, v: number) => boolean;
}

const STONE = 0x8c8478, TIMBER = 0x5a4030, PLASTER = 0xe6dcc4, THATCH = 0xc9a45c;
const wallH = (c: ModelCtx) => 18 + c.def.height * 22;

/** a plain house: walls, a door in the middle of the front, windows, and a roof */
function house(c: ModelCtx, o: { u0?: number; v0?: number; u1?: number; v1?: number; h?: number; wall?: number; roof?: number; kind?: 'hip' | 'gableU' | 'gableV'; rise?: number; doorAt?: number; windows?: boolean } = {}): Part[] {
  const u0 = o.u0 ?? 0.08, v0 = o.v0 ?? 0.08, u1 = o.u1 ?? c.W - 0.08, v1 = o.v1 ?? c.H - 0.06;
  const h = o.h ?? wallH(c), wall = o.wall ?? c.def.wall, roof = o.roof ?? c.def.roof;
  const at: [number, number] = [(u0 + u1) / 2, (v0 + v1) / 2];
  const body = box(u0, v0, u1, v1, 0, h, wall);
  const doorAt = o.doorAt ?? Math.floor(c.W / 2) + 0.5 - u0;
  body.polys.push(...door(u0, v0, u1, v1, 'front', doorAt, 0.26, Math.min(19, h - 5)));
  if (o.windows !== false) {
    for (let x = 0.35; x < u1 - u0 - 0.2; x += 0.9) if (Math.abs(x - doorAt) > 0.3) body.polys.push(...windowOn(u0, v0, u1, v1, 'front', x, 0.16, h * 0.42, h * 0.42 + 8, c.night));
    for (let y = (v1 - v0) / 2; y < v1 - v0; y += 9) body.polys.push(...windowOn(u0, v0, u1, v1, 'right', y, 0.16, h * 0.42, h * 0.42 + 8, c.night));
    body.polys.push(...windowOn(u0, v0, u1, v1, 'back', (u1 - u0) / 2, 0.16, h * 0.42, h * 0.42 + 8, c.night));
    body.polys.push(...windowOn(u0, v0, u1, v1, 'left', (v1 - v0) / 2, 0.16, h * 0.42, h * 0.42 + 8, c.night));
  }
  body.at = at;
  const kind = o.kind ?? 'hip';
  const rise = o.rise ?? 10 + Math.min(u1 - u0, v1 - v0) * 12;
  const roofs = kind === 'hip' ? [hipRoof(u0, v0, u1, v1, h, rise, roof)] : gableRoof(u0, v0, u1, v1, h, rise, roof, wall, kind === 'gableU' ? 'u' : 'v');
  return [body, ...roofs.map(r => ({ ...r, at }))];
}
/** a chimney rising out of the roof: it starts at the eaves, so the roof hides its foot from behind and it stands proud in front */
const chimney = (u: number, v: number, z0: number, z1: number, col = STONE): Part => ({ ...box(u - 0.07, v - 0.07, u + 0.07, v + 0.07, z0, z1, col, shade(col, 0.5)), layer: 2 });
/** a puff of steam or smoke, flat and pale */
const puff = (u: number, v: number, z: number, s = 1): Part => ({
  polys: [0, 1, 2].map(i => ({ pts: ring(u + i * 0.04, v - i * 0.02, (0.06 + i * 0.025) * s, 8).map(([a, b]) => [a, b, z + i * 7 * s] as P3), col: 0xe8e4dc, lit: false, two: true, alpha: 0.55 - i * 0.12 })),
  at: [u, v + 0.5], layer: 5,
});
/** a flat upright shape facing the front, in the plane v = v (signs, blades, flags) */
const flatV = (pts: [number, number][], v: number, col: number, lit = true): Part => ({ polys: [{ pts: pts.map(([u, z]) => [u, v, z] as P3), col, two: true, lit }], at: [pts.reduce((n, p) => n + p[0], 0) / pts.length, v + 0.02] });
/** the same in the plane u = u, facing the side */
const flatU = (pts: [number, number][], u: number, col: number, lit = true): Part => ({ polys: [{ pts: pts.map(([v, z]) => [u, v, z] as P3), col, two: true, lit }], at: [u + 0.02, pts.reduce((n, p) => n + p[0], 0) / pts.length] });

// ---------- batch 1: the start and the researched buildings ----------
export const MODELS: Record<string, (c: ModelCtx) => Model> = {
  /** the shack: an open-fronted shelter, a back wall, a mossy roof sloping to two front posts, a bedroll inside */
  leanto: c => {
    const wall = c.def.wall, roof = c.def.roof;
    const sideProf: [number, number][] = [[0.18, 0], [0.82, 0], [0.82, 13], [0.18, 30]];
    return [
      patch(rect(0.2, 0.2, 0.8, 0.84), 0x4a3a2a, 0.5),
      box(0.16, 0.14, 0.84, 0.22, 0, 30, wall),
      runU(sideProf, 0.14, 0.2, shade(wall, 1.02)),
      runU(sideProf, 0.8, 0.86, shade(wall, 1.02)),
      box(0.26, 0.3, 0.62, 0.62, 0, 3.5, 0xb85a4a, 0xc86a58), // bedroll
      box(0.26, 0.3, 0.36, 0.62, 3.5, 6, 0xe0d4b8), // its pillow end
      { ...box(0.66, 0.66, 0.76, 0.76, 0, 5, 0x8a6038), at: [0.71, 0.75] }, // a stump seat
      shedRoof(0.12, 0.12, 0.88, 0.86, 13, 31, roof),
      { polys: [0.3, 0.55, 0.78].map(u => ({ pts: [[u - 0.05, 0.86, 12], [u + 0.05, 0.86, 12], [u, 0.86, 6]] as P3[], col: shade(roof, 0.8), two: true })), at: [0.5, 0.98], layer: 2 }, // moss hanging off the eave
    ];
  },
  /** a log hut with a chopping stump and an axe out front and a woodpile at the side */
  woodcutter: c => {
    const parts = house(c, { u0: 0.1, v0: 0.08, u1: 0.66, v1: 0.6, kind: 'gableU', rise: 14, doorAt: 0.28, windows: false });
    // log-cabin courses on the front and right walls
    for (let z = 5; z < wallH(c) - 2; z += 5) parts[0].polys.push(onWall(0.1, 0.08, 0.66, 0.6, 'front', 0, 1, z, z + 1.2, shade(c.def.wall, 0.8)), onWall(0.1, 0.08, 0.66, 0.6, 'right', 0, 1, z, z + 1.2, shade(c.def.wall, 0.8)));
    parts[0].polys.push(...door(0.1, 0.08, 0.66, 0.6, 'front', 0.28, 0.22, 16));
    return [
      ...parts,
      ...logPile(0.72, 0.94, 0.32, 3, 0.055),
      column(0.52, 0.8, 0.11, 0, 7, 0x7a5232, 0xc8a070, 9),
      flatV([[0.47, 6], [0.53, 6], [0.56, 17], [0.5, 17]], 0.8, 0x6a4a2a), // axe handle
      flatV([[0.53, 13], [0.66, 11], [0.66, 19], [0.55, 18]], 0.8, 0xb8bcc0), // axe head
      { ...flatV([[0.2, 0.5], [0.36, 0.5], [0.33, 2.5]], 0.86, 0xd8b07a), layer: -1 }, // wood chips
    ];
  },
  /** a thatched hut with baskets of berries by the door */
  forager: c => [
    ...house(c, { u0: 0.12, v0: 0.08, u1: 0.74, v1: 0.6, roof: THATCH, kind: 'hip', rise: 18, doorAt: 0.31, windows: false }),
    { ...cone(ring(0.43, 0.34, 0.07, 6), wallH(c) + 15, [0.43, 0.34, wallH(c) + 24], c.def.roof), at: [0.43, 0.34], layer: 2 }, // a berry-red finial
    ...basket(0.82, 0.38, 0.1),
    ...basket(0.66, 0.8, 0.12),
    ...basket(0.86, 0.72, 0.08),
  ],
  /** a table under a blue canopy: books, a candle, a stool */
  desk: c => {
    const canopy = c.def.roof;
    const posts = [[0.12, 0.12], [0.88, 0.12], [0.12, 0.84], [0.88, 0.84]].map(([u, v]) => box(u - 0.03, v - 0.03, u + 0.03, v + 0.03, 0, 26, TIMBER));
    return [
      patch(rect(0.08, 0.08, 0.92, 0.9), 0x6e6450, 0.5),
      ...posts,
      box(0.22, 0.24, 0.78, 0.6, 9, 11, 0x9a7048, 0xb08458), // table top
      ...[[0.25, 0.27], [0.75, 0.27], [0.25, 0.57], [0.75, 0.57]].map(([u, v]) => box(u - 0.02, v - 0.02, u + 0.02, v + 0.02, 0, 9, 0x6a4a30)),
      { ...box(0.3, 0.3, 0.46, 0.44, 11, 13, 0x8a3a3a, 0xe8dcc0), layer: 1 },
      { ...box(0.31, 0.31, 0.45, 0.43, 13, 15, 0x3a5a8a, 0xe8dcc0), layer: 1.1 },
      { ...box(0.32, 0.32, 0.44, 0.42, 15, 16.6, 0x4a7a4a, 0xe8dcc0), layer: 1.2 },
      { ...box(0.5, 0.4, 0.68, 0.54, 11, 11.8, 0xf0e8d4, 0xf4ecda), layer: 1 }, // an open book
      { ...column(0.6, 0.32, 0.025, 11, 17, 0xf0e6c8, 0xf0e6c8, 6), layer: 1 }, // candle
      { ...flatV([[0.585, 17], [0.615, 17], [0.6, 22]], 0.32, 0xffcf5a, false), layer: 2 },
      box(0.42, 0.7, 0.58, 0.82, 0, 7, 0x7a5232, 0x8a6240), // stool
      { ...box(0.08, 0.08, 0.92, 0.88, 26, 28, shade(canopy, 0.9), canopy), layer: 1 },
      { polys: [0.1, 0.3, 0.5, 0.7].map(u => ({ pts: [[u, 0.88, 26], [u + 0.2, 0.88, 26], [u + 0.1, 0.88, 21]] as P3[], col: u % 0.4 < 0.2 ? canopy : 0xe8dcc0, two: true })), at: [0.5, 0.95], layer: 2 }, // scalloped valance
    ];
  },
  /** a stone-chimneyed cookhouse with a cauldron steaming over a fire outside */
  kitchen: c => {
    const h = wallH(c);
    const parts = house(c, { u0: 0.08, v0: 0.1, u1: 1.42, v1: 0.9, kind: 'gableU', rise: 15, doorAt: 0.92 });
    return [
      ...parts,
      chimney(0.32, 0.3, h + 15 * 0.5 - 3, h + 26),
      // the cauldron, on stones, over a fire
      ...ring(1.7, 0.5, 0.2, 7).map(([u, v]) => ({ ...box(u - 0.05, v - 0.04, u + 0.05, v + 0.04, 0, 4, STONE, shade(STONE, 1.15)), at: [u, v] as [number, number] })),
      { ...flatV([[1.6, 1], [1.8, 1], [1.7, 9]], 0.5, 0xe07a2e, false), layer: 1 },
      { ...flatV([[1.64, 1], [1.76, 1], [1.7, 6]], 0.52, 0xf5c04a, false), layer: 1.1 },
      { ...dome(1.7, 0.5, 0.17, 18, -10, 0x3a3a3a, 10, 3), layer: 2 },
      { ...column(1.7, 0.5, 0.17, 16, 19, 0x3a3a3a, 0xd98a3c, 10), layer: 2.1 },
      ...[1.5, 1.9].map(u => ({ ...box(u - 0.02, 0.48, u + 0.02, 0.52, 0, 24, TIMBER), layer: 1.5 })),
      { ...box(1.5, 0.485, 1.9, 0.515, 22, 24, TIMBER), layer: 3 },
      puff(1.68, 0.5, 26, 1.1),
    ];
  },
  /** a timber hall at the back and a covered porch at the front with a long table and benches */
  dining: c => {
    const h = wallH(c);
    const back = house(c, { u0: 0.08, v0: 0.08, u1: 1.92, v1: 1.05, kind: 'gableU', rise: 18, doorAt: 0.92 });
    const posts = [0.12, 1, 1.88].map(u => box(u - 0.035, 1.82, u + 0.035, 1.89, 0, h - 6, TIMBER));
    return [
      ...back,
      patch(rect(0.1, 1.05, 1.9, 1.9), 0x9a8462, 0.6),
      ...posts,
      box(0.3, 1.36, 1.7, 1.56, 9, 11, 0x9a6a40, 0xb07a4a), // table
      ...[[0.34, 1.4], [1.66, 1.4], [0.34, 1.52], [1.66, 1.52]].map(([u, v]) => box(u - 0.02, v - 0.02, u + 0.02, v + 0.02, 0, 9, 0x6a4a30)),
      box(0.32, 1.22, 1.68, 1.3, 0, 6, 0x7a5232, 0x8a6240), // benches
      box(0.32, 1.62, 1.68, 1.7, 0, 6, 0x7a5232, 0x8a6240),
      ...[0.55, 1.0, 1.45].map(u => ({ ...column(u, 1.46, 0.06, 11, 13, 0xe8dcc0, 0xd98a3c, 8), layer: 1 })), // bowls
      { ...shedRoof(0.08, 1.05, 1.92, 1.92, h - 6, h + 2, c.def.roof, 0.04), at: [1, 1.5] },
    ];
  },
  /** a whitewashed cottage with a green-cross sign and a cot airing outside */
  clinic: c => {
    const h = wallH(c);
    const parts = house(c, { u0: 0.08, v0: 0.12, u1: 1.6, v1: 0.88, kind: 'hip', rise: 16, doorAt: 0.92 });
    // timber framing on the whitewash
    for (const a of [0.02, 0.5, 0.98]) parts[0].polys.push(onWall(0.08, 0.12, 1.6, 0.88, 'front', a - 0.015, a + 0.015, 0, h, TIMBER));
    parts[0].polys.push(onWall(0.08, 0.12, 1.6, 0.88, 'front', 0, 1, h - 3, h, TIMBER), onWall(0.08, 0.12, 1.6, 0.88, 'right', 0, 1, h - 3, h, TIMBER));
    return [
      ...parts,
      ...sign(1.8, 0.62, 0.3, 16, 30, 0xf4f1e8),
      { ...flatV([[1.77, 19], [1.83, 19], [1.83, 27], [1.77, 27]], 0.635, 0x3a9a5a, false), layer: 3 },
      { ...flatV([[1.71, 21], [1.89, 21], [1.89, 25], [1.71, 25]], 0.636, 0x3a9a5a, false), layer: 3.1 },
      box(1.66, 0.12, 1.94, 0.44, 0, 7, 0x8a6a48, 0xe8e4dc), // a cot
      box(1.66, 0.12, 1.94, 0.2, 7, 9, 0xd8d0c0),
    ];
  },
  /** a big barn of a store: its gable end to the front, double doors, a hoist beam, crates and sacks */
  storehouse: c => {
    const h = wallH(c);
    const u0 = 0.1, v0 = 0.08, u1 = 1.9, v1 = 1.7;
    const body = box(u0, v0, u1, v1, 0, h, c.def.wall);
    body.polys.push(onWall(u0, v0, u1, v1, 'front', 0.3, 0.7, 0, h - 4, 0xd8c39a), onWall(u0, v0, u1, v1, 'front', 0.32, 0.49, 0, h - 6, 0x6a4a30), onWall(u0, v0, u1, v1, 'front', 0.51, 0.68, 0, h - 6, 0x6a4a30));
    body.polys.push(onWall(u0, v0, u1, v1, 'front', 0.4, 0.45, h - 18, h - 14, 0xb08a5a), onWall(u0, v0, u1, v1, 'front', 0.55, 0.6, h - 18, h - 14, 0xb08a5a));
    for (const a of [0.12, 0.88]) body.polys.push(onWall(u0, v0, u1, v1, 'front', a - 0.02, a + 0.02, 0, h, shade(c.def.wall, 0.75)));
    for (let y = 0.2; y < 1; y += 0.2) body.polys.push(onWall(u0, v0, u1, v1, 'right', y - 0.01, y + 0.01, 0, h, shade(c.def.wall, 0.75)));
    body.at = [1, 0.9];
    const [ends, roof] = gableRoof(u0, v0, u1, v1, h, 26, c.def.roof, c.def.wall, 'v');
    ends.polys.push(onWall(u0, v0, u1, v1, 'front', 0.44, 0.56, h + 6, h + 16, 0x2e241c));
    return [
      body, { ...ends, at: [1, 0.9] }, { ...roof, at: [1, 0.9] },
      { ...box(0.97, v1, 1.03, v1 + 0.3, h + 14, h + 17, TIMBER), at: [1, 1.9], layer: 4 }, // hoist beam
      { ...flatV([[0.995, h - 2], [1.005, h - 2], [1.005, h + 14], [0.995, h + 14]], v1 + 0.27, 0xc8b88a), layer: 5 },
      { ...crate(1, v1 + 0.27, 0.07, 6, 0xb08a5a), at: [1, 2] },
      crate(0.3, 1.85, 0.12, 9), { ...crate(0.3, 1.85, 0.08, 6, 0xc09a68), at: [0.3, 1.86], layer: 1, polys: crate(0.3, 1.85, 0.08, 6, 0xc09a68).polys.map(p => ({ ...p, pts: p.pts.map(([a, b, z]) => [a, b, z + 9] as P3) })) },
      ...sack(1.62, 1.86), ...sack(1.78, 1.82),
    ];
  },
  /** a steep-roofed cottage with a chimney, a round-topped door and a window box */
  cottage: c => {
    const h = wallH(c);
    const u0 = 0.1, v0 = 0.12, u1 = 0.9, v1 = 0.86;
    const body = box(u0, v0, u1, v1, 0, h, c.def.wall);
    body.polys.push(...door(u0, v0, u1, v1, 'front', 0.26, 0.2, 18, 0x4a6a8a));
    body.polys.push(...windowOn(u0, v0, u1, v1, 'front', 0.58, 0.18, 14, 24, c.night), onWall(u0, v0, u1, v1, 'front', 0.6, 0.85, 11, 14, 0x7a5232));
    for (const [a, col] of [[0.63, 0xd66a9a], [0.7, 0xf2d24a], [0.77, 0xd66a9a], [0.82, 0xe8e0f0]] as [number, number][]) body.polys.push(onWall(u0, v0, u1, v1, 'front', a - 0.025, a + 0.025, 14, 16.5, col, false));
    body.polys.push(...windowOn(u0, v0, u1, v1, 'right', 0.37, 0.16, 14, 23, c.night), ...windowOn(u0, v0, u1, v1, 'back', 0.4, 0.16, 14, 23, c.night));
    body.at = [0.5, 0.49];
    const [ends, roof] = gableRoof(u0, v0, u1, v1, h, 26, c.def.roof, c.def.wall, 'u');
    return [body, { ...ends, at: [0.5, 0.49] }, { ...roof, at: [0.5, 0.49] }, chimney(0.78, 0.3, h + 26 * 0.49 - 3, h + 30, 0xa08a70), ...(c.night ? [] : [puff(0.8, 0.3, h + 33, 0.8)])];
  },

  // ---------- batch 2: food and drink ----------
  /** a plank deck with a boat shed and a fish-drying rack; the jetty reaches out over whichever side has water */
  dock: c => {
    const plank = 0x8a6a48, h = 26;
    const parts: Part[] = [box(0.04, 0.04, 0.96, 1.96, 0, 3, shade(plank, 0.8), plank)];
    for (let v = 0.16; v < 1.96; v += 0.16) parts.push({ ...patch(rect(0.04, v, 0.96, v + 0.015), shade(plank, 0.7), 3.1), layer: 0.5, at: [0.5, 1] });
    const shed = box(0.12, 0.1, 0.88, 0.85, 3, 3 + h, c.def.wall);
    shed.polys.push(...door(0.12, 0.1, 0.88, 0.85, 'front', 0.38, 0.24, 17));
    parts.push(shed, shedRoof(0.12, 0.1, 0.88, 0.85, 3 + h - 6, 3 + h + 4, c.def.roof));
    parts.push(...[0.2, 0.8].map(u => box(u - 0.025, 1.48, u + 0.025, 1.52, 3, 26, TIMBER)), { ...box(0.2, 1.485, 0.8, 1.515, 23, 25, TIMBER), layer: 1 });
    parts.push(...[0.3, 0.44, 0.58, 0.72].map((u, i) => ({ ...flatV([[u - 0.035, 22], [u + 0.035, 22], [u + 0.05, 15 - i % 2], [u, 10 - i % 2], [u - 0.05, 15 - i % 2]], 1.5, i % 2 ? 0x5b9cc2 : 0x9c8c7a), layer: 2 })));
    parts.push(...barrel(0.78, 1.1, 0.1, 11), column(0.28, 1.82, 0.08, 3, 5, 0xc8b88a, shade(0xc8b88a, 0.8), 8));
    // the jetty
    const wet = c.water;
    const jetty = (u0: number, v0: number, u1: number, v1: number) => [box(u0, v0, u1, v1, 0, 3, shade(plank, 0.8), plank), ...[[u0 + 0.05, v0 + 0.05], [u1 - 0.05, v0 + 0.05], [u0 + 0.05, v1 - 0.05], [u1 - 0.05, v1 - 0.05]].map(([u, v]) => column(u, v, 0.035, -8, 6, TIMBER, shade(TIMBER, 1.2), 6))];
    if (!wet || wet(1.5, 1)) parts.push(...jetty(0.96, 0.75, 1.9, 1.25));
    else if (wet(-0.5, 1)) parts.push(...jetty(-0.9, 0.75, 0.04, 1.25));
    else if (wet(0.5, -0.5)) parts.push(...jetty(0.3, -0.9, 0.7, 0.04));
    return parts;
  },
  /** a grassy mound with a stone doorway, a vent pipe, and mushrooms coming up round it */
  cellar: c => {
    const face = box(0.26, 0.58, 0.74, 0.84, 0, 18, STONE, shade(STONE, 0.9));
    face.polys.push(onWall(0.26, 0.58, 0.74, 0.84, 'front', 0.28, 0.72, 0, 12, 0x3a2e24), onWall(0.26, 0.58, 0.74, 0.84, 'front', 0.36, 0.64, 12, 14.5, 0x3a2e24));
    return [
      { ...dome(0.5, 0.44, 0.42, 0, 26, 0x5e8a40, 10, 4), at: [0.5, 0.4] },
      { ...face, at: [0.5, 0.75] },
      { ...column(0.66, 0.26, 0.035, 18, 32, 0x6a6a6a, 0x3a3a3a, 6), layer: 2 },
      ...mushroom(0.86, 0.82, 0.07, c.def.roof), ...mushroom(0.9, 0.64, 0.05, c.def.roof), ...mushroom(0.14, 0.84, 0.06, 0xb08a6a),
    ];
  },
  /** a clay beehive oven glowing at the mouth, a lean shelter behind, a pie cooling on a bench */
  pieoven: c => {
    const clay = 0xc08a5a;
    return [
      ...house(c, { u0: 0.08, v0: 0.06, u1: 0.92, v1: 0.4, h: 24, kind: 'gableU', rise: 10, windows: false, doorAt: 0.2 }),
      box(0.14, 0.44, 0.74, 0.92, 0, 8, STONE, shade(STONE, 1.1)),
      { ...dome(0.44, 0.68, 0.25, 8, 20, clay, 10, 4), at: [0.44, 0.7] },
      { ...column(0.44, 0.56, 0.035, 22, 31, shade(clay, 0.8), 0x3a2a1c, 6), layer: 3 },
      { ...flatV([[0.36, 8], [0.52, 8], [0.52, 14], [0.44, 18], [0.36, 14]], 0.935, 0x2e1a10), at: [0.44, 0.96], layer: 1 },
      { ...flatV([[0.39, 8], [0.49, 8], [0.49, 12], [0.44, 14.5], [0.39, 12]], 0.94, 0xf09a3a, false), at: [0.44, 0.97], layer: 2 },
      box(0.8, 0.5, 0.94, 0.9, 0, 9, 0x7a5232, 0x8a6240),
      { ...column(0.87, 0.7, 0.07, 9, 11.5, 0xd8a050, 0xc05050, 9), layer: 1 },
    ];
  },
  /** a tall narrow shed, its gable to the front, smoke leaking from a vent on the ridge, fish hung out to cure */
  smokehouse: c => {
    const h = wallH(c);
    const u0 = 0.18, v0 = 0.1, u1 = 0.78, v1 = 0.8;
    const body = box(u0, v0, u1, v1, 0, h, c.def.wall);
    body.polys.push(...door(u0, v0, u1, v1, 'front', 0.32 - 0.0, 0.22, 17));
    for (let a = 0.12; a < 1; a += 0.17) body.polys.push(onWall(u0, v0, u1, v1, 'front', a, a + 0.012, 0, h, shade(c.def.wall, 0.75)), onWall(u0, v0, u1, v1, 'right', a, a + 0.012, 0, h, shade(c.def.wall, 0.75)));
    body.at = [0.48, 0.45];
    const [ends, roof] = gableRoof(u0, v0, u1, v1, h, 16, c.def.roof, c.def.wall, 'v');
    return [
      body, { ...ends, at: [0.48, 0.45] }, { ...roof, at: [0.48, 0.45] },
      { ...box(0.42, 0.36, 0.54, 0.54, h + 12, h + 20, c.def.wall), layer: 2 },
      { ...hipRoof(0.42, 0.36, 0.54, 0.54, h + 20, 5, c.def.roof, 0.04), layer: 3 },
      puff(0.48, 0.42, h + 28, 1.2),
      ...[0.2, 0.7].map(v => box(0.86, v - 0.02, 0.9, v + 0.02, 0, 22, TIMBER)),
      { ...box(0.86, 0.2, 0.9, 0.7, 20, 22, TIMBER), layer: 1 },
      ...[0.3, 0.44, 0.58].map(v => ({ ...flatU([[v - 0.035, 20], [v + 0.035, 20], [v + 0.045, 13], [v, 8.5], [v - 0.045, 13]], 0.88, 0x9c7a5a), layer: 2 })),
    ];
  },
  /** a windmill: a tapering tower with a conical cap and four sails, and a little store beside it */
  mill: c => {
    const wall = c.def.wall, tu = 0.52, tv = 0.5, top = 54;
    const sails: Part[] = [];
    const hub: [number, number] = [tu, top + 2];
    for (const a of [20, 110, 200, 290]) {
      const r = (a * Math.PI) / 180, cu = Math.cos(r) / 40, cz = Math.sin(r), pu = -Math.sin(r) / 40, pz = Math.cos(r);
      const at = (l: number, s: number): [number, number] => [hub[0] + cu * l + pu * s, hub[1] + cz * l + pz * s];
      sails.push({ ...flatV([at(3, -1), at(36, -1), at(36, 1), at(3, 1)], 0.93, TIMBER), layer: 3 });
      sails.push({ ...flatV([at(9, 1.5), at(35, 1.5), at(35, 9), at(9, 9)], 0.925, 0xe8dcc0), layer: 2.9 });
    }
    const store = house(c, { u0: 1.06, v0: 0.18, u1: 1.9, v1: 0.84, h: 24, kind: 'gableU', rise: 11, doorAt: 0.44, windows: false });
    return [
      ...store,
      { ...frustum(tu, tv, 0.36, 0.25, 0, top, wall), at: [tu, tv] },
      { ...flatV([[tu - 0.07, 0], [tu + 0.07, 0], [tu + 0.07, 15], [tu - 0.07, 15]], 0.858, 0x3a2a1c), at: [tu, 0.9], layer: 1 },
      { ...cone(ring(tu, tv, 0.3, 8), top, [tu, tv, top + 18], c.def.roof), at: [tu, tv], layer: 1 },
      { ...column(tu, 0.86, 0.045, top - 2, top + 6, TIMBER, TIMBER, 6), at: [tu, 0.9], layer: 2 },
      ...sails,
      ...sack(1.82, 0.93),
    ];
  },
  /** a shopfront with a striped awning over loaves on the sill, a hanging sign, and a chimney */
  bakery: c => {
    const h = wallH(c), u0 = 0.08, v0 = 0.1, u1 = 1.92, v1 = 0.78;
    const parts = house(c, { u0, v0, u1, v1, kind: 'gableU', rise: 15, windows: false });
    parts[0].polys.push(...windowOn(u0, v0, u1, v1, 'front', 0.52, 0.5, 9, 20, c.night), ...windowOn(u0, v0, u1, v1, 'right', 0.34, 0.16, 9, 19, c.night));
    const awning: Part[] = [0.2, 0.37, 0.54, 0.71].map((u, i) => ({ ...runU([[0.78, 26], [1.0, 19], [1.0, 20.5], [0.78, 27.5]], u, u + 0.17, i % 2 ? 0xe8dcc0 : c.def.roof), at: [u + 0.08, 0.95], layer: 2 }));
    return [
      ...parts,
      chimney(1.7, 0.3, h + 15 * 0.41 - 3, h + 26),
      box(0.2, 0.78, 0.88, 0.92, 0, 8, 0x7a5232, 0x8a6240),
      ...[0.3, 0.46, 0.62, 0.78].map(u => ({ ...dome(u, 0.85, 0.06, 8, 4, 0xc89048, 6, 2), layer: 1 })),
      ...awning,
      { ...box(1.86, 0.78, 1.89, 1.02, 27, 28.5, TIMBER), layer: 3, at: [1.88, 0.95] },
      { ...flatU([[0.84, 13], [1.0, 13], [1.0, 26], [0.84, 26]], 1.875, 0xe8d8b0), layer: 3.1, at: [1.9, 0.95] },
      { ...flatU([[0.86, 16.5], [0.98, 16.5], [0.98, 21], [0.86, 21]], 1.88, 0xc89048), layer: 3.2, at: [1.91, 0.95] },
    ];
  },
  /** raised beds in neat rows, a berry bush in the corner and a watering can */
  herbgarden: c => {
    const wood = 0x8a6038, soil = 0x4a3626;
    const parts: Part[] = [];
    for (const [v0, v1] of [[0.1, 0.4], [0.5, 0.8]]) {
      parts.push(box(0.1, v0, 0.78, v1, 0, 6, wood, soil));
      for (let u = 0.18; u < 0.74; u += 0.14) {
        const g = [0x5a9a4a, 0x6aa84a, 0x4a8a5a, 0x7aa860][Math.round(u * 10) % 4];
        parts.push({ ...cone(ring(u, (v0 + v1) / 2, 0.055, 5), 6, [u, (v0 + v1) / 2, 15], g), at: [u, (v0 + v1) / 2], layer: 1 });
      }
    }
    parts.push({ ...dome(0.86, 0.22, 0.1, 0, 11, 0x3f6b33, 7, 2), at: [0.86, 0.22] });
    parts.push(...[[0.82, 0.18], [0.9, 0.25], [0.85, 0.29]].map(([u, v]) => ({ ...column(u, v, 0.018, 8, 10, 0xc8385a, 0xd85a7a, 5), layer: 1, at: [u, v + 0.1] as [number, number] })));
    parts.push(column(0.86, 0.88, 0.055, 0, 7, 0x6a8a9a, 0x5a7a8a, 8), { ...flatV([[0.9, 4], [0.96, 9], [0.95, 10], [0.89, 6]], 0.88, 0x6a8a9a), layer: 1 });
    void c;
    return parts;
  },
  /** a narrow shop with herbs drying under the eaves and bottles on a bench */
  apothecary: c => {
    const h = wallH(c), u0 = 0.12, v0 = 0.1, u1 = 0.88, v1 = 0.76;
    const parts = house(c, { u0, v0, u1, v1, kind: 'gableV', rise: 18, windows: false, wall: c.def.wall });
    parts[0].polys.push(...windowOn(u0, v0, u1, v1, 'right', 0.33, 0.16, 12, 21, c.night), ...windowOn(u0, v0, u1, v1, 'front', 0.15, 0.1, 12, 20, c.night));
    parts[0].polys.push(onWall(u0, v0, u1, v1, 'front', 0.36, 0.64, 0, 17, 0x3a6a4a));
    return [
      ...parts,
      ...[0.2, 0.3, 0.68, 0.8].map((u, i) => ({ ...flatV([[u - 0.035, h - 1], [u + 0.035, h - 1], [u, h - 10]], v1 + 0.04, i % 2 ? 0x5a9a4a : 0x7aa860), layer: 2 })),
      box(0.9, 0.2, 0.98, 0.62, 0, 8, 0x7a5232, 0x8a6240),
      ...[[0.94, 0.28, 0x6a5aa8], [0.94, 0.4, 0x8ab89a], [0.94, 0.52, 0x6a5aa8]].map(([u, v, col]) => ({ ...column(u, v, 0.028, 8, 14, col, shade(col, 1.2), 6), layer: 1, at: [u + 0.05, v] as [number, number] })),
    ];
  },
  /** a brewhouse beside a copper kettle, with barrels by the door */
  brewery: c => {
    const copper = 0xb8703a;
    return [
      ...house(c, { u0: 0.8, v0: 0.1, u1: 1.92, v1: 0.8, kind: 'gableU', rise: 15, doorAt: 0.7 }),
      { ...frustum(0.4, 0.46, 0.3, 0.26, 0, 26, copper, shade(copper, 1.1), 10), at: [0.4, 0.46] },
      { ...dome(0.4, 0.46, 0.26, 26, 10, copper, 10, 3), at: [0.4, 0.46], layer: 1 },
      { ...column(0.4, 0.46, 0.04, 34, 44, shade(copper, 0.9), copper, 6), at: [0.4, 0.46], layer: 2 },
      { ...box(0.4, 0.44, 0.8, 0.48, 40, 43, shade(copper, 0.9)), at: [0.6, 0.46], layer: 3 },
      ...ring(0.4, 0.46, 0.33, 6).map(([u, v]) => ({ ...box(u - 0.04, v - 0.03, u + 0.04, v + 0.03, 0, 3, STONE), at: [u, v] as [number, number] })),
      ...barrel(0.28, 0.88, 0.1, 12), ...barrel(0.52, 0.9, 0.1, 12), ...barrel(1.82, 0.9, 0.08, 10),
      puff(0.42, 0.46, 46, 0.9),
    ];
  },
  /** an open shed over a big wooden screw press, with a crate of apples */
  ciderpress: c => {
    const posts = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.62], [0.9, 0.62]].map(([u, v]) => box(u - 0.03, v - 0.03, u + 0.03, v + 0.03, 0, 26, TIMBER));
    const [, roof] = gableRoof(0.1, 0.1, 0.9, 0.62, 26, 12, c.def.roof, c.def.wall, 'u');
    const wood = 0x8a6038;
    return [
      ...posts,
      { ...frustum(0.5, 0.38, 0.22, 0.24, 0, 9, wood, shade(wood, 0.6), 10), at: [0.5, 0.38] },
      ...[0.3, 0.7].map(u => ({ ...box(u - 0.03, 0.36, u + 0.03, 0.4, 0, 22, shade(wood, 0.9)), at: [u, 0.38] as [number, number], layer: 1 })),
      { ...box(0.27, 0.355, 0.73, 0.405, 20, 23, shade(wood, 0.9)), at: [0.5, 0.38], layer: 2 },
      { ...column(0.5, 0.38, 0.025, 11, 22, 0x6a6a62, 0x6a6a62, 6), at: [0.5, 0.38], layer: 2 },
      { ...box(0.36, 0.26, 0.64, 0.5, 9, 12, shade(wood, 1.1)), at: [0.5, 0.38], layer: 1 },
      { ...roof, at: [0.5, 0.36] },
      ...appleCrate(0.36, 0.84), ...appleCrate(0.68, 0.86),
    ];
  },
  /** a picker's hut with a ladder against it and crates of apples */
  orchard: c => {
    const u0 = 0.08, v0 = 0.08, u1 = 0.62, v1 = 0.58;
    const ladder: Part = { polys: [], at: [0.76, 0.35], layer: 1 };
    for (const v of [0.24, 0.42]) ladder.polys.push({ pts: [[0.64, v, 30], [0.64, v + 0.025, 30], [0.84, v + 0.025, 0], [0.84, v, 0]], col: 0x9a7044, two: true });
    for (let t = 0.12; t < 1; t += 0.2) { const u = 0.64 + 0.2 * t, z = 30 * (1 - t); ladder.polys.push({ pts: [[u, 0.24, z], [u, 0.445, z], [u, 0.445, z + 1.3], [u, 0.24, z + 1.3]], col: 0xb08458, two: true }); }
    return [
      ...house(c, { u0, v0, u1, v1, kind: 'gableU', rise: 12, doorAt: 0.42, windows: false }),
      ladder,
      ...appleCrate(0.3, 0.84), ...appleCrate(0.62, 0.84), ...appleCrate(0.86, 0.72),
    ];
  },
  /** straw skeps on a low bench, with a little honey shed behind */
  apiary: c => {
    const straw = 0xd4a84a;
    const skep = (u: number, v: number): Part[] => [
      { ...dome(u, v, 0.13, 8, 16, straw, 8, 3), at: [u, v] },
      ...[11, 15, 19].map(z => ({ polys: ring(u, v, 0.135 * Math.cos(((z - 8) / 16) * (Math.PI / 2)) + 0.003, 8).map((a, i, arr) => { const b = arr[(i + 1) % arr.length]; return { pts: [[a[0], a[1], z], [b[0], b[1], z], [b[0], b[1], z + 1.2], [a[0], a[1], z + 1.2]] as P3[], col: shade(straw, 0.75) }; }), at: [u, v] as [number, number], layer: 1 })),
      { ...flatV([[u - 0.03, 8], [u + 0.03, 8], [u + 0.03, 11], [u - 0.03, 11]], v + 0.13, 0x3a2a1c), layer: 2 },
    ];
    return [
      ...house(c, { u0: 0.5, v0: 0.06, u1: 0.94, v1: 0.4, h: 22, kind: 'gableU', rise: 10, windows: false, doorAt: 0.2 }),
      box(0.08, 0.5, 0.92, 0.66, 0, 8, 0x7a5232, 0x8a6240),
      ...skep(0.22, 0.58), ...skep(0.5, 0.58), ...skep(0.78, 0.58),
      { polys: [[0.3, 0.8, 22], [0.6, 0.9, 28], [0.7, 0.75, 19], [0.42, 0.95, 25]].map(([u, v, z]) => ({ pts: [[u, v, z], [u + 0.02, v, z], [u + 0.02, v, z + 1.6], [u, v, z + 1.6]] as P3[], col: 0x2a2418, lit: false, two: true })), at: [0.5, 1], layer: 5 },
    ];
  },
  /** rows of barley on dark soil, and a scarecrow keeping watch */
  field: c => {
    const soil = 0x5e4630, gold = c.def.roof;
    const parts: Part[] = [patch(rect(0.04, 0.04, 1.96, 1.96), soil, 0.4)];
    for (let u = 0.16; u < 1.9; u += 0.2) {
      parts.push({ ...runV([[u - 0.06, 0.5], [u + 0.06, 0.5], [u, 9]], 0.1, 1.9, shade(gold, 0.85), gold), at: [u, 1] });
      const zig: P3[] = [];
      for (let v = 0.1; v <= 1.9; v += 0.06) zig.push([u, v, 9], [u, v + 0.03, 13]);
      zig.push([u, 1.9, 9]);
      parts.push({ polys: [{ pts: [...zig, [u, 1.9, 8], [u, 0.1, 8]], col: shade(gold, 1.12), two: true }], at: [u + 0.001, 1], layer: 1 });
    }
    const su = 1.08, sv = 1.0;
    parts.push(
      { ...box(su - 0.02, sv - 0.02, su + 0.02, sv + 0.02, 0, 34, TIMBER), at: [su, sv + 0.1], layer: 2 },
      { ...flatV([[su - 0.18, 25], [su + 0.18, 25], [su + 0.18, 27], [su - 0.18, 27]], sv + 0.03, TIMBER), at: [su, sv + 0.12], layer: 3 },
      { ...box(su - 0.08, sv - 0.04, su + 0.08, sv + 0.04, 15, 28, 0x6a7aa8), at: [su, sv + 0.12], layer: 3.1 },
      { ...column(su, sv, 0.06, 28, 36, 0xe8d8a8, 0xe8d8a8, 7), at: [su, sv + 0.12], layer: 3.2 },
      { ...cone(ring(su, sv, 0.12, 8), 35, [su, sv, 43], 0xb89a50), at: [su, sv + 0.12], layer: 3.3 },
    );
    return parts;
  },

  // ---------- batch 3: materials, comforts, the Hall ----------
  /** an open saw shed over a log on trestles, with sawn planks stacked beside it */
  sawmill: c => {
    const wood = 0x8a6038, plank = 0xd2a96a;
    const posts = [[0.12, 0.12], [1.1, 0.12], [0.12, 0.8], [1.1, 0.8]].map(([u, v]) => box(u - 0.035, v - 0.035, u + 0.035, v + 0.035, 0, 30, TIMBER));
    const parts: Part[] = [
      ...posts,
      ...[0.3, 0.92].map(u => ({ ...prism([[u - 0.06, 0.34], [u + 0.06, 0.34], [u + 0.06, 0.58], [u - 0.06, 0.58]], 0, 9, 0x6a4a30), at: [u, 0.46] as [number, number] })),
      { ...runU(Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return [0.46 + Math.cos(a) * 0.1, 15 + Math.sin(a) * 5.5] as [number, number]; }), 0.14, 1.08, 0x7f5634, 0xd8b07a), at: [0.6, 0.46], layer: 1 },
      { ...flatV(Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; const r = i % 2 ? 0.115 : 0.13; return [0.72 + Math.cos(a) * r, 21 + Math.sin(a) * r * 34] as [number, number]; }), 0.46, 0xc8ccd0), layer: 2 },
      { ...flatV(Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return [0.72 + Math.cos(a) * 0.02, 21 + Math.sin(a) * 0.7] as [number, number]; }), 0.461, 0x5a5a5a), layer: 2.1 },
      shedRoof(0.12, 0.12, 1.1, 0.8, 26, 34, c.def.roof),
    ];
    for (let i = 0; i < 4; i++) parts.push({ ...box(1.3, 0.2 + 0, 1.88, 0.2 + 0.5, i * 3, i * 3 + 2.6, shade(plank, 0.9 + (i % 2) * 0.06), shade(plank, 1.1)), at: [1.59, 0.45], layer: i * 0.1 });
    parts.push(...logPile(1.3, 1.86, 0.84, 2, 0.06));
    void wood;
    return parts;
  },
  /** a brick bottle kiln glowing at the firebox, with fired bricks stacked by it */
  kiln: c => {
    const brick = c.def.wall;
    return [
      { ...frustum(0.44, 0.44, 0.36, 0.27, 0, 26, brick, shade(brick, 0.9), 10), at: [0.44, 0.44] },
      { ...frustum(0.44, 0.44, 0.27, 0.12, 26, 46, shade(brick, 1.02), shade(brick, 0.9), 10), at: [0.44, 0.44], layer: 1 },
      { ...frustum(0.44, 0.44, 0.14, 0.14, 46, 50, c.def.roof, 0x2a201a, 10), at: [0.44, 0.44], layer: 2 },
      { ...flatV([[0.36, 0], [0.52, 0], [0.52, 9], [0.44, 13], [0.36, 9]], 0.8, 0x2e1a10), at: [0.44, 0.84], layer: 1 },
      { ...flatV([[0.38, 0], [0.5, 0], [0.5, 7], [0.44, 10], [0.38, 7]], 0.805, 0xf08a3a, false), at: [0.44, 0.85], layer: 2 },
      puff(0.46, 0.44, 54, 1),
      ...[0, 1, 2].map(i => ({ ...box(0.7, 0.62, 0.92, 0.9, i * 3.2, i * 3.2 + 3, i % 2 ? 0xa8442e : 0xb04a32, shade(0xb04a32, 1.2)), at: [0.81, 0.76] as [number, number], layer: i * 0.1 })),
    ];
  },
  /** a workshop shed with a bench out front, a saw on it, and bundles of reeds leaning on the wall */
  carpenter: c => {
    const parts = house(c, { u0: 0.08, v0: 0.08, u1: 0.66, v1: 0.5, h: 26, kind: 'gableU', rise: 12, doorAt: 0.42, windows: false });
    return [
      ...parts,
      box(0.56, 0.62, 0.94, 0.84, 9, 11, 0x9a7048, 0xb08458),
      ...[[0.59, 0.65], [0.91, 0.65], [0.59, 0.81], [0.91, 0.81]].map(([u, v]) => box(u - 0.02, v - 0.02, u + 0.02, v + 0.02, 0, 9, 0x6a4a30)),
      { ...box(0.6, 0.66, 0.9, 0.74, 11, 12.5, 0xd2a96a, 0xe0bc80), layer: 1 },
      { ...flatV([[0.62, 12.5], [0.8, 12.5], [0.82, 16], [0.62, 14.5]], 0.79, 0xc8ccd0), layer: 2 },
      { ...flatV([[0.8, 13.5], [0.88, 13.5], [0.88, 16.5], [0.82, 16.5]], 0.79, 0x6a4a30), layer: 2.1 },
      ...[0.16, 0.26, 0.36].map((u, i) => ({ ...cone(ring(u, 0.58, 0.04, 5), 0, [u + 0.02, 0.54, 24 + i * 2], 0xb8b070), at: [u, 0.62] as [number, number] })),
      column(0.24, 0.84, 0.09, 0, 8, 0xc8a868, shade(0xc8a868, 0.6), 9),
    ];
  },
  /** a dug clay pit with a windlass and bucket over it, a shovel in the spoil heap, and blocks of clay */
  claypit: c => {
    const clay = 0xb0603a, wet = 0x7a4228;
    return [
      patch(rect(0.1, 0.1, 0.62, 0.62), wet, 0.4),
      patch([[0.18, 0.18], [0.54, 0.18], [0.54, 0.54], [0.18, 0.54]], shade(wet, 0.6), 0.45),
      { ...prism([[0.1, 0.1], [0.62, 0.1], [0.62, 0.16], [0.1, 0.16]], 0, 3, clay), layer: -4 },
      ...[0.12, 0.6].map(u => box(u - 0.025, 0.34, u + 0.025, 0.38, 0, 22, TIMBER)),
      { ...runU(ring(0.36, 20, 0.035, 6).map(([v, z]) => [v, 20 + (z - 20) * 30] as [number, number]), 0.12, 0.6, 0x7a5a3a), layer: 1, at: [0.36, 0.36] },
      { ...flatV([[0.355, 9], [0.365, 9], [0.365, 19], [0.355, 19]], 0.36, 0xc8b88a), layer: 1.1 },
      { ...frustum(0.36, 0.36, 0.06, 0.07, 3, 9, 0x8a6038, wet, 8), layer: 1.2, at: [0.36, 0.37] },
      { ...dome(0.82, 0.3, 0.13, 0, 9, clay, 8, 2), at: [0.82, 0.3] },
      { ...flatV([[0.8, 8], [0.84, 8], [0.85, 22], [0.79, 22]], 0.3, 0x6a4a2a), layer: 1, at: [0.82, 0.32] },
      { ...flatV([[0.77, 2], [0.87, 2], [0.86, 9], [0.78, 9]], 0.3, 0x9a9ea2), layer: 1.1, at: [0.82, 0.32] },
      ...[0, 1].flatMap(i => [0, 1].map(j => ({ ...box(0.62 + j * 0.15, 0.68, 0.75 + j * 0.15, 0.9, i * 4, i * 4 + 3.6, clay, shade(clay, 1.15)), at: [0.76, 0.8] as [number, number], layer: i * 0.1 + j * 0.01 }))),
      void c,
    ].filter(Boolean) as Part[];
  },
  /** a jettied inn with a tankard sign, a table and benches out front, barrels by the door */
  tavern: c => {
    const h = wallH(c), u0 = 0.1, v0 = 0.1, u1 = 1.9, v1 = 1.3, low = h * 0.52;
    const lower = box(u0, v0, u1, v1, 0, low, 0x7a5236);
    lower.polys.push(...door(u0, v0, u1, v1, 'front', 1.4, 0.3, 18, 0x4a2e1c), ...windowOn(u0, v0, u1, v1, 'front', 0.5, 0.36, 8, 18, c.night), ...windowOn(u0, v0, u1, v1, 'right', 0.6, 0.3, 8, 18, c.night));
    const upper = box(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.06, low, h, PLASTER);
    for (const a of [0.02, 0.2, 0.4, 0.6, 0.8, 0.98]) upper.polys.push(onWall(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.06, 'front', a - 0.008, a + 0.008, low, h, TIMBER));
    for (const a of [0.02, 0.5, 0.98]) upper.polys.push(onWall(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.06, 'right', a - 0.012, a + 0.012, low, h, TIMBER));
    upper.polys.push(...windowOn(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.06, 'front', 0.6, 0.22, low + 5, low + 13, c.night), ...windowOn(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.06, 'front', 1.3, 0.22, low + 5, low + 13, c.night));
    upper.polys.push(...windowOn(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.06, 'right', 0.66, 0.2, low + 5, low + 13, c.night));
    const at: [number, number] = [1, 0.7];
    const [ends, roof] = gableRoof(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.06, h, 24, c.def.roof, PLASTER, 'u');
    return [
      { ...lower, at }, { ...upper, at, layer: 0.5 }, { ...ends, at, layer: 0.6 }, { ...roof, at },
      chimney(0.4, 0.4, h + 24 * 0.55 - 3, h + 30),
      { ...box(0.72, 1.36, 0.75, 1.62, low + 10, low + 11.5, TIMBER), at: [0.74, 1.6], layer: 2 },
      { ...flatU([[1.42, low - 6], [1.6, low - 6], [1.6, low + 8], [1.42, low + 8]], 0.735, 0x2f4a3a), at: [0.76, 1.6], layer: 3 },
      { ...flatU([[1.46, low - 3], [1.55, low - 3], [1.55, low + 5], [1.46, low + 5]], 0.74, 0xd6a33c), at: [0.77, 1.6], layer: 3.1 },
      box(0.3, 1.58, 1.0, 1.76, 9, 11, 0x9a6a40, 0xb07a4a),
      ...[[0.33, 1.61], [0.97, 1.61], [0.33, 1.73], [0.97, 1.73]].map(([u, v]) => box(u - 0.02, v - 0.02, u + 0.02, v + 0.02, 0, 9, 0x6a4a30)),
      box(0.3, 1.82, 1.0, 1.9, 0, 6, 0x7a5232, 0x8a6240),
      ...[0.48, 0.8].map(u => ({ ...column(u, 1.67, 0.035, 11, 15, 0xc89048, 0xf0e0b0, 6), layer: 1 })),
      ...barrel(1.78, 1.5, 0.1, 12), ...barrel(1.84, 1.76, 0.09, 11),
    ];
  },
  /** a stone bathhouse with steaming vents, and a big wooden tub steaming outside */
  bathhouse: c => {
    const h = wallH(c);
    const parts = house(c, { u0: 0.78, v0: 0.1, u1: 1.92, v1: 0.84, kind: 'hip', rise: 14, doorAt: 0.72 });
    const wood = 0x8a6038;
    return [
      ...parts,
      ...[1.08, 1.6].map(u => ({ ...box(u - 0.05, 0.42, u + 0.05, 0.52, h + 6, h + 12, STONE, 0x3a3a3a), layer: 2 })),
      puff(1.1, 0.46, h + 15, 0.8), puff(1.62, 0.46, h + 15, 0.8),
      { ...frustum(0.36, 0.46, 0.27, 0.3, 0, 11, wood, 0x8ac8d8, 10), at: [0.36, 0.46] },
      ...[3.5, 8].map(z => ({ polys: ring(0.36, 0.46, 0.275 + (z / 11) * 0.03 + 0.004, 10).map((a, i, arr) => { const b = arr[(i + 1) % arr.length]; return { pts: [[a[0], a[1], z], [b[0], b[1], z], [b[0], b[1], z + 1.3], [a[0], a[1], z + 1.3]] as P3[], col: 0x4a3a2a }; }), at: [0.36, 0.46] as [number, number], layer: 1 })),
      puff(0.34, 0.46, 14, 1.1),
      ...[0.12, 0.62].map(u => box(u - 0.02, 0.9, u + 0.02, 0.94, 0, 20, TIMBER)),
      { ...flatV([[0.12, 19], [0.62, 19], [0.62, 19.6], [0.12, 19.6]], 0.92, 0xd8c8a0), layer: 1 },
      ...[[0.2, 0xe8e4dc], [0.36, 0x7ab0c0], [0.5, 0xe8e4dc]].map(([u, col]) => ({ ...flatV([[u - 0.06, 19], [u + 0.06, 19], [u + 0.06, 11], [u - 0.06, 11]], 0.92, col), layer: 2 })),
    ];
  },
  /** a little stage: planks, a curtain, bunting, and a lute on a stool */
  stage: c => {
    const wood = 0x9a7048, curtain = c.def.roof;
    const parts: Part[] = [
      box(0.08, 0.08, 0.92, 0.72, 0, 8, shade(wood, 0.85), wood),
      box(0.36, 0.72, 0.64, 0.84, 0, 4, shade(wood, 0.85), wood),
      ...[0.1, 0.9].map(u => box(u - 0.025, 0.1, u + 0.025, 0.14, 8, 40, TIMBER)),
      { ...box(0.08, 0.1, 0.92, 0.14, 38, 41, TIMBER), layer: 1 },
      { polys: [0.12, 0.26, 0.4, 0.54, 0.68, 0.82].map((u, i) => ({ pts: [[u, 0.14, 8], [u + 0.14, 0.14, 8], [u + 0.14, 0.14, 38], [u, 0.14, 38]] as P3[], col: i % 2 ? shade(curtain, 0.9) : curtain, two: true })), at: [0.5, 0.15] },
      ...[0.1, 0.9].map(u => box(u - 0.02, 0.68, u + 0.02, 0.72, 8, 26, TIMBER)),
      { polys: [0, 1, 2, 3, 4, 5].map(i => { const u = 0.1 + i * 0.133; return { pts: [[u, 0.7, 25 - Math.sin((i / 6) * Math.PI) * 3], [u + 0.133, 0.7, 25 - Math.sin(((i + 1) / 6) * Math.PI) * 3], [u + 0.066, 0.7, 19 - Math.sin(((i + 0.5) / 6) * Math.PI) * 3]] as P3[], col: [0xe8b84a, 0x4f8fb0, 0xd66a9a][i % 3], two: true }; }), at: [0.5, 0.75], layer: 2 },
      { ...box(0.56, 0.32, 0.7, 0.46, 8, 15, 0x7a5232, 0x8a6240), layer: 1 },
      { ...flatV([[0.58, 15], [0.68, 15], [0.7, 19], [0.63, 21], [0.56, 19]], 0.39, 0xc8904a), layer: 2, at: [0.63, 0.42] },
      { ...flatV([[0.625, 21], [0.64, 21], [0.66, 30], [0.645, 30]], 0.39, 0x5a3a24), layer: 2.1, at: [0.63, 0.42] },
    ];
    return parts;
  },
  /** the Crown's Hall: a stone plinth, then timber-framed walls, then the roof and bell tower, then the Crown's banners */
  hall: c => {
    const s = c.stage, h = wallH(c);
    const parts: Part[] = [{ ...box(0.08, 0.08, 2.92, 2.92, 0, 6, STONE, shade(STONE, 1.12)), layer: -5 }];
    if (s < 1) return parts;
    const u0 = 0.25, v0 = 0.25, u1 = 2.75, v1 = 2.3, at: [number, number] = [1.5, 1.3];
    const body = box(u0, v0, u1, v1, 6, 6 + h, c.def.wall);
    for (const a of [0.02, 0.16, 0.3, 0.7, 0.84, 0.98]) body.polys.push(onWall(u0, v0, u1, v1, 'front', a - 0.006, a + 0.006, 6, 6 + h, TIMBER));
    for (const a of [0.02, 0.25, 0.5, 0.75, 0.98]) body.polys.push(onWall(u0, v0, u1, v1, 'right', a - 0.008, a + 0.008, 6, 6 + h, TIMBER));
    body.polys.push(onWall(u0, v0, u1, v1, 'front', 0, 1, 6 + h * 0.5, 7.5 + h * 0.5, TIMBER), onWall(u0, v0, u1, v1, 'right', 0, 1, 6 + h * 0.5, 7.5 + h * 0.5, TIMBER));
    for (const a of [0.23, 0.77]) body.polys.push(...windowOn(u0, v0, u1, v1, 'front', a * (u1 - u0), 0.22, 14, 28, c.night));
    for (const a of [0.37, 0.63]) body.polys.push(...windowOn(u0, v0, u1, v1, 'right', a * (v1 - v0), 0.2, 14, 28, c.night));
    parts.push({ ...body, at });
    if (s < 2) return parts;
    const [ends, roof] = gableRoof(u0, v0, u1, v1, 6 + h, 30, c.def.roof, c.def.wall, 'u');
    const tower = box(1.12, 2.0, 1.88, 2.7, 0, 6 + h + 26, 0xd8c8a0);
    tower.polys.push(...door(1.12, 2.0, 1.88, 2.7, 'front', 0.38, 0.36, 24, 0x5a3420), ...windowOn(1.12, 2.0, 1.88, 2.7, 'front', 0.38, 0.16, h + 10, h + 22, c.night), ...windowOn(1.12, 2.0, 1.88, 2.7, 'right', 0.35, 0.14, h + 10, h + 22, c.night));
    parts.push({ ...ends, at }, { ...roof, at }, { ...tower, at: [1.5, 2.35] }, { ...hipRoof(1.12, 2.0, 1.88, 2.7, 6 + h + 26, 34, c.def.roof, 0.08), at: [1.5, 2.35] });
    if (s < 3) return parts;
    const top = 6 + h + 26 + 34;
    parts.push(
      { ...box(1.49, 2.34, 1.51, 2.36, top - 4, top + 16, 0x4a3a2a), at: [1.5, 2.36], layer: 3 },
      { ...flatU([[2.35, top + 15.5], [2.75, top + 13], [2.35, top + 9]], 1.5, 0x2f4a8a), at: [1.52, 2.4], layer: 4 },
      ...[0.55, 2.45].flatMap(u => [
        { ...flatV([[u - 0.12, 14], [u + 0.12, 14], [u + 0.12, 40], [u, 34], [u - 0.12, 40]].map(([a, z]) => [a, z] as [number, number]), v1 + 0.02, 0x2f4a8a), at: [u, v1 + 0.05] as [number, number], layer: 2 },
        { ...flatV([[u - 0.12, 38], [u + 0.12, 38], [u + 0.12, 40], [u - 0.12, 40]], v1 + 0.025, 0xe8b84a, false), at: [u, v1 + 0.06] as [number, number], layer: 2.1 },
        { ...flatV([[u - 0.04, 24], [u, 28], [u + 0.04, 24], [u, 20]], v1 + 0.025, 0xe8b84a, false), at: [u, v1 + 0.06] as [number, number], layer: 2.2 },
      ]),
      ...[0.83, 2.17].map(u => ({ ...box(u - 0.15, v1 + 0.02, u + 0.15, v1 + 0.12, 12, 15, 0x7a5232), at: [u, v1 + 0.1] as [number, number], layer: 1 })),
      ...[0.73, 0.83, 0.93, 2.07, 2.17, 2.27].map((u, i) => ({ ...column(u, v1 + 0.07, 0.03, 15, 17.5, [0xd66a9a, 0xf2d24a, 0xe8e0f0][i % 3], [0xd66a9a, 0xf2d24a, 0xe8e0f0][i % 3], 5), at: [u, v1 + 0.12] as [number, number], layer: 2 })),
    );
    return parts;
  },
  /** a bench, its back to the back of its tile */
  bench: () => [
    ...[[0.2, 0.46], [0.8, 0.46], [0.2, 0.6], [0.8, 0.6]].map(([u, v]) => box(u - 0.025, v - 0.025, u + 0.025, v + 0.025, 0, 7, 0x5a4029)),
    { ...box(0.14, 0.42, 0.86, 0.64, 7, 9, 0x8a6038, 0xa07448), layer: 1 },
    { ...box(0.14, 0.4, 0.86, 0.45, 9, 18, 0x8a6038, 0xa07448), layer: 2, at: [0.5, 0.42] },
  ],
  /** a statue of somebody's disappointed grandfather, pointing sternly at the front */
  statue: () => {
    const st = 0xb8b8b0;
    return [
      box(0.22, 0.22, 0.78, 0.78, 0, 12, 0x8a8a82, 0xa8a8a0),
      { ...frustum(0.5, 0.5, 0.13, 0.09, 12, 34, st, st, 8), layer: 1 },
      { ...dome(0.5, 0.5, 0.1, 33, 10, 0xc4c4bc, 8, 3), layer: 2 },
      { ...cone(ring(0.5, 0.5, 0.12, 8), 40, [0.5, 0.5, 47], 0x9a9a92), layer: 3 },
      { ...box(0.47, 0.52, 0.53, 0.8, 26, 28.5, 0xb0b0a8), layer: 2.5, at: [0.5, 0.66] },
    ];
  },
};

function basket(u: number, v: number, r: number): Part[] {
  return [
    column(u, v, r, 0, r * 70, 0xc8a868, shade(0xc8a868, 0.6), 9, r * 0.9),
    { ...dome(u, v, r * 0.85, r * 70, r * 30, 0xc04a6a, 8, 2), layer: 1 },
    ...[[-0.3, -0.2], [0.25, 0.1], [-0.05, 0.3]].map(([a, b]) => ({ ...column(u + a * r, v + b * r, r * 0.22, r * 70 + r * 18, r * 70 + r * 32, 0xd85a7a, 0xe07a90, 6), layer: 2 })),
  ];
}
function mushroom(u: number, v: number, r: number, cap: number): Part[] {
  return [column(u, v, r * 0.35, 0, r * 70, 0xe8e0cc, 0xe8e0cc, 6), { ...dome(u, v, r, r * 60, r * 45, cap, 8, 2), layer: 1 }];
}
function appleCrate(u: number, v: number): Part[] {
  return [crate(u, v, 0.11, 7, 0xb08a5a), ...[[-0.05, -0.04], [0.04, -0.05], [0, 0.03], [0.05, 0.05], [-0.05, 0.05]].map(([a, b]) => ({ ...dome(u + a, v + b, 0.04, 6, 4, 0xd2452f, 6, 2), layer: 1, at: [u, v + 0.02] as [number, number] }))];
}
function sack(u: number, v: number): Part[] {
  return [column(u, v, 0.08, 0, 9, 0xd8c8a0, 0xc8b890, 8), { ...cone(ring(u, v, 0.08, 8), 9, [u, v, 14], 0xd0c098), layer: 1 }];
}

/** the fallback until a building has its own model: a plain house in its colours */
export function modelFor(c: ModelCtx): Model {
  const m = MODELS[c.def.id];
  return m ? m(c) : house(c);
}
