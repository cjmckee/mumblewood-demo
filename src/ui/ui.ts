// DOM overlay: HUD, bottom sheet, decision modals. Talks to the sim only through commands.
import { LORE_BOOST, EventNeed, EventOption, BUILDINGS, membersOf, BUILDING_BY_ID, EVENTS, RESEARCH, RESEARCH_BY_ID, BRANCHES_AFTER, JOB_NAMES, PERK_BY_ID, TRADER_BY_ID, RESOURCES, TRAIT_BY_ID, ResourceId, SKILL_NAMES, JOB_KINDS, JobKind, Recipe, InputKey, inputName, recipeRate, Stars } from '../sim/content';
import {
  World, Command, Colonist, alive, avgMood, beds, buildingByUid, charterProgress, colonistById,
  day, hourOfDay, opinion, workersAt, MAX_DEPARTURES, sites, siteWork, remainingCost, storageCap, stored,
  keepsFresh, findSpot, canPlace, laborers, centerOf, built, Building, efficiencyAt, pathAt, MAP_SIZE, blockedReason, Errand, patientsAt, clinicAdmissions, lost, bedridden, spoilingFood, accepts, roomIn, FOODS, GOODS,
  recipesOf, recipeOn, currentRecipe, orderedRecipes, INPUT_CAPACITY, OUTBOX_CAP, siteOk, rerollCost, REROLL_STEP, stockOf, recipeReach, charterHelpers, charterDef,
  costOf, researchLeft, researchStillNeeds, desks, feastCheck, festivalPreview, mealTotal, drinkTotal,
  comfortParts, comfortOf, colonyComfort, comfortGaps, strainPerDay, footprint, activeNeeds, standingOf, STANDINGS, NeedKey, winterFuelPerDay,
  sellPrice, charterCounted, charterRequirements, basicsDone, researchOpen, edibleTotal, storePrio, colonyName, nameFrom, NAME_MAX,
} from '../sim/world';
import { charterPreview, metricRoutes, Route } from '../sim/charterplan';
import { START } from '../sim/scenario';
import { assess, rankForPlayer, Ranked, defsOf } from '../sim/advisor';
import { economy, Account } from '../sim/economy';
import type { IsoView, Picked } from '../render/iso';
import { icon } from './icons';
import { avatar } from './avatars';
import { buildingStatus, saleQuantity } from './status';
import { replaceMarkup } from './dom';
import { Destination, buildingDestination, fixDestination, producers } from './navigation';
import { seasonOf, SEASON_NAMES } from '../sim/seasons';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const first = (c: Colonist) => c.name.split(' ')[0];
const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((n, v) => n + (v ?? 0), 0);
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const goodLabel = (k: InputKey) => inputName(k);
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
    case 'dressing': return c.coatAction === 'store' ? 'Storing a warm coat' : 'Collecting a warm coat';
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

const personLink = (c: Colonist, portrait = true) => `<button type="button" class="text-link" data-act="colonist" data-arg="${c.id}">${portrait ? avatar(c,'avatar-mini') : ''}${esc(c.name)} →</button>`;
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

type Tab = 'colonists' | 'build' | 'ledger' | 'issues' | 'log' | 'menu';
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

