// Deterministic colony simulation. No DOM, no rendering: runs in the browser and in Node.
import {
  BUILDING_BY_ID, BuildingDef, CHARTERS, CharterDef, EVENTS, FIRST_NAMES, JOB_NAMES, JobKind,
  MEALS, PERKS, RAW_FOODS, ResourceId, SHIRTS, SKINS, SURNAMES, TRAITS, TRAIT_BY_ID, BUILDINGS, buildWork,
  JOB_KINDS, JOB_EVENTS, JobEventDef, ILLNESSES,
} from './content';

// ---------- RNG ----------
export function nextRand(w: { rngState: number }): number {
  let t = (w.rngState = (w.rngState + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (w: World, lo: number, hi: number) => lo + Math.floor(nextRand(w) * (hi - lo + 1));
const pick = <T>(w: World, arr: T[]): T => arr[Math.floor(nextRand(w) * arr.length)];
function shuffle<T>(w: World, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(nextRand(w) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- Types ----------
export interface Memory { key: string; label: string; value: number; until: number }
export interface Thought { label: string; value: number }
export type Activity = 'working' | 'idle' | 'leisure' | 'sleeping' | 'sulking' | 'eating' | 'hauling' | 'building' | 'cleaning' | 'sick' | 'errand';
export interface Illness { id: string; name: string; severity: number; worsen: number; contagious: boolean }
/** a short job created by an event; someone has to be sent to do it */
export interface Errand {
  id: number; def: string; title: string; text: string;
  hours: number; done: number; deadline: number;
  skill?: JobKind; x: number; y: number;
  assignee: number | null; pair?: [number, number];
}
export type Difficulty = 'gentle' | 'normal' | 'harsh';
export const DIFFICULTY_STRAIN: Record<Difficulty, number> = { gentle: 0.65, normal: 1, harsh: 1.5 };
export type Task =
  | { kind: 'deliver'; site: number; res: ResourceId; amount: number }
  | { kind: 'haul'; from: number; res: ResourceId; amount: number }
  | { kind: 'supply'; to: number; res: ResourceId; amount: number }
  | { kind: 'build'; site: number }
  | { kind: 'pave'; x: number; y: number; progress: number }
  | { kind: 'clean'; building: number };
export interface Carry { res: ResourceId; amount: number }

export interface Colonist {
  id: number; name: string; traits: string[]; likes: JobKind; dislikes: JobKind;
  shirt: number; skin: number;
  x: number; y: number; px: number; py: number; jitter: number;
  path: { x: number; y: number }[]; goalKey: string; goalReached: boolean;
  hunger: number; fun: number; mood: number; moodTarget: number;
  sulking: boolean; lowMoodHours: number; left: boolean;
  job: number | null; bed: number | null; partner: number | null;
  task: Task | null; carrying: Carry | null;
  meal: { at: number | null; until: number } | null; // eating: where, and when finished (until = 0 while walking there)
  activity: Activity; place: number | null; inside: number | null;
  memories: Memory[]; thoughts: Thought[];
  hadCompany: boolean; hadCompanyLastNight: boolean; drankTonight: boolean;
  joinedDay: number;
  /** smoothed beauty of where they've been lately */
  beauty: number;
  /** 1 to 10 per kind of work; 5 is average */
  skills: Record<JobKind, number>;
  illness: Illness | null;
  /** id of the errand they've been sent on */
  errand: number | null;
  died: boolean;
  starvingHours: number;
}
export interface Building {
  uid: number; def: string; x: number; y: number;
  built: boolean; progress: number;
  delivered: Partial<Record<ResourceId, number>>;
  outbox: Partial<Record<ResourceId, number>>;
  /** ingredients carried in, waiting to be used */
  inbox: Partial<Record<ResourceId, number>>;
  clean: number;
  /** output multiplier from what's nearby (trees, bushes, water) */
  eff: number;
}

export type Decision =
  | { kind: 'charter'; tier: 1 | 2 | 3; options: string[] }
  | { kind: 'blueprint'; options: string[] }
  | { kind: 'recruit'; options: Colonist[] }
  | { kind: 'perk'; options: string[] }
  | { kind: 'event'; eventId: string }
  | { kind: 'errand'; errandId: number };

export interface LogEntry { day: number; hour: number; text: string; tone: 'good' | 'bad' | 'neutral' | 'love' }

export interface World {
  seed: number; rngState: number;
  hour: number; // absolute hours since start (day 1, 06:00 = hour 6)
  colonists: Colonist[]; buildings: Building[];
  /** per tile: 0 grass, 1 tree, 2 berry bush, 3 water */
  terrain: number[];
  /** per tile: 0 none, 1 planned path, 2 laid path */
  paths: number[];
  res: Record<ResourceId, number>;
  owned: string[]; perks: string[];
  charterTier: number; charter: string | null; charterHours: number; chartersDone: string[];
  decisions: Decision[]; log: LogEntry[];
  opinions: Record<string, number>;
  status: 'playing' | 'won' | 'lost';
  strain: number; nextEventHour: number;
  errands: Errand[]; nextErrandId: number;
  /** stats when the current charter began, for "since" charters */
  charterBase: { cured: number; errands: number };
  /** someone ate without a table this hour */
  ateOffTable: boolean;
  /** foods colonists are not allowed to eat (kept for charters, feasts and trade) */
  forbidden: ResourceId[];
  difficulty: Difficulty;
  nextUid: number; nextColonistId: number;
  autoAssignNew: boolean;
  stats: { peakPop: number; couples: number; breakups: number; departures: number; mealsEaten: number; built: number; cured: number; errands: number; deaths: number };
  version: number; // bumps when buildings change shape or state, for the renderer
}

export const TICKS_PER_HOUR = 6;
export const MAP_SIZE = 32;
export const CENTER = 16;
/** buildings must sit inside [BUILD_MIN, BUILD_MAX] */
export const BUILD_MIN = 2, BUILD_MAX = MAP_SIZE - 3;
/** The colony collapses when this many settlers have left. */
export const MAX_DEPARTURES = 6;
/** Workshops won't burn the last of the wood. */
export const WOOD_RESERVE = 20;
export const CARRY = 15;
/** a blueprint draft and a recruit draft each come this many days apart */
export const DRAFT_EVERY = 2;
export const OUTBOX_CAP = 15;
const WALK_SPEED = 7; // tiles per hour
export const PATH_SPEED = 1.25;
export const INBOX_TARGET = 12;
export const T_GRASS = 0, T_TREE = 1, T_BUSH = 2, T_WATER = 3;

// ---------- Helpers ----------
export const day = (w: World) => Math.floor(w.hour / 24) + 1;
export const hourOfDay = (w: World) => w.hour % 24;
export const alive = (w: World) => w.colonists.filter(c => !c.left);
const has = (c: Colonist, t: string) => c.traits.includes(t);
const hasPerk = (w: World, p: string) => w.perks.includes(p);
export const bdef = (b: Building): BuildingDef => BUILDING_BY_ID[b.def];
export const buildingByUid = (w: World, uid: number | null) => (uid == null ? undefined : w.buildings.find(b => b.uid === uid));
export const colonistById = (w: World, id: number | null) => (id == null ? undefined : w.colonists.find(c => c.id === id));
const okey = (a: number, b: number) => `${a}>${b}`;
export const opinion = (w: World, from: number, to: number) => w.opinions[okey(from, to)] ?? 0;
export const first = (c: Colonist) => c.name.split(' ')[0];
export const built = (w: World) => w.buildings.filter(b => b.built);
const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((n, v) => n + (v ?? 0), 0);

function changeOpinion(w: World, from: Colonist, to: Colonist, delta: number) {
  if (has(to, 'drama') || has(from, 'drama')) delta *= 2;
  const k = okey(from.id, to.id);
  w.opinions[k] = Math.max(-100, Math.min(100, (w.opinions[k] ?? 0) + delta));
}
function addLog(w: World, text: string, tone: LogEntry['tone'] = 'neutral') {
  w.log.push({ day: day(w), hour: Math.floor(hourOfDay(w)), text, tone });
  if (w.log.length > 200) w.log.shift();
}
function addMemory(w: World, c: Colonist, key: string, label: string, value: number, hours: number) {
  const until = w.hour + hours;
  const existing = c.memories.find(m => m.key === key);
  if (existing) { existing.until = until; existing.value = value; existing.label = label; }
  else c.memories.push({ key, label, value, until });
}
export function workersAt(w: World, uid: number) { return alive(w).filter(c => c.job === uid); }
export function beds(w: World) { return built(w).reduce((n, b) => n + (bdef(b).beds ?? 0), 0); }
export function foodTotal(w: World) { return [...RAW_FOODS, ...MEALS].reduce((n, r) => n + w.res[r], 0); }
export function mealTotal(w: World) { return MEALS.reduce((n, r) => n + w.res[r], 0); }
export function avgMood(w: World) { const a = alive(w); return a.length ? a.reduce((s, c) => s + c.mood, 0) / a.length : 0; }
export function couples(w: World) { return alive(w).filter(c => c.partner != null && c.id < c.partner).length; }
function hasBuilt(w: World, def: string) { return w.buildings.some(b => b.def === def && b.built); }
export function storageCap(w: World) { return built(w).reduce((n, b) => n + (bdef(b).storage ?? 0), 0); }
export function stored(w: World) { return sum(w.res); }
export function storageFree(w: World) { return Math.max(0, storageCap(w) - stored(w)); }
export function keepsFresh(w: World) { return built(w).some(b => bdef(b).keepsFresh); }
/** settlers lost to leaving or dying; the colony collapses at MAX_DEPARTURES */
export function lost(w: World) { return w.stats.departures + w.stats.deaths; }
export function laborers(w: World) { return alive(w).filter(c => c.job == null); }

// ---------- Terrain ----------
const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
/** what's on a tile; everything past the map edge is forest */
export function terrainAt(w: World, x: number, y: number) { return inMap(x, y) ? w.terrain[y * MAP_SIZE + x] : T_TREE; }
export function pathAt(w: World, x: number, y: number) { return inMap(x, y) ? w.paths[y * MAP_SIZE + x] : 0; }

function genTerrain(w: World) {
  const t = new Array(MAP_SIZE * MAP_SIZE).fill(T_GRASS);
  const set = (x: number, y: number, v: number) => { if (inMap(x, y) && Math.hypot(x + 0.5 - CENTER, y + 0.5 - CENTER) > 4.5) t[y * MAP_SIZE + x] = v; };
  for (let x = 0; x < MAP_SIZE; x++) for (let y = 0; y < MAP_SIZE; y++) if (x < BUILD_MIN || y < BUILD_MIN || x > BUILD_MAX || y > BUILD_MAX) t[y * MAP_SIZE + x] = T_TREE;
  const blob = (cx: number, cy: number, r: number, v: number, density: number) => {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d < 1 && nextRand(w) < density * (1.15 - d * 0.6)) set(x, y, v);
    }
  };
  const around = (minR: number, maxR: number) => { const a = nextRand(w) * Math.PI * 2, r = minR + nextRand(w) * (maxR - minR); return { x: CENTER + Math.cos(a) * r, y: CENTER + Math.sin(a) * r }; };
  // a pond, three groves, three berry patches, scattered at different angles from the hearth
  const pond = around(8, 10.5);
  for (let x = Math.floor(pond.x - 4); x <= pond.x + 4; x++) for (let y = Math.floor(pond.y - 4); y <= pond.y + 4; y++) {
    const d = Math.hypot((x + 0.5 - pond.x) / 2.8, (y + 0.5 - pond.y) / 2.1);
    if (d < 1 + (nextRand(w) - 0.5) * 0.25 && x >= BUILD_MIN && y >= BUILD_MIN && x <= BUILD_MAX && y <= BUILD_MAX) set(x, y, T_WATER);
  }
  for (let i = 0; i < 3; i++) { const g = around(7, 11); blob(g.x, g.y, 2.6 + nextRand(w), T_TREE, 0.75); }
  for (let i = 0; i < 3; i++) { const g = around(5.5, 10); blob(g.x, g.y, 1.7, T_BUSH, 0.8); }
  w.terrain = t;
  w.paths = new Array(MAP_SIZE * MAP_SIZE).fill(0);
}

/** would a building here sit on top of a laid path? */
export function coversPath(w: World, defId: string, x: number, y: number) {
  const d = BUILDING_BY_ID[defId];
  for (let tx = x; tx < x + d.w; tx++) for (let ty = y; ty < y + d.h; ty++) if (pathAt(w, tx, ty) === 2) return true;
  return false;
}

/** how well a building would work at (x, y), from 0.15 to 1 */
export function efficiencyAt(w: World, defId: string, x: number, y: number): { eff: number; count: number; label: string } {
  const d = BUILDING_BY_ID[defId];
  const cx = x + d.w / 2, cy = y + d.h / 2;
  const count = (kind: number, r: number) => {
    let n = 0;
    for (let tx = Math.floor(cx - r); tx <= cx + r; tx++) for (let ty = Math.floor(cy - r); ty <= cy + r; ty++)
      if (Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) <= r && terrainAt(w, tx, ty) === kind) n++;
    return n;
  };
  if (d.needs === 'trees') { const n = count(T_TREE, 4); return { eff: Math.max(0.15, Math.min(1, n / 14)), count: n, label: `${n} trees nearby` }; }
  if (d.needs === 'bushes') { const n = count(T_BUSH, 2.6); return { eff: Math.max(0.15, Math.min(1, n / 6)), count: n, label: `${n} berry bushes nearby` }; }
  if (d.needs === 'water') return { eff: touchesWater(w, defId, x, y) ? 1 : 0, count: 0, label: touchesWater(w, defId, x, y) ? 'On the water' : 'Must touch water' };
  return { eff: 1, count: 0, label: '' };
}
function touchesWater(w: World, defId: string, x: number, y: number) {
  const d = BUILDING_BY_ID[defId];
  for (let tx = x - 1; tx <= x + d.w; tx++) for (let ty = y - 1; ty <= y + d.h; ty++) if (terrainAt(w, tx, ty) === T_WATER) return true;
  return false;
}

/** beauty of a spot: decorations nearby, laid paths, bushes and water; mess makes it worse */
export function beautyAt(w: World, x: number, y: number): number {
  let b = 0;
  for (const bd of w.buildings) {
    const d = bdef(bd);
    const cx = bd.x + d.w / 2, cy = bd.y + d.h / 2;
    const dist = Math.hypot(cx - x, cy - y);
    if (bd.built && d.beauty && dist < 3.5) b += d.beauty * (1 - dist / 4);
    if (!bd.built && dist < 2.5) b -= 1.5;
    if (bd.built && d.walkable && d.storage && dist < 2.5) b -= 1;
  }
  const tx = Math.floor(x), ty = Math.floor(y);
  if (pathAt(w, tx, ty) === 2) b += 1;
  for (let ax = tx - 1; ax <= tx + 1; ax++) for (let ay = ty - 1; ay <= ty + 1; ay++) {
    const t = terrainAt(w, ax, ay);
    if (t === T_BUSH || t === T_WATER) b += 0.3;
  }
  return b;
}

// ---------- Geometry ----------
/** the tile people stand on to use a building: just in front of its lower edge */
export function spotOf(b: Building): { x: number; y: number } {
  const d = bdef(b);
  if (d.walkable) return { x: b.x + d.w / 2, y: b.y + d.h / 2 };
  if (d.decor) return { x: b.x + 0.5, y: b.y + 1.5 };
  return { x: b.x + Math.floor(d.w / 2) + 0.5, y: b.y + d.h + 0.5 };
}
export const centerOf = (b: Building) => ({ x: b.x + bdef(b).w / 2, y: b.y + bdef(b).h / 2 });

function blockedGrid(w: World, ignore?: number): Uint8Array {
  const g = new Uint8Array(MAP_SIZE * MAP_SIZE);
  for (let i = 0; i < g.length; i++) if (w.terrain[i] === T_WATER) g[i] = 1;
  for (const b of w.buildings) {
    if (b.uid === ignore) continue;
    const d = bdef(b);
    for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) g[y * MAP_SIZE + x] = d.walkable ? 2 : 1;
  }
  return g;
}

export type PlaceCheck = { ok: true } | { ok: false; reason: string };
export function canPlace(w: World, defId: string, x: number, y: number): PlaceCheck {
  const d = BUILDING_BY_ID[defId];
  if (!d) return { ok: false, reason: 'Unknown building.' };
  if (x < BUILD_MIN || y < BUILD_MIN || x + d.w - 1 > BUILD_MAX || y + d.h - 1 > BUILD_MAX) return { ok: false, reason: 'Too close to the forest.' };
  const g = blockedGrid(w);
  for (let tx = x; tx < x + d.w; tx++) for (let ty = y; ty < y + d.h; ty++) {
    if (g[ty * MAP_SIZE + tx] && terrainAt(w, tx, ty) !== T_WATER) return { ok: false, reason: 'Something is already there.' };
    const t = terrainAt(w, tx, ty);
    if (t === T_WATER) return { ok: false, reason: 'You can\u2019t build on water.' };
    if (t === T_TREE) return { ok: false, reason: 'There are trees in the way.' };
    if (t === T_BUSH) return { ok: false, reason: 'There are berry bushes in the way.' };
  }
  if (!d.walkable && !d.decor) {
    const sx = x + Math.floor(d.w / 2), sy = y + d.h;
    if (sy > BUILD_MAX + 1 || g[sy * MAP_SIZE + sx] === 1) return { ok: false, reason: 'The doorway is blocked.' };
  }
  if (d.needs === 'water' && !touchesWater(w, defId, x, y)) return { ok: false, reason: 'A dock has to touch the water.' };
  for (const b of w.buildings) {
    if (bdef(b).walkable || bdef(b).decor) continue;
    const s = spotOf(b), sx = Math.floor(s.x), sy = Math.floor(s.y);
    if (sx >= x && sx < x + d.w && sy >= y && sy < y + d.h) return { ok: false, reason: `That would block the ${bdef(b).name.toLowerCase()} door.` };
  }
  return { ok: true };
}

/** Find a free spot for a building, spiralling out from a point. Leaves a 1-tile path around it. */
export function findSpot(w: World, defId: string, nearX = CENTER, nearY = CENTER, margin = true): { x: number; y: number } | null {
  if (BUILDING_BY_ID[defId].needs) {
    // try the closest 300 candidates and keep the best output, nudged towards the centre
    let best: { x: number; y: number } | null = null, bestScore = -1e9;
    const d = BUILDING_BY_ID[defId];
    for (let x = BUILD_MIN; x <= BUILD_MAX - d.w + 1; x++) for (let y = BUILD_MIN; y <= BUILD_MAX - d.h + 1; y++) {
      const dist = Math.hypot(x + d.w / 2 - nearX, y + d.h / 2 - nearY);
      if (dist > 12) continue;
      const e = efficiencyAt(w, defId, x, y).eff;
      if (e <= 0.2) continue;
      if (!canPlace(w, defId, x, y).ok) continue;
      const score = e * 10 - dist * 0.35;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    if (best) return best;
  }
  const d = BUILDING_BY_ID[defId];
  const g = blockedGrid(w);
  const cands: { x: number; y: number; dist: number }[] = [];
  for (let x = BUILD_MIN; x <= BUILD_MAX - d.w + 1; x++) for (let y = BUILD_MIN; y <= BUILD_MAX - d.h + 1; y++) {
    cands.push({ x, y, dist: Math.hypot(x + d.w / 2 - nearX, y + d.h / 2 - nearY) });
  }
  cands.sort((a, b) => a.dist - b.dist || a.x - b.x || a.y - b.y);
  for (const c of cands) {
    if (!canPlace(w, defId, c.x, c.y).ok) continue;
    if (coversPath(w, defId, c.x, c.y)) continue;
    if (margin) {
      let clear = true;
      for (let tx = c.x - 1; tx <= c.x + d.w && clear; tx++) for (let ty = c.y - 1; ty <= c.y + d.h + 1 && clear; ty++) {
        if (tx < 0 || ty < 0 || tx >= MAP_SIZE || ty >= MAP_SIZE) continue;
        if (g[ty * MAP_SIZE + tx] === 1) clear = false;
      }
      if (!clear) continue;
    }
    return { x: c.x, y: c.y };
  }
  return null;
}

// A* on the tile grid, 8 directions, no corner cutting. Returns waypoints at tile centres.
function findPath(w: World, grid: Uint8Array, fx: number, fy: number, tx: number, ty: number): { x: number; y: number }[] | null {
  const sx = Math.floor(fx), sy = Math.floor(fy), gx = Math.floor(tx), gy = Math.floor(ty);
  const N = MAP_SIZE, idx = (x: number, y: number) => y * N + x;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;
  if (!inb(sx, sy) || !inb(gx, gy)) return null;
  const pass = (x: number, y: number) => inb(x, y) && (grid[idx(x, y)] !== 1 || (x === gx && y === gy) || (x === sx && y === sy));
  const gS = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
  const open: number[] = [idx(sx, sy)]; gS[idx(sx, sy)] = 0;
  const h = (i: number) => { const x = i % N, y = (i / N) | 0; const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  let found = false, guard = 0;
  while (open.length && guard++ < 4000) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (gS[open[i]] + h(open[i]) < gS[open[bi]] + h(open[bi])) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === idx(gx, gy)) { found = true; break; }
    closed[cur] = 1;
    const cx = cur % N, cy = (cur / N) | 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!pass(nx, ny)) continue;
      if (dx && dy && (!pass(cx + dx, cy) || !pass(cx, cy + dy))) continue;
      const ni = idx(nx, ny); if (closed[ni]) continue;
      const ng = gS[cur] + (dx && dy ? 1.414 : 1) * (w.paths[ni] === 2 ? 0.8 : 1);
      if (ng < gS[ni]) { gS[ni] = ng; from[ni] = cur; if (!open.includes(ni)) open.push(ni); }
    }
  }
  if (!found) return null;
  const pts: { x: number; y: number }[] = [];
  for (let i = idx(gx, gy); i !== idx(sx, sy) && i >= 0; i = from[i]) pts.push({ x: (i % N) + 0.5, y: ((i / N) | 0) + 0.5 });
  pts.reverse();
  if (pts.length) pts.pop(); // last waypoint replaced by the exact goal
  return pts;
}

