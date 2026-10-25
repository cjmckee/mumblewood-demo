// Deterministic colony simulation. No DOM, no rendering: runs in the browser and in Node.
import {
  BUILDING_BY_ID, BuildingDef, CHARTERS, CharterDef, EVENTS, FIRST_NAMES, JOB_NAMES, JobKind,
  MEALS, PERKS, RAW_FOODS, ResourceId, SHIRTS, SKINS, SURNAMES, TRAITS, TRAIT_BY_ID, BUILDINGS,
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
export type Activity = 'working' | 'idle' | 'leisure' | 'sleeping' | 'sulking';

export interface Colonist {
  id: number; name: string; traits: string[]; likes: JobKind; dislikes: JobKind;
  shirt: number; skin: number;
  x: number; y: number; px: number; py: number; jitter: number;
  hunger: number; fun: number; mood: number; moodTarget: number;
  sulking: boolean; lowMoodHours: number; left: boolean;
  job: number | null; bed: number | null; partner: number | null;
  activity: Activity; place: number | null;
  memories: Memory[]; thoughts: Thought[];
  hadCompany: boolean; hadCompanyLastNight: boolean; drankTonight: boolean;
  joinedDay: number;
}
export interface Building { uid: number; def: string; x: number; y: number }

export type Decision =
  | { kind: 'charter'; tier: 1 | 2 | 3; options: string[] }
  | { kind: 'blueprint'; options: string[] }
  | { kind: 'recruit'; options: Colonist[] }
  | { kind: 'perk'; options: string[] }
  | { kind: 'event'; eventId: string };

export interface LogEntry { day: number; hour: number; text: string; tone: 'good' | 'bad' | 'neutral' | 'love' }

export interface World {
  seed: number; rngState: number;
  hour: number; // absolute hours since start (day 1, 06:00 = hour 6)
  colonists: Colonist[]; buildings: Building[];
  res: Record<ResourceId, number>;
  owned: string[]; perks: string[];
  charterTier: number; charter: string | null; charterHours: number; chartersDone: string[];
  decisions: Decision[]; log: LogEntry[];
  opinions: Record<string, number>;
  status: 'playing' | 'won' | 'lost';
  strain: number; nextEventHour: number;
  plots: { x: number; y: number }[];
  nextUid: number; nextColonistId: number;
  autoAssignNew: boolean;
  stats: { peakPop: number; couples: number; breakups: number; departures: number; mealsEaten: number };
  version: number; // bumps when buildings/colonists change, for the renderer
}

export const TICKS_PER_HOUR = 6;
/** The colony collapses when this many settlers have left. */
export const MAX_DEPARTURES = 6;
/** Workshops won't burn the last of the wood. */
export const WOOD_RESERVE = 20;
export const MAP_SIZE = 25;
const CENTER = 12;

// ---------- Helpers ----------
export const day = (w: World) => Math.floor(w.hour / 24) + 1;
export const hourOfDay = (w: World) => w.hour % 24;
export const alive = (w: World) => w.colonists.filter(c => !c.left);
const has = (c: Colonist, t: string) => c.traits.includes(t);
const hasPerk = (w: World, p: string) => w.perks.includes(p);
const bdef = (b: Building): BuildingDef => BUILDING_BY_ID[b.def];
export const buildingByUid = (w: World, uid: number | null) => (uid == null ? undefined : w.buildings.find(b => b.uid === uid));
export const colonistById = (w: World, id: number | null) => (id == null ? undefined : w.colonists.find(c => c.id === id));
const okey = (a: number, b: number) => `${a}>${b}`;
export const opinion = (w: World, from: number, to: number) => w.opinions[okey(from, to)] ?? 0;

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
export function beds(w: World) { return w.buildings.reduce((n, b) => n + (bdef(b).beds ?? 0), 0); }
export function foodTotal(w: World) { return [...RAW_FOODS, ...MEALS].reduce((n, r) => n + w.res[r], 0); }
export function mealTotal(w: World) { return MEALS.reduce((n, r) => n + w.res[r], 0); }
export function avgMood(w: World) { const a = alive(w); return a.length ? a.reduce((s, c) => s + c.mood, 0) / a.length : 0; }
export function couples(w: World) { return alive(w).filter(c => c.partner != null && c.id < c.partner).length; }
function hasBuilding(w: World, def: string) { return w.buildings.some(b => b.def === def); }

// ---------- Creation ----------
function makeColonist(w: World, usedNames: Set<string>): Colonist {
  let name = '';
  for (let i = 0; i < 50; i++) { name = `${pick(w, FIRST_NAMES)} ${pick(w, SURNAMES)}`; if (!usedNames.has(name.split(' ')[0])) break; }
  usedNames.add(name.split(' ')[0]);
  const traits: string[] = [];
  const pool = shuffle(w, TRAITS);
  for (const t of pool) {
    if (traits.length >= 2) break;
    if (t.group && traits.some(x => TRAIT_BY_ID[x].group === t.group)) continue;
    traits.push(t.id);
  }
  const jobs = Object.keys(JOB_NAMES) as JobKind[];
  const likes = pick(w, jobs);
  let dislikes = pick(w, jobs);
  while (dislikes === likes) dislikes = pick(w, jobs);
  return {
    id: w.nextColonistId++, name, traits, likes, dislikes,
    shirt: pick(w, SHIRTS), skin: pick(w, SKINS),
    x: CENTER + nextRand(w) * 2 - 1, y: CENTER + 1.5 + nextRand(w), px: 0, py: 0, jitter: nextRand(w),
    hunger: 70 + nextRand(w) * 30, fun: 60, mood: 55, moodTarget: 55,
    sulking: false, lowMoodHours: 0, left: false,
    job: null, bed: null, partner: null, activity: 'idle', place: null,
    memories: [], thoughts: [], hadCompany: true, hadCompanyLastNight: true, drankTonight: false,
    joinedDay: 1,
  };
}

function makePlots(): { x: number; y: number }[] {
  const plots: { x: number; y: number; d: number; a: number }[] = [];
  for (let dx = -9; dx <= 9; dx += 3) for (let dy = -9; dy <= 9; dy += 3) {
    if (dx === 0 && dy === 0) continue;
    plots.push({ x: CENTER + dx, y: CENTER + dy, d: Math.hypot(dx, dy), a: Math.atan2(dy, dx) });
  }
  plots.sort((p, q) => p.d - q.d || p.a - q.a);
  return plots.map(({ x, y }) => ({ x, y }));
}

export function createWorld(seed: number): World {
  const w: World = {
    seed, rngState: seed >>> 0, hour: 6,
    colonists: [], buildings: [],
    res: { wood: 40, berries: 50, fish: 0, mushrooms: 0, stew: 10, pie: 0, smokedFish: 0, planks: 0, ale: 0 },
    owned: BUILDINGS.filter(b => b.starting && b.id !== 'hearth').map(b => b.id), perks: [],
    charterTier: 1, charter: null, charterHours: 0, chartersDone: [],
    decisions: [], log: [], opinions: {}, status: 'playing', strain: 0, nextEventHour: 24 * 2.5,
    plots: makePlots(), nextUid: 1, nextColonistId: 1, autoAssignNew: true,
    stats: { peakPop: 6, couples: 0, breakups: 0, departures: 0, mealsEaten: 0 },
    version: 0,
  };
  for (let i = 0; i < 20; i++) nextRand(w); // warm up
  w.buildings.push({ uid: w.nextUid++, def: 'hearth', x: CENTER, y: CENTER });
  for (const id of ['leanto', 'leanto', 'woodcutter', 'forager']) placeBuilding(w, id);
  const names = new Set<string>();
  for (let i = 0; i < 6; i++) w.colonists.push(makeColonist(w, names));
  for (const c of w.colonists) { c.px = c.x; c.py = c.y; }
  assignBeds(w);
  autoAssign(w);
  addLog(w, 'Six settlers arrive at the edge of the Mumblewood with a cart, a kettle, and great optimism.', 'good');
  w.decisions.push({ kind: 'charter', tier: 1, options: shuffle(w, CHARTERS.filter(c => c.tier === 1)).slice(0, 2).map(c => c.id) });
  w.decisions.push(blueprintDecision(w));
  return w;
}

function placeBuilding(w: World, defId: string): Building | null {
  const taken = new Set(w.buildings.map(b => `${b.x},${b.y}`));
  const plot = w.plots.find(p => !taken.has(`${p.x},${p.y}`));
  if (!plot) return null;
  const b = { uid: w.nextUid++, def: defId, x: plot.x, y: plot.y };
  w.buildings.push(b);
  w.version++;
  return b;
}

function assignBeds(w: World) {
  const slots: { uid: number; q: string }[] = [];
  const order = { cozy: 0, basic: 1, rough: 2 } as Record<string, number>;
  for (const b of [...w.buildings].sort((a, b2) => order[bdef(a).bedQuality ?? 'rough'] - order[bdef(b2).bedQuality ?? 'rough'])) {
    for (let i = 0; i < (bdef(b).beds ?? 0); i++) slots.push({ uid: b.uid, q: bdef(b).bedQuality! });
  }
  // vain colonists claim cozy beds first, then partners share a building where possible
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
const CHARTER_HELPERS: Record<string, string[]> = {
  pantry: ['kitchen', 'pieoven', 'smokehouse'], feast: ['kitchen', 'pieoven', 'smokehouse', 'brewery'],
  lumber: ['sawmill'], township: ['sawmill', 'dock'], growing: ['cottage', 'kitchen'], boomtown: ['cottage', 'kitchen'],
  cheer: ['tavern', 'stage', 'cottage', 'bathhouse', 'pieoven'], harmony: ['tavern', 'stage', 'cottage', 'bathhouse'],
  lovebirds: ['tavern', 'stage'],
};
function blueprintDecision(w: World): Decision {
  const pool = BUILDINGS.filter(b => b.draftable && !w.owned.includes(b.id)).map(b => b.id);
  const options = shuffle(w, pool).slice(0, 3);
  const helpers = (CHARTER_HELPERS[w.charter ?? ''] ?? []).filter(id => pool.includes(id));
  const ownsHelper = (CHARTER_HELPERS[w.charter ?? ''] ?? []).some(id => w.owned.includes(id));
  if (helpers.length && !ownsHelper && !options.some(o => helpers.includes(o))) options[options.length - 1] = pick(w, helpers);
  return { kind: 'blueprint', options };
}

// ---------- Commands (the only way the UI changes the world) ----------
export type Command =
  | { type: 'assign'; colonist: number; building: number | null }
  | { type: 'build'; def: string }
  | { type: 'resolve'; option: number }
  | { type: 'autoAssign' }
  | { type: 'setAutoAssignNew'; value: boolean };

export function canAfford(w: World, def: BuildingDef) {
  return Object.entries(def.cost).every(([r, n]) => w.res[r as ResourceId] >= (n ?? 0));
}

export function apply(w: World, cmd: Command): string | null {
  switch (cmd.type) {
    case 'assign': {
      const c = colonistById(w, cmd.colonist); if (!c || c.left) return 'No such colonist.';
      if (cmd.building == null) { c.job = null; return null; }
      const b = buildingByUid(w, cmd.building); if (!b) return 'No such building.';
      const others = workersAt(w, b.uid).filter(o => o.id !== c.id);
      if (others.length >= bdef(b).slots) return `${bdef(b).name} is full.`;
      c.job = b.uid; return null;
    }
    case 'build': {
      const def = BUILDING_BY_ID[cmd.def];
      if (!def || !w.owned.includes(def.id)) return 'You don’t have that blueprint.';
      if (!canAfford(w, def)) return 'Not enough materials.';
      const b = placeBuilding(w, def.id);
      if (!b) return 'No room left to build.';
      for (const [r, n] of Object.entries(def.cost)) w.res[r as ResourceId] -= n ?? 0;
      addLog(w, `A new ${def.name.toLowerCase()} goes up.`, 'good');
      if (def.beds) assignBeds(w);
      if (def.slots && w.autoAssignNew) fillSlots(w);
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
      // re-roll a pending blueprint draft so it can respond to the new charter
      const next = w.decisions[0];
      if (next?.kind === 'blueprint') w.decisions[0] = blueprintDecision(w);
      addLog(w, `New charter from the Crown: ${CHARTERS.find(c => c.id === id)!.name}.`, 'neutral');
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
        w.colonists.push(c); w.version++;
        assignBeds(w);
        if (w.autoAssignNew) fillSlots(w);
        addLog(w, `${c.name} arrives with a suspicious amount of luggage.`, 'good');
        w.stats.peakPop = Math.max(w.stats.peakPop, alive(w).length);
      } else addLog(w, 'The recruits are sent on their way. One of them waves sadly.', 'neutral');
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
  }
  return null;
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
      else addLog(w, 'You don’t have the wood. The peddler sighs theatrically.', 'neutral');
      break;
    case 'relic': takeFood(w, 10); everyone(w, 'relic', 'We own a holy spoon', 3, 72); addLog(w, 'The Holy Spoon of Saint Pomfrey is installed above the hearth.', 'good'); break;
  }
}

// ---------- Assignment ----------
function slotScore(w: World, c: Colonist, b: Building, coworkers: Colonist[]) {
  const def = bdef(b);
  let s = 0;
  if (def.job === c.likes) s += 3;
  if (def.job === c.dislikes) s -= 3;
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
/** Fill empty slots with idle colonists, without moving anyone already working. */
export function fillSlots(w: World) {
  const free = alive(w).filter(c => c.job == null);
  const blds = w.buildings.filter(b => bdef(b).slots > 0).sort((a, b) => buildingPriority(w, b) - buildingPriority(w, a));
  for (const b of blds) {
    while (free.length && workersAt(w, b.uid).length < bdef(b).slots) {
      const co = workersAt(w, b.uid);
      free.sort((p, q) => slotScore(w, q, b, co) - slotScore(w, p, b, co));
      free.shift()!.job = b.uid;
    }
  }
}
export function autoAssign(w: World) {
  for (const c of alive(w)) c.job = null;
  fillSlots(w);
}

// ---------- Simulation ----------
function placeFor(w: World, c: Colonist): { x: number; y: number; uid: number | null } {
  const h = hourOfDay(w);
  const hearth = w.buildings[0];
  const ring = (cx: number, cy: number, r: number) => {
    const a = c.jitter * Math.PI * 2 + c.id * 2.399;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  };
  if (h >= 22 || h < 6) {
    const bed = buildingByUid(w, c.bed);
    if (bed) return { ...ring(bed.x, bed.y, 0.35), uid: bed.uid };
    return { ...ring(hearth.x, hearth.y, 2.2), uid: null };
  }
  if (h >= 6 && h < 18 && !c.sulking) {
    const job = buildingByUid(w, c.job);
    if (job) return { ...ring(job.x, job.y, 0.9), uid: job.uid };
  }
  const myJob = buildingByUid(w, c.job);
  if (h >= 18 && myJob?.def === 'tavern' && !c.sulking) return { ...ring(myJob.x, myJob.y, 0.5), uid: myJob.uid };
  const tavern = w.buildings.find(b => b.def === 'tavern' && workersAt(w, b.uid).length > 0);
  if (h >= 18 && tavern && w.res.ale > 0 && !c.sulking) {
    const server = workersAt(w, tavern.uid)[0];
    if (server && server.id !== c.id) return { ...ring(tavern.x, tavern.y, 1.1), uid: tavern.uid };
  }
  return { ...ring(hearth.x, hearth.y, c.sulking ? 2.6 : 1.6), uid: hearth.uid };
}

function activityFor(w: World, c: Colonist): Activity {
  const h = hourOfDay(w);
  if (h >= 22 || h < 6) return 'sleeping';
  if (c.sulking) return 'sulking';
  if (h < 18) return c.job != null ? 'working' : 'idle';
  const tav = buildingByUid(w, c.job);
  if (tav?.def === 'tavern') return 'working';
  return 'leisure';
}

function workSpeed(w: World, c: Colonist) {
  let s = 1;
  if (has(c, 'lazy')) s *= 0.7;
  if (has(c, 'diligent')) s *= 1.3;
  if (hasPerk(w, 'overtime')) s *= 1.15;
  if (c.mood > 70) s *= 1.1;
  return s;
}

function produce(w: World, dt: number) {
  for (const b of w.buildings) {
    const def = bdef(b); if (!def.recipe) continue;
    for (const c of workersAt(w, b.uid)) {
      if (c.activity !== 'working' || Math.hypot(c.x - b.x, c.y - b.y) > 1.3) continue;
      let amount = def.recipe.rate * workSpeed(w, c) * dt;
      // limit by inputs
      for (const [r, per] of Object.entries(def.recipe.inputs)) {
        // keep a reserve of wood for the hearth, so workshops can't let it go cold
        const avail = r === 'rawFood' ? RAW_FOODS.reduce((n, x) => n + w.res[x], 0) : r === 'wood' ? Math.max(0, w.res.wood - WOOD_RESERVE) : w.res[r as ResourceId];
        amount = Math.min(amount, avail / (per as number));
      }
      if (amount <= 0) continue;
      for (const [r, per] of Object.entries(def.recipe.inputs)) {
        let need = amount * (per as number);
        if (r === 'rawFood') {
          for (const x of [...RAW_FOODS].sort((p, q) => w.res[q] - w.res[p])) { const t = Math.min(w.res[x], need); w.res[x] -= t; need -= t; }
        } else w.res[r as ResourceId] -= need;
      }
      w.res[def.recipe.output] += amount;
    }
  }
}

function eat(w: World, c: Colonist) {
  const meal = MEALS.find(r => w.res[r] >= 1);
  const bonus = (has(c, 'glutton') ? 4 : 0) + (hasPerk(w, 'communalPot') ? 3 : 0);
  if (meal) {
    w.res[meal] -= 1; c.hunger = 100; w.stats.mealsEaten++;
    const v = { pie: 8, smokedFish: 6, stew: 5 }[meal as 'pie' | 'smokedFish' | 'stew'] + bonus;
    const label = { pie: 'Ate pie', smokedFish: 'Ate smoked fish', stew: 'Ate a hot stew' }[meal as 'pie'];
    addMemory(w, c, 'meal', label, v, 14);
    return;
  }
  const raw = [...RAW_FOODS].sort((p, q) => w.res[q] - w.res[p]).find(r => w.res[r] >= 1);
  if (raw) {
    w.res[raw] -= 1; c.hunger = 85;
    addMemory(w, c, 'meal', `Ate raw ${raw === 'berries' ? 'berries' : raw}`, has(c, 'picky') ? -8 : -3, 14);
  }
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
    if ((c.activity !== 'leisure' && c.activity !== 'working') || c.place == null) continue;
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
        // coworker friction or bonding
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
        addMemory(w, other, `insult${c.id}`, `Insulted by ${c.name.split(' ')[0]}`, -4, 12);
        if (nextRand(w) < 0.35) addLog(w, pick(w, INSULTS).replace('{a}', c.name.split(' ')[0]).replace('{b}', other.name.split(' ')[0]), 'bad');
      } else {
        const gain = (2 + nextRand(w) * 3) * tavernBoost * (has(c, 'butterfly') ? 1.5 : 1) * (has(c, 'loner') ? 0.6 : 1);
        changeOpinion(w, c, other, gain);
      }
      // romance
      if (c.partner == null && other.partner == null && c.id < other.id
        && opinion(w, c.id, other.id) > 40 && opinion(w, other.id, c.id) > 40) {
        let chance = 0.025 * (has(c, 'romantic') ? 3 : 1) * (has(other, 'romantic') ? 3 : 1) * (hasPerk(w, 'matchmaker') ? 2 : 1);
        if (nextRand(w) < chance) {
          c.partner = other.id; other.partner = c.id; w.stats.couples++;
          addMemory(w, c, 'love', `Fell for ${other.name.split(' ')[0]}`, 10, 72);
          addMemory(w, other, 'love', `Fell for ${c.name.split(' ')[0]}`, 10, 72);
          addLog(w, `${c.name.split(' ')[0]} and ${other.name.split(' ')[0]} are now an item. Everyone pretends to be surprised.`, 'love');
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
        addMemory(w, x, 'breakup', `Broke up with ${y.name.split(' ')[0]}`, has(x, 'romantic') ? -24 : -12, 72);
        x.memories = x.memories.filter(m => m.key !== 'love');
        changeOpinion(w, x, y, -30);
      }
      addLog(w, `${c.name.split(' ')[0]} and ${p.name.split(' ')[0]} broke up over ${pick(w, BREAKUP_REASONS)}.`, 'bad');
    }
  }
}

