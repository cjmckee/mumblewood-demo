// Isometric vector renderer. Reads the world, never changes it.
import { Application, Container, Graphics, Text, FederatedPointerEvent } from 'pixi.js';
import { BUILDING_BY_ID } from '../sim/content';
import { World, MAP_SIZE, alive, hourOfDay, workersAt } from '../sim/world';

const TW = 64, TH = 32; // tile width/height in px
export const iso = (x: number, y: number) => ({ sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) });

function shade(c: number, f: number) {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}
function hash(x: number, y: number) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

export interface Picked { kind: 'building' | 'colonist'; id: number }

export class IsoView {
  app = new Application();
  camera = new Container();
  ground = new Graphics();
  objects = new Container();
  night = new Graphics();
  glow = new Graphics();
  labels = new Container();
  private bGfx = new Map<number, Container>();
  private cGfx = new Map<number, { root: Container; body: Graphics; pip: Graphics; zz: Text }>();
  private builtVersion = -1;
  selected: Picked | null = null;
  onPick: (p: Picked | null) => void = () => {};
  zoom = 1;

  async init(host: HTMLElement) {
    await this.app.init({ resizeTo: host, background: 0x2b3a2a, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.camera, this.night);
    this.camera.addChild(this.ground, this.glow, this.objects, this.labels);
    this.objects.sortableChildren = true;
    this.drawGround();
    this.center();
    this.bindInput();
    window.addEventListener('resize', () => this.center());
  }

  center() {
    const { width, height } = this.app.screen;
    const c = iso(12, 12);
    this.zoom = Math.max(0.85, Math.min(1.25, width / 900));
    this.camera.scale.set(this.zoom);
    this.camera.position.set(width / 2 - c.sx * this.zoom, height * 0.52 - c.sy * this.zoom);
  }

  private drawGround() {
    const g = this.ground;
    for (let x = 0; x < MAP_SIZE; x++) for (let y = 0; y < MAP_SIZE; y++) {
      const { sx, sy } = iso(x, y);
      const d = Math.hypot(x - 12, y - 12);
      const n = hash(x, y);
      let col = d < 2.2 ? 0x8a7a5a : n < 0.5 ? 0x5d7f3f : n < 0.85 ? 0x567839 : 0x638846;
      if (d > 11.5) col = shade(col, 0.82);
      g.poly([sx, sy - TH / 2, sx + TW / 2, sy, sx, sy + TH / 2, sx - TW / 2, sy]).fill(col);
    }
    // dirt paths from the hearth along the axes
    for (let i = 3; i <= 10; i++) for (const [x, y] of [[12 + i, 12], [12 - i, 12], [12, 12 + i], [12, 12 - i]]) {
      const { sx, sy } = iso(x, y);
      g.poly([sx, sy - TH / 2 + 5, sx + TW / 2 - 9, sy, sx, sy + TH / 2 - 5, sx - TW / 2 + 9, sy]).fill({ color: 0x8a7a5a, alpha: 0.65 });
    }
    // forest ring around the edge
    for (let x = -2; x < MAP_SIZE + 2; x++) for (let y = -2; y < MAP_SIZE + 2; y++) {
      const edge = x < 1 || y < 1 || x > MAP_SIZE - 2 || y > MAP_SIZE - 2;
      const n = hash(x + 99, y + 7);
      if (!edge && !(Math.hypot(x - 12, y - 12) > 10.8 && n < 0.35)) continue;
      if (n > 0.8 && !edge) continue;
      this.addTree(x + n * 0.4, y + hash(y, x) * 0.4, n);
    }
  }

  private addTree(x: number, y: number, n: number) {
    const t = new Graphics();
    const { sx, sy } = iso(x, y);
    const h = 34 + n * 22, w = 15 + n * 6;
    const leaf = n < 0.33 ? 0x2f5a35 : n < 0.66 ? 0x36643a : 0x2a4f3a;
    t.ellipse(sx, sy + 2, w * 0.9, w * 0.4).fill({ color: 0x000000, alpha: 0.18 });
    t.rect(sx - 2, sy - 10, 4, 12).fill(0x5a4030);
    t.poly([sx, sy - h, sx + w, sy - 6, sx - w, sy - 6]).fill(leaf);
    t.poly([sx, sy - h, sx + w, sy - 6, sx, sy - 9]).fill(shade(leaf, 0.78));
    t.poly([sx, sy - h - 10, sx + w * 0.7, sy - h * 0.45, sx - w * 0.7, sy - h * 0.45]).fill(shade(leaf, 1.12));
    t.zIndex = sy;
    this.objects.addChild(t);
  }

  private drawBuilding(defId: string, x: number, y: number, selected: boolean): Container {
    const def = BUILDING_BY_ID[defId];
    const c = new Container();
    const g = new Graphics();
    const { sx, sy } = iso(x, y);
    if (defId === 'hearth') {
      g.ellipse(sx, sy, 34, 17).fill(0x6e6252).stroke({ width: 2, color: 0x4d4438 });
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; g.ellipse(sx + Math.cos(a) * 26, sy + Math.sin(a) * 13, 6, 4).fill(i % 2 ? 0x8c8272 : 0x7a7062); }
      g.poly([sx - 10, sy, sx + 10, sy, sx + 3, sy - 6]).fill(0x5a4030);
      g.poly([sx - 9, sy - 2, sx, sy - 30, sx + 9, sy - 2]).fill(0xe07a2e);
      g.poly([sx - 5, sy - 3, sx, sy - 20, sx + 5, sy - 3]).fill(0xf5c04a);
      c.addChild(g);
      c.zIndex = sy;
      return c;
    }
    const s = 0.82; // footprint in tiles
    const hw = (TW / 2) * s * 1.15, hh = (TH / 2) * s * 1.15;
    const wallH = 18 + def.height * 22;
    const top = sy - wallH;
    // shadow
    g.poly([sx, sy - hh + 6, sx + hw + 10, sy + 6, sx, sy + hh + 6, sx - hw - 10, sy + 6]).fill({ color: 0x000000, alpha: 0.18 });
    // left wall
    g.poly([sx - hw, sy, sx, sy + hh, sx, sy + hh - wallH, sx - hw, sy - wallH]).fill(shade(def.wall, 0.95));
    // right wall
    g.poly([sx, sy + hh, sx + hw, sy, sx + hw, sy - wallH, sx, sy + hh - wallH]).fill(shade(def.wall, 0.72));
    // door + window
    g.poly([sx + hw * 0.3, sy + hh * 0.7, sx + hw * 0.55, sy + hh * 0.45, sx + hw * 0.55, sy + hh * 0.45 - 14, sx + hw * 0.3, sy + hh * 0.7 - 14]).fill(0x3a2a1e);
    const lit = 0xf2c46a;
    g.poly([sx - hw * 0.65, sy + hh * 0.35 - 6, sx - hw * 0.35, sy + hh * 0.65 - 6, sx - hw * 0.35, sy + hh * 0.65 - 14, sx - hw * 0.65, sy + hh * 0.35 - 14]).fill(lit);
    // roof (pyramid-ish gable)
    const rh = 16 + def.height * 10;
    const o = 6;
    g.poly([sx - hw - o, top, sx, top + hh + o / 2, sx, top - rh]).fill(shade(def.roof, 1.0));
    g.poly([sx, top + hh + o / 2, sx + hw + o, top, sx, top - rh]).fill(shade(def.roof, 0.78));
    g.poly([sx - hw - o, top, sx, top - hh - o / 2, sx, top - rh]).fill(shade(def.roof, 1.15));
    g.poly([sx, top - hh - o / 2, sx + hw + o, top, sx, top - rh]).fill(shade(def.roof, 0.92));
    if (defId === 'woodcutter' || defId === 'sawmill') { g.rect(sx + hw - 4, sy - 4, 14, 5).fill(0x8a6038); g.rect(sx + hw - 2, sy - 9, 12, 5).fill(0x9a7044); }
    if (defId === 'dock') { g.poly([sx + hw, sy, sx + hw + 26, sy + 13, sx + hw + 18, sy + 17, sx + hw - 8, sy + 4]).fill(0x7a5a3c); }
    if (defId === 'kitchen' || defId === 'smokehouse' || defId === 'pieoven' || defId === 'brewery') {
      g.rect(sx + 6, top - rh * 0.6 - 14, 7, 16).fill(0x5a5048);
    }
    if (selected) g.poly([sx, sy - hh - 4, sx + hw + 6, sy, sx, sy + hh + 4, sx - hw - 6, sy]).stroke({ width: 3, color: 0xe8a33d });
    c.addChild(g);
    const label = new Text({ text: def.name, style: { fontFamily: 'Figtree, system-ui, sans-serif', fontSize: 12, fill: 0xf4ecdc, fontWeight: '600', stroke: { color: 0x1d2219, width: 3 } } });
    label.anchor.set(0.5, 0);
    label.position.set(sx, sy + hh + 4);
    label.resolution = 2;
    this.labels.addChild(label);
    (c as any).__label = label;
    c.zIndex = sy;
    return c;
  }

