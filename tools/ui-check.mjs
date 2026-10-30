// Browser regressions for actionable information, focus, navigation and small screens.
// Build and serve dist first. UI_URL defaults to http://127.0.0.1:8765/site/index.html.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = 'dist/ui-check'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox','--enable-unsafe-swiftshader'] });
let failures = 0;
const check = (condition, message) => { console.log(`${condition ? 'ok' : 'FAIL'} ${message}`); if (!condition) failures++; };
try {
for (const [device,width,height] of [['desktop',1440,900],['phone',390,844],['small-phone',320,640]]) {
  const ctx = await browser.newContext({viewport:{width,height}});
  const p = await ctx.newPage(); const errors=[]; p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.UI_URL || 'http://127.0.0.1:8765/site/index.html');
  await p.waitForFunction(()=>window.__game);
  await p.evaluate(()=>{window.__game.setSpeed(0); window.__game.view.app.ticker.maxFPS=3; window.__game.world.decisions=[]; window.__game.ui.render(true)});
  const state = fn => p.evaluate(fn);
  const initialCollapsed = await state(()=>document.querySelector('[data-act=charter-toggle]').getAttribute('aria-expanded')==='false');
  check(initialCollapsed===(width<=600),`${device}: charter defaults to compact on phones and expanded on desktop`);
  await p.evaluate(()=>{const g=window.__game;g.world.charter='settled';g.ui.charterCollapsed=true;g.ui.render(true)});
  const compactHeight=await state(()=>document.querySelector('#hud .status').getBoundingClientRect().height);
  check(compactHeight<=96&&await state(()=>document.querySelector('.status .ch-name').innerText&&document.querySelector('.status [role=progressbar]')&&document.querySelector('#colony-status-details').hidden),`${device}: compact charter keeps its goal and progress in under 96px`);
  await p.locator('[data-act=charter-toggle]').click();
  const expandedHeight=await state(()=>document.querySelector('#hud .status').getBoundingClientRect().height);
  check(expandedHeight>compactHeight+60&&await state(()=>!document.querySelector('#colony-status-details').hidden&&document.querySelector('[data-act=charter-toggle]').getAttribute('aria-expanded')==='true'),`${device}: tapping expands all requirements and colony controls`);
  await p.screenshot({path:`${out}/${device}-charter-expanded.png`});
  await p.locator('[data-act=charter-toggle]').focus();await p.keyboard.press('Enter');
  check(await state(()=>{
    const g=window.__game;g.world.res.wood++;g.ui.render(true);
    return document.querySelector('#colony-status-details').hidden&&document.activeElement?.dataset.act==='charter-toggle';
  }),`${device}: keyboard collapse survives live updates and preserves focus`);
  await p.screenshot({path:`${out}/${device}-charter-compact.png`});
  await p.reload();await p.waitForFunction(()=>window.__game);
  await p.evaluate(()=>{const g=window.__game;g.setSpeed(0);g.view.app.ticker.maxFPS=3;g.world.decisions=[];g.ui.resumeOpen=false;g.ui.render(true)});
  check(await state(()=>document.querySelector('[data-act=charter-toggle]').getAttribute('aria-expanded')==='false'),`${device}: charter preference survives reload`);

  check(await state(()=>{
    const g=window.__game;g.ui.open=true;g.ui.tab='colonists';g.ui.render(true);
    return ['apples','bread','skewers'].every(id=>document.querySelector(`[data-act=food][data-arg=${id}]`));
  }),`${device}: all food controls exist`);
  await p.evaluate(()=>{ const g=window.__game;g.world.forbidden.push('bread');g.ui.render(true);document.querySelector('[data-key=food-rules]').open=true; });
  await p.locator('[data-act=food][data-arg=bread]').click();
  check(await state(()=>!window.__game.world.forbidden.includes('bread')),`${device}: reserved bread can be released`);
  check(await state(()=>{
    const g=window.__game; const b=g.world.buildings.find(b=>b.def==='forager');b.off=[0,1];g.ui.tab='build';g.ui.detail=null;g.ui.buildMode='manage';g.ui.render(true);
    return document.querySelector('.sheet-body').innerText.includes('Recipes off');
  }),`${device}: recipes off is not mislabeled as missing ingredients`);
  check(await state(()=>{
    const g=window.__game;g.ui.tab='build';g.ui.detail=null;g.ui.buildMode='catalog';g.ui.render(true);document.querySelector('.sheet-body').scrollTop=500;
    document.querySelector('[data-act=tab][data-arg=colonists]').click();
    return document.querySelector('.sheet-body').scrollTop===0;
  }),`${device}: a different panel does not inherit Build scroll`);
  check(await state(()=>{
    const g=window.__game;const row=document.querySelector('#hud .res'); row.scrollLeft=10000;const before=row.scrollLeft;
    const speed=document.querySelector('[data-act=speed][data-arg="0"]');speed.focus();g.world.res.wood++;g.ui.render(true);
    return document.querySelector('#hud .res').scrollLeft===before && document.activeElement?.dataset.act==='speed';
  }),`${device}: HUD updates preserve horizontal scroll and keyboard focus`);
  await p.evaluate(()=>{window.__game.ui.open=false;window.__game.ui.charterCollapsed=false;window.__game.ui.render(true)});
  await p.locator('[data-act=strain-open]').click();
  check(await state(()=>document.querySelector('#modal').getAttribute('role')==='dialog'&&document.querySelector('#hud').inert&&window.__game.ui.blocksSimulation),`${device}: modal has semantics, background isolation and pauses play`);
  await p.locator('#modal button').last().focus(); await p.keyboard.press('Tab');
  check(await state(()=>document.querySelector('#modal').contains(document.activeElement)),`${device}: Tab remains in dialog`);
  await p.keyboard.press('Escape');
  check(await state(()=>document.querySelector('#modal').hidden && document.activeElement?.dataset.act==='strain-open'),`${device}: Escape dismisses optional dialog and restores focus`);
  await p.evaluate(()=>{const g=window.__game;g.ui.tab='ledger';g.ui.open=true;g.ui.detail=null;g.ui.render(true)});
  await p.locator('.job-row').first().click();
  check(await state(()=>window.__game.ui.tab==='build'&&document.querySelector('.sheet-body [data-act=building]')),`${device}: ledger jobs open a workplace chooser`);
  await p.locator('.sheet-body [data-act=building]').first().click();
  check(await state(()=>window.__game.ui.detail?.kind==='building'&&document.querySelector('[data-act=assign]')),`${device}: chooser reaches staffing controls`);
  await p.evaluate(()=>{
    const g=window.__game,b=g.world.buildings.find(b=>b.def==='woodcutter');
    g.ui.detail={kind:'building',id:b.uid};g.ui.open=true;g.ui.render(true);
    document.querySelector(`[data-key="targets-${b.uid}"]`).open=true;
  });
  const target=p.locator('[data-production-limit][data-output=wood]');
  await target.fill('12');
  check(await state(()=>{
    window.__game.ui.render(true);const input=document.querySelector('[data-production-limit][data-output=wood]');
    return input.value==='12' && document.activeElement===input;
  }),`${device}: live updates preserve production target drafts and focus`);
  await target.press('Tab');
  check(await state(()=>window.__game.world.buildings.find(b=>b.def==='woodcutter').productionLimits?.wood===12),`${device}: production target still saves`);
  await p.locator('[data-act=recipe-priority][data-arg$=":1:-1"]').click();
  check(await state(()=>window.__game.world.buildings.find(b=>b.def==='woodcutter').recipeOrder?.[0]===1),`${device}: recipe priority controls still reorder production`);
  await p.evaluate(()=>{const b=window.__game.world.buildings.find(b=>b.def==='woodcutter');b.recipeOrder=undefined;b.productionLimits={}});
  check(await state(()=>{
    const g=window.__game;g.ui.open=true;g.ui.tab='issues';g.ui.detail=null;g.world.res.wood=0;g.ui.render(true);
    const c=document.querySelector('[data-act=fix]');if(!c)return false;const before=JSON.stringify(g.world);c.click();return JSON.stringify(g.world)===before && g.ui.tab==='build';
  }),`${device}: a concern navigates without spending or reassigning`);
  await p.evaluate(()=>{
    const g=window.__game;const c=g.world.colonists.find(c=>!c.left);c.illness={name:'Test illness',severity:50};c.hunger=0;c.bed=null;
    g.ui.tab='colonists';g.ui.open=true;g.ui.detail={kind:'colonist',id:c.id};g.ui.render(true);
  });
  check(await state(()=>document.querySelector('.urgent [data-act=need][data-arg=health]')&&document.querySelector('[data-act=jobs]')&&document.querySelector('[data-act=source][data-arg=coats]')),`${device}: illness and job remedies are exposed`);
  await p.locator('[data-act=jobs]').click();
  check(await state(()=>document.querySelector('[data-key=person-jobs]').open),`${device}: change job expands assignment`);
  await p.screenshot({path:`${out}/${device}-colonist.png`});
  // Long decisions must retain a reachable top and scrollable bottom.
  await p.evaluate(()=>{const g=window.__game;g.world.decisions=[{kind:'recruit',options:g.world.colonists.slice(0,3)}];g.ui.render(true)});
  const fit = await state(()=>{const modal=document.querySelector('#modal'), card=modal.querySelector('.card-wrap');return {top:card.getBoundingClientRect().top,scroll:modal.scrollHeight,height:modal.clientHeight};});
  check(fit.top>=0,`${device}: long decision starts in view`);
  await p.screenshot({path:`${out}/${device}-recruit.png`});
  const overflow = await state(()=>[...document.querySelectorAll('#sheet *,#modal *')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().right>innerWidth+1).map(e=>e.className));
  check(!overflow.length,`${device}: panels have no horizontal overflow (${overflow.join(',')})`);
  check(await state(()=>{
    const g=window.__game;
    const signatures=[...document.querySelectorAll('#modal .avatar')].map(e=>e.dataset.portrait);
    const c=g.world.decisions[0].options[0];const signature=signatures[0];
    g.world.decisions=[];g.ui.open=true;g.ui.detail={kind:'colonist',id:c.id};g.ui.render(true);
    const same=document.querySelector('.avatar-large')?.dataset.portrait===signature;
    g.world.decisions=[{kind:'recruit',options:g.world.colonists.slice(0,3)}];g.ui.render(true);
    return same && new Set(signatures).size===signatures.length;
  }),`${device}: portraits are distinct and consistent between recruitment and detail`);
  // A decision cannot be dismissed with Escape.
  await p.keyboard.press('Escape');
  check(await state(()=>!document.querySelector('#modal').hidden),`${device}: mandatory choice remains open`);
  // A capped sale must display and transact the same quantity.
  await p.evaluate(()=>{const g=window.__game;g.world.decisions=[{kind:'trade'}];g.world.caravan={trader:'pedlar',leaves:g.world.hour+24,stock:{},blueprints:[],sold:{wood:19},x:20,y:20};g.world.res.wood=2;g.ui.render(true)});
  const sale = p.locator('[data-act=trade-sell][data-arg^="wood:"]');
  const saleText=await sale.first().innerText();
  await sale.first().click();
  check(saleText.includes('Sell 1')&&await state(()=>window.__game.world.res.wood===1),`${device}: sale label and actual capped quantity agree`);
  await p.evaluate(()=>{const g=window.__game;g.world.decisions=[];g.ui.render(true);g.ui.startPlacing('woodcutter');document.activeElement?.blur()});
  await p.keyboard.press('Escape');
  check(await state(()=>!window.__game.view.placing),`${device}: Escape cancels placement even without a focused control`);
  // looking at the colony during a decision: one button hides the card, panels work, play stays paused, a bar brings it back
  await p.evaluate(()=>{const g=window.__game;g.world.decisions=[];g.ui.open=false;g.event('bard');});
  await p.locator('#modal .peek-btn').click();
  const hourBefore=await state(()=>window.__game.world.hour);
  await p.evaluate(()=>window.__game.setSpeed(3)); await p.waitForTimeout(600);
  check(await state(()=>document.querySelector('#modal').hidden&&!document.querySelector('#peekbar').hidden&&!document.querySelector('#hud').inert&&!document.querySelector('#sheet').inert),`${device}: peeking hides the card and frees the HUD and panel`);
  await p.locator('#sheet [data-act=tab][data-arg=ledger]').click();
  check(await state(()=>window.__game.ui.open&&window.__game.ui.tab==='ledger'&&window.__game.world.decisions.length===1),`${device}: panels open while the choice waits`);
  check(await p.evaluate(h=>window.__game.world.hour===h,hourBefore),`${device}: play stays paused while peeking`);
  await p.locator('#peekbar button').click();
  check(await state(()=>!document.querySelector('#modal').hidden&&document.querySelector('#peekbar').hidden),`${device}: back to the choice`);
  await p.evaluate(()=>{const g=window.__game;g.setSpeed(0);g.world.decisions=[];g.ui.render(true);});
  check(!errors.length,`${device}: no page errors (${errors.join(';')})`);
  await ctx.close();
}
} finally { await browser.close(); }
process.exitCode=failures?1:0;