function computeThoughts(w: World, c: Colonist): Thought[] {
  const t: Thought[] = [];
  const add = (label: string, value: number) => { if (value !== 0) t.push({ label, value: Math.round(value * 10) / 10 }); };
  if (c.hunger <= 0) add('Starving', -18); else if (c.hunger < 25) add('Hungry', -6);
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
      const first = o.name.split(' ')[0];
      if (has(o, 'grumbler')) add(`${first} won’t stop complaining`, hasPerk(w, 'earplugs') ? -1.5 : -3);
      if (has(o, 'sunny')) add(`${first} is a ray of sunshine`, 2);
      if (opinion(w, c.id, o.id) < -30) add(`Has to work with ${first}`, -6);
    }
    if (has(c, 'loner') && co.length) add('Loner: crowded workplace', -4);
  } else add('Nothing to do', -2);
  const partner = colonistById(w, c.partner);
  if (partner && !partner.left) add(`In love with ${partner.name.split(' ')[0]}`, 6);
  if (c.fun < 25) add('Bored', -6); else if (c.fun > 70) add('Entertained', 4);
  if (has(c, 'butterfly') && !c.hadCompanyLastNight) add('Lonely evening', -6);
  if (has(c, 'sunny')) add('Sunny disposition', 5);
  if (has(c, 'lazy')) add('Doesn’t work too hard', 3);
  if (has(c, 'tippler') && w.res.ale < 1) add('No ale in the stores', -4);
  if (hasBuilding(w, 'bathhouse') && w.res.wood > 0) add('Feeling fresh from the bathhouse', has(c, 'grumbler') ? 5 : 3);
  if (hasPerk(w, 'saintsDay')) add("Saint Pomfrey's blessing", 4);
  const strain = w.strain * (has(c, 'stoic') ? 0.5 : 1);
  if (strain >= 1) add('The frontier wears on me', -strain);
  for (const m of c.memories) add(m.label, m.value);
  return t.sort((a, b) => a.value - b.value);
}

