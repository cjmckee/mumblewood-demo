// Notables-and-crews slice: the simulation. Hour-based and DOM-free, so it runs in Node for checks.
// Notables are named characters who each lead one workplace; their crew of anonymous workers does the work.
// A leader's mood sets the crew's speed, their skill and traits set the quality, and how well they do grows the crew.
import {
  Good, Craft, Terrain, Quality, WantId, CharterId, BUILDING, BuildingDef, Recipe, TRAITS, WANTS, FIRST, LAST, SHIRTS, SKINS,
  DISH_MOOD, DISHES, DRINKS, PROPER, PIES, QUALITY_MOOD, RAW_FOOD, CHARTERS, CHARTER, TUNE, DRAFT_POOL, CRAFT_NAME, GOOD_NAME, QUALITY_NAME,
} from './content';

export interface Memory { label: string; value: number; until: number }
export interface Thought { label: string; value: number }
export interface Notable {
  id: number; name: string; shirt: number; skin: number;
  passion: Craft; skill: Record<Craft, number>; traits: string[]; want: WantId;
  mood: number; thoughts: Thought[]; memories: Memory[];
  workplace: number | null; crew: number; rep: number; home: number | null;
  meals: { good: Good; day: number }[]; drank: number[]; lowHours: number; offUntil: number;
  worked: number; hours: number; noBed: boolean;
}
export interface Building {
  id: number; def: string; x: number; y: number; built: boolean; progress: number;
  leader: number | null; recipe: number; batch: number | null; status: string; workers: number;
}
export interface Relation { op: number; kind: 'partner' | 'ex' | null }
export interface EventOption { label: string; detail: string }
export type Decision =
  | { kind: 'charter'; options: CharterId[] }
  | { kind: 'blueprint'; options: string[] }
  | { kind: 'notable'; options: Notable[] }
  | { kind: 'reward' }
  | { kind: 'event'; id: string; title: string; text: string; options: EventOption[]; data: number[] };
export interface Charter { id: CharterId; start: number; streak: number; pair?: [number, number]; made: number; eaten: number }

export interface World {
  seed: number; rng: number; hour: number; w: number; h: number; terrain: Terrain[];
  notables: Notable[]; buildings: Building[]; nextId: number; unled: number;
  stock: Record<Good, number[]>; strain: number; relations: Record<string, Relation>;
  owned: string[]; charter: Charter | null; done: CharterId[]; decisions: Decision[];
  log: { hour: number; text: string; tone: 'good' | 'bad' | 'info' }[];
  festivalDay: number; nextCharterDay: number; unfed: number; unhoused: number; outcome: 'won' | 'lost' | null; endReason: string;
  stats: { joined: number; left: number; departed: string[]; drafted: string[]; finest: number };
}

