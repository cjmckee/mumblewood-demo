// DOM overlay: HUD, bottom sheet, decision modals. Talks to the sim only through commands.
import { BUILDING_BY_ID, CHARTERS, EVENTS, JOB_NAMES, PERK_BY_ID, RESOURCES, TRAIT_BY_ID, ResourceId } from '../sim/content';
import {
  World, Command, Colonist, alive, avgMood, beds, buildingByUid, charterProgress, colonistById,
  day, hourOfDay, opinion, workersAt, MAX_DEPARTURES, sites, siteWork, remainingCost, storageCap, stored,
  keepsFresh, findSpot, canPlace, laborers, centerOf, built, Building,
} from '../sim/world';
import type { IsoView, Picked } from '../render/iso';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const first = (c: Colonist) => c.name.split(' ')[0];
const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((n, v) => n + (v ?? 0), 0);
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const RES_COLOR: Record<ResourceId, string> = {
  wood: '#a07a4c', planks: '#d2a96a', berries: '#c04a6a', fish: '#5b9cc2', mushrooms: '#b39ad0',
  stew: '#d98a3c', pie: '#e6c25a', smokedFish: '#9c8c7a', ale: '#d6a33c',
};
const costText = (cost: Partial<Record<ResourceId, number>>) =>
  Object.entries(cost).map(([r, n]) => `${n} ${RESOURCES.find(x => x.id === r)!.name.toLowerCase()}`).join(', ') || 'free';

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
    case 'eating': { const at = buildingByUid(w, c.meal?.at ?? null); return at && BUILDING_BY_ID[at.def].seats ? 'Eating in the dining hall' : 'Eating standing up'; }
    case 'building': { const t = c.task; const b = t && 'site' in t ? buildingByUid(w, t.site) : undefined; return b ? `Building the ${BUILDING_BY_ID[b.def].name.toLowerCase()}` : 'Building'; }
    case 'cleaning': return 'Cleaning the dining hall';
    case 'hauling': {
      const t = c.task; if (!t) return 'Hauling';
      const r = RESOURCES.find(x => x.id === (t as { res: ResourceId }).res)?.name.toLowerCase() ?? 'goods';
      if (t.kind === 'deliver') { const b = buildingByUid(w, t.site); return c.carrying ? `Carrying ${r} to the ${b ? BUILDING_BY_ID[b.def].name.toLowerCase() : 'site'}` : `Fetching ${r} for the ${b ? BUILDING_BY_ID[b.def].name.toLowerCase() : 'site'}`; }
      return c.carrying ? `Carrying ${r} to storage` : `Collecting ${r}`;
    }
  }
}
function moodClass(m: number, sulking: boolean) { return sulking ? 'sulk' : m >= 60 ? 'good' : m >= 35 ? 'warn' : 'bad'; }

type Tab = 'colonists' | 'build' | 'log';
type Detail = { kind: 'colonist' | 'building'; id: number } | null;

export class UI {
  tab: Tab = 'colonists';
  open = false;
  detail: Detail = null;
  speed = 1;
  private lastHud = ''; private lastSheet = ''; private lastModal = '';
  onSpeed: (s: number) => void = () => {};
  onRestart: () => void = () => {};

  constructor(private root: HTMLElement, private getWorld: () => World, private send: (c: Command) => string | null, private view: IsoView) {
    root.addEventListener('click', e => this.click(e));
    view.onPick = p => this.picked(p);
  }

