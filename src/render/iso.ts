// Isometric vector renderer. Reads the world, never changes it.
import { Application, Container, Graphics, Text } from 'pixi.js';
import { BUILDING_BY_ID, ResourceId } from '../sim/content';
import { World, Building, MAP_SIZE, BUILD_MIN, BUILD_MAX, CENTER, alive, hourOfDay, workersAt, bdef, siteWork, canPlace, spotOf, built, terrainAt, T_TREE, T_BUSH, T_WATER, T_APPLE, T_FLOWERS, T_SOIL, T_CLAY } from '../sim/world';

const TW = 64, TH = 32; // tile width/height in px
/** world (tile) coordinates to screen; tile (i, j) spans [i, i+1] x [j, j+1] */
export const iso = (x: number, y: number) => ({ sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) });
const unIso = (sx: number, sy: number) => { const a = sx / (TW / 2), b = sy / (TH / 2); return { x: (a + b) / 2, y: (b - a) / 2 }; };

export const RES_COLOR: Record<ResourceId, number> = {
  wood: 0xa07a4c, planks: 0xd2a96a, berries: 0xc04a6a, fish: 0x5b9cc2, mushrooms: 0xb39ad0,
  stew: 0xd98a3c, pie: 0xe6c25a, smokedFish: 0x9c8c7a, ale: 0xd6a33c,
  apples: 0xd2452f, grain: 0xd8c060, honey: 0xe8a21c, cider: 0xb8c25a, mead: 0xb06a2a,
  clay: 0xb0603a, reeds: 0x9aa860, bricks: 0xa8442e, wicker: 0xc8a868,
  herbs: 0x5a9a4a, flour: 0xe8e0c8, bread: 0xc89048, skewers: 0x9a6a4a, poultice: 0x8ab89a, tonic: 0x6a5aa8, tea: 0x8aa84a,
};

function shade(c: number, f: number) {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}
function hash(x: number, y: number) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const flat = (...pts: { sx: number; sy: number }[]) => pts.flatMap(p => [p.sx, p.sy]);
const up = (p: { sx: number; sy: number }, h: number) => ({ sx: p.sx, sy: p.sy - h });

export interface Picked { kind: 'building' | 'colonist'; id: number }
export interface Placing { def: string; x: number; y: number }

export class IsoView {
  app = new Application();
  camera = new Container();
  ground = new Graphics();
  pathG = new Graphics();
  ghost = new Graphics();
  private terrainRef: number[] | null = null;
  private terrainObjs: Graphics[] = [];
  private pathKey = '';
  pathMode = false;
  onPathTap: (x: number, y: number) => void = () => {};
  objects = new Container();
  night = new Graphics();
  glow = new Graphics();
  labels = new Container();
  private bGfx = new Map<number, { c: Container; label?: Text }>();
  private cGfx = new Map<number, { root: Container; body: Graphics; pip: Graphics; carry: Graphics; zz: Text }>();
  private builtKey = '';
  selected: Picked | null = null;
  placing: Placing | null = null;
  onPick: (p: Picked | null) => void = () => {};
  onPlaceMove: (p: Placing) => void = () => {};
  zoom = 1;
  lastWorld: World | null = null;