// ---------- small helpers ----------
export const day = (w: World) => Math.floor(w.hour / 24) + 1;
export const hourOfDay = (w: World) => w.hour % 24;
function rand(w: World) { let x = w.rng | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; w.rng = x >>> 0; return w.rng / 4294967296; }
const pick = <T>(w: World, a: T[]) => a[Math.floor(rand(w) * a.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const total = (w: World, g: Good) => w.stock[g].reduce((a, b) => a + b, 0);
export const people = (w: World) => w.notables.length + w.notables.reduce((a, n) => a + n.crew, 0) + w.unled;
export const workers = (w: World) => w.notables.reduce((a, n) => a + n.crew, 0) + w.unled;
export const notable = (w: World, id: number | null) => w.notables.find(n => n.id === id);
export const building = (w: World, id: number | null) => w.buildings.find(b => b.id === id);
export const has = (n: Notable, t: string) => n.traits.includes(t);
const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export function rel(w: World, a: number, b: number): Relation { return (w.relations[key(a, b)] ??= { op: 0, kind: null }); }
export const tile = (w: World, x: number, y: number): Terrain | null => (x < 0 || y < 0 || x >= w.w || y >= w.h ? null : w.terrain[y * w.w + x]);
function log(w: World, text: string, tone: 'good' | 'bad' | 'info' = 'info') { w.log.push({ hour: w.hour, text, tone }); if (w.log.length > 80) w.log.shift(); }
const first = (n: Notable) => n.name.split(' ')[0];

/** tiles between two buildings' footprints (0 = touching) */
export function gap(a: Building, b: Building) {
  const da = BUILDING[a.def], db = BUILDING[b.def];
  const dx = Math.max(0, b.x - (a.x + da.w - 1), a.x - (b.x + db.w - 1)) - 1;
  const dy = Math.max(0, b.y - (a.y + da.h - 1), a.y - (b.y + db.h - 1)) - 1;
  return Math.max(dx, dy, 0);
}
export const NEAR = 3;
export function neighbours(w: World, n: Notable, within = NEAR): Notable[] {
  const b = building(w, n.workplace); if (!b) return [];
  return w.notables.filter(o => o !== n && o.workplace !== null && gap(b, building(w, o.workplace)!) <= within);
}
export type Bond = 'partner' | 'friend' | 'rival' | 'ex' | null;
export function bond(w: World, a: number, b: number): Bond {
  const r = rel(w, a, b);
  if (r.kind === 'partner') return 'partner';
  if (r.op <= -30) return 'rival';
  if (r.kind === 'ex') return 'ex';
  if (r.op >= 35) return 'friend';
  return null;
}

// ---------- quality and speed: where the people come in ----------
export function skillQuality(skill: number): Quality { return (skill < 2 ? 0 : skill < 3.5 ? 1 : skill < 4.7 ? 2 : 3) as Quality; }
/** the quality a leader's crew turns out right now (before the lucky bump of a very happy leader) */
export function leaderQuality(n: Notable, craft: Craft): Quality {
  let q = skillQuality(n.skill[craft]) + (has(n, 'perfectionist') ? 1 : 0) - (n.mood < 30 ? 1 : 0);
  return clamp(q, 0, 3) as Quality;
}
export function moodSpeed(mood: number) { return 0.6 + mood * 0.008; }
export function crewSpeed(w: World, n: Notable, craft: Craft) {
  let s = moodSpeed(n.mood) * (1 + 0.06 * n.skill[craft]);
  if (has(n, 'taskmaster')) s *= 1.25;
  if (has(n, 'perfectionist')) s *= 0.8;
  return s * colonySpeed(w);
}
export function colonySpeed(w: World) {
  const ws = Math.max(1, workers(w));
  return (1 - 0.3 * Math.min(1, w.unfed / ws)) * (1 - 0.15 * Math.min(1, w.unhoused / Math.max(1, people(w))));
}

// ---------- the map ----------
export function createWorld(seed = Date.now() % 1e9): World {
  const W = 12, H = 16;
  const w: World = {
    seed, rng: (seed * 2654435761) >>> 0 || 1, hour: 7, w: W, h: H, terrain: new Array(W * H).fill('grass'),
    notables: [], buildings: [], nextId: 1, unled: 2,
    stock: Object.fromEntries((Object.keys(GOOD_NAME) as Good[]).map(g => [g, [0, 0, 0, 0]])) as Record<Good, number[]>,
    strain: 0, relations: {}, owned: [], charter: null, done: [], decisions: [], log: [],
    festivalDay: -99, nextCharterDay: 0, unfed: 0, unhoused: 0, outcome: null, endReason: '',
    stats: { joined: 0, left: 0, departed: [], drafted: [], finest: 0 },
  };
  for (let i = 0; i < 4; i++) rand(w);
  const set = (x: number, y: number, t: Terrain) => { if (tile(w, x, y)) w.terrain[y * W + x] = t; };
  // a lake on one side
  const right = rand(w) < 0.5, ly = 3 + Math.floor(rand(w) * 6);
  for (let y = ly; y < ly + 6; y++) for (let x = 0; x < 3; x++) {
    const xx = right ? W - 1 - x : x;
    if (x < 2 || rand(w) < 0.5 + (y > ly && y < ly + 5 ? 0.3 : 0)) set(xx, y, 'water');
  }
  // forest along the far edge and in clumps
  const top = rand(w) < 0.5;
  for (let x = 0; x < W; x++) for (let d = 0; d < 3; d++) if (d < 2 || rand(w) < 0.5) { const y = top ? d : H - 1 - d; if (tile(w, x, y) === 'grass') set(x, y, 'trees'); }
  for (let c = 0; c < 3; c++) {
    const cx = Math.floor(rand(w) * W), cy = 3 + Math.floor(rand(w) * (H - 6));
    for (let i = 0; i < 7; i++) { const x = cx + Math.floor(rand(w) * 3) - 1, y = cy + Math.floor(rand(w) * 3) - 1; if (tile(w, x, y) === 'grass') set(x, y, 'trees'); }
  }
  // berry bushes and soil
  const patch = (t: Terrain, n: number, size: number) => {
    for (let c = 0; c < n; c++) {
      const cx = 1 + Math.floor(rand(w) * (W - 3)), cy = 3 + Math.floor(rand(w) * (H - 7));
      for (let y = cy; y < cy + size; y++) for (let x = cx; x < cx + size; x++) if (tile(w, x, y) === 'grass' && (t === 'soil' || rand(w) < 0.6)) set(x, y, t);
    }
  };
  patch('bushes', 3, 2); patch('soil', 2, 3);
  // clear the middle for the hearth
  const hx = 5, hy = 7;
  for (let y = hy - 2; y < hy + 4; y++) for (let x = hx - 2; x < hx + 4; x++) set(x, y, 'grass');
  addBuilding(w, 'hearth', hx, hy, true);
  // starting buildings near what they need
  const spot = (def: string) => { const s = spots(w, def).sort((a, b) => Math.hypot(a[0] - hx, a[1] - hy) - Math.hypot(b[0] - hx, b[1] - hy))[0]; return s; };
  for (const def of ['leanto', 'leanto']) { const s = spot(def); if (s) addBuilding(w, def, s[0], s[1], true); }
  const fh = spot('forager'), wc = spot('woodcutter');
  if (!fh) { set(hx - 2, hy + 3, 'bushes'); set(hx - 1, hy + 3, 'bushes'); }
  const f = addBuilding(w, 'forager', ...(fh ?? spot('forager')!), true);
  const c = addBuilding(w, 'woodcutter', ...(wc ?? spot('woodcutter')!), true);
  // three notables: a forager, a woodcutter and a cook
  const a = newNotable(w, 'foraging'), b = newNotable(w, 'woodcutting'), k = newNotable(w, 'cooking');
  for (const n of [a, b, k]) addNotable(w, n);
  a.crew = 2; b.crew = 2; k.crew = 1;
  assign(w, a.id, f.id); assign(w, b.id, c.id);
  w.stock.berries[0] = 24; w.stock.wood[0] = 30; w.stock.stew[0] = 8;
  log(w, `${a.name}, ${b.name} and ${k.name} have arrived with their crews. ${first(k)} is a cook with no kitchen.`);
  updateHomes(w); for (const n of w.notables) { n.thoughts = thoughts(w, n); n.mood = clamp(50 + sum(n.thoughts), 0, 100); }
  return w;
}
const sum = (t: Thought[]) => t.reduce((a, x) => a + x.value, 0);

export function addBuilding(w: World, def: string, x: number, y: number, built = false): Building {
  const b: Building = { id: w.nextId++, def, x, y, built, progress: 0, leader: null, recipe: 0, batch: null, status: built ? '' : 'Building', workers: 0 };
  w.buildings.push(b); return b;
}
function footprint(def: BuildingDef, x: number, y: number) { const t: [number, number][] = []; for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) t.push([x + i, y + j]); return t; }
export function canPlace(w: World, defId: string, x: number, y: number): string | null {
  const def = BUILDING[defId];
  for (const [tx, ty] of footprint(def, x, y)) {
    const t = tile(w, tx, ty);
    if (!t) return 'Off the map';
    if (t === 'water' || t === 'trees' || t === 'bushes') return 'Something is in the way';
    if (defId === 'field' && t !== 'soil') return 'Needs good soil';
    if (w.buildings.some(b => footprint(BUILDING[b.def], b.x, b.y).some(([bx, by]) => bx === tx && by === ty))) return 'Something is in the way';
  }
  if (def.needs && def.needs !== 'soil') {
    let ok = false;
    for (let ty = y - 2; ty < y + def.h + 2 && !ok; ty++) for (let tx = x - 2; tx < x + def.w + 2; tx++) if (tile(w, tx, ty) === def.needs) { ok = true; break; }
    if (!ok) return { water: 'Must be by the water', trees: 'Must be near trees', bushes: 'Must be near berry bushes', grass: '', soil: '' }[def.needs];
  }
  return null;
}
export function spots(w: World, defId: string): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (!canPlace(w, defId, x, y)) out.push([x, y]);
  return out;
}

