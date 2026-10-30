import { BUILDING_BY_ID } from '../sim/content';
import { World, Building, blockedReason, workersAt, recipesOf, currentRecipe, researchLeft, enabledRecipes } from '../sim/world';

/** Shared by the map and management lists so warnings agree. */
export function buildingStatus(w: World, b: Building): { label: string; warning: boolean } {
  const d = BUILDING_BY_ID[b.def];
  if (!b.built) return { label: 'Under construction', warning: false };
  if (b.def === 'desk' && w.research && !w.research.current && !researchLeft(w).length) return { label: 'Research complete', warning: false };
  const reason = blockedReason(w, b);
  if (reason && recipesOf(b).length && !currentRecipe(w,b) && enabledRecipes(b).length) return { label: 'Stock target met', warning: false };
  if (reason) return { label: recipesOf(b).length && !currentRecipe(w, b) ? 'Recipes off' : reason, warning: true };
  const n = workersAt(w, b.uid).length;
  if (d.slots && !n) return { label: 'No workers', warning: true };
  if (d.needs && b.eff < 0.6) return { label: `${Math.round(b.eff * 100)}% site`, warning: true };
  if (d.slots) return { label: `${n}/${d.slots} workers`, warning: false };
  if (d.beds) return { label: `${d.beds} beds`, warning: false };
  if (d.seats) return { label: `${d.seats} seats · ${Math.round(b.clean)}% clean`, warning: b.clean < 35 };
  if (d.storage) return { label: `${Math.floor(Object.values(b.stock).reduce((n, x) => n + (x ?? 0), 0))}/${d.storage} stored`, warning: false };
  return { label: d.id === 'hearth' ? 'Gathering place' : 'Ready', warning: false };
}

export const saleQuantity = (request: number, stock: number, room: number) => Math.max(0, Math.min(request, Math.floor(stock), room));