  async init(host: HTMLElement) {
    await this.app.init({ resizeTo: host, background: 0x22301f, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.camera, this.night);
    this.camera.addChild(this.ground, this.pathG, this.glow, this.ghost, this.objects, this.labels);
    this.objects.sortableChildren = true;
    this.center();
    this.bindInput();
    window.addEventListener('resize', () => this.center());
  }

  center() {
    const { width, height } = this.app.screen;
    const c = iso(CENTER, CENTER);
    this.zoom = Math.max(0.8, Math.min(1.2, width / 900));
    this.camera.scale.set(this.zoom);
    this.camera.position.set(width / 2 - c.sx * this.zoom, height * 0.5 - c.sy * this.zoom);
  }
  /** world point under the middle of the screen */
  viewCenter() {
    const { width, height } = this.app.screen;
    return unIso((width / 2 - this.camera.x) / this.zoom, (height * 0.5 - this.camera.y) / this.zoom);
  }

  private tile(g: Graphics, x: number, y: number, color: number, alpha = 1, inset = 0) {
    const a = iso(x + inset, y + inset), b = iso(x + 1 - inset, y + inset), c = iso(x + 1 - inset, y + 1 - inset), d = iso(x + inset, y + 1 - inset);
    g.poly(flat(a, b, c, d)).fill({ color, alpha });
  }

  private drawGround(w: World) {
    const g = this.ground; g.clear();
    for (const o of this.terrainObjs) o.destroy();
    this.terrainObjs = [];
    for (let x = -3; x < MAP_SIZE + 3; x++) for (let y = -3; y < MAP_SIZE + 3; y++) {
      const n = hash(x, y);
      const inside = x >= BUILD_MIN && y >= BUILD_MIN && x <= BUILD_MAX && y <= BUILD_MAX;
      const t = terrainAt(w, x, y);
      let col = n < 0.5 ? 0x5d7f3f : n < 0.85 ? 0x577a3a : 0x648946;
      if (Math.hypot(x + 0.5 - CENTER, y + 0.5 - CENTER) < 3.3) col = n < 0.5 ? 0x8a7a5a : 0x84744f;
      if (t === T_TREE) col = shade(col, 0.86);
      if (t === T_SOIL) col = n < 0.5 ? 0x5e4630 : 0x664c33;
      if (t === T_FLOWERS) col = shade(col, 1.06);
      if (t === T_CLAY) col = n < 0.5 ? 0x9a5a3a : 0xa4623e;
      if (!inside) col = shade(col, 0.8);
      if (t === T_WATER) {
        this.tile(g, x, y, n < 0.5 ? 0x3d6f8a : 0x3a6a85);
        const p = iso(x + 0.5, y + 0.5);
        if (n > 0.55) g.moveTo(p.sx - 9, p.sy).lineTo(p.sx + 5, p.sy - 2).stroke({ width: 1.5, color: 0x8cc0d8, alpha: 0.5 });
        continue;
      }
      this.tile(g, x, y, col);
      if (t === T_SOIL) {
        // furrows
        for (const f of [0.3, 0.6]) { const p0 = iso(x + 0.1, y + f), p1 = iso(x + 0.9, y + f); g.moveTo(p0.sx, p0.sy).lineTo(p1.sx, p1.sy).stroke({ width: 1.2, color: 0x4a3626, alpha: 0.7 }); }
      } else if (t === T_CLAY) {
        // wet lumps of clay
        for (let i = 0; i < 3; i++) { const p0 = iso(x + 0.2 + hash(x * 5 + i, y) * 0.6, y + 0.2 + hash(x, y * 5 + i) * 0.6); g.ellipse(p0.sx, p0.sy, 4, 2).fill(0x7a4228); }
      } else if (t === T_FLOWERS) {
        const cols = [0xf2d24a, 0xe8e0f0, 0xd66a9a, 0xb48ae0];
        for (let i = 0; i < 6; i++) { const p0 = iso(x + 0.15 + hash(x * 7 + i, y) * 0.7, y + 0.15 + hash(x, y * 7 + i) * 0.7); g.circle(p0.sx, p0.sy, 1.8).fill(cols[(i + Math.floor(n * 4)) % 4]); }
      }
    }
    // a sandy rim where water meets grass
    for (let x = 0; x < MAP_SIZE; x++) for (let y = 0; y < MAP_SIZE; y++) if (terrainAt(w, x, y) === T_WATER) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (terrainAt(w, x + dx, y + dy) !== T_WATER) {
        const a = dx === 1 ? [iso(x + 1, y), iso(x + 1, y + 1)] : dx === -1 ? [iso(x, y), iso(x, y + 1)] : dy === 1 ? [iso(x, y + 1), iso(x + 1, y + 1)] : [iso(x, y), iso(x + 1, y)];
        g.moveTo(a[0].sx, a[0].sy).lineTo(a[1].sx, a[1].sy).stroke({ width: 3, color: 0xc8b47e, alpha: 0.8 });
      }
    }
    const a = iso(BUILD_MIN, BUILD_MIN), b = iso(BUILD_MAX + 1, BUILD_MIN), c = iso(BUILD_MAX + 1, BUILD_MAX + 1), d = iso(BUILD_MIN, BUILD_MAX + 1);
    g.poly(flat(a, b, c, d)).stroke({ width: 2, color: 0x2f4426, alpha: 0.6 });
    for (let x = -4; x < MAP_SIZE + 4; x++) for (let y = -4; y < MAP_SIZE + 4; y++) {
      const t = terrainAt(w, x, y), n = hash(x + 99, y + 7);
      if (t === T_TREE) {
        const edge = x < BUILD_MIN || y < BUILD_MIN || x > BUILD_MAX || y > BUILD_MAX;
        if (edge && n > 0.72) continue;
        this.addTree(x + 0.5 + (n - 0.5) * 0.4, y + 0.5 + (hash(y, x) - 0.5) * 0.4, n);
      } else if (t === T_BUSH) this.addBush(x + 0.5, y + 0.5, n);
      else if (t === T_APPLE) this.addAppleTree(x + 0.5 + (n - 0.5) * 0.25, y + 0.5, n);
    }
  }

  private addAppleTree(x: number, y: number, n: number) {
    const t = new Graphics();
    const { sx, sy } = iso(x, y);
    const r = 12 + n * 3;
    t.ellipse(sx, sy + 2, 16, 6).fill({ color: 0x000000, alpha: 0.18 });
    t.rect(sx - 2, sy - 14, 4, 16).fill(0x5a4030);
    t.circle(sx, sy - 22, r).fill(0x4f7f3a);
    t.circle(sx - 5, sy - 25, r * 0.6).fill(0x5e8f42);
    for (let i = 0; i < 6; i++) t.circle(sx - r * 0.7 + ((i * 41 + n * 60) % (r * 1.4)), sy - 30 + ((i * 29) % 16), 2.3).fill(0xd2452f);
    t.zIndex = sy;
    this.objects.addChild(t); this.terrainObjs.push(t);
  }

