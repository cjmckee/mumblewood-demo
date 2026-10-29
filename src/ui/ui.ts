// DOM overlay: HUD, bottom sheet, decision modals. Talks to the sim only through commands.
import { BUILDINGS, membersOf, BUILDING_BY_ID, EVENTS, RESEARCH_BY_ID, JOB_NAMES, PERK_BY_ID, TRADER_BY_ID, RESOURCES, TRAIT_BY_ID, ResourceId, SKILL_NAMES, JOB_KINDS, JobKind, Recipe, InputKey, inputName, recipeRate, Stars } from '../sim/content';
import {
  World, Command, Colonist, alive, avgMood, beds, buildingByUid, charterProgress, colonistById,
  day, hourOfDay, opinion, workersAt, MAX_DEPARTURES, sites, siteWork, remainingCost, storageCap, stored,
  keepsFresh, findSpot, canPlace, laborers, centerOf, built, Building, efficiencyAt, pathAt, MAP_SIZE, blockedReason, Errand, patientsAt, lost, bedridden, spoilingFood, accepts, roomIn, FOODS, GOODS,
  recipesOf, recipeOn, currentRecipe, siteOk, rerollCost, REROLL_STEP, stockOf, recipeReach, charterHelpers, charterDef,
  costOf, researchLeft, researchStillNeeds, desks, feastCheck, festivalPreview, mealTotal, drinkTotal,
  comfortParts, comfortOf, colonyComfort, comfortGaps, strainPerDay, footprint, activeNeeds, standingOf, STANDINGS, NeedKey, winterFuelPerDay,
  sellPrice, charterCounted, charterRequirements,
} from '../sim/world';
import { START } from '../sim/scenario';
import { assess } from '../sim/advisor';
import { economy, Account } from '../sim/economy';
import type { IsoView, Picked } from '../render/iso';
import { icon } from './icons';
import { buildingStatus, saleQuantity } from './status';
import { replaceMarkup } from './dom';
import { Destination, buildingDestination, fixDestination, producers } from './navigation';
import { seasonOf, SEASON_NAMES } from '../sim/seasons';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const first = (c: Colonist) => c.name.split(' ')[0];
const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((n, v) => n + (v ?? 0), 0);
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const goodLabel = (k: InputKey) => (k === 'fine' ? 'planks or bricks' : inputName(k));
/** a good or a category with its icon, optionally with a count in front: "[icon]3 planks"; returns HTML */
const goodHtml = (k: InputKey, n?: number | string, label = goodLabel(k)) => `<span class="gd">${icon(k)}${n != null ? `${n} ` : ''}${esc(label)}</span>`;
const costHtml = (cost: Partial<Record<InputKey, number>>, w?: World) =>
  Object.entries(cost).map(([r, n]) => `<span class="${w && stockOf(w,r as InputKey) < n! ? 'cost-short' : ''}">${goodHtml(r as InputKey, n)}${w && stockOf(w,r as InputKey) < n! ? ' !' : ''}</span>`).join(', ') || 'free';
/** "2 [wood] + 1 [clay] → [bricks]" as HTML */
const recipeHtml = (r: Recipe) => `${Object.keys(r.inputs).length ? `${Object.entries(r.inputs).map(([k, n]) => goodHtml(k as InputKey, n)).join(' + ')} → ` : ''}${goodHtml(r.output)}`;

function timeOfDay(h: number) {
  if (h < 6) return 'Night'; if (h < 12) return 'Morning'; if (h < 18) return 'Afternoon'; if (h < 22) return 'Evening'; return 'Night';
}
function activityText(w: World, c: Colonist) {
  const job = buildingByUid(w, c.job);
  switch (c.activity) {
    case 'sleeping': return 'Asleep';
    case 'sulking': return 'Sulking';
    case 'working': return job ? BUILDING_BY_ID[job.def].name : 'Working';
    case 'idle': return 'Idle at the hearth';
    case 'leisure': return c.place != null && buildingByUid(w, c.place)?.def === 'tavern' ? 'At the tavern' : 'At the hearth';
    case 'eating': {
      if (c.meal && !c.meal.got) { const src = buildingByUid(w, c.meal.from); return `Fetching food${src ? ` from the ${BUILDING_BY_ID[src.def].name.toLowerCase()}` : ''}`; }
      const at = buildingByUid(w, c.meal?.at ?? null); return at && BUILDING_BY_ID[at.def].seats ? 'Eating in the dining hall' : 'Eating standing up';
    }
    case 'building': { const t = c.task; if (t?.kind === 'pave') return 'Laying a path'; const b = t && 'site' in t ? buildingByUid(w, t.site) : undefined; return b ? `Building the ${BUILDING_BY_ID[b.def].name.toLowerCase()}` : 'Building'; }
    case 'cleaning': return 'Cleaning the dining hall';
    case 'sick': { const at = buildingByUid(w, c.place); return `${c.illness?.name ?? 'Sick'} · ${at && BUILDING_BY_ID[at.def].patients ? 'at the clinic' : 'resting in bed'}`; }
    case 'errand': { const e = w.errands.find(x => x.id === c.errand); return e ? `On a job: ${e.title.toLowerCase()}` : 'On a job'; }
    case 'hauling': {
      const t = c.task; if (!t) return 'Hauling';
      const r = RESOURCES.find(x => x.id === (t as { res: ResourceId }).res)?.name.toLowerCase() ?? 'goods';
      if (t.kind === 'supply') { const b = buildingByUid(w, t.to); return c.carrying ? `Carrying ${r} to the ${b ? BUILDING_BY_ID[b.def].name.toLowerCase() : 'workshop'}` : `Fetching ${r} for the ${b ? BUILDING_BY_ID[b.def].name.toLowerCase() : 'workshop'}`; }
      if (t.kind === 'deliver') { const b = buildingByUid(w, t.site); return c.carrying ? `Carrying ${r} to the ${b ? BUILDING_BY_ID[b.def].name.toLowerCase() : 'site'}` : `Fetching ${r} for the ${b ? BUILDING_BY_ID[b.def].name.toLowerCase() : 'site'}`; }
      return c.carrying ? `Carrying ${r} to storage` : `Collecting ${r}`;
    }
  }
}
const skillKinds = (c: Colonist) => (Object.keys(c.skills) as JobKind[]);
function topSkills(c: Colonist) { return [...skillKinds(c)].sort((a, b) => c.skills[b] - c.skills[a]).slice(0, 2).map(k => `${SKILL_NAMES[k].toLowerCase()} ${Math.floor(c.skills[k])}`).join(', '); }
function moodClass(m: number, sulking: boolean) { return sulking ? 'sulk' : m >= 60 ? 'good' : m >= 35 ? 'warn' : 'bad'; }

const personLink = (c: Colonist) => `<button type="button" class="text-link" data-act="colonist" data-arg="${c.id}">${esc(c.name)} →</button>`;
const moodDirection = (c: Colonist) => c.moodTarget > c.mood + 1 ? '↑' : c.moodTarget < c.mood - 1 ? '↓' : '↔';
const meter = (value: number, label: string) => `<meter min="0" max="100" value="${Math.max(0,Math.min(100,value))}" aria-label="${esc(label)}">${Math.round(value)}%</meter>`;
function selectHtml(action: string, label: string, value: string, options: string[][]) { return `<label class="select-label"><span class="sr-only">${label}</span><select data-act="${action}" aria-label="${label}">${options.map(([v,l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`; }
function matchesPerson(c: Colonist, filter: string) { return filter === 'ill' ? !!c.illness : filter === 'hungry' ? c.hunger < 25 : filter === 'unhoused' ? c.bed == null : filter === 'sulking' ? c.sulking : filter === 'free' ? c.job == null : true; }
function personState(c: Colonist) { return [c.illness ? `✚ ${c.illness.name}` : '', c.hunger < 25 ? '⚠ Hungry' : '', c.bed == null ? '⌂ No bed' : '', c.sulking ? '☁ Sulking' : ''].filter(Boolean).join(' · '); }
function buildingGroup(id: string) { const d = BUILDING_BY_ID[id]; return d.storage ? 'storage' : d.beds || d.seats || d.decor || d.patients || ['hearth','tavern','stage','bathhouse'].includes(id) ? 'comfort' : d.job === 'cooking' || d.job === 'brewing' || d.job === 'foraging' || d.job === 'fishing' ? 'food' : 'work'; }

function logText(w: World, text: string) {
  const entities = [...w.colonists.map(c=>({name:c.name,act:'colonist',arg:String(c.id)})), ...BUILDINGS.map(b=>({name:b.name,act:'workplaces',arg:b.id}))].sort((a,b)=>b.name.length-a.name.length);
  let html = '', cursor = 0;
  while (cursor < text.length) {
    let found: typeof entities[number] | undefined, at = text.length;
    for (const e of entities) { const i = text.indexOf(e.name,cursor); if (i >= 0 && i < at) { found = e; at = i; } }
    html += esc(text.slice(cursor,at));
    if (!found) break;
    html += `<button type="button" class="text-link" data-act="${found.act}" data-arg="${found.arg}">${esc(found.name)}</button>`;
    cursor = at + found.name.length;
  }
  return html;
}

type Tab = 'colonists' | 'build' | 'ledger' | 'issues' | 'log';
type Detail = { kind: 'colonist' | 'building'; id: number } | null;

const goodName = (r: ResourceId) => RESOURCES.find(x => x.id === r)!.name.toLowerCase();
/** " · favourite food pie · not stew", with bold for the detail page */
const tasteLine = (c: Colonist, bold = true) => {
  const b = (r: ResourceId) => (bold ? `<b>${goodHtml(r)}</b>` : goodHtml(r));
  return c.tastes.loves.map((r, i) => ` · favourite ${b(r)}, not ${b(c.tastes.dislikes[i])}`).join('');
};
/** "", "needs an orchard hut (not drafted yet)" or "no honey on this map", for a recipe line */
function reachText(w: World, r: Recipe, forDraft: boolean) {
  const x = recipeReach(w, r);
  if (x.state === 'ready') return forDraft ? 'ready' : '';
  if (x.state === 'never') return `no ${inputName(x.input!)} on this map`;
  const b = BUILDING_BY_ID[x.via!].name.toLowerCase();
  return forDraft ? `needs ${/^[aeiou]/.test(b) ? 'an' : 'a'} ${b}` : `nothing here makes ${inputName(x.input!)} yet: needs ${/^[aeiou]/.test(b) ? 'an' : 'a'} ${b}`;
}
/** filled stars in the accent colour, missing ones dimmed, so ★★ reads as two of three */
const starHtml = (n: Stars) => `<span class="stars" aria-label="${n} of 3 stars">${'★'.repeat(n)}<s>${'★'.repeat(3 - n)}</s></span>`;

export class UI {
  tab: Tab = 'colonists';
  open = false;
  detail: Detail = null;
  speed = 1;
  private lastHud = ''; private lastSheet = ''; private lastModal = '';
  onSpeed: (s: number) => void = () => {};
  onRestart: () => void = () => {};
  /** run history from this browser, shown on the end screen */
  profile: { runs: { result: string; day: number; charters: number }[] } = { runs: [] };
  private picking: number | null = null; // errand id whose colonist picker is open
  private festivalOpen = false;
  /** a saved run was found on boot: the game waits on the welcome-back card */
  resumeOpen = false;
  resumeSavedAt = '';
  onResume: () => void = () => {};
  /** "start a new colony" asks once before throwing away the run in progress */
  private confirmNew = false;
  private strainOpen = false;
  private help: string | null = null;
  private colonistFilter = 'all';
  private colonistSort = 'mood';
  private buildingFilter = 'all';
  private buildMode = 'manage';
  private catalogGroup = 'all';
  private destination: Destination | null = null;
  private peopleFilter: number[] | null = null;
  private resource: InputKey | 'gold' | null = null;
  private anchor: string | null = null;
  private sheetKey = '';
  private sheetScroll = new Map<string, number>();
  private returnFocus: { act: string; arg: string } | null = null;
  get blocksSimulation() { return this.festivalOpen || this.strainOpen || this.picking != null || this.help != null; }

  private dismissDialog() {
    if (this.getWorld().decisions.length || this.resumeOpen || this.getWorld().status !== 'playing') return;
    this.festivalOpen = false; this.strainOpen = false; this.picking = null; this.help = null;
    this.render(true);
  }

  private keyboard(e: KeyboardEvent) {
    const modal = this.root.querySelector<HTMLElement>('#modal')!;
    if (modal.hidden) {
      if (e.key === 'Escape') { this.view.placing = null; this.view.pathMode = false; this.open = false; this.detail = null; this.render(true); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); this.dismissDialog(); }
    if (e.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), summary, select, [tabindex="0"]')].filter(el => el.getClientRects().length);
    const at = controls.indexOf(document.activeElement as HTMLElement);
    if (!controls.length) { e.preventDefault(); modal.focus(); }
    else if (e.shiftKey && at <= 0) { e.preventDefault(); controls[controls.length - 1].focus(); }
    else if (!e.shiftKey && (at === controls.length - 1 || at < 0)) { e.preventDefault(); controls[0].focus(); }
  }

  constructor(private root: HTMLElement, private getWorld: () => World, private send: (c: Command) => string | null, private view: IsoView) {
    root.addEventListener('click', e => { if (!(e.target instanceof HTMLSelectElement)) this.click(e); });
    root.addEventListener('change', e => this.click(e));
    root.addEventListener('keydown', e => this.keyboard(e));
    view.onPick = p => this.picked(p);
    view.onPathTap = (x, y) => {
      const w = this.getWorld();
      const cur = pathAt(w, x, y);
      if (cur === 2) { this.toast('There\u2019s already a path here.'); return; }
      const err = this.send({ type: 'path', x, y, on: cur === 0 });
      if (err) this.toast(err);
      this.render(true);
    };
  }

