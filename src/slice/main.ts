// Notables-and-crews slice: the page. The map is the main UI; notables live in the dock at the bottom.
import {
  World, Notable, Building, Decision, createWorld, start, tick, choose, day, hourOfDay, total, people, workers, freeBeds,
  notable, building, assign, place, canPlace, spots, setRecipe, demolish, festival, festivalReady, festivalCost, cookedCount,
  charterParts, charterAction, doCharterAction, partsMet, leaderQuality, crewSpeed, moodTarget, thoughts, bond, rel, neighbours,
  wantMet, joinThreshold, pendingOpinions, atLeast, missing, NEAR, tile, gap, colonySpeed,
} from './sim';
import { BUILDING, BUILDINGS, ALWAYS_BUILDABLE, GOOD_NAME, QUALITY_NAME, CRAFT_NAME, TRAIT, WANTS, CHARTER, DISHES, DRINKS, Good, Craft, TUNE, RAW_FOOD } from './content';
import { icon } from '../ui/icons';
import { avatar } from '../ui/avatars';

const SAVE = 'mumblewood.slice.v1';
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const first = (n: Notable) => n.name.split(' ')[0];
const goodIcon = (g: Good, cls = '') => icon(g === 'wine' ? 'cider' : g, cls, GOOD_NAME[g]);
const qBadge = (q: number) => `<span class="q q${q}" title="${QUALITY_NAME[q]}">${QUALITY_NAME[q]}</span>`;
const moodColor = (m: number) => (m >= 65 ? '#8ccf6f' : m >= 45 ? '#e8c547' : m >= 25 ? '#e89a47' : '#e0694a');
const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const deltaCls = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');

let w: World = load() ?? fresh();
function fresh() { const x = createWorld(Math.floor(Math.random() * 1e9)); start(x); return x; }
function load(): World | null { try { const s = localStorage.getItem(SAVE); return s ? JSON.parse(s) : null; } catch { return null; } }
function save() { try { localStorage.setItem(SAVE, JSON.stringify(w)); } catch { /* storage may be unavailable */ } }

type Sheet = { kind: 'notable'; id: number } | { kind: 'building'; id: number } | { kind: 'build' } | { kind: 'log' } | { kind: 'charter' } | null;
const ui = { speed: 1, sheet: null as Sheet, placing: null as string | null, peeking: false, logSeen: w.log.length };