  private picked(p: Picked | null) {
    this.view.selected = p;
    if (!p) { this.detail = null; this.render(true); return; }
    this.detail = { kind: p.kind, id: p.id };
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
    const act = el.dataset.act!, arg = el.dataset.arg ?? '';
    const w = this.getWorld();
    switch (act) {
      case 'speed': this.speed = Number(arg); this.onSpeed(this.speed); break;
      case 'tab':
        if (this.tab === arg && this.open && !this.detail) this.open = false; else { this.tab = arg as Tab; this.open = true; }
        this.detail = null; this.view.selected = null; break;
      case 'close': this.open = false; this.detail = null; this.view.selected = null; break;
      case 'back': this.detail = null; this.view.selected = null; break;
      case 'colonist': this.detail = { kind: 'colonist', id: Number(arg) }; this.view.selected = { kind: 'colonist', id: Number(arg) };
        { const c = colonistById(w, Number(arg)); if (c) this.view.focus(c.x, c.y); } break;
      case 'building': this.detail = { kind: 'building', id: Number(arg) }; this.view.selected = { kind: 'building', id: Number(arg) };
        { const b = buildingByUid(w, Number(arg)); if (b) { const p = centerOf(b); this.view.focus(p.x, p.y); } } break;
      case 'build': this.startPlacing(arg); break;
      case 'place-confirm': {
        const pl = this.view.placing; if (!pl) break;
        const err = this.send({ type: 'place', def: pl.def, x: pl.x, y: pl.y });
        if (err) { this.toast(err); break; }
        this.view.placing = null;
        this.toast(laborers(w).length ? 'Blueprint placed. Laborers will haul materials and build it.' : 'Blueprint placed, but nobody is free to build. Take someone off a job.');
        break;
      }
      case 'place-cancel': this.view.placing = null; break;
      case 'cancel-site': { const err = this.send({ type: 'cancel', building: Number(arg) }); if (err) this.toast(err); this.detail = null; this.view.selected = null; break; }
      case 'assign': { const [cid, bid] = arg.split(':').map(x => (x === 'none' ? null : Number(x))); const err = this.send({ type: 'assign', colonist: cid!, building: bid }); if (err) this.toast(err); break; }
      case 'auto': this.send({ type: 'autoAssign' }); this.toast('The foreman has reassigned everyone.'); break;
      case 'resolve': this.send({ type: 'resolve', option: Number(arg) }); this.lastModal = ''; break;
      case 'restart': this.onRestart(); break;
    }
    this.render(true);
  }

  render(force = false) {
    const w = this.getWorld();
    this.renderHud(w, force);
    this.renderSheet(w, force);
    this.renderModal(w, force);
    this.renderPlaceBar(w);
    (this.root.querySelector('#sheet') as HTMLElement).hidden = !!this.view.placing;
  }