// ---------- notables ----------
export function newNotable(w: World, passion?: Craft): Notable {
  const crafts = Object.keys(CRAFT_NAME) as Craft[];
  passion ??= pick(w, crafts);
  const used = new Set(w.notables.map(n => n.name.split(' ')[0]));
  let name = ''; for (let i = 0; i < 20 && (!name || used.has(name)); i++) name = pick(w, FIRST);
  const skill = Object.fromEntries(crafts.map(c => [c, Math.floor(rand(w) * 12) / 10])) as Record<Craft, number>;
  skill[passion] = 1.5 + Math.floor(rand(w) * 13) / 10;
  const second = pick(w, crafts.filter(c => c !== passion)); skill[second] = Math.max(skill[second], 1 + Math.floor(rand(w) * 8) / 10);
  const traits: string[] = [];
  const nt = rand(w) < 0.55 ? 2 : 1;
  while (traits.length < nt) {
    const t = pick(w, TRAITS).id;
    if (traits.includes(t)) continue;
    if ((t === 'grumbler' && traits.includes('sunny')) || (t === 'sunny' && traits.includes('grumbler'))) continue;
    if ((t === 'taskmaster' && traits.includes('beloved')) || (t === 'beloved' && traits.includes('taskmaster'))) continue;
    traits.push(t);
  }
  const n: Notable = {
    id: w.nextId++, name: `${name} ${pick(w, LAST)}`, shirt: pick(w, SHIRTS), skin: pick(w, SKINS),
    passion, skill, traits, want: pick(w, Object.keys(WANTS) as WantId[]),
    mood: 55, thoughts: [], memories: [], workplace: null, crew: 0, rep: 0, home: null,
    meals: [], drank: [], lowHours: 0, offUntil: 0, worked: 0, hours: 0, noBed: false,
  };
  // feelings about the people already here, decided now so a draft card can show them
  for (const o of w.notables) {
    const r = rand(w);
    const op = r < 0.2 ? -40 - Math.floor(rand(w) * 25) : r < 0.4 ? 35 + Math.floor(rand(w) * 15) : Math.floor(rand(w) * 40) - 20;
    (n as Notable & { pending?: Record<number, number> }).pending ??= {};
    (n as Notable & { pending: Record<number, number> }).pending[o.id] = op;
  }
  return n;
}
export function pendingOpinions(n: Notable): Record<number, number> { return (n as Notable & { pending?: Record<number, number> }).pending ?? {}; }
export function addNotable(w: World, n: Notable) {
  for (const [id, op] of Object.entries(pendingOpinions(n))) if (notable(w, +id)) rel(w, n.id, +id).op = op;
  delete (n as Notable & { pending?: unknown }).pending;
  w.notables.push(n);
}

export function assign(w: World, nid: number, bid: number | null) {
  const n = notable(w, nid); if (!n) return;
  const old = building(w, n.workplace); if (old) old.leader = null;
  n.workplace = null;
  if (bid === null) return;
  const b = building(w, bid); if (!b || !BUILDING[b.def].craft) return;
  const prev = notable(w, b.leader); if (prev) prev.workplace = null;
  b.leader = n.id; n.workplace = b.id;
}

// ---------- commands ----------
export function place(w: World, defId: string, x: number, y: number): string | null {
  const def = BUILDING[defId];
  const why = canPlace(w, defId, x, y); if (why) return why;
  for (const [g, n] of Object.entries(def.cost) as [Good, number][]) if (total(w, g) < n) return `Needs ${n} ${GOOD_NAME[g].toLowerCase()}`;
  for (const [g, n] of Object.entries(def.cost) as [Good, number][]) take(w, g, n, 'low');
  addBuilding(w, defId, x, y, false);
  return null;
}
export function demolish(w: World, bid: number) {
  const b = building(w, bid); if (!b || b.def === 'hearth') return;
  const n = notable(w, b.leader); if (n) n.workplace = null;
  if (!b.built) for (const [g, v] of Object.entries(BUILDING[b.def].cost) as [Good, number][]) w.stock[g][0] += v;
  w.buildings = w.buildings.filter(x => x !== b);
}
export function setRecipe(w: World, bid: number, i: number) { const b = building(w, bid); if (b && b.recipe !== i) { b.recipe = i; b.batch = null; } }

export function festivalCost(w: World) { return w.notables.length + Math.ceil(workers(w) / 2); }
export function festivalReady(w: World) { return day(w) - w.festivalDay >= TUNE.festivalCooldown; }
export function cookedCount(w: World) { return DISHES.reduce((a, g) => a + total(w, g), 0); }
export function festival(w: World): string | null {
  if (!festivalReady(w)) return 'Too soon after the last one';
  const cost = festivalCost(w);
  if (cookedCount(w) < cost) return `Needs ${cost} cooked dishes`;
  takeDishes(w, cost, 'low');
  w.festivalDay = day(w);
  w.strain = Math.max(0, w.strain - TUNE.festivalRelief);
  for (const n of w.notables) remember(n, 'A festival!', 6, w.hour + 48);
  for (const a of w.notables) for (const b of w.notables) if (a.id < b.id) rel(w, a.id, b.id).op += 4;
  log(w, 'A festival at the hearth. Strain eases.', 'good');
  return null;
}

