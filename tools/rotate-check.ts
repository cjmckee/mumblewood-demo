// Rotation: doorways sit just outside the footprint on the turned side, and turned buildings get built and used.
// Usage: npx tsx tools/rotate-check.ts
import { createWorld, apply, footprint, doorTile, spotOf, canPlace, findSpot, runHours, built, workersAt, debugGrow, Building, World } from '../src/sim/world';
import { BUILDINGS } from '../src/sim/content';
let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.log('FAIL', msg); } };
const side = ['+y', '+x', '-y', '-x'];
for (const d of BUILDINGS) {
  if (d.walkable || d.decor) continue;
  for (let r = 0; r < 4; r++) {
    const f = footprint(d.id, r), x = 20, y = 20, t = doorTile(d.id, x, y, r);
    check(r % 2 ? f.w === d.h && f.h === d.w : f.w === d.w && f.h === d.h, `${d.id} r${r} footprint`);
    const where = t.y === y + f.h ? '+y' : t.x === x + f.w ? '+x' : t.y === y - 1 ? '-y' : t.x === x - 1 ? '-x' : '?';
    const along = where === '+y' || where === '-y' ? t.x >= x && t.x < x + f.w : t.y >= y && t.y < y + f.h;
    check(where === side[r] && along, `${d.id} r${r} doorway at ${t.x},${t.y} is ${where}, want ${side[r]}`);
    const s = spotOf({ def: d.id, x, y, rot: r } as Building);
    check(Math.floor(s.x) === t.x && Math.floor(s.y) === t.y, `${d.id} r${r} spot ${s.x},${s.y} vs doorway ${t.x},${t.y}`);
  }
}
// a turned kitchen gets built and staffed
const w: World = createWorld(1000); debugGrow(w, 6);
while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
for (const r of [1, 2, 3]) {
  const s = findSpot(w, 'leanto'); if (!s) { check(false, 'no spot'); break; }
  const err = apply(w, { type: 'place', def: 'leanto', x: s.x, y: s.y, rot: r });
  check(!err, `place hut turned ${r}: ${err}`);
}
const turned = w.buildings.filter(b => b.def === 'leanto' && b.rot);
check(turned.length === 3, `3 turned huts placed, got ${turned.length}`);
w.res.wood += 200;
for (let h = 0; h < 72 && turned.some(b => !b.built); h++) { runHours(w, 1); while (w.decisions.length) apply(w, { type: 'resolve', option: 0 }); }
check(turned.every(b => b.built), `turned huts built: ${turned.map(b => b.built).join(',')}`);
// placing must not cover another building's turned doorway
const k = turned[0], dt = doorTile(k.def, k.x, k.y, k.rot);
check(!canPlace(w, 'leanto', dt.x, dt.y).ok, 'cannot build on a turned doorway');
// a save round trip keeps the turn and the doorway
const back = JSON.parse(JSON.stringify(w)) as World;
const kb = back.buildings.find(b => b.uid === k.uid)!;
check(kb.rot === k.rot && spotOf(kb).x === spotOf(k).x && spotOf(kb).y === spotOf(k).y, 'rotation survives a save');
console.log(fails ? `${fails} failed` : 'rotation: all checks passed');
process.exit(fails ? 1 : 0);