// ---------- Creation ----------
function makeColonist(w: World, usedNames: Set<string>): Colonist {
  let name = '';
  for (let i = 0; i < 50; i++) { name = `${pick(w, FIRST_NAMES)} ${pick(w, SURNAMES)}`; if (!usedNames.has(name.split(' ')[0])) break; }
  usedNames.add(name.split(' ')[0]);
  const traits: string[] = [];
  for (const t of shuffle(w, TRAITS)) {
    if (traits.length >= 2) break;
    if (t.group && traits.some(x => TRAIT_BY_ID[x].group === t.group)) continue;
    traits.push(t.id);
  }
  const jobs = JOB_KINDS;
  const likes = pick(w, jobs);
  let dislikes = pick(w, jobs);
  while (dislikes === likes) dislikes = pick(w, jobs);
  const skills = Object.fromEntries(jobs.map(j => [j, 2 + Math.floor(nextRand(w) * 4)])) as Record<JobKind, number>;
  skills[likes] = Math.min(10, skills[likes] + 3);
  skills[dislikes] = Math.max(1, skills[dislikes] - 1);
  const talent = pick(w, jobs); skills[talent] = Math.min(10, skills[talent] + 4);
  return {
    id: w.nextColonistId++, name, traits, likes, dislikes,
    shirt: pick(w, SHIRTS), skin: pick(w, SKINS),
    x: CENTER + nextRand(w) * 2 - 1, y: CENTER + 2.5 + nextRand(w), px: 0, py: 0, jitter: nextRand(w),
    path: [], goalKey: '', goalReached: false,
    hunger: 70 + nextRand(w) * 30, fun: 60, mood: 55, moodTarget: 55,
    sulking: false, lowMoodHours: 0, left: false,
    job: null, bed: null, partner: null, task: null, carrying: null, meal: null,
    activity: 'idle', place: null, inside: null,
    memories: [], thoughts: [], hadCompany: true, hadCompanyLastNight: true, drankTonight: false,
    joinedDay: 1, beauty: 0, skills, illness: null, errand: null, died: false, starvingHours: 0,
  };
}