// ---------- map rendering ----------
const canvas = $('map') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let T = 24, OX = 0, OY = 0;
const images = new Map<string, HTMLImageElement>();
function img(key: string, svg: string): HTMLImageElement | null {
  let im = images.get(key);
  if (!im) {
    im = new Image(); im.onload = () => draw();
    const s = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); images.set(key, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
function hash(x: number, y: number) { let h = x * 374761393 + y * 668265263 + w.seed; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function resize() {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  T = Math.floor(Math.min(r.width / w.w, r.height / w.h));
  OX = Math.floor((r.width - T * w.w) / 2); OY = Math.min(8, Math.floor((r.height - T * w.h) / 2));
  draw();
}
function rr(x: number, y: number, ww: number, hh: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, ww, hh, r); }
function draw() {
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  // terrain
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    const t = tile(w, x, y)!, px = OX + x * T, py = OY + y * T, v = hash(x, y);
    ctx.fillStyle = t === 'water' ? (v < 0.5 ? '#36678f' : '#3a6d96') : t === 'soil' ? (v < 0.5 ? '#6e5236' : '#755839') : (v < 0.5 ? '#4b7537' : '#4f7a3a');
    ctx.fillRect(px, py, T + 0.5, T + 0.5);
    if (t === 'soil') { ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + 2, py + (i * T) / 4); ctx.lineTo(px + T - 2, py + (i * T) / 4); ctx.stroke(); } }
    if (t === 'trees') {
      for (const [dx, dy, s] of [[0.3, 0.35, 0.3], [0.7, 0.45, 0.28], [0.45, 0.72, 0.32]]) {
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.arc(px + dx * T + 1.5, py + dy * T + 2, s * T, 0, 7); ctx.fill();
        ctx.fillStyle = v < 0.5 ? '#2d5a2c' : '#315f2e'; ctx.beginPath(); ctx.arc(px + dx * T, py + dy * T, s * T, 0, 7); ctx.fill();
      }
    }
    if (t === 'bushes') {
      for (const [dx, dy] of [[0.3, 0.35], [0.68, 0.6]]) {
        ctx.fillStyle = '#3d6b33'; ctx.beginPath(); ctx.arc(px + dx * T, py + dy * T, 0.24 * T, 0, 7); ctx.fill();
        ctx.fillStyle = '#d24b6a'; for (const [ex, ey] of [[-0.08, -0.05], [0.07, 0.03], [-0.02, 0.09]]) { ctx.beginPath(); ctx.arc(px + (dx + ex) * T, py + (dy + ey) * T, 0.045 * T, 0, 7); ctx.fill(); }
      }
    }
  }
  // placement: where it could go
  if (ui.placing) {
    for (const [x, y] of spots(w, ui.placing)) { ctx.fillStyle = 'rgba(232,163,61,.28)'; ctx.fillRect(OX + x * T + 1, OY + y * T + 1, T - 2, T - 2); }
  }
  // the selected notable: who they'd see from their workplace
  const sel = ui.sheet?.kind === 'notable' ? notable(w, ui.sheet.id) : ui.sheet?.kind === 'building' ? notable(w, building(w, ui.sheet.id)?.leader ?? null) : undefined;
  const selB = sel ? building(w, sel.workplace) : ui.sheet?.kind === 'building' ? building(w, ui.sheet.id) : undefined;
  if (selB && BUILDING[selB.def].craft) {
    const d = BUILDING[selB.def];
    ctx.strokeStyle = 'rgba(241,233,216,.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    rr(OX + (selB.x - NEAR - 1 + 1) * T, OY + (selB.y - NEAR) * T, (d.w + NEAR * 2) * T, (d.h + NEAR * 2) * T, 8); ctx.stroke(); ctx.setLineDash([]);
  }
  // buildings
  for (const b of w.buildings) drawBuilding(b);
  // bonds between the selected notable and their neighbours
  if (sel && selB) for (const o of neighbours(w, sel)) {
    const k = bond(w, sel.id, o.id); if (!k) continue;
    const ob = building(w, o.workplace)!;
    const c = { rival: '#e0694a', friend: '#8ccf6f', partner: '#e58fb5', ex: '#b48ad6' }[k];
    const [ax, ay] = center(selB), [bx, by] = center(ob);
    ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
}
const center = (b: Building): [number, number] => { const d = BUILDING[b.def]; return [OX + (b.x + d.w / 2) * T, OY + (b.y + d.h / 2) * T]; };
function drawBuilding(b: Building) {
  const d = BUILDING[b.def], px = OX + b.x * T + 2, py = OY + b.y * T + 2, bw = d.w * T - 4, bh = d.h * T - 4;
  const selected = (ui.sheet?.kind === 'building' && ui.sheet.id === b.id) || (ui.sheet?.kind === 'notable' && notable(w, ui.sheet.id)?.workplace === b.id);
  ctx.globalAlpha = b.built ? 1 : 0.55;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; rr(px + 2, py + 3, bw, bh, 7); ctx.fill();
  ctx.fillStyle = d.decor ? '#4f7a3a' : '#e6dcc3'; rr(px, py, bw, bh, 7); ctx.fill();
  ctx.fillStyle = d.color; rr(px, py, bw, Math.max(4, bh * 0.18), 4); ctx.fill();
  if (selected) { ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 2.5; rr(px - 1, py - 1, bw + 2, bh + 2, 8); ctx.stroke(); }
  const s = Math.min(bw, bh) * (d.decor ? 0.95 : 0.86);
  if (b.def === 'hearth') {
    ctx.fillStyle = '#6b5a4a'; ctx.beginPath(); ctx.arc(px + bw / 2, py + bh / 2, s * 0.45, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2913a'; ctx.beginPath(); ctx.moveTo(px + bw / 2, py + bh / 2 - s * 0.35); ctx.quadraticCurveTo(px + bw / 2 + s * 0.25, py + bh / 2, px + bw / 2, py + bh / 2 + s * 0.2); ctx.quadraticCurveTo(px + bw / 2 - s * 0.25, py + bh / 2, px + bw / 2, py + bh / 2 - s * 0.35); ctx.fill();
  } else {
    const im = img('b:' + b.def, icon(b.def)); if (im) ctx.drawImage(im, px + (bw - s) / 2, py + (bh - s) / 2 + bh * 0.05, s, s);
  }
  ctx.globalAlpha = 1;
  if (!b.built) {
    const p = Math.min(1, b.progress / d.work);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(px + 4, py + bh - 8, bw - 8, 5, 2); ctx.fill();
    ctx.fillStyle = '#e8a33d'; rr(px + 4, py + bh - 8, (bw - 8) * p, 5, 2); ctx.fill();
    return;
  }
  if (!d.craft) return;
  const n = notable(w, b.leader);
  // the leader's face, ringed by mood
  if (n) {
    const r = Math.max(8, T * 0.34), cx = px + bw - r * 0.7, cy = py + r * 0.7;
    ctx.fillStyle = moodColor(n.mood); ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, 7); ctx.fill();
    const im = img('a:' + n.id, avatar(n));
    if (im) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip(); ctx.drawImage(im, cx - r, cy - r, r * 2, r * 2); ctx.restore(); }
  }
  // the crew as dots
  const count = b.workers;
  for (let i = 0; i < Math.min(count, 8); i++) {
    ctx.fillStyle = n ? '#f1e9d8' : '#a9a594';
    ctx.beginPath(); ctx.arc(px + 5 + i * Math.min(6, (bw - 10) / 7), py + bh - 5, Math.max(1.8, T * 0.07), 0, 7); ctx.fill();
  }
  // stalled: a warning mark
  const stalled = b.status && b.status !== 'Working' && hourOfDay(w) >= TUNE.workStart && hourOfDay(w) < TUNE.workEnd;
  const needsLeader = !n && d.recipes!.some(r => Object.keys(r.take).length || r.anyRaw);
  if (stalled || needsLeader) {
    const cx = px + 8, cy = py + 9;
    ctx.fillStyle = needsLeader ? '#e8a33d' : '#e8c547'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a2000'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(needsLeader ? '?' : '!', cx, cy + 0.5);
  }
}
canvas.addEventListener('click', e => {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left - OX) / T), y = Math.floor((e.clientY - r.top - OY) / T);
  if (ui.placing) {
    const why = place(w, ui.placing, x, y);
    if (why) toast(why, 'bad'); else { ui.placing = null; save(); }
    render(); return;
  }
  const b = w.buildings.find(b => x >= b.x && y >= b.y && x < b.x + BUILDING[b.def].w && y < b.y + BUILDING[b.def].h);
  if (b && b.def !== 'hearth') {
    const n = notable(w, b.leader);
    ui.sheet = { kind: 'building', id: b.id };
    void n;
  } else ui.sheet = null;
  render();
});