function hourly(w: World) {
  const h = Math.round(hourOfDay(w)) % 24;
  const pop = alive(w).length;
  const d = day(w) - 1 + (hourOfDay(w) - 6) / 24;
  w.strain = (d * 0.55 + d * d * 0.014) * (hasPerk(w, 'ironWill') ? 0.75 : 1) + Math.max(0, pop - 8) * 0.5;
  w.strain = Math.max(0, w.strain);

  // hearth and bathhouse fuel
  if (h >= 18 || h < 6) {
    const burn = hasPerk(w, 'warmHearth') ? 0.5 : 1;
    if (w.res.wood >= burn) w.res.wood -= burn;
    else everyone(w, 'cold', 'The hearth went cold', -5, 12);
  }
  if (hasBuilding(w, 'bathhouse') && h >= 6 && h < 18) w.res.wood = Math.max(0, w.res.wood - 0.4);
  // tavern ale
  const tavern = w.buildings.find(b => b.def === 'tavern');
  const stage = hasBuilding(w, 'stage');

  if (h === 18) for (const c of alive(w)) { c.hadCompanyLastNight = c.hadCompany; c.hadCompany = false; c.drankTonight = false; }

  for (const c of alive(w)) {
    // needs
    if (c.activity !== 'sleeping') {
      c.hunger -= (100 / 26) * (has(c, 'glutton') ? 1.6 : 1) * (hasPerk(w, 'rations') ? 0.8 : 1);
      c.fun -= 2;
    } else c.hunger -= 1.2;
    c.hunger = Math.max(0, c.hunger);
    if (c.hunger < 45 && c.activity !== 'sleeping') eat(w, c);
    if (c.activity === 'leisure' || c.activity === 'sulking' || c.activity === 'idle') {
      const atTavern = tavern && c.place === tavern.uid;
      if (atTavern && w.res.ale >= 0.3) {
        w.res.ale -= 0.3; c.fun += 18;
        if (!c.drankTonight) { c.drankTonight = true; addMemory(w, c, 'ale', 'Drank ale at the tavern', 6 + (has(c, 'tippler') ? 4 : 0), 14); }
      } else c.fun += (c.activity === 'idle' ? 3 : 9) + (stage && h >= 18 ? 5 : 0) + (hasPerk(w, 'warmHearth') ? 1 : 0);
      if (c.activity === 'leisure' && hasPerk(w, 'warmHearth')) addMemory(w, c, 'hearthWarm', 'Warm evening by the hearth', 2, 6);
    }
    c.fun = Math.max(0, Math.min(100, c.fun));
    c.memories = c.memories.filter(m => m.until > w.hour);
    c.thoughts = computeThoughts(w, c);
    c.moodTarget = Math.max(0, Math.min(100, 50 + c.thoughts.reduce((s, x) => s + x.value, 0)));
    const diff = c.moodTarget - c.mood;
    c.mood += Math.max(-6, Math.min(10, diff));

    // mental state
    const first = c.name.split(' ')[0];
    if (!c.sulking && c.mood < 20) { c.sulking = true; addLog(w, `${first} is sulking behind the woodpile and refuses to work.`, 'bad'); }
    else if (c.sulking && c.mood > 32) { c.sulking = false; addLog(w, `${first} has stopped sulking. For now.`, 'neutral'); }
    c.lowMoodHours = c.mood < 10 ? c.lowMoodHours + 1 : 0;
    if (c.lowMoodHours >= 20) leave(w, c);
  }

  socialHour(w);
  if (h === 6) dailyRelationships(w);
  checkCharter(w);
  if (h === 6) dawn(w);
  if (w.hour >= w.nextEventHour && h >= 8 && h <= 20) triggerEvent(w);
  if (w.status === 'playing' && (w.stats.departures >= MAX_DEPARTURES || alive(w).length <= 2)) {
    w.status = 'lost';
    addLog(w, 'Too many settlers have walked off. The Crown revokes the charter. The kettle remains.', 'bad');
  }
}

