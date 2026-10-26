// What a player can work out from the screen: colonists' thoughts, the HUD, building cards and the charter bar.
// It turns those into ranked concerns, each with the evidence a player would see and the fixes that follow.
// The bot plays from this, which doubles as a readability test: if visible information is enough to play well,
// the game is readable. Nothing here peeks at hidden state (fun, opinions, paths, travel times).
import { BUILDING_BY_ID, MEALS, RAW_FOODS } from './content';
import {
  World, Colonist, alive, built, bdef, beds, workersAt, blockedReason, storageCap, stored, spoilingFood, mealTotal,
  storageFree,
} from './world';

export type Fix =
  | { build: string }
  | { staff: string; n: number }
  | { draft: string }
  | { relaxFoodRules: true }
  | { reassign: 'hated' | 'feud' | 'grumbler' }
  | { laborers: number };

export interface Concern {
  id: string;
  /** what the player sees */
  title: string;
  evidence: string;
  /** a plain-language next step */
  idea: string;
  /** sum of mood points lost across colonists, or an equivalent urgency */
  weight: number;
  people: number;
  fixes: Fix[];
}

/** a kind of job ("kitchen", "rawFood") and the buildings that do it */
export const KIND_DEFS: Record<string, string[]> = { rawFood: ['forager', 'dock', 'cellar'] };
export const defsOf = (kind: string) => KIND_DEFS[kind] ?? [kind];

const has = (w: World, id: string) => w.buildings.some(b => b.def === id);
const hasBuilt = (w: World, id: string) => built(w).some(b => b.def === id);
const owns = (w: World, id: string) => w.owned.includes(id);
const slotsOf = (w: World, kind: string) => built(w).filter(b => defsOf(kind).includes(b.def)).reduce((n, b) => n + bdef(b).slots, 0);
const workersOf = (w: World, kind: string) => built(w).filter(b => defsOf(kind).includes(b.def)).reduce((n, b) => n + workersAt(w, b.uid).length, 0);
const name = (id: string) => BUILDING_BY_ID[id].name.toLowerCase();

/** gripe labels → a shared key, the way a player would group them on the colonist list */
function gripeKey(label: string): string | null {
  if (label.startsWith('Ate raw')) return 'raw';
  if (label === 'Ate without a table') return 'table';
  if (label === 'Ate in a filthy dining hall') return 'filthy';
  if (label === 'Bored' || label === 'Lonely evening') return 'bored';
  if (label === 'No ale in the stores') return 'ale';
  if (label === 'Vain: deserves a cottage') return 'vain';
  if (label === 'Sleeping on the ground') return 'beds';
  if (label === 'Hungry' || label === 'Starving') return 'hungry';
  if (label.startsWith('Sick:')) return 'sick';
  if (label === 'The hearth went cold') return 'cold';
  if (label.startsWith('Hates ')) return 'hated';
  if (label.startsWith('Has to work with') || label === 'The feud drags on') return 'feud';
  if (label.endsWith('won’t stop complaining')) return 'grumbler';
  if (label === 'Loner: crowded workplace') return 'loner';
  if (label === 'Ugly surroundings') return 'ugly';
  if (label.startsWith('The frontier')) return 'strain';
  return null;
}

export function gripes(w: World): Map<string, { weight: number; people: Colonist[] }> {
  const out = new Map<string, { weight: number; people: Colonist[] }>();
  for (const c of alive(w)) for (const t of c.thoughts) {
    if (t.value >= 0) continue;
    const k = gripeKey(t.label); if (!k) continue;
    const g = out.get(k) ?? { weight: 0, people: [] }; g.weight -= t.value; if (!g.people.includes(c)) g.people.push(c); out.set(k, g);
  }
  return out;
}