// ---------- top, charter strip and dock ----------
function renderTop() {
  const h = hourOfDay(w);
  const raw = RAW_FOOD.reduce((a, g) => a + total(w, g), 0), cooked = cookedCount(w), fine = atLeast(w, DISHES, 2);
  const drinks = DRINKS.reduce((a, g) => a + total(w, g), 0);
  const beds = freeBeds(w);
  $('top').innerHTML = `
    <div class="row">
      <div class="clock">Day ${day(w)}<small>${String(h).padStart(2, '0')}:00</small></div>
      <div class="speed">${['❚❚', '1×', '2×', '3×'].map((l, i) => `<button data-speed="${i}" class="${ui.speed === i ? 'on' : ''}" aria-label="${i ? `speed ${i}` : 'pause'}">${l}</button>`).join('')}</div>
      <div class="strain" title="Frontier strain: rises every day, lowers every notable's mood. At 100 the colony breaks.">strain <span class="bar"><i style="width:${w.strain}%"></i></span><b>${Math.floor(w.strain)}</b></div>
    </div>
    <div class="goods">
      <span class="chip ${raw < people(w) ? 'bad' : ''}">${goodIcon('berries')}${raw}<small>raw</small></span>
      <span class="chip">${goodIcon('stew')}${cooked}<small>cooked</small>${fine ? ` ${qBadge(2)}${fine}` : ''}</span>
      ${drinks ? `<span class="chip">${goodIcon('ale')}${drinks}</span>` : ''}
      <span class="chip">${goodIcon('wood')}${total(w, 'wood')}</span>
      <span class="chip">${goodIcon('planks')}${total(w, 'planks')}</span>
      <span class="chip ${beds < 0 ? 'bad' : ''}">${icon('leanto')}${beds < 0 ? `${-beds} need beds` : `${beds} beds free`}</span>
      ${w.unfed ? `<span class="chip bad">${w.unfed} hungry</span>` : ''}
    </div>`;
}
function renderCharter() {
  const c = w.charter;
  if (!c) {
    $('charter').innerHTML = `<span class="tier">${w.done.length ? `Charter ${w.done.length}/3 done` : ''}</span><span class="part">The Crown's envoy is on the way</span>`;
    return;
  }
  const parts = charterParts(w), act = charterAction(w), ready = partsMet(w);
  $('charter').innerHTML = `
    <div><div class="tier">Charter ${w.done.length + 1}/3</div><div class="name">${CHARTER[c.id].name}</div></div>
    <div class="parts">${parts.map(p => `<span class="part ${p.have >= p.need ? 'met' : ''}"><b>${Math.max(-99, p.have)}/${p.need}</b> ${p.label}</span>`).join('')}</div>
    ${act ? `<button class="act ${ready ? '' : 'ghost'}" data-charter-act ${ready ? '' : 'disabled'}>${act}</button>` : ''}`;
}
function alertFor(n: Notable): string {
  if (n.workplace === null) return 'Not leading anything';
  if (n.mood < 25) return 'Miserable';
  if (n.noBed) return 'A worker wants to join but there’s no bed';
  return '';
}
function renderDock() {
  const sel = ui.sheet?.kind === 'notable' ? ui.sheet.id : -1;
  const faces = w.notables.map(n => {
    const a = alertFor(n);
    return `<button class="face ${sel === n.id ? 'sel' : ''}" data-notable="${n.id}" aria-label="${esc(n.name)}, mood ${Math.round(n.mood)}">
      ${avatar(n)}<span class="ring" style="background:conic-gradient(${moodColor(n.mood)} ${n.mood * 3.6}deg, #3a4236 0)"></span>
      <span class="crew">${n.crew + 1}</span>${a ? '<span class="alert">!</span>' : ''}</button>`;
  }).join('');
  const fest = festivalReady(w);
  $('dock').innerHTML = `<div id="faces">${faces}</div>
    <button class="tool ${ui.sheet?.kind === 'build' ? 'on' : ''}" data-open="build"><svg class="i" viewBox="0 0 24 24"><path d="M14 6l4 4M4 20l9-9M12 4l8 8-3 3-8-8z"/></svg>Build</button>
    <button class="tool" data-festival ${fest ? '' : 'disabled'} title="Festival: costs ${festivalCost(w)} cooked dishes, eases strain"><svg class="i" viewBox="0 0 24 24"><path d="M5 21l4-12 6 6zM14 4l1 2M19 9l-2 1M17 4l-2 3M20 13l-2-1"/></svg>Festival</button>
    <button class="tool ${ui.sheet?.kind === 'log' ? 'on' : ''}" data-open="log"><svg class="i" viewBox="0 0 24 24"><path d="M5 5h14M5 10h14M5 15h10M5 20h7"/></svg>Log</button>`;
}

