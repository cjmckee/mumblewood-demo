// Deterministic colony simulation. No DOM, no rendering: runs in the browser and in Node.
import {
  BUILDING_BY_ID, BuildingDef, CHARTERS, CharterDef, EVENTS, FIRST_NAMES, JOB_NAMES, JobKind, JOB_KINDS,
  MEALS, PERKS, RAW_FOODS, ResourceId, SHIRTS, SKINS, SURNAMES, TRAITS, TRAIT_BY_ID, BUILDINGS, buildWork,
  JOB_EVENTS, JobEventDef, ILLNESSES, RESOURCES, Recipe, InputKey, CATEGORIES, isCategory, membersOf, inputName, recipeRate, SITES, SiteId, MEAL_MOOD,
  CharterMetric, RESEARCH, RESEARCH_BY_ID,
} from './content';
import { START } from './scenario';

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
export interface Illness { id: string; name: string; severity: number; worsen: number; contagious: boolean; botched?: boolean }
/** a short job created by an event; someone has to be sent to do it */
export interface Errand {
  id: number; def: string; title: string; text: string;
  hours: number; done: number; deadline: number;
  skill?: JobKind; x: number; y: number;
  assignee: number | null; pair?: [number, number];
}
export type Task =
  | { kind: 'deliver'; site: number; res: ResourceId; amount: number; via?: number }
  | { kind: 'haul'; from: number; res: ResourceId; amount: number; via?: number; /** moving it out of storage that no longer takes it */ restock?: boolean }
  | { kind: 'supply'; to: number; res: ResourceId; amount: number; via?: number }
  | { kind: 'build'; site: number }
  | { kind: 'pave'; x: number; y: number; progress: number }
  | { kind: 'clean'; building: number };
export interface Carry { res: ResourceId; amount: number }

export interface Colonist {
  id: number; name: string; traits: string[]; likes: JobKind; dislikes: JobKind;
  /** complex goods they love or dislike: a small bonus or penalty on top of the usual boost */
  tastes: { loves: ResourceId[]; dislikes: ResourceId[] };
  shirt: number; skin: number;
  x: number; y: number; px: number; py: number; jitter: number;
  path: { x: number; y: number }[]; goalKey: string; goalReached: boolean;
  hunger: number; fun: number; mood: number; moodTarget: number;
  sulking: boolean; lowMoodHours: number; left: boolean;
  job: number | null; bed: number | null; partner: number | null;
  task: Task | null; carrying: Carry | null;
  /** eating: fetch food from storage `from`, then eat at `at`; until = 0 while walking */
  meal: { at: number | null; until: number; from: number | null; got: ResourceId | null } | null;
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
  /** storage buildings: what's sitting in this one */
  stock: Partial<Record<ResourceId, number>>;
  /** storage buildings: which goods it takes; null means everything */
  allow: ResourceId[] | null;
  /** storage buildings: high-priority storage fills first and is topped up from low */
  high: boolean;
  /** workshops: indices of recipes the player has switched off */
  off?: number[];
  /** buildings built in stages (the Crown's Hall): which stage is under way */
  stage?: number;
}

export type Decision =
  | { kind: 'charter'; tier: 1 | 2 | 3; options: string[] }
  | { kind: 'blueprint'; options: string[] }
  | { kind: 'recruit'; options: Colonist[] }
  | { kind: 'perk'; options: string[] }
  | { kind: 'event'; eventId: string }
  | { kind: 'errand'; errandId: number }
  | { kind: 'research'; options: string[] };

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
  /** hourly average mood since the charter began (last 24 kept), for the mood charters */
  moodLog: number[];
  /** someone ate without a table this hour */
  ateOffTable: boolean;
  /** foods colonists are not allowed to eat (kept for charters, feasts and trade) */
  forbidden: ResourceId[];
  /** the resource sites this map has (an apple grove, a meadow, good soil) */
  sites: SiteId[];
  /** blueprint rerolls used this run; each one costs more */
  rerolls: number;
  nextUid: number; nextColonistId: number;
  autoAssignNew: boolean;
  /** diagnostics: running totals of where goods came from and went, e.g. 'wood:hearth' */
  flows: Record<string, number>;
  /** hourly snapshots of flows, the last 24 */
  flowLog: Record<string, number>[];
  stats: { peakPop: number; couples: number; breakups: number; departures: number; mealsEaten: number; built: number; cured: number; errands: number; deaths: number };
  version: number; // bumps when buildings change shape or state, for the renderer
  /** research: projects finished, the one under way and its progress in work-hours */
  research: { done: string[]; current: string | null; progress: number };
  /** the first charter has been offered */
  charterOffered?: boolean;
  /** the day blueprint drafts started: they wait for the first charter */
  draftsFrom?: number | null;
  /** hours each hold-type condition of an all-at-once charter has held */
  charterHolds?: number[];
  /** the founders' feast for the Long Table: called for tonight, when it can next be called, and whether it worked */
  feast?: { called: boolean; readyAt: number; done: boolean; last?: string };
  /** the festival at the hearth: called for dusk, when it can next be called, and how the last one went */
  festival?: { called: boolean; readyAt: number; held: number; last?: string };
}

export const TICKS_PER_HOUR = 6;
export const MAP_SIZE = 32;
export const CENTER = 16;
/** buildings must sit inside [BUILD_MIN, BUILD_MAX] */
export const BUILD_MIN = 2, BUILD_MAX = MAP_SIZE - 3;
/** The colony collapses when this many settlers have left. */
export const MAX_DEPARTURES = 6;
/** Workshops won't burn the last of the wood. */
/** wood left in storage for the hearth: workshops and the research desk won't take it */
export const woodReserve = (_w: World) => START.woodReserve;
export const CARRY = 15;
/** recruits come this many days apart (blueprint drafts follow START.draftEvery) */
export const DRAFT_EVERY = 2;
export const OUTBOX_CAP = 15;
const WALK_SPEED = 7; // tiles per hour
export const PATH_SPEED = 1.25;
export const INBOX_TARGET = 12;
export const T_GRASS = 0, T_TREE = 1, T_BUSH = 2, T_WATER = 3, T_APPLE = 4, T_FLOWERS = 5, T_SOIL = 6, T_CLAY = 7;

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

