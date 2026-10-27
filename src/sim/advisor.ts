// What a player can work out from the screen: colonists' thoughts, the HUD, building cards and the charter bar.
// It turns those into ranked concerns, each with the evidence a player would see and the fixes that follow.
// The bot plays from this, which doubles as a readability test: if visible information is enough to play well,
// the game is readable. Nothing here peeks at hidden state (fun, opinions, paths, travel times).
import { BUILDING_BY_ID, BUILDINGS, MEALS, RAW_FOODS, RESOURCES, CATEGORIES, ResourceId, RESEARCH } from './content';
import {
  World, Colonist, alive, built, bdef, beds, workersAt, blockedReason, storageCap, stored, spoilingFood, mealTotal,
  storageFree, currentRecipe, drinkTotal, usableHere, stockOf, recipeReach, enabledRecipes, siteOk, festivalPreview, charterProgress,
} from './world';
import { economy } from './economy';

export type Fix =
  | { build: string }
  | { staff: string; n: number }
  | { draft: string }
  | { relaxFoodRules: true }
  | { reassign: 'hated' | 'feud' | 'grumbler' }
  | { laborers: number }
  | { research: string };

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
export const KIND_DEFS: Record<string, string[]> = { rawFood: ['forager', 'dock', 'cellar', 'orchard'], drinks: ['brewery', 'ciderpress'], sawmill: ['sawmill', 'carpenter'] };
export const defsOf = (kind: string) => KIND_DEFS[kind] ?? [kind];

const has = (w: World, id: string) => w.buildings.some(b => b.def === id);
const hasBuilt = (w: World, id: string) => built(w).some(b => b.def === id);
const owns = (w: World, id: string) => w.owned.includes(id);
const slotsOf = (w: World, kind: string) => built(w).filter(b => defsOf(kind).includes(b.def)).reduce((n, b) => n + bdef(b).slots, 0);
const workersOf = (w: World, kind: string) => built(w).filter(b => defsOf(kind).includes(b.def)).reduce((n, b) => n + workersAt(w, b.uid).length, 0);
const name = (id: string) => BUILDING_BY_ID[id].name.toLowerCase();
const goodName = (r: ResourceId) => RESOURCES.find(x => x.id === r)!.name.toLowerCase();