// ---------- sheets ----------
function openSheet(head: string, body: string) {
  const s = $('sheet');
  s.hidden = false;
  const keep = s.querySelector('.body')?.scrollTop ?? 0;
  s.innerHTML = `<div class="head">${head}<button class="close" data-close aria-label="Close">✕</button></div><div class="body">${body}</div>`;
  s.querySelector('.body')!.scrollTop = keep;
}
/** what a notable's mood target would be leading building bid (null = nothing) */
function moodIf(n: Notable, bid: number | null): number {
  const was = n.workplace, wasB = building(w, was), other = bid !== null ? building(w, bid) : undefined, otherLeader = other?.leader ?? null;
  if (wasB) wasB.leader = null;
  if (other) other.leader = n.id;
  n.workplace = bid;
  const sum = thoughts(w, n).reduce((a, t) => a + t.value, 0);
  n.workplace = was; if (wasB) wasB.leader = n.id; if (other) other.leader = otherLeader;
  if (wasB && other === wasB) wasB.leader = n.id;
  return sum;
}
function notableSheet(n: Notable) {
  const b = building(w, n.workplace), craft = b ? BUILDING[b.def].craft! : null;
  const target = moodTarget(n), trend = target > n.mood + 2 ? '▲' : target < n.mood - 2 ? '▼' : '';
  const head = `${avatar(n)}<div><h2>${esc(n.name)}</h2><div class="sub">${b ? `Leads the ${BUILDING[b.def].name.toLowerCase()}` : '<span class="warn">Not leading anything</span>'}</div></div>
    <div class="big" style="color:${moodColor(n.mood)}">${Math.round(n.mood)}<small style="font-size:14px">${trend}</small></div>`;
  const pips = Array.from({ length: joinThreshold(n) }, (_, i) => `<i class="${i < n.rep ? 'f' : ''}"></i>`).join('');
  const crafts = (Object.keys(CRAFT_NAME) as Craft[]).sort((a, c) => n.skill[c] - n.skill[a]).slice(0, 3);
  const want = WANTS[n.want], met = wantMet(w, n);
  const others = w.notables.filter(o => o !== n);
  // where could they lead? sorted by how happy they'd be
  const now = moodIf(n, n.workplace);
  const places = w.buildings.filter(x => x.built && BUILDING[x.def].craft).map(x => ({ x, m: moodIf(n, x.id), q: leaderQuality(n, BUILDING[x.def].craft!) }))
    .sort((a, b2) => b2.m - a.m);
  const body = `
    <h3>Crew</h3>
    <div class="item"><div class="grow"><div class="t">${n.crew} worker${n.crew === 1 ? '' : 's'} + ${first(n)}</div>
      <div class="d">${n.noBed ? '<span class="warn">Someone wants to join, but there’s no free bed.</span>' : n.crew >= TUNE.crewCap ? 'A full crew.' : `Next hand <span class="pips">${pips}</span> · grows while ${first(n)} is busy and in a good mood`}</div></div>
      ${craft ? `<div style="text-align:right">${qBadge(leaderQuality(n, craft))}<div class="d">${crewSpeed(w, n, craft).toFixed(1)}× speed</div></div>` : ''}</div>
    <h3>Craft</h3>
    <div class="tags">${crafts.map(c => `<span class="tag">${icon(CRAFT_ICON_OF(c))} ${CRAFT_NAME[c]}${c === n.passion ? ' <span style="color:var(--love)">♥</span>' : ''} ${qBadge(leaderQuality(n, c))}</span>`).join('')}</div>
    <h3>Traits and want</h3>
    <div class="tags">${n.traits.map(t => `<span class="tag"><b>${TRAIT[t].name}</b>${TRAIT[t].desc}</span>`).join('')}
      <span class="tag ${met ? 'met' : 'unmet'}"><b>${want.name} ${met ? '<span class="goodt">✓ +6</span>' : '<span class="badt">−4</span>'}</b>${want.desc}</span></div>
    <h3>Mood</h3>
    <div>${n.thoughts.slice(0, 9).map(t => `<div class="th"><span>${esc(t.label)}</span><b class="${t.value >= 0 ? 'pos' : 'neg'}">${sign(t.value)}</b></div>`).join('')}</div>
    ${others.length ? `<h3>People</h3><div class="list">${others.map(o => {
      const k = bond(w, n.id, o.id), op = Math.round(rel(w, n.id, o.id).op);
      return `<button class="item" data-notable="${o.id}">${avatar(o)}<div class="grow"><div class="t">${esc(o.name)}</div><div class="d">feeling ${sign(op)}${o.workplace && n.workplace && gap(building(w, n.workplace)!, building(w, o.workplace)!) <= NEAR ? ' · works nearby' : ''}</div></div>${k ? `<span class="bond ${k}">${k === 'rival' ? 'Can’t stand' : k === 'friend' ? 'Friend' : k === 'partner' ? 'Partner' : 'Ex'}</span>` : ''}</button>`;
    }).join('')}</div>` : ''}
    <h3>Lead somewhere else</h3>
    <div class="list">${places.map(({ x, m, q }) => {
      const d = BUILDING[x.def], cur = x.id === n.workplace, other = notable(w, x.leader);
      const delta = Math.round(m - now);
      return `<button class="item ${cur ? 'on' : ''}" data-assign="${n.id}:${x.id}" ${cur ? 'disabled' : ''}>${icon(x.def, 'lg')}<div class="grow"><div class="t">${d.name}${d.craft === n.passion ? ' <span style="color:var(--love)">♥</span>' : ''}</div>
        <div class="d">${cur ? 'Here now' : other ? `Replaces ${esc(first(other))}` : 'No leader'}</div></div>${qBadge(q)}${cur ? '' : `<span class="delta ${deltaCls(delta)}">${sign(delta)} mood</span>`}</button>`;
    }).join('')}${n.workplace ? `<button class="item" data-assign="${n.id}:-1"><div class="grow"><div class="t">Stop leading</div><div class="d">The crew waits with ${first(n)}</div></div></button>` : ''}</div>`;
  openSheet(head, body);
}
const CRAFT_ICON_OF = (c: Craft) => ({ foraging: 'forager', fishing: 'dock', farming: 'field', woodcutting: 'woodcutter', cooking: 'kitchen', baking: 'bakery', brewing: 'brewery', carpentry: 'sawmill' }[c]);
function buildingSheet(b: Building) {
  const d = BUILDING[b.def], n = notable(w, b.leader);
  const status = !b.built ? `Building · ${Math.floor((b.progress / d.work) * 100)}%` : b.status || 'Idle';
  const stall = b.built && b.status && b.status !== 'Working';
  const head = `${icon(b.def, 'xl')}<div><h2>${d.name}</h2><div class="sub">${esc(d.blurb)}</div></div>`;
  let body = `<div class="status ${stall ? 'stall' : ''}">${esc(status)}${b.built && !n && b.workers ? ` · ${b.workers} from the commons, at ${Math.round(TUNE.unledSpeed * colonySpeed(w) * 100)}% speed` : ''}</div>`;
  if (d.craft) {
    if (n) {
      body += `<h3>Leader</h3><button class="item" data-notable="${n.id}">${avatar(n)}<div class="grow"><div class="t">${esc(n.name)}</div><div class="d">crew ${n.crew} · ${crewSpeed(w, n, d.craft).toFixed(1)}× speed · mood ${Math.round(n.mood)}</div></div>${qBadge(leaderQuality(n, d.craft))}</button>`;
    }
    const pickers = w.notables.filter(o => o.id !== b.leader).map(o => ({ o, m: moodIf(o, b.id) - moodIf(o, o.workplace), q: leaderQuality(o, d.craft!) })).sort((a, c) => c.q - a.q || c.m - a.m);
    body += `<h3>${n ? 'Swap leader' : 'Pick a leader'}</h3><div class="list">${pickers.map(({ o, m, q }) => {
      const near = w.notables.filter(x => x !== o && x.workplace && x.workplace !== b.id && gap(b, building(w, x.workplace)!) <= NEAR);
      const flags = near.map(x => { const k = bond(w, o.id, x.id); return k ? `<span class="bond ${k}">${k === 'rival' ? `⚔ ${esc(first(x))}` : k === 'friend' ? `${esc(first(x))}` : k === 'partner' ? `♥ ${esc(first(x))}` : esc(first(x))}</span>` : ''; }).join(' ');
      const now = building(w, o.workplace);
      return `<button class="item" data-assign="${o.id}:${b.id}">${avatar(o)}<div class="grow"><div class="t">${esc(o.name)}${d.craft === o.passion ? ' <span style="color:var(--love)">♥</span>' : ''}</div><div class="d">${now ? `leaves the ${BUILDING[now.def].name.toLowerCase()}` : 'free'} · crew ${o.crew} ${flags}</div></div>${qBadge(q)}<span class="delta ${deltaCls(Math.round(m))}">${sign(Math.round(m))}</span></button>`;
    }).join('')}</div>`;
    if (d.recipes!.length) {
      body += `<h3>Making</h3><div class="list">${d.recipes!.map((r, i) => {
        const ins = [...Object.entries(r.take).map(([g, k]) => `${k}${goodIcon(g as Good)}`), ...(r.anyRaw ? [`${r.anyRaw}${goodIcon('berries')}/${goodIcon('fish')}`] : [])].join(' + ');
        const short = b.built && i === b.recipe ? missing(w, r) : '';
        return `<button class="item ${i === b.recipe ? 'on' : ''}" data-recipe="${b.id}:${i}"><div class="grow recipe">${ins ? `${ins} → ` : ''}${r.make}${goodIcon(r.out)} <b>${GOOD_NAME[r.out]}</b></div>${short ? `<span class="d warn">no ${esc(short)}</span>` : `<span class="d">${total(w, r.out)} in stock</span>`}</button>`;
      }).join('')}</div>`;
    }
  }
  body += `<div style="margin-top:14px"><button class="act ghost" data-demolish="${b.id}">${b.built ? 'Tear down' : 'Cancel (refund)'}</button></div>`;
  openSheet(head, body);
}
function buildSheet() {
  const defs = [...ALWAYS_BUILDABLE, ...w.owned];
  const cost = (id: string) => Object.entries(BUILDING[id].cost).map(([g, n]) => `${n}${goodIcon(g as Good)}`).join(' ');
  const afford = (id: string) => Object.entries(BUILDING[id].cost).every(([g, n]) => total(w, g as Good) >= (n as number));
  openSheet(`<div><h2>Build</h2><div class="sub">Drafted blueprints are outlined</div></div>`,
    `<div class="grid">${defs.map(id => `<button class="card ${w.owned.includes(id) ? 'new' : ''}" data-place="${id}" ${afford(id) ? '' : 'disabled'}>${icon(id, 'xl')}<b>${BUILDING[id].name}</b><span class="cost">${cost(id) || 'free'}</span></button>`).join('')}</div>
     <p class="note">Shacks sleep 4 workers. Notables take cottages first. Workers without a bed add strain.</p>`);
}
function charterSheet() {
  const c = w.charter;
  if (!c) { openSheet('<div><h2>Charters</h2></div>', `<p class="note">${w.done.length} of 3 done. The Crown's envoy brings the next one in the morning.</p>`); return; }
  let extra = '';
  if (c.id === 'wedding' || c.id === 'hatchet') {
    const pairs: [Notable, Notable, number][] = [];
    for (const a of w.notables) for (const b of w.notables) if (a.id < b.id) pairs.push([a, b, rel(w, a.id, b.id).op]);
    const show = c.id === 'hatchet' && c.pair ? pairs.filter(([a, b]) => a.id === c.pair![0] && b.id === c.pair![1]) : pairs.filter(p => p[2] >= 20 && rel(w, p[0].id, p[1].id).kind !== 'ex').sort((x, y) => y[2] - x[2]).slice(0, 5);
    extra = `<h3>${c.id === 'wedding' ? 'Closest pairs' : 'The pair'}</h3><div class="list">${show.map(([a, b, op]) => {
      const near = a.workplace && b.workplace && gap(building(w, a.workplace)!, building(w, b.workplace)!) <= NEAR;
      return `<div class="item">${avatar(a)}${avatar(b)}<div class="grow"><div class="t">${esc(first(a))} & ${esc(first(b))}</div><div class="d">feeling ${sign(Math.round(op))} · ${near ? 'work near each other' : '<span class="warn">work apart</span>'}</div></div></div>`;
    }).join('') || '<p class="note">Nobody is close yet.</p>'}</div>
    <p class="note">Notables who work within ${NEAR} tiles of each other warm up each evening while both are at mood 60+, and cool off when either is below 40. ${c.id === 'wedding' ? 'Good friends may fall in love.' : ''}</p>`;
  }
  openSheet(`<div><div class="sub">Charter ${w.done.length + 1} of 3</div><h2>${CHARTER[c.id].name}</h2></div>`,
    `<p>${CHARTER[c.id].desc}</p><div class="list">${charterParts(w).map(p => `<div class="th"><span>${p.label}</span><b class="${p.have >= p.need ? 'pos' : ''}">${p.have}/${p.need}</b></div>`).join('')}</div>${extra}`);
}
function logSheet() {
  openSheet(`<div><h2>Log</h2><div class="sub">Day ${day(w)} · ${people(w)} people · ${w.notables.length} notables</div></div>`,
    `<div class="list">${w.log.slice().reverse().slice(0, 40).map(l => `<div class="th"><span class="${l.tone === 'good' ? 'goodt' : l.tone === 'bad' ? 'badt' : ''}">${esc(l.text)}</span><span class="d">d${Math.floor(l.hour / 24) + 1}</span></div>`).join('')}</div>
     <div style="margin-top:14px"><button class="act ghost" data-newrun>Start a new run</button></div>`);
}
function renderSheet() {
  const s = ui.sheet;
  if (!s) { $('sheet').hidden = true; return; }
  if (s.kind === 'notable') { const n = notable(w, s.id); if (n) notableSheet(n); else { ui.sheet = null; $('sheet').hidden = true; } }
  if (s.kind === 'building') { const b = building(w, s.id); if (b) buildingSheet(b); else { ui.sheet = null; $('sheet').hidden = true; } }
  if (s.kind === 'build') buildSheet();
  if (s.kind === 'log') logSheet();
  if (s.kind === 'charter') charterSheet();
}