  private panel(tab: Tab) {
    if (tab === 'colonists') this.colonistFilter = 'all';
    this.tab = tab; this.open = true; this.detail = null; this.view.selected = null;
    this.destination = null; this.peopleFilter = null; this.resource = null;
    this.festivalOpen = false; this.strainOpen = false; this.picking = null; this.help = null;
  }

  private navigate(d: Destination) {
    this.panel(d.kind === 'people' || d.kind === 'food' ? 'colonists' : 'build');
    if (d.kind === 'building') this.picked({ kind: 'building', id: d.id });
    else if (d.kind === 'food') this.anchor = 'food-rules';
    else this.destination = d;
  }

  private issueList(w: World) {
    const concerns = assess(w);
    return `<div class="list-head"><b>${concerns.length} concerns</b></div><div class="concerns">${concerns.map(c => {
      const actions = c.fixes.map((f, i) => `<button type="button" class="ghost" data-act="fix" data-arg="${c.id}:${i}">${esc(fixDestination(w, f).label)} →</button>`).join('');
      return `<article class="concern"><b>⚠ ${esc(c.title)}</b><div class="actions">${actions || `<button type="button" class="ghost" data-act="${c.id === 'festival' || c.id === 'moodcharter' ? 'festival-open' : 'tab'}" data-arg="ledger">${c.id === 'festival' || c.id === 'moodcharter' ? 'Plan festival' : 'Open ledger'} →</button>`}${c.personIds.length ? `<button type="button" class="ghost" data-act="issue-people" data-arg="${c.id}">${c.personIds.length} people →</button>` : ''}</div><details data-key="issue-${c.id}"><summary>Details</summary><p>${esc(c.evidence)}</p><p>${esc(c.idea)}</p></details></article>`;
    }).join('') || '<p class="empty">✓ No concerns</p>'}</div>`;
  }

  private destinationList(w: World) {
    const d = this.destination;
    if (!d) return '';
    if (d.kind === 'workplaces') return `<button type="button" class="ghost" data-act="tab" data-arg="build">All buildings</button><h3>${esc(d.label)}</h3><div class="rows">${w.buildings.filter(b => d.defs.includes(b.def)).map(b => `<button type="button" class="row compact" data-act="building" data-arg="${b.uid}"><span class="who"><b>${icon(b.def)} ${esc(BUILDING_BY_ID[b.def].name)}</b><small>Map ${b.x}, ${b.y} · ${esc(buildingStatus(w, b).label)}</small></span><span>→</span></button>`).join('')}</div>`;
    if (d.kind === 'catalog') {
      const def = BUILDING_BY_ID[d.def];
      const available = w.owned.includes(d.def);
      return `<button type="button" class="ghost" data-act="tab" data-arg="build">All buildings</button><h2>${icon(d.def)} ${esc(def.name)}</h2><p>${esc(def.blurb)}</p><p>${costHtml(def.cost)}</p>${available ? `<button type="button" class="act" data-act="build" data-arg="${d.def}">Place</button>` : `<p class="warnline">Blueprint needed · watch drafts and caravans.</p>`}`;
    }
    return '';
  }

  private picked(p: Picked | null) {
    this.view.selected = p;
    if (!p) { this.detail = null; this.render(true); return; }
    this.detail = { kind: p.kind, id: p.id };
    const subject = p.kind === 'building' ? buildingByUid(this.getWorld(), p.id) : colonistById(this.getWorld(), p.id);
    if (subject) { const at = p.kind === 'building' ? centerOf(subject as Building) : subject; this.view.focus(at.x, at.y); }
    this.tab = p.kind === 'building' ? 'build' : 'colonists';
    this.open = true;
    this.render(true);
  }

  toast(text: string) {
    const t = this.root.querySelector('#toast') as HTMLElement;
    t.textContent = text; t.hidden = false;
    clearTimeout((t as any)._h); (t as any)._h = setTimeout(() => (t.hidden = true), 2600);
  }