/** the panel's tabs: a glyph over a short name; counts sit on the glyph */
const TAB_NAME: Record<Tab, string> = { colonists: 'Colonists', build: 'Build', ledger: 'Ledger', issues: 'Issues', log: 'Log', menu: 'Menu' };
/** small stroke glyphs for the charter chips, route tiles and tabs */
const svg = (d: string, w = 2) => `<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PERSON_GLYPH = svg('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>');
const MOOD_GLYPH = svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2c1 1.3 2.2 1.9 3.5 1.9s2.5-.6 3.5-1.9"/><path d="M9 9.6h.01M15 9.6h.01" stroke-width="2.6"/>');
const ROUTE_GLYPH: Record<'build' | 'study' | 'draft' | 'never', string> = {
  build: svg('<path d="M14 4l6 6M11 7l6 6M13 11l-9 9"/>', 3),
  study: svg('<path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"/>', 3),
  draft: svg('<rect x="6" y="3" width="12" height="18" rx="2"/>', 3),
  never: svg('<path d="M6 6l12 12M18 6 6 18"/>', 3.4),
};
const TAB_GLYPH: Record<Tab, string> = {
  colonists: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 13.8c1.8.7 3 2.4 3 5.2"/>'),
  build: svg('<path d="M14 4l6 6M11 7l6 6M13 11l-9 9"/>'),
  ledger: svg('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M9 9h6M9 13h6"/>'),
  issues: svg('<path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17h.01"/>'),
  log: svg('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  menu: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.3-.3-.3-2.3z"/>'),
};
const LABORER_GLYPH = svg('<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/>');
const HEARTH_GLYPH = svg('<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.5 1 2.5 2 3 0-3-1-5 1-8.5z"/><path d="M5 21h14"/>');
const MOOD_TREND: Record<string, string> = { '↑': '▲', '↓': '▼', '↔': '' };
const CATALOG_GROUP = { food: 'Food & drinks', work: 'Production', comfort: 'Homes & comfort', storage: 'Storage' };
const SPOIL_GLYPH = svg('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9 3h6"/>');
const FRESH_GLYPH = svg('<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/>');
const EYE_GLYPH = svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
const STAFF_GLYPH = svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>', 3);
const SWAP_GLYPH = svg('<path d="M4 8h14l-3-3M20 16H6l3 3"/>', 2.6);
const MORE_GLYPH = svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>', 2.4);
const CLOCK_GLYPH = svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>');
const STRAIN_GLYPH = svg('<path d="M3 18 9 9l4 5 3-4 5 8z"/>');
const CHEVRON_UP = svg('<path d="M6 15l6-6 6 6"/>', 2.6);
const CHEVRON_DOWN = svg('<path d="M6 9l6 6 6-6"/>', 2.6);
const ARROW_GLYPH = svg('<path d="M5 12h13M13 6l6 6-6 6"/>', 2.4);
const TARGET_GLYPH = svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>');
const CHECK_GLYPH = svg('<path d="M5 12.5 10 17 19 7"/>', 3.4);
const LOCK_GLYPH = svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 2.6);
/** what each study is about, as an icon: the building it unlocks or speeds up */
const RESEARCH_ICON: Record<string, string> = {
  cookery: 'kitchen', messhall: 'dining', physick: 'clinic', warehousing: 'storehouse', gardening: 'flowerbed', masonry: 'bench',
  smoking: 'dock', salting: 'smokedFish', rotation: 'field', milling: 'mill', malting: 'brewery', cellaring: 'tavern',
  joinery: 'sawmill', roads: 'lantern', handcarts: 'stockpile', foraging: 'forager', preserving: 'cellar', herblore: 'herbgarden', quarantine: 'clinic',
};
const STAR_GLYPH = '<svg class="glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3 7 7 .6-5.3 4.6 1.7 7.3L12 17.8 5.6 21.5l1.7-7.3L2 9.6 9 9z"/></svg>';
const BOX_GLYPH = svg('<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/>');
const TROPHY_GLYPH = svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/>');
const SKULL_GLYPH = svg('<circle cx="12" cy="11" r="7"/><path d="M9 11h.01M15 11h.01M10 18v3M14 18v3"/>');
const SAVE_GLYPH = svg('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>');
const PLUS_GLYPH = svg('<path d="M12 5v14M5 12h14"/>', 2.4);
const LABEL_GLYPH = svg('<path d="M4 7h10l4 5-4 5H4z"/>');
const MOTION_GLYPH = svg('<path d="M3 12h4l3-7 4 14 3-7h4"/>');
const DICE_GLYPH = svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01" stroke-width="2.8"/>');
const CATEGORY_MEMBERS = { meal: membersOf('meal'), drink: membersOf('drink'), fine: membersOf('fine'), remedy: membersOf('remedy'), rawFood: membersOf('rawFood') };
/** a cornerstone's icon: the building or good it's about, where there is one */
const CORNERSTONE_ICON: Record<string, string> = {
  communalPot: 'stew', warmHearth: 'wood', hearthSongs: 'tavern', homesteaders: 'cottage', hearthkeepers: 'wood', lumberGuild: 'woodcutter',
  rentCollector: 'gold', pilgrimsRoad: 'caravan', rootCellars: 'cellar', merchantsFavour: 'caravan', openRoad: 'leanto', feastDays: 'dining',
  brewersGuild: 'brewery', fishingRights: 'dock', masonsLodge: 'sawmill', bakersRow: 'bakery', crownsFavour: 'gold', barnRaising: 'carpenter', ironWill: 'statue',
};
const PREFS_KEY = 'mumblewood.ui.prefs.v1';
type Prefs = { labels: 'all' | 'selected'; calm: boolean };
function loadPrefs(): Prefs { try { return { labels: 'all', calm: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }; } catch { return { labels: 'all', calm: false }; } }
const CHARTER_DISPLAY_KEY = 'mumblewood.ui.charter-collapsed.v1';
function initialCharterCollapsed() {
  try {
    const preference = localStorage.getItem(CHARTER_DISPLAY_KEY);
    if (preference === 'true' || preference === 'false') return preference === 'true';
  } catch { /* UI preferences are optional when storage is unavailable. */ }
  return window.matchMedia('(max-width: 600px)').matches;
}

export class UI {
  tab: Tab = 'colonists';
  open = false;
  detail: Detail = null;
  speed = 1;
  private charterCollapsed = initialCharterCollapsed();
  private lastHud = ''; private lastSheet = ''; private lastModal = '';
  onSpeed: (s: number) => void = () => {};
  onRestart: () => void = () => {};
  /** run history from this browser, shown on the end screen */
  profile: { runs: { result: string; day: number; charters: number; at?: string; name?: string }[]; firstRunDone?: boolean } = { runs: [] };
  /** the profile changed and should be saved (the first-run guide finished) */
  onProfile: () => void = () => {};
  private lastCoach = '';
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
  private dialogKey = '';
  private colonistFilter = 'all';
  /** the decision card is hidden so the player can look at the colony; play stays paused until they choose */
  private peeking = false;
  /** settings from the Menu tab, kept in this browser apart from the save */
  prefs: Prefs = loadPrefs();
  /** naming the colony after the first charter: the suggested name shown, and what's typed */
  private nameInit = ''; private nameDraft: string | null = null; private nameSeed = -1;
  /** the trade order being put together: amounts to buy and sell, and blueprints, for the caravan that's here */
  private order: { key: string; buy: Record<string, number>; sell: Record<string, number>; bps: string[] } = { key: '', buy: {}, sell: {}, bps: [] };
  /** the research tree's selected project */
  private researchPick: string | null = null;
  /** Issues: rows opened to show their evidence and other fixes; every row shown, not the first five; the last order */
  private openIssues = new Set<string>();
  private allIssues = false;
  private issueOrder: string[] = [];
  private issueSig = '';
  private peekKey = '';
  /** the HUD shows every good, not the grouped totals */
  allGoods = false;
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
  get blocksSimulation() { return this.festivalOpen || this.strainOpen || this.picking != null || this.help != null || this.naming(this.getWorld()); }
  /** the first charter is picked and the colony hasn't been named yet */
  private naming(w: World) { return w.status === 'playing' && !w.named && !!(w.charter || w.chartersDone.length) && !this.resumeOpen; }

  private dismissDialog() {
    if (this.getWorld().decisions.length || this.resumeOpen || this.getWorld().status !== 'playing') return;
    this.festivalOpen = false; this.strainOpen = false; this.picking = null; this.help = null;
    this.render(true);
  }

  private keyboard(e: KeyboardEvent) {
    const modal = this.root.querySelector<HTMLElement>('#modal')!;
    if (modal.hidden) {
      if (e.key === 'Escape' && this.peeking) { this.peeking = false; this.render(true); return; }
      if (e.key === 'Escape') { this.view.placing = null; this.view.pathMode = false; this.open = false; this.detail = null; this.render(true); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); this.dismissDialog(); }
    if (e.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), summary, select, input:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
    const at = controls.indexOf(document.activeElement as HTMLElement);
    if (!controls.length) { e.preventDefault(); modal.focus(); }
    else if (e.shiftKey && at <= 0) { e.preventDefault(); controls[controls.length - 1].focus(); }
    else if (!e.shiftKey && (at === controls.length - 1 || at < 0)) { e.preventDefault(); controls[0].focus(); }
  }

  constructor(private root: HTMLElement, private getWorld: () => World, private send: (c: Command) => string | null, private view: IsoView) {
    currentUI = this;
    // the colony name being typed: kept without redrawing the card; Enter founds it
    root.addEventListener('input', e => { const t = e.target as HTMLElement; if (t instanceof HTMLInputElement && t.dataset.nameInput != null) this.nameDraft = t.value; });
    root.addEventListener('keydown', e => { const t = e.target as HTMLElement; if (e.key === 'Enter' && t instanceof HTMLInputElement && t.dataset.nameInput != null) { e.preventDefault(); (root.querySelector('[data-act=name-ok]') as HTMLElement | null)?.click(); } });
    root.addEventListener('click', e => { if (!(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLInputElement)) this.click(e); });
    window.addEventListener('keydown', e => this.keyboard(e));
    root.addEventListener('change', e => {
      const input=e.target;if(!(input instanceof HTMLInputElement)||!input.hasAttribute('data-production-limit')){this.click(e);return;}
      const raw=input.value.trim(),limit=raw===''?null:Number(raw);
      const err=this.send({type:'productionLimit',building:Number(input.dataset.building),output:input.dataset.output as ResourceId,limit});
      if(err)this.toast(err);this.render(true);
    });
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

  /** the player's concerns in a steady order: re-sorted only when one appears, goes or changes colour */
  rankedIssues(w: World): Ranked[] {
    const r = rankForPlayer(w);
    const sig = r.map(c => c.id + c.level).sort().join(',');
    if (sig !== this.issueSig) { this.issueSig = sig; this.issueOrder = r.map(c => c.id); }
    return this.issueOrder.map(id => r.find(c => c.id === id)).filter((c): c is Ranked => !!c);
  }

  /** a fix as a button: the building it's about, a corner mark for what to do, and one word */
  fixButtonFor(w: World, c: Ranked) { return this.fixButton(w, c, 0); }
  private fixButton(w: World, c: Ranked, i: number) {
    const f = c.fixes[i];
    let ico = '', how: 'staff' | 'build' | 'study' | 'draft' | 'swap' | 'open' = 'open', act = 'fix', arg = `${c.id}:${i}`, label = '';
    if (!f) {
      if (c.id === 'festival' || c.id === 'moodcharter') { ico = icon('meal'); act = 'festival-open'; arg = ''; label = 'Plan a festival'; }
      else if (c.id === 'leaving') { ico = PERSON_GLYPH; act = 'issue-people'; arg = c.id; label = 'See who'; }
      else if (c.id === 'stretched' || c.id === 'slack') { ico = TAB_GLYPH.ledger; act = 'ledger-laborers'; arg = ''; label = 'Laborers in the ledger'; }
      else { ico = TAB_GLYPH.ledger; act = 'tab'; arg = 'ledger'; label = 'Open the ledger'; }
    } else {
      label = fixDestination(w, f).label;
      if ('build' in f) { how = 'build'; ico = icon(f.build); }
      else if ('staff' in f) { how = 'staff'; ico = icon(defsOf(f.staff)[0]); }
      else if ('draft' in f) { how = 'draft'; ico = icon(f.draft); }
      else if ('research' in f) { how = 'study'; ico = icon(RESEARCH_BY_ID[f.research]?.unlocks[0] ?? 'desk'); }
      else if ('reassign' in f) { how = 'swap'; ico = SWAP_GLYPH; }
      else if ('relaxFoodRules' in f) { ico = icon('meal'); }
      else ico = PERSON_GLYPH;
    }
    const verb = { staff: 'Staff', build: 'Build', study: 'Study', draft: 'Draft', swap: 'Swap', open: 'Open' }[how];
    const mark = how === 'open' ? '' : `<i class="rb ${how}">${how === 'staff' ? STAFF_GLYPH : how === 'swap' ? SWAP_GLYPH : ROUTE_GLYPH[how]}</i>`;
    return `<button type="button" class="fixbtn" data-act="${act}" data-arg="${arg}" title="${esc(label)}" aria-label="${esc(label)}"><span class="ftile">${ico}${mark}</span>${verb}</button>`;
  }

  private issueRow(w: World, c: Ranked) {
    const open = this.openIssues.has(c.id);
    const title = c.title.replace(/^\d+\s+/, '').replace(/^./, ch => ch.toUpperCase());
    const ppl = c.personIds.map(id => colonistById(w, id)).filter((p): p is Colonist => !!p);
    const people = ppl.length ? `<button type="button" class="ipeople" data-act="issue-people" data-arg="${c.id}" aria-label="${ppl.length} ${ppl.length === 1 ? 'person' : 'people'}" title="${esc(ppl.map(p => p.name).join(', '))}">${ppl.slice(0, 3).map(p => avatar(p, 'avatar-mini')).join('')}${ppl.length > 3 ? `<em>+${ppl.length - 3}</em>` : ''}</button>` : '';
    return `<article class="issue ${c.level}">
      <div class="irow"><span class="idot" role="img" aria-label="${c.level === 'red' ? 'Urgent' : 'Worth fixing'}"></span>
        <span class="imain"><button type="button" class="ititle" data-act="issue-toggle" data-arg="${c.id}" aria-expanded="${open}">${esc(title)}</button><span class="ifacts">${concernFacts(w, c)}${people}</span></span>
        ${this.fixButton(w, c, 0)}${c.fixes.length > 1 ? `<button type="button" class="imore" data-act="issue-toggle" data-arg="${c.id}" aria-expanded="${open}" aria-label="More fixes">${MORE_GLYPH}</button>` : ''}</div>
      ${open ? `<div class="iexp"><p>${esc(c.evidence)}</p>${c.fixes.length > 1 ? `<div class="ifixes">${c.fixes.slice(1).map((_, i) => this.fixButton(w, c, i + 1)).join('')}</div>` : ''}</div>` : ''}
    </article>`;
  }

  private issueList(w: World) {
    const all = this.rankedIssues(w);
    if (!all.length) return '<p class="empty">✓ No concerns</p>';
    // the first five, and every red one; the rest fold into a "more" row
    const shown = this.allIssues ? all : all.filter((c, i) => c.level === 'red' || i < 5);
    const hidden = all.length - shown.length;
    return `<div class="issues">${shown.map(c => this.issueRow(w, c)).join('')}
      ${hidden ? `<button type="button" class="issues-more" data-act="issues-all"><span class="idot"></span>+${hidden} more</button>` : this.allIssues && all.length > 5 ? `<button type="button" class="issues-more" data-act="issues-all">Show fewer</button>` : ''}</div>`;
  }

  private destinationList(w: World) {
    const d = this.destination;
    if (!d) return '';
    if (d.kind === 'workplaces') return `<button type="button" class="ghost" data-act="tab" data-arg="build">← Buildings</button><h3>${esc(d.label)}</h3><div class="rows">${w.buildings.filter(b => d.defs.includes(b.def)).map((b, i, all) => { const same = all.filter(x => x.def === b.def); const n = same.length > 1 ? ` ${same.indexOf(b) + 1}` : ''; const crew = workersAt(w, b.uid);
        return `<button type="button" class="row compact" data-act="building" data-arg="${b.uid}"><span class="who"><b>${icon(b.def)} ${esc(BUILDING_BY_ID[b.def].name)}${n}</b><small>${buildingStatus(w, b).warning ? '⚠ ' : ''}${esc(buildingStatus(w, b).label)}</small></span><span class="crew">${crew.map(c => avatar(c, 'avatar-mini')).join('')}→</span></button>`; }).join('') || `<p class="empty">No buildings here yet.</p><button type="button" class="ghost" data-act="catalog-help" data-arg="${d.defs[0]}">Find blueprint →</button>`}</div>`;
    if (d.kind === 'research') return this.researchView(w);
    if (d.kind === 'catalog') {
      const def = BUILDING_BY_ID[d.def];
      const available = w.owned.includes(d.def);
      return `<button type="button" class="ghost" data-act="tab" data-arg="build">← Buildings</button><h2>${icon(d.def)} ${esc(def.name)}</h2><p>${esc(def.blurb)}</p><p>${costHtml(def.cost,w)}</p>${available ? `<button type="button" class="act" data-act="build" data-arg="${d.def}">Place</button>` : `<p class="warnline">Blueprint needed · watch drafts and caravans.</p>`}`;
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
      case 'charter-toggle':
        this.charterCollapsed = !this.charterCollapsed;
        try { localStorage.setItem(CHARTER_DISPLAY_KEY, String(this.charterCollapsed)); } catch { /* Keep the session preference. */ }
        break;
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
      case 'fix': { const [id, index] = arg.split(':'); const fix = rankForPlayer(w).find(c => c.id === id)?.fixes[Number(index)]; if (fix) this.navigate(fixDestination(w, fix)); break; }
      case 'issue-people': { const people = rankForPlayer(w).find(c => c.id === arg)?.personIds ?? []; this.panel('colonists'); this.peopleFilter = people; break; }
      case 'workplaces': { const defs = arg.split(','); this.navigate({ kind: 'workplaces', defs, label: defs.length === 1 ? BUILDING_BY_ID[defs[0]]?.name ?? 'Workplaces' : 'Workplaces' }); break; }
      case 'construction': this.panel('build'); this.buildMode = 'manage'; this.buildingFilter = 'sites'; break;
      case 'catalog-help': this.navigate(buildingDestination(w, arg)); break;
      case 'source': {
        const defs = producers(arg as InputKey), existing = w.buildings.filter(b => defs.includes(b.def));
        if (existing.length) this.navigate({ kind: 'workplaces', defs, label: `Sources of ${inputName(arg as InputKey)}` });
        else { const def = defs.find(d => w.owned.includes(d)) ?? defs[0]; if (def) this.navigate(buildingDestination(w, def)); }
        break;
      }
      case 'resource': this.panel('ledger'); this.resource = arg as InputKey | 'gold'; this.anchor = `${arg === 'gold' || !RESOURCES.some(r => r.id === arg) ? 'account' : 'resource'}-${arg}`; break;
      case 'pref': { const [k, v] = arg.split(':'); if (k === 'labels') this.prefs.labels = v as Prefs['labels']; if (k === 'calm') this.prefs.calm = !!v;
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* optional */ } this.applyPrefs(); break; }
      case 'name-roll': this.nameInit = nameFrom((Math.random() * 2 ** 32) >>> 0); this.nameDraft = null; this.lastModal = ''; break;
      case 'name-ok': this.send({ type: 'name', name: this.nameDraft ?? this.nameInit }); this.nameDraft = null; this.nameInit = ''; this.lastModal = ''; break;
      case 'all-goods': this.allGoods = !this.allGoods; break;
      case 'issue-toggle': if (this.openIssues.has(arg)) this.openIssues.delete(arg); else this.openIssues.add(arg); break;
      case 'issues-all': this.allIssues = !this.allIssues; break;
      case 'ledger-laborers': this.panel('ledger'); this.anchor = 'ledger-laborers'; break;
      case 'research-open': this.navigate({ kind: 'research', label: 'Research' }); this.researchPick = null; break;
      case 'research-pick': this.researchPick = this.researchPick === arg ? null : arg; break;
      case 'study': { const err = this.send({ type: 'study', id: arg }); if (err) this.toast(err); this.lastModal = ''; break; }
      case 'peek': this.peeking = true; this.lastModal = ''; break;
      case 'peek-back': this.peeking = false; this.lastModal = ''; break;
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
      case 'recipe-priority': { const [building,recipe,delta]=arg.split(':').map(Number);this.send({type:'recipePriority',building,recipe,delta:delta as -1|1});break; }
      case 'recipe-toggle': { const [bid, i] = arg.split(':').map(Number); const b = buildingByUid(w, bid); if (!b) break; this.send({ type: 'toggleRecipe', building: bid, recipe: i, on: !recipeOn(b, i) }); break; }
      case 'store-prio': { const [bid, m] = arg.split(':').map(Number); this.send({ type: 'storagePriority', building: bid, prio: m as 0 | 1 | 2 }); break; }
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
      case 'tq': { const [side, r, d] = arg.split(':'); const book = side === 'buy' ? this.order.buy : this.order.sell; const t = w.caravan;
        const max = side === 'buy' ? t?.stock[r as ResourceId]?.n ?? 0 : saleQuantity(START.trade.sellCap, Math.floor(w.res[r as ResourceId]), START.trade.sellCap - (t?.sold[r as ResourceId] ?? 0));
        book[r] = Math.max(0, Math.min(max, (book[r] ?? 0) + Number(d))); if (!book[r]) delete book[r]; this.lastModal = ''; break; }
      case 'tq-bp': { const o = this.order; o.bps = o.bps.includes(arg) ? o.bps.filter(x => x !== arg) : [...o.bps, arg]; this.lastModal = ''; break; }
      case 'trade-go': {
        // sell first so the gold is there, then buy, then blueprints; the order empties
        const o = this.order, errs: string[] = [];
        for (const [r, q] of Object.entries(o.sell)) { const e = this.send({ type: 'sell', res: r as ResourceId, n: q }); if (e) errs.push(e); }
        for (const [r, q] of Object.entries(o.buy)) { const e = this.send({ type: 'buy', res: r as ResourceId, n: q }); if (e) errs.push(e); }
        for (const id of o.bps) { const e = this.send({ type: 'buyBlueprint', id }); if (e) errs.push(e); }
        this.order = { key: o.key, buy: {}, sell: {}, bps: [] };
        if (errs.length) this.toast(errs[0]); this.lastModal = ''; break; }
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
    this.root.classList.toggle('panel-open', this.open);
    this.renderHud(w, force);
    this.renderSheet(w, force);
    this.renderModal(w, force);
    this.renderPlaceBar(w);
    (this.root.querySelector('#sheet') as HTMLElement).hidden = !!this.view.placing || this.view.pathMode;
    this.coach(w);
  }

  /**
   * The first-run guide: on a player's first run only, a soft pulse on the next thing to tap until a research desk is
   * built and staffed. No words: the Build tab, then Build new, then the desk, then Place here; once it's built, the
   * Studying chip (or the charter card that holds it), the Staff button and an Assign button.
   */
  private coach(w: World) {
    for (const el of this.root.querySelectorAll('.coach')) el.classList.remove('coach');
    if (this.profile.firstRunDone || this.profile.runs.length || w.status !== 'playing') return;
    const desks = w.buildings.filter(b => b.def === 'desk');
    if (desks.some(b => b.built && workersAt(w, b.uid).length)) { this.profile.firstRunDone = true; this.onProfile(); return; }
    if (w.decisions.length && !this.peeking) return;
    let sel = '';
    if (!desks.length) {
      sel = this.view.placing?.def === 'desk' ? '#placebar [data-act=place-confirm]'
        : !this.open || this.tab !== 'build' || this.detail || this.destination ? '#sheet [data-act=tab][data-arg=build]'
        : this.buildMode !== 'catalog' ? '[data-act=build-mode][data-arg=catalog]' : '#sheet [data-act=build][data-arg=desk]';
    } else if (desks.some(b => b.built)) {
      const desk = desks.find(b => b.built)!;
      sel = this.detail?.kind === 'building' && this.detail.id === desk.uid ? `#sheet [data-act=assign][data-arg$=":${desk.uid}"]`
        : this.destination?.kind === 'research' ? '.rcur [data-act=desk]' : '#hud [data-act=research-open]';
    }
    if (!sel) return;
    let el = this.root.querySelector<HTMLElement>(sel);
    if (sel.includes('research-open') && (!el || !el.offsetParent)) el = this.root.querySelector<HTMLElement>('[data-act=charter-toggle]');
    if (!el) return;
    el.classList.add('coach');
    if (sel !== this.lastCoach) { this.lastCoach = sel; el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  // ---------- HUD ----------
  private renderHud(w: World, force: boolean) {
    const h = hourOfDay(w);
    const hh = String(Math.floor(h)).padStart(2, '0');
    const prog = charterProgress(w);
    const title = prog?.charter.name ?? (w.status === 'won' ? 'Town charter granted' : w.research && !w.charterOffered ? 'The Crown is watching' : 'Awaiting a charter');
    const issueCount = this.rankedIssues(w).length;
    const sc = START;
    const pips = Array.from({ length: sc.collapse.lost }, (_, i) => `<i class="pip${i < lost(w) ? ' on' : ''}"></i>`).join('');
    const r = w.research, cur = r?.current ? RESEARCH_BY_ID[r.current] : undefined;
    const studying = cur ? (Object.keys(researchStillNeeds(w)).length ? 'waiting on goods' : desks(w).some(b => workersAt(w, b.uid).length) ? `${Math.floor((r!.progress / cur.hours) * 100)}%` : 'nobody at the desk') : '';
    const researchChip = !r ? '' : cur ? `<button type="button" class="chip research" data-act="research-open"><span>${icon('desk')}${icon(RESEARCH_ICON[cur.id] ?? 'desk')}<b>${esc(cur.name)}</b> · ${esc(studying)}</span>${meter((r!.progress / cur.hours) * 100,'Research progress')}</button>`
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
    const spoiling = spoilingFood(w) >= 5 && w.owned.includes('storehouse');
    const storeChip = `<button type="button" data-act="workplaces" data-arg="stockpile,storehouse" class="chip store${st >= cap ? ' full' : ''}" title="Goods in storage, of what it can hold">${icon('stockpile')}<b>${Math.floor(st)}/${cap}</b><span class="nm"> stored</span></button>`
      + (spoiling ? '<button type="button" data-act="storage-help" class="chip spoil" title="Food left on stockpiles is spoiling. A storehouse keeps it fresh."><span class="nm">food </span>spoiling →</button>' : '');
    // on a phone the names drop and the icons carry them; they stay for screen readers and on hover
    const goldChip = `<button type="button" data-act="resource" data-arg="gold" class="chip gold" title="Gold: rent each season, the Crown's stipend, events and selling to the caravan" aria-label="${Math.floor(w.gold)} gold">${icon('gold')}<b>${Math.floor(w.gold)}</b><span class="nm"> gold</span></button>`;
    // goods grouped: wood on its own, then raw food, meals, drinks, fine materials and remedies as totals (each opens its
    // breakdown), then whatever the charter counts on its own; "+N" shows every good
    const chip = (arg: string, ico: string, n: number, name: string, cls = '') => `<button type="button" data-act="resource" data-arg="${arg}" class="chip${cls}" title="${esc(name)}" aria-label="${Math.floor(n)} ${esc(name)}">${icon(ico)}<b>${Math.floor(n)}</b><span class="nm"> ${esc(name)}</span></button>`;
    const total = (k: InputKey) => membersOf(k).reduce((n, r) => n + w.res[r], 0);
    const groups = (['rawFood', 'meal', 'drink', 'fine', 'remedy'] as InputKey[]).filter(k => k === 'rawFood' || k === 'meal' || total(k) >= 0.5);
    const grouped = new Set<string>(['wood', ...groups.flatMap(k => membersOf(k))]);
    const pinned = [...new Set(charterRequirements(w).flatMap(r => r.metric.kind === 'stock' && r.metric.resources.length <= 2 ? r.metric.resources : []))].filter(r => r !== 'wood');
    const rest = RESOURCES.filter(r => w.res[r.id] >= 0.5 && r.id !== 'wood' && !(pinned as string[]).includes(r.id) && (this.allGoods || !grouped.has(r.id)));
    const res = goldChip + storeChip + chip('wood', 'wood', w.res.wood, 'Wood')
      + groups.map(k => chip(k, k, total(k), inputName(k).replace(/^./, c => c.toUpperCase()), ' grp')).join('')
      + pinned.map(r => chip(r, r, w.res[r], RESOURCES.find(x => x.id === r)!.name, ' pin')).join('')
      + (this.allGoods ? rest.map(r => chip(r.id, r.id, w.res[r.id], r.name)).join('') : '')
      + (rest.length || this.allGoods ? `<button type="button" class="chip more" data-act="all-goods" aria-pressed="${this.allGoods}" title="${this.allGoods ? 'Fewer goods' : 'Every good'}">${this.allGoods ? '−' : `+${rest.length}`}</button>` : '');
    const html = `
      <div class="bar">
        <div class="clock"><span class="day">Day ${day(w)}</span><span class="when"><span class="time">${hh}:00<span class="phase"> · ${timeOfDay(h)}</span></span><button type="button" data-act="help" data-arg="season" class="season s-${sea.season}" title="${SEASON_NAMES[sea.season]}, day ${sea.dayOf} of ${START.seasons.days}${sea.season !== 'winter' ? `; winter in ${sea.toWinter} days` : ''}">${sea.season === 'autumn' ? `Winter in ${sea.toWinter}d` : `${SEASON_NAMES[sea.season]} ${sea.dayOf}/${START.seasons.days}`}</button></span></div>
        <div class="speeds" role="group" aria-label="Game speed">
          ${[['0', 'Pause'], ['1', '1×'], ['2', '2×'], ['3', '3×']].map(([s, l]) => `<button type="button" data-act="speed" data-arg="${s}" class="${this.speed === Number(s) ? 'on' : ''}" aria-pressed="${this.speed === Number(s)}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="res">${res}</div>
      <section class="status${this.charterCollapsed ? ' is-collapsed' : ''}" aria-label="Charter and colony status">
        <button type="button" class="status-toggle" data-act="charter-toggle" aria-expanded="${!this.charterCollapsed}" aria-controls="colony-status-details" aria-label="${this.charterCollapsed ? 'Expand' : 'Collapse'} charter details: ${esc(title)}">
          <span class="status-heading"><span class="ch-name">${esc(title)}</span><span class="ch-tier">${prog ? `Charter ${w.chartersDone.length + 1}/3 · ${Math.round(prog.ratio * 100)}%` : 'Colony status'}${issueCount ? ` · ⚠ ${issueCount}` : ''}</span></span>
          <svg class="status-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        ${prog ? `<div class="meter" role="progressbar" aria-label="Charter progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(prog.ratio * 100)}"><i style="width:${(prog.ratio * 100).toFixed(1)}%"></i></div>` : ''}
        <div id="colony-status-details" class="status-details" ${this.charterCollapsed ? 'hidden' : ''}>
        <div class="charter">
          ${prog ? `
          ${this.requirementChips(w)}${feastBtn}` : w.research && !w.charterOffered ? `<div class="ch-label">The first charter arrives on the morning of day ${sc.firstCharterDay}.</div>` : ''}
          ${researchChip}${concernCards(w)}
        </div>
        <div class="threats">
          <button type="button" class="strain" data-act="strain-open" title="Frontier strain: a mood penalty that rises every day, faster when people's needs go unmet. Tap for why."><span>Strain</span><b>${strain}</b><small class="rate">▲ ${strainPerDay(w).toFixed(1)}/day</small></button>${this.festivalChip(w)}
          <button type="button" data-act="help" data-arg="loss" class="leavers" title="If ${sc.collapse.lost} settlers leave or die${sc.collapse.minAlive ? `, or only ${sc.collapse.minAlive} remain` : ''}, the colony collapses"><span>Lost</span><div class="pips">${pips}</div></button>
        </div>
        </div>
      </section>
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

  /** the charter while it's under way: one chip per condition (icon, have/need, green when met), then the buildings its
   *  goods still need as tiles marked build / study / draft; chips and build or study tiles go where it can be fixed */
  private requirementChips(w: World) {
    const tile = (s: Route['steps'][number]) => {
      const name = BUILDING_BY_ID[s.def].name;
      const label = s.how === 'build' ? `Build ${name}` : s.how === 'study' ? `Study ${RESEARCH_BY_ID[s.research!].name} for the ${name.toLowerCase()}` : `Draft a ${name.toLowerCase()} blueprint`;
      const inner = `${icon(s.def)}<i class="rb ${s.how}">${ROUTE_GLYPH[s.how]}</i>`;
      return s.how === 'draft' ? `<span class="rtile draft" title="${esc(label)}" role="img" aria-label="${esc(label)}">${inner}</span>`
        : `<button type="button" class="rtile ${s.how}" data-act="catalog-help" data-arg="${s.def}" title="${esc(label)}" aria-label="${esc(label)}">${inner}</button>`;
    };
    const routes = (rs: { good?: InputKey; route: Route }[]) => rs.filter(x => x.route.state !== 'ready').map(x =>
      `<span class="rgroup">${x.good ? icon(x.good) : ''}${x.route.state === 'never' ? `<span class="rtile never" title="Not on this map" role="img" aria-label="Not on this map">${ROUTE_GLYPH.never}</span>` : x.route.steps.map(tile).join('')}</span>`).join('');
    const log = w.moodLog ?? [];
    const mood = Math.round(log.length ? log.reduce((a, b) => a + b, 0) / log.length : avgMood(w));
    return `<div class="req-chips">${charterRequirements(w).map(r => {
      const m = r.metric, met = r.ratio >= 1;
      const act = m.kind === 'stock' || m.kind === 'variety' ? 'resource' : m.kind === 'built' || m.kind === 'monument' ? 'catalog-help' : m.kind === 'everyoneBed' || m.kind === 'healthy' || m.kind === 'allTable' || m.kind === 'longTable' ? 'need' : 'tab';
      const arg = m.kind === 'stock' ? m.resources[0] : m.kind === 'variety' ? m.category : m.kind === 'built' || m.kind === 'monument' ? m.def : m.kind === 'everyoneBed' ? 'shelter' : m.kind === 'healthy' ? 'health' : m.kind === 'allTable' || m.kind === 'longTable' ? 'table' : 'colonists';
      const cat = m.kind === 'stock' ? Object.entries(CATEGORY_MEMBERS).find(([, ms]) => ms.length === m.resources.length && ms.every(x => m.resources.includes(x)))?.[0] : undefined;
      const [ico, text] = m.kind === 'population' ? [PERSON_GLYPH, `${r.value}/${r.target}`]
        : m.kind === 'avgMood' ? [MOOD_GLYPH, `${mood}/${m.amount}`]
        : m.kind === 'stock' ? [icon(cat ?? m.resources[0]), `${Math.floor(r.value)}/${r.target}`]
        : m.kind === 'variety' ? [icon(m.category), `${CATEGORY_MEMBERS[m.category].filter(x => w.res[x] >= m.each).length}/${m.kinds}`]
        : m.kind === 'built' ? [icon(m.def), `${r.value}/${r.target}`]
        : m.kind === 'everyoneBed' ? [icon('leanto'), `${r.value}/${r.target}`]
        : m.kind === 'allTable' ? [icon('dining'), `${r.value}/${r.target}h`]
        : m.kind === 'healthy' ? [icon('clinic'), `${r.value}/${r.target}h`]
        : m.kind === 'monument' ? [icon(m.def), `${Math.min(Math.floor(r.value), r.target)}/${r.target}`]
        : m.kind === 'longTable' ? [icon('dining'), w.feast?.done ? '✓' : `${feastCheck(w).served}/${m.pop}`]
        : ['', esc(r.label)];
      const chip = `<button type="button" class="rchip${met ? ' met' : ''}" data-act="${act}" data-arg="${arg}" title="${esc(r.label)}" aria-label="${esc(r.label)}">${ico}<b>${text}</b></button>`;
      const tiles = met ? '' : routes(metricRoutes(w, m));
      return tiles ? `<span class="req">${chip}<span class="rarrow" aria-hidden="true">›</span>${tiles}</span>` : `<span class="req">${chip}</span>`;
    }).join('')}</div>`;
  }

  private helpCard(w: World) {
    const sea = seasonOf(w);
    let title = 'Colony help', body = '';
    if (this.help === 'season') {
      title = `${SEASON_NAMES[sea.season]} · day ${sea.dayOf}/${START.seasons.days}`;
      body = `<p class="lede">${sea.season === 'winter' ? `Heating needs about ${Math.round(winterFuelPerDay(w))} wood/day.` : `Winter in ${sea.toWinter} days · heating will need about ${Math.round(winterFuelPerDay(w,true))} wood/day.`}</p><div class="actions"><button type="button" class="ghost" data-act="need" data-arg="warmth">Warm homes →</button><button type="button" class="ghost" data-act="need" data-arg="fresh">Fresh food →</button><button type="button" class="ghost" data-act="need" data-arg="drink">Drinks →</button></div><p class="terms">Spring: ${START.seasons.springFresh ? 'fresh food' : 'crops and fishing recover; mud slows travel'}. Summer: drinks. Autumn: harvest festival. Winter: warm homes. Expectations grow with town standing.</p>`;
    } else if (this.help === 'loss') {
      title = `${lost(w)}/${START.collapse.lost} settlers lost`;
      body = `<p class="lede">The colony collapses at ${START.collapse.lost} lost settlers or ${START.collapse.minAlive} survivors.</p><ul class="thoughts">${w.colonists.filter(c => c.left).map(c=>`<li><span>${esc(c.name)}</span><b>${c.died ? 'Died' : 'Left'}</b></li>`).join('') || '<li>No settlers lost.</li>'}</ul>`;
    } else {
      title = 'Recipes'; body = '<p class="lede">Workers try enabled recipes in priority order when a complete batch is possible. Use ↑/↓ to reorder; stars show efficiency. Switch a recipe off to reserve its ingredients.</p>';
    }
    return `<div class="card-wrap"><p class="eyebrow">Help</p><h2>${title}</h2>${body}<button type="button" class="ghost skip" data-act="help-close">Close</button></div>`;
  }

  private strainCard(w: World) {
    const comfort = colonyComfort(w);
    const gaps = comfortGaps(w);
    const st = standingOf(w), sea = seasonOf(w);
    const next = st + 1 < STANDINGS.length ? activeNeeds(w, st + 1).filter(k => !activeNeeds(w).includes(k)) : [];
    const nextLine = st + 1 < STANDINGS.length ? `<p class="terms">At the next charter the town becomes a <b>${STANDINGS[st + 1].toLowerCase()}</b>, and people expect more${next.length ? `: ${next.map(k => NEED_NAMES[k].toLowerCase()).join(', ')} start to count` : ''}${st + 1 >= 2 ? ', a shack counts half, and meals want a table' : ', and cooked meals replace any old food'}.</p>` : `<p class="terms">A village expects the most it ever will${START.seasons.stricterFromYear > 0 ? ', though from the second year everyone gets a little pickier' : ''}.</p>`;
    const seasonLine = sea.season === 'winter' ? `Winter: everyone needs a warm home. Homes and the hearth burn about ${Math.round(winterFuelPerDay(w))} wood a day.`
      : sea.season === 'autumn' ? `Autumn: winter in ${sea.toWinter} day${sea.toWinter === 1 ? '' : 's'}. Homes and the hearth will burn about ${Math.round(winterFuelPerDay(w, true))} wood a day, and people expect a harvest festival first.`
      : sea.season === 'spring' && st >= 1 ? (START.seasons.springFresh ? 'Spring: people want something fresh now and then: berries, apples, fish or skewers.' : 'Spring: home heating ends, crops return, and fishing improves. Mud slows off-path travel and construction.')
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
      return `<button type="button" class="row${c.id === e.assignee ? ' chosen' : ''}" data-act="errand-send" data-arg="${e.id}:${c.id}">${avatar(c)}<span class="who"><b>${esc(c.name)}</b><small>${esc(note)}</small></span><span class="add">${c.id === e.assignee ? 'Sent' : 'Send'}</span></button>`;
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
      ${(['colonists', 'build', 'ledger', 'issues', 'log', 'menu'] as Tab[]).map(t => { const n = t === 'colonists' ? pop.length : t === 'issues' ? this.rankedIssues(w).length : 0;
        return `<button type="button" data-act="tab" data-arg="${t}" class="${this.tab === t && this.open ? 'on' : ''}"${this.tab === t && this.open ? ' aria-current="page"' : ''}><span class="tico">${TAB_GLYPH[t]}${n ? `<em class="${t === 'issues' ? 'warn' : ''}">${n}</em>` : ''}</span><span class="tl">${TAB_NAME[t]}</span></button>`; }).join('')}
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
      else if (this.tab === 'menu') body = this.menuView(w);
      else body = this.logList(w);
    }
    const html = tabs + (this.open ? `<div class="sheet-body">${body}</div>` : '');
    const el = this.root.querySelector('#sheet') as HTMLElement;
    if (force || html !== this.lastSheet) {
      const scroller = el.querySelector('.sheet-body');
      if (this.sheetKey) this.sheetScroll.set(this.sheetKey, scroller?.scrollTop ?? 0);
      const key = this.detail ? `${this.detail.kind}:${this.detail.id}` : `${this.tab}:${JSON.stringify(this.destination)}:${this.peopleFilter?.join(',') ?? ''}:${this.colonistFilter}:${this.colonistSort}:${this.buildMode}:${this.buildingFilter}:${this.catalogGroup}:${this.resource}`;
      replaceMarkup(el, html, key === this.sheetKey); this.lastSheet = html; this.sheetKey = key;
      const s2 = el.querySelector('.sheet-body'); if (s2) s2.scrollTop = this.sheetScroll.get(key) ?? 0;
    }
    el.classList.toggle('open', this.open);
    if (this.anchor) { const target = el.querySelector<HTMLElement>(`#${this.anchor}`); target?.closest('details')?.setAttribute('open', ''); if (target) { const scroller = el.querySelector('.sheet-body')!; scroller.scrollTop = target.offsetTop - (scroller as HTMLElement).offsetTop; } this.anchor = null; }
  }

  private colonistList(w: World) {
    const rows = alive(w).filter(c => (!this.peopleFilter || this.peopleFilter.includes(c.id)) && matchesPerson(c, this.colonistFilter)).sort((a, b) => this.colonistSort === 'name' ? a.name.localeCompare(b.name) : a.mood - b.mood || a.id - b.id).map(c => {
      const partner = colonistById(w, c.partner);
      const job = buildingByUid(w, c.job), state = personState(c);
      return `<button type="button" class="row person" data-act="colonist" data-arg="${c.id}" aria-label="${esc(`${c.name}, ${job ? BUILDING_BY_ID[job.def].name : 'laborer'}, mood ${Math.round(c.mood)}${state ? `, ${state}` : ''}`)}">
        ${avatar(c)}
        <span class="who"><b>${esc(c.name)}${partner ? ' <i class="heart" aria-hidden="true">♥</i>' : ''}</b><small class="job-line">${job ? `${icon(job.def)}${esc(BUILDING_BY_ID[job.def].name)}` : `${LABORER_GLYPH}Laborer`}</small></span>
        ${state ? `<span class="flag" title="${esc(state)}">${esc(state.split(' ')[0])}</span>` : '<span></span>'}
        <span class="mood ${moodClass(c.mood, c.sulking)}"><b><span class="trend">${MOOD_TREND[moodDirection(c)]}</span>${Math.round(c.mood)}</b><i style="width:${c.mood}%"></i></span>
      </button>`;
    }).join('');
    return `<div class="list-head"><span class="stats"><span title="Colonists">${PERSON_GLYPH}${alive(w).length}</span><span title="Beds">${icon('leanto')}${beds(w)}</span><span title="Laborers: build, haul, clean">${LABORER_GLYPH}${laborers(w).length}</span><span title="Average mood">${MOOD_GLYPH}${Math.round(avgMood(w))}</span></span>
      <button type="button" class="ghost" data-act="auto">Auto-assign jobs</button></div>
      <div class="filters">${selectHtml('colonist-filter', 'Show colonists', this.colonistFilter, [['all','Everyone'],['ill','Ill'],['hungry','Hungry'],['unhoused','No bed'],['sulking','Sulking'],['free','No job']])}${selectHtml('colonist-sort', 'Sort colonists', this.colonistSort, [['mood','Lowest mood'],['name','Name']])}</div>${concernCards(w)}${this.peopleFilter ? '<button type="button" class="ghost" data-act="tab" data-arg="colonists">Show everyone</button>' : ''}<div class="rows">${rows || '<p class="empty">No matching colonists.</p>'}</div>
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
    const thoughts = c.thoughts.map(t => `<li class="${t.value >= 0 ? 'pos' : 'neg'}${t.label.startsWith('The frontier') ? ' wear' : ''}"><span>${logText(w,t.label)}</span><b>${t.value > 0 ? '+' : '−'}${Math.abs(Math.round(t.value))}</b></li>`).join('');
    const others = alive(w).filter(o => o.id !== c.id).map(o => ({ o, v: opinion(w, c.id, o.id) }));
    const friends = others.filter(x => x.v > 25).sort((a, b) => b.v - a.v).slice(0, 3);
    const rivals = others.filter(x => x.v < -25).sort((a, b) => a.v - b.v).slice(0, 3);
    const partner = colonistById(w, c.partner);
    const rel = [
      partner ? `<button type="button" class="rel love" data-act="colonist" data-arg="${partner.id}">${avatar(partner,'avatar-mini')} ♥ ${esc(first(partner))} →</button>` : '',
      ...friends.map(x => `<button type="button" class="rel friend" data-act="colonist" data-arg="${x.o.id}">${avatar(x.o,'avatar-mini')} ♥ ${esc(first(x.o))} →</button>`),
      ...rivals.map(x => `<button type="button" class="rel rival" data-act="colonist" data-arg="${x.o.id}">${avatar(x.o,'avatar-mini')} × ${esc(first(x.o))} →</button>`),
    ].join('') || '<span class="muted">No strong feelings about anyone yet.</span>';
    const job = buildingByUid(w, c.job);
    const jobs = built(w).filter(b => BUILDING_BY_ID[b.def].slots > 0).map(b => {
      const def = BUILDING_BY_ID[b.def];
      const n = workersAt(w, b.uid).length, full = n >= def.slots && c.job !== b.uid;
      const fit = def.job === c.likes ? ' likes' : def.job === c.dislikes ? ' dislikes' : '';
      return `<button type="button" class="job${c.job === b.uid ? ' on' : ''}${fit}" data-act="assign" data-arg="${c.id}:${b.uid}" ${full ? 'disabled' : ''}><span class="jn">${icon(def.id)}${esc(def.name)}</span><small>${def.job ? `${SKILL_NAMES[def.job]} ${Math.floor(c.skills[def.job])} · ` : ''}${n}/${def.slots}${fit === ' likes' ? ' · loves this' : fit === ' dislikes' ? ' · hates this' : ''}</small></button>`;
    }).join('');
    const illness = c.illness ? `<section class="urgent"><b>✚ ${esc(c.illness.name)} · ${Math.round(c.illness.severity)}/100</b>${meter(c.illness.severity, 'Illness severity')}<div class="actions"><button type="button" class="ghost" data-act="need" data-arg="health">${esc(buildingDestination(w, 'clinic', true).label)} →</button></div><small>${c.illness.contagious ? 'At 100, this illness can be fatal.' : 'At 100, leaves for treatment.'}</small></section>` : '';
    const personalFixes = assess(w).filter(issue=>issue.personIds.includes(c.id) && issue.fixes.length).slice(0,2);
    const remedies = personalFixes.map(issue=>`<button type="button" class="ghost" data-act="fix" data-arg="${issue.id}:0">${esc(fixDestination(w,issue.fixes[0]).label)} →</button>`).join('');
    const worst = [...c.thoughts].filter(t => t.value < 0 && !t.label.startsWith('The frontier')).sort((a,b) => a.value - b.value)[0];
    return `<div class="detail">
      <div class="d-head"><button type="button" class="ghost back" data-act="back">← Colonists</button></div>
      <div class="who-big">${avatar(c,'avatar-large')}<div><h2>${esc(c.name)}</h2><p>${esc(activityText(w, c))}</p></div>
        <div class="mood-big ${moodClass(c.mood, c.sulking)}" title="Mood ${Math.round(c.mood)}, heading to ${Math.round(c.moodTarget)}"><b>${Math.round(c.mood)}</b>${MOOD_TREND[moodDirection(c)] ? `<small>${MOOD_TREND[moodDirection(c)]} ${Math.round(c.moodTarget)}</small>` : ''}</div></div>
      ${c.sulking ? '<p class="warnline">☁ Sulking · works again above mood 32</p>' : c.mood < 15 ? '<p class="warnline">⚠ May leave</p>' : ''}${illness}
      ${worst ? `<p class="warnline">${logText(w,worst.label)} <b>−${Math.abs(Math.round(worst.value))}</b></p>` : ''}
      <div class="actions">${remedies}${job ? `<button type="button" class="ghost" data-act="building" data-arg="${job.uid}">${icon(job.def)} ${esc(BUILDING_BY_ID[job.def].name)} →</button>` : ''}${c.bed != null ? `<button type="button" class="ghost" data-act="building" data-arg="${c.bed}">⌂ Home →</button>` : '<button type="button" class="ghost" data-act="need" data-arg="shelter">⌂ Find a bed →</button>'}<button type="button" class="ghost" data-act="jobs">⚒ Change job ↓</button></div>
      <p class="prefs">${icon('coats')} ${(c.coatHours ?? 0) > 0 ? `${c.coatStoredAt != null ? 'Coat stored' : 'Warm coat'} · ${Math.ceil(c.coatHours! / 24)} days of wear` : 'No coat · collects one in winter'} <button type="button" class="text-link" data-act="source" data-arg="coats">Coat supply →</button></p>
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
      // one row per kind of building: count, workers or capacity, and the worst problem first; sites on top
      const sites = buildings.filter(b => !b.built);
      const groups = new Map<string, Building[]>();
      for (const b of buildings.filter(b => b.built)) groups.set(b.def, [...(groups.get(b.def) ?? []), b]);
      const rows = [...groups].map(([def, bs]) => {
        const d = BUILDING_BY_ID[def], st = bs.map(b => buildingStatus(w, b)), warn = st.find(x => x.warning);
        const workers = d.slots ? bs.reduce((n, b) => n + workersAt(w, b.uid).length, 0) : 0;
        const summary = d.slots ? `${workers}/${d.slots * bs.length}` : d.beds ? `${d.beds * bs.length} beds` : d.storage ? st.length === 1 ? st[0].label : `${bs.reduce((n, b) => n + Math.floor(Object.values(b.stock).reduce((m, x) => m + (x ?? 0), 0)), 0)}/${d.storage * bs.length}` : d.seats ? `${d.seats * bs.length} seats` : '';
        return { def, bs, warn, html: `<button type="button" class="row bgroup${warn ? ' has-warn' : ''}" ${bs.length === 1 ? `data-act="building" data-arg="${bs[0].uid}"` : `data-act="workplaces" data-arg="${def}"`}>
          <span class="bg-ico">${icon(def) || (def === 'hearth' ? HEARTH_GLYPH : '')}</span><span class="who"><b>${esc(d.name)}${bs.length > 1 ? ` <em>×${bs.length}</em>` : ''}</b>${warn ? `<small class="warnlabel">⚠ ${esc(warn.label)}${st.filter(x => x.warning).length > 1 ? ` ×${st.filter(x => x.warning).length}` : ''}</small>` : ''}</span>
          <span class="bg-sum">${d.slots ? `${PERSON_GLYPH}` : ''}${esc(summary)}</span></button>` };
      }).sort((a, b) => Number(!!b.warn) - Number(!!a.warn) || BUILDINGS.findIndex(x => x.id === a.def) - BUILDINGS.findIndex(x => x.id === b.def));
      return mode + `<div class="filters">${selectHtml('building-filter','Show buildings',this.buildingFilter,[['all','All buildings'],['unstaffed','Open jobs'],['blocked','Blocked'],['inefficient','Low efficiency'],['sites','Construction']])}</div>
        ${sites.length ? `<div class="rows">${sites.map(b => this.siteRow(w, b)).join('')}</div>` : ''}<div class="rows">${rows.map(r => r.html).join('') || (sites.length ? '' : '<p class="empty">No matching buildings.</p>')}</div>`;
    }
    const matches = (d: typeof BUILDING_BY_ID[string]) => this.catalogGroup === 'all' || buildingGroup(d.id) === this.catalogGroup;
    const short = (def: typeof BUILDING_BY_ID[string]) => Object.entries(def.cost).some(([k, n]) => stockOf(w, k as InputKey) < (n ?? 0));
    const outputs = (def: typeof BUILDING_BY_ID[string]) => [...new Set((def.recipes ?? []).map(r => r.output))].map(o => icon(o)).join('');
    const card = (def: typeof BUILDING_BY_ID[string]) => `<div class="bp compact${short(def) ? ' short' : ''}"><details data-key="catalog-${def.id}"><summary><span class="bp-ico">${icon(def.id,'bico')}</span><span class="bp-main"><b>${esc(def.name)}</b><small class="cost">${costHtml(def.cost,w)}${outputs(def) ? `<span class="outs" aria-label="makes">${outputs(def)}</span>` : ''}</small></span></summary><p>${esc(def.blurb)}</p></details><button type="button" class="place" data-act="build" data-arg="${def.id}" aria-label="Place ${esc(def.name)}">${ROUTE_GLYPH.build}</button></div>`;
    const missing = BUILDINGS.filter(d => !w.owned.includes(d.id) && matches(d)).map(d => {
      const r = researchLeft(w).find(r => r.unlocks.includes(d.id));
      return `<button type="button" class="row compact" data-act="catalog-help" data-arg="${d.id}"><span class="who"><b>${icon(d.id)} ${esc(d.name)}</b><small>${r ? `Research ${esc(r.name)}` : 'Blueprint needed'}</small></span><span>→</span></button>`;
    }).join('');
    return mode + `${(['food','work','comfort','storage'] as const).map(g => { const defs = w.owned.map(id => BUILDING_BY_ID[id]).filter(d => buildingGroup(d.id) === g); return defs.length ? `<h3 class="group">${CATALOG_GROUP[g]}</h3><div class="bps">${defs.map(card).join('')}</div>` : ''; }).join('')}<h3>Paths</h3><div class="bp"><div><b>Paths</b><small>+25% walking · 1 wood/tile</small></div><button type="button" class="act" data-act="paths">Plan</button></div><details data-key="missing-buildings"><summary>Unlocks & missing blueprints</summary><div class="rows">${missing}</div></details>`;
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
      if (el.innerHTML !== html) replaceMarkup(el, html);
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
    if (el.innerHTML !== html) replaceMarkup(el, html);
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
      return `<div class="detail"><div class="d-head"><button type="button" class="ghost back" data-act="back">← Buildings</button></div>
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
    // one row per recipe, in the order they're tried: order arrows, stars, inputs → output, the stock target, and a checkbox.
    // The one being made is tinted; one that's waiting rings the missing input and shows what would make it.
    const blocked0 = blockedReason(w, b);
    let recipe = !recs.length ? '' : `<h3>Recipes</h3><div class="recipes">${orderedRecipes(b).map(({r, i}, position) => {
          const on = recipeOn(b, i), now = on && r === cur && !blocked0;
          const missing = Object.keys(r.inputs).filter(k => on && membersOf(k as InputKey).reduce((n, x) => n + w.res[x] + (b.inbox[x] ?? 0), 0) < (r.inputs[k as InputKey] ?? 0)) as InputKey[];
          const waiting = on && (missing.length > 0 || (r === cur && !!blocked0));
          const route = missing.length ? metricRoutes(w, { kind: 'stock', resources: membersOf(missing[0]), amount: 1 })[0]?.route : undefined;
          const tiles = route && route.state !== 'ready' ? route.state === 'never' ? `<span class="rtile never" title="Not on this map" role="img" aria-label="Not on this map">${ROUTE_GLYPH.never}</span>` : route.steps.map(st => { const name = BUILDING_BY_ID[st.def].name; const label = st.how === 'build' ? `Build ${name}` : st.how === 'study' ? `Study ${RESEARCH_BY_ID[st.research!].name}` : `Draft a ${name.toLowerCase()}`;
            const inner = `${icon(st.def)}<i class="rb ${st.how}">${ROUTE_GLYPH[st.how]}</i>`;
            return st.how === 'draft' ? `<span class="rtile draft" title="${esc(label)}" role="img" aria-label="${esc(label)}">${inner}</span>` : `<button type="button" class="rtile ${st.how}" data-act="catalog-help" data-arg="${st.def}" title="${esc(label)}" aria-label="${esc(label)}">${inner}</button>`; }).join('') : '';
          const ins = Object.entries(r.inputs).map(([k, n]) => `<button type="button" class="rin${missing.includes(k as InputKey) ? ' missing' : ''}" data-act="source" data-arg="${k}" title="${esc(inputName(k as InputKey))}: where it comes from">${icon(k)}<b>${+(n ?? 0).toFixed(2)}</b></button>`).join('');
          const limit = b.productionLimits?.[r.output];
          return `<div class="rrow${now ? ' making' : waiting ? ' waiting' : ''}${on ? '' : ' off'}">
            <div class="rmain"><span class="rorder"><button type="button" data-act="recipe-priority" data-arg="${b.uid}:${i}:-1" aria-label="Try ${esc(inputName(r.output))} earlier" ${position === 0 ? 'disabled' : ''}>${CHEVRON_UP}</button><button type="button" data-act="recipe-priority" data-arg="${b.uid}:${i}:1" aria-label="Try ${esc(inputName(r.output))} later" ${position === recs.length - 1 ? 'disabled' : ''}>${CHEVRON_DOWN}</button></span>
              <span class="rbody">${starHtml(r.stars)}${ins ? `<span class="rins">${ins}</span>${ARROW_GLYPH}` : ''}<span class="rout" title="${esc(inputName(r.output))} · ${+recipeRate(r).toFixed(2)} per worker-hour">${icon(r.output)}${now ? '<i class="rnow" aria-label="Making now"></i>' : ''}</span></span>
              <label class="rtarget" title="Stop at this many in storage (blank: no limit)">${TARGET_GLYPH}<span>${Math.floor(w.res[r.output])}/</span><input type="number" min="0" step="1" placeholder="∞" aria-label="Stock target for ${esc(inputName(r.output))}" data-act="production-target" data-arg="${b.uid}:${r.output}" data-production-limit data-building="${b.uid}" data-output="${r.output}" value="${limit ?? ''}"></label>
              <button type="button" class="rcheck" role="checkbox" aria-checked="${on}" data-act="recipe-toggle" data-arg="${b.uid}:${i}" aria-label="Make ${esc(inputName(r.output))}"><span>${on ? CHECK_GLYPH : ''}</span></button></div>
            ${waiting && missing.length ? `<div class="rwait">${missing.map(k => `<span class="rno">${icon(k)}${esc(inputName(k))}</span>`).join('')}${tiles}</div>` : ''}
          </div>`;
        }).join('')}</div>`;
    const effLine = def.needs ? `<p class="prefs">Site ${Math.round(b.eff * 100)}% · ${esc(efficiencyAt(w, b.def, b.x, b.y, b.rot).label)}</p>${meter(b.eff * 100, 'Site efficiency')}` : '';
    const inboxLine = recs.some(r => Object.keys(r.inputs).length) ? `<details data-key="buffers-${b.uid}"><summary>Workshop buffers · ${Math.ceil(Object.values(b.inbox).reduce((n,x)=>n+(x??0),0))}/${INPUT_CAPACITY} in · ${Math.ceil(Object.values(b.outbox).reduce((n,x)=>n+(x??0),0))}/${OUTBOX_CAP} out</summary><p class="prefs">${Object.entries(b.inbox).filter(([,n])=>(n??0)>=0.5).map(([r,n])=>goodHtml(r as ResourceId,Math.floor(n??0))).join(', ') || 'No inputs'} · complete batches are collected; unused inputs return to storage.</p></details>` : '';
    const blocked = blockedReason(w, b);
    const remedyLine = def.patients ? `<details data-key="clinic-remedies"><summary>Remedies · ${Math.floor(w.res.tonic + w.res.poultice)} stored</summary><p class="prefs">Remedies in storage: ${w.res.tonic >= 0.5 || w.res.poultice >= 0.5 ? `${Math.floor(w.res.tonic)} tonic, ${Math.floor(w.res.poultice)} poultice. The doctor uses one up every few hours of treatment: a poultice heals faster and halves botched treatments, a tonic heals faster still and never botches.` : '<b>none</b>. An apothecary makes poultices and tonics that help the doctor.'}</p><button type="button" class="text-link" data-act="source" data-arg="remedy">Remedy sources →</button></details>` : '';
    const admissions = def.patients && START.clinicTriage ? clinicAdmissions(w) : null;
    const waiting = admissions ? alive(w).filter(c=>bedridden(c)&&!admissions.has(c.id)) : [];
    const waitLine = waiting.length ? `<p class="warnline">Waiting for beds: ${waiting.map(c=>`${personLink(c)} · ${Math.round(c.illness!.severity)}`).join(', ')}</p>` : '';
    const patients = def.patients ? `<p class="prefs">Patients: ${patientsAt(w,b).map(c=>`${personLink(c)} · ${esc(c.illness!.name)} ${Math.round(c.illness!.severity)}${c.goalReached ? '' : ' · arriving'}`).join(', ') || 'None'}</p>${START.clinicTriage ? '<p class="muted">Fatal illnesses take priority. Treatment needs a healthy doctor.</p>' : ''}` : '';
    let staff = (blocked ? `<p class="warnline">${esc(blocked)}</p>` : '') + effLine + inboxLine + patients + waitLine + remedyLine + (b.def === 'desk' ? this.deskLines(w) : '');
    if (def.slots) {
      const cur = workers.map(c => `<div class="row static">${avatar(c)}<span class="who">${personLink(c,false)}<small>${def.job ? `${SKILL_NAMES[def.job]} ${Math.floor(c.skills[def.job])} · ` : ''}${def.job === c.likes ? 'loves this job' : def.job === c.dislikes ? 'hates this job' : 'doesn’t mind it'}</small></span><button type="button" class="ghost" data-act="assign" data-arg="${c.id}:none">Remove</button></div>`).join('');
      const cand = workers.length < def.slots ? alive(w).filter(c => c.job !== b.uid).sort((a, z) => (def.job ? z.skills[def.job] - a.skills[def.job] : 0) + (Number(z.likes === def.job) - Number(a.likes === def.job)) * 2).map(c => {
        const cw = buildingByUid(w, c.job);
        return `<div class="row static">${avatar(c)}<span class="who">${personLink(c,false)}<small>${def.job ? `${SKILL_NAMES[def.job]} ${Math.floor(c.skills[def.job])} · ` : ''}${cw ? `now at ${esc(BUILDING_BY_ID[cw.def].name)}` : 'laborer'}${c.likes === def.job ? ' · loves this' : c.dislikes === def.job ? ' · hates this' : ''}</small></span><button type="button" class="ghost" data-act="assign" data-arg="${c.id}:${b.uid}" ${bedridden(c) || c.sulking || c.errand != null ? 'disabled' : ''}>${bedridden(c) ? 'Ill' : c.sulking ? 'Sulking' : c.errand != null ? 'On errand' : 'Assign'}</button></div>`;
      }).join('') : '';
      staff += `<h3>Workers ${workers.length}/${def.slots}</h3><div class="rows">${cur || '<p class="muted">Nobody works here.</p>'}</div>${cand ? `<h3>Assign someone</h3><p class="muted">⚒ ${laborers(w).length} laborers free · keep hands for hauling.</p><div class="rows">${cand}</div>` : ''}`;
    } else if (def.storage) {
      // what's in it first: a capacity bar split by kind of good, then a tile per good with its count, largest first
      const held = Object.values(b.stock).reduce((n, x) => n + (x ?? 0), 0);
      const goods = RESOURCES.filter(r => (b.stock[r.id] ?? 0) >= 0.5).sort((a, z) => (b.stock[z.id] ?? 0) - (b.stock[a.id] ?? 0));
      const spoils = !def.keepsFresh && FOODS.some(f => accepts(b, f));
      const bar = `<div class="store-bar" role="img" aria-label="${Math.floor(held)} of ${def.storage} stored">${goods.map(r => `<i class="k-${r.kind}" style="width:${((b.stock[r.id] ?? 0) / (def.storage ?? 1) * 100).toFixed(2)}%" title="${esc(r.name)} ${Math.floor(b.stock[r.id] ?? 0)}"></i>`).join('')}</div>`;
      const tiles = goods.map(r => { const n = Math.floor(b.stock[r.id] ?? 0), rot = spoils && FOODS.includes(r.id);
        return `<div class="stile k-${r.kind}${rot ? ' rot' : ''}" title="${esc(r.name)}${rot ? ' · spoiling here' : ''}">${icon(r.id)}<b>${n}</b><small>${esc(r.name)}</small>${rot ? `<i class="rot-mark" aria-label="spoiling">${SPOIL_GLYPH}</i>` : ''}</div>`; }).join('');
      const mode = !b.allow ? 'all' : b.allow.length === FOODS.length && FOODS.every(f => b.allow!.includes(f)) ? 'food' : b.allow.length === GOODS.length && GOODS.every(f => b.allow!.includes(f)) ? 'goods' : 'custom';
      const preset = (id: string, label: string) => `<button type="button" class="seg${mode === id ? ' on' : ''}" data-act="store-preset" data-arg="${b.uid}:${id}" aria-pressed="${mode === id}">${label}</button>`;
      const items = RESOURCES.map(r => { const on = accepts(b, r.id); return `<button type="button" class="ptile${on ? ' on' : ''}" data-act="store-item" data-arg="${b.uid}:${r.id}" aria-pressed="${on}" title="${esc(r.name)}" aria-label="${on ? 'Accepting' : 'Not accepting'} ${esc(r.name)}">${icon(r.id)}</button>`; }).join('');
      staff += `<div class="store-head"><span class="store-num"><b>${Math.floor(held)}</b>/${def.storage}</span>${spoils ? `<span class="fresh bad" title="Raw food and meals spoil here">${SPOIL_GLYPH} Food spoils</span>` : def.keepsFresh ? `<span class="fresh good" title="Keeps food fresh">${FRESH_GLYPH} Keeps fresh</span>` : ''}</div>${bar}
        <div class="stiles">${tiles || '<p class="empty">Empty</p>'}</div>
        <div class="store-set"><h3>Priority</h3><div class="segs">${([[2, 'High'], [1, 'Medium'], [0, 'Low']] as const).map(([v, l]) => `<button type="button" class="seg${storePrio(b) === v ? ' on' : ''}" data-act="store-prio" data-arg="${b.uid}:${v}" aria-pressed="${storePrio(b) === v}">${l}</button>`).join('')}</div></div>
        <div class="store-set"><h3>Takes</h3><div class="segs">${preset('all', 'All')}${preset('food', 'Food')}${preset('goods', 'Goods')}</div></div>
        <details data-key="storage-items-${b.uid}"${mode === 'custom' ? ' open' : ''}><summary>Pick items${mode === 'custom' ? ` · ${b.allow!.length}` : ''}</summary><div class="ptiles">${items}</div></details>`;
    } else if (def.beds) {
      const sleepers = alive(w).filter(c => c.bed === b.uid).map(c => personLink(c)).join(', ');
      staff += `<p class="prefs">Sleeps ${def.beds}${sleepers ? `: ${sleepers}` : ''}.</p>`;
    }
    return `<div class="detail"><div class="d-head"><button type="button" class="ghost back" data-act="back">← Buildings</button></div>
      <h2 class="bh">${icon(def.id, 'hico')}${esc(def.name)}</h2><p class="blurb">${esc(def.blurb)}</p>${recipe}${staff}</div>`;
  }

  private deskLines(w: World) {
    const r = w.research; if (!r) return '';
    const cur = r.current ? RESEARCH_BY_ID[r.current] : undefined;
    const done = r.done.map(id => RESEARCH_BY_ID[id].name).join(', ');
    if (!cur) return `<button type="button" class="ghost" data-act="research-open">${icon('desk')} Research tree →</button>`;
    const need = researchStillNeeds(w);
    const goods = Object.entries(cur.cost).map(([k, n]) => { const left = need[k as InputKey] ?? 0; const nm = inputName(k as InputKey); return `<li><button type="button" class="text-link" data-act="source" data-arg="${k}">${icon(k)}${esc(nm.charAt(0).toUpperCase() + nm.slice(1))} →</button><b>${Math.floor((n ?? 0) - left)} / ${n}</b></li>`; }).join('');
    return `<h3>Studying ${esc(cur.name)}</h3><p class="prefs">${esc(cur.desc)} ${cur.unlocks.length ? `Unlocks <b>${esc(cur.unlocks.map(u => BUILDING_BY_ID[u].name.toLowerCase()).join(' and '))}</b>.` : `<b>${esc(cur.effect ?? '')}</b>`}</p>
      <ul class="thoughts">${goods}<li><span>Study</span><b>${Math.floor(r.progress)} / ${cur.hours} hours</b></li></ul>
      <button type="button" class="ghost" data-act="research-open">${icon('desk')} Research tree →</button>`;
  }

  /** the research screen: what's being studied, then the basics and each branch as tiles; pick one to see it and study it now */
  private researchView(w: World) {
    const r = w.research; if (!r) return '';
    const open = new Set(researchOpen(w).map(x => x.id));
    const state = (id: string) => r.done.includes(id) ? 'done' : r.current === id ? 'now' : open.has(id) ? 'open' : 'locked';
    const pct = (id: string) => { const x = RESEARCH_BY_ID[id]; const h = r.current === id ? r.progress : r.partial?.[id] ?? 0; return Math.min(100, h / x.hours * 100); };
    const pick = this.researchPick;
    const node = (id: string) => { const x = RESEARCH_BY_ID[id], st = state(id), p = pct(id);
      return `<button type="button" class="rn ${st}${pick === id ? ' sel' : ''}" data-act="research-pick" data-arg="${id}" aria-pressed="${pick === id}" title="${esc(x.name)}"><span class="rn-t">${icon(RESEARCH_ICON[id] ?? 'desk')}${st === 'done' ? `<i class="rn-b done">${CHECK_GLYPH}</i>` : st === 'locked' ? `<i class="rn-b lock">${LOCK_GLYPH}</i>` : ''}${p > 0 && st !== 'done' ? `<i class="rn-p"><b style="width:${p.toFixed(0)}%"></b></i>` : ''}</span><span class="rn-l">${esc(x.name)}</span></button>`; };
    const cur = r.current ? RESEARCH_BY_ID[r.current] : undefined;
    const need = researchStillNeeds(w);
    const goods = (x: typeof RESEARCH[number], delivered: boolean) => Object.entries(x.cost).map(([k, n]) => { const left = delivered ? need[k as InputKey] ?? 0 : n ?? 0; const got = (n ?? 0) - left;
      return `<span class="ifact${delivered && got >= (n ?? 0) ? ' ok' : ''}">${icon(k)}${delivered ? `${Math.floor(got)}/` : ''}${n}</span>`; }).join('');
    const scholar = desks(w).flatMap(b => workersAt(w, b.uid))[0];
    const head = cur ? `<div class="rcur"><span class="rcur-i">${icon(RESEARCH_ICON[cur.id] ?? 'desk')}</span><span class="rcur-m"><span class="rcur-t"><b>${esc(cur.name)}</b><small>${Math.floor(r.progress)}/${cur.hours}h</small></span><span class="rbar"><b style="width:${pct(cur.id).toFixed(1)}%"></b></span><span class="ifacts">${goods(cur, true)}<span class="grow"></span>${scholar ? `<button type="button" class="ipeople" data-act="colonist" data-arg="${scholar.id}" title="${esc(scholar.name)}">${avatar(scholar, 'avatar-mini')}</button>` : `<button type="button" class="fixbtn" data-act="desk"><span class="ftile">${icon('desk')}<i class="rb staff">${STAFF_GLYPH}</i></span>Staff</button>`}</span></span></div>` : '';
    const branches = [...new Set(RESEARCH.filter(x => x.branch).map(x => x.branch!))];
    const sel = pick ? RESEARCH_BY_ID[pick] : undefined;
    let detail = '';
    if (sel) {
      const st = state(sel.id), boost = LORE_BOOST[sel.id];
      const what = sel.unlocks.length ? `<span class="ifacts">${sel.unlocks.map(u => `<span class="ifact">${icon(u)}${esc(BUILDING_BY_ID[u].name)}</span>`).join('')}</span>`
        : boost ? `<span class="ifacts">${boost.defs.filter(d => BUILDING_BY_ID[d]).map(d => `<span class="ifact" title="${esc(BUILDING_BY_ID[d].name)}">${icon(d)}</span>`).join('')}<span class="ifact ok">+${Math.round((boost.mult - 1) * 100)}%</span></span>`
        : `<p class="rd-e">${esc(sel.effect ?? '')}</p>`;
      const left = Math.max(0, sel.hours - (r.current === sel.id ? r.progress : r.partial?.[sel.id] ?? 0));
      const action = st === 'open' ? `<button type="button" class="act" data-act="study" data-arg="${sel.id}">Study now</button>` : st === 'now' ? '<span class="rd-s now">Studying</span>' : st === 'done' ? `<span class="rd-s done">${CHECK_GLYPH} Learned</span>` : `<span class="rd-s">${LOCK_GLYPH} ${sel.after && !r.done.includes(sel.after) ? esc(RESEARCH_BY_ID[sel.after].name) : `${basicsDone(w)}/${BRANCHES_AFTER} basics`}</span>`;
      detail = `<div class="rdetail ${st}"><div class="rd-h">${icon(RESEARCH_ICON[sel.id] ?? 'desk')}<b>${esc(sel.name)}</b>${what}</div><div class="rd-f">${st === 'done' ? '' : `${goods(sel, false)}<span class="ifact">${CLOCK_GLYPH}${Math.ceil(left)}h</span>`}<span class="grow"></span>${action}</div></div>`;
    }
    return `<button type="button" class="ghost" data-act="tab" data-arg="build">← Buildings</button><h2 class="rtitle">Research</h2>${head}
      <h3 class="group">Basics</h3><div class="rbasics">${RESEARCH.filter(x => !x.branch).map(x => node(x.id)).join('')}</div>
      <h3 class="group">Branches${basicsDone(w) < BRANCHES_AFTER ? ` <span class="rn-gate">${LOCK_GLYPH}${basicsDone(w)}/${BRANCHES_AFTER}</span>` : ''}</h3>
      <div class="rbranches">${branches.map(bn => `<div class="rbr"><span class="rbr-n">${esc(bn)}</span><span class="rbr-c">${RESEARCH.filter(x => x.branch === bn).map(x => node(x.id)).join('<i class="rlink"></i>')}</span></div>`).join('')}</div>${detail}`;
  }


  private resumeCard(w: World) {
    const prog = charterProgress(w);
    const when = (() => { const t = Date.parse(this.resumeSavedAt); if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} minute${m === 1 ? '' : 's'} ago` : m < 60 * 24 ? `${Math.round(m / 60)} hour${Math.round(m / 60) === 1 ? '' : 's'} ago` : `${Math.round(m / 1440)} day${Math.round(m / 1440) === 1 ? '' : 's'} ago`; })();
    const lines = [`Day ${day(w)} · ${alive(w).length} settlers · mood ${Math.round(avgMood(w))} · strain ${Math.round(w.strain)}`, prog ? `Charter ${w.chartersDone.length + 1} of 3: ${prog.charter.name}, ${prog.label}` : w.chartersDone.length ? `${w.chartersDone.length} charter${w.chartersDone.length > 1 ? 's' : ''} done` : 'No charter yet'];
    return `<div class="card-wrap"><p class="eyebrow">Welcome back${when ? ` · saved ${when}` : ''}</p><h2>${esc(colonyName(w))}</h2>
      <p class="lede">${lines.map(esc).join('<br>')}</p>
      <div class="opts"><button type="button" class="opt" data-act="resume"><b>Continue</b></button>
      ${this.confirmNew ? `<button type="button" class="opt danger" data-act="restart"><b>Yes, start over</b><span>This colony will be lost for good.</span></button>` : `<button type="button" class="opt" data-act="restart"><b>Start a new colony</b></button>`}</div>
      ${this.confirmNew ? '<button type="button" class="ghost skip" data-act="restart-cancel">Keep this colony</button>' : ''}</div>`;
  }

  /** the Menu tab: this run, a new colony, past runs and settings */
  private menuView(w: World) {
    const prog = charterProgress(w);
    const runs = (this.profile.runs as { result: string; day: number; charters: number; at?: string; name?: string }[]).slice().reverse();
    const wins = runs.filter(r => r.result === 'won').length;
    const date = (at?: string) => { const t = at ? new Date(at) : null; return t && !isNaN(+t) ? t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''; };
    const run = (r: typeof runs[number]) => `<div class="mrun ${r.result === 'won' ? 'won' : 'lost'}">${r.result === 'won' ? TROPHY_GLYPH : SKULL_GLYPH}<span class="mr-n">${esc(r.name ?? (r.result === 'won' ? 'Won' : 'Lost'))}</span><span class="mr-d">${CLOCK_GLYPH}${r.day}</span><span class="mr-c" aria-label="${r.charters} of 3 charters">${[0, 1, 2].map(i => `<i class="${i < r.charters ? 'on' : ''}"></i>`).join('')}</span><span class="mr-t">${date(r.at)}</span></div>`;
    const prefs = this.prefs;
    const seg = (key: 'labels', opts: [string, string][]) => `<span class="segs">${opts.map(([v, l]) => `<button type="button" class="seg${prefs[key] === v ? ' on' : ''}" data-act="pref" data-arg="${key}:${v}" aria-pressed="${prefs[key] === v}">${l}</button>`).join('')}</span>`;
    const box = (key: 'calm') => `<button type="button" class="rcheck" role="checkbox" aria-checked="${!!prefs[key]}" data-act="pref" data-arg="${key}:${prefs[key] ? '' : '1'}"><span>${prefs[key] ? CHECK_GLYPH : ''}</span></button>`;
    return `<div class="mhead"><span class="mday">Day ${day(w)}</span><span class="mm"><b>${esc(colonyName(w))}</b><small>${prog ? `${esc(prog.charter.name)} · charter ${w.chartersDone.length + 1}/3` : w.chartersDone.length ? `${w.chartersDone.length} charters done` : 'No charter yet'}</small><small class="msaved">${SAVE_GLYPH}Saves automatically</small></span></div>
      ${this.confirmNew ? `<div class="mnew confirm"><span>${esc(colonyName(w))} will be lost for good.</span><button type="button" class="act danger" data-act="restart">New colony</button><button type="button" class="ghost" data-act="restart-cancel">Keep playing</button></div>`
        : `<button type="button" class="mnew" data-act="restart">${PLUS_GLYPH}New colony</button>`}
      <div class="mruns-h"><h3 class="group">Runs</h3>${runs.length ? `<span class="mwins">${TROPHY_GLYPH}${wins} / ${runs.length}</span>` : ''}</div>
      <div class="mruns">${runs.slice(0, 20).map(run).join('') || '<p class="empty">No finished runs yet</p>'}</div>
      <h3 class="group">Settings</h3>
      <div class="msets"><div class="mset">${LABEL_GLYPH}<span>Building labels</span>${seg('labels', [['all', 'All'], ['selected', 'Selected']])}</div>
      <div class="mset">${MOTION_GLYPH}<span>Reduce motion</span>${box('calm')}</div></div>`;
  }

  applyPrefs() { this.view.labelMode = this.prefs.labels; this.root.classList.toggle('calm', this.prefs.calm); }

  private logList(w: World) {
    return `<ol class="log">${w.log.slice(-60).reverse().map(l => `<li class="t-${l.tone}"><time>${l.tone === 'bad' ? '⚠' : l.tone === 'good' ? '✓' : l.tone === 'love' ? '♥' : '•'} Day ${l.day}, ${String(l.hour).padStart(2, '0')}:00</time><span>${logText(w,l.text)}</span></li>`).join('')}</ol>`;
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
        case 'charter': html = this.cards(d.tier === 1 ? 'Your first charter' : d.tier === 3 ? 'The final charter' : `Charter ${d.tier} of 3`,
          d.tier === 3 ? 'Finish one of these to win.' : `${d.tier === 1 ? 'Complete three charters to establish your town. ' : ''}Each pays ${charterPreview(w, d.options[0]).rewards[0]}, eases strain ${Math.round(START.relief.charter * 100)}% and brings a cornerstone.`,
          d.options.map(id => this.charterOption(w, id))); break;
        case 'research': {
          const open = basicsDone(w) >= BRANCHES_AFTER;
          html = this.cards(w.research?.done.length ? 'What next for the scholar?' : 'Choose research',
          !w.research?.done.length ? 'Staff the research desk to study.'
            : open ? 'Choose a project for your production chains.'
            : `Specializations open after ${BRANCHES_AFTER} basics.`,
          d.options.map(id => { const r = RESEARCH_BY_ID[id]; return { title: r.name, body: `${esc(r.desc)}\n${r.unlocks.length ? `Unlocks: ${r.unlocks.map(u => `<span class="gd">${icon(u)}${esc(BUILDING_BY_ID[u].name)}</span>`).join(', ')}` : `<b>${esc(r.effect ?? '')}</b>`}`, tag: `${r.branch ? `${esc(r.branch)} · ` : 'Basics · '}${costHtml(r.cost)} · ${r.hours}h` }; }));
          break;
        }
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
          d.options.map(id => this.cornerstoneOption(id))); break;
        case 'trade': html = this.tradeCard(w); break;
        case 'recruit': html = `<div class="card-wrap"><p class="eyebrow">Choose one</p><h2>New settlers</h2><p class="lede">⌂ ${beds(w)} beds · ${alive(w).length} settlers${beds(w) <= alive(w).length ? ' · ⚠ Another bed needed' : ''}</p><div class="opts">${d.options.map((c,i) => `<article class="recruit"><button type="button" class="opt" data-act="resolve" data-arg="${i}" ${(c.fee ?? 0) > w.gold ? 'disabled' : ''}><b>${avatar(c)}<span class="rname">${esc(c.name)}</span>${c.fee ? `<em class="fee">${icon('gold')}${c.fee} gold${w.gold < c.fee ? ` · you have ${Math.floor(w.gold)}` : ''}</em>` : ''}</b><span>★ ${esc(topSkills(c))}</span><span class="traits">${c.traits.map(t => `<i title="${esc(TRAIT_BY_ID[t].desc)}">${esc(TRAIT_BY_ID[t].name)}</i>`).join('')}</span><small>♥ ${esc(SKILL_NAMES[c.likes])} · × ${esc(SKILL_NAMES[c.dislikes])}</small></button><details data-key="recruit-${c.id}"><summary>What the traits do · tastes</summary>${c.traits.map(t => `<p><b>${esc(TRAIT_BY_ID[t].name)}</b> · ${esc(TRAIT_BY_ID[t].desc)}</p>`).join('')}<p>${tasteLine(c,false)}</p></details></article>`).join('')}</div><button type="button" class="ghost skip" data-act="resolve" data-arg="99">Send all away</button></div>`; break;
        case 'errand': { const e = w.errands.find(x => x.id === d.errandId); if (e) html = this.errandPicker(w, e, true); break; }
        case 'event': {
          const ev = EVENTS.find(e => e.id === d.eventId)!;
          html = `<div class="card-wrap event ${ev.tier}"><p class="eyebrow">${ev.tier === 'major' ? 'Trouble' : 'Something has happened'}</p><h2>${esc(ev.title)}</h2><p class="lede">${esc(ev.text)}</p>
            <div class="opts">${ev.options.map((o, i) => this.eventOption(w, o, i)).join('')}</div></div>`;
          break;
        }
      }
    }
    if (!html && this.naming(w)) {
      if (!this.nameInit || this.nameSeed !== w.seed) { this.nameInit = colonyName(w); this.nameSeed = w.seed; this.nameDraft = null; }
      html = `<div class="card-wrap naming"><p class="eyebrow">A new settlement</p><h2>Name your colony</h2>
        <div class="nrow"><input type="text" class="nin" data-name-input maxlength="${NAME_MAX}" value="${esc(this.nameInit)}" aria-label="Colony name" autocomplete="off" spellcheck="false"><button type="button" class="nroll" data-act="name-roll" title="Another name" aria-label="Another name">${DICE_GLYPH}</button></div>
        <button type="button" class="act nok" data-act="name-ok">Confirm</button></div>`;
    }
    if (!html && this.help) html = this.helpCard(w);
    if (!html && this.festivalOpen) html = this.festivalCard(w);
    if (!html && this.strainOpen) html = this.strainCard(w);
    if (!html && this.picking != null) { const e = w.errands.find(x => x.id === this.picking); if (e) html = this.errandPicker(w, e, false); else this.picking = null; }
    if (html && w.status === 'playing') html = html.replace('<p class="eyebrow">', '<p class="eyebrow">Ⅱ Paused · ');
    // a decision can be set aside to look at the colony: one button hides the whole card, and a bar brings it back
    const decisionKey = d ? JSON.stringify(d) : '';
    if (decisionKey !== this.peekKey) { this.peeking = false; this.peekKey = decisionKey; }
    if (!d || this.resumeOpen || w.status !== 'playing') this.peeking = false;
    if (html && d && !this.resumeOpen && w.status === 'playing') html = html.replace(/^(\s*<div class="card-wrap[^"]*"[^>]*>)/, `$1<button type="button" class="peek-btn" data-act="peek" title="Look at the colony" aria-label="Hide this choice and look at the colony">${EYE_GLYPH}</button>`);
    const bar = this.root.querySelector<HTMLElement>('#peekbar')!;
    const title = d ? (html.match(/<h2>(.*?)<\/h2>/)?.[1] ?? '') : '';
    if (this.peeking) {
      const next = `<span class="pk-paused">Ⅱ Paused</span><span class="pk-title">${title}</span><button type="button" data-act="peek-back">Back to choice</button>`;
      if (bar.innerHTML !== next) bar.innerHTML = next;
      bar.hidden = false; html = '';
    } else bar.hidden = true;
    const nextDialogKey = d ? JSON.stringify(d) : this.naming(w) ? `name:${this.nameInit}` : this.help ? `help:${this.help}` : this.festivalOpen ? 'festival' : this.strainOpen ? 'strain' : this.picking != null ? `errand:${this.picking}` : this.resumeOpen ? 'resume' : w.status;
    const changedDialog = nextDialogKey !== this.dialogKey;
    const wasOpen = !el.hidden;
    if (html && !wasOpen) {
      const a = document.activeElement as HTMLElement;
      this.returnFocus = a?.dataset.act ? { act: a.dataset.act, arg: a.dataset.arg ?? '' } : null;
    }
    if (force || html !== this.lastModal) { replaceMarkup(el, html, !changedDialog); this.lastModal = html; }
    el.hidden = !html;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.tabIndex = -1;
    const heading = el.querySelector('h2');
    if (heading) { heading.id = 'dialog-title'; el.setAttribute('aria-labelledby', 'dialog-title'); }
    for (const id of ['hud', 'sheet', 'placebar', 'stage']) (this.root.querySelector(`#${id}`) as HTMLElement).inert = !!html;
    // the dialog itself takes focus, not its first option, so nothing looks preselected; Tab moves into the options
    if (html && (!wasOpen || !el.contains(document.activeElement))) el.focus({ preventScroll: true });
    const nin = el.querySelector<HTMLInputElement>('[data-name-input]'); if (nin && (!wasOpen || changedDialog)) { nin.focus({ preventScroll: true }); nin.select(); }
    if (html && (!wasOpen || changedDialog)) el.scrollTop = 0;
    this.dialogKey = nextDialogKey;
    if (!html && wasOpen) {
      const t = this.returnFocus;
      const target = t && [...this.root.querySelectorAll<HTMLElement>('[data-act]')].find(e => e.dataset.act === t.act && (e.dataset.arg ?? '') === t.arg);
      (target || this.root.querySelector<HTMLElement>('[data-act=tab]'))?.focus({ preventScroll: true });
      this.returnFocus = null;
    }
  }

  /** the trade screen: one row per good, cheapest first, set quantities with −, +1 and +5, and one Trade button does it all */
  private tradeCard(w: World) {
    const t = w.caravan; if (!t) return '';
    const key = `${t.trader}:${t.leaves}`;
    if (this.order.key !== key) this.order = { key, buy: {}, sell: {}, bps: [] };
    const o = this.order, gold = Math.floor(w.gold), cap = START.trade.sellCap;
    const left = Math.max(0, Math.ceil(t.leaves - w.hour));
    const tr = TRADER_BY_ID[t.trader];
    // what's needed: goods the charter counts, and inputs a staffed workshop is waiting on
    const charter = new Set<string>(charterCounted(w));
    const waiting = new Map<string, string>();
    for (const b of built(w)) if (recipesOf(b).length && workersAt(w, b.uid).length) for (const { r, i } of orderedRecipes(b)) if (recipeOn(b, i))
      for (const [k, n] of Object.entries(r.inputs) as [InputKey, number][]) { const ms = membersOf(k); if (ms.reduce((m, x) => m + w.res[x] + (b.inbox[x] ?? 0), 0) < n) for (const x of ms) if (!waiting.has(x)) waiting.set(x, b.def); }
    const needTag = (r: string) => charter.has(r) ? `<i class="tneed" title="Your charter counts these" aria-label="charter">${STAR_GLYPH}</i>` : waiting.has(r) ? `<i class="tneed" title="${esc(BUILDING_BY_ID[waiting.get(r)!].name)} is waiting for this">${icon(waiting.get(r)!)}</i>` : '';
    const price = (p: number) => `<span class="tprice">${Number.isInteger(p) ? p : p.toFixed(1)}${icon('gold')}</span>`;
    const step = (side: 'buy' | 'sell', r: string, q: number, max: number) => `<span class="tstep"><button type="button" data-act="tq" data-arg="${side}:${r}:-1" aria-label="One fewer" ${q ? '' : 'disabled'}>−</button><b aria-label="${q} in the order">${q}</b><button type="button" data-act="tq" data-arg="${side}:${r}:1" ${q < max ? '' : 'disabled'}>+1</button><button type="button" data-act="tq" data-arg="${side}:${r}:5" ${q < max ? '' : 'disabled'}>+5</button></span>`;
    const sum = (q: number, g: number, side: 'buy' | 'sell') => `<span class="tsum ${side}">${q ? `${side === 'buy' ? '−' : '+'}${g}` : ''}</span>`;
    const nameOf = (r: string) => RESOURCES.find(x => x.id === r)!.name;
    // blueprints: a checkbox adds one to the order
    const bps = t.blueprints.map(b => { const def = BUILDING_BY_ID[b.id], on = o.bps.includes(b.id), helps = charterHelpers(w.charter ?? '').includes(b.id);
      return `<div class="trow${helps ? ' need' : ''}"><span class="tico">${icon(b.id)}<i class="rb draft">${ROUTE_GLYPH.draft}</i></span><span class="tname"><b>${esc(def.name)}${helps ? `<i class="tneed" title="Helps your charter">${STAR_GLYPH}</i>` : ''}</b></span>${price(b.price)}<button type="button" class="rcheck" role="checkbox" aria-checked="${on}" data-act="tq-bp" data-arg="${b.id}" aria-label="Buy the ${esc(def.name)} blueprint"><span>${on ? CHECK_GLYPH : ''}</span></button>${sum(on ? 1 : 0, b.price, 'buy')}</div>`; }).join('');
    const wares = (Object.entries(t.stock) as [ResourceId, { n: number; price: number }][]).filter(([, it]) => it.n > 0).sort((a, b) => a[1].price - b[1].price || a[0].localeCompare(b[0])).map(([r, it]) => {
      const q = Math.min(o.buy[r] ?? 0, it.n);
      return `<div class="trow${charter.has(r) || waiting.has(r) ? ' need' : ''}"><span class="tico">${icon(r)}</span><span class="tname"><b><span class="tn">${esc(nameOf(r))}</span>${needTag(r)}</b><small><span title="You have">${BOX_GLYPH}${Math.floor(w.res[r])}</span><span title="The trader has">${icon('caravan')}${it.n}</span></small></span>${price(it.price)}${step('buy', r, q, it.n)}${sum(q, q * it.price, 'buy')}</div>`;
    }).join('');
    const mine = RESOURCES.filter(x => w.res[x.id] >= 1 && sellPrice(w, x.id) > 0).sort((a, b) => sellPrice(w, a.id) - sellPrice(w, b.id) || a.name.localeCompare(b.name)).map(x => {
      const p = sellPrice(w, x.id), sold = t.sold[x.id] ?? 0, max = saleQuantity(cap, Math.floor(w.res[x.id]), cap - sold), q = Math.min(o.sell[x.id] ?? 0, max);
      return `<div class="trow${charter.has(x.id) || waiting.has(x.id) ? ' need' : ''}"><span class="tico">${icon(x.id)}</span><span class="tname"><b><span class="tn">${esc(x.name)}</span>${needTag(x.id)}</b><small><span title="You have">${BOX_GLYPH}${Math.floor(w.res[x.id])}</span><span title="Sold this visit, of the most they buy">${sold}/${cap}</span></small></span>${price(p)}${step('sell', x.id, q, max)}${sum(q, Math.floor(q * p + 1e-9), 'sell')}</div>`;
    }).join('');
    const tot = this.orderTotals(w);
    const after = gold - tot.out + tot.in, any = Object.keys(o.buy).length + Object.keys(o.sell).length + o.bps.length > 0;
    const name = tr.name.charAt(0).toUpperCase() + tr.name.slice(1);
    return `<div class="card-wrap trade"><p class="eyebrow">${icon('caravan')} Leaves in ${left}h</p><div class="thead"><h2>${esc(name)}</h2><span class="goldnum">${icon('gold')}${gold}</span></div>
      <details data-key="trader-lore"><summary>About this trader</summary><p>${esc(tr.who)}</p></details>
      ${bps ? `<h3 class="group">Blueprints</h3><div class="tlist">${bps}</div>` : ''}
      <h3 class="group">Buy</h3><div class="tlist">${wares || '<p class="empty">Sold out</p>'}</div>
      <h3 class="group">Sell <span>up to ${cap} each</span></h3><div class="tlist">${mine || '<p class="empty">Nothing this trader wants</p>'}</div>
      <div class="ttotal${after < 0 ? ' short' : ''}"><span class="tt-l"><span class="tt-f">${tot.out ? `<b class="buy">−${tot.out}</b>` : ''}${tot.in ? `<b class="sell">+${tot.in}</b>` : ''}</span><span class="tt-g">${icon('gold')}<b>${gold}</b>${ARROW_GLYPH}<b class="after">${after}</b></span></span>
        <button type="button" class="act" data-act="trade-go" ${any && after >= 0 ? '' : 'disabled'}>Trade</button></div>
      <button type="button" class="ghost tdone" data-act="resolve" data-arg="0">Done</button></div>`;
  }

  /** gold the order spends and earns, as the caravan would count it */
  private orderTotals(w: World) {
    const t = w.caravan, o = this.order; let out = 0, inn = 0;
    if (!t) return { out, in: inn };
    for (const [r, q] of Object.entries(o.buy)) { const it = t.stock[r as ResourceId]; if (it && q) out += Math.min(q, it.n) * it.price; }
    for (const id of o.bps) { const b = t.blueprints.find(x => x.id === id); if (b) out += b.price; }
    for (const [r, q] of Object.entries(o.sell)) if (q) inn += Math.floor(q * sellPrice(w, r as ResourceId) + 1e-9);
    return { out, in: inn };
  }

  /** a charter offer: each condition with how close the colony is, the buildings its goods still need, and what it pays */
  private charterOption(w: World, id: string) {
    const c = charterDef(id)!, p = charterPreview(w, id);
    const route = (r: Route, good?: ResourceId) => {
      const lead = good ? goodHtml(good) : '';
      if (r.state === 'never') return `<span class="route never">${lead}⚠ not on this map</span>`;
      if (r.state === 'ready') return `<span class="route ready">${lead}✓ ${r.by ? `${icon(r.by)}${esc(BUILDING_BY_ID[r.by].name.toLowerCase())} makes ${good ? 'it' : 'them'}` : 'made here'}</span>`;
      const step = (s: Route['steps'][number]) => {
        const how = s.how === 'build' ? 'build' : s.how === 'study' ? `study ${esc(RESEARCH_BY_ID[s.research!].name)}` : 'draft';
        return `<span class="step ${s.how}">${icon(s.def)}${esc(BUILDING_BY_ID[s.def].name.toLowerCase())} <i>${how}</i></span>`;
      };
      return `<span class="route">${lead}needs ${r.steps.map(step).join(' ')}</span>`;
    };
    const rows = p.conditions.map(x => `<span class="cond${x.met ? ' met' : ''}"><span class="ct"><i aria-hidden="true">${x.met ? '✓' : '○'}</i>${esc(x.text)}${x.have ? ` <em>${esc(x.have)}</em>` : ''}</span>`
      + `${x.route && !x.met ? route(x.route) : ''}${x.routes && !x.met ? x.routes.map(r => route(r.route, r.good)).join('') : ''}</span>`).join('');
    return { title: c.name, body: `<span class="conds">${rows}</span>`, tag: '', cls: 'charter' };
  }

  /** a cornerstone: its own icon, the bonus, and any cost marked apart */
  private cornerstoneOption(id: string) {
    const perk = PERK_BY_ID[id];
    return { title: perk.name, icon: CORNERSTONE_ICON[id] ?? 'cornerstone', body: esc(perk.desc) + (perk.cost ? `\n<em class="cost">But: ${esc(perk.cost)}</em>` : ''), tag: '' };
  }

  /** an event choice: what it costs as a have/need pill (red, and the choice dimmed, when short), and when short what happens instead */
  private eventOption(w: World, o: EventOption, i: number) {
    const have: Record<EventNeed, number> = { gold: Math.floor(w.gold), meal: Math.floor(mealTotal(w)), drink: Math.floor(drinkTotal(w)), food: Math.floor(edibleTotal(w)), wood: Math.floor(w.res.wood), planks: Math.floor(w.res.planks) };
    const iconFor: Record<EventNeed, string> = { gold: 'gold', meal: 'meal', drink: 'drink', food: 'rawFood', wood: 'wood', planks: 'planks' };
    const pill = (ico: string, h: number, n: number, what: string) => `<span class="cost-pill${h < n ? ' short' : ''}" title="${h} of ${n} ${what}" aria-label="${h} of ${n} ${what}">${icon(ico)}${h}/${n}</span>`;
    const needs = Object.entries(o.needs ?? {}) as [EventNeed, number][];
    const pills = needs.map(([k, n]) => pill(iconFor[k], have[k], n, k));
    if (o.effect === 'moonDance') pills.push(pill('meal', Math.floor(mealTotal(w)), alive(w).filter(c => !bedridden(c)).length, 'meals for the settlers'));
    const short = needs.some(([k, n]) => have[k] < n);
    return `<button type="button" class="opt ev${short ? ' short' : ''}" data-act="resolve" data-arg="${i}"><b><span class="evl">${esc(o.label)}</span>${pills.length ? `<span class="pills">${pills.join('')}</span>` : ''}</b><span>${esc(o.detail)}</span>${short && o.short ? `<span class="instead">Short: ${esc(o.short)}</span>` : ''}</button>`;
  }

  private cards(title: string, lede: string, opts: { title: string; body: string; tag: string; color?: string; icon?: string; disabled?: boolean; cls?: string }[], skip?: string, extra = '') {
    return `<div class="card-wrap"><p class="eyebrow">Choose one</p><h2>${esc(title)}</h2><p class="lede">${esc(lede)}</p>
      <div class="opts">${opts.map((o, i) => `<button type="button" class="opt${o.cls ? ` ${o.cls}` : ''}" data-act="resolve" data-arg="${i}"${o.disabled ? ' disabled' : ''}>
        <b>${o.color ? `<span class="dot" style="background:${o.color}"></span>` : ''}${o.icon ? icon(o.icon, 'cico') : ''}${esc(o.title)}</b>
        ${o.body.split('\n').map(line => `<span>${line}</span>`).join('')}${o.tag ? `<small>${o.tag}</small>` : ''}</button>`).join('')}</div>
      ${skip ? `<button type="button" class="ghost skip" data-act="resolve" data-arg="99">${esc(skip)}</button>` : ''}${extra}</div>`;
  }

  private endScreen(w: World) {
    const won = w.status === 'won';
    const s = w.stats;
    return `<div class="card-wrap end ${won ? 'won' : 'lost'}"><p class="eyebrow">${won ? 'Victory' : `${esc(colonyName(w))} collapsed`}</p>
      <h2>${won ? `${esc(colonyName(w))} is a town` : 'The kettle remains'}</h2>
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
  return `<div class="ledger">${activeNeeds(w).map(k => `<button type="button" data-act="need" data-arg="${k}" class="lg-row need ${v(k) >= 0.7 ? 'lg-good' : 'lg-bad'}"><span>${icon(NEED_BUILD[k])} ${NEED_NAMES[k]}<small>${esc(why[k])}</small></span><i><b style="width:${Math.round(v(k) * 100)}%"></b></i><em>${Math.round(v(k) * 100)}%</em><span class="sr-only">Open remedy</span></button>`).join('')}</div>`;
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
/** the concern banner: how many, and the most urgent one with its numbers and its fix */
function concernCards(w: World) {
  const ui = currentUI; if (!ui) return '';
  const all = ui.rankedIssues(w); if (!all.length) return '';
  const top = all[0], title = top.title.replace(/^\d+\s+/, '').replace(/^./, ch => ch.toUpperCase());
  return `<div class="issue-summary ${top.level}"><button type="button" class="is-open" data-act="tab" data-arg="issues" aria-label="${all.length} concerns; the top one: ${esc(title)}"><span class="is-count">${TAB_GLYPH.issues}${all.length}</span><span class="idot"></span><span class="is-title">${esc(title)}</span><span class="ifacts">${concernFacts(w, top)}</span></button>${ui.fixButtonFor(w, top)}</div>`;
}
let currentUI: UI | null = null;
/** the numbers behind a concern, as icons: what's in store, who's working, how long it lasts */
function concernFacts(w: World, c: Ranked) {
  const fact = (ico: string, text: string, bad = false) => `<span class="ifact${bad ? ' bad' : ''}">${ico}${text}</span>`;
  const staff = (kind: string) => { const bs = built(w).filter(b => defsOf(kind).includes(b.def)); return `${bs.reduce((n, b) => n + workersAt(w, b.uid).length, 0)}/${bs.reduce((n, b) => n + BUILDING_BY_ID[b.def].slots, 0)}`; };
  const e = economy(w), pop = alive(w).length;
  const days = (d?: number | null) => d == null ? '' : fact(CLOCK_GLYPH, `${d < 1 ? '<1' : Math.floor(d)}d`, d < 3);
  switch (c.id) {
    case 'hungry': case 'spoiling': return fact(icon('rawFood'), String(Math.floor(c.id === 'spoiling' ? spoilingFood(w) : RESOURCES.filter(r => r.kind === 'raw').reduce((n, r) => n + w.res[r.id], 0))));
    case 'raw': return fact(icon('meal'), String(Math.floor(mealTotal(w)))) + fact(icon('kitchen'), staff('kitchen'));
    case 'table': return fact(icon('dining'), `${built(w).filter(b => b.def === 'dining').reduce((n, b) => n + (BUILDING_BY_ID[b.def].seats ?? 0), 0)}/${pop}`);
    case 'ale': return fact(icon('drink'), String(Math.floor(drinkTotal(w))));
    case 'beds': return fact(icon('leanto'), `${beds(w)}/${pop}`);
    case 'vain': return fact(icon('cottage'), String(built(w).filter(b => b.def === 'cottage').length));
    case 'sick': return fact(icon('clinic'), built(w).some(b => b.def === 'clinic') ? staff('clinic') : '0', !built(w).some(b => b.def === 'clinic'));
    case 'cold': case 'wood': case 'coldhomes': return fact(icon('wood'), String(Math.floor(w.res.wood)), true) + fact(icon('woodcutter'), staff('woodcutter'));
    case 'woodflow': return fact(icon('wood'), `${num(e.wood.net)}/d`, true) + days(e.wood.daysLeft);
    case 'foodflow': return fact(icon('rawFood'), `${num(e.food.net)}/d`, true) + days(e.food.daysLeft);
    case 'winter': return fact(icon('wood'), String(Math.floor(w.res.wood))) + days(c.due);
    case 'storage': return fact(icon('stockpile'), `${Math.floor(stored(w))}/${storageCap(w)}`, true);
    case 'planks': return fact(icon('fine'), String(Math.floor(stockOf(w, 'fine'))), true);
    case 'stretched': case 'slack': return fact(LABORER_GLYPH, `${Math.round(e.busyShare * 100)}%`);
    case 'festival': return fact(STRAIN_GLYPH, String(Math.round(w.strain)));
    case 'moodcharter': return fact(MOOD_GLYPH, String(Math.round(avgMood(w))));
    case 'desk': return fact(icon('desk'), staff('desk'), true);
    default: return '';
  }
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
  const resourceDetail = selectedGood ? `<div id="resource-${selectedGood.id}" class="acct"><h3>${icon(selectedGood.id)} ${selectedGood.name} · ${Math.floor(w.res[selectedGood.id])}</h3><div class="actions"><button type="button" class="ghost" data-act="source" data-arg="${selectedGood.id}">Sources →</button><button type="button" class="ghost" data-act="workplaces" data-arg="stockpile,storehouse">Storage →</button>${FOODS.includes(selectedGood.id) ? '<button type="button" class="ghost" data-act="food-rules">Food rules →</button>' : ''}</div></div>` : '';
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
    ${w.perks.length ? `<details data-key="cornerstones"><summary>Cornerstones · ${w.perks.length}</summary><ul class="stones">${w.perks.map(p => `<li>${icon(CORNERSTONE_ICON[p] ?? 'cornerstone')}<span><b>${esc(PERK_BY_ID[p].name)}</b><small>${esc(PERK_BY_ID[p].desc)}${PERK_BY_ID[p].cost ? ` ${esc(PERK_BY_ID[p].cost!)}` : ''}</small></span></li>`).join('')}</ul></details>` : ''}
    <details data-key="gold-help"><summary>Gold sources</summary><p>Seasonal rent · Crown stipends · events · caravan sales</p></details>${categoryDetail}${resourceDetail}${accounts.map(([a, k]) => accountCard(a, k, selected === k || !!selected && (membersOf(k).includes(selected as ResourceId) || k === 'meal' && FOODS.includes(selected as ResourceId)))).join('')}
    <h3>Jobs</h3><div class="joblist">${jobs || '<p class="muted">No workplaces yet.</p>'}</div>
    <h3 id="ledger-laborers">Laborers <span class="muted">· ${e.laborers.length}</span></h3>
    <div class="lt-bar">${segs}</div>
    <p class="lt-key">${['hauling', 'building', 'cleaning', 'eating', 'idle'].map(k => `<span class="lt-${k}"><i></i>${k} ${pct(k)}%</span>`).join('')}</p>
    <p class="prefs">${laborNote}</p>`;
}