/** gripe labels → a shared key, the way a player would group them on the colonist list */
function gripeKey(label: string): string | null {
  if (label.startsWith('Ate raw')) return 'raw';
  if (label === 'Ate without a table') return 'table';
  if (label === 'Ate in a filthy dining hall') return 'filthy';
  if (label === 'Bored' || label === 'Lonely evening') return 'bored';
  if (label === 'Nothing to drink in the stores') return 'ale';
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
  if (label.startsWith('Doesn’t care for ')) return 'taste';
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
/** the drink maker to point at: one already built, else one owned, else the drafts on offer */
function drinkMaker(w: World): string { return defsOf('drinks').find(id => has(w, id)) ?? defsOf('drinks').find(id => owns(w, id) && usableHere(w, id)) ?? 'brewery'; }
function buildOrDraft(w: World, id: string, fixes: Fix[]): string {
  if (id === 'brewery' && !defsOf('drinks').some(d => owns(w, d))) { for (const d of defsOf('drinks')) fixes.push({ draft: d }); return 'draft a brewery or a cider press'; }
  if (!owns(w, id)) { fixes.push({ draft: id }); return `draft a ${name(id)} blueprint`; }
  if (!has(w, id)) {
    if (BUILDING_BY_ID[id].cost.fine && stockOf(w, 'fine') < (BUILDING_BY_ID[id].cost.fine ?? 0)) {
      // planks or bricks: point at whichever maker the colony has, sawmill first
      const maker = ['sawmill', 'kiln', 'carpenter'].find(m => has(w, m)) ?? ['sawmill', 'kiln', 'carpenter'].find(m => owns(w, m) && usableHere(w, m));
      if (!maker) { fixes.push({ draft: 'sawmill' }, { draft: 'kiln' }); return `a ${name(id)} needs planks or bricks: draft a sawmill or a brick kiln`; }
      if (!has(w, maker)) { fixes.push({ build: maker }); return `a ${name(id)} needs planks or bricks: build a ${name(maker)}`; }
      const kind = maker === 'kiln' ? 'kiln' : 'sawmill';
      fixes.push({ staff: kind, n: 2 }, { build: id }); return `staff the ${name(maker)}, then build a ${name(id)}`;
    }
    fixes.push({ build: id }); return `build a ${name(id)}`;
  }
  return '';
}

/** a building still behind research: the idea points at the study instead, with how far along it is */
function researchFor(w: World, id: string): { idea: string; fix: Fix } | null {
  if (owns(w, id) || !w.research) return null;
  const r = RESEARCH.find(x => x.unlocks.includes(id)); if (!r) return null;
  const now = w.research.current === r.id;
  if (!built(w).some(b => b.def === 'desk')) return { idea: `build a research desk, then study ${r.name.toLowerCase()} to unlock the ${name(id)}`, fix: { build: 'desk' } };
  return { idea: now ? `the scholar is studying ${r.name.toLowerCase()}, which unlocks the ${name(id)}: keep someone at the desk` : `study ${r.name.toLowerCase()} at the research desk to unlock the ${name(id)}`, fix: { research: r.id } };
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
    else if (researchFor(w, 'kitchen')) { const r = researchFor(w, 'kitchen')!; fixes.push(r.fix); idea = r.idea; }
    else if (!has(w, 'kitchen')) { fixes.push({ build: 'kitchen' }, { staff: 'kitchen', n: 1 }); idea = 'build a stew kitchen and put a cook in it'; }
    else { fixes.push({ build: 'kitchen' }, { staff: 'kitchen', n: kslots + 2 }); idea = 'every kitchen slot is busy: build another kitchen'; }
    if (owns(w, 'pieoven') && !has(w, 'pieoven')) fixes.push({ build: 'pieoven' });
    add('raw', `${who('raw')} ate raw food`, `Meals in storage: ${mealTotal(w) | 0} · cooks ${cooks}/${kslots}${idle.length ? ' · a kitchen says "no ingredients"' : ''}${locked.length ? ` · food rules lock ${locked.join(', ')}` : ''}`, idea, wt('raw'), who('raw'), fixes);
  }
  // ---- tastes: people stuck with a meal or drink they don't care for ----
  if (who('taste')) {
    const ppl = g.get('taste')!.people;
    // which goods they're getting and don't care for, read off their thoughts
    const byName = (n: string) => RESOURCES.find(r => r.name.toLowerCase() === n)?.id;
    const disliked = new Map<ResourceId, Colonist[]>();
    for (const c of ppl) for (const t of c.thoughts) if (t.label.startsWith('Doesn’t care for ')) {
      const r = byName(t.label.slice('Doesn’t care for '.length)); if (r) disliked.set(r, [...(disliked.get(r) ?? []), c]);
    }
    const [bad, who2] = [...disliked].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
    if (bad) {
      const cat = CATEGORIES.meal.members.includes(bad) ? 'meal' : 'drink';
      // the other kinds, the ones these people don't also dislike first
      const alts = CATEGORIES[cat].members.filter(r => r !== bad).sort((a, b) => who2.filter(c => c.tastes.dislikes.includes(a)).length - who2.filter(c => c.tastes.dislikes.includes(b)).length);
      const fixes: Fix[] = [];
      let idea = '';
      // nearest route to another kind: a built workshop whose best recipe makes it, then an owned one to build, then a draft
      const best = (d: string, r: ResourceId) => { const recs = (BUILDING_BY_ID[d].recipes ?? []).filter(x => x.output === r); return recs.length && Math.max(...recs.map(x => x.stars)) === Math.max(...(BUILDING_BY_ID[d].recipes ?? []).map(x => x.stars)); };
      const kindOf = (d: string) => defsOf('drinks').includes(d) ? 'drinks' : d;
      for (const r of alts) {
        const site = built(w).find(b => enabledRecipes(b)[0]?.output === r && recipeReach(w, enabledRecipes(b)[0]).state === 'ready');
        if (site) { fixes.push({ staff: kindOf(site.def), n: workersOf(w, kindOf(site.def)) + 1 }); idea = `staff the ${name(site.def)} for ${goodName(r)}`; break; }
        const own = w.owned.find(d => !has(w, d) && best(d, r) && (BUILDING_BY_ID[d].recipes ?? []).some(x => x.output === r && recipeReach(w, x).state === 'ready'));
        if (own) { idea = buildOrDraft(w, own, fixes) || `build a ${name(own)} for ${goodName(r)}`; break; }
      }
      if (!idea) for (const r of alts) {
        const d = BUILDINGS.find(x => x.draftable && !owns(w, x.id) && siteOk(w, x) && best(x.id, r) && (x.recipes ?? []).some(y => y.output === r && recipeReach(w, y).state !== 'never'));
        if (d) { fixes.push({ draft: d.id }); idea = `draft a ${name(d.id)} for ${goodName(r)}`; break; }
      }
      add('taste', `${who2.length} don’t care for ${goodName(bad)}`, `They keep getting ${goodName(bad)} · each colonist’s page shows their favourite and least favourite`,
        idea || `another kind of ${cat}`, wt('taste'), who2.length, fixes);
    }
  }
  if (who('table')) {
    const seats = built(w).reduce((n, b) => n + (bdef(b).seats ?? 0), 0);
    const rs = researchFor(w, 'dining');
    add('table', `${who('table')} ate without a table`, `${seats} seats for ${pop} people (meals overlap, so about half need a seat at once)`, rs ? rs.idea : seats ? 'build another dining hall' : 'build a dining hall', wt('table'), who('table'), rs ? [rs.fix] : [{ build: 'dining' }]);
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
    else if (tavern && drinkTotal(w) < 3) { fixes.push({ staff: 'drinks', n: 2 }); idea = buildOrDraft(w, drinkMaker(w), fixes) || 'make drinks for the tavern'; }
    if (!tavern) idea = idea || buildOrDraft(w, 'tavern', fixes);
    if (!stage) { const s = buildOrDraft(w, 'stage', fixes); idea = idea || s; }
    add('bored', `${who('bored')} bored or lonely`, `Evenings: ${tavern ? `tavern ${workersOf(w, 'tavern') ? 'open' : 'unstaffed'}, drinks ${drinkTotal(w) | 0}` : 'no tavern'} · ${stage ? 'stage built' : 'no stage'}`, idea || 'more evening entertainment', wt('bored'), who('bored'), fixes);
  }
  if (who('ale')) {
    const fixes: Fix[] = [{ staff: 'drinks', n: 2 }];
    const maker = drinkMaker(w);
    const idea = buildOrDraft(w, maker, fixes) || (workersOf(w, 'drinks') ? `the ${name(maker)} needs ingredients carried in` : `staff the ${name(maker)}`);
    add('ale', `${who('ale')} want a drink`, `Drinks in storage: ${drinkTotal(w) | 0} · brewers ${workersOf(w, 'drinks')}/${slotsOf(w, 'drinks')}`, idea, wt('ale'), who('ale'), fixes);
  }
  // ---- homes ----
  if (who('beds')) add('beds', `${who('beds')} sleeping on the ground`, `${beds(w)} beds for ${pop} people`, 'build a shack', wt('beds') * 1.5, who('beds'), [{ build: 'leanto' }]);
  if (who('vain')) {
    const fixes: Fix[] = [];
    const idea = buildOrDraft(w, 'cottage', fixes) || 'build cottages for the vain';
    if (has(w, 'cottage')) fixes.push({ build: 'cottage' });
    add('vain', `${who('vain')} want a cottage`, `Cottages: ${built(w).filter(b => b.def === 'cottage').length} · planks and bricks ${stockOf(w, 'fine') | 0}`, idea, wt('vain'), who('vain'), fixes);
  }
  if (who('ugly')) add('ugly', `${who('ugly')} find it ugly`, 'Their surroundings score low on beauty', researchFor(w, 'flowerbed')?.idea ?? 'decorate where people spend time (hearth, dining hall)', wt('ugly'), who('ugly'), [{ build: 'flowerbed' }, { build: 'lantern' }]);
  // ---- health and warmth ----
  if (who('sick')) {
    const fixes: Fix[] = [];
    const clinic = hasBuilt(w, 'clinic');
    const rs = researchFor(w, 'clinic');
    if (rs) fixes.push(rs.fix); else if (!has(w, 'clinic')) fixes.push({ build: 'clinic' });
    fixes.push({ staff: 'clinic', n: 1 });
    add('sick', `${who('sick')} sick or hurt`, clinic ? `Clinic doctor: ${workersOf(w, 'clinic') ? 'on duty' : 'none assigned'}` : 'No clinic', clinic ? (workersOf(w, 'clinic') ? (stockOf(w, 'remedy') < 1 ? (owns(w, 'apothecary') ? 'an apothecary’s poultices would help the doctor' : 'a better doctor heals faster; remedies from an apothecary help too') : 'a better doctor heals faster') : 'assign a doctor (best medicine skill)') : rs ? rs.idea : 'build a clinic and assign a doctor', wt('sick'), who('sick'), fixes);
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
    const inputs = Object.keys(currentRecipe(w, b)?.inputs ?? {});
    // which kind of worker feeds this workshop's current recipe
    const FEEDS: [string, string, string][] = [['rawFood', 'rawFood', 'foragers'], ['berries', 'rawFood', 'foragers'], ['apples', 'orchard', 'apple pickers'], ['fish', 'dock', 'fishers'], ['wood', 'woodcutter', 'woodcutters'], ['grain', 'field', 'farmers'], ['honey', 'apiary', 'beekeepers'], ['clay', 'claypit', 'clay diggers'], ['reeds', 'dock', 'reed cutters'], ['herbs', 'herbgarden', 'herb gardeners'], ['flour', 'mill', 'millers']];
    const feed = FEEDS.find(([input]) => inputs.includes(input));
    if (feed) {
      const [, upstream, who2] = feed;
      const fix: Fix[] = has(w, upstream) || upstream === 'rawFood' ? [{ staff: upstream, n: workersOf(w, upstream) + 1 }] : [{ build: upstream }];
      add(`idle-${b.def}`, `${def.name} idle`, `Its card says: ${r}`, has(w, upstream) || upstream === 'rawFood' ? `more ${who2} to feed it` : `build a ${name(upstream)} to feed it`, 6, 0, fix);
    }
  }
  // a charter waiting only on the 24-hour mood: a festival lifts everyone for a day and a half
  {
    const prog = charterProgress(w);
    const unmet = prog ? prog.label.split(' · ').filter(x => !x.startsWith('✓')) : [];
    const p = festivalPreview(w);
    if (unmet.length === 1 && unmet[0].includes('24h average') && !p.wait && !w.festival?.called && mealTotal(w) >= pop)
      add('moodcharter', 'The charter is waiting on mood', `Charter: ${prog!.label}`, 'call a festival: everyone gets +5 mood (+8 with a favourite) for a day and a half', 12, 0, []);
  }
  // strain: a festival eases it when people are wearing down
  if (w.strain >= 8) {
    const p = festivalPreview(w);
    if (!p.wait && !w.festival?.called && mealTotal(w) >= pop) add('festival', 'The frontier is wearing everyone down', `Strain ${Math.round(w.strain)} · ${Math.floor(mealTotal(w))} meals and ${Math.floor(drinkTotal(w))} drinks in storage`, `call a festival at the hearth: it would ease strain by about ${Math.round(p.relief)}`, w.strain / 2, 0, []);
  }
  // the research desk: a project waiting on a scholar, or on goods
  if (w.research?.current) {
    const desk = built(w).find(b => b.def === 'desk');
    if (desk && !workersAt(w, desk.uid).length) add('desk', 'Nobody at the research desk', `Studying ${RESEARCH.find(r => r.id === w.research!.current)!.name} · the desk card shows what's left`, 'put someone at the research desk', 7, 0, [{ staff: 'desk', n: 1 }]);
  }
  if (storageCap(w) && stored(w) / storageCap(w) > 0.85) add('storage', 'Storage nearly full', `${stored(w) | 0}/${storageCap(w)} stored`, 'build another stockpile', 8, 0, [{ build: 'stockpile' }]);
  if (spoilingFood(w) >= 20) add('spoiling', 'Food spoiling', `${spoilingFood(w) | 0} food sitting outside a storehouse`, has(w, 'storehouse') ? 'set a storehouse to food, or build another' : researchFor(w, 'storehouse')?.idea ?? 'build a storehouse', 5, 0, has(w, 'storehouse') ? [{ build: storageFree(w, 'berries') < 20 ? 'storehouse' : '' }].filter(f => f.build) : [{ build: 'storehouse' }]);
  const plankNeeds = w.owned.filter(id => !has(w, id) && BUILDING_BY_ID[id].cost.fine && !BUILDING_BY_ID[id].decor);
  if (plankNeeds.length && stockOf(w, 'fine') < 8) {
    const fixes: Fix[] = [];
    const idea = owns(w, 'sawmill') ? (has(w, 'sawmill') ? (workersOf(w, 'sawmill') ? 'the sawmill needs wood carried in' : 'staff the sawmill') : 'build a sawmill') : 'draft a sawmill';
    if (owns(w, 'sawmill')) { if (!has(w, 'sawmill')) fixes.push({ build: 'sawmill' }); fixes.push({ staff: 'sawmill', n: 2 }); } else fixes.push({ draft: 'sawmill' });
    add('planks', 'Out of planks and bricks', `Planks ${w.res.planks | 0}, bricks ${w.res.bricks | 0}, wicker ${w.res.wicker | 0} · waiting on them: ${plankNeeds.map(name).join(', ')}`, idea, 4 + plankNeeds.length * 2, 0, fixes);
  }
  if (w.res.wood < 15) add('wood', 'Wood running low', `Wood ${w.res.wood | 0} · choppers ${workersOf(w, 'woodcutter')}/${slotsOf(w, 'woodcutter')}`, slotsOf(w, 'woodcutter') > workersOf(w, 'woodcutter') ? 'fill the empty woodcutter slots' : 'build another woodcutter near trees', 10, 0,
    [{ staff: 'woodcutter', n: workersOf(w, 'woodcutter') + 1 }, ...(slotsOf(w, 'woodcutter') <= workersOf(w, 'woodcutter') ? [{ build: 'woodcutter' }] : [])]);
  // ---- the ledger: income against use, and where the people are ----
  const e = economy(w);
  if (e.food.daysLeft != null && e.food.daysLeft < 5 && !who('hungry'))
    add('foodflow', 'Eating more than we gather', `Ledger: food ${e.food.net.toFixed(1)} a day · ${Math.floor(e.food.stock)} on hand lasts ~${e.food.daysLeft.toFixed(1)} days`, 'more foragers or fishers, or fewer cooks turning raw food into meals', 30 / Math.max(1, e.food.daysLeft), 0,
      [{ staff: 'rawFood', n: workersOf(w, 'rawFood') + 1 }, ...(workersOf(w, 'rawFood') >= slotsOf(w, 'rawFood') ? [{ build: 'forager' }] : [])]);
  if (e.wood.daysLeft != null && e.wood.daysLeft < 3 && !who('cold'))
    add('woodflow', 'Burning more wood than we chop', `Ledger: wood ${e.wood.net.toFixed(1)} a day · ${Math.floor(e.wood.stock)} on hand lasts ~${e.wood.daysLeft.toFixed(1)} days`, 'another woodcutter, or pause construction', 24 / Math.max(1, e.wood.daysLeft), 0,
      [{ staff: 'woodcutter', n: workersOf(w, 'woodcutter') + 1 }, ...(workersOf(w, 'woodcutter') >= slotsOf(w, 'woodcutter') ? [{ build: 'woodcutter' }] : [])]);
  // When laborers are already busy all day, the cost of any new job is hauling that stops getting done.
  // Tested on the bot: holding extra people back as laborers hurt, but waiting on comfort jobs until laborers have
  // slack helped. So this note carries no fix of its own; it tells you what a new job would cost.
  if (e.laborers.length >= 2 && e.busyShare >= 0.85)
    add('stretched', 'Laborers are busy all day', `Ledger: laborers spend ${Math.round(e.busyShare * 100)}% of their day hauling, building and cleaning`, 'filling another job slot will slow hauling; fix food and wood first', 6, 0, []);
  const open = e.jobs.filter(j => j.workers < j.slots && j.best && j.best.skill >= 6);
  if (open.length && e.busyShare < 0.6 && e.laborers.length >= 2)
    add('slack', 'Laborers with time to spare', `Ledger: laborers busy ${Math.round(e.busyShare * 100)}% of the day · open slots: ${open.map(j => `${j.name} (${first(j.best!.c)}, ${j.best!.skill})`).join(', ')}`, 'put a skilled laborer in an open slot', 5, 0,
      open.slice(0, 1).map(j => ({ staff: kindOf(j.def), n: j.workers + 1 })));
  return out.sort((a, b) => b.weight - a.weight);
}
const first = (c: Colonist) => c.name.split(' ')[0];
const kindOf = (def: string) => Object.entries(KIND_DEFS).find(([, ds]) => ds.includes(def))?.[0] ?? def;

/** the gripe list a player sees, grouped and counted */
export function gripeSummary(w: World) {
  return [...gripes(w)].filter(([k]) => k !== 'strain').map(([k, v]) => ({ key: k, people: v.people.length, weight: v.weight })).sort((a, b) => b.weight - a.weight);
}