// ---------- stock ----------
function take(w: World, g: Good, n: number, prefer: 'low' | 'high'): number[] {
  const got = [0, 0, 0, 0];
  const order = prefer === 'low' ? [0, 1, 2, 3] : [3, 2, 1, 0];
  for (const q of order) { const t = Math.min(n, w.stock[g][q]); w.stock[g][q] -= t; got[q] += t; n -= t; if (n <= 0) break; }
  return got;
}
function takeDishes(w: World, n: number, prefer: 'low' | 'high') {
  const order = prefer === 'low' ? ['stew', 'smokedFish', 'bread', 'fishpie', 'pie'] as Good[] : ['pie', 'fishpie', 'bread', 'smokedFish', 'stew'] as Good[];
  for (const g of order) { const t = Math.min(n, total(w, g)); take(w, g, t, prefer); n -= t; if (n <= 0) return; }
}
/** take n of the given goods at quality q or better, best first */
function takeFrom(w: World, goods: Good[], n: number, q: number) {
  for (let qq = 3; qq >= q && n > 0; qq--) for (const g of goods) { const t = Math.min(n, w.stock[g][qq]); w.stock[g][qq] -= t; n -= t; }
}
export function atLeast(w: World, goods: Good[], q: Quality) { return goods.reduce((a, g) => a + w.stock[g].slice(q).reduce((x, y) => x + y, 0), 0); }

// ---------- production ----------
function inputsFor(w: World, r: Recipe): boolean {
  for (const [g, n] of Object.entries(r.take) as [Good, number][]) if (total(w, g) < n) return false;
  if (r.anyRaw && RAW_FOOD.reduce((a, g) => a + total(w, g), 0) < r.anyRaw) return false;
  return true;
}
function useInputs(w: World, r: Recipe) {
  for (const [g, n] of Object.entries(r.take) as [Good, number][]) take(w, g, n, 'low');
  let need = r.anyRaw ?? 0;
  while (need > 0) { const g = RAW_FOOD.slice().sort((a, b) => total(w, b) - total(w, a))[0]; take(w, g, 1, 'low'); need--; }
}
export function missing(w: World, r: Recipe): string {
  const out: string[] = [];
  for (const [g, n] of Object.entries(r.take) as [Good, number][]) if (total(w, g) < n) out.push(GOOD_NAME[g].toLowerCase());
  if (r.anyRaw && RAW_FOOD.reduce((a, g) => a + total(w, g), 0) < r.anyRaw) out.push('raw food');
  return out.join(', ');
}

function produce(w: World) {
  const h = hourOfDay(w);
  if (h < TUNE.workStart || h >= TUNE.workEnd) { for (const b of w.buildings) b.workers = 0; return; }
  // the commons: workers with no leader build first, then gather where no leader is
  let free = w.unled;
  const sites = w.buildings.filter(b => !b.built);
  for (const b of sites) {
    const def = BUILDING[b.def];
    const hands = Math.min(free, 3); free -= hands;
    b.workers = hands;
    b.progress += hands > 0 ? hands : 0.5; // with nobody free, everyone pitches in a little
    b.status = `Building ${Math.min(99, Math.floor((b.progress / def.work) * 100))}%`;
    if (b.progress >= def.work) { b.built = true; b.status = ''; log(w, `${def.name} finished.`, 'good'); }
  }
  const leaderless = w.buildings.filter(b => b.built && !b.leader && BUILDING[b.def].recipes?.[b.recipe] && Object.keys(BUILDING[b.def].recipes![b.recipe].take).length === 0 && !BUILDING[b.def].recipes![b.recipe].anyRaw);
  for (const b of w.buildings) if (b.built) b.workers = 0;
  for (let i = 0; free > 0 && leaderless.length; i++) { const b = leaderless[i % leaderless.length]; if (b.workers < 4) { b.workers++; free--; } else if (leaderless.every(x => x.workers >= 4)) break; }

  for (const b of w.buildings) {
    if (!b.built) continue;
    const def = BUILDING[b.def]; const r = def.recipes?.[b.recipe]; if (!r) continue;
    const n = notable(w, b.leader);
    let power = 0;
    if (n) {
      n.hours++;
      if (n.offUntil > w.hour) { b.status = 'Sent home'; b.workers = 0; continue; }
      b.workers = n.crew + 1;
      power = b.workers * crewSpeed(w, n, def.craft!);
    } else if (b.workers > 0) {
      power = b.workers * TUNE.unledSpeed * colonySpeed(w);
    } else { b.status = Object.keys(r.take).length || r.anyRaw ? 'Needs a leader' : 'Nobody here'; continue; }
    let made = false;
    for (let k = 0; k < 6; k++) {
      if (b.batch === null) {
        if (total(w, r.out) >= TUNE.stockCap) { b.status = `Plenty of ${GOOD_NAME[r.out].toLowerCase()}`; break; }
        if (!inputsFor(w, r)) { b.status = `Needs ${missing(w, r)}`; break; }
        useInputs(w, r); b.batch = 0;
      }
      const step = Math.min(power, r.work - b.batch);
      b.batch += step; power -= step; made = true;
      if (b.batch >= r.work - 1e-9) {
        let q: Quality = 0;
        if (n && DISHES.concat(DRINKS).includes(r.out)) {
          q = leaderQuality(n, def.craft!);
          if (n.mood >= 80 && rand(w) < 0.35) q = Math.min(3, q + 1) as Quality;
        }
        w.stock[r.out][q] += r.make;
        if (q >= 2) w.stats.finest = Math.max(w.stats.finest, q);
        if (w.charter?.id === 'timber' && r.out === 'planks') w.charter.made += r.make;
        if (w.charter?.id === 'hall' && r.out === 'planks') w.charter.made += r.make;
        b.batch = null;
      }
      if (power <= 1e-9) break;
    }
    if (made) {
      b.status = 'Working';
      if (n) {
        n.worked++;
        const c = def.craft!;
        n.skill[c] = Math.min(5, n.skill[c] + 0.006 * (c === n.passion ? 1.5 : 1) * (has(n, 'mentor') ? 2 : 1));
      }
    }
  }
}