  private click(e: Event) {
    const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!el) return;
    const act = el.dataset.act!, arg = el instanceof HTMLSelectElement ? el.value : el.dataset.arg ?? '';
    const w = this.getWorld();
    switch (act) {
      case 'help': this.help = arg; break;
      case 'help-close': this.help = null; break;
      case 'colonist-filter': this.colonistFilter = arg; break;
      case 'colonist-sort': this.colonistSort = arg; break;
      case 'building-filter': this.buildingFilter = arg; break;
      case 'build-mode': this.buildMode = arg; this.destination = null; break;
      case 'catalog-group': this.catalogGroup = arg; break;
      case 'jobs': this.anchor = 'person-jobs'; break;
      case 'review-jobs': this.panel('colonists'); break;
      case 'speed': this.speed = Number(arg); this.onSpeed(this.speed); break;
      case 'tab':
        if (this.tab === arg && this.open && !this.detail && !this.destination && !this.peopleFilter) this.open = false; else { this.tab = arg as Tab; this.open = true; }
        this.detail = null; this.destination = null; this.peopleFilter = null; this.view.selected = null; break;
      case 'close': this.open = false; this.detail = null; this.view.selected = null; break;
      case 'back': this.detail = null; this.view.selected = null; break;
      case 'colonist': this.picked({ kind: 'colonist', id: Number(arg) }); break;
      case 'building': this.picked({ kind: 'building', id: Number(arg) }); break;
      case 'fix': { const [id, index] = arg.split(':'); const fix = assess(w).find(c => c.id === id)?.fixes[Number(index)]; if (fix) this.navigate(fixDestination(w, fix)); break; }
      case 'issue-people': { const people = assess(w).find(c => c.id === arg)?.personIds ?? []; this.panel('colonists'); this.peopleFilter = people; break; }
      case 'workplaces': this.navigate({ kind: 'workplaces', defs: arg.split(','), label: 'Workplaces' }); break;
      case 'construction': this.panel('build'); this.buildMode = 'manage'; this.buildingFilter = 'sites'; break;
      case 'catalog-help': this.navigate(buildingDestination(w, arg)); break;
      case 'source': {
        const defs = producers(arg as InputKey), existing = w.buildings.filter(b => defs.includes(b.def));
        if (existing.length) this.navigate({ kind: 'workplaces', defs, label: `Sources of ${inputName(arg as InputKey)}` });
        else { const def = defs.find(d => w.owned.includes(d)) ?? defs[0]; if (def) this.navigate(buildingDestination(w, def)); }
        break;
      }
      case 'resource': this.panel('ledger'); this.resource = arg as InputKey | 'gold'; this.anchor = `account-${arg}`; break;
      case 'storage-help': this.navigate(buildingDestination(w, 'storehouse', true)); break;
      case 'food-rules': this.navigate({ kind: 'food', label: 'Food rules' }); break;
      case 'need': { const def = arg === 'table' ? 'dining' : NEED_BUILD[arg as NeedKey]; this.navigate(buildingDestination(w, def, !['shelter', 'surroundings', 'warmth'].includes(arg))); break; }
      case 'build': this.startPlacing(arg); break;
      case 'place-confirm': {
        const pl = this.view.placing; if (!pl) break;
        const err = this.send({ type: 'place', def: pl.def, x: pl.x, y: pl.y, rot: pl.rot ?? 0 });
        if (err) { this.toast(err); break; }
        this.view.placing = null;
        this.toast(laborers(w).length ? 'Construction queued.' : 'Construction queued · no free laborers.');
        break;
      }
      case 'place-cancel': this.view.placing = null; break;
      case 'place-rotate': this.rotatePlacing(); break;
      case 'paths': this.view.pathMode = true; this.view.placing = null; this.open = false; this.detail = null; break;
      case 'paths-done': this.view.pathMode = false; this.open = true; this.tab = 'build'; break;
      case 'cancel-site': { const err = this.send({ type: 'cancel', building: Number(arg) }); if (err) this.toast(err); this.detail = null; this.view.selected = null; break; }
      case 'assign': { const [cid, bid] = arg.split(':').map(x => (x === 'none' ? null : Number(x))); const err = this.send({ type: 'assign', colonist: cid!, building: bid }); if (err) this.toast(err); break; }
      case 'store-preset': { const [bid, m] = arg.split(':'); this.send({ type: 'storageFilter', building: Number(bid), allow: m === 'food' ? FOODS : m === 'goods' ? GOODS : null }); break; }
      case 'recipe-toggle': { const [bid, i] = arg.split(':').map(Number); const b = buildingByUid(w, bid); if (!b) break; this.send({ type: 'toggleRecipe', building: bid, recipe: i, on: !recipeOn(b, i) }); break; }
      case 'store-prio': { const [bid, m] = arg.split(':'); this.send({ type: 'storagePriority', building: Number(bid), high: m === 'high' }); break; }
      case 'store-item': {
        const [bid, r] = arg.split(':'); const b = buildingByUid(w, Number(bid)); if (!b) break;
        const cur = b.allow ?? RESOURCES.map(x => x.id);
        const next = cur.includes(r as ResourceId) ? cur.filter(x => x !== r) : [...cur, r as ResourceId];
        if (!next.length) { this.toast('Storage has to take something.'); break; }
        this.send({ type: 'storageFilter', building: b.uid, allow: next }); break;
      }
      case 'food': { const f = arg as ResourceId; this.send({ type: 'foodRule', food: f, allowed: w.forbidden.includes(f) }); break; }
      case 'auto': this.send({ type: 'autoAssign' }); this.toast('The foreman has reassigned everyone.'); break;
      case 'resolve': this.send({ type: 'resolve', option: Number(arg) }); this.lastModal = ''; break;
      case 'reroll': { const err = this.send({ type: 'reroll' }); if (err) this.toast(err); this.lastModal = ''; break; }
      case 'trade-buy': { const [r, n] = arg.split(':'); const err = this.send({ type: 'buy', res: r as ResourceId, n: Number(n) }); if (err) this.toast(err); this.lastModal = ''; break; }
      case 'trade-sell': { const [r, n] = arg.split(':'); const err = this.send({ type: 'sell', res: r as ResourceId, n: Number(n) }); if (err) this.toast(err); this.lastModal = ''; break; }
      case 'trade-bp': { const err = this.send({ type: 'buyBlueprint', id: arg }); this.toast(err ?? `${BUILDING_BY_ID[arg].name} added to what you can build.`); this.lastModal = ''; break; }
      case 'caravan-visit': { const err = this.send({ type: 'visitCaravan' }); this.toast(err ?? 'Pick someone to walk over to the caravan.'); break; }
      case 'restart':
        // from the end screen it's immediate; with a run in progress it asks first
        if (w.status === 'playing' && !this.confirmNew) { this.confirmNew = true; this.lastModal = ''; this.lastSheet = ''; break; }
        this.confirmNew = false; this.onRestart(); break;
      case 'restart-cancel': this.confirmNew = false; this.lastModal = ''; this.lastSheet = ''; break;
      case 'resume': this.confirmNew = false; this.onResume(); break;
      case 'desk': this.navigate(buildingDestination(w, 'desk', true)); break;
      case 'feast': { const err = this.send({ type: 'callFeast' }); this.toast(err ?? 'The feast is called. Everyone sits down at dusk.'); break; }
      case 'errand-open': this.picking = Number(arg); break;
      case 'errand-close': this.picking = null; break;
      case 'errand-send': { const [eid, cid] = arg.split(':').map(Number); const d0 = w.decisions[0];
        if (d0?.kind === 'errand' && d0.errandId === eid) this.send({ type: 'resolve', option: cid });
        else { const err = this.send({ type: 'sendOnErrand', errand: eid, colonist: cid }); if (err) this.toast(err); }
        this.picking = null; this.lastModal = ''; break; }
      case 'errand-later': this.send({ type: 'resolve', option: 0 }); this.lastModal = ''; break;
      case 'festival-open': this.festivalOpen = true; this.lastModal = ''; break;
      case 'strain-open': this.strainOpen = true; this.lastModal = ''; break;
      case 'strain-close': this.strainOpen = false; this.lastModal = ''; break;
      case 'strain-festival': this.strainOpen = false; this.festivalOpen = true; this.lastModal = ''; break;
      case 'festival-close': this.festivalOpen = false; this.lastModal = ''; break;
      case 'festival-call': { const err = this.send({ type: 'callFestival' }); this.toast(err ?? 'Festival called. Everyone gathers at the hearth at dusk.'); this.festivalOpen = false; this.lastModal = ''; break; }
    }
    this.render(true);
  }

  render(force = false) {
    const w = this.getWorld();
    this.renderHud(w, force);
    this.renderSheet(w, force);
    this.renderModal(w, force);
    this.renderPlaceBar(w);
    (this.root.querySelector('#sheet') as HTMLElement).hidden = !!this.view.placing || this.view.pathMode;
  }

  // ---------- HUD ----------
  private renderHud(w: World, force: boolean) {
    const h = hourOfDay(w);
    const hh = String(Math.floor(h)).padStart(2, '0');
    const prog = charterProgress(w);
    const sc = START;
    const pips = Array.from({ length: sc.collapse.lost }, (_, i) => `<i class="pip${i < lost(w) ? ' on' : ''}"></i>`).join('');
    const r = w.research, cur = r?.current ? RESEARCH_BY_ID[r.current] : undefined;
    const studying = cur ? (Object.keys(researchStillNeeds(w)).length ? 'waiting on goods' : desks(w).some(b => workersAt(w, b.uid).length) ? `${Math.floor((r!.progress / cur.hours) * 100)}%` : 'nobody at the desk') : '';
    const researchChip = !r ? '' : cur ? `<button type="button" class="chip research" data-act="desk"><span><b>Studying</b> ${esc(cur.name)} · ${esc(studying)}</span>${meter((r!.progress / cur.hours) * 100,'Research progress')}</button>`
      : researchLeft(w).length ? '' : '';
    const ch = charterDef(w.charter);
    const feastBtn = ch?.metric.kind === 'longTable' && !w.feast?.done ? (() => {
      const f = feastCheck(w); const wait = Math.max(0, Math.ceil((w.feast?.readyAt ?? 0) - w.hour));
      return w.feast?.called ? '<span class="chip feast on">Feast called for dusk</span>' : wait ? `<span class="chip feast">Next feast in ${wait}h</span>`
        : `<button type="button" class="chip feast${f.ok ? ' ready' : ''}" data-act="feast">${f.ok ? 'Call the feast' : 'Call the feast anyway'}</button>`;
    })() : '';
    const strain = Math.round(w.strain);
    const sea = seasonOf(w);
    const cap = storageCap(w), st = stored(w);
    const spoiling = spoilingFood(w) >= 5;
    const storeChip = `<button type="button" data-act="workplaces" data-arg="stockpile,storehouse" class="chip store${st >= cap ? ' full' : ''}" title="Goods in storage, of what it can hold">${icon('stockpile')}<b>${Math.floor(st)}/${cap}</b><span class="nm"> stored</span></button>`
      + (spoiling ? '<button type="button" data-act="storage-help" class="chip spoil" title="Food left on stockpiles is spoiling. A storehouse keeps it fresh."><span class="nm">food </span>spoiling →</button>' : '');
    // on a phone the names drop and the icons carry them; they stay for screen readers and on hover
    const goldChip = `<button type="button" data-act="resource" data-arg="gold" class="chip gold" title="Gold: rent each season, the Crown's stipend, events and selling to the caravan" aria-label="${Math.floor(w.gold)} gold">${icon('gold')}<b>${Math.floor(w.gold)}</b><span class="nm"> gold</span></button>`;
    const res = goldChip + storeChip + RESOURCES.filter(r => w.res[r.id] >= 0.5 || ['wood', 'berries', 'stew'].includes(r.id))
      .map(r => `<button type="button" data-act="resource" data-arg="${r.id}" class="chip" title="${r.name}" aria-label="${Math.floor(w.res[r.id])} ${r.name}">${icon(r.id)}<b>${Math.floor(w.res[r.id])}</b><span class="nm"> ${r.name}</span></button>`).join('');
    const html = `
      <div class="bar">
        <div class="clock"><span class="day">Day ${day(w)}</span><span class="when"><span class="time">${hh}:00<span class="phase"> · ${timeOfDay(h)}</span></span><button type="button" data-act="help" data-arg="season" class="season s-${sea.season}" title="${SEASON_NAMES[sea.season]}, day ${sea.dayOf} of ${START.seasons.days}${sea.season !== 'winter' ? `; winter in ${sea.toWinter} days` : ''}">${sea.season === 'autumn' ? `Winter in ${sea.toWinter}d` : `${SEASON_NAMES[sea.season]} ${sea.dayOf}/${START.seasons.days}`}</button></span></div>
        <div class="speeds" role="group" aria-label="Game speed">
          ${[['0', 'Pause'], ['1', '1×'], ['2', '2×'], ['3', '3×']].map(([s, l]) => `<button type="button" data-act="speed" data-arg="${s}" class="${this.speed === Number(s) ? 'on' : ''}" aria-pressed="${this.speed === Number(s)}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="res">${res}</div>
      <div class="status">
        <div class="charter">
          ${prog ? `<div class="ch-top"><span class="ch-name">${esc(prog.charter.name)}</span><span class="ch-tier">Charter ${w.chartersDone.length + 1} of 3</span></div>
          <div class="meter"><i style="width:${(prog.ratio * 100).toFixed(1)}%"></i></div>
          <div class="requirements">${charterRequirements(w).map(r => { const m = r.metric; const act = m.kind === 'stock' || m.kind === 'variety' ? 'resource' : m.kind === 'built' || m.kind === 'monument' ? 'catalog-help' : m.kind === 'everyoneBed' || m.kind === 'healthy' || m.kind === 'allTable' || m.kind === 'longTable' ? 'need' : 'tab'; const arg = m.kind === 'stock' ? m.resources[0] : m.kind === 'variety' ? m.category : m.kind === 'built' || m.kind === 'monument' ? m.def : m.kind === 'everyoneBed' ? 'shelter' : m.kind === 'healthy' ? 'health' : m.kind === 'allTable' || m.kind === 'longTable' ? 'table' : 'colonists'; return `<button type="button" class="requirement" data-act="${act}" data-arg="${arg}"><span>${r.ratio >= 1 ? '✓' : '○'} ${esc(r.label)}</span><span class="mini"><i style="width:${r.ratio * 100}%"></i></span><span>→</span></button>`; }).join('')}</div>${feastBtn}` : `<div class="ch-top"><span class="ch-name">${w.status === 'won' ? 'Town charter granted' : w.research && !w.charterOffered ? 'The Crown is watching' : 'Awaiting a charter'}</span></div>${w.research && !w.charterOffered ? `<div class="ch-label">The first charter arrives on the morning of day ${sc.firstCharterDay}.</div>` : ''}`}
          ${researchChip}${concernCards(w)}
        </div>
        <div class="threats">
          <button type="button" class="strain" data-act="strain-open" title="Frontier strain: a mood penalty that rises every day, faster when people's needs go unmet. Tap for why."><span>Strain</span><b>${strain ? '−' : ''}${strain}</b><small class="rate">+${strainPerDay(w).toFixed(1)}/day</small></button>${this.festivalChip(w)}
          <button type="button" data-act="help" data-arg="loss" class="leavers" title="If ${sc.collapse.lost} settlers leave or die${sc.collapse.minAlive ? `, or only ${sc.collapse.minAlive} remain` : ''}, the colony collapses"><span>Lost</span><div class="pips">${pips}</div></button>
        </div>
      </div>
      ${w.errands.length || this.caravanChip(w) || this.effectChips(w) ? `<div class="errands">${this.caravanChip(w)}${w.errands.map(e => this.errandChip(w, e)).join('')}${this.effectChips(w)}</div>` : ''}`;
    if (force || html !== this.lastHud) {
      const hud = this.root.querySelector<HTMLElement>('#hud')!;
      const scroll = hud.querySelector('.res')?.scrollLeft ?? 0;
      replaceMarkup(hud, html); this.lastHud = html;
      hud.querySelector('.res')!.scrollLeft = scroll;
      // fade the row's right edge while there are more goods to scroll to
      const row = this.root.querySelector('#hud .res') as HTMLElement | null;
      if (row) { const more = () => row.classList.toggle('more', row.scrollLeft + row.clientWidth < row.scrollWidth - 2); more(); row.addEventListener('scroll', more, { passive: true }); }
    }
  }

  private helpCard(w: World) {
    const sea = seasonOf(w);
    let title = 'Colony help', body = '';
    if (this.help === 'season') {
      title = `${SEASON_NAMES[sea.season]} · day ${sea.dayOf}/${START.seasons.days}`;
      body = `<p class="lede">${sea.season === 'winter' ? `Heating needs about ${Math.round(winterFuelPerDay(w))} wood/day.` : `Winter in ${sea.toWinter} days · heating will need about ${Math.round(winterFuelPerDay(w,true))} wood/day.`}</p><div class="actions"><button type="button" class="ghost" data-act="need" data-arg="warmth">Warm homes →</button><button type="button" class="ghost" data-act="need" data-arg="fresh">Fresh food →</button><button type="button" class="ghost" data-act="need" data-arg="drink">Drinks →</button></div><p class="terms">Spring: fresh food. Summer: drinks. Autumn: harvest festival. Winter: warm homes. Expectations grow with town standing.</p>`;
    } else if (this.help === 'loss') {
      title = `${lost(w)}/${START.collapse.lost} settlers lost`;
      body = `<p class="lede">The colony collapses at ${START.collapse.lost} lost settlers or ${START.collapse.minAlive} survivors.</p><ul class="thoughts">${w.colonists.filter(c => c.left).map(c=>`<li><span>${esc(c.name)}</span><b>${c.died ? 'Died' : 'Left'}</b></li>`).join('') || '<li>No settlers lost.</li>'}</ul>`;
    } else {
      title = 'Recipes'; body = '<p class="lede">Workers choose the best enabled recipe with available ingredients. ★★★ is fastest. Switch a recipe off to reserve its ingredients.</p>';
    }
    return `<div class="card-wrap"><p class="eyebrow">Game paused</p><h2>${title}</h2>${body}<button type="button" class="ghost skip" data-act="help-close">Close</button></div>`;
  }

  private strainCard(w: World) {
    const comfort = colonyComfort(w);
    const gaps = comfortGaps(w);
    const st = standingOf(w), sea = seasonOf(w);
    const next = st + 1 < STANDINGS.length ? activeNeeds(w, st + 1).filter(k => !activeNeeds(w).includes(k)) : [];
    const nextLine = st + 1 < STANDINGS.length ? `<p class="terms">At the next charter the town becomes a <b>${STANDINGS[st + 1].toLowerCase()}</b>, and people expect more${next.length ? `: ${next.map(k => NEED_NAMES[k].toLowerCase()).join(', ')} start to count` : ''}${st + 1 >= 2 ? ', a shack counts half, and meals want a table' : ', and cooked meals replace any old food'}.</p>` : `<p class="terms">A village expects the most it ever will${START.seasons.stricterFromYear > 0 ? ', though from the second year everyone gets a little pickier' : ''}.</p>`;
    const seasonLine = sea.season === 'winter' ? `Winter: everyone needs a warm home. Homes and the hearth burn about ${Math.round(winterFuelPerDay(w))} wood a day.`
      : sea.season === 'autumn' ? `Autumn: winter in ${sea.toWinter} day${sea.toWinter === 1 ? '' : 's'}. Homes and the hearth will burn about ${Math.round(winterFuelPerDay(w, true))} wood a day, and people expect a harvest festival first.`
      : sea.season === 'spring' && st >= 1 ? 'Spring: people want something fresh now and then: berries, apples, fish or skewers.'
      : sea.season === 'summer' && st >= 1 ? 'Summer: people want a drink each day in the heat.' : '';
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const factor = Math.max(0.2, START.comfortScale.base - comfort * START.comfortScale.slope);
    const rows = gaps.map(g => `<button type="button" data-act="need" data-arg="${g.need}" class="lg-row ${g.avg >= 0.7 ? 'lg-good' : 'lg-bad'}"><span>${NEED_NAMES[g.need]}</span><i><b style="width:${Math.round(g.avg * 100)}%"></b></i><em>${pct(g.avg)} →</em></button>`).join('');
    const worst = gaps.filter(g => g.avg < 0.7).slice(0, 2).map(g => NEED_FIX[g.need]);
    return `<div class="card-wrap event"><p class="eyebrow">Frontier strain</p><h2>Strain ${Math.round(w.strain)}, rising ${strainPerDay(w).toFixed(1)} a day</h2>
      <p class="lede">Comfort ${pct(comfort)} · improve the weakest needs to slow strain.</p>
      <details data-key="strain-math"><summary>How strain works</summary><p class="prefs">Comfort <b>${pct(comfort)}</b>, so strain rises at <b>${factor.toFixed(2)}×</b>. A fully comfortable colony would rise at ${Math.max(0.2, START.comfortScale.base - START.comfortScale.slope).toFixed(1)}×.</p>
      </details><p class="terms">${STANDINGS[st]} needs</p>
      <div class="ledger">${rows}</div>
      <details data-key="strain-future"><summary>Season & next charter</summary>${seasonLine ? `<p class="terms">${esc(seasonLine)}</p>` : ''}${nextLine}</details>
      
      <p class="terms">It eases when a charter is finished (by ${pct(START.relief.charter)}) or when you hold a festival.</p>
      <div class="opts">${!w.festival?.called && !festivalPreview(w).wait ? `<button type="button" class="opt" data-act="strain-festival"><b>Plan a festival</b><span>${festivalPreview(w).relief >= 0.5 ? `Eases strain by about ${Math.round(festivalPreview(w).relief)}` : 'Strain is low, so it would ease very little'}</span></button>` : ''}</div>
      <button type="button" class="ghost skip" data-act="strain-close">Close</button></div>`;
  }

  private festivalChip(w: World) {
    const f = w.festival;
    if (f?.called) return '<small class="fest on">festival at dusk</small>';
    const wait = Math.max(0, Math.ceil((f?.readyAt ?? 0) - w.hour));
    if (wait) return `<small class="fest">festival in ${wait < 24 ? `${wait}h` : `${Math.ceil(wait / 24)}d`}</small>`;
    return `<button type="button" class="fest" data-act="festival-open">Festival</button>`;
  }

  private festivalCard(w: World) {
    const p = festivalPreview(w);
    const r = START.relief.festival;
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const can = !w.festival?.called && !p.wait && mealTotal(w) >= 1;
    const short = p.fed < p.guests ? ` ${p.guests - p.fed} would go without, which eases less.` : '';
    return `<div class="card-wrap event"><p class="eyebrow">At the hearth, at dusk</p><h2>Call a festival?</h2>
      <p class="lede">At dusk · ${p.guests} guests · strain −${Math.round(p.relief)}</p>${short ? `<p class="warnline">⚠ ${p.guests - p.fed} guests without a meal</p>` : ''}
      <ul class="thoughts">
        <li><span>Settlers coming</span><b>${p.guests}</b></li>
        <li><span>${icon('meal')}Meals · ${Math.floor(mealTotal(w))} stored</span><b>${p.fed}</b></li>
        <li><span>${icon('drink')}Drinks · ${Math.floor(drinkTotal(w))} stored</span><b>${p.drank}</b></li>
        <li><span>Getting a favourite</span><b>${p.loved}</b></li>
        <li><span>Strain eased</span><b>${Math.round(p.relief)} (${pct(p.share)})</b></li>
      </ul>
      <details data-key="festival-math"><summary>How relief works</summary><p class="terms">${pct(r.base)} if everyone eats, ${pct(r.drinks)} more if most have a drink, ${pct(r.loved)} more if most get a favourite. Then ${r.waitDays} days before the next one. Everyone except bedridden settlers attends; favourites are chosen first.</p></details>
      <div class="opts"><button type="button" class="opt" data-act="festival-call" ${can ? '' : 'disabled'}><b>Call festival</b><span>${can ? (p.relief >= 0.5 ? `Eases strain by about ${Math.round(p.relief)}` : 'Strain is low, so it would ease very little') : mealTotal(w) < 1 ? 'There are no meals to share' : 'Not ready yet'}</span></button></div>
      <button type="button" class="ghost skip" data-act="festival-close">Not now</button></div>`;
  }

  /** passing troubles from events (a drought, a blight, a frozen well), with how long they have left */
  private effectChips(w: World) {
    return (w.effects ?? []).filter(e => w.hour < e.until).map(e => `<button type="button" class="errand effect" data-act="workplaces" data-arg="${e.defs.join(',')}"><b>⚠ ${esc(e.label)}</b><small>−${Math.round((1 - e.mult) * 100)}% output · ${Math.ceil((e.until - w.hour) / 24)}d →</small></button>`).join('');
  }

  /** the caravan at the hearth once nobody is on the way: a way to send someone (back) over */
  private caravanChip(w: World) {
    const t = w.caravan;
    if (!t || w.errands.some(e => e.def === 'caravan') || w.decisions.some(d => d.kind === 'trade')) return '';
    const left = Math.max(0, Math.ceil(t.leaves - w.hour));
    const nm = TRADER_BY_ID[t.trader].name;
    return `<button type="button" class="errand caravan" data-act="caravan-visit"><b>${icon('caravan')}${esc(nm.charAt(0).toUpperCase() + nm.slice(1))}</b><small>${t.visited ? 'Trade again' : 'Send someone to trade'} · leaves in ${left}h</small></button>`;
  }

  private errandChip(w: World, e: Errand) {
    const c = colonistById(w, e.assignee);
    const left = Math.max(0, Math.ceil(e.deadline - w.hour));
    return `<button type="button" class="errand${c ? '' : ' unassigned'}" data-act="errand-open" data-arg="${e.id}"><b>${esc(e.title)}</b><small>${c ? `${esc(first(c))} · ${Math.round((e.done / e.hours) * 100)}%` : 'Nobody assigned'} · ${left}h left</small>${c ? meter(e.done / e.hours * 100,'Errand progress') : '<span class="warn">⚠ Assign</span>'}</button>`;
  }

  private errandPicker(w: World, e: Errand, fromDecision: boolean) {
    const ok = alive(w).filter(c => !bedridden(c));
    const rank = (c: Colonist) => (e.skill ? c.skills[e.skill] * 2 : 0) + (c.job == null ? 3 : 0) + (e.def === 'feud' && c.traits.includes('sunny') ? 8 : 0) - (e.pair?.includes(c.id) ? 20 : 0);
    const rows = ok.sort((a, b) => rank(b) - rank(a)).map(c => {
      const job = buildingByUid(w, c.job);
      const note = [e.skill ? `${SKILL_NAMES[e.skill]} ${Math.floor(c.skills[e.skill])}` : '', job ? `leaves the ${BUILDING_BY_ID[job.def].name.toLowerCase()}` : 'laborer', e.def === 'feud' && c.traits.includes('sunny') ? 'sunny, twice as persuasive' : '', e.pair?.includes(c.id) ? 'part of the feud' : ''].filter(Boolean).join(' · ');
      return `<button type="button" class="row${c.id === e.assignee ? ' chosen' : ''}" data-act="errand-send" data-arg="${e.id}:${c.id}"><span class="dot" style="background:${hex(c.shirt)}"></span><span class="who"><b>${esc(c.name)}</b><small>${esc(note)}</small></span><span class="add">${c.id === e.assignee ? 'Sent' : 'Send'}</span></button>`;
    }).join('');
    const def = { hours: e.hours, left: Math.max(0, Math.ceil(e.deadline - w.hour)) };
    return `<div class="card-wrap event"><p class="eyebrow">Someone needs to go</p><h2>${esc(e.title)}</h2><p class="lede">${esc(e.text)}</p>
      <p class="terms">About ${def.hours} hours of work${e.skill ? `, faster with ${SKILL_NAMES[e.skill].toLowerCase()} skill` : ''}. ${def.left} hours before it goes wrong.</p>
      <div class="rows picker">${rows}</div>
      ${fromDecision ? `<button type="button" class="ghost skip" data-act="errand-later">Decide later</button>` : `<button type="button" class="ghost skip" data-act="errand-close">Close</button>`}</div>`;
  }

  // ---------- Bottom sheet ----------
  private renderSheet(w: World, force: boolean) {
    const pop = alive(w);
    const tabs = `<nav class="tabs">
      ${(['colonists', 'build', 'ledger', 'issues', 'log'] as Tab[]).map(t => `<button type="button" data-act="tab" data-arg="${t}" class="${this.tab === t && this.open ? 'on' : ''}">${t === 'colonists' ? `Colonists <em>${pop.length}</em>` : t === 'build' ? 'Build' : t === 'ledger' ? 'Ledger' : t === 'issues' ? `Issues <em>${assess(w).length}</em>` : 'Log'}</button>`).join('')}
      ${this.open ? `<button type="button" class="x" data-act="close" aria-label="Close panel">×</button>` : ''}
    </nav>`;
    let body = '';
    if (this.open) {
      if (this.detail?.kind === 'colonist') body = this.colonistDetail(w, this.detail.id);
      else if (this.detail?.kind === 'building') body = this.buildingDetail(w, this.detail.id);
      else if (this.tab === 'colonists') body = this.colonistList(w);
      else if (this.tab === 'build') body = this.destination ? this.destinationList(w) : this.buildList(w);
      else if (this.tab === 'ledger') body = ledger(w, this.resource);
      else if (this.tab === 'issues') body = this.issueList(w);
      else body = this.logList(w);
    }
    const html = tabs + (this.open ? `<div class="sheet-body">${body}</div>` : '');
    const el = this.root.querySelector('#sheet') as HTMLElement;
    if (force || html !== this.lastSheet) {
      const scroller = el.querySelector('.sheet-body');
      if (this.sheetKey) this.sheetScroll.set(this.sheetKey, scroller?.scrollTop ?? 0);
      const key = this.detail ? `${this.detail.kind}:${this.detail.id}` : `${this.tab}:${JSON.stringify(this.destination)}:${this.peopleFilter?.join(',') ?? ''}:${this.colonistFilter}:${this.colonistSort}:${this.buildMode}:${this.buildingFilter}:${this.catalogGroup}`;
      replaceMarkup(el, html); this.lastSheet = html; this.sheetKey = key;
      const s2 = el.querySelector('.sheet-body'); if (s2) s2.scrollTop = this.sheetScroll.get(key) ?? 0;
    }
    el.classList.toggle('open', this.open);
    if (this.anchor) { const target = el.querySelector<HTMLElement>(`#${this.anchor}`); target?.closest('details')?.setAttribute('open', ''); if (target) { const scroller = el.querySelector('.sheet-body')!; scroller.scrollTop = target.offsetTop - (scroller as HTMLElement).offsetTop; } this.anchor = null; }
  }

  private colonistList(w: World) {
    const rows = alive(w).filter(c => (!this.peopleFilter || this.peopleFilter.includes(c.id)) && matchesPerson(c, this.colonistFilter)).sort((a, b) => this.colonistSort === 'name' ? a.name.localeCompare(b.name) : a.mood - b.mood || a.id - b.id).map(c => {
      const partner = colonistById(w, c.partner);
      return `<button type="button" class="row" data-act="colonist" data-arg="${c.id}">
        <span class="dot" style="background:${hex(c.shirt)}"></span>
        <span class="who"><b>${esc(c.name)}</b><small>${esc(personState(c) || activityText(w, c))}${partner ? ` · with ${esc(first(partner))}` : ''}</small></span>
        <span class="mood ${moodClass(c.mood, c.sulking)}"><b>${moodDirection(c)} ${Math.round(c.mood)}</b><i style="width:${c.mood}%"></i></span>
      </button>`;
    }).join('');
    return `<div class="list-head"><span>${alive(w).length} colonists · ${beds(w)} beds · average mood ${Math.round(avgMood(w))}</span>
      <button type="button" class="ghost" data-act="auto">Auto-assign jobs</button></div>
      <p class="muted hint">⚒ ${laborers(w).length} laborers · builds, hauls, cleans</p><div class="filters">${selectHtml('colonist-filter', 'Show colonists', this.colonistFilter, [['all','Everyone'],['ill','Ill'],['hungry','Hungry'],['unhoused','No bed'],['sulking','Sulking'],['free','No job']])}${selectHtml('colonist-sort', 'Sort colonists', this.colonistSort, [['mood','Lowest mood'],['name','Name']])}</div>${concernCards(w)}${this.peopleFilter ? '<button type="button" class="ghost" data-act="tab" data-arg="colonists">Show everyone</button>' : ''}<div class="rows">${rows || '<p class="empty">No matching colonists.</p>'}</div>
      <details data-key="food-rules"><summary id="food-rules">Food rules · ${w.forbidden.length} reserved</summary><p class="muted hint">Reserved food stays available for charters and feasts.</p>
      <div class="foodrules">${FOODS.map(f => {
        const on = !w.forbidden.includes(f);
        return `<button type="button" class="rule${on ? ' on' : ''}" data-act="food" data-arg="${f}" aria-label="${on ? 'Reserve' : 'Allow eating'} ${RESOURCES.find(r=>r.id === f)!.name}" aria-pressed="${on}">${icon(f)}${RESOURCES.find(r => r.id === f)!.name}<small>${on ? '✓ Eat' : '◇ Reserved'} · ${Math.floor(w.res[f])}</small></button>`;
      }).join('')}</div></details>`;
  }

  private colonistDetail(w: World, id: number) {
    const c = colonistById(w, id);
    if (!c || c.left) return `<p class="empty">This colonist has left.</p><button type="button" class="ghost" data-act="back">Back to colonists</button>`;
    const traits = c.traits.map(t => `<div class="trait"><b>${TRAIT_BY_ID[t].name}</b><span>${esc(TRAIT_BY_ID[t].desc)}</span></div>`).join('');
    const thoughts = c.thoughts.map(t => `<li class="${t.value >= 0 ? 'pos' : 'neg'}${t.label.startsWith('The frontier') ? ' wear' : ''}"><span>${esc(t.label)}</span><b>${t.value > 0 ? '+' : '−'}${Math.abs(Math.round(t.value))}</b></li>`).join('');
    const others = alive(w).filter(o => o.id !== c.id).map(o => ({ o, v: opinion(w, c.id, o.id) }));
    const friends = others.filter(x => x.v > 25).sort((a, b) => b.v - a.v).slice(0, 3);
    const rivals = others.filter(x => x.v < -25).sort((a, b) => a.v - b.v).slice(0, 3);
    const partner = colonistById(w, c.partner);
    const rel = [
      partner ? `<button type="button" class="rel love" data-act="colonist" data-arg="${partner.id}">♥ ${esc(first(partner))} →</button>` : '',
      ...friends.map(x => `<button type="button" class="rel friend" data-act="colonist" data-arg="${x.o.id}">♥ ${esc(first(x.o))} →</button>`),
      ...rivals.map(x => `<button type="button" class="rel rival" data-act="colonist" data-arg="${x.o.id}">× ${esc(first(x.o))} →</button>`),
    ].join('') || '<span class="muted">No strong feelings about anyone yet.</span>';
    const job = buildingByUid(w, c.job);
    const jobs = built(w).filter(b => BUILDING_BY_ID[b.def].slots > 0).map(b => {
      const def = BUILDING_BY_ID[b.def];
      const n = workersAt(w, b.uid).length, full = n >= def.slots && c.job !== b.uid;
      const fit = def.job === c.likes ? ' likes' : def.job === c.dislikes ? ' dislikes' : '';
      return `<button type="button" class="job${c.job === b.uid ? ' on' : ''}${fit}" data-act="assign" data-arg="${c.id}:${b.uid}" ${full ? 'disabled' : ''}><span class="jn">${icon(def.id)}${esc(def.name)}</span><small>${def.job ? `${SKILL_NAMES[def.job]} ${Math.floor(c.skills[def.job])} · ` : ''}${n}/${def.slots}${fit === ' likes' ? ' · loves this' : fit === ' dislikes' ? ' · hates this' : ''}</small></button>`;
    }).join('');
    const illness = c.illness ? `<section class="urgent"><b>✚ ${esc(c.illness.name)} · ${Math.round(c.illness.severity)}/100</b>${meter(c.illness.severity, 'Illness severity')}<div class="actions"><button type="button" class="ghost" data-act="need" data-arg="health">${esc(buildingDestination(w, 'clinic', true).label)} →</button></div><small>At 100, leaves for treatment.</small></section>` : '';
    const worst = [...c.thoughts].filter(t => t.value < 0 && !t.label.startsWith('The frontier')).sort((a,b) => a.value - b.value)[0];
    return `<div class="detail">
      <div class="d-head"><button type="button" class="ghost back" data-act="back">← Colonists</button></div>
      <div class="who-big"><span class="dot big" style="background:${hex(c.shirt)}"></span><div><h2>${esc(c.name)}</h2><p>${esc(activityText(w, c))}</p></div>
        <div class="mood-big ${moodClass(c.mood, c.sulking)}"><b>${moodDirection(c)} ${Math.round(c.mood)}</b><small>→ ${Math.round(c.moodTarget)}</small></div></div>
      ${c.sulking ? '<p class="warnline">☁ Sulking · works again above mood 32</p>' : c.mood < 15 ? '<p class="warnline">⚠ May leave</p>' : ''}${illness}
      ${worst ? `<p class="warnline">${esc(worst.label)} <b>−${Math.abs(Math.round(worst.value))}</b></p>` : ''}
      <div class="actions">${job ? `<button type="button" class="ghost" data-act="building" data-arg="${job.uid}">${icon(job.def)} ${esc(BUILDING_BY_ID[job.def].name)} →</button>` : ''}${c.bed != null ? `<button type="button" class="ghost" data-act="building" data-arg="${c.bed}">⌂ Home →</button>` : '<button type="button" class="ghost" data-act="need" data-arg="shelter">⌂ Find a bed →</button>'}<button type="button" class="ghost" data-act="jobs">⚒ Change job ↓</button></div>
      <h3>Needs · ${Math.round(comfortOf(w, c) * 100)}%</h3>${comfortRows(w, c)}
      <details data-key="person-jobs"><summary id="person-jobs">⚒ Job · ${job ? esc(BUILDING_BY_ID[job.def].name) : 'Laborer'}</summary><p class="muted">${laborers(w).length} laborers free · assigning one slows hauling and building.</p><div class="jobs">${jobs}<button type="button" class="job${c.job == null ? ' on' : ''}" data-act="assign" data-arg="${c.id}:none">Laborer<small>Build · haul · clean</small></button></div></details>
      <details data-key="thoughts"><summary>Mood breakdown</summary>${moodLedger(c)}<ul class="thoughts">${thoughts}</ul></details>
      <details data-key="skills"><summary>Skills & preferences</summary><p class="prefs">♥ ${JOB_NAMES[c.likes]} · × ${JOB_NAMES[c.dislikes]}${tasteLine(c)} · hunger ${Math.round(c.hunger)} · fun ${Math.round(c.fun)}</p><div class="skills">${skillKinds(c).map(k => `<div class="skill${k === c.likes ? ' fav' : ''}"><span>${SKILL_NAMES[k]}</span><i><b style="width:${c.skills[k] * 10}%"></b></i><em>${Math.floor(c.skills[k])}</em></div>`).join('')}</div></details>
      <details data-key="traits"><summary>Traits · joined day ${c.joinedDay}</summary><div class="traits">${traits}</div></details>
      <details data-key="relationships"><summary>Relationships</summary><div class="rels">${rel}</div></details>
    </div>`;
  }

  private buildList(w: World) {
    const mode = `<div class="segs two">${['manage','catalog'].map(m => `<button type="button" class="seg${this.buildMode === m ? ' on' : ''}" data-act="build-mode" data-arg="${m}" aria-pressed="${this.buildMode === m}">${m === 'manage' ? 'In colony' : 'Build new'}</button>`).join('')}</div>`;
    if (this.buildMode === 'manage') {
      const buildings = w.buildings.filter(b => {
        const d = BUILDING_BY_ID[b.def];
        if (this.buildingFilter === 'sites') return !b.built;
        if (!b.built) return this.buildingFilter === 'all';
        if (this.buildingFilter === 'unstaffed') return d.slots > workersAt(w,b.uid).length;
        if (this.buildingFilter === 'blocked') return !!blockedReason(w,b);
        if (this.buildingFilter === 'inefficient') return !!d.needs && b.eff < 0.6;
        return true;
      }).sort((a,b) => Number(buildingStatus(w,b).warning) - Number(buildingStatus(w,a).warning));
      return mode + `<div class="filters">${selectHtml('building-filter','Show buildings',this.buildingFilter,[['all','All buildings'],['unstaffed','Open jobs'],['blocked','Blocked'],['inefficient','Low efficiency'],['sites','Construction']])}</div><div class="rows">${buildings.map(b => {
        if (!b.built) return this.siteRow(w,b);
        const status = buildingStatus(w,b);
        return `<button type="button" class="row compact" data-act="building" data-arg="${b.uid}"><span class="who"><b>${icon(b.def)} ${esc(BUILDING_BY_ID[b.def].name)}</b><small>${b.x}, ${b.y} · ${status.warning ? '⚠ ' : '✓ '}${esc(status.label)}</small></span><span>→</span></button>`;
      }).join('') || '<p class="empty">No matching buildings.</p>'}</div>`;
    }
    const matches = (d: typeof BUILDING_BY_ID[string]) => this.catalogGroup === 'all' || buildingGroup(d.id) === this.catalogGroup;
    const card = (def: typeof BUILDING_BY_ID[string]) => `<div class="bp has-ico"><span class="bp-ico">${icon(def.id,'bico')}</span><div><b>${esc(def.name)}</b><small class="cost">${costHtml(def.cost,w)} · ${def.w}×${def.h}</small><details data-key="catalog-${def.id}"><summary>Details</summary><p>${esc(def.blurb)}</p></details></div><button type="button" class="act" data-act="build" data-arg="${def.id}">Place</button></div>`;
    const missing = BUILDINGS.filter(d => !w.owned.includes(d.id) && matches(d)).map(d => {
      const r = researchLeft(w).find(r => r.unlocks.includes(d.id));
      return `<button type="button" class="row compact" data-act="catalog-help" data-arg="${d.id}"><span class="who"><b>${icon(d.id)} ${esc(d.name)}</b><small>${r ? `Research ${esc(r.name)}` : 'Blueprint needed'}</small></span><span>→</span></button>`;
    }).join('');
    return mode + `<div class="filters">${selectHtml('catalog-group','Building purpose',this.catalogGroup,[['all','All purposes'],['food','Food & drinks'],['work','Production'],['comfort','Homes & comfort'],['storage','Storage']])}</div><div class="bps">${w.owned.map(id => BUILDING_BY_ID[id]).filter(matches).map(card).join('')}</div><h3>Paths</h3><div class="bp"><div><b>Paths</b><small>+25% walking · 1 wood/tile</small></div><button type="button" class="act" data-act="paths">Plan</button></div><details data-key="missing-buildings"><summary>Unlocks & missing blueprints</summary><div class="rows">${missing}</div></details>`;
  }

  private siteRow(w: World, b: Building) {
    const def = BUILDING_BY_ID[b.def];
    const left = remainingCost(b);
    const need = Object.keys(left).length;
    const pct = Math.round((b.progress / siteWork(b)) * 100);
    const stage = def.stages ? `Stage ${(b.stage ?? 0) + 1} of ${def.stages.length}: ${def.stages[b.stage ?? 0].label.toLowerCase()} · ` : '';
    const status = stage + (need ? `Waiting on ${Object.entries(left).map(([r, n]) => `${Math.ceil(n ?? 0)} ${goodLabel(r as InputKey)}`).join(', ')}` : `Building · ${pct}%`);
    const ratio = need ? 1 - sum(left) / Math.max(1, sum(costOf(b))) : b.progress / siteWork(b);
    return `<button type="button" class="row compact site" data-act="building" data-arg="${b.uid}"><span class="who"><b>${icon(def.id)} ${esc(def.name)}</b><small>${esc(status)}</small></span><span class="mini ${need ? 'haul' : ''}"><i style="width:${Math.round(ratio * 100)}%"></i></span></button>`;
  }

  startPlacing(defId: string) {
    const w = this.getWorld();
    const c = this.view.viewCenter();
    const spot = findSpot(w, defId, c.x, c.y, false) ?? { x: Math.round(c.x), y: Math.round(c.y) };
    this.view.placing = { def: defId, x: spot.x, y: spot.y, rot: 0 };
    this.view.focus(spot.x + BUILDING_BY_ID[defId].w / 2, spot.y + BUILDING_BY_ID[defId].h / 2, 0.55);
    this.open = false; this.detail = null; this.view.selected = null;
    this.render(true);
  }

  /** turn the blueprint being placed a quarter-turn, keeping it centred where it was */
  rotatePlacing() {
    const pl = this.view.placing; if (!pl) return;
    const a = footprint(pl.def, pl.rot ?? 0), rot = ((pl.rot ?? 0) + 1) % 4, b = footprint(pl.def, rot);
    this.view.placing = { ...pl, rot, x: Math.round(pl.x + a.w / 2 - b.w / 2), y: Math.round(pl.y + a.h / 2 - b.h / 2) };
    this.render(true);
  }

  private renderPlaceBar(w: World) {
    const el = this.root.querySelector('#placebar') as HTMLElement;
    if (this.view.pathMode) {
      const planned = w.paths.filter(p => p === 1).length;
      const html = `<div class="pb-text"><b>Planning paths</b><small>Tap to add/remove · 1 wood/tile. ${planned} planned${planned > w.res.wood ? `, but only ${Math.floor(w.res.wood)} wood` : ''}.</small></div>
        <button type="button" class="act" data-act="paths-done">Done</button>`;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.add('two'); el.hidden = false; return;
    }
    el.classList.remove('two');
    const pl = this.view.placing;
    if (!pl) { el.hidden = true; el.innerHTML = ''; return; }
    const def = BUILDING_BY_ID[pl.def];
    const chk = canPlace(w, pl.def, pl.x, pl.y, pl.rot ?? 0);
    const eff = def.needs ? efficiencyAt(w, pl.def, pl.x, pl.y, pl.rot ?? 0) : null;
    const effText = eff && chk.ok ? `${eff.label} · works at ${Math.round(eff.eff * 100)}%` : '';
    const html = `<div class="pb-text"><b>${icon(def.id)} ${esc(def.name)}</b><small class="cost">${costHtml(def.cost,w)}</small><small${eff && chk.ok && eff.eff < 0.6 ? ' class="low"' : ''}>${chk.ok ? (effText ? esc(effText) : def.decor ? 'Tap to move · improves nearby beauty' : 'Tap to move · arrow marks door') : esc(chk.reason)}</small>${eff ? meter(eff.eff * 100, 'Site efficiency') : ''}</div>
      <button type="button" class="ghost rotate" data-act="place-rotate" aria-label="Rotate" title="Rotate (R)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M18.6 3.6v4.6H14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Rotate</button>
      <button type="button" class="ghost" data-act="place-cancel">Cancel</button>
      <button type="button" class="act" data-act="place-confirm" ${chk.ok ? '' : 'disabled'}>Place here</button>`;
    if (el.innerHTML !== html) el.innerHTML = html;
    el.hidden = false;
  }

  private buildingDetail(w: World, uid: number) {
    const b = buildingByUid(w, uid); if (!b) return '';
    const def = BUILDING_BY_ID[b.def];
    if (!b.built) {
      const builders = alive(w).filter(c => c.task && 'site' in c.task && c.task.site === b.uid);
      const mats = Object.entries(costOf(b)).map(([r, n]) => {
        const ms = membersOf(r as InputKey), got = ms.reduce((m, x) => m + (b.delivered[x] ?? 0), 0);
        const mix = ms.length > 1 ? ms.filter(x => (b.delivered[x] ?? 0) >= 0.5).map(x => `${Math.floor(b.delivered[x] ?? 0)} ${goodName(x)}`).join(', ') : '';
        const label = inputName(r as InputKey);
        return `<li><button type="button" class="text-link" data-act="source" data-arg="${r}">${icon(r)}${label.charAt(0).toUpperCase() + label.slice(1)}${mix ? ` (${mix})` : ''} →</button><b>${Math.floor(got)} / ${n}</b></li>`;
      }).join('');
      return `<div class="detail"><div class="d-head"><button type="button" class="ghost back" data-act="back">All buildings</button></div>
        <h2 class="bh">${icon(def.id, 'hico')}${esc(def.name)}</h2><p class="blurb">${def.stages ? `${esc(def.blurb)}</p><p class="prefs">Stage <b>${(b.stage ?? 0) + 1} of ${def.stages.length}</b>: ${esc(def.stages[b.stage ?? 0].label)}. Then: ${esc(def.stages.slice((b.stage ?? 0) + 1).map(x => x.label.toLowerCase()).join(', ') || 'done')}.` : 'Under construction.'}</p>
        ${def.moodGate ? `<p class="${alive(w).filter(c => c.mood >= def.moodGate!).length ? 'prefs' : 'warnline'}">${alive(w).filter(c => c.mood >= def.moodGate!).length} of ${alive(w).length} colonists are at mood ${def.moodGate}+ and willing to work on it${laborers(w).filter(c => c.mood >= def.moodGate!).length ? `, ${laborers(w).filter(c => c.mood >= def.moodGate!).length} of them laborers` : ', but none of them are laborers'}.</p>` : ''}
        <h3>Materials delivered</h3><ul class="thoughts">${mats || '<li><span>No materials needed</span></li>'}</ul>
        <h3>Work</h3><p class="prefs">${Math.round(b.progress * 10) / 10} of ${siteWork(b)} builder-hours. ${builders.length ? `${builders.map(c => personLink(c)).join(', ')} on it now.` : laborers(w).length ? 'Laborers will get to it.' : 'Nobody is free. Take someone off a job to make them a laborer.'}</p>
        <button type="button" class="ghost" data-act="review-jobs">Review laborers →</button><button type="button" class="ghost danger" data-act="cancel-site" data-arg="${b.uid}">Cancel and return materials</button></div>`;
    }
    const workers = workersAt(w, b.uid);
    const recs = recipesOf(b), cur = currentRecipe(w, b);
    // whether a recipe's ingredients can come from anywhere: a building owned now, one that could be drafted, or nowhere on this map
    const reach = (r: Recipe) => reachText(w, r, false);
    const recipe = !recs.length ? '' : `<h3>Recipes <button type="button" class="ghost" data-act="help" data-arg="recipes" aria-label="Recipe help">?</button></h3><div class="recipes">${recs.map((r, i) => {
          const on = recipeOn(b, i), now = on && r === cur;
          return `<div class="recipe-wrap"><button type="button" class="recipe${on ? ' on' : ''}" data-act="recipe-toggle" data-arg="${b.uid}:${i}" aria-pressed="${on}">${starHtml(r.stars)}<span><span class="rline">${recipeHtml(r)}</span><small>${+recipeRate(r).toFixed(2)} per worker-hour${now ? ' · ▶ Current' : on ? ' · ✓ Enabled' : ' · × Off'}${reach(r) ? ` · ${reach(r)}` : ''}</small></span></button><div class="actions inputs">${Object.keys(r.inputs).map(k => `<button type="button" class="text-link" data-act="source" data-arg="${k}">${goodHtml(k as InputKey)} →</button>`).join('')}</div></div>`;
        }).join('')}</div>`;
    const effLine = def.needs ? `<p class="prefs">Site ${Math.round(b.eff * 100)}% · ${esc(efficiencyAt(w, b.def, b.x, b.y, b.rot).label)}</p>${meter(b.eff * 100, 'Site efficiency')}` : '';
    const inboxLine = recs.some(r => Object.keys(r.inputs).length) ? `<p class="prefs">Ingredients on hand: ${Object.entries(b.inbox).filter(([, n]) => (n ?? 0) >= 0.5).map(([r, n]) => goodHtml(r as ResourceId, Math.floor(n ?? 0))).join(', ') || '<b>none</b> · awaiting haulers'}</p>` : '';
    const blocked = blockedReason(w, b);
    const remedyLine = def.patients ? `<details data-key="clinic-remedies"><summary>Remedies · ${Math.floor(w.res.tonic + w.res.poultice)} stored</summary><p class="prefs">Remedies in storage: ${w.res.tonic >= 0.5 || w.res.poultice >= 0.5 ? `${Math.floor(w.res.tonic)} tonic, ${Math.floor(w.res.poultice)} poultice. The doctor uses one up every few hours of treatment: a poultice heals faster and halves botched treatments, a tonic heals faster still and never botches.` : '<b>none</b>. An apothecary makes poultices and tonics that help the doctor.'}</p><button type="button" class="text-link" data-act="source" data-arg="remedy">Remedy sources →</button></details>` : '';
    const patients = def.patients ? `<p class="prefs">Patients: ${patientsAt(w, b).map(c => `${personLink(c)} · ${esc(c.illness!.name.toLowerCase())} ${Math.round(c.illness!.severity)}`).join(', ') || 'none right now. The doctor helps out as a laborer until someone is ill.'}</p>` : '';
    let staff = (blocked ? `<p class="warnline">${esc(blocked)}</p>` : '') + effLine + inboxLine + patients + remedyLine + (b.def === 'desk' ? this.deskLines(w) : '');
    if (def.slots) {
      const cur = workers.map(c => `<div class="row static"><span class="dot" style="background:${hex(c.shirt)}"></span><span class="who">${personLink(c)}<small>${def.job ? `${SKILL_NAMES[def.job]} ${Math.floor(c.skills[def.job])} · ` : ''}${def.job === c.likes ? 'loves this job' : def.job === c.dislikes ? 'hates this job' : 'doesn’t mind it'}</small></span><button type="button" class="ghost" data-act="assign" data-arg="${c.id}:none">Remove</button></div>`).join('');
      const cand = workers.length < def.slots ? alive(w).filter(c => c.job !== b.uid).sort((a, z) => (def.job ? z.skills[def.job] - a.skills[def.job] : 0) + (Number(z.likes === def.job) - Number(a.likes === def.job)) * 2).map(c => {
        const cw = buildingByUid(w, c.job);
        return `<div class="row static"><span class="dot" style="background:${hex(c.shirt)}"></span><span class="who">${personLink(c)}<small>${def.job ? `${SKILL_NAMES[def.job]} ${Math.floor(c.skills[def.job])} · ` : ''}${cw ? `now at ${esc(BUILDING_BY_ID[cw.def].name)}` : 'laborer'}${c.likes === def.job ? ' · loves this' : c.dislikes === def.job ? ' · hates this' : ''}</small></span><button type="button" class="ghost" data-act="assign" data-arg="${c.id}:${b.uid}" ${bedridden(c) || c.sulking || c.errand != null ? 'disabled' : ''}>${bedridden(c) ? 'Ill' : c.sulking ? 'Sulking' : c.errand != null ? 'On errand' : 'Assign'}</button></div>`;
      }).join('') : '';
      staff += `<h3>Workers ${workers.length}/${def.slots}</h3><div class="rows">${cur || '<p class="muted">Nobody works here.</p>'}</div>${cand ? `<h3>Assign someone</h3><p class="muted">⚒ ${laborers(w).length} laborers free · keep hands for hauling.</p><div class="rows">${cand}</div>` : ''}`;
    } else if (def.storage) {
      const held = Object.values(b.stock).reduce((n, x) => n + (x ?? 0), 0);
      const contents = RESOURCES.filter(r => (b.stock[r.id] ?? 0) >= 0.5).map(r => goodHtml(r.id, Math.floor(b.stock[r.id] ?? 0))).join(', ');
      const mode = !b.allow ? 'all' : b.allow.length === FOODS.length && FOODS.every(f => b.allow!.includes(f)) ? 'food' : b.allow.length === GOODS.length && GOODS.every(f => b.allow!.includes(f)) ? 'goods' : 'custom';
      const preset = (id: string, label: string) => `<button type="button" class="seg${mode === id ? ' on' : ''}" data-act="store-preset" data-arg="${b.uid}:${id}" aria-pressed="${mode === id}">${label}</button>`;
      const items = RESOURCES.map(r => { const on = accepts(b, r.id); return `<button type="button" class="rule${on ? ' on' : ''}" data-act="store-item" data-arg="${b.uid}:${r.id}" aria-pressed="${on}">${icon(r.id)}${r.name}<small>${on ? '✓ Accept' : '× Exclude'}</small></button>`; }).join('');
      staff += `<p class="prefs">${Math.round(held)}/${def.storage} · ${def.keepsFresh ? '✓ Fresh food' : '⚠ Food spoils'}</p>${meter(held / def.storage * 100,'Storage capacity')}<details data-key="contents-${b.uid}"><summary>Contents</summary><p>${contents || 'Empty'}</p></details>
        <h3>Priority</h3><p class="muted">High priority fills first.</p>
        <div class="segs two"><button type="button" class="seg${b.high ? '' : ' on'}" data-act="store-prio" data-arg="${b.uid}:low" aria-pressed="${!b.high}">Low</button><button type="button" class="seg${b.high ? ' on' : ''}" data-act="store-prio" data-arg="${b.uid}:high" aria-pressed="${b.high}">High</button></div>
        <h3>Accepts</h3>
        <div class="segs">${preset('all', 'Everything')}${preset('food', 'Food only')}${preset('goods', 'Goods only')}</div>
        <details data-key="storage-items-${b.uid}"><summary>Customize items</summary><div class="rules">${items}</div></details>`;
    } else if (def.beds) {
      const sleepers = alive(w).filter(c => c.bed === b.uid).map(c => personLink(c)).join(', ');
      staff += `<p class="prefs">Sleeps ${def.beds}${sleepers ? `: ${sleepers}` : ''}.</p>`;
    }
    return `<div class="detail"><div class="d-head"><button type="button" class="ghost back" data-act="back">All buildings</button></div>
      <h2 class="bh">${icon(def.id, 'hico')}${esc(def.name)}</h2><p class="blurb">${esc(def.blurb)}</p>${recipe}${staff}</div>`;
  }

  private deskLines(w: World) {
    const r = w.research; if (!r) return '';
    const cur = r.current ? RESEARCH_BY_ID[r.current] : undefined;
    const done = r.done.map(id => RESEARCH_BY_ID[id].name).join(', ');
    if (!cur) return `<p class="prefs">${done ? `Learned: ${esc(done)}.` : ''}</p>`;
    const need = researchStillNeeds(w);
    const goods = Object.entries(cur.cost).map(([k, n]) => { const left = need[k as InputKey] ?? 0; const nm = inputName(k as InputKey); return `<li><button type="button" class="text-link" data-act="source" data-arg="${k}">${icon(k)}${esc(nm.charAt(0).toUpperCase() + nm.slice(1))} →</button><b>${Math.floor((n ?? 0) - left)} / ${n}</b></li>`; }).join('');
    return `<h3>Studying ${esc(cur.name)}</h3><p class="prefs">${esc(cur.desc)} ${cur.unlocks.length ? `Unlocks <b>${esc(cur.unlocks.map(u => BUILDING_BY_ID[u].name.toLowerCase()).join(' and '))}</b>.` : `<b>${esc(cur.effect ?? '')}</b>`}</p>
      <ul class="thoughts">${goods}<li><span>Study</span><b>${Math.floor(r.progress)} / ${cur.hours} hours</b></li></ul>
      <p class="muted">${Object.keys(need).length ? 'The scholar fetches the goods; laborers help when they can.' : 'Everything is here. Study goes faster with a better Studying skill.'}${done ? ` Learned so far: ${esc(done)}.` : ''}</p>`;
  }

  private resumeCard(w: World) {
    const prog = charterProgress(w);
    const when = (() => { const t = Date.parse(this.resumeSavedAt); if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} minute${m === 1 ? '' : 's'} ago` : m < 60 * 24 ? `${Math.round(m / 60)} hour${Math.round(m / 60) === 1 ? '' : 's'} ago` : `${Math.round(m / 1440)} day${Math.round(m / 1440) === 1 ? '' : 's'} ago`; })();
    const lines = [`Day ${day(w)} · ${alive(w).length} settlers · mood ${Math.round(avgMood(w))} · strain ${Math.round(w.strain)}`, prog ? `Charter ${w.chartersDone.length + 1} of 3: ${prog.charter.name}, ${prog.label}` : w.chartersDone.length ? `${w.chartersDone.length} charter${w.chartersDone.length > 1 ? 's' : ''} done` : 'No charter yet'];
    return `<div class="card-wrap"><p class="eyebrow">Welcome back${when ? ` · saved ${when}` : ''}</p><h2>Your colony is waiting</h2>
      <p class="lede">${lines.map(esc).join('<br>')}</p>
      <div class="opts"><button type="button" class="opt" data-act="resume"><b>Continue</b></button>
      ${this.confirmNew ? `<button type="button" class="opt danger" data-act="restart"><b>Yes, start over</b><span>This colony will be lost for good.</span></button>` : `<button type="button" class="opt" data-act="restart"><b>Start a new colony</b></button>`}</div>
      ${this.confirmNew ? '<button type="button" class="ghost skip" data-act="restart-cancel">Keep this colony</button>' : ''}</div>`;
  }

  private logList(w: World) {
    const restart = this.confirmNew
      ? `<div class="restart-row"><span>Start a new colony? This one will be lost for good.</span><button type="button" class="ghost danger" data-act="restart">Yes, start over</button><button type="button" class="ghost" data-act="restart-cancel">Keep playing</button></div>`
      : `<div class="restart-row"><span class="muted">Your colony saves automatically in this browser.</span><button type="button" class="ghost" data-act="restart">Start over</button></div>`;
    return restart + `<ol class="log">${w.log.slice(-60).reverse().map(l => `<li class="t-${l.tone}"><time>${l.tone === 'bad' ? '⚠' : l.tone === 'good' ? '✓' : l.tone === 'love' ? '♥' : '•'} Day ${l.day}, ${String(l.hour).padStart(2, '0')}:00</time><span>${logText(w,l.text)}</span></li>`).join('')}</ol>`;
  }

  // ---------- Decisions ----------
  private renderModal(w: World, force: boolean) {
    const el = this.root.querySelector('#modal') as HTMLElement;
    let html = '';
    const d = w.decisions[0];
    if (w.status !== 'playing') html = this.endScreen(w);
    else if (this.resumeOpen) html = this.resumeCard(w);
    else if (d) {
      switch (d.kind) {
        case 'charter': html = this.cards(d.tier === 1 ? 'Your first charter' : `Charter ${d.tier} of 3`,
          d.tier === 1 ? 'Complete three charters to establish your town.' : 'Choose the next goal.',
          d.options.map(id => { const c = charterDef(id)!; return { title: c.name, body: esc(c.desc), tag: `Tier ${c.tier}` }; })); break;
        case 'research': html = this.cards(w.research?.done.length ? 'What next for the scholar?' : 'Choose research',
          w.research?.done.length ? 'Choose one project.' : 'Staff the research desk to study.',
          d.options.map(id => { const r = RESEARCH_BY_ID[id]; return { title: r.name, body: `${esc(r.desc)}\n${r.unlocks.length ? `Unlocks: ${r.unlocks.map(u => `<span class="gd">${icon(u)}${esc(BUILDING_BY_ID[u].name)}</span>`).join(', ')}` : `<b>${esc(r.effect ?? '')}</b>`}`, tag: `${costHtml(r.cost)} · ${r.hours}h study` }; })); break;
        case 'blueprint': {
          const cost = rerollCost(w), can = w.gold >= cost;
          // each card lists what the building makes, best recipe first, so a reroll is a judgement about routes
          const recipeLines = (id: string) => [...(BUILDING_BY_ID[id].recipes ?? [])].sort((a, z) => z.stars - a.stars)
            .map(r => `<i class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</i> ${recipeHtml(r)}${Object.keys(r.inputs).length ? ` · ${esc(reachText(w, r, true))}` : ''}`).join('\n');
          const charter = charterDef(w.charter);
          const notes = (id: string) => {
            const def = BUILDING_BY_ID[id], out: string[] = [];
            if (charter && charterHelpers(charter.id).includes(id)) out.push(`◆ Charter: ${charter.name}`);
            if (def.cost.fine && stockOf(w, 'fine') < def.cost.fine && !['sawmill', 'kiln', 'carpenter'].some(m => w.owned.includes(m))) out.push('⚠ Needs a materials producer');
            return out.length ? `\n${out.map(esc).join('\n')}` : '';
          };
          html = this.cards('A new blueprint', 'Unlock one building.',
            d.options.map(id => { const b = BUILDING_BY_ID[id]; const rl = recipeLines(id); return { title: b.name, icon: id, body: `${rl || esc(b.blurb)}${notes(id)}`, tag: `Costs ${costHtml(b.cost)}${b.slots ? ` · ${b.slots} worker${b.slots > 1 ? 's' : ''}` : ''}` }; }),
            undefined,
            `<button type="button" class="ghost skip" data-act="reroll" ${can ? '' : 'disabled'}>Reroll for ${cost} gold${can ? '' : ` (you have ${Math.floor(w.gold)})`}</button><p class="muted reroll-note">+${REROLL_STEP} gold per reroll.</p>`);
          break;
        }
        case 'perk': html = this.cards(d.why === 'season' ? `${SEASON_NAMES[seasonOf(w).season]}: a new cornerstone` : 'The Crown grants a cornerstone',
          'Choose one permanent bonus.',
          d.options.map(id => ({ title: PERK_BY_ID[id].name, icon: 'cornerstone', body: esc(PERK_BY_ID[id].desc), tag: 'Cornerstone' }))); break;
        case 'trade': html = this.tradeCard(w); break;
        case 'recruit': html = `<div class="card-wrap"><p class="eyebrow">Choose one</p><h2>New settlers</h2><p class="lede">⌂ ${beds(w)} beds · ${alive(w).length} settlers${beds(w) <= alive(w).length ? ' · ⚠ Another bed needed' : ''}</p><div class="opts">${d.options.map((c,i) => `<article class="recruit"><button type="button" class="opt" data-act="resolve" data-arg="${i}" ${(c.fee ?? 0) > w.gold ? 'disabled' : ''}><b><span class="dot" style="background:${hex(c.shirt)}"></span>${esc(c.name)}</b><span>★ ${esc(topSkills(c))}</span><small>♥ ${esc(SKILL_NAMES[c.likes])} · × ${esc(SKILL_NAMES[c.dislikes])} · ${c.fee ? `${c.fee} gold${w.gold < c.fee ? ' · insufficient gold' : ''}` : 'Free'}</small></button><details data-key="recruit-${c.id}"><summary>Traits & tastes</summary>${c.traits.map(t => `<p><b>${esc(TRAIT_BY_ID[t].name)}</b> · ${esc(TRAIT_BY_ID[t].desc)}</p>`).join('')}<p>${tasteLine(c,false)}</p></details></article>`).join('')}</div><button type="button" class="ghost skip" data-act="resolve" data-arg="99">Send all away</button></div>`; break;
        case 'errand': { const e = w.errands.find(x => x.id === d.errandId); if (e) html = this.errandPicker(w, e, true); break; }
        case 'event': {
          const ev = EVENTS.find(e => e.id === d.eventId)!;
          html = `<div class="card-wrap event ${ev.tier}"><p class="eyebrow">${ev.tier === 'major' ? 'Trouble' : 'Something has happened'}</p><h2>${esc(ev.title)}</h2><p class="lede">${esc(ev.text)}</p>
            <div class="opts">${ev.options.map((o, i) => `<button type="button" class="opt" data-act="resolve" data-arg="${i}"><b>${esc(o.label)}</b><span>${esc(o.detail)}</span></button>`).join('')}</div></div>`;
          break;
        }
      }
    }
    if (!html && this.help) html = this.helpCard(w);
    if (!html && this.festivalOpen) html = this.festivalCard(w);
    if (!html && this.strainOpen) html = this.strainCard(w);
    if (!html && this.picking != null) { const e = w.errands.find(x => x.id === this.picking); if (e) html = this.errandPicker(w, e, false); else this.picking = null; }
    const wasOpen = !el.hidden;
    if (html && !wasOpen) {
      const a = document.activeElement as HTMLElement;
      this.returnFocus = a?.dataset.act ? { act: a.dataset.act, arg: a.dataset.arg ?? '' } : null;
    }
    if (force || html !== this.lastModal) { replaceMarkup(el, html); this.lastModal = html; }
    el.hidden = !html;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.tabIndex = -1;
    const heading = el.querySelector('h2');
    if (heading) { heading.id = 'dialog-title'; el.setAttribute('aria-labelledby', 'dialog-title'); }
    for (const id of ['hud', 'sheet', 'placebar', 'stage']) (this.root.querySelector(`#${id}`) as HTMLElement).inert = !!html;
    if (html && (!wasOpen || !el.contains(document.activeElement))) (el.querySelector<HTMLElement>('button:not(:disabled), summary') ?? el).focus({ preventScroll: true });
    if (!html && wasOpen) {
      const t = this.returnFocus;
      const target = t && [...this.root.querySelectorAll<HTMLElement>('[data-act]')].find(e => e.dataset.act === t.act && (e.dataset.arg ?? '') === t.arg);
      (target || this.root.querySelector<HTMLElement>('[data-act=tab]'))?.focus({ preventScroll: true });
      this.returnFocus = null;
    }
  }

  private tradeCard(w: World) {
    const t = w.caravan; if (!t) return '';
    const autumn = seasonOf(w).season === 'autumn';
    const left = Math.max(0, Math.ceil(t.leaves - w.hour));
    const charterGoods = new Set<string>(charterCounted(w));
    const tr = TRADER_BY_ID[t.trader];
    const wants = tr.wants.map(r => RESOURCES.find(x => x.id === r)!.name.toLowerCase());
    const gold = Math.floor(w.gold);
    const btn = (act: string, arg: string, label: string, ok: boolean) => `<button type="button" class="tbtn" data-act="${act}" data-arg="${arg}" ${ok ? '' : 'disabled'}>${label}</button>`;
    const bps = t.blueprints.map(b => { const def = BUILDING_BY_ID[b.id]; const helps = charterHelpers(w.charter ?? '').includes(b.id);
      return `<div class="trow"><span class="tname">${icon(b.id)}<span><b>${esc(def.name)}</b><small>${helps ? 'Helps your charter · ' : ''}blueprint</small></span></span><span class="tprice">${b.price}${icon('gold')}</span>${btn('trade-bp', b.id, `Buy · ${b.price} gold`, gold >= b.price)}</div>`; }).join('');
    const wares = (Object.entries(t.stock) as [ResourceId, { n: number; price: number }][]).filter(([, it]) => it.n > 0).sort((a, b) => Number(charterGoods.has(b[0])) - Number(charterGoods.has(a[0]))).map(([r, it]) => {
      const name = RESOURCES.find(x => x.id === r)!.name;
      return `<div class="trow"><span class="tname">${icon(r)}<span><b>${esc(name)}</b><small>${charterGoods.has(r) ? 'For your charter · ' : ''}${it.n} left · you have ${Math.floor(w.res[r])}</small></span></span><span class="tprice">${it.price}${icon('gold')}</span>${btn('trade-buy', `${r}:1`, `Buy 1 · ${it.price}g`, gold >= it.price)}${btn('trade-buy', `${r}:5`, `Buy 5 · ${it.price * 5}g`, gold >= it.price * Math.min(5, it.n) && it.n >= 5)}</div>`;
    }).join('');
    const cap = START.trade.sellCap;
    const counted = new Set(charterCounted(w));
    const mine = RESOURCES.filter(x => w.res[x.id] >= 1 && sellPrice(w, x.id) > 0).sort((a, b) => w.res[b.id] - w.res[a.id]).map(x => {
      const p = sellPrice(w, x.id), sold = t.sold[x.id] ?? 0, room = cap - sold, have = Math.floor(w.res[x.id]);
      const small = saleQuantity(5, have, room), large = saleQuantity(20, have, room);
      const sellButton = (n: number) => btn('trade-sell', `${x.id}:${n}`, `Sell ${n} · ${Math.floor(n * p + 1e-9)}g`, n > 0);
      return `<div class="trow"><span class="tname">${icon(x.id)}<span><b>${esc(x.name)}</b><small>you have ${have}${sold ? ` · sold ${sold}/${cap}` : ''}${counted.has(x.id) ? ' · your charter counts these' : ''}</small></span></span><span class="tprice">${Number.isInteger(p) ? p : p.toFixed(1)}${icon('gold')}</span>${sellButton(small)}${large > small ? sellButton(large) : ''}</div>`;
    }).join('');
    const name = tr.name.charAt(0).toUpperCase() + tr.name.slice(1);
    return `<div class="card-wrap trade"><p class="eyebrow">${icon('caravan')} The caravan · leaves in ${left}h</p><h2>${esc(name)}</h2>
      <p class="lede"><b class="goldnum">${gold} gold</b>.${wants.length ? ` Buys ${esc(wants.slice(0, -1).join(', '))} and ${esc(wants[wants.length - 1])}${autumn ? ', and at the harvest fair anything else, a little cheaper' : ' and nothing else'}.` : ' Buys anything, cheaply.'}</p>
      <details data-key="trader-lore"><summary>About this trader</summary><p>${esc(tr.who)}</p></details>${bps ? `<h3 class="first">Blueprints</h3><div class="tlist">${bps}</div>` : ''}
      <h3>The trader sells</h3><div class="tlist">${wares || '<p class="muted">Nothing left.</p>'}</div>
      <h3>The trader buys <span class="muted">· up to ${cap} of each</span></h3><div class="tlist">${mine || '<p class="muted">You have nothing this trader wants.</p>'}</div>
      <button type="button" class="opt" data-act="resolve" data-arg="0"><b>Done trading</b></button></div>`;
  }

  private cards(title: string, lede: string, opts: { title: string; body: string; tag: string; color?: string; icon?: string; disabled?: boolean }[], skip?: string, extra = '') {
    return `<div class="card-wrap"><p class="eyebrow">Choose one</p><h2>${esc(title)}</h2><p class="lede">${esc(lede)}</p>
      <div class="opts">${opts.map((o, i) => `<button type="button" class="opt" data-act="resolve" data-arg="${i}"${o.disabled ? ' disabled' : ''}>
        <b>${o.color ? `<span class="dot" style="background:${o.color}"></span>` : ''}${o.icon ? icon(o.icon, 'cico') : ''}${esc(o.title)}</b>
        ${o.body.split('\n').map(line => `<span>${line}</span>`).join('')}<small>${o.tag}</small></button>`).join('')}</div>
      ${skip ? `<button type="button" class="ghost skip" data-act="resolve" data-arg="99">${esc(skip)}</button>` : ''}${extra}</div>`;
  }

  private endScreen(w: World) {
    const won = w.status === 'won';
    const s = w.stats;
    return `<div class="card-wrap end ${won ? 'won' : 'lost'}"><p class="eyebrow">${won ? 'Victory' : 'The colony collapsed'}</p>
      <h2>${won ? 'Mumblewood is a town' : 'The kettle remains'}</h2>
      <p class="lede">${won ? 'All three charters complete.' : alive(w).length <= START.collapse.minAlive ? 'Too few settlers remain.' : 'Too many settlers were lost.'} You lasted ${day(w)} day${day(w) === 1 ? '' : 's'}.</p>
      ${!won ? `<p class="terms">${[...w.log].reverse().filter(l=>l.tone === 'bad').slice(0,3).map(l=>esc(l.text)).join('<br>')}</p>` : ''}<dl class="stats"><div><dt>Charters</dt><dd>${w.chartersDone.length} / 3</dd></div><div><dt>Peak population</dt><dd>${s.peakPop}</dd></div>
      <div><dt>Couples formed</dt><dd>${s.couples}</dd></div><div><dt>Breakups</dt><dd>${s.breakups}</dd></div>
      <div><dt>Left the colony</dt><dd>${s.departures}</dd></div><div><dt>Died</dt><dd>${s.deaths}</dd></div><div><dt>Meals eaten</dt><dd>${s.mealsEaten}</dd></div>
      <div><dt>Errands done</dt><dd>${s.errands}</dd></div><div><dt>Recoveries</dt><dd>${s.cured}</dd></div></dl>
      ${this.ledger()}
      <button type="button" class="opt restart" data-act="restart"><b>Start a new colony</b></button>
    </div>`;
  }

  private ledger() {
    const runs = this.profile.runs;
    if (!runs.length) return '';
    const wins = runs.filter(r => r.result === 'won');
    const best = wins.length ? Math.min(...wins.map(r => r.day)) : null;
    return `<p class="terms">Your ledger: ${runs.length} run${runs.length > 1 ? 's' : ''}, ${wins.length} won${best != null ? `, fastest win on day ${best}` : ''}.</p>`;
  }
}