function newBuilding(w: World, def: string, x: number, y: number, isBuilt: boolean): Building {
  const b: Building = { uid: w.nextUid++, def, x, y, built: isBuilt, progress: 0, delivered: {}, outbox: {}, inbox: {}, clean: 100, eff: efficiencyAt(w, def, x, y).eff || 1 };
  w.buildings.push(b); w.version++;
  return b;
}

export function createWorld(seed: number, difficulty: Difficulty = 'normal'): World {
  const w: World = {
    seed, rngState: seed >>> 0, hour: 6,
    colonists: [], buildings: [], terrain: [], paths: [],
    res: { wood: 60, berries: 50, fish: 0, mushrooms: 0, stew: 10, pie: 0, smokedFish: 0, planks: 0, ale: 0 },
    owned: BUILDINGS.filter(b => b.basic).map(b => b.id), perks: [],
    charterTier: 1, charter: null, charterHours: 0, chartersDone: [],
    decisions: [], log: [], opinions: {}, status: 'playing', strain: 0, nextEventHour: 24 * 1.6,
    errands: [], nextErrandId: 1, difficulty, charterBase: { cured: 0, errands: 0 }, ateOffTable: false, forbidden: [],
    nextUid: 1, nextColonistId: 1, autoAssignNew: false,
    stats: { peakPop: 6, couples: 0, breakups: 0, departures: 0, mealsEaten: 0, built: 0, cured: 0, errands: 0, deaths: 0 },
    version: 0,
  };
  for (let i = 0; i < 20; i++) nextRand(w);
  genTerrain(w);
  newBuilding(w, 'hearth', CENTER - 1, CENTER - 1, true);
  for (const id of ['stockpile', 'leanto', 'leanto', 'woodcutter', 'forager']) {
    const s = findSpot(w, id, CENTER, CENTER, true);
    if (s) newBuilding(w, id, s.x, s.y, true);
  }
  // a little ring of path around the hearth
  for (let x = CENTER - 2; x <= CENTER + 1; x++) for (let y = CENTER - 2; y <= CENTER + 1; y++) {
    const edge = x === CENTER - 2 || x === CENTER + 1 || y === CENTER - 2 || y === CENTER + 1;
    if (edge && !blockedGrid(w)[y * MAP_SIZE + x]) w.paths[y * MAP_SIZE + x] = 2;
  }
  const names = new Set<string>();
  for (let i = 0; i < 6; i++) w.colonists.push(makeColonist(w, names));
  for (const c of w.colonists) { c.px = c.x; c.py = c.y; }
  assignBeds(w);
  autoAssign(w);
  addLog(w, 'Six settlers arrive at the edge of the Mumblewood with a cart, a kettle, and great optimism.', 'good');
  addLog(w, 'There are only four beds for six people. Someone should build another lean-to.', 'neutral');
  w.decisions.push({ kind: 'charter', tier: 1, options: shuffle(w, CHARTERS.filter(c => c.tier === 1)).slice(0, 3).map(c => c.id) });
  w.decisions.push(blueprintDecision(w));
  return w;
}

function assignBeds(w: World) {
  const slots: { uid: number }[] = [];
  const order = { cozy: 0, basic: 1, rough: 2 } as Record<string, number>;
  for (const b of built(w).sort((a, b2) => order[bdef(a).bedQuality ?? 'rough'] - order[bdef(b2).bedQuality ?? 'rough'])) {
    for (let i = 0; i < (bdef(b).beds ?? 0); i++) slots.push({ uid: b.uid });
  }
  const people = alive(w).sort((a, b) => Number(has(b, 'vain')) - Number(has(a, 'vain')));
  for (const c of people) c.bed = null;
  for (const c of people) {
    if (c.bed != null) continue;
    const s = slots.shift();
    if (!s) break;
    c.bed = s.uid;
    const p = colonistById(w, c.partner);
    if (p && !p.left && p.bed == null) {
      const i = slots.findIndex(x => x.uid === s.uid);
      if (i >= 0) { p.bed = s.uid; slots.splice(i, 1); }
    }
  }
}

/** Buildings that help each charter. A draft always offers one of these if none is owned yet. */
export const CHARTER_HELPERS: Record<string, string[]> = {
  pantry: ['pieoven', 'smokehouse', 'dock'], feast: ['brewery', 'pieoven', 'smokehouse'],
  lumber: ['sawmill'], township: ['sawmill', 'dock'], growing: ['cottage', 'cellar'], boomtown: ['cottage', 'cellar'],
  cheer: ['tavern', 'stage', 'cottage', 'bathhouse', 'pieoven'], harmony: ['tavern', 'stage', 'cottage', 'bathhouse'],
  lovebirds: ['tavern', 'stage'],
  woodpile: ['sawmill'], paved: ['sawmill'], tables: ['cottage'], healthy: ['bathhouse'], handy: ['cottage'],
  pretty: ['stage', 'sawmill'], masters: ['tavern'], pieday: ['pieoven', 'sawmill'], garden: ['sawmill', 'stage'], calm: ['tavern', 'bathhouse', 'stage'],
};
function blueprintDecision(w: World): Decision {
  const pool = BUILDINGS.filter(b => b.draftable && !w.owned.includes(b.id)).map(b => b.id);
  const options = shuffle(w, pool).slice(0, 3);
  const usable = (id: string) => { const rec = BUILDING_BY_ID[id].recipe; if (!rec) return true; return Object.keys(rec.inputs).every(k => k === 'rawFood' || k === 'wood' || k === 'berries' || (k === 'fish' && w.owned.includes('dock')) || (k === 'planks' && w.owned.includes('sawmill'))); };
  const helpers = (CHARTER_HELPERS[w.charter ?? ''] ?? []).filter(id => pool.includes(id) && usable(id));
  const ownsHelper = (CHARTER_HELPERS[w.charter ?? ''] ?? []).some(id => w.owned.includes(id) && usable(id));
  if (helpers.length && !ownsHelper && !options.some(o => helpers.includes(o))) options[options.length - 1] = pick(w, helpers);
  return { kind: 'blueprint', options };
}

// ---------- Commands (the only way the UI changes the world) ----------
export type Command =
  | { type: 'assign'; colonist: number; building: number | null }
  | { type: 'place'; def: string; x: number; y: number }
  | { type: 'cancel'; building: number }
  | { type: 'path'; x: number; y: number; on: boolean }
  | { type: 'sendOnErrand'; errand: number; colonist: number | null }
  | { type: 'foodRule'; food: ResourceId; allowed: boolean }
  | { type: 'resolve'; option: number }
  | { type: 'autoAssign' }
  | { type: 'setAutoAssignNew'; value: boolean };

export function remainingCost(b: Building): Partial<Record<ResourceId, number>> {
  const out: Partial<Record<ResourceId, number>> = {};
  for (const [r, n] of Object.entries(bdef(b).cost)) { const left = (n ?? 0) - (b.delivered[r as ResourceId] ?? 0); if (left > 0.001) out[r as ResourceId] = left; }
  return out;
}
export function siteWork(b: Building) { return bdef(b).walkable ? 3 : buildWork(bdef(b)); }
export const sites = (w: World) => w.buildings.filter(b => !b.built);

export function apply(w: World, cmd: Command): string | null {
  switch (cmd.type) {
    case 'assign': {
      const c = colonistById(w, cmd.colonist); if (!c || c.left) return 'No such colonist.';
      if (cmd.building == null) { c.job = null; return null; }
      const b = buildingByUid(w, cmd.building); if (!b) return 'No such building.';
      if (!b.built) return `${bdef(b).name} isn’t built yet.`;
      const others = workersAt(w, b.uid).filter(o => o.id !== c.id);
      if (others.length >= bdef(b).slots) return `${bdef(b).name} is full.`;
      dropTask(w, c);
      c.job = b.uid; return null;
    }
    case 'place': {
      const def = BUILDING_BY_ID[cmd.def];
      if (!def || !w.owned.includes(def.id)) return 'You don’t have that blueprint.';
      const chk = canPlace(w, cmd.def, cmd.x, cmd.y);
      if (!chk.ok) return chk.reason;
      newBuilding(w, def.id, cmd.x, cmd.y, false);
      for (const c of alive(w)) c.goalKey = ''; // paths may be blocked now
      addLog(w, `Blueprint laid out for a ${def.name.toLowerCase()}.`, 'neutral');
      return null;
    }
    case 'cancel': {
      const b = buildingByUid(w, cmd.building);
      if (!b || b.built) return 'Only unfinished buildings can be cancelled.';
      for (const [r, n] of Object.entries(b.delivered)) w.res[r as ResourceId] += n ?? 0;
      for (const c of alive(w)) if (c.task && (('site' in c.task && c.task.site === b.uid) || ('to' in c.task && c.task.to === b.uid))) dropTask(w, c);
      w.buildings = w.buildings.filter(x => x !== b); w.version++;
      for (const c of alive(w)) c.goalKey = '';
      addLog(w, `Plans for the ${bdef(b).name.toLowerCase()} are scrapped. Materials go back to storage.`);
      return null;
    }
    case 'path': {
      const { x, y } = cmd;
      if (x < BUILD_MIN || y < BUILD_MIN || x > BUILD_MAX || y > BUILD_MAX) return 'Too close to the forest.';
      const i = y * MAP_SIZE + x;
      if (!cmd.on) { if (w.paths[i] === 1) w.paths[i] = 0; return null; }
      if (w.terrain[i] === T_WATER) return 'Paths can\u2019t go on water.';
      if (blockedGrid(w)[i] === 1) return 'A building is in the way.';
      if (w.paths[i] === 0) w.paths[i] = 1;
      w.version++;
      return null;
    }
    case 'sendOnErrand': {
      const e = w.errands.find(x => x.id === cmd.errand); if (!e) return 'That job is already over.';
      const prev = colonistById(w, e.assignee); if (prev) prev.errand = null;
      if (cmd.colonist == null) { e.assignee = null; return null; }
      const c = colonistById(w, cmd.colonist); if (!c || c.left) return 'No such colonist.';
      if (c.illness && c.illness.severity > 15) return `${first(c)} is too sick.`;
      const other = w.errands.find(x => x.assignee === c.id); if (other) other.assignee = null;
      dropTask(w, c);
      e.assignee = c.id; c.errand = e.id; c.goalKey = '';
      return null;
    }
    case 'foodRule': {
      w.forbidden = w.forbidden.filter(f => f !== cmd.food);
      if (!cmd.allowed) w.forbidden.push(cmd.food);
      return null;
    }
    case 'autoAssign': autoAssign(w); return null;
    case 'setAutoAssignNew': w.autoAssignNew = cmd.value; return null;
    case 'resolve': return resolveDecision(w, cmd.option);
  }
}

function resolveDecision(w: World, option: number): string | null {
  const d = w.decisions[0];
  if (!d) return 'Nothing to decide.';
  w.decisions.shift();
  switch (d.kind) {
    case 'charter': {
      const id = d.options[option] ?? d.options[0];
      w.charter = id; w.charterHours = 0;
      w.charterBase = { cured: w.stats.cured, errands: w.stats.errands };
      const next = w.decisions[0];
      if (next?.kind === 'blueprint') w.decisions[0] = blueprintDecision(w);
      addLog(w, `New charter from the Crown: ${CHARTERS.find(c => c.id === id)!.name}.`);
      break;
    }
    case 'blueprint': {
      const id = d.options[option];
      if (id) { w.owned.push(id); addLog(w, `Blueprint acquired: ${BUILDING_BY_ID[id].name}.`, 'good'); }
      break;
    }
    case 'recruit': {
      const c = d.options[option];
      if (c) {
        c.joinedDay = day(w);
        w.colonists.push(c);
        assignBeds(w);
        if (w.autoAssignNew) fillSlots(w);
        addLog(w, `${c.name} arrives with a suspicious amount of luggage.`, 'good');
        w.stats.peakPop = Math.max(w.stats.peakPop, alive(w).length);
      } else addLog(w, 'The recruits are sent on their way. One of them waves sadly.');
      break;
    }
    case 'perk': {
      const id = d.options[option] ?? d.options[0];
      w.perks.push(id);
      addLog(w, `Boon granted: ${PERKS.find(p => p.id === id)!.name}.`, 'good');
      break;
    }
    case 'event': {
      const ev = EVENTS.find(e => e.id === d.eventId)!;
      applyEventEffect(w, ev.options[option]?.effect ?? ev.options[0].effect);
      break;
    }
    case 'errand': {
      // option is the colonist to send; anything else leaves it for later
      if (colonistById(w, option)) apply(w, { type: 'sendOnErrand', errand: d.errandId, colonist: option });
      break;
    }
  }
  return null;
}