// ---------- homes, meals, drinks ----------
function updateHomes(w: World) {
  for (const n of w.notables) n.home = null;
  const cozy = w.buildings.filter(b => b.built && BUILDING[b.def].cozy);
  const order = w.notables.slice().sort((a, b) => (b.want === 'homebody' ? 1 : 0) - (a.want === 'homebody' ? 1 : 0));
  for (const b of cozy) { let room = BUILDING[b.def].beds!; for (const n of order) if (room > 0 && n.home === null) { n.home = b.id; room--; } }
  let shackBeds = w.buildings.filter(b => b.built && b.def === 'leanto').reduce((a, b) => a + BUILDING[b.def].beds!, 0);
  const shack = w.buildings.find(b => b.built && b.def === 'leanto');
  for (const n of order) if (n.home === null && shackBeds > 0 && shack) { n.home = shack.id; shackBeds--; }
  w.unhoused = Math.max(0, workers(w) - shackBeds) + w.notables.filter(n => n.home === null).length;
}
export function freeBeds(w: World) {
  const beds = w.buildings.filter(b => b.built && BUILDING[b.def].beds).reduce((a, b) => a + BUILDING[b.def].beds!, 0);
  return beds - people(w);
}
export function dishValue(n: Notable, g: Good, q: number, d: number) {
  let v = (DISH_MOOD[g] ?? -4) + (DISH_MOOD[g] !== undefined ? QUALITY_MOOD[q] : 0);
  if (has(n, 'glutton')) v = Math.round(v * 1.5);
  if (n.want === 'sweetTooth' && g === 'pie') v += 3;
  if (n.want === 'gourmand' && !n.meals.some(m => m.good === g && d - m.day < 5)) v += 2;
  return v;
}
function supper(w: World) {
  const d = day(w); let allCooked = true;
  for (const n of w.notables) {
    let best: [Good, number, number] | null = null;
    for (const g of [...DISHES, ...RAW_FOOD]) for (let q = 3; q >= 0; q--) if (w.stock[g][q] > 0) { const v = dishValue(n, g, q, d); if (!best || v > best[2]) best = [g, q, v]; }
    if (!best) { remember(n, 'Went to bed hungry', -10, w.hour + 24); allCooked = false; continue; }
    w.stock[best[0]][best[1]]--;
    n.meals.push({ good: best[0], day: d }); n.meals = n.meals.filter(m => d - m.day < 6);
    const label = DISH_MOOD[best[0]] === undefined ? `Ate raw ${GOOD_NAME[best[0]].toLowerCase()}` : `${QUALITY_NAME[best[1]]} ${GOOD_NAME[best[0]].toLowerCase()} for supper`;
    remember(n, label, best[2], w.hour + 24, 'supper');
    if (DISH_MOOD[best[0]] === undefined) allCooked = false;
    if (best[1] >= 2 && DISH_MOOD[best[0]] !== undefined && w.charter?.id === 'goodstuff') w.charter.eaten++;
  }
  // workers eat the plainest food first and leave combined dishes for the notables
  let hungry = workers(w);
  const order: Good[] = ['stew', 'smokedFish', 'bread', 'berries', 'fish', 'fishpie', 'pie'];
  for (const g of order) {
    for (let q = 0; q < 4 && hungry > 0; q++) { const t = Math.min(hungry, w.stock[g][q]); w.stock[g][q] -= t; hungry -= t; if (t && RAW_FOOD.includes(g)) allCooked = false; }
  }
  w.unfed = hungry;
  if (hungry > 0) { allCooked = false; w.strain += hungry * TUNE.strainUnfed; log(w, `${hungry} worker${hungry > 1 ? 's' : ''} went to bed hungry.`, 'bad'); }
  if (w.charter?.id === 'suppers') w.charter.streak = allCooked ? w.charter.streak + 1 : 0;
}
function evening(w: World) {
  const d = day(w);
  const tavern = w.buildings.some(b => b.built && BUILDING[b.def].tavern);
  if (tavern) {
    let served = 0;
    for (const n of w.notables) {
      let best: [Good, number] | null = null;
      for (const g of DRINKS) for (let q = 3; q >= 0; q--) if (w.stock[g][q] > 0 && (!best || q > best[1])) best = [g, q];
      if (!best) continue;
      w.stock[best[0]][best[1]]--; served++;
      n.drank.push(d); n.drank = n.drank.filter(x => d - x < 4);
      remember(n, `${QUALITY_NAME[best[1]]} ${GOOD_NAME[best[0]].toLowerCase()} at the tavern`, 2 + QUALITY_MOOD[best[1]], w.hour + 24, 'drink');
    }
    if (served >= 2) { w.strain = Math.max(0, w.strain - TUNE.tavernRelief); for (const a of w.notables) for (const b of w.notables) if (a.id < b.id && a.drank.includes(d) && b.drank.includes(d)) rel(w, a.id, b.id).op += 1; }
  }
  // neighbours warm up or fall out
  for (const a of w.notables) for (const b of neighbours(w, a)) if (a.id < b.id) {
    const r = rel(w, a.id, b.id);
    if (a.mood >= 60 && b.mood >= 60) r.op += 5;
    else if (a.mood < 40 || b.mood < 40) r.op -= 3;
    if (has(a, 'hothead') || has(b, 'hothead')) r.op -= 2;
    if (has(a, 'grumbler') || has(b, 'grumbler')) r.op -= 1;
    if (has(a, 'sunny') || has(b, 'sunny')) r.op += 1;
    r.op = clamp(r.op, -100, 100);
  }
  growCrews(w);
  w.strain += TUNE.strainPerDay + Math.max(0, people(w) - 12) * 0.06;
  if (w.unhoused > 0) w.strain += w.unhoused * TUNE.strainUnhoused;
  w.strain = clamp(w.strain, 0, 100);
}
export const joinThreshold = (n: Notable) => TUNE.joinAt + (has(n, 'taskmaster') ? 2 : 0) - (has(n, 'beloved') ? 1 : 0);
/** each leader's crew grows from how well the leader is doing, and shrinks under a miserable one */
function growCrews(w: World) {
  for (const n of w.notables) {
    const perf = n.hours ? n.worked / n.hours : 0;
    n.worked = 0; n.hours = 0;
    if (n.workplace === null) continue;
    const joinAt = joinThreshold(n);
    if (perf >= 0.6 && n.mood >= 50) n.rep = Math.min(joinAt, n.rep + 1 + (n.mood >= 75 ? 1 : 0));
    else if (n.mood < 30) n.rep -= 1;
    n.noBed = false;
    if (n.rep >= joinAt && n.crew < TUNE.crewCap) {
      if (freeBeds(w) > 0) { n.crew++; n.rep = 0; w.stats.joined++; remember(n, 'A new hand joined my crew', 3, w.hour + 24); log(w, `A newcomer joins ${first(n)}'s crew.`, 'good'); }
      else if (w.unled > 0) { n.crew++; w.unled--; n.rep = 0; remember(n, 'A new hand joined my crew', 3, w.hour + 24); log(w, `A worker from the commons joins ${first(n)}'s crew.`, 'good'); }
      else { n.rep = joinAt; n.noBed = true; }
    }
    if (n.rep <= TUNE.leaveAt && n.crew > 0) { n.crew--; w.unled++; n.rep = 0; w.stats.left++; log(w, `A worker walks off ${first(n)}'s crew to the commons.`, 'bad'); }
  }
}