function leave(w: World, c: Colonist) {
  c.left = true; c.job = null; w.stats.departures++; w.version++;
  addLog(w, `${c.name} packed a sack and wandered off into the woods, muttering.`, 'bad');
  const p = colonistById(w, c.partner);
  if (p) { p.partner = null; addMemory(w, p, 'abandoned', `${c.name.split(' ')[0]} left me`, -14, 72); }
  c.partner = null;
  for (const o of alive(w)) if (opinion(w, o.id, c.id) > 30) addMemory(w, o, `missing${c.id}`, `Misses ${c.name.split(' ')[0]}`, -4, 48);
  assignBeds(w);
}

function dawn(w: World) {
  const d = day(w);
  if (d % 3 === 1 && d > 1) w.decisions.push(blueprintDecision(w));
  if (d % 3 === 2) {
    const names = new Set(w.colonists.map(c => c.name.split(' ')[0]));
    const opts = [0, 1, 2].map(() => makeColonist(w, names));
    for (const o of opts) { o.x = 1 + nextRand(w) * 2; o.y = MAP_SIZE - 3; o.px = o.x; o.py = o.y; }
    w.decisions.push({ kind: 'recruit', options: opts });
  }
}

function triggerEvent(w: World) {
  const pool = EVENTS.filter(e => e.requires !== 'couple' || couples(w) > 0);
  const ev = pick(w, pool);
  w.decisions.push({ kind: 'event', eventId: ev.id });
  const gap = Math.max(1.4, 3.6 - w.strain * 0.06) + nextRand(w) * 1.2;
  w.nextEventHour = w.hour + gap * 24;
}

