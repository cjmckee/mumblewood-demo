// The colony's books for the last day: what came in, what went out, and what everyone spent their time on.
// Shared by the Ledger tab, the foreman's notes and the balance tools, so they all read the same numbers.
import { BUILDING_BY_ID, JobKind, MEALS, RAW_FOODS, ResourceId, SKILL_NAMES, CATEGORIES, RESOURCES } from './content';
import { World, Colonist, alive, built, bdef, workersAt, lastDay, lastDayHours, foodTotal, bedridden, drinkTotal } from './world';

export interface Line { label: string; perDay: number }
export interface Account { name: string; stock: number; lines: Line[]; net: number; daysLeft: number | null }
export interface JobRow { def: string; name: string; job: JobKind; workers: number; slots: number; best: { c: Colonist; skill: number } | null }
export interface Economy {
  food: Account; wood: Account; planks: Account; drinks: Account; remedies: Account;
  jobs: JobRow[];
  laborers: Colonist[];
  /** share of laborers' working-day hours by activity, 0..1 */
  laborTime: Record<string, number>;
  /** hours of laborer time per day that went to useful work (hauling, building, cleaning) */
  laborBusy: number;
  /** share of laborers' non-meal, non-sick hours spent hauling, building or cleaning, 0..1 */
  busyShare: number;
}

const sumKeys = (f: Record<string, number>, pred: (k: string) => boolean) => Object.entries(f).filter(([k]) => pred(k)).reduce((n, [, v]) => n + v, 0);