  private rebuildBuildings(w: World) {
    for (const [, c] of this.bGfx) { const l = (c as any).__label; if (l) l.destroy(); c.destroy({ children: true }); }
    this.bGfx.clear();
    for (const b of w.buildings) {
      const sel = this.selected?.kind === 'building' && this.selected.id === b.uid;
      const c = this.drawBuilding(b.def, b.x, b.y, sel);
      this.bGfx.set(b.uid, c);
      this.objects.addChild(c);
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
    const pip = new Graphics();
    const zz = new Text({ text: 'z', style: { fontFamily: 'Figtree, system-ui, sans-serif', fontSize: 11, fill: 0xdfe8ff, fontWeight: '700' } });
    zz.anchor.set(0.5); zz.position.set(8, -30); zz.resolution = 2;
    root.addChild(body, pip, zz);
    return { root, body, pip, zz };
  }

  /** alpha: interpolation between the last two sim ticks, 0..1 */
  update(w: World, alpha: number, time: number) {
    if (w.version !== this.builtVersion || this._selKey !== this.selKey()) {
      this.rebuildBuildings(w); this.builtVersion = w.version; this._selKey = this.selKey();
    }
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
      s.root.zIndex = sy + 2;
      const sleeping = c.activity === 'sleeping' && !moving;
      s.body.visible = !sleeping || c.bed == null; // sleepers vanish into their beds
      s.zz.visible = sleeping && c.bed == null;
      s.zz.alpha = 0.5 + 0.5 * Math.sin(time / 300 + c.id);
      const sel = this.selected?.kind === 'colonist' && this.selected.id === c.id;
      s.pip.clear();
      if (!sleeping || c.bed == null) {
        const col = c.sulking ? 0x9a6adf : c.mood >= 60 ? 0x7fd06a : c.mood >= 35 ? 0xe8c547 : 0xe0603f;
        s.pip.circle(0, -33, sel ? 4.5 : 3.2).fill(col);
        if (sel) s.pip.ellipse(0, 0, 11, 5.5).stroke({ width: 2, color: 0xe8a33d });
        if (c.partner != null) s.pip.circle(-7, -33, 2).fill(0xe58fb5);
      }
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
    const hearth = iso(12, 12);
    const flicker = 1 + Math.sin(time / 120) * 0.04 + Math.sin(time / 47) * 0.03;
    const gAlpha = 0.18 + dark * 0.7;
    for (let r = 5; r >= 1; r--) this.glow.ellipse(hearth.sx, hearth.sy, 40 * r * flicker, 20 * r * flicker).fill({ color: 0xf2a54a, alpha: gAlpha / 6 });
    this.labels.alpha = 1 - dark * 0.5;
    // tavern lights at night
    for (const b of w.buildings) if (b.def === 'tavern' && workersAt(w, b.uid).length && h >= 18) {
      const p = iso(b.x, b.y);
      for (let r = 3; r >= 1; r--) this.glow.ellipse(p.sx, p.sy, 34 * r, 17 * r).fill({ color: 0xf2c46a, alpha: (0.06 + dark * 0.2) / 3 });
    }
  }

  private _selKey = '';
  private selKey() { return this.selected ? `${this.selected.kind}${this.selected.id}` : ''; }

  // ---------- input: drag to pan, pinch/wheel to zoom, tap to pick ----------
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
    const up = (e: PointerEvent) => {
      if (pts.size === 1 && moved < 8) this.pick(e.clientX, e.clientY);
      pts.delete(e.pointerId);
    };
    view.addEventListener('pointerup', up);
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
  lastWorld: World | null = null;
  private pick(cx: number, cy: number) {
    const w = this.lastWorld; if (!w) return;
    const rect = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    const wx = (cx - rect.left - this.camera.x) / this.zoom, wy = (cy - rect.top - this.camera.y) / this.zoom;
    let best: Picked | null = null, bestD = 1e9;
    for (const c of alive(w)) {
      if (c.activity === 'sleeping' && c.bed != null) continue;
      const { sx, sy } = iso(c.x, c.y);
      const d = Math.hypot(wx - sx, wy - (sy - 16));
      if (d < 18 && d < bestD) { best = { kind: 'colonist', id: c.id }; bestD = d; }
    }
    if (!best) for (const b of w.buildings) {
      const { sx, sy } = iso(b.x, b.y);
      const d = Math.hypot(wx - sx, (wy - (sy - 18)) * 1.4);
      if (d < 44 && d < bestD) { best = { kind: 'building', id: b.uid }; bestD = d; }
    }
    this.onPick(best);
  }
  focus(x: number, y: number) {
    const { width, height } = this.app.screen;
    const p = iso(x, y);
    this.camera.position.set(width / 2 - p.sx * this.zoom, height * 0.42 - p.sy * this.zoom);
  }
}
export type { FederatedPointerEvent };