/** the next step that unblocks a building we want: build it, or the blueprint we're missing, or what it needs first */
function buildOrDraft(w: World, id: string, fixes: Fix[]): string {
  if (!owns(w, id)) { fixes.push({ draft: id }); return `draft a ${name(id)} blueprint`; }
  if (!has(w, id)) {
    if (BUILDING_BY_ID[id].cost.planks && w.res.planks < (BUILDING_BY_ID[id].cost.planks ?? 0)) {
      if (!owns(w, 'sawmill')) { fixes.push({ draft: 'sawmill' }); return `a ${name(id)} needs planks: draft a sawmill`; }
      if (!has(w, 'sawmill')) { fixes.push({ build: 'sawmill' }); return `a ${name(id)} needs planks: build a sawmill`; }
      fixes.push({ staff: 'sawmill', n: 2 }, { build: id }); return `staff the sawmill for planks, then build a ${name(id)}`;
    }
    fixes.push({ build: id }); return `build a ${name(id)}`;
  }
  return '';
}

export function assess(w: World): Concern[] {
  const out: Concern[] = [];
  const pop = alive(w).length;
  const g = gripes(w);
  const add = (id: string, title: string, evidence: string, idea: string, weight: number, people: number, fixes: Fix[]) => out.push({ id, title, evidence, idea, weight, people, fixes });
  const who = (k: string) => g.get(k)?.people.length ?? 0;
  const wt = (k: string) => g.get(k)?.weight ?? 0;

  // ---- food on the plate ----
  if (who('hungry')) {
    const fixes: Fix[] = [{ staff: 'rawFood', n: Math.max(2, slotsOf(w, 'rawFood')) }, { relaxFoodRules: true }];
    const huts = slotsOf(w, 'rawFood'), staffed = workersOf(w, 'rawFood');
    if (staffed >= huts) fixes.push({ build: owns(w, 'dock') && !has(w, 'dock') ? 'dock' : 'forager' });
    add('hungry', `${who('hungry')} going hungry`, `Food in storage: ${Math.floor(RAW_FOODS.reduce((n, r) => n + w.res[r], 0) + mealTotal(w))} for ${pop} people · food huts ${staffed}/${huts} staffed${w.forbidden.length ? ` · ${w.forbidden.length} foods locked by food rules` : ''}`,
      staffed < huts ? 'staff the empty food huts' : 'build another forager hut near berries', wt('hungry') * 2 + 20, who('hungry'), fixes);
  }
  if (who('raw')) {
    const fixes: Fix[] = [];
    const cooks = workersOf(w, 'kitchen'), kslots = slotsOf(w, 'kitchen');
    const idle = built(w).filter(b => b.def === 'kitchen' && blockedReason(w, b));
    const locked = MEALS.filter(m => w.forbidden.includes(m));
    let idea: string;
    if (locked.length && mealTotal(w) > pop) { fixes.push({ relaxFoodRules: true }); idea = `meals are locked by food rules while ${mealTotal(w) | 0} sit in storage`; }
    else if (idle.length) { fixes.push({ staff: 'rawFood', n: slotsOf(w, 'rawFood') }); idea = 'the kitchen is idle for lack of raw food: more foragers'; }
    else if (cooks < kslots) { fixes.push({ staff: 'kitchen', n: kslots }); idea = `put cooks in the empty kitchen slots (${cooks}/${kslots})`; }
    else { fixes.push({ build: 'kitchen' }, { staff: 'kitchen', n: kslots + 2 }); idea = 'every kitchen slot is busy: build another kitchen'; }
    if (owns(w, 'pieoven') && !has(w, 'pieoven')) fixes.push({ build: 'pieoven' });
    add('raw', `${who('raw')} ate raw food`, `Meals in storage: ${mealTotal(w) | 0} · cooks ${cooks}/${kslots}${idle.length ? ' · a kitchen says "no ingredients"' : ''}${locked.length ? ` · food rules lock ${locked.join(', ')}` : ''}`, idea, wt('raw'), who('raw'), fixes);
  }
  if (who('table')) {
    const seats = built(w).reduce((n, b) => n + (bdef(b).seats ?? 0), 0);
    add('table', `${who('table')} ate without a table`, `${seats} seats for ${pop} people (meals overlap, so about half need a seat at once)`, 'build another dining hall', wt('table'), who('table'), [{ build: 'dining' }]);
  }
  if (who('filthy')) {
    const halls = built(w).filter(b => bdef(b).seats).map(b => `${Math.round(b.clean)}%`).join(', ');
    add('filthy', `${who('filthy')} ate in a filthy hall`, `Dining halls clean: ${halls} · laborers clean when they're free`, 'keep a laborer or two free to clean', wt('filthy'), who('filthy'), [{ laborers: 1 }]);
  }
  // ---- evenings ----
  if (who('bored')) {
    const fixes: Fix[] = [];
    const tavern = hasBuilt(w, 'tavern'), stage = hasBuilt(w, 'stage');
    let idea = '';
    if (tavern && workersOf(w, 'tavern') === 0) { fixes.push({ staff: 'tavern', n: 1 }); idea = 'staff the tavern'; }
    else if (tavern && w.res.ale < 3) { fixes.push({ staff: 'brewery', n: 2 }); idea = buildOrDraft(w, 'brewery', fixes) || 'brew ale for the tavern'; }
    if (!tavern) idea = idea || buildOrDraft(w, 'tavern', fixes);
    if (!stage) { const s = buildOrDraft(w, 'stage', fixes); idea = idea || s; }
    add('bored', `${who('bored')} bored or lonely`, `Evenings: ${tavern ? `tavern ${workersOf(w, 'tavern') ? 'open' : 'unstaffed'}, ale ${w.res.ale | 0}` : 'no tavern'} · ${stage ? 'stage built' : 'no stage'}`, idea || 'more evening entertainment', wt('bored'), who('bored'), fixes);
  }
  if (who('ale')) {
    const fixes: Fix[] = [{ staff: 'brewery', n: 2 }];
    const idea = buildOrDraft(w, 'brewery', fixes) || (workersOf(w, 'brewery') ? 'the brewery needs berries carried in' : 'staff the brewery');
    add('ale', `${who('ale')} want ale`, `Ale in storage: ${w.res.ale | 0} · brewers ${workersOf(w, 'brewery')}/${slotsOf(w, 'brewery')}`, idea, wt('ale'), who('ale'), fixes);
  }
  // ---- homes ----
  if (who('beds')) add('beds', `${who('beds')} sleeping on the ground`, `${beds(w)} beds for ${pop} people`, 'build a lean-to', wt('beds') * 1.5, who('beds'), [{ build: 'leanto' }]);
  if (who('vain')) {
    const fixes: Fix[] = [];
    const idea = buildOrDraft(w, 'cottage', fixes) || 'build cottages for the vain';
    if (has(w, 'cottage')) fixes.push({ build: 'cottage' });
    add('vain', `${who('vain')} want a cottage`, `Cottages: ${built(w).filter(b => b.def === 'cottage').length} · planks ${w.res.planks | 0}`, idea, wt('vain'), who('vain'), fixes);
  }
  if (who('ugly')) add('ugly', `${who('ugly')} find it ugly`, 'Their surroundings score low on beauty', 'decorate where people spend time (hearth, dining hall)', wt('ugly'), who('ugly'), [{ build: 'flowerbed' }, { build: 'lantern' }]);
  // ---- health and warmth ----
  if (who('sick')) {
    const fixes: Fix[] = [];
    const clinic = hasBuilt(w, 'clinic');
    if (!has(w, 'clinic')) fixes.push({ build: 'clinic' });
    fixes.push({ staff: 'clinic', n: 1 });
    add('sick', `${who('sick')} sick or hurt`, clinic ? `Clinic doctor: ${workersOf(w, 'clinic') ? 'on duty' : 'none assigned'}` : 'No clinic', clinic ? (workersOf(w, 'clinic') ? 'a better doctor heals faster' : 'assign a doctor (best medicine skill)') : 'build a clinic and assign a doctor', wt('sick'), who('sick'), fixes);
  }
  if (who('cold')) add('cold', 'The hearth went cold', `Wood in storage: ${w.res.wood | 0} · choppers ${workersOf(w, 'woodcutter')}/${slotsOf(w, 'woodcutter')}`, 'more woodcutters: the hearth burns wood every night', wt('cold') * 1.5, who('cold'), [{ staff: 'woodcutter', n: workersOf(w, 'woodcutter') + 2 }, { build: 'woodcutter' }]);
  // ---- work ----
  if (who('hated')) add('hated', `${who('hated')} hate their job`, 'Shown on each colonist: loves / hates', 'swap them for a laborer who doesn’t mind', wt('hated'), who('hated'), [{ reassign: 'hated' }]);
  if (who('feud') || who('grumbler')) add('coworkers', `${who('feud') + who('grumbler')} can’t stand a coworker`, 'Shown on each colonist’s thoughts', 'split them up', wt('feud') + wt('grumbler'), who('feud') + who('grumbler'), [{ reassign: 'feud' }, { reassign: 'grumbler' }]);

  // ---- things the HUD and building cards say ----
  for (const b of built(w)) {
    const r = blockedReason(w, b);
    if (!r || !workersAt(w, b.uid).length) continue;
    const def = bdef(b);
    const inputs = Object.keys(def.recipe?.inputs ?? {});
    const upstream = inputs.includes('rawFood') || inputs.includes('berries') ? 'rawFood' : inputs.includes('fish') ? 'dock' : inputs.includes('wood') ? 'woodcutter' : null;
    if (upstream) add(`idle-${b.def}`, `${def.name} idle`, `Its card says: ${r}`, `more ${upstream === 'rawFood' ? 'foragers' : upstream === 'woodcutter' ? 'woodcutters' : 'fishers'} to feed it`, 6, 0, [{ staff: upstream, n: workersOf(w, upstream) + 1 }]);
  }
  if (storageCap(w) && stored(w) / storageCap(w) > 0.85) add('storage', 'Storage nearly full', `${stored(w) | 0}/${storageCap(w)} stored`, 'build another stockpile', 8, 0, [{ build: 'stockpile' }]);
  if (spoilingFood(w) >= 20) add('spoiling', 'Food spoiling', `${spoilingFood(w) | 0} food sitting outside a storehouse`, has(w, 'storehouse') ? 'set a storehouse to food, or build another' : 'build a storehouse', 5, 0, has(w, 'storehouse') ? [{ build: storageFree(w, 'berries') < 20 ? 'storehouse' : '' }].filter(f => f.build) : [{ build: 'storehouse' }]);
  const plankNeeds = w.owned.filter(id => !has(w, id) && BUILDING_BY_ID[id].cost.planks && !BUILDING_BY_ID[id].decor);
  if (plankNeeds.length && w.res.planks < 8) {
    const fixes: Fix[] = [];
    const idea = owns(w, 'sawmill') ? (has(w, 'sawmill') ? (workersOf(w, 'sawmill') ? 'the sawmill needs wood carried in' : 'staff the sawmill') : 'build a sawmill') : 'draft a sawmill';
    if (owns(w, 'sawmill')) { if (!has(w, 'sawmill')) fixes.push({ build: 'sawmill' }); fixes.push({ staff: 'sawmill', n: 2 }); } else fixes.push({ draft: 'sawmill' });
    add('planks', 'Out of planks', `Planks ${w.res.planks | 0} · waiting on them: ${plankNeeds.map(name).join(', ')}`, idea, 4 + plankNeeds.length * 2, 0, fixes);
  }
  if (w.res.wood < 15) add('wood', 'Wood running low', `Wood ${w.res.wood | 0} · choppers ${workersOf(w, 'woodcutter')}/${slotsOf(w, 'woodcutter')}`, slotsOf(w, 'woodcutter') > workersOf(w, 'woodcutter') ? 'fill the empty woodcutter slots' : 'build another woodcutter near trees', 10, 0,
    [{ staff: 'woodcutter', n: workersOf(w, 'woodcutter') + 1 }, ...(slotsOf(w, 'woodcutter') <= workersOf(w, 'woodcutter') ? [{ build: 'woodcutter' }] : [])]);
  return out.sort((a, b) => b.weight - a.weight);
}

/** the gripe list a player sees, grouped and counted */
export function gripeSummary(w: World) {
  return [...gripes(w)].filter(([k]) => k !== 'strain').map(([k, v]) => ({ key: k, people: v.people.length, weight: v.weight })).sort((a, b) => b.weight - a.weight);
}