export function economy(w: World): Economy {
  const f = lastDay(w);
  const scale = 24 / lastDayHours(w);
  const per = (n: number) => n * scale;
  const raw = RAW_FOODS as ResourceId[], meals = MEALS as ResourceId[];
  const isFood = (r: string) => raw.includes(r as ResourceId) || meals.includes(r as ResourceId);
  const res = (k: string) => k.split(':')[0];
  const src = (k: string) => k.split(':')[1] ?? '';

  // food, counted in items (a stew and a berry both feed one meal)
  const gathered = per(sumKeys(f, k => raw.includes(res(k) as ResourceId) && src(k).startsWith('+')));
  const mealsMade = per(sumKeys(f, k => meals.includes(res(k) as ResourceId) && src(k).startsWith('+')));
  const drinkMakers = ['-brewery', '-ciderpress'];
  const intoCooking = -per(sumKeys(f, k => raw.includes(res(k) as ResourceId) && src(k).startsWith('-') && !['-eaten', '-spoiled'].includes(src(k)) && !drinkMakers.includes(src(k))));
  const intoAle = -per(sumKeys(f, k => isFood(res(k)) && drinkMakers.includes(src(k))));
  const eaten = -per(sumKeys(f, k => isFood(res(k)) && src(k) === '-eaten'));
  const spoiled = -per(sumKeys(f, k => isFood(res(k)) && src(k) === '-spoiled'));
  const food = account('Food', foodTotal(w), [
    { label: 'Gathered', perDay: gathered }, { label: 'Meals cooked', perDay: mealsMade }, { label: 'Raw food into cooking', perDay: intoCooking },
    { label: 'Food into drinks', perDay: intoAle }, { label: 'Eaten', perDay: eaten }, { label: 'Spoiled', perDay: spoiled },
  ]);

  // flow totals are amounts moved; uses count against the account
  const signed = (k: string, v: number) => (src(k).startsWith('-') ? -v : v);
  const wl = (pred: (k: string) => boolean) => per(Object.entries(f).filter(([k]) => res(k) === 'wood' && pred(src(k))).reduce((n, [k, v]) => n + signed(k, v), 0));
  const wood = account('Wood', w.res.wood, [
    { label: 'Chopped', perDay: wl(s => s === '+woodcutter') }, { label: 'Hearth', perDay: wl(s => s === '-hearth') }, { label: 'Heating homes', perDay: wl(s => s === '-homes') },
    { label: 'Construction', perDay: wl(s => s.startsWith('-build')) }, { label: 'Sawmill', perDay: wl(s => s === '-sawmill') }, { label: 'Brick kiln', perDay: wl(s => s === '-kiln') }, { label: 'Carpenter', perDay: wl(s => s === '-carpenter') },
    { label: 'Pie oven', perDay: wl(s => s === '-pieoven') }, { label: 'Bathhouse', perDay: wl(s => s === '-bathhouse') }, { label: 'Paths', perDay: wl(s => s === '-paths') }, { label: 'Blueprint rerolls', perDay: wl(s => s === '-reroll') },
  ]);
  // planks, bricks and wicker: one book, since any of them builds the nice buildings
  const fineIds = CATEGORIES.fine.members;
  const planks = account('Planks and bricks', fineIds.reduce((n, r) => n + w.res[r], 0), [
    ...fineIds.map(r => ({ label: `${RESOURCES.find(x => x.id === r)!.name} made`, perDay: per(sumKeys(f, k => res(k) === r && src(k).startsWith('+'))) })),
    { label: 'Construction', perDay: -per(sumKeys(f, k => fineIds.includes(res(k) as ResourceId) && src(k).startsWith('-build'))) },
    { label: 'Events', perDay: -per(sumKeys(f, k => fineIds.includes(res(k) as ResourceId) && src(k) === '-event')) },
  ]);
  const drinkIds = CATEGORIES.drink.members;
  const isDrink = (k: string) => drinkIds.includes(res(k) as ResourceId);
  const drinks = account('Drinks', drinkTotal(w), [
    ...drinkIds.map(d => ({ label: `${RESOURCES.find(r => r.id === d)!.name} made`, perDay: per(sumKeys(f, k => res(k) === d && src(k).startsWith('+'))) })),
    { label: 'Drunk at the tavern', perDay: -per(sumKeys(f, k => isDrink(k) && src(k) === '-drunk')) },
    { label: 'Bards and weddings', perDay: -per(sumKeys(f, k => isDrink(k) && (src(k) === '-bard' || src(k) === '-wedding'))) },
  ]);

  // jobs: every kind of workplace, with the best-skilled laborer who could fill an empty slot
  const laborers = alive(w).filter(c => c.job == null && !bedridden(c));
  const byDef = new Map<string, JobRow>();
  for (const b of built(w)) {
    const d = bdef(b); if (!d.slots || !d.job) continue;
    const row = byDef.get(b.def) ?? { def: b.def, name: d.name, job: d.job, workers: 0, slots: 0, best: null };
    row.workers += workersAt(w, b.uid).length; row.slots += d.slots; byDef.set(b.def, row);
  }
  for (const row of byDef.values()) {
    const pick = laborers.filter(c => c.dislikes !== row.job).sort((a, z) => z.skills[row.job] + (z.likes === row.job ? 3 : 0) - a.skills[row.job] - (a.likes === row.job ? 3 : 0))[0];
    row.best = pick ? { c: pick, skill: Math.floor(pick.skills[row.job]) } : null;
  }
  const jobs = [...byDef.values()];

  const lt = Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith('time:laborer:')).map(([k, v]) => [k.slice(13), v]));
  const total = Object.values(lt).reduce((a, b) => a + b, 0) || 1;
  const laborTime = Object.fromEntries(Object.entries(lt).map(([k, v]) => [k, v / total]));
  const laborBusy = per((lt.hauling ?? 0) + (lt.building ?? 0) + (lt.cleaning ?? 0));
  const usable = 1 - (laborTime.eating ?? 0) - (laborTime.sick ?? 0);
  const busyShare = usable > 0 ? ((laborTime.hauling ?? 0) + (laborTime.building ?? 0) + (laborTime.cleaning ?? 0)) / usable : 0;
  const remedyIds = CATEGORIES.remedy.members;
  const remedies = account('Remedies', remedyIds.reduce((n, r) => n + w.res[r], 0), [
    ...remedyIds.map(r => ({ label: `${RESOURCES.find(x => x.id === r)!.name} made`, perDay: per(sumKeys(f, k => res(k) === r && src(k).startsWith('+'))) })),
    { label: 'Used at the clinic', perDay: -per(sumKeys(f, k => remedyIds.includes(res(k) as ResourceId) && src(k) === '-clinic')) },
  ]);
  return { food, wood, planks, drinks, remedies, jobs, laborers, laborTime, laborBusy, busyShare };
}

function account(name: string, stock: number, lines: Line[]): Account {
  const shown = lines.filter(l => Math.abs(l.perDay) >= 0.5);
  const net = lines.reduce((n, l) => n + l.perDay, 0);
  return { name, stock, lines: shown, net, daysLeft: net < -0.5 ? stock / -net : null };
}

export const jobSkillName = (job: JobKind) => SKILL_NAMES[job];
export const defName = (id: string) => BUILDING_BY_ID[id].name;