function charterValue(w: World, c: CharterDef): { value: number; target: number; label: string } {
  const m = c.metric;
  switch (m.kind) {
    case 'stock': { const v = m.resources.reduce((n, r) => n + w.res[r], 0); return { value: v, target: m.amount, label: `${Math.floor(v)} / ${m.amount}` }; }
    case 'population': { const v = alive(w).length; return { value: v, target: m.amount, label: `${v} / ${m.amount} colonists` }; }
    case 'buildings': { const v = w.buildings.length; return { value: v, target: m.amount, label: `${v} / ${m.amount} buildings` }; }
    case 'couples': { const v = couples(w); return { value: v, target: m.amount, label: `${v} / ${m.amount} couples` }; }
    case 'avgMood': return { value: w.charterHours, target: m.hours, label: `${Math.round(avgMood(w))} mood · ${w.charterHours}h / ${m.hours}h` };
    case 'contentPop': return { value: w.charterHours, target: m.hours, label: `${alive(w).length} colonists · ${Math.round(avgMood(w))} mood · ${w.charterHours}h / ${m.hours}h` };
    case 'feast': {
      const meals = mealTotal(w), ale = w.res.ale;
      const v = Math.min(meals / m.meals, ale / m.ale);
      return { value: v, target: 1, label: `${Math.floor(meals)}/${m.meals} meals · ${Math.floor(ale)}/${m.ale} ale` };
    }
  }
}
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
  const v = charterValue(w, c);
  if (v.value < v.target) return;
  w.chartersDone.push(c.id); w.charter = null;
  addLog(w, `Charter complete: ${c.name}! The Crown sends a stiffly worded note of approval.`, 'good');
  if (c.tier === 3) { w.status = 'won'; addLog(w, 'The Crown declares the colony a proper town. Someone makes a banner. It is spelled wrong.', 'good'); return; }
  const perkPool = PERKS.filter(p => !w.perks.includes(p.id)).map(p => p.id);
  w.decisions.push({ kind: 'perk', options: shuffle(w, perkPool).slice(0, 3) });
  w.charterTier = c.tier + 1;
  w.decisions.push({ kind: 'charter', tier: w.charterTier as 2 | 3, options: shuffle(w, CHARTERS.filter(x => x.tier === w.charterTier)).slice(0, 2).map(x => x.id) });
}

/** Advance one tick (1/TICKS_PER_HOUR of an hour). Does nothing while a decision is pending. */
export function tick(w: World): void {
  if (w.status !== 'playing' || w.decisions.length) return;
  const dt = 1 / TICKS_PER_HOUR;
  const before = Math.floor(w.hour + 1e-6);
  for (const c of alive(w)) {
    c.px = c.x; c.py = c.y;
    c.activity = activityFor(w, c);
    const target = placeFor(w, c);
    c.place = target.uid;
    const dx = target.x - c.x, dy = target.y - c.y, dist = Math.hypot(dx, dy);
    const step = 5 * dt;
    if (dist > 0.01) { const k = Math.min(1, step / dist); c.x += dx * k; c.y += dy * k; }
  }
  produce(w, dt);
  w.hour = Math.round((w.hour + dt) * TICKS_PER_HOUR) / TICKS_PER_HOUR;
  if (Math.floor(w.hour + 1e-6) !== before) hourly(w);
}

export function runHours(w: World, hours: number) { for (let i = 0; i < hours * TICKS_PER_HOUR; i++) tick(w); }