function storeLabel(b: Building) {
  if (!b.allow) return 'everything';
  if (b.allow.length === FOODS.length && FOODS.every(f => b.allow!.includes(f))) return 'food only';
  if (b.allow.length === GOODS.length && GOODS.every(f => b.allow!.includes(f))) return 'goods only';
  return `${b.allow.length} kinds`;
}

const NEED_BUILD: Record<NeedKey, string> = { shelter: 'leanto', food: 'rawFood', fire: 'woodcutter', meals: 'kitchen', variety: 'kitchen', health: 'clinic', evenings: 'tavern', surroundings: 'flowerbed', fresh: 'rawFood', drink: 'drinks', warmth: 'woodcutter' };
const NEED_NAMES: Record<NeedKey, string> = { shelter: 'Shelter', food: 'Food', fire: 'A fire', meals: 'Meals', variety: 'Variety', health: 'Health', evenings: 'Evenings', surroundings: 'Surroundings', fresh: 'Something fresh', drink: 'A cold drink', warmth: 'Warmth' };
const NEED_FIX: Record<NeedKey, string> = {
  shelter: 'beds for everyone, cottages better still',
  food: 'enough food in storage',
  fire: 'wood for the hearth at night',
  meals: 'cooked meals at a table, favourites best',
  variety: 'a second kind of meal, so nobody eats the same thing for days',
  evenings: 'something to do in the evening: a tavern, a stage',
  health: 'a clinic with a doctor for the sick',
  surroundings: 'paths and decorations where people spend time',
  fresh: 'berries, apples, fish or skewers now and then',
  drink: 'ale, cider, mead or tea at the tavern',
  warmth: 'beds for everyone and wood for every home’s fire',
};
/** one settler's comfort, need by need, with what would raise each */
function comfortRows(w: World, c: Colonist) {
  const p = comfortParts(w, c);
  const v = (k: NeedKey) => p[k] ?? 0;
  const why: Record<NeedKey, string> = {
    shelter: v('shelter') >= 1 ? (c.bed != null ? 'a bed of their own' : '') : v('shelter') > 0 ? 'a shack (a cottage would be better)' : 'sleeping on the ground',
    food: v('food') >= 1 ? 'fed' : 'hungry',
    fire: v('fire') >= 1 ? 'the hearth is lit' : 'the hearth went cold',
    meals: v('meals') >= 1 ? 'a favourite meal at a table' : v('meals') >= 0.85 ? 'a cooked meal at a table' : v('meals') > 0 ? 'cooked, but not at a table' : 'raw food or going hungry',
    variety: v('variety') >= 1 ? 'a varied table' : v('variety') > 0 ? 'the same meal every day' : 'no proper meals lately',
    evenings: v('evenings') >= 0.8 ? 'well entertained' : v('evenings') > 0.3 ? 'some fun' : 'bored',
    health: v('health') >= 1 ? 'healthy' : v('health') > 0 ? 'ill, being looked after' : 'ill, nobody treating them',
    surroundings: v('surroundings') >= 0.75 ? 'pleasant' : v('surroundings') > 0.25 ? 'plain' : 'drab',
    fresh: v('fresh') >= 1 ? 'had something fresh' : 'nothing fresh in days',
    drink: v('drink') >= 1 ? 'had a drink today' : 'parched',
    warmth: v('warmth') >= 1 ? 'warm at home' : c.bed == null ? 'out in the cold' : 'no wood for the fire',
  };
  return `<div class="ledger">${activeNeeds(w).map(k => `<button type="button" data-act="need" data-arg="${k}" class="lg-row need ${v(k) >= 0.7 ? 'lg-good' : 'lg-bad'}"><span>${NEED_NAMES[k]}<small>${esc(why[k])}</small></span><i><b style="width:${Math.round(v(k) * 100)}%"></b></i><em>${Math.round(v(k) * 100)}%</em><span class="sr-only">Open remedy</span></button>`).join('')}</div>`;
}