// ---------- mood ----------
export function remember(n: Notable, label: string, value: number, until: number, slot?: string) {
  if (slot) n.memories = n.memories.filter(m => (m as Memory & { slot?: string }).slot !== slot);
  const m: Memory & { slot?: string } = { label, value, until }; if (slot) m.slot = slot;
  n.memories.push(m);
}
export function wantMet(w: World, n: Notable): boolean {
  const d = day(w);
  switch (n.want) {
    case 'sweetTooth': return n.meals.some(m => m.good === 'pie' && d - m.day < 3);
    case 'tippler': return n.drank.filter(x => d - x < 4).length >= 3;
    case 'homebody': return !!(n.home && BUILDING[building(w, n.home)!.def].cozy);
    case 'greenThumb': { const b = building(w, n.workplace); return !!b && w.buildings.some(o => o.built && o.def === 'flowerbed' && gap(b, o) <= 1); }
    case 'gourmand': return new Set(n.meals.filter(m => d - m.day < 5 && DISH_MOOD[m.good] !== undefined).map(m => m.good)).size >= 3;
  }
}
export function thoughts(w: World, n: Notable): Thought[] {
  const t: Thought[] = [];
  for (const m of n.memories) if (m.until > w.hour) t.push({ label: m.label, value: m.value });
  const want = WANTS[n.want];
  t.push(wantMet(w, n) ? { label: want.met, value: 6 } : { label: want.unmet, value: -4 });
  const home = building(w, n.home);
  if (!home) t.push({ label: 'No bed of my own', value: -8 });
  else if (BUILDING[home.def].cozy && n.want !== 'homebody') t.push({ label: 'A cosy cottage', value: 3 });
  const wp = building(w, n.workplace);
  if (!wp) t.push({ label: 'Nothing to lead', value: -4 });
  else {
    const craft = BUILDING[wp.def].craft!;
    if (craft === n.passion) t.push({ label: `Doing what I love (${CRAFT_NAME[craft].toLowerCase()})`, value: 5 });
    else t.push({ label: `Would rather be ${CRAFT_NAME[n.passion].toLowerCase()}`, value: -4 });
    if (n.crew >= 5) t.push({ label: 'Proud of a big crew', value: 3 });
    for (const o of neighbours(w, n)) {
      const b = bond(w, n.id, o.id);
      if (b === 'rival') t.push({ label: `Has to see ${first(o)} all day`, value: -8 });
      else if (b === 'friend') t.push({ label: `Works near ${first(o)}`, value: 3 });
      else if (b === 'ex') t.push({ label: `${first(o)} works right there`, value: -5 });
      if (has(o, 'grumbler')) t.push({ label: `${first(o)}'s grumbling`, value: -3 });
      if (has(o, 'sunny')) t.push({ label: `${first(o)} is a ray of sunshine`, value: 3 });
    }
    if (has(n, 'loner') && neighbours(w, n, 2).length) t.push({ label: 'Too many people around', value: -5 });
  }
  for (const o of w.notables) if (o !== n && bond(w, n.id, o.id) === 'partner') t.push({ label: `In love with ${first(o)}`, value: 6 });
  if (has(n, 'sunny')) t.push({ label: 'Sunny disposition', value: 4 });
  if (w.unfed > 0 && n.crew > 0) t.push({ label: 'The workers went hungry', value: -3 });
  const s = Math.floor(w.strain / 8); if (s > 0) t.push({ label: 'Frontier strain', value: -s });
  return t.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}
function updateMoods(w: World) {
  for (const n of w.notables) {
    n.memories = n.memories.filter(m => m.until > w.hour);
    n.thoughts = thoughts(w, n);
    const target = clamp(50 + sum(n.thoughts), 0, 100);
    n.mood += (target - n.mood) * 0.12;
  }
}
export function moodTarget(n: Notable) { return clamp(50 + sum(n.thoughts), 0, 100); }

// ---------- drafts, charters, events ----------
function offerBlueprints(w: World) {
  const pool = DRAFT_POOL.filter(d => !w.owned.includes(d));
  if (!pool.length) return;
  const opts: string[] = [];
  while (opts.length < Math.min(3, pool.length)) { const p = pick(w, pool); if (!opts.includes(p)) opts.push(p); }
  w.decisions.push({ kind: 'blueprint', options: opts });
}
function offerNotables(w: World) {
  const crafts = new Set<Craft>(); const opts: Notable[] = [];
  for (let i = 0; i < 12 && opts.length < 3; i++) { const n = newNotable(w); if (crafts.has(n.passion)) continue; crafts.add(n.passion); opts.push(n); }
  w.decisions.push({ kind: 'notable', options: opts });
}
function worstPair(w: World): [number, number] | null {
  let best: [number, number] | null = null, low = -25;
  for (const a of w.notables) for (const b of w.notables) if (a.id < b.id && rel(w, a.id, b.id).op <= low && rel(w, a.id, b.id).kind !== 'partner') { low = rel(w, a.id, b.id).op; best = [a.id, b.id]; }
  return best;
}
function offerCharters(w: World) {
  const tier = (w.done.length + 1) as 1 | 2 | 3;
  const opts = CHARTERS.filter(c => c.tier === tier && (c.id !== 'hatchet' || worstPair(w))).map(c => c.id);
  w.decisions.push({ kind: 'charter', options: opts });
}
export function pickCharter(w: World, id: CharterId) {
  w.charter = { id, start: w.hour, streak: 0, made: 0, eaten: 0 };
  if (id === 'hatchet') w.charter.pair = worstPair(w) ?? undefined;
  log(w, `The Crown's charter: ${CHARTER[id].name}.`, 'info');
}

