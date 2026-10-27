// Browser entry for the buildings contact sheet: every model in all four turns, by day and by night.
import { Application, Graphics, Text, Container } from 'pixi.js';
import { BUILDINGS } from '../../src/sim/content';
import { footprint, doorTile } from '../../src/sim/world';
import { modelFor, MODELS } from '../../src/render/models';
import { drawModel } from '../../src/render/draw';

const only = new URLSearchParams(location.search).get('only')?.split(',');
const night = new URLSearchParams(location.search).has('night');
const stage = Number(new URLSearchParams(location.search).get('stage') ?? 3);
const defs = BUILDINGS.filter(d => (d.needs === 'soil' || !d.walkable) && (!d.decor || MODELS[d.id]) && d.id !== 'hearth' && (!only || only.includes(d.id)));
const CW = 230, rowH = (d: { w: number; h: number }) => (d.w * d.h >= 9 ? 330 : 190);
const tops: number[] = []; let acc = 0;
(async () => {
  const app = new Application();
  for (const d of defs) { tops.push(acc); acc += rowH(d); }
  await app.init({ width: CW * 4 + 140, height: acc + 40, background: 0x22301f, antialias: true, resolution: 2, autoDensity: true });
  document.body.appendChild(app.canvas);
  defs.forEach((def, row) => {
    const name = new Text({ text: def.name, style: { fontFamily: 'system-ui', fontSize: 15, fill: 0xf1e9d8, fontWeight: '600' } });
    const CH = rowH(def), y0 = tops[row];
    name.position.set(12, y0 + CH / 2 - 10); app.stage.addChild(name);
    for (let rot = 0; rot < 4; rot++) {
      const f = footprint(def.id, rot), c = new Container(), g = new Graphics();
      const tile = (x: number, y: number, col: number, a = 1) => g.poly([(x - y) * 32, (x + y) * 16, (x + 1 - y) * 32, (x + 1 + y) * 16, (x + 1 - y - 1) * 32, (x + y + 2) * 16, (x - y - 1) * 32, (x + y + 1) * 16]).fill({ color: col, alpha: a });
      for (let x = -1; x <= f.w; x++) for (let y = -1; y <= f.h + 0; y++) tile(x, y, (x + y) % 2 ? 0x5d7f3f : 0x577a3a);
      for (let x = 0; x < f.w; x++) for (let y = 0; y < f.h; y++) tile(x, y, 0x6f6448, 0.55);
      const d = doorTile(def.id, 0, 0, rot); tile(d.x, d.y, 0xf1e9d8, 0.25);
      if (def.needs === 'water') { const fp = footprint(def.id, rot); const side = [[fp.w, 0, 1, fp.h], [0, -1, fp.w, 1], [-1, 0, 1, fp.h], [0, fp.h, fp.w, 1]][rot]; for (let x = side[0]; x < side[0] + side[2]; x++) for (let y = side[1]; y < side[1] + side[3]; y++) tile(x, y, 0x3d6f8a); }
      drawModel(g, modelFor({ def, W: def.w, H: def.h, night, busy: true, stage, water: (u, v) => u > def.w }), def.id, 0, 0, rot);
      c.addChild(g);
      const mid = { sx: (f.w / 2 - f.h / 2) * 32, sy: (f.w / 2 + f.h / 2) * 16 };
      c.position.set(140 + rot * CW + CW / 2 - mid.sx, y0 + CH * 0.66 - mid.sy);
      app.stage.addChild(c);
    }
  });
  (window as any).sheetReady = true;
})();