/** base 50, plus the good, minus the gripes, minus this colonist's share of frontier wear */
function moodLedger(c: Colonist) {
  const wear = c.thoughts.filter(t => t.label.startsWith('The frontier')).reduce((n, t) => n + t.value, 0);
  const good = c.thoughts.filter(t => t.value > 0).reduce((n, t) => n + t.value, 0);
  const bad = c.thoughts.filter(t => t.value < 0 && !t.label.startsWith('The frontier')).reduce((n, t) => n + t.value, 0);
  const scale = Math.max(40, good, -bad, -wear);
  const row = (label: string, v: number, cls: string) => `<div class="lg-row ${cls}"><span>${label}</span><i><b style="width:${Math.min(100, Math.abs(v) / scale * 100)}%"></b></i><em>${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}</em></div>`;
  return `<div class="ledger">${row('Good things', good, 'lg-good')}${row('Gripes', bad, 'lg-bad')}${row('Frontier wear', wear, 'lg-wear')}
    <p class="lg-sum">50 ${good >= 0 ? '+' : '−'} ${Math.abs(Math.round(good))} − ${Math.abs(Math.round(bad))} − ${Math.abs(Math.round(wear))} → heading to <b>${Math.round(c.moodTarget)}</b></p></div>`;
}

/** the colony's biggest complaints and warnings, read off the same things the player can see */
function concernCards(w: World) {
  const concerns = assess(w);
  return concerns.length ? `<button type="button" class="issue-summary" data-act="tab" data-arg="issues">⚠ ${concerns.length} concerns <span>${esc(concerns[0].title)} →</span></button>` : '';
}