export interface Part { label: string; have: number; need: number }
/** a charter's progress, as parts the UI shows as a strip */
export function charterParts(w: World): Part[] {
  const c = w.charter; if (!c) return [];
  const crewMax = Math.max(0, ...w.notables.map(n => n.crew));
  switch (c.id) {
    case 'suppers': return [{ label: 'cooked suppers for all', have: c.streak, need: 3 }];
    case 'timber': return [{ label: 'planks made', have: c.made, need: 25 }];
    case 'bigcrew': return [{ label: 'biggest crew', have: crewMax, need: 5 }];
    case 'wedding': {
      const couple = w.notables.some(a => w.notables.some(b => a.id < b.id && rel(w, a.id, b.id).kind === 'partner'));
      return [{ label: 'a couple', have: couple ? 1 : 0, need: 1 }, { label: 'good+ dishes (not stew)', have: atLeast(w, PROPER, 1), need: 14 }];
    }
    case 'hatchet': { const p = c.pair; const op = p ? rel(w, p[0], p[1]).op : 0; return [{ label: 'feeling', have: Math.round(op), need: 20 }]; }
    case 'goodstuff': return [{ label: 'fine meals eaten', have: c.eaten, need: 16 }];
    case 'longtable': return [
      { label: 'notables', have: w.notables.length, need: 6 },
      { label: 'fine pies', have: atLeast(w, PIES, 2), need: Math.max(6, w.notables.length) },
      { label: 'dishes', have: cookedCount(w), need: Math.max(6, w.notables.length) + workers(w) },
    ];
    case 'hall': return [{ label: 'planks', have: total(w, 'planks'), need: 50 }, { label: 'notables at 65+', have: w.notables.filter(n => n.mood >= 65).length, need: 4 }];
    case 'guilds': return [{ label: 'crews of 5', have: w.notables.filter(n => n.crew >= 5).length, need: 4 }];
  }
}
/** charters that finish with a button press (they spend goods) */
export function charterAction(w: World): string | null {
  const c = w.charter; if (!c) return null;
  if (c.id === 'wedding') return 'Hold the wedding';
  if (c.id === 'longtable') return 'Call the feast';
  if (c.id === 'hall') return 'Raise the hall';
  return null;
}
export const partsMet = (w: World) => charterParts(w).every(p => p.have >= p.need);
export function doCharterAction(w: World): string | null {
  const c = w.charter; if (!c || !charterAction(w)) return null;
  if (!partsMet(w)) return 'Not ready yet';
  if (c.id === 'wedding') { takeFrom(w, PROPER, 14, 1); for (const n of w.notables) remember(n, 'A lovely wedding', 10, w.hour + 72); }
  if (c.id === 'longtable') { const k = Math.max(6, w.notables.length); takeFrom(w, PIES, k, 2); takeDishes(w, workers(w), 'low'); for (const n of w.notables) remember(n, 'The Long Table!', 15, w.hour + 72); }
  if (c.id === 'hall') take(w, 'planks', 50, 'low');
  completeCharter(w);
  return null;
}
function completeCharter(w: World) {
  const c = w.charter!; w.done.push(c.id); w.charter = null;
  w.strain = Math.max(0, w.strain - TUNE.charterRelief);
  log(w, `Charter complete: ${CHARTER[c.id].name}!`, 'good');
  if (w.done.length >= 3) { w.outcome = 'won'; w.endReason = `${CHARTER[c.id].name}: Mumblewood is a town.`; return; }
  w.decisions.push({ kind: 'reward' });
  w.nextCharterDay = day(w) + 1;
}
function checkCharter(w: World) {
  if (!w.charter || charterAction(w)) return;
  if (partsMet(w)) completeCharter(w);
}