// ---------- Errands (event jobs) ----------
function spawnErrand(w: World, def: JobEventDef): boolean {
  let x = CENTER + 0.5, y = CENTER + 2.5, text = def.text, pair: [number, number] | undefined;
  if (def.at === 'storage') { const st = nearestStorage(w, CENTER, CENTER); if (st) { const s2 = spotOf(st); x = s2.x; y = s2.y; } }
  if (def.at === 'clinic') { const cl = built(w).find(b => b.def === 'clinic'); const s2 = cl ? spotOf(cl) : { x: CENTER + 2.5, y: CENTER + 0.5 }; x = s2.x; y = s2.y; }
  if (def.at === 'edge') { const a = nextRand(w) * Math.PI * 2; x = CENTER + Math.cos(a) * 12; y = CENTER + Math.sin(a) * 12; x = Math.max(BUILD_MIN, Math.min(BUILD_MAX, x)); y = Math.max(BUILD_MIN, Math.min(BUILD_MAX, y)); }
  if (def.at === 'pair') {
    const people = alive(w);
    let found: [Colonist, Colonist] | null = null;
    for (const a of people) for (const b of people) if (a.id < b.id && opinion(w, a.id, b.id) < -25 && opinion(w, b.id, a.id) < -25) found = [a, b];
    if (!found) return false;
    pair = [found[0].id, found[1].id];
    text = text.replace('{a}', first(found[0])).replace('{b}', first(found[1]));
  }
  const e: Errand = { id: w.nextErrandId++, def: def.id, title: def.title, text, hours: def.hours, done: 0, deadline: w.hour + def.deadline, skill: def.skill, x, y, assignee: null, pair };
  w.errands.push(e);
  w.decisions.push({ kind: 'errand', errandId: e.id });
  return true;
}

function finishErrand(w: World, e: Errand, success: boolean) {
  w.errands = w.errands.filter(x => x !== e);
  const c = colonistById(w, e.assignee); if (c) { c.errand = null; c.goalKey = ''; }
  const who = c ? first(c) : 'Somebody';
  if (success) w.stats.errands++;
  switch (e.def) {
    case 'badger':
      if (success) addLog(w, `${who} chased the badger off with a broom and a stern lecture.`, 'good');
      else { for (const r of [...RAW_FOODS, ...MEALS]) w.res[r] *= 0.75; addLog(w, 'The badger ate a quarter of the food, then left a review.', 'bad'); }
      break;
    case 'cat':
      if (success) { everyone(w, 'cat', 'The cat is safe', 3, 24); addLog(w, `${who} rescued the cat. The cat is unimpressed.`, 'good'); }
      else { everyone(w, 'cat', 'That cat would not stop yowling', -3, 24); addLog(w, 'The cat came down on its own, eventually, loudly.', 'bad'); }
      break;
    case 'feud': {
      const [a, b] = (e.pair ?? []).map(id => colonistById(w, id));
      if (!a || !b) break;
      if (success) { changeOpinion(w, a, b, 25); changeOpinion(w, b, a, 25); addLog(w, `${who} got ${first(a)} and ${first(b)} to shake hands. Briefly.`, 'good'); }
      else { for (const x of [a, b]) addMemory(w, x, 'feud', 'The feud drags on', -6, 48); changeOpinion(w, a, b, -10); changeOpinion(w, b, a, -10); addLog(w, `The feud between ${first(a)} and ${first(b)} gets worse. Someone wrote a song about it.`, 'bad'); }
      break;
    }
    case 'bog':
      if (success) {
        const names = new Set(w.colonists.map(x => first(x)));
        const n = makeColonist(w, names); n.x = e.x; n.y = e.y; n.px = n.x; n.py = n.y; n.joinedDay = day(w);
        w.colonists.push(n); assignBeds(w); if (w.autoAssignNew) fillSlots(w);
        w.stats.peakPop = Math.max(w.stats.peakPop, alive(w).length);
        addLog(w, `${who} pulled ${n.name} out of the bog. ${first(n)} decides to stay.`, 'good');
      } else { everyone(w, 'bog', 'We ignored someone in a bog', -2, 24); addLog(w, 'The traveller hauled themselves out of the bog and left, muttering about manners.', 'bad'); }
      break;
    case 'goblin':
      if (success) addLog(w, `${who} walked the goblin to the edge of the woods. He left a stamped form and a bad review.`, 'good');
      else { takeFood(w, 20); everyone(w, 'graffiti', 'Goblin graffiti everywhere', -6, 48); addLog(w, 'The goblin took 20 food and wrote something rude in Goblin on every wall.', 'bad'); }
      break;
    case 'pigeons':
      if (success) addLog(w, `${who} negotiated with the pigeons using a broom. The union has disbanded.`, 'good');
      else { w.res.berries = Math.floor(w.res.berries * 0.6); addLog(w, 'The pigeons rioted. The berry stores are a crime scene.', 'bad'); }
      break;
    case 'remedy':
      if (success) { for (const p of alive(w)) if (p.illness) p.illness.severity -= 30; addLog(w, `${who} brewed a remedy that tastes like boots, but works.`, 'good'); }
      else addLog(w, 'Nobody brewed the remedy. The flu does what flu does.', 'neutral');
      break;
  }
}

function errandHourly(w: World) {
  for (const e of [...w.errands]) if (w.hour >= e.deadline) finishErrand(w, e, false);
}

// ---------- Illness ----------
function fallIll(w: World, c: Colonist, id: string) {
  if (c.illness) return;
  const def = ILLNESSES.find(i => i.id === id)!;
  c.illness = { id, name: def.name, severity: def.start, worsen: def.worsen, contagious: !!def.contagious };
  dropTask(w, c);
  const e = w.errands.find(x => x.assignee === c.id); if (e) { e.assignee = null; c.errand = null; }
  c.goalKey = '';
}
function clinicFor(w: World, c: Colonist): Building | undefined {
  const clinics = built(w).filter(b => bdef(b).patients);
  const mine = clinics.find(b => alive(w).some(o => o.id !== c.id && o.illness && o.inside === b.uid) ? alive(w).filter(o => o.illness && o.place === b.uid && o.id !== c.id).length < (bdef(b).patients ?? 0) : true);
  return mine;
}
export function patientsAt(w: World, b: Building) { return alive(w).filter(c => c.illness && c.activity === 'sick' && c.place === b.uid); }
function illnessHourly(w: World) {
  for (const c of alive(w)) {
    const ill = c.illness; if (!ill) continue;
    const clinic = c.activity === 'sick' && c.goalReached && c.place != null ? buildingByUid(w, c.place) : undefined;
    const inClinic = !!clinic && !!bdef(clinic).patients;
    const doctor = inClinic ? workersAt(w, clinic!.uid).find(d => d.place === clinic!.uid && d.goalReached && !d.illness) : undefined;
    const resting = c.activity === 'sick' || c.activity === 'sleeping';
    let change = ill.worsen;
    if (resting) change -= 0.35;
    if (inClinic) change -= 0.5;
    if (doctor) change -= 0.6 + doctor.skills.medicine * 0.22;
    ill.severity += change;
    if (doctor && nextRand(w) < 0.1) doctor.skills.medicine = Math.min(10, doctor.skills.medicine + 0.1);
    // contagion among people in the same place
    if (ill.contagious && c.place != null && c.activity !== 'sick') {
      for (const o of alive(w)) if (o !== c && !o.illness && o.place === c.place && nextRand(w) < 0.02) { fallIll(w, o, ill.id); addLog(w, `${first(o)} caught the ${ill.name.toLowerCase()} from ${first(c)}.`, 'bad'); }
    }
    if (ill.severity <= 0) {
      c.illness = null; c.goalKey = ''; w.stats.cured++;
      addMemory(w, c, 'recovered', 'Feeling better', 3, 24);
      addLog(w, `${first(c)} is back on their feet.`, 'good');
    } else if (ill.severity >= 100) {
      // contagious illnesses kill; injuries and tummies send people off to a city physician
      if (ill.contagious) die(w, c, `the ${ill.name.toLowerCase()}`);
      else { addLog(w, `${c.name} was carted off to a physician in the city. They won\u2019t be back.`, 'bad'); leave(w, c, true); }
    }
  }
}
function outbreak(w: World) {
  const healthy = shuffle(w, alive(w).filter(c => !c.illness));
  const n = Math.min(healthy.length, 2 + Math.floor(nextRand(w) * 2));
  for (const c of healthy.slice(0, n)) fallIll(w, c, 'flu');
  addLog(w, `Frontier flu! ${healthy.slice(0, n).map(first).join(', ')} came down with it.`, 'bad');
  spawnErrand(w, JOB_EVENTS.find(j => j.id === 'remedy')!);
}

function takeFood(w: World, n: number) {
  for (const r of [...RAW_FOODS, ...MEALS]) { const t = Math.min(w.res[r], n); w.res[r] -= t; n -= t; if (n <= 0) break; }
}
function everyone(w: World, key: string, label: string, value: number, hours: number, filter: (c: Colonist) => boolean = () => true) {
  for (const c of alive(w)) if (filter(c)) addMemory(w, c, key, label, value, hours);
}
function applyEventEffect(w: World, effect: string) {
  switch (effect) {
    case 'payFood20': takeFood(w, 20); addLog(w, 'The goblin stamps something and leaves. Nobody can read the stamp.'); break;
    case 'graffiti': everyone(w, 'graffiti', 'Goblin graffiti everywhere', -6, 48); addLog(w, 'By morning, every wall says something rude in Goblin.', 'bad'); break;
    case 'bardPlay':
      if (w.res.ale >= 6) { w.res.ale -= 6; everyone(w, 'bard', 'Heard a wonderful ballad', 6, 24); addLog(w, 'The ballad is long, but it rhymes. Everyone cries a little.', 'good'); }
      else addLog(w, 'There wasn’t enough ale. The bard plays one note and leaves.', 'bad');
      break;
    case 'pigeonBribe': w.res.berries = Math.max(0, w.res.berries - 15); addLog(w, 'The pigeons accept the berries and sign a peace treaty.'); break;
    case 'pigeonRiot': w.res.berries = Math.floor(w.res.berries * 0.6); addLog(w, 'The pigeons riot. The berry stores are a crime scene.', 'bad'); break;
    case 'wedding': {
      if (mealTotal(w) >= 8 && w.res.ale >= 5) {
        let n = 8; for (const r of MEALS) { const t = Math.min(w.res[r], n); w.res[r] -= t; n -= t; }
        w.res.ale -= 5; everyone(w, 'wedding', 'What a lovely wedding', 7, 48);
        addLog(w, 'A wedding! Someone cried, someone danced on a table, someone fell off it.', 'love');
      } else { addLog(w, 'There wasn’t enough for a party, so the couple elopes.', 'bad'); applyEventEffect(w, 'elope'); }
      break;
    }
    case 'elope': for (const c of alive(w)) if (c.partner != null) addMemory(w, c, 'elope', 'We had to elope', -8, 48); break;
    case 'frogFish': w.res.fish += 15; everyone(w, 'frogs', 'Frogs. In my boots.', -5, 24, c => has(c, 'grumbler')); addLog(w, 'Fifteen frogs are filed under "fish". Nobody asks questions.'); break;
    case 'frogHide': everyone(w, 'frogs', 'Stuck inside during the frog rain', -2, 24); break;
    case 'outhouseFix':
      if (w.res.planks >= 10) { w.res.planks -= 10; addLog(w, 'The new outhouse is ghost-free and has a little window.', 'good'); }
      else { addLog(w, 'Not enough planks. The ghost stays.', 'bad'); applyEventEffect(w, 'ghost'); }
      break;
    case 'ghost': everyone(w, 'ghost', 'The outhouse ghost judged me', -3, 72); break;
    case 'peddlerPlanks':
      if (w.res.wood >= 30) { w.res.wood -= 30; w.res.planks += 12; addLog(w, 'The peddler trades fairly, which is the most suspicious thing of all.'); }
      else addLog(w, 'You don’t have the wood. The peddler sighs theatrically.');
      break;
    case 'relic': takeFood(w, 10); everyone(w, 'relic', 'We own a holy spoon', 3, 72); addLog(w, 'The Holy Spoon of Saint Pomfrey is installed above the hearth.', 'good'); break;
  }
}