  // ---------- HUD ----------
  private renderHud(w: World, force: boolean) {
    const h = hourOfDay(w);
    const hh = String(Math.floor(h)).padStart(2, '0');
    const prog = charterProgress(w);
    const pips = Array.from({ length: MAX_DEPARTURES }, (_, i) => `<i class="pip${i < w.stats.departures ? ' on' : ''}"></i>`).join('');
    const strain = Math.round(w.strain);
    const cap = storageCap(w), st = stored(w);
    const storeChip = `<span class="chip store${st >= cap ? ' full' : ''}"><b>${Math.floor(st)}/${cap}</b> stored${keepsFresh(w) ? '' : ' · food spoils'}</span>`;
    const res = storeChip + RESOURCES.filter(r => w.res[r.id] >= 0.5 || ['wood', 'berries', 'stew'].includes(r.id))
      .map(r => `<span class="chip"><i style="background:${RES_COLOR[r.id]}"></i><b>${Math.floor(w.res[r.id])}</b> ${r.name}</span>`).join('');
    const html = `
      <div class="bar">
        <div class="clock"><span class="day">Day ${day(w)}</span><span class="time">${hh}:00 · ${timeOfDay(h)}</span></div>
        <div class="speeds" role="group" aria-label="Game speed">
          ${[['0', 'Pause'], ['1', '1×'], ['2', '2×'], ['3', '3×']].map(([s, l]) => `<button type="button" data-act="speed" data-arg="${s}" class="${this.speed === Number(s) ? 'on' : ''}" aria-pressed="${this.speed === Number(s)}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="res">${res}</div>
      <div class="status">
        <div class="charter">
          ${prog ? `<div class="ch-top"><span class="ch-name">${esc(prog.charter.name)}</span><span class="ch-tier">Charter ${w.chartersDone.length + 1} of 3</span></div>
          <div class="meter"><i style="width:${(prog.ratio * 100).toFixed(1)}%"></i></div>
          <div class="ch-label">${esc(prog.label)}</div>` : `<div class="ch-top"><span class="ch-name">${w.status === 'won' ? 'Town charter granted' : 'Awaiting a charter'}</span></div>`}
        </div>
        <div class="threats">
          <div class="strain" title="Frontier strain: a mood penalty that grows every day"><span>Strain</span><b>−${strain}</b></div>
          <div class="leavers" title="If ${MAX_DEPARTURES} settlers leave, the colony collapses"><span>Left</span><div class="pips">${pips}</div></div>
        </div>
      </div>`;
    if (force || html !== this.lastHud) { (this.root.querySelector('#hud') as HTMLElement).innerHTML = html; this.lastHud = html; }
  }

  // ---------- Bottom sheet ----------
  private renderSheet(w: World, force: boolean) {
    const pop = alive(w);
    const tabs = `<nav class="tabs">
      ${(['colonists', 'build', 'log'] as Tab[]).map(t => `<button type="button" data-act="tab" data-arg="${t}" class="${this.tab === t && this.open ? 'on' : ''}">${t === 'colonists' ? `Colonists <em>${pop.length}</em>` : t === 'build' ? 'Build' : 'Log'}</button>`).join('')}
      ${this.open ? `<button type="button" class="x" data-act="close" aria-label="Close panel">Close</button>` : ''}
    </nav>`;
    let body = '';
    if (this.open) {
      if (this.detail?.kind === 'colonist') body = this.colonistDetail(w, this.detail.id);
      else if (this.detail?.kind === 'building') body = this.buildingDetail(w, this.detail.id);
      else if (this.tab === 'colonists') body = this.colonistList(w);
      else if (this.tab === 'build') body = this.buildList(w);
      else body = this.logList(w);
    }
    const html = tabs + (this.open ? `<div class="sheet-body">${body}</div>` : '');
    const el = this.root.querySelector('#sheet') as HTMLElement;
    if (force || html !== this.lastSheet) {
      const scroller = el.querySelector('.sheet-body');
      const top = scroller?.scrollTop ?? 0;
      el.innerHTML = html; this.lastSheet = html;
      const s2 = el.querySelector('.sheet-body'); if (s2) s2.scrollTop = top;
    }
    el.classList.toggle('open', this.open);
  }

  private colonistList(w: World) {
    const rows = alive(w).sort((a, b) => a.mood - b.mood).map(c => {
      const partner = colonistById(w, c.partner);
      return `<button type="button" class="row" data-act="colonist" data-arg="${c.id}">
        <span class="dot" style="background:${hex(c.shirt)}"></span>
        <span class="who"><b>${esc(c.name)}</b><small>${esc(activityText(w, c))}${partner ? ` · with ${esc(first(partner))}` : ''}</small></span>
        <span class="mood ${moodClass(c.mood, c.sulking)}"><b>${Math.round(c.mood)}</b><i style="width:${c.mood}%"></i></span>
      </button>`;
    }).join('');
    return `<div class="list-head"><span>${alive(w).length} colonists · ${beds(w)} beds · average mood ${Math.round(avgMood(w))}</span>
      <button type="button" class="ghost" data-act="auto">Auto-assign jobs</button></div>
      <p class="muted hint">${laborers(w).length} laborers. Anyone without a job builds, hauls and cleans.</p><div class="rows">${rows}</div>`;
  }

  private colonistDetail(w: World, id: number) {
    const c = colonistById(w, id);
    if (!c || c.left) return `<p class="empty">This colonist has left.</p><button type="button" class="ghost" data-act="back">Back to colonists</button>`;
    const traits = c.traits.map(t => `<div class="trait"><b>${TRAIT_BY_ID[t].name}</b><span>${esc(TRAIT_BY_ID[t].desc)}</span></div>`).join('');
    const thoughts = c.thoughts.map(t => `<li class="${t.value >= 0 ? 'pos' : 'neg'}"><span>${esc(t.label)}</span><b>${t.value > 0 ? '+' : '−'}${Math.abs(Math.round(t.value))}</b></li>`).join('');
    const others = alive(w).filter(o => o.id !== c.id).map(o => ({ o, v: opinion(w, c.id, o.id) }));
    const friends = others.filter(x => x.v > 25).sort((a, b) => b.v - a.v).slice(0, 3);
    const rivals = others.filter(x => x.v < -25).sort((a, b) => a.v - b.v).slice(0, 3);
    const partner = colonistById(w, c.partner);
    const rel = [
      partner ? `<span class="rel love">Partner: ${esc(first(partner))}</span>` : '',
      ...friends.map(x => `<span class="rel friend">Likes ${esc(first(x.o))}</span>`),
      ...rivals.map(x => `<span class="rel rival">Can’t stand ${esc(first(x.o))}</span>`),
    ].join('') || '<span class="muted">No strong feelings about anyone yet.</span>';
    const job = buildingByUid(w, c.job);
    const jobs = built(w).filter(b => BUILDING_BY_ID[b.def].slots > 0).map(b => {
      const def = BUILDING_BY_ID[b.def];
      const n = workersAt(w, b.uid).length, full = n >= def.slots && c.job !== b.uid;
      const fit = def.job === c.likes ? ' likes' : def.job === c.dislikes ? ' dislikes' : '';
      return `<button type="button" class="job${c.job === b.uid ? ' on' : ''}${fit}" data-act="assign" data-arg="${c.id}:${b.uid}" ${full ? 'disabled' : ''}>${esc(def.name)}<small>${n}/${def.slots}${fit === ' likes' ? ' · loves this' : fit === ' dislikes' ? ' · hates this' : ''}</small></button>`;
    }).join('');
    return `<div class="detail">
      <div class="d-head"><button type="button" class="ghost back" data-act="back">All colonists</button></div>
      <div class="who-big"><span class="dot big" style="background:${hex(c.shirt)}"></span><div><h2>${esc(c.name)}</h2><p>${esc(activityText(w, c))} · joined day ${c.joinedDay}</p></div>
        <div class="mood-big ${moodClass(c.mood, c.sulking)}"><b>${Math.round(c.mood)}</b><small>heading to ${Math.round(c.moodTarget)}</small></div></div>
      ${c.sulking ? '<p class="warnline">Sulking. Won’t work until mood climbs above 32.</p>' : c.mood < 15 ? '<p class="warnline">Thinking about leaving the colony.</p>' : ''}
      <div class="traits">${traits}</div>
      <p class="prefs">Loves <b>${JOB_NAMES[c.likes]}</b> · hates <b>${JOB_NAMES[c.dislikes]}</b> · hunger ${Math.round(c.hunger)} · fun ${Math.round(c.fun)}</p>
      <h3>Why they feel this way</h3><ul class="thoughts">${thoughts}</ul>
      <h3>Relationships</h3><div class="rels">${rel}</div>
      <h3>Job ${job ? '' : '<span class="muted">· none</span>'}</h3>
      <div class="jobs">${jobs}<button type="button" class="job${c.job == null ? ' on' : ''}" data-act="assign" data-arg="${c.id}:none">Laborer<small>builds, hauls and cleans</small></button></div>
    </div>`;
  }

  private buildList(w: World) {
    const short = (cost: Partial<Record<ResourceId, number>>) => Object.entries(cost).filter(([r, n]) => w.res[r as ResourceId] < (n ?? 0)).map(([r]) => RESOURCES.find(x => x.id === r)!.name.toLowerCase());
    const owned = w.owned.map(id => BUILDING_BY_ID[id]).map(def => {
      const miss = short(def.cost);
      return `<div class="bp"><div><b>${esc(def.name)}</b><small>${esc(def.blurb)}</small><small class="cost">${Object.keys(def.cost).length ? `Needs ${esc(costText(def.cost))}` : 'Free'} · ${def.w}×${def.h}${miss.length ? ` · short on ${esc(miss.join(', '))}` : ''}</small></div>
        <button type="button" class="act" data-act="build" data-arg="${def.id}">Place</button></div>`;
    }).join('');
    const queue = sites(w).map(b => this.siteRow(w, b)).join('');
    const done = built(w).map(b => {
      const def = BUILDING_BY_ID[b.def];
      const info = def.slots ? `${workersAt(w, b.uid).length}/${def.slots} workers` : def.beds ? `${def.beds} beds` : def.seats ? `${def.seats} seats · ${Math.round(b.clean)}% clean` : def.storage ? `holds ${def.storage}` : def.id === 'hearth' ? 'gathering place' : 'passive';
      return `<button type="button" class="row compact" data-act="building" data-arg="${b.uid}"><span class="who"><b>${esc(def.name)}</b></span><small>${info}</small></button>`;
    }).join('');
    return `${queue ? `<h3 class="first">Under construction</h3><div class="rows">${queue}</div>` : ''}
      <h3 class="${queue ? '' : 'first'}">Blueprints</h3><div class="bps">${owned}</div><h3>In the colony</h3><div class="rows">${done}</div>`;
  }

  private siteRow(w: World, b: Building) {
    const def = BUILDING_BY_ID[b.def];
    const left = remainingCost(b);
    const need = Object.keys(left).length;
    const pct = Math.round((b.progress / siteWork(b)) * 100);
    const status = need ? `Waiting on ${Object.entries(left).map(([r, n]) => `${Math.ceil(n ?? 0)} ${RESOURCES.find(x => x.id === r)!.name.toLowerCase()}`).join(', ')}` : `Building · ${pct}%`;
    const ratio = need ? 1 - sum(left) / Math.max(1, sum(def.cost)) : b.progress / siteWork(b);
    return `<button type="button" class="row compact site" data-act="building" data-arg="${b.uid}"><span class="who"><b>${esc(def.name)}</b><small>${esc(status)}</small></span><span class="mini ${need ? 'haul' : ''}"><i style="width:${Math.round(ratio * 100)}%"></i></span></button>`;
  }

  startPlacing(defId: string) {
    const w = this.getWorld();
    const c = this.view.viewCenter();
    const spot = findSpot(w, defId, c.x, c.y, false) ?? { x: Math.round(c.x), y: Math.round(c.y) };
    this.view.placing = { def: defId, x: spot.x, y: spot.y };
    this.view.focus(spot.x + BUILDING_BY_ID[defId].w / 2, spot.y + BUILDING_BY_ID[defId].h / 2, 0.55);
    this.open = false; this.detail = null; this.view.selected = null;
    this.render(true);
  }

  private renderPlaceBar(w: World) {
    const el = this.root.querySelector('#placebar') as HTMLElement;
    const pl = this.view.placing;
    if (!pl) { el.hidden = true; el.innerHTML = ''; return; }
    const def = BUILDING_BY_ID[pl.def];
    const chk = canPlace(w, pl.def, pl.x, pl.y);
    const html = `<div class="pb-text"><b>Placing ${esc(def.name)}</b><small>${chk.ok ? 'Tap the ground to move it. The light square is its door.' : esc(chk.reason)}</small></div>
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
      const mats = Object.entries(def.cost).map(([r, n]) => `<li><span>${RESOURCES.find(x => x.id === r)!.name}</span><b>${Math.floor(b.delivered[r as ResourceId] ?? 0)} / ${n}</b></li>`).join('');
      return `<div class="detail"><div class="d-head"><button type="button" class="ghost back" data-act="back">All buildings</button></div>
        <h2>${esc(def.name)}</h2><p class="blurb">Under construction.</p>
        <h3>Materials delivered</h3><ul class="thoughts">${mats || '<li><span>No materials needed</span></li>'}</ul>
        <h3>Work</h3><p class="prefs">${Math.round(b.progress * 10) / 10} of ${siteWork(b)} builder-hours. ${builders.length ? `${builders.map(c => esc(first(c))).join(', ')} on it now.` : laborers(w).length ? 'Laborers will get to it.' : 'Nobody is free. Take someone off a job to make them a laborer.'}</p>
        <button type="button" class="ghost danger" data-act="cancel-site" data-arg="${b.uid}">Cancel and return materials</button></div>`;
    }
    const workers = workersAt(w, b.uid);
    const recipe = def.recipe ? `<p class="prefs">${Object.keys(def.recipe.inputs).length ? `Uses ${Object.entries(def.recipe.inputs).map(([r, n]) => `${n} ${r === 'rawFood' ? 'raw food' : RESOURCES.find(x => x.id === r)!.name.toLowerCase()}`).join(' + ')} → ` : 'Makes '}1 ${RESOURCES.find(x => x.id === def.recipe!.output)!.name.toLowerCase()} · ${def.recipe.rate} per worker-hour</p>` : '';
    let staff = '';
    if (def.slots) {
      const cur = workers.map(c => `<div class="row static"><span class="dot" style="background:${hex(c.shirt)}"></span><span class="who"><b>${esc(c.name)}</b><small>${def.job === c.likes ? 'loves this job' : def.job === c.dislikes ? 'hates this job' : 'doesn’t mind it'}</small></span><button type="button" class="ghost" data-act="assign" data-arg="${c.id}:none">Remove</button></div>`).join('');
      const cand = workers.length < def.slots ? alive(w).filter(c => c.job !== b.uid).sort((a, z) => Number(z.likes === def.job) - Number(a.likes === def.job) || Number(a.dislikes === def.job) - Number(z.dislikes === def.job)).map(c => {
        const cw = buildingByUid(w, c.job);
        return `<button type="button" class="row" data-act="assign" data-arg="${c.id}:${b.uid}"><span class="dot" style="background:${hex(c.shirt)}"></span><span class="who"><b>${esc(c.name)}</b><small>${cw ? `now at ${esc(BUILDING_BY_ID[cw.def].name)}` : 'no job'}${c.likes === def.job ? ' · loves this' : c.dislikes === def.job ? ' · hates this' : ''}</small></span><span class="add">Assign</span></button>`;
      }).join('') : '';
      staff = `<h3>Workers ${workers.length}/${def.slots}</h3><div class="rows">${cur || '<p class="muted">Nobody works here.</p>'}</div>${cand ? `<h3>Assign someone</h3><div class="rows">${cand}</div>` : ''}`;
    } else if (def.beds) {
      const sleepers = alive(w).filter(c => c.bed === b.uid).map(c => esc(first(c))).join(', ');
      staff = `<p class="prefs">Sleeps ${def.beds}${sleepers ? `: ${sleepers}` : ''}.</p>`;
    }
    return `<div class="detail"><div class="d-head"><button type="button" class="ghost back" data-act="back">All buildings</button></div>
      <h2>${esc(def.name)}</h2><p class="blurb">${esc(def.blurb)}</p>${recipe}${staff}</div>`;
  }

  private logList(w: World) {
    return `<ol class="log">${w.log.slice(-60).reverse().map(l => `<li class="t-${l.tone}"><time>Day ${l.day}, ${String(l.hour).padStart(2, '0')}:00</time><span>${esc(l.text)}</span></li>`).join('')}</ol>`;
  }

  // ---------- Decisions ----------
  private renderModal(w: World, force: boolean) {
    const el = this.root.querySelector('#modal') as HTMLElement;
    let html = '';
    const d = w.decisions[0];
    if (w.status !== 'playing') html = this.endScreen(w);
    else if (d) {
      switch (d.kind) {
        case 'charter': html = this.cards(d.tier === 1 ? 'Your first charter' : `Charter ${d.tier} of 3`,
          d.tier === 1 ? 'The Crown wants proof this colony is worth the paperwork. Complete three charters before the frontier wears everyone down.' : 'The Crown has another demand. Choose one.',
          d.options.map(id => { const c = CHARTERS.find(x => x.id === id)!; return { title: c.name, body: c.desc, tag: `Tier ${c.tier}` }; })); break;
        case 'blueprint': html = this.cards('A new blueprint', 'Pick one building to add to what you can build this run.',
          d.options.map(id => { const b = BUILDING_BY_ID[id]; return { title: b.name, body: b.blurb, tag: `Costs ${costText(b.cost)}${b.slots ? ` · ${b.slots} worker${b.slots > 1 ? 's' : ''}` : ''}` }; })); break;
        case 'perk': html = this.cards('The Crown grants a boon', 'Choose one. It lasts the rest of the run.',
          d.options.map(id => ({ title: PERK_BY_ID[id].name, body: PERK_BY_ID[id].desc, tag: 'Boon' }))); break;
        case 'recruit': html = this.cards('Settlers at the edge of camp', `They’d like to join. You have ${beds(w)} beds for ${alive(w).length} colonists.`,
          d.options.map(c => ({ title: c.name, body: c.traits.map(t => `${TRAIT_BY_ID[t].name}: ${TRAIT_BY_ID[t].desc}`).join('\n'), tag: `Loves ${JOB_NAMES[c.likes]} · hates ${JOB_NAMES[c.dislikes]}`, color: hex(c.shirt) })),
          'Send them all away'); break;
        case 'event': {
          const ev = EVENTS.find(e => e.id === d.eventId)!;
          html = `<div class="card-wrap event"><p class="eyebrow">Something has happened</p><h2>${esc(ev.title)}</h2><p class="lede">${esc(ev.text)}</p>
            <div class="opts">${ev.options.map((o, i) => `<button type="button" class="opt" data-act="resolve" data-arg="${i}"><b>${esc(o.label)}</b><span>${esc(o.detail)}</span></button>`).join('')}</div></div>`;
          break;
        }
      }
    }
    if (force || html !== this.lastModal) { el.innerHTML = html; this.lastModal = html; }
    el.hidden = !html;
  }

  private cards(title: string, lede: string, opts: { title: string; body: string; tag: string; color?: string }[], skip?: string) {
    return `<div class="card-wrap"><p class="eyebrow">Choose one</p><h2>${esc(title)}</h2><p class="lede">${esc(lede)}</p>
      <div class="opts">${opts.map((o, i) => `<button type="button" class="opt" data-act="resolve" data-arg="${i}">
        <b>${o.color ? `<span class="dot" style="background:${o.color}"></span>` : ''}${esc(o.title)}</b>
        ${o.body.split('\n').map(line => `<span>${esc(line)}</span>`).join('')}<small>${esc(o.tag)}</small></button>`).join('')}</div>
      ${skip ? `<button type="button" class="ghost skip" data-act="resolve" data-arg="99">${esc(skip)}</button>` : ''}</div>`;
  }

  private endScreen(w: World) {
    const won = w.status === 'won';
    const s = w.stats;
    return `<div class="card-wrap end ${won ? 'won' : 'lost'}"><p class="eyebrow">${won ? 'Victory' : 'The colony collapsed'}</p>
      <h2>${won ? 'Mumblewood is a town' : 'The kettle remains'}</h2>
      <p class="lede">${won ? 'All three charters complete.' : `Too many settlers walked off into the woods.`} You lasted ${day(w)} days.</p>
      <dl class="stats"><div><dt>Charters</dt><dd>${w.chartersDone.length} / 3</dd></div><div><dt>Peak population</dt><dd>${s.peakPop}</dd></div>
      <div><dt>Couples formed</dt><dd>${s.couples}</dd></div><div><dt>Breakups</dt><dd>${s.breakups}</dd></div>
      <div><dt>Settlers who left</dt><dd>${s.departures}</dd></div><div><dt>Meals eaten</dt><dd>${s.mealsEaten}</dd></div></dl>
      <button type="button" class="act big" data-act="restart">Start a new colony</button></div>`;
  }
}