  private addBush(x: number, y: number, n: number) {
    const t = new Graphics();
    const { sx, sy } = iso(x, y);
    t.ellipse(sx, sy + 3, 15, 6).fill({ color: 0x000000, alpha: 0.15 });
    t.ellipse(sx - 6, sy - 4, 9, 7).fill(0x3f6b33);
    t.ellipse(sx + 6, sy - 3, 9, 7).fill(0x36602e);
    t.ellipse(sx, sy - 9, 10, 8).fill(0x4a7a3a);
    for (let i = 0; i < 5; i++) t.circle(sx - 9 + ((i * 37 + n * 50) % 18), sy - 12 + ((i * 23) % 11), 2.2).fill(0xc8385a);
    t.zIndex = sy;
    this.objects.addChild(t); this.terrainObjs.push(t);
  }

  private drawPaths(w: World) {
    const g = this.pathG; g.clear();
    for (let i = 0; i < w.paths.length; i++) {
      if (!w.paths[i]) continue;
      const x = i % MAP_SIZE, y = Math.floor(i / MAP_SIZE);
      if (w.paths[i] === 2) {
        this.tile(g, x, y, 0xb39a6e, 0.95, 0.02);
        const p = iso(x + 0.5, y + 0.5), n = hash(x * 3, y * 5);
        g.ellipse(p.sx - 8 + n * 6, p.sy - 2, 5, 2.5).fill({ color: 0xc9b38a, alpha: 0.8 });
        g.ellipse(p.sx + 6 - n * 4, p.sy + 3, 4, 2).fill({ color: 0xa08a5e, alpha: 0.8 });
      } else {
        const a = iso(x + 0.15, y + 0.15), b = iso(x + 0.85, y + 0.15), c = iso(x + 0.85, y + 0.85), d = iso(x + 0.15, y + 0.85);
        g.poly(flat(a, b, c, d)).fill({ color: 0xe8c58a, alpha: 0.18 }).stroke({ width: 1.5, color: 0xe8c58a, alpha: 0.7 });
      }
    }
  }

  private addTree(x: number, y: number, n: number) {
    const t = new Graphics();
    const { sx, sy } = iso(x, y);
    const h = 34 + n * 30, w = 15 + n * 7;
    const leaf = n < 0.25 ? 0x2f5a35 : n < 0.5 ? 0x36643a : 0x2a4f3a;
    t.ellipse(sx, sy + 2, w * 0.9, w * 0.4).fill({ color: 0x000000, alpha: 0.18 });
    t.rect(sx - 2, sy - 10, 4, 12).fill(0x5a4030);
    t.poly([sx, sy - h, sx + w, sy - 6, sx - w, sy - 6]).fill(leaf);
    t.poly([sx, sy - h, sx + w, sy - 6, sx, sy - 9]).fill(shade(leaf, 0.78));
    t.poly([sx, sy - h - 10, sx + w * 0.7, sy - h * 0.45, sx - w * 0.7, sy - h * 0.45]).fill(shade(leaf, 1.12));
    t.zIndex = sy;
    this.objects.addChild(t); this.terrainObjs.push(t);
  }

  /** an isometric box with a hip roof over footprint (x0,y0)-(x1,y1) */
  private house(g: Graphics, x0: number, y0: number, x1: number, y1: number, wallH: number, wall: number, roof: number, doorCol: number, alpha = 1) {
    const N = iso(x0, y0), E = iso(x1, y0), S = iso(x1, y1), W = iso(x0, y1);
    g.poly(flat(W, S, up(S, wallH), up(W, wallH))).fill({ color: shade(wall, 0.96), alpha });
    g.poly(flat(S, E, up(E, wallH), up(S, wallH))).fill({ color: shade(wall, 0.72), alpha });
    // door on the front (+y) wall, in the doorway column
    const d0 = iso(doorCol + 0.28, y1), d1 = iso(doorCol + 0.72, y1);
    g.poly(flat(d0, d1, up(d1, 17), up(d0, 17))).fill({ color: 0x3a2a1e, alpha });
    // windows
    const lit = 0xf2c46a;
    for (let wx = x0 + 0.35; wx < x1 - 0.5; wx += 1) {
      if (wx > doorCol - 0.2 && wx < doorCol + 0.9) continue;
      const a = iso(wx, y1), b = iso(wx + 0.3, y1);
      g.poly(flat(up(a, 9), up(b, 9), up(b, 17), up(a, 17))).fill({ color: lit, alpha });
    }
    for (let wy = y0 + 0.35; wy < y1 - 0.4; wy += 1) {
      const a = iso(x1, wy), b = iso(x1, wy + 0.3);
      g.poly(flat(up(a, 9), up(b, 9), up(b, 17), up(a, 17))).fill({ color: shade(lit, 0.8), alpha });
    }
    // hip roof with a small overhang
    const o = 0.14;
    const rx0 = x0 - o, ry0 = y0 - o, rx1 = x1 + o, ry1 = y1 + o;
    const rN = up(iso(rx0, ry0), wallH), rE = up(iso(rx1, ry0), wallH), rS = up(iso(rx1, ry1), wallH), rW = up(iso(rx0, ry1), wallH);
    const w = rx1 - rx0, h = ry1 - ry0, rise = 10 + Math.min(w, h) * 9;
    if (w >= h) {
      const cy = (ry0 + ry1) / 2, A = up(iso(rx0 + h / 2, cy), wallH + rise), B = up(iso(rx1 - h / 2, cy), wallH + rise);
      g.poly(flat(rN, rE, B, A)).fill({ color: shade(roof, 1.12), alpha });
      g.poly(flat(rW, rN, A)).fill({ color: shade(roof, 1.05), alpha });
      g.poly(flat(rW, rS, B, A)).fill({ color: roof, alpha });
      g.poly(flat(rS, rE, B)).fill({ color: shade(roof, 0.76), alpha });
    } else {
      const cx = (rx0 + rx1) / 2, A = up(iso(cx, ry0 + w / 2), wallH + rise), B = up(iso(cx, ry1 - w / 2), wallH + rise);
      g.poly(flat(rN, rW, B, A)).fill({ color: shade(roof, 1.08), alpha });
      g.poly(flat(rN, rE, A)).fill({ color: shade(roof, 1.12), alpha });
      g.poly(flat(rE, rS, B, A)).fill({ color: shade(roof, 0.76), alpha });
      g.poly(flat(rW, rS, B)).fill({ color: roof, alpha });
    }
  }