// ---------- Job assignment ----------
function slotScore(w: World, c: Colonist, b: Building, coworkers: Colonist[]) {
  const def = bdef(b);
  let s = 0;
  if (def.job === c.likes) s += 3;
  if (def.job === c.dislikes) s -= 3;
  if (def.job) s += (c.skills[def.job] - 5) * 0.5;
  if (c.illness && c.illness.severity > 15) s -= 10;
  for (const o of coworkers) {
    if (opinion(w, c.id, o.id) < -30 || opinion(w, o.id, c.id) < -30) s -= 2.5;
    if (o.id === c.partner) s += 1;
  }
  if (has(c, 'loner') && coworkers.length) s -= 1;
  if (has(c, 'grumbler') && coworkers.length) s -= 0.5;
  return s;
}
function buildingPriority(w: World, b: Building): number {
  const def = bdef(b); const pop = alive(w).length;
  const raw = RAW_FOODS.reduce((n, r) => n + w.res[r], 0);
  switch (def.id) {
    case 'forager': case 'dock': case 'cellar': return raw < pop * 6 ? 10 : 6;
    case 'kitchen': case 'pieoven': case 'smokehouse': return mealTotal(w) < pop * 3 ? 9 : 7;
    case 'woodcutter': return w.res.wood < 40 ? 8.5 : 5;
    case 'sawmill': return w.res.planks < 30 ? 6.5 : 3;
    case 'brewery': return w.res.ale < 20 ? 6 : 3;
    case 'tavern': return 6.8;
    default: return 4;
  }
}
/** Why a workshop can't run right now, or null if it can. */
export function blockedReason(w: World, b: Building): string | null {
  const rec = bdef(b).recipe;
  if (!rec || !b.built) return null;
  for (const key of Object.keys(rec.inputs)) {
    const inStore = key === 'rawFood' ? RAW_FOODS.reduce((n, x) => n + w.res[x] + (b.inbox[x] ?? 0), 0) : w.res[key as ResourceId] + (b.inbox[key as ResourceId] ?? 0) - (key === 'wood' ? WOOD_RESERVE : 0);
    if (inStore < 1) {
      const name = key === 'rawFood' ? 'raw food' : key === 'smokedFish' ? 'smoked fish' : key;
      const hint = key === 'fish' ? ' Build a fishing dock.' : key === 'planks' ? ' Build a sawmill.' : key === 'wood' ? ' Keep more than 20 wood.' : '';
      return `No ${name} to work with.${hint}`;
    }
  }
  return null;
}

/** How many colonists to keep free as laborers (builders and haulers). */
export function laborersWanted(w: World) { return Math.max(2, Math.ceil(alive(w).length / 4)); }
/** Fill empty job slots with laborers, keeping enough laborers free to build and haul. */
export function fillSlots(w: World) {
  const keepFree = laborersWanted(w);
  const free = alive(w).filter(c => c.job == null);
  const blds = built(w).filter(b => bdef(b).slots > 0 && !blockedReason(w, b)).sort((a, b) => buildingPriority(w, b) - buildingPriority(w, a));
  for (const b of blds) {
    while (free.length > keepFree && workersAt(w, b.uid).length < bdef(b).slots) {
      const co = workersAt(w, b.uid);
      free.sort((p, q) => slotScore(w, q, b, co) - slotScore(w, p, b, co));
      const c = free.shift()!;
      dropTask(w, c); c.job = b.uid;
    }
  }
}
export function autoAssign(w: World) {
  for (const c of alive(w)) c.job = null;
  fillSlots(w);
}

// ---------- Tasks for laborers ----------
function dropTask(w: World, c: Colonist) {
  if (c.carrying) { w.res[c.carrying.res] += c.carrying.amount; c.carrying = null; }
  c.task = null;
}
function nearestStorage(w: World, x: number, y: number): Building | undefined {
  let best: Building | undefined, bd = 1e9;
  for (const b of built(w)) if (bdef(b).storage) { const s = spotOf(b); const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = b; } }
  return best;
}
function enroute(w: World, site: number, res: ResourceId) {
  return alive(w).reduce((n, c) => n + (c.task?.kind === 'deliver' && c.task.site === site && c.task.res === res ? c.task.amount : 0), 0);
}
function taskCount(w: World, pred: (t: Task) => boolean) { return alive(w).filter(c => c.task && pred(c.task)).length; }

function chooseTask(w: World, c: Colonist): Task | null {
  const opts: { t: Task; pri: number; x: number; y: number }[] = [];
  // construction: deliver materials, then build
  for (const b of sites(w)) {
    const left = remainingCost(b);
    const s = spotOf(b);
    let missing = false;
    for (const [r, n] of Object.entries(left) as [ResourceId, number][]) {
      const need = n - enroute(w, b.uid, r);
      if (need <= 0.001) continue;
      missing = true;
      const amount = Math.min(CARRY, need, w.res[r]);
      if (amount >= 1 || (amount > 0 && amount >= need - 0.001)) opts.push({ t: { kind: 'deliver', site: b.uid, res: r, amount }, pri: 3, x: s.x, y: s.y });
    }
    if (!missing && Object.keys(left).length === 0 && taskCount(w, t => t.kind === 'build' && t.site === b.uid) < 3) opts.push({ t: { kind: 'build', site: b.uid }, pri: 3.5, x: s.x, y: s.y });
  }
  // hauling finished goods to storage
  if (storageFree(w) > 0) for (const b of built(w)) {
    for (const [r, n] of Object.entries(b.outbox) as [ResourceId, number][]) {
      if (n < 4 || taskCount(w, t => t.kind === 'haul' && t.from === b.uid && t.res === r) > 0) continue;
      const s = spotOf(b);
      opts.push({ t: { kind: 'haul', from: b.uid, res: r, amount: Math.min(CARRY, n) }, pri: n >= OUTBOX_CAP ? 3.2 : 2, x: s.x, y: s.y });
    }
  }
  // carrying ingredients to staffed workshops
  for (const b of built(w)) {
    const rec = bdef(b).recipe;
    if (!rec || !Object.keys(rec.inputs).length || workersAt(w, b.uid).length === 0) continue;
    for (const need of supplyNeeds(w, b)) opts.push({ t: need, pri: (b.inbox[need.res] ?? 0) < 2 ? 3.1 : 2.4, x: spotOf(b).x, y: spotOf(b).y });
  }
  // laying planned paths
  if (w.res.wood >= 1) {
    let n = 0;
    for (let i = 0; i < w.paths.length && n < 6; i++) if (w.paths[i] === 1 && taskCount(w, t => t.kind === 'pave' && t.y * MAP_SIZE + t.x === i) === 0) {
      const x = i % MAP_SIZE, y = Math.floor(i / MAP_SIZE); n++;
      opts.push({ t: { kind: 'pave', x, y, progress: 0 }, pri: 2.3, x: x + 0.5, y: y + 0.5 });
    }
  }
  // cleaning
  for (const b of built(w)) if (bdef(b).seats && b.clean < 70 && taskCount(w, t => t.kind === 'clean' && t.building === b.uid) === 0) {
    const s = spotOf(b); opts.push({ t: { kind: 'clean', building: b.uid }, pri: b.clean < 35 ? 2.8 : 1.5, x: s.x, y: s.y });
  }
  if (!opts.length) return null;
  opts.sort((a, b) => b.pri - a.pri || Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
  return opts[0].t;
}

/** ingredient deliveries a workshop needs right now */
type SupplyTask = Extract<Task, { kind: 'supply' }>;
function supplyNeeds(w: World, b: Building): SupplyTask[] {
  const rec = bdef(b).recipe!;
  const out: SupplyTask[] = [];
  for (const key of Object.keys(rec.inputs)) {
    let r: ResourceId;
    if (key === 'rawFood') {
      const best = [...RAW_FOODS].sort((p, q) => w.res[q] - w.res[p])[0];
      r = best;
    } else r = key as ResourceId;
    const have = key === 'rawFood' ? RAW_FOODS.reduce((n, x) => n + (b.inbox[x] ?? 0), 0) : (b.inbox[r] ?? 0);
    const coming = alive(w).reduce((n, c) => n + (c.task?.kind === 'supply' && c.task.to === b.uid && (key === 'rawFood' ? RAW_FOODS.includes(c.task.res) : c.task.res === r) ? c.task.amount : 0), 0);
    const avail = r === 'wood' ? Math.max(0, w.res.wood - WOOD_RESERVE) : w.res[r];
    const want = INBOX_TARGET - have - coming;
    if (want >= 3 && avail >= 1) out.push({ kind: 'supply', to: b.uid, res: r, amount: Math.min(CARRY, want, avail) });
  }
  return out;
}

// ---------- Where each colonist is headed ----------
interface Goal { x: number; y: number; uid: number | null; inside: boolean; key: string }
function ringAt(c: Colonist, x: number, y: number, r: number) {
  const a = c.jitter * Math.PI * 2 + c.id * 2.399;
  return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
}
function goalFor(w: World, c: Colonist): Goal {
  const at = (b: Building, r: number, inside = false, tag = ''): Goal => {
    const s = spotOf(b); const p = r ? ringAt(c, s.x, s.y, r) : s;
    return { ...p, uid: b.uid, inside, key: `${b.uid}:${inside ? 'in' : tag}` };
  };
  const hearth = w.buildings[0];
  const hearthSpot = (r: number): Goal => { const ctr = centerOf(hearth); const p = ringAt(c, ctr.x, ctr.y, r); return { ...p, uid: hearth.uid, inside: false, key: `h${r}` }; };
  switch (c.activity) {
    case 'sleeping': { const bed = buildingByUid(w, c.bed); return bed ? at(bed, 0, true) : hearthSpot(2.4); }
    case 'eating': { const m = buildingByUid(w, c.meal?.at ?? null); if (m && bdef(m).seats) return at(m, 0, true); const st = m ?? nearestStorage(w, c.x, c.y); return st ? at(st, 0.8, false, 'eat') : hearthSpot(2); }
    case 'hauling': {
      const t = c.task!;
      if (t.kind === 'deliver') {
        if (c.carrying) return at(buildingByUid(w, t.site)!, 0.4, false, 'drop');
        const st = nearestStorage(w, c.x, c.y); return st ? at(st, 0.6, false, 'pick') : hearthSpot(2);
      }
      if (t.kind === 'haul') {
        if (c.carrying) { const st = nearestStorage(w, c.x, c.y); return st ? at(st, 0.6, false, 'store') : hearthSpot(2); }
        return at(buildingByUid(w, t.from)!, 0.4, false, 'pick');
      }
      if (t.kind === 'supply') {
        if (c.carrying) return at(buildingByUid(w, t.to)!, 0.3, false, 'drop');
        const st = nearestStorage(w, c.x, c.y); return st ? at(st, 0.6, false, 'pick') : hearthSpot(2);
      }
      break;
    }
    case 'building': {
      const t = c.task!;
      if (t.kind === 'pave') return { x: t.x + 0.5, y: t.y + 0.5, uid: null, inside: false, key: `pave${t.x},${t.y}` };
      return at(buildingByUid(w, (t as { site: number }).site)!, 0.7, false, 'build');
    }
    case 'cleaning': { const t = c.task as { building: number }; return at(buildingByUid(w, t.building)!, 0, true); }
    case 'working': {
      const job = buildingByUid(w, c.job);
      if (job) return at(job, 0.6, false, 'work');
      break;
    }
    case 'leisure': {
      const tavern = built(w).find(b => b.def === 'tavern' && workersAt(w, b.uid).length > 0);
      if (tavern && w.res.ale > 0) return at(tavern, 1.1, false, 'tav');
      return hearthSpot(1.9);
    }
    case 'sulking': return hearthSpot(2.9);
    case 'sick': {
      const clinic = built(w).filter(b => bdef(b).patients).find(b => alive(w).filter(o => o !== c && o.activity === 'sick' && o.place === b.uid).length < (bdef(b).patients ?? 0));
      if (clinic) return at(clinic, 0, true);
      const bed = buildingByUid(w, c.bed); return bed ? at(bed, 0, true) : hearthSpot(2.6);
    }
    case 'errand': {
      const e = w.errands.find(x => x.id === c.errand);
      if (e) return { ...ringAt(c, e.x, e.y, 0.6), uid: null, inside: false, key: `errand${e.id}` };
      break;
    }
  }
  return hearthSpot(2.2);
}

function activityFor(w: World, c: Colonist): Activity {
  const h = hourOfDay(w);
  if (c.carrying) return 'hauling'; // always finish a delivery
  if (c.meal) return 'eating';
  if (c.illness && c.illness.severity > 15) return 'sick';
  if (c.errand != null && h >= 6 && h < 22 && w.errands.some(e => e.id === c.errand)) return 'errand';
  if (h >= 22 || h < 6) return 'sleeping';
  if (c.sulking) return 'sulking';
  if (h >= 18) { const j = buildingByUid(w, c.job); return j?.def === 'tavern' ? 'working' : 'leisure'; }
  const job0 = buildingByUid(w, c.job);
  const idleDoctor = job0 && bdef(job0).patients && !alive(w).some(o => o.illness && o.illness.severity > 15);
  const job = idleDoctor ? undefined : job0;
  if (job) {
    const full = sum(job.outbox) >= OUTBOX_CAP;
    if (full && bdef(job).recipe && storageFree(w) > 0 && !c.task) {
      const [r] = Object.entries(job.outbox).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0] as [ResourceId, number];
      if (taskCount(w, t => t.kind === 'haul' && t.from === job.uid) === 0) c.task = { kind: 'haul', from: job.uid, res: r, amount: Math.min(CARRY, job.outbox[r] ?? 0) };
    }
    // nobody brought ingredients: fetch them yourself
    const rec = bdef(job).recipe;
    if (!c.task && rec && Object.keys(rec.inputs).length && !canCook(w, job)) {
      const need = supplyNeeds(w, job)[0];
      if (need) c.task = need;
    }
    if (c.task) return 'hauling';
    return 'working';
  }
  if (!c.task) c.task = chooseTask(w, c);
  if (!c.task) return 'idle';
  return c.task.kind === 'build' || c.task.kind === 'pave' ? 'building' : c.task.kind === 'clean' ? 'cleaning' : 'hauling';
}