function event(w: World) {
  const ns = w.notables;
  const opts: (() => boolean)[] = [];
  // rivals working side by side come to blows
  for (const a of ns) for (const b of neighbours(w, a)) if (a.id < b.id) {
    const op = rel(w, a.id, b.id).op;
    if (op <= -30 && (has(a, 'hothead') || has(b, 'hothead') || op <= -60)) opts.push(() => {
      w.decisions.push({ kind: 'event', id: 'fight', title: `${first(a)} and ${first(b)} came to blows`, text: `Words were had over the fence between their workplaces, then fists.`, data: [a.id, b.id],
        options: [{ label: 'Send them both home today', detail: 'Both crews stop work until tomorrow. No hard feelings.' }, { label: 'Let them sort it out', detail: 'Both −10 for 2 days, and they like each other even less.' }] });
      return true;
    });
  }
  // friends fall for each other
  const charterLove = w.charter?.id === 'wedding' ? 2 : 1;
  for (const a of ns) for (const b of ns) if (a.id < b.id) {
    const r = rel(w, a.id, b.id);
    const taken = (x: Notable) => ns.some(o => o !== x && rel(w, x.id, o.id).kind === 'partner');
    if (r.op >= 55 && r.kind === null && !taken(a) && !taken(b) && (has(a, 'romantic') || has(b, 'romantic') || rand(w) < 0.3 * charterLove)) opts.push(() => {
      w.decisions.push({ kind: 'event', id: 'romance', title: `${first(a)} and ${first(b)} are sweet on each other`, text: 'They’ve been seen sharing a bench at the hearth, and a pie.', data: [a.id, b.id],
        options: [{ label: 'Bless it', detail: 'They become a couple. In love: +6 each, more near each other.' }, { label: 'Not on my frontier', detail: 'Both −6 for 2 days.' }] });
      return true;
    });
    if (r.kind === 'partner' && (a.mood < 35 || b.mood < 35 || r.op < 20) && rand(w) < 0.4) opts.push(() => {
      r.kind = 'ex'; r.op = Math.min(r.op, 0) - 30;
      for (const x of [a, b]) remember(x, 'Heartbroken', has(x, 'romantic') ? -24 : -12, w.hour + 96);
      w.decisions.push({ kind: 'event', id: 'info', title: `${first(a)} and ${first(b)} have split up`, text: 'It was loud, and in front of the whole hearth. Keep them apart for a while.', data: [], options: [{ label: 'Oh dear', detail: '' }] });
      return true;
    });
  }
  // a family looking for work: who do they follow?
  if (rand(w) < 0.35) opts.push(() => {
    const fam = 2 + Math.floor(rand(w) * 2);
    const leaders = ns.filter(n => n.workplace !== null && n.crew + fam <= TUNE.crewCap);
    const beds = freeBeds(w);
    w.decisions.push({ kind: 'event', id: 'family', title: `A family of ${fam} looking for work`, text: `They need ${fam} beds; you have ${Math.max(0, beds)} free. Workers without beds add strain.`, data: [fam, ...leaders.map(n => n.id)],
      options: [...leaders.map(n => ({ label: `Join ${first(n)}'s crew`, detail: `${CRAFT_NAME[BUILDING[building(w, n.workplace)!.def].craft!]} · crew ${n.crew} → ${n.crew + fam}` })), { label: 'Send them to the commons', detail: 'They gather and build where no leader is.' }, { label: 'Turn them away', detail: '' }] });
    return true;
  });
  if (!opts.length || rand(w) > 0.55) return;
  pick(w, opts)();
}
export function resolveEvent(w: World, d: Extract<Decision, { kind: 'event' }>, i: number) {
  const [a, b] = d.data.map(id => notable(w, id));
  if (d.id === 'fight' && a && b) {
    if (i === 0) { a.offUntil = b.offUntil = w.hour + (TUNE.workEnd - hourOfDay(w)); log(w, `${first(a)} and ${first(b)} sent home to cool off.`); }
    else { remember(a, `Fought with ${first(b)}`, -10, w.hour + 48); remember(b, `Fought with ${first(a)}`, -10, w.hour + 48); rel(w, a.id, b.id).op -= 8; }
  }
  if (d.id === 'romance' && a && b) {
    if (i === 0) { rel(w, a.id, b.id).kind = 'partner'; rel(w, a.id, b.id).op += 10; log(w, `${first(a)} and ${first(b)} are a couple.`, 'good'); }
    else { remember(a, 'Love forbidden', -6, w.hour + 48); remember(b, 'Love forbidden', -6, w.hour + 48); }
  }
  if (d.id === 'family') {
    const fam = d.data[0], leaders = d.data.slice(1);
    if (i < leaders.length) { const n = notable(w, leaders[i])!; n.crew += fam; w.stats.joined += fam; remember(n, 'A new family joined my crew', 4, w.hour + 48); log(w, `A family of ${fam} joins ${first(n)}'s crew.`, 'good'); }
    else if (i === leaders.length) { w.unled += fam; w.stats.joined += fam; log(w, `A family of ${fam} joins the commons.`); }
  }
  if (d.id === 'departure') {
    const crew = d.data[0], leaders = d.data.slice(1);
    if (i < leaders.length) { notable(w, leaders[i])!.crew += crew; } else w.unled += crew;
  }
}
/** a leader below 15 for a whole day leaves; their crew stays and the player places them */
function departures(w: World) {
  for (const n of w.notables.slice()) {
    n.lowHours = n.mood < 15 ? n.lowHours + 1 : 0;
    if (n.lowHours < 24) continue;
    assign(w, n.id, null);
    w.notables = w.notables.filter(x => x !== n);
    w.stats.departed.push(n.name);
    log(w, `${n.name} has left Mumblewood.`, 'bad');
    const crew = n.crew;
    if (!w.notables.length) { w.outcome = 'lost'; w.endReason = 'Every notable has left.'; return; }
    const leaders = w.notables.filter(o => o.workplace !== null && o.crew + crew <= TUNE.crewCap);
    w.decisions.push({ kind: 'event', id: 'departure', title: `${n.name} has had enough`, text: `${first(n)} packed up and left. ${crew ? `Their crew of ${crew} is staying. Who takes them on?` : ''}`, data: [crew, ...leaders.map(o => o.id)],
      options: crew ? [...leaders.map(o => ({ label: `${first(o)}'s crew`, detail: `${o.crew} → ${o.crew + crew}` })), { label: 'The commons', detail: 'They gather and build where no leader is.' }] : [{ label: 'So be it', detail: '' }] });
  }
}

export function choose(w: World, i: number) {
  const d = w.decisions.shift(); if (!d) return;
  if (d.kind === 'charter') pickCharter(w, d.options[i]);
  if (d.kind === 'blueprint') { w.owned.push(d.options[i]); w.stats.drafted.push(d.options[i]); log(w, `New blueprint: ${BUILDING[d.options[i]].name}.`, 'good'); }
  if (d.kind === 'notable') { const n = d.options[i]; addNotable(w, n); n.crew = 1; log(w, `${n.name} arrives with one helper.`, 'good'); }
  if (d.kind === 'reward') { if (i === 0) offerNotables(w); else offerBlueprints(w); }
  if (d.kind === 'event') resolveEvent(w, d, i);
}

// ---------- the clock ----------
export function tick(w: World) {
  if (w.outcome) return;
  w.hour++;
  const h = hourOfDay(w), d = day(w);
  updateHomes(w);
  produce(w);
  if (h === TUNE.supper) supper(w);
  if (h === TUNE.evening) evening(w);
  if (h === TUNE.morning) {
    if (!w.charter && !w.outcome && w.done.length < 3 && w.nextCharterDay && d >= w.nextCharterDay) { w.nextCharterDay = 0; offerCharters(w); }
    if (TUNE.blueprintDays.includes(d)) offerBlueprints(w);
    if (TUNE.notableDays.includes(d)) offerNotables(w);
    if (d >= 3) event(w);
  }
  updateMoods(w);
  departures(w);
  checkCharter(w);
  if (w.strain >= 100) { w.outcome = 'lost'; w.endReason = 'Frontier strain broke the colony.'; }
}
export function runHours(w: World, n: number) { for (let i = 0; i < n && !w.outcome; i++) { if (w.decisions.length) return; tick(w); } }
/** the first charter offer comes straight away */
export function start(w: World) { offerCharters(w); offerBlueprints(w); }