// ---------- Recipes ----------
export const recipesOf = (b: Building): Recipe[] => bdef(b).recipes ?? [];
export const recipeOn = (b: Building, i: number) => !b.off?.includes(i);
/** switched-on recipes, best first (most stars, then the order the building lists them) */
export function enabledRecipes(b: Building): Recipe[] {
  return recipesOf(b).map((r, i) => ({ r, i })).filter(x => recipeOn(b, x.i)).sort((p, q) => q.r.stars - p.r.stars || p.i - q.i).map(x => x.r);
}
/** how much of an input (one good, or any good in a category) sits in a workshop's inbox */
export function inInbox(b: Building, key: InputKey) { return isCategory(key) ? membersOf(key).reduce((n, x) => n + (b.inbox[x] ?? 0), 0) : (b.inbox[key] ?? 0); }
/** how much of an input a workshop could get: its inbox plus storage, keeping the wood reserve */
function obtainable(w: World, b: Building, key: InputKey) {
  return membersOf(key).reduce((n, x) => n + w.res[x] + (b.inbox[x] ?? 0), 0) - (membersOf(key).includes('wood') ? woodReserve(w) : 0);
}
const recipeReady = (w: World, b: Building, r: Recipe) => Object.keys(r.inputs).every(k => obtainable(w, b, k as InputKey) >= 1);
/** The recipe a workshop is working toward: the best switched-on one whose ingredients can be had, else the best switched-on one. */
export function currentRecipe(w: World, b: Building): Recipe | undefined {
  const on = enabledRecipes(b);
  return on.length > 1 ? (on.find(r => recipeReady(w, b, r)) ?? on[0]) : on[0];
}
/** how much of a good, or of any good in a category, sits in storage */
export function stockOf(w: World, key: InputKey) { return membersOf(key).reduce((n, r) => n + w.res[r], 0); }
/** total drinks in storage (ale, and later cider, mead…) */
export function drinkTotal(w: World) { return CATEGORIES.drink.members.reduce((n, r) => n + w.res[r], 0); }
/** take drinks out of storage, the most plentiful first; returns what was taken */
function takeDrink(w: World, n: number, why: string, c?: Colonist): ResourceId | null {
  let left = n, main: ResourceId | null = null;
  // a drinker reaches for the one they love and leaves the one they dislike; otherwise the most plentiful goes first
  const order = [...CATEGORIES.drink.members].sort((p, q) => (c ? taste(c, q) - taste(c, p) : 0) || w.res[q] - w.res[p]);
  for (const r of order) {
    const t = Math.min(w.res[r], left); if (t <= 0) continue;
    w.res[r] -= t; flow(w, `${r}:-${why}`, t); left -= t; main ??= r;
    if (left <= 0) break;
  }
  return main;
}
/** mood from the first drink of the evening, by kind */
const DRINK_MOOD: Partial<Record<ResourceId, number>> = { ale: 6, cider: 6, mead: 8, tea: 5 };
export function flow(w: World, key: string, n: number) { if (w.flows) w.flows[key] = (w.flows[key] ?? 0) + n; }
export function storageCap(w: World) { return built(w).reduce((n, b) => n + (bdef(b).storage ?? 0), 0); }
export function stored(w: World) { return sum(w.res); }
export const FOODS: ResourceId[] = RESOURCES.filter(r => r.kind === 'raw' || r.kind === 'meal').map(r => r.id);
export const GOODS: ResourceId[] = RESOURCES.filter(r => r.kind !== 'raw' && r.kind !== 'meal').map(r => r.id);
export function storages(w: World) { return built(w).filter(b => bdef(b).storage); }
export function accepts(b: Building, r: ResourceId) { return !!bdef(b).storage && (!b.allow || b.allow.includes(r)); }
export function roomIn(b: Building) { return (bdef(b).storage ?? 0) - sum(b.stock); }
/** free space for one kind of good (only storage that accepts it), or overall */
export function storageFree(w: World, r?: ResourceId) {
  if (!r) return Math.max(0, storageCap(w) - stored(w));
  return storages(w).filter(b => accepts(b, r)).reduce((n, b) => n + Math.max(0, roomIn(b)), 0);
}
export function keepsFresh(w: World) { return built(w).some(b => bdef(b).keepsFresh); }
/** food sitting somewhere it slowly goes off */
export function spoilingFood(w: World) {
  const fresh = storages(w).filter(b => bdef(b).keepsFresh).reduce((n, b) => n + FOODS.reduce((m, r) => m + (b.stock[r] ?? 0), 0), 0);
  return Math.max(0, FOODS.reduce((n, r) => n + w.res[r], 0) - fresh);
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** where to put down a load of r: the nearest highest-priority storage that takes it and has room */
function storeTarget(w: World, r: ResourceId, from: { x: number; y: number }): Building | undefined {
  const all = storages(w);
  const pick = (xs: Building[]) => xs.sort((a, b) => Number(b.high) - Number(a.high) || dist(spotOf(a), from) - dist(spotOf(b), from))[0];
  return pick(all.filter(b => accepts(b, r) && roomIn(b) >= 1)) ?? pick(all.filter(b => accepts(b, r))) ?? pick(all);
}
/** where to fetch r on the way from `from` to `to`: the storage holding it with the shortest trip */
function fetchSource(w: World, r: ResourceId, from: { x: number; y: number }, to?: { x: number; y: number }): Building | undefined {
  const all = storages(w);
  const trip = (b: Building) => dist(spotOf(b), from) + (to ? dist(spotOf(b), to) : 0);
  const pick = (xs: Building[]) => xs.sort((a, b) => trip(a) - trip(b))[0];
  return pick(all.filter(b => (b.stock[r] ?? 0) >= 1)) ?? pick(all.filter(b => (b.stock[r] ?? 0) > 0)) ?? pick(all);
}
function putIn(w: World, b: Building | undefined, r: ResourceId, n: number) {
  w.res[r] += n;
  if (b && bdef(b).storage) b.stock[r] = (b.stock[r] ?? 0) + n;
}
function takeOut(w: World, b: Building | undefined, r: ResourceId, n: number) {
  const amt = Math.min(n, w.res[r]);
  w.res[r] -= amt;
  if (b && bdef(b).storage) b.stock[r] = Math.max(0, (b.stock[r] ?? 0) - amt);
  return amt;
}
/**
 * w.res is the colony's total in storage; each storage building's stock says where it sits.
 * Anything that changed w.res directly (eating, events, rewards) is settled here: losses come out of the
 * fullest piles, gains go to storage nearest the hearth that accepts them.
 */
export function reconcileStock(w: World) {
  const all = storages(w);
  if (!all.length) return;
  const ctr = { x: CENTER, y: CENTER };
  for (const { id: r } of RESOURCES) {
    let diff = w.res[r] - all.reduce((n, b) => n + (b.stock[r] ?? 0), 0);
    if (Math.abs(diff) < 1e-6) continue;
    if (diff < 0) {
      for (const b of all.slice().sort((a, b2) => (b2.stock[r] ?? 0) - (a.stock[r] ?? 0))) {
        const t = Math.min(b.stock[r] ?? 0, -diff); b.stock[r] = (b.stock[r] ?? 0) - t; diff += t;
        if (diff > -1e-6) break;
      }
    } else {
      const order = all.slice().sort((a, b) => Number(b.high) - Number(a.high) || dist(spotOf(a), ctr) - dist(spotOf(b), ctr));
      for (const b of order.filter(b => accepts(b, r))) {
        const t = Math.min(Math.max(0, roomIn(b)), diff); if (t <= 0) continue;
        b.stock[r] = (b.stock[r] ?? 0) + t; diff -= t; if (diff < 1e-6) break;
      }
      if (diff > 1e-6) { const b = order.find(b => accepts(b, r)) ?? order[0]; b.stock[r] = (b.stock[r] ?? 0) + diff; }
    }
  }
}
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
  // every colony starts on wood and berries, so one grove and one thick berry patch are always close by
  for (let i = 0; i < 3; i++) { const g = i === 0 ? around(7, 8.5) : around(7, 11); blob(g.x, g.y, 2.6 + nextRand(w), T_TREE, 0.75); }
  for (let i = 0; i < 3; i++) { const g = i === 0 ? around(5.5, 6.5) : around(5.5, 10); blob(g.x, g.y, i === 0 ? 2.1 : 1.7, T_BUSH, i === 0 ? 1 : 0.8); }
  // two of the three resource sites, each on open grass, so every map leaves out one route to drinks
  const order = SITES.map(s => ({ s, k: nextRand(w) })).sort((a, b) => a.k - b.k).map(x => x.s.id).slice(0, 2);
  const onGrass = (cx: number, cy: number, r: number, v: number, density: number) => {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d < 1 && x >= BUILD_MIN && y >= BUILD_MIN && x <= BUILD_MAX && y <= BUILD_MAX && t[y * MAP_SIZE + x] === T_GRASS && nextRand(w) < density * (1.15 - d * 0.6)) set(x, y, v);
    }
  };
  for (const id of order) {
    const g = around(7.5, 10.5);
    if (id === 'grove') onGrass(g.x, g.y, 2.2, T_APPLE, 0.75);
    if (id === 'meadow') onGrass(g.x, g.y, 2.6, T_FLOWERS, 0.9);
    if (id === 'soil') onGrass(g.x, g.y, 2.8, T_SOIL, 1);
    if (id === 'clay') {
      // clay lines a stretch of the pond's shore: grass tiles next to water, around one point on the bank
      const shore: { x: number; y: number }[] = [];
      for (let x = BUILD_MIN; x <= BUILD_MAX; x++) for (let y = BUILD_MIN; y <= BUILD_MAX; y++)
        if (t[y * MAP_SIZE + x] === T_GRASS && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => t[(y + dy) * MAP_SIZE + x + dx] === T_WATER)) shore.push({ x, y });
      // try a few stretches of shore until one takes a decent bank (a pond hemmed in by trees may not)
      for (let tries = 0; tries < 4; tries++) {
        const at = shore.length ? shore[Math.floor(nextRand(w) * shore.length)] : g;
        for (const p of shore) if (Math.hypot(p.x - at.x, p.y - at.y) <= 3.5 && nextRand(w) < 0.9) set(p.x, p.y, T_CLAY);
        onGrass(at.x + 0.5, at.y + 0.5, 2.3, T_CLAY, 0.8);
        if (t.filter(v => v === T_CLAY).length >= 10) break;
      }
    }
  }
  w.sites = SITES.filter(s => order.includes(s.id)).map(s => s.id);
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
  if (d.needs === 'apples') { const n = count(T_APPLE, 2.6); return { eff: Math.max(0.15, Math.min(1, n / 6)), count: n, label: `${n} apple trees nearby` }; }
  if (d.needs === 'flowers') {
    // flower beds count as two tiles of meadow each, so a player can plant a meadow where there isn't one
    const beds = w.buildings.filter(b => b.built && b.def === 'flowerbed' && Math.hypot(b.x + 0.5 - cx, b.y + 0.5 - cy) <= 3).length;
    const n = count(T_FLOWERS, 3) + beds * 2;
    return { eff: Math.max(0.15, Math.min(1, n / 10)), count: n, label: `${count(T_FLOWERS, 3)} meadow tiles${beds ? ` and ${beds} flower bed${beds > 1 ? 's' : ''}` : ''} nearby` };
  }
  if (d.needs === 'clay') { const n = count(T_CLAY, 2.2); return { eff: Math.max(0.15, Math.min(1, n / 4)), count: n, label: `${n} tiles of clay bank nearby` }; }
  if (d.needs === 'soil') {
    let n = 0;
    for (let tx = x; tx < x + d.w; tx++) for (let ty = y; ty < y + d.h; ty++) if (terrainAt(w, tx, ty) === T_SOIL) n++;
    return { eff: n ? Math.max(0.15, n / (d.w * d.h)) : 0, count: n, label: `${n} of ${d.w * d.h} tiles on good soil` };
  }
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
    if (t === T_APPLE) return { ok: false, reason: 'There are apple trees in the way.' };
    if (t === T_FLOWERS) return { ok: false, reason: 'The wildflower meadow is in the way.' };
    if (t === T_CLAY) return { ok: false, reason: 'The clay bank is in the way.' };
  }
  if (!d.walkable && !d.decor) {
    const sx = x + Math.floor(d.w / 2), sy = y + d.h;
    if (sy > BUILD_MAX + 1 || g[sy * MAP_SIZE + sx] === 1) return { ok: false, reason: 'The doorway is blocked.' };
  }
  if (d.needs === 'water' && !touchesWater(w, defId, x, y)) return { ok: false, reason: 'A dock has to touch the water.' };
  if (d.needs === 'soil' && efficiencyAt(w, defId, x, y).count < 2) return { ok: false, reason: 'A field has to sit on good soil.' };
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
/** A stable random number from the seed and a colonist id. Tastes use this instead of the world RNG so adding them shifts no other draw. */
function idRoll(seed: number, id: number, salt: number) {
  let h = (seed ^ Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** one loved and one disliked good from a category, when it has at least two kinds */
function tastesFor(w: World, id: number): Colonist['tastes'] {
  const t: Colonist['tastes'] = { loves: [], dislikes: [] };
  [CATEGORIES.meal.members, CATEGORIES.drink.members].forEach((goods, k) => {
    if (goods.length < 2) return;
    const love = goods[Math.floor(idRoll(w.seed, id, k * 2) * goods.length)];
    const rest = goods.filter(g => g !== love);
    t.loves.push(love); t.dislikes.push(rest[Math.floor(idRoll(w.seed, id, k * 2 + 1) * rest.length)]);
  });
  return t;
}
const TASTE_BONUS = 3;
/** meals in the order a colonist reaches for them: loved, then the rest, disliked last */
function mealOrder(c: Colonist) { return [...MEALS].sort((a, b) => taste(c, b) - taste(c, a)); }
const taste = (c: Colonist, r: ResourceId) => (c.tastes.loves.includes(r) ? 1 : c.tastes.dislikes.includes(r) ? -1 : 0);
const goodName = (r: ResourceId) => RESOURCES.find(x => x.id === r)!.name.toLowerCase();
function tasteMemory(w: World, c: Colonist, r: ResourceId, key = 'taste') {
  c.memories = c.memories.filter(m => m.key !== key);
  if (taste(c, r) > 0) addMemory(w, c, key, `Favourite: ${goodName(r)}`, TASTE_BONUS, 14);
  else if (taste(c, r) < 0) addMemory(w, c, key, `Doesn’t care for ${goodName(r)}`, -TASTE_BONUS, 14);
}

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
    id: w.nextColonistId, tastes: tastesFor(w, w.nextColonistId++), name, traits, likes, dislikes,
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
  const b: Building = { uid: w.nextUid++, def, x, y, built: isBuilt, progress: 0, delivered: {}, outbox: {}, inbox: {}, clean: 100, eff: efficiencyAt(w, def, x, y).eff || 1, stock: {}, allow: null, high: false };
  w.buildings.push(b); w.version++;
  return b;
}

export function createWorld(seed: number): World {
  const sc = START;
  const w: World = {
    seed, rngState: seed >>> 0, hour: 6,
    colonists: [], buildings: [], terrain: [], paths: [],
    res: { wood: 0, berries: 0, fish: 0, mushrooms: 0, stew: 0, pie: 0, smokedFish: 0, planks: 0, ale: 0, apples: 0, grain: 0, honey: 0, cider: 0, mead: 0, clay: 0, reeds: 0, bricks: 0, wicker: 0, herbs: 0, flour: 0, bread: 0, skewers: 0, poultice: 0, tonic: 0, tea: 0, ...sc.res },
    owned: [...sc.unlocked], perks: [],
    charterTier: 1, charter: null, charterHours: 0, chartersDone: [],
    decisions: [], log: [], opinions: {}, status: 'playing', strain: 0, nextEventHour: 24 * 1.6, sites: [], rerolls: 0,
    errands: [], nextErrandId: 1, moodLog: [], ateOffTable: false, forbidden: [],
    nextUid: 1, nextColonistId: 1, autoAssignNew: false,
    flows: {}, flowLog: [],
    stats: { peakPop: sc.colonists, couples: 0, breakups: 0, departures: 0, mealsEaten: 0, built: 0, cured: 0, errands: 0, deaths: 0 },
    version: 0, research: { done: [], current: null, progress: 0 },
  };
  for (let i = 0; i < 20; i++) nextRand(w);
  genTerrain(w);
  addLog(w, `Scouts report ${w.sites.map(id => SITES.find(x => x.id === id)!.name).join(' and ')} nearby.`, 'good');
  newBuilding(w, 'hearth', CENTER - 1, CENTER - 1, true);
  for (const id of sc.place) {
    const s = findSpot(w, id, CENTER, CENTER, true);
    if (s) newBuilding(w, id, s.x, s.y, true);
  }
  // a little ring of path around the hearth
  for (let x = CENTER - 2; x <= CENTER + 1; x++) for (let y = CENTER - 2; y <= CENTER + 1; y++) {
    const edge = x === CENTER - 2 || x === CENTER + 1 || y === CENTER - 2 || y === CENTER + 1;
    if (edge && !blockedGrid(w)[y * MAP_SIZE + x]) w.paths[y * MAP_SIZE + x] = 2;
  }
  const names = new Set<string>();
  for (let i = 0; i < sc.colonists; i++) w.colonists.push(makeColonist(w, names));
  for (const c of w.colonists) { c.px = c.x; c.py = c.y; }
  assignBeds(w);
  autoAssign(w);
  addLog(w, sc.intro[0], 'good');
  if (sc.intro[1]) addLog(w, sc.intro[1], 'neutral');
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

/** blueprints that help a charter; a draft always offers one while the colony owns fewer than two */
export const charterHelpers = (id: string | null) => (id ? CHARTERS.find(c => c.id === id)?.helpers ?? [] : []);
export const charterDef = (id: string | null) => (id ? CHARTERS.find(c => c.id === id) : undefined);
/** a charter offer: charters of the tier, on maps that have the sites they need */
function charterDecision(w: World, tier: 1 | 2 | 3): Decision {
  const pool = CHARTERS.filter(c => c.tier === tier && (!c.sites || c.sites.every(x => w.sites.includes(x))));
  return { kind: 'charter', tier, options: shuffle(w, pool).slice(0, 3).map(c => c.id) };
}

// ---------- Research ----------
export const desks = (w: World) => built(w).filter(b => b.def === 'desk');
/** projects not yet done */
export const researchLeft = (w: World) => RESEARCH.filter(r => !w.research.done.includes(r.id));
function researchDecision(w: World, fixed?: string[]): Decision {
  const left = researchLeft(w).map(r => r.id);
  const options = fixed?.length ? fixed.filter(id => left.includes(id)) : shuffle(w, left).slice(0, 3);
  return { kind: 'research', options };
}
/** goods the current project still needs at the desks, by cost key */
export function researchStillNeeds(w: World): Partial<Record<InputKey, number>> {
  const cur = w.research?.current ? RESEARCH_BY_ID[w.research.current] : undefined;
  const out: Partial<Record<InputKey, number>> = {};
  if (!cur) return out;
  for (const [k, n] of Object.entries(cur.cost) as [InputKey, number][]) {
    const have = desks(w).reduce((m, b) => m + inInbox(b, k), 0);
    if (n - have > 0.001) out[k] = n - have;
  }
  return out;
}
/** deliveries a desk wants for the current project */
function researchSupply(w: World, b: Building): SupplyTask[] {
  const out: SupplyTask[] = [];
  for (const [key, n] of Object.entries(researchStillNeeds(w)) as [InputKey, number][]) {
    const members = membersOf(key);
    const r = isCategory(key) ? [...members].sort((p, q) => w.res[q] - w.res[p])[0] : key;
    const coming = alive(w).reduce((m, c) => m + (c.task?.kind === 'supply' && c.task.to === b.uid && members.includes(c.task.res) ? c.task.amount : 0), 0);
    const avail = r === 'wood' ? Math.max(0, w.res.wood - woodReserve(w)) : w.res[r];
    const want = n - coming;
    if (want > 0.001 && avail >= Math.min(1, want)) out.push({ kind: 'supply', to: b.uid, res: r, amount: Math.min(CARRY, want, avail) });
  }
  return out;
}
function researchHourly(w: World, b: Building, c: Colonist, dt: number) {
  const r = w.research; const cur = r?.current ? RESEARCH_BY_ID[r.current] : undefined;
  if (!r || !cur || Object.keys(researchStillNeeds(w)).length) return;
  r.progress += workSpeed(w, c, 'studying') * dt;
  c.skills.studying = Math.min(10, (c.skills.studying ?? 3) + 0.004 * dt * 6);
  if (r.progress < cur.hours) return;
  // spend the goods from the desks and unlock the buildings
  for (const [k, n] of Object.entries(cur.cost) as [InputKey, number][]) {
    let need = n;
    for (const d of desks(w)) for (const x of membersOf(k)) { const t = Math.min(d.inbox[x] ?? 0, need); if (t > 0) { d.inbox[x] = (d.inbox[x] ?? 0) - t; need -= t; flow(w, `${x}:-research`, t); } }
  }
  r.done.push(cur.id); r.current = null; r.progress = 0;
  for (const id of cur.unlocks) if (!w.owned.includes(id)) w.owned.push(id);
  addLog(w, `${first(c)} finished studying ${cur.name}. You can now build: ${cur.unlocks.map(id => BUILDING_BY_ID[id].name.toLowerCase()).join(' and ')}.`, 'good');
  if (researchLeft(w).length) w.decisions.push(researchDecision(w));
  else addLog(w, 'The scholar has read every book in the colony twice and is now reading the labels on jars.');
  void b;
}

/** the site a gatherer needs on the map, if any */
const SITE_FOR: Partial<Record<NonNullable<BuildingDef['needs']>, SiteId>> = { apples: 'grove', flowers: 'meadow', soil: 'soil', clay: 'clay' };
/** this map has what the building gathers from (every map has trees, bushes and water) */
export function siteOk(w: World, d: BuildingDef) { const s = d.needs && SITE_FOR[d.needs]; return !s || w.sites.includes(s); }
/** a building the colony owns, or could own, gathers this good on this map */
export function canSupply(w: World, r: ResourceId, owned = w.owned) {
  return BUILDINGS.some(d => owned.includes(d.id) && siteOk(w, d) && (d.recipes ?? []).some(rec => rec.output === r && !Object.keys(rec.inputs).length));
}
/** at least one recipe in the building can be fed from what the colony owns */
export function usableHere(w: World, id: string, owned = w.owned) {
  const recs = BUILDING_BY_ID[id].recipes;
  if (!recs) return true;
  const crafted = (r: ResourceId) => BUILDINGS.some(d => owned.includes(d.id) && (d.recipes ?? []).some(x => x.output === r && Object.keys(x.inputs).length));
  return recs.some(rec => Object.keys(rec.inputs).every(k => membersOf(k as InputKey).some(r => canSupply(w, r, owned) || crafted(r))));
}
/**
 * Can this recipe be fed? "ready": every input is made by something the colony owns. "draft": an input needs a building
 * not owned yet (named in `via`, preferring one that gathers it). "never": nothing on this map could ever make an input.
 */
export function recipeReach(w: World, r: Recipe): { state: 'ready' | 'draft' | 'never'; input?: InputKey; via?: string } {
  const makers = (m: ResourceId) => BUILDINGS.filter(d => siteOk(w, d) && (d.recipes ?? []).some(x => x.output === m));
  for (const k of Object.keys(r.inputs) as InputKey[]) {
    const ms = membersOf(k);
    if (ms.some(m => makers(m).some(d => w.owned.includes(d.id)))) continue;
    const options = ms.flatMap(makers).filter(d => d.draftable);
    if (!options.length) return { state: 'never', input: k };
    const via = options.find(d => (d.recipes ?? []).some(x => ms.includes(x.output) && !Object.keys(x.inputs).length)) ?? options[0];
    return { state: 'draft', input: k, via: via.id };
  }
  return { state: 'ready' };
}
/** some recipe here could be fed on this map once the right blueprints are drafted */
export const usableEver = (w: World, id: string) => usableHere(w, id, BUILDINGS.map(d => d.id));
/** wood for the next blueprint reroll: 10, then 20, then 30… across the whole run */
export const REROLL_STEP = 10;
export const rerollCost = (w: World) => REROLL_STEP * ((w.rerolls ?? 0) + 1);
function blueprintDecision(w: World, avoid: string[] = []): Decision {
  // gatherers for a site this map doesn't have are never offered
  // nor a workshop nothing on this map could ever feed (a kiln without a clay bank)
  const all = BUILDINGS.filter(b => b.draftable && !w.owned.includes(b.id) && siteOk(w, b) && usableEver(w, b.id)).map(b => b.id);
  // a reroll shows three new blueprints when the pool has them, topping up with old ones only if it runs short
  const fresh = all.filter(id => !avoid.includes(id));
  const pool = fresh.length >= 3 ? fresh : all;
  const options = [...shuffle(w, fresh), ...shuffle(w, all.filter(id => avoid.includes(id)))].slice(0, 3);
  const usable = (id: string) => usableHere(w, id);
  const helpers = charterHelpers(w.charter).filter(id => pool.includes(id) && usable(id));
  // a charter's route usually takes two of its helpers (a dock and a smokehouse), so the guarantee holds until two are owned
  const ownedHelpers = charterHelpers(w.charter).filter(id => w.owned.includes(id) && usable(id)).length;
  const ownsHelper = ownedHelpers >= Math.min(2, charterHelpers(w.charter).length);
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
  | { type: 'setAutoAssignNew'; value: boolean }
  | { type: 'storageFilter'; building: number; allow: ResourceId[] | null }
  | { type: 'storagePriority'; building: number; high: boolean }
  | { type: 'toggleRecipe'; building: number; recipe: number; on: boolean }
  | { type: 'reroll' }
  | { type: 'callFeast' }
  | { type: 'callFestival' };

/** what a site still needs, by cost key; a category key counts every good of that kind already delivered */
export function remainingCost(b: Building): Partial<Record<InputKey, number>> {
  const out: Partial<Record<InputKey, number>> = {};
  for (const [k, n] of Object.entries(costOf(b)) as [InputKey, number][]) {
    const left = (n ?? 0) - membersOf(k).reduce((m, r) => m + (b.delivered[r] ?? 0), 0);
    if (left > 0.001) out[k] = left;
  }
  return out;
}
export function siteWork(b: Building) { const st = bdef(b).stages; return st ? st[b.stage ?? 0].work : bdef(b).walkable ? 3 : buildWork(bdef(b)); }
/** what this site needs delivered: its cost, or the current stage's for a building built in stages */
export function costOf(b: Building): Partial<Record<InputKey, number>> { const st = bdef(b).stages; return st ? st[Math.min(st.length - 1, b.stage ?? 0)].cost : bdef(b).cost; }
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
    case 'storageFilter': {
      const b = buildingByUid(w, cmd.building);
      if (!b || !bdef(b).storage) return 'Only storage can be filtered.';
      b.allow = cmd.allow && cmd.allow.length < RESOURCES.length ? [...cmd.allow] : null; w.version++;
      for (const c of alive(w)) if (c.task && 'via' in c.task && c.task.via === b.uid && !c.carrying) c.task.via = undefined;
      return null;
    }
    case 'storagePriority': {
      const b = buildingByUid(w, cmd.building);
      if (!b || !bdef(b).storage) return 'Only storage has a priority.';
      b.high = cmd.high; w.version++;
      return null;
    }
    case 'reroll': {
      const d = w.decisions[0];
      if (d?.kind !== 'blueprint') return 'Only a blueprint draft can be rerolled.';
      const cost = rerollCost(w);
      if (w.res.wood < cost) return `A reroll costs ${cost} wood.`;
      w.res.wood -= cost; flow(w, 'wood:-reroll', cost); reconcileStock(w);
      w.rerolls = (w.rerolls ?? 0) + 1;
      w.decisions[0] = blueprintDecision(w, d.options);
      addLog(w, `New blueprints sent for, at a cost of ${cost} wood.`);
      return null;
    }
    case 'toggleRecipe': {
      const b = buildingByUid(w, cmd.building);
      if (!b || !recipesOf(b)[cmd.recipe]) return 'No such recipe.';
      const off = (b.off ?? []).filter(i => i !== cmd.recipe);
      if (!cmd.on) off.push(cmd.recipe);
      b.off = off.sort((x, y) => x - y); w.version++;
      // anyone fetching ingredients for a recipe that's now off will notice when they arrive
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
      if (bedridden(c)) return `${first(c)} is too sick.`;
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
    case 'callFestival': {
      const f = (w.festival ??= { called: false, readyAt: 0, held: 0 });
      if (f.called) return 'The festival is already called for dusk.';
      if (w.hour < f.readyAt) return `Everyone is still recovering from the last one. Try again in ${Math.ceil(f.readyAt - w.hour)} hours.`;
      if (mealTotal(w) < 1) return 'A festival needs meals to share. There are none in storage.';
      f.called = true;
      addLog(w, hourOfDay(w) < 18 ? 'A festival is called for tonight at the hearth. Someone finds a fiddle.' : 'A festival is called for tomorrow at dusk. Someone finds a fiddle.', 'good');
      return null;
    }
    case 'callFeast': {
      if (charterDef(w.charter)?.metric.kind !== 'longTable') return 'Only the Long Table charter has a founders\u2019 feast.';
      const f = (w.feast ??= { called: false, readyAt: 0, done: false });
      if (f.called) return 'The feast is already called for tonight.';
      if (w.hour < f.readyAt) return `Everyone is still full from the last one. Try again in ${Math.ceil(f.readyAt - w.hour)} hours.`;
      f.called = true;
      addLog(w, hourOfDay(w) < 18 ? 'The founders\u2019 feast is called for tonight at dusk. Someone irons a tablecloth.' : 'The founders\u2019 feast is called for tomorrow at dusk. Someone irons a tablecloth.', 'good');
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
      w.moodLog = []; w.charterHolds = [];
      const next = w.decisions[0];
      if (next?.kind === 'blueprint') w.decisions[0] = blueprintDecision(w);
      const def = charterDef(id)!;
      addLog(w, `New charter from the Crown: ${def.name}.`);
      // a monument charter hands over its blueprint
      for (const m of def.metric.kind === 'all' ? def.metric.parts : [def.metric]) if (m.kind === 'monument' && !w.owned.includes(m.def)) { w.owned.push(m.def); addLog(w, `The Crown sends plans for ${BUILDING_BY_ID[m.def].name}. Find it a good spot.`, 'good'); }
      // drafts that wait for the first charter start now, with an offer that knows what the charter needs
      if (w.draftsFrom == null) { w.draftsFrom = day(w); w.decisions.push(blueprintDecision(w)); }
      break;
    }
    case 'research': {
      const id = d.options[option] ?? d.options[0];
      if (!id || !w.research) break;
      w.research.current = id; w.research.progress = 0;
      const def = RESEARCH_BY_ID[id];
      addLog(w, `The scholar opens a book on ${def.name.toLowerCase()}. ${desks(w).some(b => workersAt(w, b.uid).length) ? '' : 'Someone needs to sit at the research desk.'}`.trim());
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
/** too sick to work: anyone with the flu, or an injury that hasn't mended past the worst */
export function bedridden(c: Colonist) { return !!c.illness && (c.illness.contagious || c.illness.severity > WALKING_WOUNDED); }
export const WALKING_WOUNDED = 8;
/** remedy a doctor uses per patient-hour of treatment */
export const REMEDY_DOSE = 0.15;
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
    // Untreated, everything slowly gets worse. Rest and a clinic bed slow it down; only a doctor turns it
    // around, and how fast depends on their medicine skill. A clumsy doctor sometimes makes things worse.
    let change = ill.worsen;
    if (resting) change -= 0.3;
    if (inClinic) change -= 0.3;
    // back on their feet: what's left mends slowly on its own
    if (!bedridden(c)) change = -0.1;
    if (doctor) {
      const skill = doctor.skills.medicine;
      change -= 0.25 + skill * 0.15;
      // remedies from storage: a tonic speeds recovery most and rules out a botch; a poultice helps and halves the risk
      const remedy = (['tonic', 'poultice'] as ResourceId[]).find(r => w.res[r] >= REMEDY_DOSE);
      if (remedy) { w.res[remedy] -= REMEDY_DOSE; flow(w, `${remedy}:-clinic`, REMEDY_DOSE); change -= remedy === 'tonic' ? 0.8 : 0.5; }
      const botchRisk = remedy === 'tonic' ? 0 : remedy === 'poultice' ? 0.5 : 1;
      if (skill < 5 && nextRand(w) < (5 - skill) * 0.015 * botchRisk) {
        change += 4;
        if (!ill.botched) { ill.botched = true; addLog(w, `${first(doctor)} bandaged the wrong bit of ${first(c)}. It didn\u2019t help.`, 'bad'); }
      }
    }
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
      if (drinkTotal(w) >= 6) { takeDrink(w, 6, 'bard'); everyone(w, 'bard', 'Heard a wonderful ballad', 6, 24); addLog(w, 'The ballad is long, but it rhymes. Everyone cries a little.', 'good'); }
      else addLog(w, 'There wasn’t enough to drink. The bard plays one note and leaves.', 'bad');
      break;
    case 'pigeonBribe': w.res.berries = Math.max(0, w.res.berries - 15); addLog(w, 'The pigeons accept the berries and sign a peace treaty.'); break;
    case 'pigeonRiot': w.res.berries = Math.floor(w.res.berries * 0.6); addLog(w, 'The pigeons riot. The berry stores are a crime scene.', 'bad'); break;
    case 'wedding': {
      if (mealTotal(w) >= 8 && drinkTotal(w) >= 5) {
        let n = 8; for (const r of MEALS) { const t = Math.min(w.res[r], n); w.res[r] -= t; n -= t; }
        takeDrink(w, 5, 'wedding'); everyone(w, 'wedding', 'What a lovely wedding', 7, 48);
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
  if (bedridden(c)) s -= 10;
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
    case 'forager': case 'dock': case 'cellar': case 'orchard': return raw < pop * 6 ? 10 : 6;
    case 'apiary': case 'field': return 5;
    case 'kitchen': case 'pieoven': case 'smokehouse': case 'bakery': return mealTotal(w) < pop * 3 ? 9 : 7;
    case 'mill': case 'herbgarden': case 'apothecary': return 5;
    case 'woodcutter': return w.res.wood < 40 ? 8.5 : 5;
    case 'sawmill': case 'kiln': case 'carpenter': return stockOf(w, 'fine') < 30 ? 6.5 : 3;
    case 'claypit': return 5;
    case 'brewery': case 'ciderpress': return drinkTotal(w) < 20 ? 6 : 3;
    case 'tavern': return 6.8;
    case 'desk': return 7.5;
    default: return 4;
  }
}
/** Why a workshop can't run right now, or null if it can. */
export function blockedReason(w: World, b: Building): string | null {
  if (b.def === 'desk' && b.built && w.research) {
    if (!w.research.current) return researchLeft(w).length ? 'Nothing to study. Pick a project.' : 'Everything in the colony\u2019s books is learned.';
    return null;
  }
  if (!recipesOf(b).length || !b.built) return null;
  const rec = currentRecipe(w, b);
  if (!rec) return 'Every recipe here is switched off.';
  for (const key of Object.keys(rec.inputs) as InputKey[]) {
    if (obtainable(w, b, key) < 1) {
      const name = inputName(key);
      const HINTS: Partial<Record<string, string>> = { fish: ' Build a fishing dock.', planks: ' Build a sawmill.', clay: ' Dig it at a clay pit by the clay bank.', reeds: ' Switch a fishing dock to cutting reeds.', wood: ` Keep more than ${woodReserve(w)} wood.`, apples: ' Pick apples at an orchard hut.', grain: ' Grow it on a grain field.', honey: ' Keep bees at an apiary.' };
      const hint = HINTS[key] ?? '';
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
  if (c.carrying) { putIn(w, storeTarget(w, c.carrying.res, c), c.carrying.res, c.carrying.amount); c.carrying = null; }
  c.task = null;
}
function nearestStorage(w: World, x: number, y: number): Building | undefined {
  let best: Building | undefined, bd = 1e9;
  for (const b of built(w)) if (bdef(b).storage) { const s = spotOf(b); const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = b; } }
  return best;
}
function enroute(w: World, site: number, key: InputKey) {
  const ms = membersOf(key);
  return alive(w).reduce((n, c) => n + (c.task?.kind === 'deliver' && c.task.site === site && ms.includes(c.task.res) ? c.task.amount : 0), 0);
}
function taskCount(w: World, pred: (t: Task) => boolean) { return alive(w).filter(c => c.task && pred(c.task)).length; }

function chooseTask(w: World, c: Colonist): Task | null {
  const opts: { t: Task; pri: number; x: number; y: number }[] = [];
  // construction: deliver materials, then build
  for (const b of sites(w)) {
    // the Crown's Hall: nobody grumpy lays a stone for the Crown
    const gate = bdef(b).moodGate; if (gate && c.mood < gate) continue;
    const left = remainingCost(b);
    const s = spotOf(b);
    let missing = false;
    for (const [k, n] of Object.entries(left) as [InputKey, number][]) {
      const need = n - enroute(w, b.uid, k);
      if (need <= 0.001) continue;
      missing = true;
      // "fine materials": bring whichever kind storage has most of
      const r = [...membersOf(k)].sort((p, q) => w.res[q] - w.res[p])[0];
      const amount = Math.min(CARRY, need, w.res[r]);
      if (amount >= 1 || (amount > 0 && amount >= need - 0.001)) opts.push({ t: { kind: 'deliver', site: b.uid, res: r, amount }, pri: 3, x: s.x, y: s.y });
    }
    if (!missing && Object.keys(left).length === 0 && taskCount(w, t => t.kind === 'build' && t.site === b.uid) < 3) opts.push({ t: { kind: 'build', site: b.uid }, pri: 3.5, x: s.x, y: s.y });
  }
  // hauling finished goods to storage
  for (const b of built(w)) {
    for (const [r, n] of Object.entries(b.outbox) as [ResourceId, number][]) {
      const low = FOODS.includes(r) && foodTotal(w) < alive(w).length * 3;
      if (n < (low ? 1 : 4) || storageFree(w, r) < 1 || taskCount(w, t => t.kind === 'haul' && t.from === b.uid && t.res === r) > 0) continue;
      const s = spotOf(b);
      opts.push({ t: { kind: 'haul', from: b.uid, res: r, amount: Math.min(CARRY, n) }, pri: n >= OUTBOX_CAP ? 3.2 : low ? 3.3 : 2, x: s.x, y: s.y });
    }
  }
  // moving goods out of storage that no longer accepts them, and topping up high-priority storage from low
  for (const b of storages(w)) for (const [r, n] of Object.entries(b.stock) as [ResourceId, number][]) {
    if ((n ?? 0) < 1 || taskCount(w, t => t.kind === 'haul' && t.from === b.uid && t.res === r) > 0) continue;
    const misplaced = !accepts(b, r);
    if (!misplaced && b.high) continue;
    if (!storages(w).some(o => o !== b && accepts(o, r) && roomIn(o) >= 1 && (misplaced || o.high))) continue;
    const s = spotOf(b);
    opts.push({ t: { kind: 'haul', from: b.uid, res: r, amount: Math.min(CARRY, n), restock: true }, pri: misplaced ? 1.8 : 1.6, x: s.x, y: s.y });
  }
  // the research desk's goods, once someone is studying there
  if (w.research?.current) for (const b of desks(w)) if (workersAt(w, b.uid).length) for (const need of researchSupply(w, b)) opts.push({ t: need, pri: 2.5, x: spotOf(b).x, y: spotOf(b).y });
  // carrying ingredients to staffed workshops
  for (const b of built(w)) {
    const rec = currentRecipe(w, b);
    if (!rec || !Object.keys(rec.inputs).length || workersAt(w, b.uid).length === 0) continue;
    for (const need of supplyNeeds(w, b, rec)) opts.push({ t: need, pri: (b.inbox[need.res] ?? 0) < 2 ? 3.1 : 2.4, x: spotOf(b).x, y: spotOf(b).y });
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
function supplyNeeds(w: World, b: Building, rec: Recipe | undefined = currentRecipe(w, b)): SupplyTask[] {
  const out: SupplyTask[] = [];
  if (!rec) return out;
  for (const key of Object.keys(rec.inputs) as InputKey[]) {
    const members = membersOf(key);
    // for "any raw food" and the like, fetch whichever kind storage has most of
    const r = isCategory(key) ? [...members].sort((p, q) => w.res[q] - w.res[p])[0] : key;
    const have = inInbox(b, key);
    const coming = alive(w).reduce((n, c) => n + (c.task?.kind === 'supply' && c.task.to === b.uid && members.includes(c.task.res) ? c.task.amount : 0), 0);
    const avail = r === 'wood' ? Math.max(0, w.res.wood - woodReserve(w)) : w.res[r];
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
    case 'eating': {
      const src = buildingByUid(w, c.meal?.from ?? null);
      if (!c.meal?.got) return src ? at(src, 0.7, false, 'food') : hearthSpot(2);
      const m = buildingByUid(w, c.meal.at); if (m && bdef(m).seats) return at(m, 0, true);
      return src ? at(src, 1.1, false, 'eat') : hearthSpot(2);
    }
    case 'hauling': {
      const t = c.task as Extract<Task, { via?: number }>;
      const via = (pickNew: () => Building | undefined, ok: (b: Building) => boolean) => {
        let b = buildingByUid(w, t.via ?? null);
        if (!b || !b.built || !ok(b)) { b = pickNew(); t.via = b?.uid; }
        return b;
      };
      if (t.kind === 'deliver' || t.kind === 'supply') {
        const dest = buildingByUid(w, t.kind === 'deliver' ? t.site : t.to)!;
        if (c.carrying) return at(dest, t.kind === 'deliver' ? 0.4 : 0.3, false, 'drop');
        const st = via(() => fetchSource(w, t.res, c, spotOf(dest)), b => (b.stock[t.res] ?? 0) > 0);
        return st ? at(st, 0.6, false, 'pick') : hearthSpot(2);
      }
      if (t.kind === 'haul') {
        if (c.carrying) { const st = via(() => storeTarget(w, t.res, c), b => accepts(b, t.res) && roomIn(b) > 0); return st ? at(st, 0.6, false, 'store') : hearthSpot(2); }
        return at(buildingByUid(w, t.from)!, 0.4, false, 'pick');
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
      if (tavern && drinkTotal(w) > 0) return at(tavern, 1.1, false, 'tav');
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
  if (c.meal && !bedridden(c)) return 'eating';
  if (bedridden(c)) return 'sick';
  if (c.errand != null && h >= 6 && h < 22 && w.errands.some(e => e.id === c.errand)) return 'errand';
  if (h >= 22 || h < 6) return 'sleeping';
  if (c.sulking) return 'sulking';
  if (h >= 18) { const j = buildingByUid(w, c.job); return j?.def === 'tavern' ? 'working' : 'leisure'; }
  const job0 = buildingByUid(w, c.job);
  const idleDoctor = job0 && bdef(job0).patients && !alive(w).some(o => bedridden(o));
  const job = idleDoctor ? undefined : job0;
  if (job) {
    const full = sum(job.outbox) >= OUTBOX_CAP;
    if (full && recipesOf(job).length && !c.task) {
      const [r] = Object.entries(job.outbox).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0] as [ResourceId, number];
      if (storageFree(w, r) > 0 && taskCount(w, t => t.kind === 'haul' && t.from === job.uid) === 0) c.task = { kind: 'haul', from: job.uid, res: r, amount: Math.min(CARRY, job.outbox[r] ?? 0) };
    }
    // the scholar fetches the project's goods if nobody has brought them
    if (!c.task && job.def === 'desk' && w.research?.current) { const need = researchSupply(w, job)[0]; if (need) c.task = need; }
    // nobody brought ingredients: fetch them yourself
    const rec = currentRecipe(w, job);
    if (!c.task && rec && Object.keys(rec.inputs).length && !canCook(w, job, rec)) {
      const need = supplyNeeds(w, job, rec)[0];
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
        const amt = takeOut(w, buildingByUid(w, t.via ?? null), t.res, t.amount);
        if (amt <= 0) { c.task = null; return; }
        c.carrying = { res: t.res, amount: amt }; t.amount = amt;
      } else {
        site.delivered[t.res] = (site.delivered[t.res] ?? 0) + c.carrying.amount;
        flow(w, `${t.res}:-build ${site.def}`, c.carrying.amount);
        c.carrying = null; c.task = null; w.version++;
      }
    } else if (t.kind === 'haul') {
      const from = buildingByUid(w, t.from);
      if (!c.carrying) {
        if (t.restock) {
          const amt = from ? takeOut(w, from, t.res, Math.min(t.amount, from.stock[t.res] ?? 0, CARRY)) : 0;
          if (amt <= 0) { c.task = null; return; }
          c.carrying = { res: t.res, amount: amt }; t.via = undefined;
          return;
        }
        const avail = from?.outbox[t.res] ?? 0;
        const amt = Math.min(t.amount, avail, CARRY);
        if (!from || amt <= 0) { c.task = null; return; }
        from.outbox[t.res] = avail - amt; c.carrying = { res: t.res, amount: amt }; t.via = undefined;
      } else {
        // storage full: it gets dumped on the pile anyway
        putIn(w, buildingByUid(w, t.via ?? null) ?? storeTarget(w, c.carrying.res, c), c.carrying.res, c.carrying.amount);
        c.carrying = null; c.task = null;
      }
    }
    else if (t.kind === 'supply') {
      const to = buildingByUid(w, t.to);
      if (!to) { dropTask(w, c); return; }
      if (!c.carrying) {
        const avail = t.res === 'wood' ? Math.max(0, w.res.wood - woodReserve(w)) : w.res[t.res];
        const amt = takeOut(w, buildingByUid(w, t.via ?? null), t.res, Math.min(t.amount, avail));
        if (amt <= 0) { c.task = null; return; }
        c.carrying = { res: t.res, amount: amt }; t.amount = amt;
      } else {
        to.inbox[t.res] = (to.inbox[t.res] ?? 0) + c.carrying.amount;
        c.carrying = null; c.task = null; w.version++;
      }
    }
  } else if (c.activity === 'eating' && c.meal && c.meal.until === 0) {
    if (!c.meal.got) {
      // at the storage: take something to eat, or try another storage, or give up
      const here = buildingByUid(w, c.meal.from);
      if (grabMeal(w, c, here)) return;
      const next = mealSource(w, c);
      if (next && next.uid !== c.meal.from) c.meal.from = next.uid; else c.meal = null;
      return;
    }
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
    const def = bdef(b); if (!def.recipes) continue;
    // work on the current recipe; if its ingredients aren't here yet, use up whatever another switched-on recipe can
    const cur = currentRecipe(w, b);
    const rec = cur && canCook(w, b, cur, 0) ? cur : (enabledRecipes(b).find(r => canCook(w, b, r, 0)) ?? cur);
    if (!rec) continue;
    for (const c of workersAt(w, b.uid)) {
      if (c.activity !== 'working' || !c.goalReached) continue;
      if (sum(b.outbox) >= OUTBOX_CAP) continue;
      let amount = recipeRate(rec) * workSpeed(w, c, def.job) * dt * b.eff;
      for (const [r, per] of Object.entries(rec.inputs)) amount = Math.min(amount, inInbox(b, r as InputKey) / (per as number));
      if (amount <= 0) continue;
      for (const [r, per] of Object.entries(rec.inputs)) {
        let need = amount * (per as number);
        if (isCategory(r)) {
          for (const x of [...membersOf(r)].sort((p, q) => (b.inbox[q] ?? 0) - (b.inbox[p] ?? 0))) { const t = Math.min(b.inbox[x] ?? 0, need); b.inbox[x] = (b.inbox[x] ?? 0) - t; need -= t; flow(w, `${x}:-${b.def}`, t); }
        } else { b.inbox[r as ResourceId] = (b.inbox[r as ResourceId] ?? 0) - need; flow(w, `${r}:-${b.def}`, need); }
      }
      b.outbox[rec.output] = (b.outbox[rec.output] ?? 0) + amount;
      flow(w, `${rec.output}:+${b.def}`, amount);
      if (def.job) c.skills[def.job] = Math.min(10, c.skills[def.job] + 0.004 * dt * 6);
      // the occasional workplace mishap, likelier for the unskilled
      if (def.job && nextRand(w) < dt * 0.0025 * (def.job === 'chopping' ? 2 : 1) * (11 - c.skills[def.job]) / 6) {
        const id = def.job === 'chopping' || def.job === 'crafting' ? pick(w, ['thumb', 'splinter', 'ankle']) : pick(w, ['splinter', 'ankle']);
        fallIll(w, c, id); addLog(w, `${first(c)} has a ${c.illness!.name.toLowerCase()} and goes off to lie down.`, 'bad');
      }
    }
  }
  // study at the research desk
  if (w.research?.current) for (const b of desks(w)) for (const c of workersAt(w, b.uid)) if (c.activity === 'working' && c.goalReached) researchHourly(w, b, c, dt);
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
        if (w.res.wood >= 1) { w.res.wood -= 1; flow(w, 'wood:-paths', 1); w.paths[i] = 2; w.version++; }
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
function canCook(w: World, b: Building, rec: Recipe, share = 0.2) {
  return Object.entries(rec.inputs).every(([r, per]) => (share ? inInbox(b, r as InputKey) >= (per as number) * share : inInbox(b, r as InputKey) > 0));
}

function completeBuilding(w: World, b: Building) {
  const def = bdef(b);
  // a building in stages moves on to the next one, with its own materials
  if (def.stages && (b.stage ?? 0) < def.stages.length - 1) {
    b.stage = (b.stage ?? 0) + 1; b.progress = 0; b.delivered = {}; w.version++;
    for (const c of alive(w)) if (c.task?.kind === 'build' && c.task.site === b.uid) c.task = null;
    addLog(w, `${def.name}: ${def.stages[b.stage - 1].label.toLowerCase()} done. Next: ${def.stages[b.stage].label.toLowerCase()}.`, 'good');
    return;
  }
  b.built = true; b.progress = siteWork(b); w.version++; w.stats.built++;
  for (const c of alive(w)) if (c.task?.kind === 'build' && c.task.site === b.uid) c.task = null;
  addLog(w, pick(w, [`The ${def.name.toLowerCase()} is finished. Only one thumb was hammered.`, `The ${def.name.toLowerCase()} is done, and it is mostly level.`, `Work on the ${def.name.toLowerCase()} is complete. Everyone admires it briefly.`]), 'good');
  if (def.beds) assignBeds(w);
  // a new flower bed can make a nearby apiary busier
  if (def.id === 'flowerbed') for (const a of w.buildings) if (bdef(a).needs === 'flowers') a.eff = efficiencyAt(w, a.def, a.x, a.y).eff;
  if (def.slots && w.autoAssignNew) fillSlots(w);
  // research starts once there's somewhere to study: the first desk brings the first offer
  if (def.id === 'desk' && w.research && !w.research.current && !w.decisions.some(d => d.kind === 'research') && researchLeft(w).length) {
    w.decisions.push(researchDecision(w, w.research.done.length ? undefined : START.firstResearch));
  }
  // a finished building replaces any planned path under it
  for (let x = b.x; x < b.x + def.w; x++) for (let y = b.y; y < b.y + def.h; y++) if (!def.walkable) w.paths[y * MAP_SIZE + x] = 0;
}

/** food people are allowed to eat */
export function edibleTotal(w: World) { return [...RAW_FOODS, ...MEALS].filter(r => !w.forbidden.includes(r)).reduce((n, r) => n + w.res[r], 0); }
function startMeal(w: World, c: Colonist) {
  const halls = built(w).filter(b => bdef(b).seats);
  const hall = halls.find(b => alive(w).filter(o => o.meal?.at === b.uid).length < (bdef(b).seats ?? 0));
  c.meal = { at: hall?.uid ?? null, until: 0, from: null, got: null };
  c.meal.from = mealSource(w, c)?.uid ?? null;
  if (c.meal.from == null) { c.meal = null; return; }
  // the bedridden get a bowl brought to them
  if (bedridden(c)) {
    c.meal.at = null;
    if (grabMeal(w, c, buildingByUid(w, c.meal.from))) c.meal.until = w.hour + 0.5; else c.meal = null;
  }
}
/** the storage to fetch a meal from: any with cooked food first, then any with allowed raw food; shortest trip to the table */
function mealSource(w: World, c: Colonist): Building | undefined {
  const hall = buildingByUid(w, c.meal?.at ?? null);
  const ok = (rs: ResourceId[]) => storages(w).filter(b => rs.some(r => !w.forbidden.includes(r) && (b.stock[r] ?? 0) >= 1));
  const trip = (b: Building) => dist(spotOf(b), c) + (hall ? dist(spotOf(b), spotOf(hall)) : 0);
  // nothing in storage: grab it straight out of a forager's basket or the kitchen's pot
  const baskets = (rs: ResourceId[]) => built(w).filter(b => !bdef(b).storage && rs.some(r => !w.forbidden.includes(r) && (b.outbox[r] ?? 0) >= 1));
  const pool = ok(MEALS).length ? ok(MEALS) : ok(RAW_FOODS).length ? ok(RAW_FOODS) : baskets(MEALS).length ? baskets(MEALS) : baskets(RAW_FOODS);
  return pool.sort((a, b) => trip(a) - trip(b))[0];
}
/** pick up the best allowed food at a storage; false if there was none */
function grabMeal(w: World, c: Colonist, b: Building | undefined) {
  if (b && !bdef(b).storage) {
    const r = mealOrder(c).find(x => !w.forbidden.includes(x) && (b.outbox[x] ?? 0) >= 1) ?? RAW_FOODS.find(x => !w.forbidden.includes(x) && (b.outbox[x] ?? 0) >= 1);
    if (!r) return false;
    b.outbox[r] = (b.outbox[r] ?? 0) - 1; c.meal!.got = r; flow(w, `${r}:-eaten`, 1);
    return true;
  }
  const has = (r: ResourceId) => !w.forbidden.includes(r) && (b ? (b.stock[r] ?? 0) >= 1 : w.res[r] >= 1);
  const r = mealOrder(c).find(has) ?? [...RAW_FOODS].sort((p, q) => (b ? (b.stock[q] ?? 0) - (b.stock[p] ?? 0) : w.res[q] - w.res[p])).find(has);
  if (!r) return false;
  takeOut(w, b, r, 1); c.meal!.got = r; flow(w, `${r}:-eaten`, 1);
  return true;
}
function finishMeal(w: World, c: Colonist) {
  const hall = buildingByUid(w, c.meal?.at ?? null);
  const got = c.meal?.got ?? null;
  c.meal = null;
  if (!got) return;
  const meal = MEALS.includes(got) ? got : undefined;
  const bonus = (has(c, 'glutton') ? 4 : 0) + (hasPerk(w, 'communalPot') ? 3 : 0);
  if (meal) {
    c.hunger = 100; w.stats.mealsEaten++;
    const v = (MEAL_MOOD[meal] ?? 5) + bonus;
    const label = ({ pie: 'Ate pie', smokedFish: 'Ate smoked fish', stew: 'Ate a hot stew', bread: 'Ate fresh bread', skewers: 'Ate skewers' } as Partial<Record<ResourceId, string>>)[meal] ?? `Ate ${goodName(meal)}`;
    addMemory(w, c, 'meal', label, v, 14);
    tasteMemory(w, c, meal);
  } else {
    const raw = got;
    c.hunger = 85;
    addMemory(w, c, 'meal', `Ate raw ${raw}`, has(c, 'picky') ? -8 : -3, 14);
    if (nextRand(w) < 0.02) { fallIll(w, c, 'tummy'); addLog(w, `${first(c)} ate some questionable ${raw} and now has a bad tummy.`, 'bad'); }
  }
  if (bedridden(c)) return; // fed in bed
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

/** mutual opinion two singles need before sparks can fly */
const ROMANCE_AT = 25;
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
      // people drift towards the company they already enjoy, and away from people they can't stand
      const others = group.filter(o => o.id !== c.id);
      const weight = (o: Colonist) => { const op = opinion(w, c.id, o.id); return op < -20 ? 0.3 : 1 + Math.max(0, op) / 12; };
      let roll = nextRand(w) * others.reduce((n, o) => n + weight(o), 0), other = others[others.length - 1];
      for (const o of others) { roll -= weight(o); if (roll <= 0) { other = o; break; } }
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
        // a good chat warms both sides, a little less for the one who was talked at
        if (!has(other, 'loner')) changeOpinion(w, other, c, gain * 0.5);
      }
      if (c.partner == null && other.partner == null && c.id < other.id
        && opinion(w, c.id, other.id) > ROMANCE_AT && opinion(w, other.id, c.id) > ROMANCE_AT) {
        const chance = 0.12 * (has(c, 'romantic') ? 2.5 : 1) * (has(other, 'romantic') ? 2.5 : 1) * (hasPerk(w, 'matchmaker') ? 2 : 1);
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
  if (has(c, 'tippler') && drinkTotal(w) < 1) add('Nothing to drink in the stores', -4);
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

/** what happened in the last 24 hours, from the running flow totals */
export function lastDay(w: World): Record<string, number> {
  const log = w.flowLog ?? [];
  const then = log.length ? log[0] : {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(w.flows)) { const d = v - (then[k] ?? 0); if (Math.abs(d) > 1e-6) out[k] = d; }
  return out;
}
/** hours the last-day figures cover (less than 24 early in a run) */
export const lastDayHours = (w: World) => Math.max(1, Math.min(24, (w.flowLog ?? []).length));
function hourly(w: World) {
  (w.flowLog ??= []).push({ ...w.flows }); if (w.flowLog.length > 24) w.flowLog.shift();
  const h = Math.round(hourOfDay(w)) % 24;
  const pop = alive(w).length;
  const d = day(w) - 1 + (hourOfDay(w) - 6) / 24;
  const sc = START;
  // strain builds up with every person the frontier has to wear down, faster as the run goes on; it never goes back down
  w.strain += sc.strain.rate * Math.sqrt(pop) * (1 + Math.max(0, d) / sc.strain.rampDays) / 24 * (hasPerk(w, 'ironWill') ? 0.75 : 1);

  if (h >= 18 || h < 6) {
    const hb = sc.hearth;
    const burn = (hasPerk(w, 'warmHearth') ? 0.5 : 1) * Math.min(1, hb.base + hb.perPerson * pop);
    if (w.res.wood >= burn) { w.res.wood -= burn; flow(w, 'wood:-hearth', burn); }
    else everyone(w, 'cold', 'The hearth went cold', -5, 12);
  }
  if (hasBuilt(w, 'bathhouse') && h >= 6 && h < 18) { flow(w, 'wood:-bathhouse', Math.min(0.4, w.res.wood)); w.res.wood = Math.max(0, w.res.wood - 0.4); }
  // food spoils unless it sits somewhere that keeps it fresh (a storehouse)
  const rot = 0.035 / 24;
  for (const r of FOODS) {
    let fresh = 0;
    for (const b of storages(w)) if (bdef(b).keepsFresh) fresh += b.stock[r] ?? 0;
    const loss = Math.max(0, w.res[r] - fresh) * rot;
    if (loss > 0) { w.res[r] -= loss; flow(w, `${r}:-spoiled`, loss); for (const b of storages(w)) if (!bdef(b).keepsFresh && b.stock[r]) b.stock[r]! *= 1 - rot; }
  }
  const tavern = built(w).find(b => b.def === 'tavern');
  const stage = hasBuilt(w, 'stage');

  if (h === 18) for (const c of alive(w)) { c.hadCompanyLastNight = c.hadCompany; c.hadCompany = false; c.drankTonight = false; }

  for (const c of alive(w)) {
    if (c.activity !== 'sleeping') {
      c.hunger -= (100 / 26) * (has(c, 'glutton') ? 1.6 : 1) * (hasPerk(w, 'rations') ? 0.8 : 1);
      c.fun -= 2;
      // a job you love is a little fun in itself; the real lifting still happens at the tavern and the stage
      const jb = c.activity === 'working' ? buildingByUid(w, c.job) : undefined;
      if (jb && bdef(jb).job === c.likes) c.fun += 1.5;
    } else c.hunger -= 1.2;
    c.hunger = Math.max(0, c.hunger);
    c.starvingHours = c.hunger <= 0 ? c.starvingHours + 1 : 0;
    if (c.starvingHours === 24) addLog(w, `${first(c)} is starving. Get food into storage.`, 'bad');
    if (c.starvingHours >= 48) { die(w, c, 'hunger'); continue; }
    if (c.hunger < 45 && !c.meal && !c.carrying && c.activity !== 'sleeping') startMeal(w, c);
    if (c.activity === 'leisure' || c.activity === 'sulking' || c.activity === 'idle') {
      const atTavern = tavern && c.place === tavern.uid;
      if (atTavern && drinkTotal(w) >= 0.3) {
        const r = takeDrink(w, 0.3, 'drunk', c); c.fun += 18;
        if (!c.drankTonight && r) {
          c.drankTonight = true;
          addMemory(w, c, 'ale', `Drank ${goodName(r)} at the tavern`, (DRINK_MOOD[r] ?? 6) + (has(c, 'tippler') ? 4 : 0), 14);
          tasteMemory(w, c, r, 'tasteDrink');
        }
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
  if (h === 18 && w.feast?.called) runFeast(w);
  if (h === 18 && w.festival?.called) runFestival(w);
  checkCharter(w);
  w.ateOffTable = false;
  if (h === 6) dawn(w);
  // the first charter comes on the morning of day 2
  if (!w.charterOffered && day(w) >= sc.firstCharterDay && h >= 6) {
    w.charterOffered = true; w.decisions.push(charterDecision(w, 1));
  }
  if (w.hour >= w.nextEventHour && h >= 8 && h <= 20) triggerEvent(w);
  if (w.status === 'playing' && (lost(w) >= sc.collapse.lost || alive(w).length <= sc.collapse.minAlive)) {
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
  // blueprint drafts every few days once the first charter is picked
  if (w.draftsFrom != null && d > w.draftsFrom && (d - w.draftsFrom) % START.draftEvery === 0) w.decisions.push(blueprintDecision(w));
  if (d % DRAFT_EVERY === 0) {
    const names = new Set(w.colonists.map(c => first(c)));
    const opts = [0, 1, 2].map(() => makeColonist(w, names));
    for (const o of opts) { o.x = 3 + nextRand(w) * 2; o.y = MAP_SIZE - 4; o.px = o.x; o.py = o.y; }
    w.decisions.push({ kind: 'recruit', options: opts });
  }
}

function triggerEvent(w: World) {
  const roll = nextRand(w);
  const ob = START.outbreakFrom;
  if (roll < 0.18 && day(w) >= ob.day && alive(w).length >= ob.pop) outbreak(w);
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

function charterValue(w: World, c: CharterDef): { value: number; target: number; label: string } { return metricValue(w, c.metric, 0); }
/** hours a hold-type condition (a full day with every meal at a table, a full day with nobody sick) has held */
const holdOf = (w: World, slot: number) => w.charterHolds?.[Math.max(0, slot)] ?? 0;
function metricValue(w: World, m: CharterMetric, slot: number): { value: number; target: number; label: string } {
  const held = holdOf(w, slot);
  switch (m.kind) {
    case 'stock': { const v = m.resources.reduce((n, r) => n + w.res[r], 0); return { value: v, target: m.amount, label: `${Math.floor(v)} / ${m.amount} in storage` }; }
    case 'population': { const v = alive(w).length; return { value: v, target: m.amount, label: `${v} / ${m.amount} colonists` }; }
    case 'avgMood': {
      // judged on the average over the last full day, so the dip before breakfast doesn't reset everything
      const log = w.moodLog ?? [];
      const avg = log.length ? log.reduce((a, b) => a + b, 0) / log.length : avgMood(w);
      const full = log.length >= m.hours;
      const value = full && avg >= m.amount ? 1 : Math.min(0.99, (avg / m.amount) * Math.min(1, log.length / m.hours));
      return { value, target: 1, label: `24h average ${Math.round(avg)} / ${m.amount}${full ? '' : ` · ${m.hours - log.length}h to go`}` };
    }
    case 'allTable': return { value: held, target: m.hours, label: `${held}h / ${m.hours}h with every meal at a table` };
    case 'variety': {
      // the best `kinds` goods of the category, each counted up to `each`
      const best = CATEGORIES[m.category].members.map(r => Math.min(m.each, Math.floor(w.res[r]))).sort((a, b) => b - a).slice(0, m.kinds);
      const full = best.filter(n => n >= m.each).length;
      return { value: best.reduce((a, b) => a + b, 0), target: m.kinds * m.each, label: `${full} / ${m.kinds} kinds with ${m.each}+ stored` };
    }
    case 'all': {
      const vs = m.parts.map((p, i) => metricValue(w, p, i));
      const done = vs.every(v => v.value >= v.target);
      const ratio = Math.min(...vs.map(v => Math.min(1, v.value / v.target)));
      return { value: done ? 1 : Math.min(0.99, ratio), target: 1, label: vs.map(v => (v.value >= v.target ? '✓ ' : '') + v.label).join(' · ') };
    }
    case 'built': { const v = built(w).filter(b => b.def === m.def).length; return { value: v, target: m.amount, label: `${v} / ${m.amount} ${BUILDING_BY_ID[m.def].name.toLowerCase()}s` }; }
    case 'everyoneBed': { const a = alive(w); const v = a.filter(c => c.bed != null).length; return { value: v, target: Math.max(1, a.length), label: `${v} / ${a.length} in a bed` }; }
    case 'healthy': return { value: held, target: m.hours, label: `${held}h / ${m.hours}h with nobody sick or hurt` };
    case 'monument': {
      const b = w.buildings.find(x => x.def === m.def); const stages = BUILDING_BY_ID[m.def].stages?.length ?? 1;
      if (!b) return { value: 0, target: stages, label: `${BUILDING_BY_ID[m.def].name} not placed yet` };
      if (b.built) return { value: stages, target: stages, label: `${BUILDING_BY_ID[m.def].name} finished` };
      const st = BUILDING_BY_ID[m.def].stages?.[b.stage ?? 0];
      const left = remainingCost(b);
      const part = Object.keys(left).length ? 0.5 * (1 - sum(left) / Math.max(1, sum(costOf(b)))) : 0.5 + 0.5 * b.progress / siteWork(b);
      return { value: (b.stage ?? 0) + part, target: stages, label: `stage ${(b.stage ?? 0) + 1} of ${stages}${st ? `, ${st.label.toLowerCase()}` : ''}${Object.keys(left).length ? ` · needs ${Object.entries(left).map(([k, n]) => `${Math.ceil(n ?? 0)} ${inputName(k as InputKey)}`).join(', ')}` : ' · building'}` };
    }
    case 'longTable': {
      if (w.feast?.done) return { value: 1, target: 1, label: 'The founders\u2019 feast was a triumph' };
      const f = feastCheck(w);
      return { value: Math.min(0.99, Math.min(f.served, m.pop) / m.pop * (f.ok ? 1 : 0.95)), target: 1, label: `${f.served} / ${m.pop} would be served · ${f.seats} seats${f.sulkers ? ` · ${f.sulkers} sulking` : ''}${w.feast?.called ? ' · called for dusk' : ''}` };
    }
  }
}

/**
 * A dry run of the festival: everyone not bedridden comes (sulkers too: it's a party), each takes a meal and a drink,
 * preferring ones they love and avoiding ones they dislike while anything else is left. Relief is a share of strain.
 */
export function festivalPreview(w: World) {
  const guests = alive(w).filter(c => !bedridden(c));
  const stock = { ...w.res };
  let fed = 0, drank = 0, loved = 0;
  const pickFor = (c: Colonist, goods: ResourceId[]) => [...goods].filter(r => stock[r] >= 1).sort((a, b) => taste(c, b) - taste(c, a) || stock[b] - stock[a])[0];
  for (const c of guests) {
    const meal = pickFor(c, MEALS); if (!meal) continue;
    stock[meal] -= 1; fed++;
    const drink = pickFor(c, CATEGORIES.drink.members); if (drink) { stock[drink] -= 1; drank++; }
    if (taste(c, meal) > 0 || (drink && taste(c, drink) > 0)) loved++;
  }
  const n = Math.max(1, guests.length), r = START.relief.festival;
  const share = r.base * (fed / n) + (drank >= n / 2 ? r.drinks : 0) + (loved >= n / 2 ? r.loved : 0);
  return { guests: guests.length, fed, drank, loved, meals: fed, drinks: drank, share, relief: w.strain * share, wait: Math.max(0, Math.ceil((w.festival?.readyAt ?? 0) - w.hour)) };
}
function runFestival(w: World) {
  const f = w.festival!; f.called = false;
  const p = festivalPreview(w);
  const guests = alive(w).filter(c => !bedridden(c));
  for (const c of guests) {
    const pickFor = (goods: ResourceId[]) => [...goods].filter(r => w.res[r] >= 1).sort((a, b) => taste(c, b) - taste(c, a) || w.res[b] - w.res[a])[0];
    const meal = pickFor(MEALS);
    if (!meal) { addMemory(w, c, 'festival', 'Nothing left for me at the festival', -3, 24); continue; }
    w.res[meal] -= 1; flow(w, `${meal}:-festival`, 1);
    const drink = pickFor(CATEGORIES.drink.members);
    if (drink) { w.res[drink] -= 1; flow(w, `${drink}:-festival`, 1); }
    const fav = taste(c, meal) > 0 || (!!drink && taste(c, drink) > 0);
    addMemory(w, c, 'festival', fav ? 'A festival with my favourites' : 'A festival at the hearth', fav ? 8 : 5, 36);
    c.fun = Math.min(100, c.fun + 40);
  }
  reconcileStock(w);
  w.strain = Math.max(0, w.strain - p.relief);
  f.readyAt = w.hour + START.relief.festival.waitDays * 24; f.held++;
  f.last = `${p.fed} of ${p.guests} ate, ${p.drank} had a drink, ${p.loved} got a favourite; strain eased by ${Math.round(p.relief)}`;
  addLog(w, `The festival: fiddles, stew and dancing badly. ${f.last}.`, 'good');
}

/** a dry run of the founders' feast: who would come, who would get a meal and a drink they don't dislike */
export function feastCheck(w: World) {
  const people = alive(w).filter(c => !bedridden(c));
  const sulkers = people.filter(c => c.sulking).length;
  const guests = people.filter(c => !c.sulking);
  const seats = built(w).reduce((n, b) => n + (bdef(b).seats ?? 0), 0);
  const stock = { ...w.res };
  const pickFor = (c: Colonist, goods: ResourceId[]) => [...goods].filter(r => stock[r] >= 1 && taste(c, r) >= 0).sort((a, b) => taste(c, b) - taste(c, a) || stock[b] - stock[a])[0];
  let served = 0; const hungry: Colonist[] = [];
  for (const c of guests) {
    const meal = pickFor(c, MEALS), drink = pickFor(c, CATEGORIES.drink.members);
    if (meal && drink) { stock[meal] -= 1; stock[drink] -= 1; served++; } else hungry.push(c);
  }
  const target = (charterDef(w.charter)?.metric as { pop?: number } | undefined)?.pop ?? 14;
  const seated = Math.min(served, seats);
  return { guests: guests.length, sulkers, seats, served: seated, hungry: hungry.length, ok: !sulkers && !hungry.length && seats >= guests.length && served >= target };
}
function runFeast(w: World) {
  const f = w.feast!; f.called = false;
  const people = alive(w).filter(c => !bedridden(c));
  const guests = people.filter(c => !c.sulking);
  const sulkers = people.length - guests.length;
  const seats = built(w).reduce((n, b) => n + (bdef(b).seats ?? 0), 0);
  let served = 0, unserved = 0;
  for (const c of guests) {
    const pickFor = (goods: ResourceId[]) => [...goods].filter(r => w.res[r] >= 1 && taste(c, r) >= 0).sort((a, b) => taste(c, b) - taste(c, a) || w.res[b] - w.res[a])[0];
    const meal = pickFor(MEALS), drink = pickFor(CATEGORIES.drink.members);
    if (meal && drink) {
      w.res[meal] -= 1; w.res[drink] -= 1; flow(w, `${meal}:-feast`, 1); flow(w, `${drink}:-feast`, 1); served++;
      addMemory(w, c, 'feast', taste(c, meal) > 0 && taste(c, drink) > 0 ? 'A feast of my favourites' : 'The founders\u2019 feast', taste(c, meal) > 0 && taste(c, drink) > 0 ? 10 : 7, 48);
    } else { unserved++; addMemory(w, c, 'feast', 'Went without at the feast', -5, 24); }
  }
  reconcileStock(w);
  const target = (charterDef(w.charter)?.metric as { pop?: number } | undefined)?.pop ?? 14;
  const short: string[] = [];
  if (sulkers) short.push(`${sulkers} sulked behind the woodpile instead`);
  if (unserved) short.push(`${unserved} got nothing they would eat and drink`);
  if (seats < guests.length) short.push(`${guests.length - seats} had to stand`);
  if (served < target) short.push(`only ${served} of the ${target} the Crown asked for sat down to eat`);
  if (!short.length) { f.done = true; f.last = 'triumph'; addLog(w, `The founders\u2019 feast: ${served} settlers at one long table, every plate something they like. The Crown\u2019s envoy cries a little.`, 'good'); }
  else { f.readyAt = w.hour + 72; f.last = short.join('; '); addLog(w, `The founders\u2019 feast fell short: ${short.join('; ')}. Everyone who ate is cheerful, though. It can be called again in three days.`, 'bad'); }
}
export function avgBeauty(w: World) { const a = alive(w); return a.length ? a.reduce((s, c) => s + c.beauty, 0) / a.length : 0; }
export function charterProgress(w: World) {
  const c = charterDef(w.charter);
  if (!c) return null;
  const v = charterValue(w, c);
  return { charter: c, ...v, ratio: Math.min(1, v.value / v.target) };
}
function checkCharter(w: World) {
  const c = charterDef(w.charter);
  if (!c || w.status !== 'playing') return;
  const m = c.metric;
  // every part has its own hold counter; the mood log is shared
  const holds = (w.charterHolds ??= []);
  (m.kind === 'all' ? m.parts : [m]).forEach((p, i) => {
    if (p.kind === 'avgMood') { (w.moodLog ??= []).push(avgMood(w)); if (w.moodLog.length > p.hours) w.moodLog.shift(); }
    if (p.kind === 'allTable') holds[i] = w.ateOffTable ? 0 : (holds[i] ?? 0) + 1;
    if (p.kind === 'healthy') holds[i] = alive(w).some(x => x.illness) ? 0 : (holds[i] ?? 0) + 1;
  });
  const v = charterValue(w, c);
  if (v.value < v.target) return;
  w.chartersDone.push(c.id); w.charter = null;
  addLog(w, `Charter complete: ${c.name}! The Crown sends a stiffly worded note of approval.`, 'good');
  // the Crown's approval eases the frontier's wear: a share of current strain, so a colony deep in it climbs back further
  const eased = w.strain * START.relief.charter;
  if (eased >= 0.5) { w.strain -= eased; addLog(w, `Word of the charter spreads around the hearth. Strain eases by ${Math.round(eased)}.`, 'good'); }
  if (c.tier === 3) { w.status = 'won'; addLog(w, 'The Crown declares the colony a proper town. Someone makes a banner. It is spelled wrong.', 'good'); return; }
  const perkPool = PERKS.filter(p => !w.perks.includes(p.id)).map(p => p.id);
  w.decisions.push({ kind: 'perk', options: shuffle(w, perkPool).slice(0, 3) });
  w.charterTier = c.tier + 1;
  w.decisions.push(charterDecision(w, w.charterTier as 2 | 3));
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
    const hod = hourOfDay(w);
    if (hod >= 6 && hod < 18) flow(w, `time:${c.job == null ? 'laborer' : 'worker'}:${c.activity === 'working' && !c.goalReached ? 'walking' : c.activity}`, dt);
  }
  produce(w, dt);
  reconcileStock(w);
  w.hour = Math.round((w.hour + dt) * TICKS_PER_HOUR) / TICKS_PER_HOUR;
  if (Math.floor(w.hour + 1e-6) !== before) hourly(w);
}

export function runHours(w: World, hours: number) { for (let i = 0; i < hours * TICKS_PER_HOUR; i++) tick(w); }

/** testing: skip the research and recruiting a check isn't about — unlock every researched building and add settlers */
export function debugGrow(w: World, settlers: number) {
  for (const r of RESEARCH) { if (!w.research.done.includes(r.id)) w.research.done.push(r.id); for (const id of r.unlocks) if (!w.owned.includes(id)) w.owned.push(id); }
  const names = new Set(w.colonists.map(c => first(c)));
  while (alive(w).length < settlers) { const c = makeColonist(w, names); c.joinedDay = day(w); w.colonists.push(c); }
  w.stats.peakPop = Math.max(w.stats.peakPop, alive(w).length);
  assignBeds(w);
}
/** debugging: start a specific event job or an outbreak right now */
export function debugEvent(w: World, id: string) {
  if (id === 'flu') return outbreak(w);
  const def = JOB_EVENTS.find(j => j.id === id);
  if (def) spawnErrand(w, def);
}