function arrive(w: World, c: Colonist) {
  // act on arrival at the goal
  const t = c.task;
  if (c.activity === 'hauling' && t) {
    if (t.kind === 'deliver') {
      const site = buildingByUid(w, t.site);
      if (!site) { dropTask(w, c); return; }
      if (!c.carrying) {
        const amt = Math.min(t.amount, w.res[t.res]);
        if (amt <= 0) { c.task = null; return; }
        w.res[t.res] -= amt; c.carrying = { res: t.res, amount: amt }; t.amount = amt;
      } else {
        site.delivered[t.res] = (site.delivered[t.res] ?? 0) + c.carrying.amount;
        c.carrying = null; c.task = null; w.version++;
      }
    } else if (t.kind === 'haul') {
      const from = buildingByUid(w, t.from);
      if (!c.carrying) {
        const avail = from?.outbox[t.res] ?? 0;
        const amt = Math.min(t.amount, avail, CARRY);
        if (!from || amt <= 0) { c.task = null; return; }
        from.outbox[t.res] = avail - amt; c.carrying = { res: t.res, amount: amt };
      } else {
        const space = storageFree(w);
        const put = Math.min(space, c.carrying.amount);
        w.res[c.carrying.res] += put; c.carrying.amount -= put;
        if (c.carrying.amount <= 0.001) { c.carrying = null; c.task = null; }
        else { w.res[c.carrying.res] += c.carrying.amount; c.carrying = null; c.task = null; } // storage full: dump it anyway
      }
    }
    else if (t.kind === 'supply') {
      const to = buildingByUid(w, t.to);
      if (!to) { dropTask(w, c); return; }
      if (!c.carrying) {
        const avail = t.res === 'wood' ? Math.max(0, w.res.wood - WOOD_RESERVE) : w.res[t.res];
        const amt = Math.min(t.amount, avail);
        if (amt <= 0) { c.task = null; return; }
        w.res[t.res] -= amt; c.carrying = { res: t.res, amount: amt }; t.amount = amt;
      } else {
        to.inbox[t.res] = (to.inbox[t.res] ?? 0) + c.carrying.amount;
        c.carrying = null; c.task = null; w.version++;
      }
    }
  } else if (c.activity === 'eating' && c.meal && c.meal.until === 0) {
    c.meal.until = w.hour + 0.5;
  }
}

function workSpeed(w: World, c: Colonist, skill?: JobKind) {
  let s = skill ? 0.6 + c.skills[skill] * 0.08 : 1;
  if (has(c, 'lazy')) s *= 0.7;
  if (has(c, 'diligent')) s *= 1.3;
  if (hasPerk(w, 'overtime')) s *= 1.15;
  if (c.mood > 70) s *= 1.1;
  return s;
}

function produce(w: World, dt: number) {
  for (const b of built(w)) {
    const def = bdef(b); if (!def.recipe) continue;
    for (const c of workersAt(w, b.uid)) {
      if (c.activity !== 'working' || !c.goalReached) continue;
      if (sum(b.outbox) >= OUTBOX_CAP) continue;
      let amount = def.recipe.rate * workSpeed(w, c, def.job) * dt * b.eff;
      for (const [r, per] of Object.entries(def.recipe.inputs)) {
        const avail = r === 'rawFood' ? RAW_FOODS.reduce((n, x) => n + (b.inbox[x] ?? 0), 0) : (b.inbox[r as ResourceId] ?? 0);
        amount = Math.min(amount, avail / (per as number));
      }
      if (amount <= 0) continue;
      for (const [r, per] of Object.entries(def.recipe.inputs)) {
        let need = amount * (per as number);
        if (r === 'rawFood') {
          for (const x of [...RAW_FOODS].sort((p, q) => (b.inbox[q] ?? 0) - (b.inbox[p] ?? 0))) { const t = Math.min(b.inbox[x] ?? 0, need); b.inbox[x] = (b.inbox[x] ?? 0) - t; need -= t; }
        } else b.inbox[r as ResourceId] = (b.inbox[r as ResourceId] ?? 0) - need;
      }
      b.outbox[def.recipe.output] = (b.outbox[def.recipe.output] ?? 0) + amount;
      if (def.job) c.skills[def.job] = Math.min(10, c.skills[def.job] + 0.004 * dt * 6);
      // the occasional workplace mishap, likelier for the unskilled
      if (def.job && nextRand(w) < dt * 0.0025 * (def.job === 'chopping' ? 2 : 1) * (11 - c.skills[def.job]) / 6) {
        const id = def.job === 'chopping' || def.job === 'crafting' ? pick(w, ['thumb', 'splinter', 'ankle']) : pick(w, ['splinter', 'ankle']);
        fallIll(w, c, id); addLog(w, `${first(c)} has a ${c.illness!.name.toLowerCase()} and goes off to lie down.`, 'bad');
      }
    }
  }
  // construction, paving, cleaning and errands
  for (const c of alive(w)) {
    if (!c.goalReached) continue;
    if (c.activity === 'errand') {
      const e = w.errands.find(x => x.id === c.errand);
      if (!e) { c.errand = null; continue; }
      let sp = workSpeed(w, c, e.skill);
      if (e.def === 'feud' && has(c, 'sunny')) sp *= 2;
      e.done += sp * dt;
      if (e.done >= e.hours) finishErrand(w, e, true);
      continue;
    }
    if (c.activity === 'building' && c.task?.kind === 'pave') {
      const t = c.task, i = t.y * MAP_SIZE + t.x;
      if (w.paths[i] !== 1) { c.task = null; continue; }
      t.progress += workSpeed(w, c) * dt;
      if (t.progress >= 0.4) {
        if (w.res.wood >= 1) { w.res.wood -= 1; w.paths[i] = 2; w.version++; }
        c.task = null;
      }
    } else if (c.activity === 'building' && c.task?.kind === 'build') {
      const b = buildingByUid(w, c.task.site);
      if (!b) { c.task = null; continue; }
      b.progress += workSpeed(w, c) * dt;
      if (b.progress >= siteWork(b)) completeBuilding(w, b);
    } else if (c.activity === 'cleaning' && c.task?.kind === 'clean') {
      const b = buildingByUid(w, c.task.building);
      if (!b) { c.task = null; continue; }
      b.clean = Math.min(100, b.clean + 30 * dt);
      if (b.clean >= 100) c.task = null;
    }
  }
}

/** does the workshop have enough ingredients for a little more work? */
function canCook(w: World, b: Building) {
  const rec = bdef(b).recipe!;
  return Object.entries(rec.inputs).every(([r, per]) => (r === 'rawFood' ? RAW_FOODS.reduce((n, x) => n + (b.inbox[x] ?? 0), 0) : (b.inbox[r as ResourceId] ?? 0)) >= (per as number) * 0.2);
}

function completeBuilding(w: World, b: Building) {
  b.built = true; b.progress = siteWork(b); w.version++; w.stats.built++;
  for (const c of alive(w)) if (c.task?.kind === 'build' && c.task.site === b.uid) c.task = null;
  const def = bdef(b);
  addLog(w, pick(w, [`The ${def.name.toLowerCase()} is finished. Only one thumb was hammered.`, `The ${def.name.toLowerCase()} is done, and it is mostly level.`, `Work on the ${def.name.toLowerCase()} is complete. Everyone admires it briefly.`]), 'good');
  if (def.beds) assignBeds(w);
  if (def.slots && w.autoAssignNew) fillSlots(w);
  // a finished building replaces any planned path under it
  for (let x = b.x; x < b.x + def.w; x++) for (let y = b.y; y < b.y + def.h; y++) if (!def.walkable) w.paths[y * MAP_SIZE + x] = 0;
}

/** food people are allowed to eat */
export function edibleTotal(w: World) { return [...RAW_FOODS, ...MEALS].filter(r => !w.forbidden.includes(r)).reduce((n, r) => n + w.res[r], 0); }
function startMeal(w: World, c: Colonist) {
  if (edibleTotal(w) < 1) return;
  const halls = built(w).filter(b => bdef(b).seats);
  const hall = halls.find(b => alive(w).filter(o => o.meal?.at === b.uid).length < (bdef(b).seats ?? 0));
  c.meal = { at: hall?.uid ?? nearestStorage(w, c.x, c.y)?.uid ?? null, until: 0 };
}
function finishMeal(w: World, c: Colonist) {
  const hall = buildingByUid(w, c.meal?.at ?? null);
  c.meal = null;
  const meal = MEALS.find(r => w.res[r] >= 1 && !w.forbidden.includes(r));
  const bonus = (has(c, 'glutton') ? 4 : 0) + (hasPerk(w, 'communalPot') ? 3 : 0);
  if (meal) {
    w.res[meal] -= 1; c.hunger = 100; w.stats.mealsEaten++;
    const v = { pie: 8, smokedFish: 6, stew: 5 }[meal as 'pie' | 'smokedFish' | 'stew'] + bonus;
    const label = { pie: 'Ate pie', smokedFish: 'Ate smoked fish', stew: 'Ate a hot stew' }[meal as 'pie'];
    addMemory(w, c, 'meal', label, v, 14);
  } else {
    const raw = [...RAW_FOODS].sort((p, q) => w.res[q] - w.res[p]).find(r => w.res[r] >= 1 && !w.forbidden.includes(r));
    if (!raw) return;
    w.res[raw] -= 1; c.hunger = 85;
    addMemory(w, c, 'meal', `Ate raw ${raw}`, has(c, 'picky') ? -8 : -3, 14);
    if (nextRand(w) < 0.02) { fallIll(w, c, 'tummy'); addLog(w, `${first(c)} ate some questionable ${raw} and now has a bad tummy.`, 'bad'); }
  }
  if (hall && bdef(hall).seats) {
    hall.clean = Math.max(0, hall.clean - 2.5);
    if (hall.clean >= 70) addMemory(w, c, 'table', 'Ate in a spotless dining hall', 4, 14);
    else if (hall.clean < 30) addMemory(w, c, 'table', 'Ate in a filthy dining hall', -3, 14);
    else addMemory(w, c, 'table', 'Ate at a proper table', 2, 14);
  } else { addMemory(w, c, 'table', 'Ate without a table', -4, 14); w.ateOffTable = true; }
}

