import { BUILDINGS, BUILDING_BY_ID, RESEARCH, membersOf, InputKey } from '../sim/content';
import { World, built, sites } from '../sim/world';
import { Fix, defsOf } from '../sim/advisor';

export type Destination =
  | { kind: 'building'; id: number; label: string }
  | { kind: 'workplaces'; defs: string[]; label: string }
  | { kind: 'catalog'; def: string; label: string }
  | { kind: 'people'; label: string }
  | { kind: 'food'; label: string }
  | { kind: 'research'; label: string };

export function buildingDestination(w: World, def: string, staff = false): Destination {
  const defs = defsOf(def);
  const places = built(w).filter(b => defs.includes(b.def));
  const name = BUILDING_BY_ID[defs[0]]?.name ?? def;
  const verb = BUILDING_BY_ID[defs[0]]?.slots ? 'Staff' : 'Open';
  if (staff && places.length === 1) return { kind: 'building', id: places[0].uid, label: `${verb} ${name}` };
  if (staff && places.length) return { kind: 'workplaces', defs, label: `${verb} ${name}` };
  const site = sites(w).find(b => defs.includes(b.def));
  if (site) return { kind: 'building', id: site.uid, label: `View construction` };
  const available = defs.find(id => w.owned.includes(id));
  if (available) return { kind: 'catalog', def: available, label: `Build ${BUILDING_BY_ID[available].name}` };
  const research = RESEARCH.find(r => r.unlocks.some(id => defs.includes(id)));
  if (research) {
    const desk = w.buildings.find(b => b.def === 'desk');
    if (desk) return { kind: 'building', id: desk.uid, label: `Research ${research.name}` };
    return { kind: 'catalog', def: 'desk', label: 'Build research desk' };
  }
  return { kind: 'catalog', def: defs[0], label: `Find ${name} blueprint` };
}

export function fixDestination(w: World, fix: Fix): Destination {
  if ('build' in fix || 'draft' in fix) return buildingDestination(w, 'build' in fix ? fix.build : fix.draft);
  if ('staff' in fix) return buildingDestination(w, fix.staff, true);
  if ('research' in fix) return buildingDestination(w, 'desk', true);
  if ('relaxFoodRules' in fix) return { kind: 'food', label: 'Food rules' };
  return { kind: 'people', label: 'Review jobs' };
}

export function producers(key: InputKey): string[] {
  const goods = membersOf(key);
  return BUILDINGS.filter(b => b.recipes?.some(r => goods.includes(r.output))).map(b => b.id);
}