// ---------- decisions ----------
function notableCard(n: Notable, i: number) {
  const feelings = Object.entries(pendingOpinions(n)).map(([id, op]) => {
    const o = notable(w, +id); if (!o) return '';
    if (op <= -30) return `<span class="bond rival">Can’t stand ${esc(first(o))}</span>`;
    if (op >= 35) return `<span class="bond friend">Fond of ${esc(first(o))}</span>`;
    return '';
  }).join(' ');
  return `<button class="opt" data-choose="${i}"><div class="t">${avatar(n)} ${esc(n.name)}</div>
    <div class="d">${icon(CRAFT_ICON_OF(n.passion))} <b style="color:var(--text)">${CRAFT_NAME[n.passion]}</b> ${qBadge(leaderQuality(n, n.passion))} · wants: ${WANTS[n.want].name.toLowerCase()}</div>
    <div class="d">${n.traits.map(t => `<b style="color:var(--text)">${TRAIT[t].name}</b>: ${TRAIT[t].desc}`).join('<br>')}</div>
    ${feelings ? `<div class="d" style="margin-top:4px">${feelings}</div>` : ''}</button>`;
}
function renderModal() {
  const d: Decision | undefined = w.decisions[0];
  const m = $('modal');
  if (w.outcome) {
    m.hidden = false; $('peekbar').hidden = true;
    m.innerHTML = `<div class="dlg end"><div class="kicker">Day ${day(w)}</div><h2>${w.outcome === 'won' ? 'Mumblewood is a town' : 'Mumblewood falls apart'}</h2>
      <p>${esc(w.endReason)}</p>
      <p class="note">${w.notables.length} notables, ${workers(w)} workers. ${w.stats.joined} joined crews, ${w.stats.left} walked off. ${w.stats.departed.length ? `Left: ${w.stats.departed.map(esc).join(', ')}.` : 'No notable left.'}<br>Drafted: ${w.stats.drafted.map(id => BUILDING[id].name).join(', ') || 'nothing'}.</p>
      <button class="act" data-newrun>Start a new run</button></div>`;
    return;
  }
  if (!d || ui.peeking) { m.hidden = true; if (!d) m.innerHTML = ''; $('peekbar').hidden = !d || !ui.peeking; return; }
  m.hidden = false; $('peekbar').hidden = true;
  const peek = `<button class="peek" data-peek>Look at the map</button>`;
  let html = '';
  if (d.kind === 'charter') html = `<div class="kicker">The Crown · charter ${w.done.length + 1} of 3 ${peek}</div><h2>Choose a charter</h2><p>Finish it for the Crown's favour: strain eases and you pick a reward.</p>
    ${d.options.map((id, i) => `<button class="opt" data-choose="${i}"><div class="t">${CHARTER[id].name}</div><div class="d">${CHARTER[id].desc}</div></button>`).join('')}`;
  if (d.kind === 'blueprint') html = `<div class="kicker">A blueprint ${peek}</div><h2>Pick one to keep</h2>
    ${d.options.map((id, i) => `<button class="opt" data-choose="${i}"><div class="t">${icon(id, 'lg')} ${BUILDING[id].name}</div><div class="d">${BUILDING[id].blurb} · ${Object.entries(BUILDING[id].cost).map(([g, n]) => `${n} ${g}`).join(', ')}</div></button>`).join('')}`;
  if (d.kind === 'notable') html = `<div class="kicker">A notable wants to settle ${peek}</div><h2>Who joins Mumblewood?</h2><p>They arrive with one helper. Their crew grows as they do well.</p>${d.options.map(notableCard).join('')}`;
  if (d.kind === 'reward') html = `<div class="kicker">Charter complete</div><h2>The Crown is pleased</h2><p>Strain eases. Choose your reward.</p>
    <button class="opt" data-choose="0"><div class="t">A new notable</div><div class="d">Pick one of three.</div></button><button class="opt" data-choose="1"><div class="t">A new blueprint</div><div class="d">Pick one of three.</div></button>`;
  if (d.kind === 'event') {
    const faces = d.data.map(id => notable(w, id)).filter(Boolean).map(n => avatar(n!)).join('');
    html = `<div class="kicker">Day ${day(w)} ${peek}</div><div style="display:flex;gap:6px;margin-top:6px">${d.id === 'fight' || d.id === 'romance' ? faces : ''}</div><h2>${esc(d.title)}</h2><p>${esc(d.text)}</p>
      ${d.options.map((o, i) => `<button class="opt" data-choose="${i}"><div class="t">${esc(o.label)}</div>${o.detail ? `<div class="d">${esc(o.detail)}</div>` : ''}</button>`).join('')}`;
  }
  m.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">${html}</div>`;
}