const INSULTS = [
  '{a} told {b} their stew "tasted like a boot".',
  '{a} said {b} walks "like a startled heron".',
  '{a} loudly wondered whether {b} had ever bathed.',
  '{a} called {b}’s singing "a crime against the forest".',
  '{a} told {b} that nobody likes their hat.',
  '{a} corrected {b}’s pronunciation of "scone". Again.',
];
const BREAKUP_REASONS = ['a disagreement about soup', 'who let the hearth go out', 'a poem that rhymed "love" with "turnip"', 'snoring', 'the correct way to hold a spoon', 'an incident involving a goat', 'whose turn it was to fetch water'];

function socialHour(w: World) {
  const groups = new Map<number, Colonist[]>();
  for (const c of alive(w)) {
    if (!['leisure', 'working', 'building', 'eating'].includes(c.activity) || c.place == null || !c.goalReached) continue;
    const g = groups.get(c.place) ?? []; g.push(c); groups.set(c.place, g);
  }
  for (const [uid, group] of groups) {
    const b = buildingByUid(w, uid)!;
    const evening = hourOfDay(w) >= 18;
    if (group.length < 2) continue;
    const tavernBoost = b.def === 'tavern' ? 2 : 1;
    for (const c of group) {
      if (evening) c.hadCompany = true;
      const other = pick(w, group.filter(o => o.id !== c.id));
      if (!evening) {
        if (has(other, 'grumbler')) changeOpinion(w, c, other, hasPerk(w, 'earplugs') ? -0.7 : -1.5);
        else changeOpinion(w, c, other, 0.6);
        continue;
      }
      if (has(other, 'hummer')) changeOpinion(w, c, other, hasPerk(w, 'earplugs') ? -0.6 : -1.2);
      let insultChance = 0.05 + (has(c, 'grumbler') ? 0.12 : 0) + (opinion(w, c.id, other.id) < -20 ? 0.1 : 0);
      if (hasPerk(w, 'gossipBan')) insultChance *= 0.5;
      if (nextRand(w) < insultChance) {
        changeOpinion(w, other, c, -rint(w, 8, 14));
        changeOpinion(w, c, other, -2);
        addMemory(w, other, `insult${c.id}`, `Insulted by ${first(c)}`, -4, 12);
        if (nextRand(w) < 0.35) addLog(w, pick(w, INSULTS).replace('{a}', first(c)).replace('{b}', first(other)), 'bad');
      } else {
        const gain = (2 + nextRand(w) * 3) * tavernBoost * (has(c, 'butterfly') ? 1.5 : 1) * (has(c, 'loner') ? 0.6 : 1);
        changeOpinion(w, c, other, gain);
      }
      if (c.partner == null && other.partner == null && c.id < other.id
        && opinion(w, c.id, other.id) > 30 && opinion(w, other.id, c.id) > 30) {
        const chance = 0.05 * (has(c, 'romantic') ? 3 : 1) * (has(other, 'romantic') ? 3 : 1) * (hasPerk(w, 'matchmaker') ? 2 : 1);
        if (nextRand(w) < chance) {
          c.partner = other.id; other.partner = c.id; w.stats.couples++;
          addMemory(w, c, 'love', `Fell for ${first(other)}`, 10, 72);
          addMemory(w, other, 'love', `Fell for ${first(c)}`, 10, 72);
          addLog(w, `${first(c)} and ${first(other)} are now an item. Everyone pretends to be surprised.`, 'love');
          assignBeds(w);
        }
      }
    }
  }
}

function dailyRelationships(w: World) {
  for (const c of alive(w)) {
    const p = colonistById(w, c.partner);
    if (!p || c.id > p.id) continue;
    const minOp = Math.min(opinion(w, c.id, p.id), opinion(w, p.id, c.id));
    let chance = minOp < 15 ? 0.5 : 0.03;
    if (has(c, 'drama') || has(p, 'drama')) chance *= 2;
    if (hasPerk(w, 'matchmaker')) chance *= 0.5;
    if (nextRand(w) < chance) {
      c.partner = null; p.partner = null; w.stats.breakups++;
      for (const [x, y] of [[c, p], [p, c]] as const) {
        addMemory(w, x, 'breakup', `Broke up with ${first(y)}`, has(x, 'romantic') ? -24 : -12, 72);
        x.memories = x.memories.filter(m => m.key !== 'love');
        changeOpinion(w, x, y, -30);
      }
      addLog(w, `${first(c)} and ${first(p)} broke up over ${pick(w, BREAKUP_REASONS)}.`, 'bad');
    }
  }
}

function computeThoughts(w: World, c: Colonist): Thought[] {
  const t: Thought[] = [];
  const add = (label: string, value: number) => { if (value !== 0) t.push({ label, value: Math.round(value * 10) / 10 }); };
  if (c.hunger <= 0) add('Starving', -18); else if (c.hunger < 25) add('Hungry', -6);
  if (c.illness) add(`Sick: ${c.illness.name.toLowerCase()}`, -(3 + c.illness.severity / 15));
  if (c.illness && c.activity === 'sick' && c.place != null && bdef(buildingByUid(w, c.place)!).patients) add('Being looked after at the clinic', 3);
  const bed = buildingByUid(w, c.bed);
  if (!bed) add('Sleeping on the ground', -7);
  else if (bdef(bed).bedQuality === 'cozy') add('Sleeps in a cozy cottage', 5);
  if (has(c, 'vain') && (!bed || bdef(bed).bedQuality !== 'cozy')) add('Vain: deserves a cottage', -5);
  const job = buildingByUid(w, c.job);
  if (job) {
    const kind = bdef(job).job!;
    if (kind === c.likes) add(`Loves ${JOB_NAMES[kind]}`, 5);
    if (kind === c.dislikes) add(`Hates ${JOB_NAMES[kind]}`, -6);
    const co = workersAt(w, job.uid).filter(o => o.id !== c.id);
    for (const o of co) {
      if (has(o, 'grumbler')) add(`${first(o)} won’t stop complaining`, hasPerk(w, 'earplugs') ? -1.5 : -3);
      if (has(o, 'sunny')) add(`${first(o)} is a ray of sunshine`, 2);
      if (opinion(w, c.id, o.id) < -30) add(`Has to work with ${first(o)}`, -6);
    }
    if (has(c, 'loner') && co.length) add('Loner: crowded workplace', -4);
  }
  const partner = colonistById(w, c.partner);
  if (partner && !partner.left) add(`In love with ${first(partner)}`, 6);
  if (c.fun < 25) add('Bored', -6); else if (c.fun > 70) add('Entertained', 4);
  if (has(c, 'butterfly') && !c.hadCompanyLastNight) add('Lonely evening', -6);
  if (has(c, 'sunny')) add('Sunny disposition', 5);
  if (has(c, 'lazy')) add('Doesn’t work too hard', 3);
  if (has(c, 'tippler') && w.res.ale < 1) add('No ale in the stores', -4);
  if (hasBuilt(w, 'bathhouse') && w.res.wood > 0) add('Feeling fresh from the bathhouse', has(c, 'grumbler') ? 5 : 3);
  if (hasPerk(w, 'saintsDay')) add("Saint Pomfrey's blessing", 4);
  if (c.beauty >= 5) add('Beautiful surroundings', 5);
  else if (c.beauty >= 2) add('Pleasant surroundings', 2);
  else if (c.beauty <= -1.2) add('Ugly surroundings', -3);
  const strain = w.strain * (has(c, 'stoic') ? 0.5 : 1);
  if (strain >= 1) add('The frontier wears on me', -strain);
  for (const m of c.memories) add(m.label, m.value);
  return t.sort((a, b) => a.value - b.value);
}

function hourly(w: World) {
  const h = Math.round(hourOfDay(w)) % 24;
  const pop = alive(w).length;
  const d = day(w) - 1 + (hourOfDay(w) - 6) / 24;
  w.strain = Math.max(0, (d * 0.6 + d * d * 0.02) * DIFFICULTY_STRAIN[w.difficulty] * (hasPerk(w, 'ironWill') ? 0.75 : 1) + Math.max(0, pop - 8) * 0.5);

  if (h >= 18 || h < 6) {
    const burn = hasPerk(w, 'warmHearth') ? 0.5 : 1;
    if (w.res.wood >= burn) w.res.wood -= burn;
    else everyone(w, 'cold', 'The hearth went cold', -5, 12);
  }
  if (hasBuilt(w, 'bathhouse') && h >= 6 && h < 18) w.res.wood = Math.max(0, w.res.wood - 0.4);
  // spoilage without a storehouse
  if (!keepsFresh(w)) for (const r of [...RAW_FOODS, ...MEALS]) w.res[r] *= 1 - 0.035 / 24;
  const tavern = built(w).find(b => b.def === 'tavern');
  const stage = hasBuilt(w, 'stage');

  if (h === 18) for (const c of alive(w)) { c.hadCompanyLastNight = c.hadCompany; c.hadCompany = false; c.drankTonight = false; }

  for (const c of alive(w)) {
    if (c.activity !== 'sleeping') {
      c.hunger -= (100 / 26) * (has(c, 'glutton') ? 1.6 : 1) * (hasPerk(w, 'rations') ? 0.8 : 1);
      c.fun -= 2;
    } else c.hunger -= 1.2;
    c.hunger = Math.max(0, c.hunger);
    c.starvingHours = c.hunger <= 0 ? c.starvingHours + 1 : 0;
    if (c.starvingHours === 24) addLog(w, `${first(c)} is starving. Get food into storage.`, 'bad');
    if (c.starvingHours >= 48) { die(w, c, 'hunger'); continue; }
    if (c.hunger < 45 && !c.meal && !c.carrying && c.activity !== 'sleeping') startMeal(w, c);
    if (c.activity === 'leisure' || c.activity === 'sulking' || c.activity === 'idle') {
      const atTavern = tavern && c.place === tavern.uid;
      if (atTavern && w.res.ale >= 0.3) {
        w.res.ale -= 0.3; c.fun += 18;
        if (!c.drankTonight) { c.drankTonight = true; addMemory(w, c, 'ale', 'Drank ale at the tavern', 6 + (has(c, 'tippler') ? 4 : 0), 14); }
      } else c.fun += (c.activity === 'idle' ? 3 : 9) + (stage && h >= 18 ? 5 : 0) + (hasPerk(w, 'warmHearth') ? 1 : 0);
      if (c.activity === 'leisure' && hasPerk(w, 'warmHearth')) addMemory(w, c, 'hearthWarm', 'Warm evening by the hearth', 2, 6);
    }
    c.fun = Math.max(0, Math.min(100, c.fun));
    if (c.activity !== 'sleeping') c.beauty = c.beauty * 0.85 + beautyAt(w, c.x, c.y) * 0.15;
    c.memories = c.memories.filter(m => m.until > w.hour);
    c.thoughts = computeThoughts(w, c);
    c.moodTarget = Math.max(0, Math.min(100, 50 + c.thoughts.reduce((s, x) => s + x.value, 0)));
    c.mood += Math.max(-6, Math.min(10, c.moodTarget - c.mood));

    if (!c.sulking && c.mood < 20) { c.sulking = true; dropTask(w, c); addLog(w, `${first(c)} is sulking behind the woodpile and refuses to work.`, 'bad'); }
    else if (c.sulking && c.mood > 32) { c.sulking = false; addLog(w, `${first(c)} has stopped sulking. For now.`); }
    c.lowMoodHours = c.mood < 10 ? c.lowMoodHours + 1 : 0;
    if (c.lowMoodHours >= 20) leave(w, c);
  }
  // employed colonists finishing the workday drop unstarted tasks
  if (h === 18) for (const c of alive(w)) if (c.task && !c.carrying) c.task = null;

  illnessHourly(w);
  errandHourly(w);
  // eating raw food now and then upsets a stomach
  socialHour(w);
  if (h === 6) dailyRelationships(w);
  checkCharter(w);
  w.ateOffTable = false;
  if (h === 6) dawn(w);
  if (w.hour >= w.nextEventHour && h >= 8 && h <= 20) triggerEvent(w);
  if (w.status === 'playing' && (lost(w) >= MAX_DEPARTURES || alive(w).length <= 2)) {
    w.status = 'lost';
    addLog(w, 'Too many settlers are gone. The Crown revokes the charter. The kettle remains.', 'bad');
  }
}

