// Problems the diagnostics look for every in-game hour.
import { World, alive, built, sites, workersAt, laborers, mealTotal, storageFree, beds, blockedReason, remainingCost, avgMood, bdef, bedridden } from '../src/sim/world';
import { RAW_FOODS, ResourceId } from '../src/sim/content';

export const ISSUES: Record<string, (w: World) => boolean> = {
  'wood starved (<5)': w => w.res.wood < 5,
  'no raw food (<5)': w => RAW_FOODS.reduce((n, r) => n + w.res[r], 0) < 5,
  'no meals in storage': w => mealTotal(w) < 1,
  'staffed workshop with no ingredients': w => built(w).some(b => workersAt(w, b.uid).length > 0 && !!blockedReason(w, b)),
  'wood low but a woodcutter is empty': w => w.res.wood < 20 && built(w).some(b => b.def === 'woodcutter' && workersAt(w, b.uid).length === 0),
  'food low but a forager or dock is empty': w => RAW_FOODS.reduce((n, r) => n + w.res[r], 0) < alive(w).length * 2 && built(w).some(b => ['forager', 'dock'].includes(b.def) && workersAt(w, b.uid).length === 0),
  'no laborers': w => laborers(w).length === 0,
  'site stuck on materials': w => sites(w).some(b => Object.entries(remainingCost(b)).some(([r, n]) => w.res[r as ResourceId] < Math.min(1, n ?? 0))),
  'storage full': w => storageFree(w) <= 0,
  'not enough beds': w => beds(w) < alive(w).length,
  'someone sulking': w => alive(w).some(c => c.sulking),
  'someone starving': w => alive(w).some(c => c.hunger <= 0),
  'sick with no clinic': w => alive(w).some(c => bedridden(c)) && !built(w).some(b => b.def === 'clinic'),
  'sick, but the clinic has no doctor': w => alive(w).some(c => bedridden(c)) && built(w).some(b => b.def === 'clinic') && !built(w).some(b => b.def === 'clinic' && workersAt(w, b.uid).length > 0),
  'more workplaces than workers': w => built(w).reduce((n, b) => n + (bdef(b).recipe ? bdef(b).slots : 0), 0) > alive(w).length - 2,
  'unassigned urgent job': w => w.errands.some(e => e.assignee == null),
  'low mood (avg < 35)': w => avgMood(w) < 35,
};