// ---------- events ----------
function toast(text: string, tone: 'good' | 'bad' | 'info' = 'info') {
  const el = document.createElement('div'); el.className = `toast ${tone}`; el.textContent = text;
  $('toasts').appendChild(el); setTimeout(() => el.remove(), 4600);
  while ($('toasts').children.length > 3) $('toasts').firstElementChild!.remove();
}
document.addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest('button');
  if (!t) { if ((e.target as HTMLElement).closest('#charter')) { ui.sheet = ui.sheet?.kind === 'charter' ? null : { kind: 'charter' }; render(); } return; }
  const ds = t.dataset;
  if (ds.speed) ui.speed = +ds.speed;
  if (ds.notable) ui.sheet = ui.sheet?.kind === 'notable' && ui.sheet.id === +ds.notable && t.classList.contains('face') ? null : { kind: 'notable', id: +ds.notable };
  if (ds.open) ui.sheet = ui.sheet?.kind === ds.open ? null : { kind: ds.open as 'build' | 'log' };
  if (ds.close !== undefined) ui.sheet = null;
  if (ds.assign) { const [n, b] = ds.assign.split(':').map(Number); assign(w, n, b < 0 ? null : b); save(); }
  if (ds.recipe) { const [b, i] = ds.recipe.split(':').map(Number); setRecipe(w, b, i); save(); }
  if (ds.place) { ui.placing = ds.place; ui.sheet = null; }
  if (ds.demolish) { demolish(w, +ds.demolish); ui.sheet = null; save(); }
  if (ds.cancelPlace !== undefined) ui.placing = null;
  if (ds.festival !== undefined) { const why = festival(w); if (why) toast(why, 'bad'); save(); }
  if (ds.charterAct !== undefined) { const why = doCharterAction(w); if (why) toast(why, 'bad'); save(); }
  if (ds.choose) { choose(w, +ds.choose); ui.peeking = false; save(); }
  if (ds.peek !== undefined) ui.peeking = true;
  if (ds.newrun !== undefined) {
    if (w.outcome || ds.armed) { w = fresh(); ui.sheet = null; ui.logSeen = 0; save(); resize(); }
    else { t.dataset.armed = '1'; t.textContent = 'Tap again to lose this run'; return; }
  }
  render();
});
$('peekbar').addEventListener('click', () => { ui.peeking = false; render(); });