const EULOGIES = ['They will be missed, mostly.', 'Someone carves a very small headstone.', 'The cat sits on their chair for a week.', 'Their stew recipe dies with them, which some call a mercy.', 'Everyone agrees they had a good hat.'];
function die(w: World, c: Colonist, cause: string) {
  dropTask(w, c);
  const e = w.errands.find(x => x.assignee === c.id); if (e) e.assignee = null;
  c.left = true; c.died = true; c.job = null; c.meal = null; c.illness = null; c.errand = null; w.stats.deaths++;
  addLog(w, `${c.name} has died of ${cause}. ${pick(w, EULOGIES)}`, 'bad');
  const p = colonistById(w, c.partner);
  if (p) { p.partner = null; addMemory(w, p, 'widowed', `${first(c)} died`, -20, 96); }
  c.partner = null;
  for (const o of alive(w)) {
    if (o === p) continue;
    if (opinion(w, o.id, c.id) > 30) addMemory(w, o, `mourn${c.id}`, `Mourning ${first(c)}`, -8, 48);
    else addMemory(w, o, `death${c.id}`, `${first(c)} died`, -3, 24);
  }
  assignBeds(w); w.version++;
}

function leave(w: World, c: Colonist, carted = false) {
  dropTask(w, c);
  c.left = true; c.job = null; c.meal = null; c.illness = null; w.stats.departures++;
  const e = w.errands.find(x => x.assignee === c.id); if (e) e.assignee = null;
  c.errand = null;
  if (!carted) addLog(w, `${c.name} packed a sack and wandered off into the woods, muttering.`, 'bad');
  const p = colonistById(w, c.partner);
  if (p) { p.partner = null; addMemory(w, p, 'abandoned', `${first(c)} left me`, -14, 72); }
  c.partner = null;
  for (const o of alive(w)) if (opinion(w, o.id, c.id) > 30) addMemory(w, o, `missing${c.id}`, `Misses ${first(c)}`, -4, 48);
  assignBeds(w);
}

function dawn(w: World) {
  const d = day(w);
  if (d % DRAFT_EVERY === 1 % DRAFT_EVERY && d > 1) w.decisions.push(blueprintDecision(w));
  if (d % DRAFT_EVERY === 0) {
    const names = new Set(w.colonists.map(c => first(c)));
    const opts = [0, 1, 2].map(() => makeColonist(w, names));
    for (const o of opts) { o.x = 3 + nextRand(w) * 2; o.y = MAP_SIZE - 4; o.px = o.x; o.py = o.y; }
    w.decisions.push({ kind: 'recruit', options: opts });
  }
}

function triggerEvent(w: World) {
  const roll = nextRand(w);
  if (roll < 0.18 && day(w) >= 3) outbreak(w);
  else if (roll < 0.6) {
    const jobs = shuffle(w, JOB_EVENTS.filter(j => j.id !== 'remedy'));
    if (!jobs.some(j => spawnErrand(w, j))) w.decisions.push({ kind: 'event', eventId: pick(w, EVENTS.filter(e => e.requires !== 'couple' || couples(w) > 0)).id });
  } else {
    const pool = EVENTS.filter(e => e.requires !== 'couple' || couples(w) > 0);
    w.decisions.push({ kind: 'event', eventId: pick(w, pool).id });
  }
  const gap = Math.max(0.8, 1.8 - w.strain * 0.03) + nextRand(w) * 0.8;
  w.nextEventHour = w.hour + gap * 24;
}

function charterValue(w: World, c: CharterDef): { value: number; target: number; label: string } {
  const m = c.metric;
  switch (m.kind) {
    case 'stock': { const v = m.resources.reduce((n, r) => n + w.res[r], 0); return { value: v, target: m.amount, label: `${Math.floor(v)} / ${m.amount} in storage` }; }
    case 'population': { const v = alive(w).length; return { value: v, target: m.amount, label: `${v} / ${m.amount} colonists` }; }
    case 'buildings': { const v = built(w).filter(b => !bdef(b).decor).length; return { value: v, target: m.amount, label: `${v} / ${m.amount} buildings finished` }; }
    case 'couples': { const v = couples(w); return { value: v, target: m.amount, label: `${v} / ${m.amount} couples` }; }
    case 'avgMood': return { value: w.charterHours, target: m.hours, label: `${Math.round(avgMood(w))} mood · ${w.charterHours}h / ${m.hours}h` };
    case 'contentPop': return { value: w.charterHours, target: m.hours, label: `${alive(w).length} colonists · ${Math.round(avgMood(w))} mood · ${w.charterHours}h / ${m.hours}h` };
    case 'feast': {
      const meals = mealTotal(w), ale = w.res.ale;
      return { value: Math.min(meals / m.meals, ale / m.ale), target: 1, label: `${Math.floor(meals)}/${m.meals} meals · ${Math.floor(ale)}/${m.ale} ale` };
    }
    case 'paths': { const v = w.paths.filter(p => p === 2).length; return { value: v, target: m.amount, label: `${v} / ${m.amount} path tiles laid` }; }
    case 'decorPaths': {
      const d = built(w).filter(b => bdef(b).decor).length, p = w.paths.filter(x => x === 2).length;
      return { value: Math.min(d / m.decor, p / m.paths), target: 1, label: `${d}/${m.decor} decorations · ${p}/${m.paths} paths` };
    }
    case 'allTable': return { value: w.charterHours, target: m.hours, label: `${w.charterHours}h / ${m.hours}h with every meal at a table` };
    case 'curedSince': { const v = w.stats.cured - w.charterBase.cured; return { value: v, target: m.amount, label: `${v} / ${m.amount} recovered` }; }
    case 'errandsSince': { const v = w.stats.errands - w.charterBase.errands; return { value: v, target: m.amount, label: `${v} / ${m.amount} urgent jobs done` }; }
    case 'avgBeauty': return { value: w.charterHours, target: m.hours, label: `beauty ${avgBeauty(w).toFixed(1)} · ${w.charterHours}h / ${m.hours}h` };
    case 'skilled': { const v = alive(w).filter(c => Object.values(c.skills).some(x => x >= m.level)).length; return { value: v, target: m.count, label: `${v} / ${m.count} colonists at skill ${m.level}+` }; }
    case 'calm': return { value: w.charterHours, target: m.hours, label: `${alive(w).length}/${m.pop} colonists · ${w.charterHours}h / ${m.hours}h without sulking` };
  }
}
export function avgBeauty(w: World) { const a = alive(w); return a.length ? a.reduce((s, c) => s + c.beauty, 0) / a.length : 0; }
export function charterProgress(w: World) {
  const c = CHARTERS.find(x => x.id === w.charter);
  if (!c) return null;
  const v = charterValue(w, c);
  return { charter: c, ...v, ratio: Math.min(1, v.value / v.target) };
}
function checkCharter(w: World) {
  const c = CHARTERS.find(x => x.id === w.charter);
  if (!c || w.status !== 'playing') return;
  const m = c.metric;
  if (m.kind === 'avgMood') w.charterHours = avgMood(w) >= m.amount ? w.charterHours + 1 : 0;
  if (m.kind === 'contentPop') w.charterHours = avgMood(w) >= m.mood && alive(w).length >= m.pop ? w.charterHours + 1 : 0;
  if (m.kind === 'allTable') w.charterHours = w.ateOffTable ? 0 : w.charterHours + 1;
  if (m.kind === 'avgBeauty') w.charterHours = avgBeauty(w) >= m.amount ? w.charterHours + 1 : 0;
  if (m.kind === 'calm') w.charterHours = alive(w).length >= m.pop && !alive(w).some(c => c.sulking) ? w.charterHours + 1 : 0;
  const v = charterValue(w, c);
  if (v.value < v.target) return;
  w.chartersDone.push(c.id); w.charter = null;
  addLog(w, `Charter complete: ${c.name}! The Crown sends a stiffly worded note of approval.`, 'good');
  if (c.tier === 3) { w.status = 'won'; addLog(w, 'The Crown declares the colony a proper town. Someone makes a banner. It is spelled wrong.', 'good'); return; }
  const perkPool = PERKS.filter(p => !w.perks.includes(p.id)).map(p => p.id);
  w.decisions.push({ kind: 'perk', options: shuffle(w, perkPool).slice(0, 3) });
  w.charterTier = c.tier + 1;
  w.decisions.push({ kind: 'charter', tier: w.charterTier as 2 | 3, options: shuffle(w, CHARTERS.filter(x => x.tier === w.charterTier)).slice(0, 3).map(x => x.id) });
}

// ---------- Tick ----------
function move(w: World, c: Colonist, grid: Uint8Array, dt: number) {
  const goal = goalFor(w, c);
  c.place = goal.uid;
  if (goal.key !== c.goalKey) {
    c.goalKey = goal.key;
    c.path = findPath(w, grid, c.x, c.y, goal.x, goal.y) ?? [];
    c.goalReached = false;
  }
  let step = WALK_SPEED * dt * (c.carrying ? 0.85 : 1) * (pathAt(w, Math.floor(c.x), Math.floor(c.y)) === 2 ? PATH_SPEED : 1);
  const pts = [...c.path, { x: goal.x, y: goal.y }];
  while (step > 0 && pts.length) {
    const p = pts[0];
    const dx = p.x - c.x, dy = p.y - c.y, dist = Math.hypot(dx, dy);
    if (dist <= step) { c.x = p.x; c.y = p.y; step -= dist; pts.shift(); if (c.path.length) c.path.shift(); }
    else { c.x += (dx / dist) * step; c.y += (dy / dist) * step; step = 0; }
  }
  const reached = Math.hypot(goal.x - c.x, goal.y - c.y) < 0.05;
  c.inside = reached && goal.inside ? goal.uid : null;
  if (reached && !c.goalReached) { c.goalReached = true; arrive(w, c); }
}

/** Advance one tick (1/TICKS_PER_HOUR of an hour). Does nothing while a decision is pending. */
export function tick(w: World): void {
  if (w.status !== 'playing' || w.decisions.length) return;
  const dt = 1 / TICKS_PER_HOUR;
  const before = Math.floor(w.hour + 1e-6);
  const grid = blockedGrid(w);
  for (const c of alive(w)) {
    c.px = c.x; c.py = c.y;
    if (c.meal && c.meal.until > 0 && w.hour >= c.meal.until) finishMeal(w, c);
    const prev = c.activity;
    c.activity = activityFor(w, c);
    if (prev !== c.activity) c.goalKey = '';
    move(w, c, grid, dt);
  }
  produce(w, dt);
  w.hour = Math.round((w.hour + dt) * TICKS_PER_HOUR) / TICKS_PER_HOUR;
  if (Math.floor(w.hour + 1e-6) !== before) hourly(w);
}

export function runHours(w: World, hours: number) { for (let i = 0; i < hours * TICKS_PER_HOUR; i++) tick(w); }

/** debugging: start a specific event job or an outbreak right now */
export function debugEvent(w: World, id: string) {
  if (id === 'flu') return outbreak(w);
  const def = JOB_EVENTS.find(j => j.id === id);
  if (def) spawnErrand(w, def);
}