// ---------- Ledger ----------
const num = (n: number) => `${n > 0.05 ? '+' : n < -0.05 ? '−' : ''}${Math.abs(n) >= 10 ? Math.round(Math.abs(n)) : Math.abs(n).toFixed(1).replace(/\.0$/, '')}`;
function flowLink(label: string, key: InputKey) {
  const maker: Record<string,string> = { Chopped:'woodcutter', Hearth:'hearth', Sawmill:'sawmill', 'Brick kiln':'kiln', Carpenter:'carpenter', 'Pie oven':'pieoven', Bathhouse:'bathhouse', 'Drunk at the tavern':'tavern' };
  const produced = RESOURCES.find(r => label.toLowerCase() === `${r.name.toLowerCase()} made`);
  const resource: InputKey = label === 'Gathered' ? 'rawFood' : label === 'Meals cooked' || label === 'Raw food into cooking' ? 'meal' : label === 'Food into drinks' ? 'drink' : label === 'Treatments' ? 'remedy' : produced?.id ?? key;
  const act = maker[label] || label === 'Heating homes' ? 'workplaces' : label === 'Construction' ? 'construction' : label === 'Eaten' ? 'tab' : label === 'Spoiled' ? 'storage-help' : label === 'Events' ? 'tab' : 'source';
  const arg = maker[label] ?? (label === 'Heating homes' ? 'leanto,cottage' : label === 'Eaten' ? 'colonists' : label === 'Events' ? 'log' : resource);
  return `<button type="button" class="text-link" data-act="${act}" data-arg="${arg}">${esc(label)} →</button>`;
}
function accountCard(a: Account, ico: InputKey, selected: boolean) {
  const max = Math.max(1, ...a.lines.map(l => Math.abs(l.perDay)));
  const rows = a.lines.map(l => `<div class="lg-row ${l.perDay >= 0 ? 'lg-good' : 'lg-bad'}">${flowLink(l.label,ico)}<i><b style="width:${Math.abs(l.perDay) / max * 100}%"></b></i><em>${num(l.perDay)}</em></div>`).join('');
  const verdict = a.daysLeft != null ? `<b class="neg">${num(a.net)} a day</b> · ${Math.floor(a.stock)} on hand lasts about ${a.daysLeft < 1 ? 'less than a day' : `${Math.floor(a.daysLeft)} day${Math.floor(a.daysLeft) === 1 ? '' : 's'}`}` : `<b class="${a.net >= 0 ? 'pos' : ''}">${num(a.net)} a day</b> · ${Math.floor(a.stock)} on hand`;
  return `<details class="acct" data-key="account-${ico}" ${selected ? 'open' : ''}><summary id="account-${ico}" class="acct-head"><h4>${icon(ico)}${a.name}</h4><span>${verdict}</span></summary><div class="actions"><button type="button" class="ghost" data-act="source" data-arg="${ico}">Sources →</button>${ico === 'meal' ? '<button type="button" class="ghost" data-act="food-rules">Food rules →</button>' : ''}</div>${rows || '<p class="muted">Nothing moved in the last day.</p>'}</details>`;
}
function ledger(w: World, selected: InputKey | 'gold' | null = null) {
  const e = economy(w);
  const selectedGood = selected && selected !== 'gold' ? RESOURCES.find(r => r.id === selected) : null;
  const categoryDetail = selected && selected !== 'gold' && !selectedGood ? `<div id="account-${selected}" class="acct"><h3>${icon(selected)} ${esc(inputName(selected))}</h3><div class="actions">${membersOf(selected).map(r=>`<button type="button" class="ghost" data-act="resource" data-arg="${r}">${goodHtml(r,Math.floor(w.res[r]))} →</button>`).join('')}</div></div>` : '';
  const resourceDetail = selectedGood ? `<div id="account-${selectedGood.id}" class="acct"><h3>${icon(selectedGood.id)} ${selectedGood.name} · ${Math.floor(w.res[selectedGood.id])}</h3><div class="actions"><button type="button" class="ghost" data-act="source" data-arg="${selectedGood.id}">Sources →</button><button type="button" class="ghost" data-act="workplaces" data-arg="stockpile,storehouse">Storage →</button>${FOODS.includes(selectedGood.id) ? '<button type="button" class="ghost" data-act="food-rules">Food rules →</button>' : ''}</div></div>` : '';
  const show = (a: Account) => a.lines.length > 0 || a.stock >= 1;
  const accounts: [Account, InputKey][] = [[e.food, 'meal'], [e.wood, 'wood'], ...([[e.planks, 'planks'], [e.drinks, 'drink'], [e.remedies, 'remedy']] as [Account, InputKey][]).filter(([a]) => show(a))];
  const jobs = e.jobs.sort((a, z) => (z.slots - z.workers) - (a.slots - a.workers)).map(j => {
    const open = j.slots - j.workers;
    return `<button type="button" class="job-row" data-act="workplaces" data-arg="${j.def}"><span><b>${icon(j.def)} ${esc(j.name)}</b><small>${j.workers}/${j.slots} working${open && j.best ? ` · best free hand: ${esc(first(j.best.c))} (${esc(SKILL_NAMES[j.job].toLowerCase())} ${j.best.skill}${j.best.c.likes === j.job ? ', loves it' : ''})` : ''}</small></span>${open ? `<em class="open">${open} open</em>` : '<em>full</em>'}</button>`;
  }).join('');
  const lt = e.laborTime;
  const pct = (k: string) => Math.round((lt[k] ?? 0) * 100);
  // share of their non-meal hours spent hauling, building or cleaning
  const busy = Math.round((pct('hauling') + pct('building') + pct('cleaning')) / Math.max(1, 100 - pct('eating') - pct('sick')) * 100);
  const laborNote = !e.laborers.length ? 'Everyone has a job, so nobody is hauling, building or cleaning.'
    : busy >= 75 ? 'Laborers are busy most of the day. Taking one for a job will slow hauling and building.'
    : pct('idle') >= 20 ? 'Laborers have spare time. An empty job slot would put it to use.'
    : 'Laborers have a little slack.';
  const segs = ['hauling', 'building', 'cleaning', 'eating', 'idle'].map(k => `<b class="lt-${k}" style="width:${pct(k)}%"></b>`).join('');
  const goldIn = (k: string) => Math.round(w.flows[`gold:+${k}`] ?? 0), goldOut = Object.entries(w.flows).filter(([k]) => k.startsWith('gold:-')).reduce((n, [, v]) => n + v, 0);
  const goldLine = ['rent', 'stipend', 'sell'].map(k => `${k === 'sell' ? 'selling' : k} ${goldIn(k)}`).join(' · ');
  return `<p class="muted hint">The last 24 hours, scaled to a full day.</p>
    <div id="account-gold" class="acct gold-acct"><div class="acct-head"><b>${icon('gold')}Gold</b><span>${Math.floor(w.gold)} · this run: ${goldLine} · spent ${Math.round(goldOut)}</span></div></div>
    ${w.perks.length ? `<details data-key="cornerstones"><summary>Cornerstones · ${w.perks.length}</summary><ul class="stones">${w.perks.map(p => `<li>${icon('cornerstone')}<span><b>${esc(PERK_BY_ID[p].name)}</b><small>${esc(PERK_BY_ID[p].desc)}</small></span></li>`).join('')}</ul></details>` : ''}
    <details data-key="gold-help"><summary>Gold sources</summary><p>Seasonal rent · Crown stipends · events · caravan sales</p></details>${categoryDetail}${resourceDetail}${accounts.map(([a, k]) => accountCard(a, k, selected === k || !!selected && membersOf(k).includes(selected as ResourceId))).join('')}
    <h3>Jobs</h3><div class="joblist">${jobs || '<p class="muted">No workplaces yet.</p>'}</div>
    <h3>Laborers <span class="muted">· ${e.laborers.length}</span></h3>
    <div class="lt-bar">${segs}</div>
    <p class="lt-key">${['hauling', 'building', 'cleaning', 'eating', 'idle'].map(k => `<span class="lt-${k}"><i></i>${k} ${pct(k)}%</span>`).join('')}</p>
    <p class="prefs">${laborNote}</p>`;
}