function renderPlacing() {
  const p = $('placing');
  if (!ui.placing) { p.hidden = true; return; }
  p.hidden = false;
  p.innerHTML = `${icon(ui.placing, 'lg')}<span>Tap a lit tile for the ${BUILDING[ui.placing].name.toLowerCase()}.${spots(w, ui.placing).length ? '' : ` <b class="badt">${canPlace(w, ui.placing, 0, 0) ?? 'Nowhere fits'}</b>`}</span><button class="act ghost" data-cancel-place>Cancel</button>`;
}
function render() {
  renderTop(); renderCharter(); renderDock();
  document.documentElement.style.setProperty('--dock', `${$('dock').offsetHeight}px`);
  renderSheet(); renderModal(); renderPlacing(); draw();
  for (; ui.logSeen < w.log.length; ui.logSeen++) { const l = w.log[ui.logSeen]; if (l.tone !== 'info' || /charter/i.test(l.text)) toast(l.text, l.tone); }
}

// ---------- the loop ----------
const HOURS_PER_SEC = [0, 0.8, 1.6, 3.2];
let acc = 0, last = performance.now(), lastHud = 0;
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  const blocked = !!w.decisions.length || !!w.outcome;
  if (!blocked && ui.speed) {
    acc += dt * HOURS_PER_SEC[ui.speed];
    let ticked = false;
    while (acc >= 1 && !w.decisions.length && !w.outcome) { acc -= 1; tick(w); ticked = true; }
    if (ticked) { save(); render(); lastHud = now; }
  }
  if (blocked) acc = 0;
  if (now - lastHud > 1000) { lastHud = now; draw(); }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', resize);
(window as unknown as { __slice: unknown }).__slice = { get world() { return w; }, ui, render, tick: (n: number) => { for (let i = 0; i < n && !w.decisions.length; i++) tick(w); render(); } };
resize(); render(); requestAnimationFrame(frame);