  private crates(g: Graphics, x: number, y: number, goods: [ResourceId, number][], max = 9) {
    let i = 0;
    for (const [r, n] of goods) {
      const stacks = Math.min(3, Math.ceil(n / 25));
      for (let s = 0; s < stacks && i < max; s++, i++) {
        const gx = x + (i % 3) * 0.55, gy = y + Math.floor(i / 3) * 0.55;
        const p = iso(gx + 0.25, gy + 0.25);
        const hgt = 6 + Math.min(10, n / 8);
        g.poly([p.sx - 9, p.sy, p.sx, p.sy + 4.5, p.sx, p.sy + 4.5 - hgt, p.sx - 9, p.sy - hgt]).fill(shade(RES_COLOR[r], 0.95));
        g.poly([p.sx, p.sy + 4.5, p.sx + 9, p.sy, p.sx + 9, p.sy - hgt, p.sx, p.sy + 4.5 - hgt]).fill(shade(RES_COLOR[r], 0.72));
        g.poly([p.sx - 9, p.sy - hgt, p.sx, p.sy - 4.5 - hgt, p.sx + 9, p.sy - hgt, p.sx, p.sy + 4.5 - hgt]).fill(shade(RES_COLOR[r], 1.15));
      }
    }
  }

  private drawBuilding(w: World, b: Building, selected: boolean): { c: Container; label?: Text } {
    const def = bdef(b);
    const c = new Container();
    const g = new Graphics();
    const x0 = b.x, y0 = b.y, x1 = b.x + def.w, y1 = b.y + def.h;
    const ctr = iso(x0 + def.w / 2, y0 + def.h / 2);
    const doorCol = b.x + Math.floor(def.w / 2);
    // ground pad
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) this.tile(g, x, y, 0x6f6448, 0.55, 0.02);
    if (selected) g.poly(flat(iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1))).stroke({ width: 3, color: 0xe8a33d });

    if (!b.built) {
      // construction site: outline, delivered materials, scaffold rising with progress
      const p = Math.min(1, b.progress / siteWork(b));
      g.poly(flat(iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1))).stroke({ width: 2, color: 0xf1e9d8, alpha: 0.7 });
      const wallH = (18 + def.height * 22) * p;
      if (def.id !== 'stockpile' && p > 0) {
        const N = iso(x0, y0), E = iso(x1, y0), S = iso(x1, y1), W = iso(x0, y1);
        g.poly(flat(W, S, up(S, wallH), up(W, wallH))).fill({ color: def.wall, alpha: 0.75 });
        g.poly(flat(S, E, up(E, wallH), up(S, wallH))).fill({ color: shade(def.wall, 0.72), alpha: 0.75 });
        for (const q of [N, E, S, W]) g.rect(q.sx - 1.5, q.sy - wallH - 10, 3, wallH + 10).fill(0xc9a46a);
        g.moveTo(W.sx, W.sy - wallH - 6).lineTo(S.sx, S.sy - wallH - 6).lineTo(E.sx, E.sy - wallH - 6).stroke({ width: 2, color: 0xc9a46a });
      }
      const goods = Object.entries(b.delivered).filter(([, n]) => (n ?? 0) > 0) as [ResourceId, number][];
      this.crates(g, x0 + 0.1, y1 - 0.65, goods, 3);
      c.addChild(g);
      const label = this.makeLabel(`${def.name} · ${Math.round(p * 100)}%`, 0xe8c58a);
      const lp = iso(x0 + def.w / 2, y1 + 0.2); label.position.set(lp.sx, lp.sy);
      c.zIndex = ctr.sy;
      return { c, label };
    }

    if (def.id === 'hearth') {
      const { sx, sy } = ctr;
      g.ellipse(sx, sy, 34, 17).fill(0x6e6252).stroke({ width: 2, color: 0x4d4438 });
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; g.ellipse(sx + Math.cos(a) * 26, sy + Math.sin(a) * 13, 6, 4).fill(i % 2 ? 0x8c8272 : 0x7a7062); }
      g.poly([sx - 10, sy, sx + 10, sy, sx + 3, sy - 6]).fill(0x5a4030);
      g.poly([sx - 9, sy - 2, sx, sy - 30, sx + 9, sy - 2]).fill(0xe07a2e);
      g.poly([sx - 5, sy - 3, sx, sy - 20, sx + 5, sy - 3]).fill(0xf5c04a);
      c.addChild(g); c.zIndex = sy;
      return { c };
    }
    if (def.id === 'stockpile') {
      for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) this.tile(g, x, y, (x + y) % 2 ? 0x8a7a5a : 0x7f6f50, 1, 0.04);
      const N = iso(x0, y0), E = iso(x1, y0), S = iso(x1, y1), W = iso(x0, y1);
      for (const [p, q] of [[N, E], [E, S], [S, W], [W, N]]) g.moveTo(p.sx, p.sy - 5).lineTo(q.sx, q.sy - 5).stroke({ width: 2, color: 0x6b5236 });
      const goods = (Object.entries(b.stock) as [ResourceId, number][]).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]);
      this.crates(g, x0 + 0.2, y0 + 0.2, goods, 9);
      c.addChild(g); c.zIndex = ctr.sy - 10;
      const label = this.makeLabel(def.name);
      const lp = iso(x0 + def.w / 2, y1 + 0.15); label.position.set(lp.sx, lp.sy);
      return { c, label };
    }
    if (def.decor) { this.drawDecor(g, def.id, x0 + 0.5, y0 + 0.5); c.addChild(g); c.zIndex = ctr.sy; return { c }; }
    const wallH = 18 + def.height * 22;
    // shadow
    g.poly(flat(iso(x0 + 0.2, y0 + 0.3), iso(x1 + 0.45, y0 + 0.3), iso(x1 + 0.45, y1 + 0.35), iso(x0 + 0.2, y1 + 0.35))).fill({ color: 0x000000, alpha: 0.16 });
    this.house(g, x0, y0, x1, y1, wallH, def.wall, def.roof, doorCol);
    if (def.id === 'woodcutter' || def.id === 'sawmill') { const p = iso(x1 + 0.1, y1 - 0.6); g.rect(p.sx, p.sy - 6, 16, 5).fill(0x8a6038); g.rect(p.sx + 2, p.sy - 11, 14, 5).fill(0x9a7044); }
    if (def.id === 'dock') { const a = iso(x1, y0 + 0.5), b = iso(x1 + 1.2, y0 + 0.5), c2 = iso(x1 + 1.2, y0 + 1.5), d = iso(x1, y0 + 1.5); g.poly(flat(a, b, c2, d)).fill(0x7a5a3c); this.tile(g, x1 + 1, y0, 0x3d6f8a, 0.9); this.tile(g, x1 + 1, y0 + 1, 0x3d6f8a, 0.9); this.tile(g, x1 + 1, y0 + 2, 0x3d6f8a, 0.9); }
    if (['kitchen', 'smokehouse', 'pieoven', 'brewery', 'tavern'].includes(def.id)) { const p = up(iso(x0 + def.w * 0.7, y0 + 0.5), wallH + 14); g.rect(p.sx - 3, p.sy - 18, 7, 20).fill(0x5a5048); }
    if (def.id === 'clinic') { const p = up(iso(x0 + 0.5, y1), wallH - 4); g.rect(p.sx - 8, p.sy - 8, 16, 16).fill(0xf4f1e8); g.rect(p.sx - 2.5, p.sy - 6, 5, 12).fill(0xc23a3a); g.rect(p.sx - 6, p.sy - 2.5, 12, 5).fill(0xc23a3a); }
    if (def.seats && b.clean < 35) { for (let i = 0; i < 4; i++) { const p = iso(x0 + 0.4 + i * 0.6, y1 + 0.25); g.ellipse(p.sx, p.sy, 5, 2.5).fill({ color: 0x4a3a20, alpha: 0.7 }); } }
    // finished goods waiting by the door
    const out = (Object.entries(b.outbox) as [ResourceId, number][]).filter(([, n]) => n >= 2);
    if (out.length) this.crates(g, x1 - 0.1, y1 - 0.5, out.map(([r, n]) => [r, n * 2]), 2);
    const inn = (Object.entries(b.inbox) as [ResourceId, number][]).filter(([, n]) => n >= 2);
    if (inn.length) this.crates(g, x0 - 0.55, y1 - 0.5, inn.map(([r, n]) => [r, n * 2]), 2);
    c.addChild(g);
    const label = this.makeLabel(def.name);
    const lp = iso(x0 + def.w / 2, y1 + 0.25); label.position.set(lp.sx, lp.sy);
    c.zIndex = ctr.sy;
    return { c, label };
  }

  private drawDecor(g: Graphics, id: string, x: number, y: number) {
    const { sx, sy } = iso(x, y);
    if (id === 'flowerbed') {
      const a = iso(x - 0.38, y - 0.38), b = iso(x + 0.38, y - 0.38), c = iso(x + 0.38, y + 0.38), d = iso(x - 0.38, y + 0.38);
      g.poly(flat(a, b, c, d)).fill(0x6b4f33);
      g.poly(flat(d, c, up(c, 4), up(d, 4))).fill(0x5a4029);
      const cols = [0xd66a9a, 0xf2c94c, 0xf4f1e8, 0xd66a9a, 0xb07ad6, 0xf2c94c];
      for (let i = 0; i < 9; i++) { const px = sx - 16 + (i % 3) * 16 + ((i * 7) % 5), py = sy - 7 + Math.floor(i / 3) * 6; g.circle(px, py - 4, 3).fill(cols[i % cols.length]); g.circle(px + 2, py - 1, 1.5).fill(0x4a7a3a); }
    } else if (id === 'lantern') {
      g.ellipse(sx, sy + 2, 6, 3).fill({ color: 0x000000, alpha: 0.2 });
      g.rect(sx - 1.5, sy - 34, 3, 34).fill(0x3a2e24);
      g.roundRect(sx - 5, sy - 44, 10, 11, 2).fill(0xf2c46a).stroke({ width: 1.5, color: 0x3a2e24 });
      g.poly([sx - 6, sy - 44, sx + 6, sy - 44, sx, sy - 50]).fill(0x3a2e24);
    } else if (id === 'bench') {
      g.ellipse(sx, sy + 2, 16, 6).fill({ color: 0x000000, alpha: 0.18 });
      const a = iso(x - 0.35, y - 0.1), b = iso(x + 0.35, y - 0.1), c = iso(x + 0.35, y + 0.1), d = iso(x - 0.35, y + 0.1);
      g.poly(flat(up(a, 8), up(b, 8), up(c, 8), up(d, 8))).fill(0xa07448);
      g.poly(flat(up(d, 8), up(c, 8), up(c, 5), up(d, 5))).fill(0x7a5634);
      for (const p of [a, b, c, d]) g.rect(p.sx - 1, p.sy - 8, 2, 8).fill(0x5a4029);
      g.poly(flat(up(a, 8), up(b, 8), up(b, 16), up(a, 16))).fill(0x8a6038);
    } else if (id === 'statue') {
      g.ellipse(sx, sy + 2, 14, 6).fill({ color: 0x000000, alpha: 0.2 });
      const a = iso(x - 0.28, y - 0.28), b = iso(x + 0.28, y - 0.28), c = iso(x + 0.28, y + 0.28), d = iso(x - 0.28, y + 0.28);
      g.poly(flat(d, c, up(c, 12), up(d, 12))).fill(0x8a8a82);
      g.poly(flat(c, b, up(b, 12), up(c, 12))).fill(0x6e6e68);
      g.poly(flat(up(a, 12), up(b, 12), up(c, 12), up(d, 12))).fill(0xa8a8a0);
      g.roundRect(sx - 6, sy - 38, 12, 22, 5).fill(0xb8b8b0);
      g.circle(sx, sy - 43, 5.5).fill(0xc4c4bc);
      g.poly([sx - 7, sy - 46, sx + 7, sy - 46, sx, sy - 51]).fill(0x9a9a92); // a disappointed little hat
      g.rect(sx + 5, sy - 34, 7, 2.5).fill(0xb0b0a8); // pointing, sternly
    }
  }

  private makeLabel(text: string, color = 0xf4ecdc) {
    const t = new Text({ text, style: { fontFamily: 'Figtree, system-ui, sans-serif', fontSize: 12, fill: color, fontWeight: '600', stroke: { color: 0x1d2219, width: 3 } } });
    t.anchor.set(0.5, 0); t.resolution = 2;
    this.labels.addChild(t);
    return t;
  }

  private rebuildBuildings(w: World) {
    for (const [, o] of this.bGfx) { o.label?.destroy(); o.c.destroy({ children: true }); }
    this.bGfx.clear();
    for (const b of w.buildings) {
      const sel = this.selected?.kind === 'building' && this.selected.id === b.uid;
      const o = this.drawBuilding(w, b, sel);
      this.bGfx.set(b.uid, o);
      this.objects.addChild(o.c);
    }
  }

  private colonistSprite(shirt: number, skin: number) {
    const root = new Container();
    const body = new Graphics();
    body.ellipse(0, 0, 7, 3.5).fill({ color: 0x000000, alpha: 0.25 });
    body.roundRect(-5, -16, 10, 14, 4).fill(shirt);
    body.rect(-4, -4, 3, 4).fill(0x3a3028); body.rect(1, -4, 3, 4).fill(0x3a3028);
    body.circle(0, -21, 5.5).fill(skin);
    body.ellipse(0, -25, 5.5, 2.6).fill(shade(shirt, 0.6));
    const carry = new Graphics();
    const pip = new Graphics();
    const zz = new Text({ text: 'z', style: { fontFamily: 'Figtree, system-ui, sans-serif', fontSize: 11, fill: 0xdfe8ff, fontWeight: '700' } });
    zz.anchor.set(0.5); zz.position.set(8, -30); zz.resolution = 2;
    root.addChild(body, carry, pip, zz);
    return { root, body, pip, carry, zz };
  }

  private drawGhost(w: World) {
    const g = this.ghost; g.clear();
    if (!this.placing) return;
    const def = BUILDING_BY_ID[this.placing.def];
    const { x, y } = this.placing;
    const ok = canPlace(w, def.id, x, y).ok;
    const col = ok ? 0x8ccf6f : 0xe0694a;
    for (let tx = x; tx < x + def.w; tx++) for (let ty = y; ty < y + def.h; ty++) this.tile(g, tx, ty, col, 0.38, 0.03);
    g.poly(flat(iso(x, y), iso(x + def.w, y), iso(x + def.w, y + def.h), iso(x, y + def.h))).stroke({ width: 2.5, color: col });
    if (!def.walkable) { const dx = x + Math.floor(def.w / 2), dy = y + def.h; this.tile(g, dx, dy, 0xf1e9d8, 0.3, 0.18); }
    // the other doorways, so the player can see what not to block
    for (const b of w.buildings) if (!bdef(b).walkable) { const s = spotOf(b); this.tile(g, Math.floor(s.x), Math.floor(s.y), 0xf1e9d8, 0.12, 0.25); }
  }

  /** alpha: interpolation between the last two sim ticks, 0..1 */
  update(w: World, alpha: number, time: number) {
    this.lastWorld = w;
    if (this.terrainRef !== w.terrain) { this.drawGround(w); this.terrainRef = w.terrain; this.pathKey = ''; }
    const pk = `${w.version}|${w.paths.reduce((n, p, i) => n + p * (i % 7 + 1), 0)}`;
    if (pk !== this.pathKey) { this.drawPaths(w); this.pathKey = pk; }
    const key = `${w.version}|${this.selected?.kind}${this.selected?.id}|${Math.floor(w.hour)}`;
    if (key !== this.builtKey) { this.rebuildBuildings(w); this.builtKey = key; }
    this.drawGhost(w);
    const live = new Set<number>();
    for (const c of alive(w)) {
      live.add(c.id);
      let s = this.cGfx.get(c.id);
      if (!s) { s = this.colonistSprite(c.shirt, c.skin); this.cGfx.set(c.id, s); this.objects.addChild(s.root); }
      const x = c.px + (c.x - c.px) * alpha, y = c.py + (c.y - c.py) * alpha;
      const { sx, sy } = iso(x, y);
      const moving = Math.hypot(c.x - c.px, c.y - c.py) > 0.01;
      const bob = moving ? Math.abs(Math.sin(time / 90 + c.id)) * 2 : 0;
      s.root.position.set(sx, sy - bob);
      s.root.zIndex = sy + 3;
      const hidden = c.inside != null;
      s.root.visible = !hidden;
      s.zz.visible = c.activity === 'sleeping' && !moving && c.bed == null;
      s.zz.alpha = 0.5 + 0.5 * Math.sin(time / 300 + c.id);
      s.carry.clear();
      if (c.carrying) { const col = RES_COLOR[c.carrying.res]; s.carry.rect(-6, -20, 12, 9).fill(col).stroke({ width: 1, color: shade(col, 0.6) }); }
      if (c.activity === 'building' && c.goalReached) { const sw = Math.sin(time / 110 + c.id) * 5; s.carry.moveTo(5, -12).lineTo(11, -17 + sw).stroke({ width: 2, color: 0x6a5a4a }); }
      const sel = this.selected?.kind === 'colonist' && this.selected.id === c.id;
      s.pip.clear();
      const col = c.sulking ? 0x9a6adf : c.mood >= 60 ? 0x7fd06a : c.mood >= 35 ? 0xe8c547 : 0xe0603f;
      s.pip.circle(0, -33, sel ? 4.5 : 3.2).fill(col);
      if (sel) s.pip.ellipse(0, 0, 11, 5.5).stroke({ width: 2, color: 0xe8a33d });
      if (c.partner != null) s.pip.circle(-7, -33, 2).fill(0xe58fb5);
    }
    for (const [id, s] of this.cGfx) if (!live.has(id)) { s.root.destroy({ children: true }); this.cGfx.delete(id); }

    // day / night
    const h = hourOfDay(w) + alpha / 6;
    const dark = h >= 20 || h < 5 ? 0.55 : h >= 18 ? ((h - 18) / 2) * 0.55 : h < 7 ? ((7 - h) / 2) * 0.55 : 0;
    const dusk = h >= 17 && h < 20 ? 1 - Math.abs(h - 18.5) / 1.5 : 0;
    const { width, height } = this.app.screen;
    this.night.clear();
    if (dusk > 0) this.night.rect(0, 0, width, height).fill({ color: 0xd9743a, alpha: dusk * 0.14 });
    if (dark > 0) this.night.rect(0, 0, width, height).fill({ color: 0x0b1530, alpha: dark });
    this.glow.clear();
    const hearth = iso(CENTER, CENTER);
    const flicker = 1 + Math.sin(time / 120) * 0.04 + Math.sin(time / 47) * 0.03;
    const gAlpha = 0.18 + dark * 0.7;
    for (let r = 5; r >= 1; r--) this.glow.ellipse(hearth.sx, hearth.sy, 40 * r * flicker, 20 * r * flicker).fill({ color: 0xf2a54a, alpha: gAlpha / 6 });
    this.labels.alpha = 1 - dark * 0.45;
    for (const b of built(w)) if (b.def === 'lantern' && dark > 0) {
      const p = iso(b.x + 0.5, b.y + 0.5);
      for (let r = 3; r >= 1; r--) this.glow.ellipse(p.sx, p.sy, 22 * r, 11 * r).fill({ color: 0xf2c46a, alpha: dark * 0.12 });
    }
    for (const b of built(w)) if (b.def === 'tavern' && workersAt(w, b.uid).length && h >= 18) {
      const p = iso(b.x + 1, b.y + 1);
      for (let r = 3; r >= 1; r--) this.glow.ellipse(p.sx, p.sy, 34 * r, 17 * r).fill({ color: 0xf2c46a, alpha: (0.06 + dark * 0.2) / 3 });
    }
  }

  // ---------- input: drag to pan, pinch/wheel to zoom, tap to pick or place ----------
  private bindInput() {
    const view = this.app.canvas as HTMLCanvasElement;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch0 = 0, zoom0 = 1;
    view.style.touchAction = 'none';
    view.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = this.zoom; } });
    view.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (pts.size === 1) { this.camera.x += dx; this.camera.y += dy; moved += Math.abs(dx) + Math.abs(dy); }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); this.setZoom(zoom0 * d / pinch0, (a.x + b.x) / 2, (a.y + b.y) / 2); moved = 99; }
    });
    view.addEventListener('pointerup', e => { if (pts.size === 1 && moved < 8) this.tap(e.clientX, e.clientY); pts.delete(e.pointerId); });
    view.addEventListener('pointercancel', e => pts.delete(e.pointerId));
    view.addEventListener('wheel', e => { e.preventDefault(); this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX, e.clientY); }, { passive: false });
  }
  private setZoom(z: number, cx: number, cy: number) {
    const rect = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    const px = cx - rect.left, py = cy - rect.top;
    z = Math.max(0.4, Math.min(2.2, z));
    const wx = (px - this.camera.x) / this.zoom, wy = (py - this.camera.y) / this.zoom;
    this.zoom = z; this.camera.scale.set(z);
    this.camera.x = px - wx * z; this.camera.y = py - wy * z;
  }
  private screenToWorld(cx: number, cy: number) {
    const rect = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    const sx = (cx - rect.left - this.camera.x) / this.zoom, sy = (cy - rect.top - this.camera.y) / this.zoom;
    return { sx, sy, ...unIso(sx, sy) };
  }
  private tap(cx: number, cy: number) {
    const w = this.lastWorld; if (!w) return;
    const p = this.screenToWorld(cx, cy);
    if (this.pathMode) { this.onPathTap(Math.floor(p.x), Math.floor(p.y)); return; }
    if (this.placing) {
      const def = BUILDING_BY_ID[this.placing.def];
      this.placing = { ...this.placing, x: Math.round(p.x - def.w / 2), y: Math.round(p.y - def.h / 2) };
      this.onPlaceMove(this.placing);
      return;
    }
    let best: Picked | null = null, bestD = 1e9;
    for (const c of alive(w)) {
      if (c.inside != null) continue;
      const s = iso(c.x, c.y);
      const d = Math.hypot(p.sx - s.sx, p.sy - (s.sy - 16));
      if (d < 18 && d < bestD) { best = { kind: 'colonist', id: c.id }; bestD = d; }
    }
    if (!best) {
      // test the ground point, and a point lower on screen to catch taps on roofs
      for (const off of [0, 28, 50]) {
        const g = unIso(p.sx, p.sy + off);
        const hit = [...w.buildings].reverse().find(b => g.x >= b.x && g.x < b.x + bdef(b).w && g.y >= b.y && g.y < b.y + bdef(b).h);
        if (hit) { best = { kind: 'building', id: hit.uid }; break; }
      }
    }
    this.onPick(best);
  }
  /** centre the camera on a world point; frac is how far down the screen it should sit */
  focus(x: number, y: number, frac = 0.36) {
    const { width, height } = this.app.screen;
    const p = iso(x, y);
    this.camera.position.set(width / 2 - p.sx * this.zoom, height * frac - p.sy * this.zoom);
  }
}
