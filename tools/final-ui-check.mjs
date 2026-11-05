import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:8767';
const out = 'dist/final-prototype'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

// Satisfy the actual final-charter conditions; advance the sim rather than assigning won.
function finishCharter(option = 'hall') {
  const route = typeof option === 'string' ? option : option.route;
  const g = window.__game, w = g.world;
  g.setSpeed(0); g.ui.resumeOpen = false;
  const original = w.colonists;
  w.colonists = Array.from({ length: 12 }, (_, i) => ({ ...structuredClone(original[i % original.length]), id: i + 1, left: false, died: false, mood: 90, hunger: 90, illness: null, meal: null, task: null }));
  w.nextColonistId = 13; w.hour = 24 * 71 + 6; w.name = 'Lantern <Grove>'; w.named = true;
  w.chartersDone = ['settled', 'bread']; w.charter = route; w.charterTier = 3;
  w.decisions = []; w.charterOffered = true;
  Object.assign(w.stats, { peakPop: 14, built: 46, mealsEaten: 1128, couples: 7, breakups: 2, departures: 1, deaths: 1, errands: 12, cured: 19 });
  w.buildings.push({ ...structuredClone(w.buildings[0]), uid: w.nextUid++, def: route === 'hall' ? 'hall' : 'pavilion', built: true, stage: 2, x: 20, y: 20 });
  if (route === 'longtable') w.feast = { done: true, called: false, readyAt: 0 };
  g.advance(1);
  const sceneLabel = document.querySelector('.cc-scene')?.getAttribute('aria-label');
  if (typeof option !== 'string' && option.restartImmediately) document.querySelector('[data-act=restart]').click();
  return { status: w.status, hour: w.hour, seed: w.seed, gold: w.gold, sceneLabel };
}

try {
 for (const [width, height] of [[1440, 1000], [390, 844], [320, 640]]) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', offline: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent(readFileSync(`${out}/index.html`, 'utf8'));
  assert.equal(await page.locator('.final-celebration').count(), 1);
  assert.match(await page.locator('.finale-thanks').innerText(), /Thank you for playing Mumblewood/);
  assert.deepEqual(await page.locator('.finale-highlights dd').allTextContents(), ['72', '12', '46', '1128']);
  assert(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length > 0));
  assert.equal(await page.locator('[data-act=restart]').isEnabled(), true, 'restart never waits for animation');
  await page.locator('[data-route=longtable]').click();
  assert.match(await page.locator('.cc-scene').getAttribute('aria-label'), /pavilion/);
  await page.locator('[data-calm]').click();
  assert.equal(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length), 0);
  await page.locator('.final-celebration').screenshot({ path: `${out}/${width}-preview-pavilion.png` });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-calm]').click();
  assert.equal(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length), 0, 'system reduced motion shows final scene');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('[data-act=restart]').click();
  assert.match(await page.locator('#modal').innerText(), /no charters completed/);
  assert.match(await page.locator('#preview-status').innerText(), /saved game is unchanged/);

  await context.setOffline(false); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${origin}/dist/site/index.html`);
  await page.waitForFunction(() => window.__game);
  const completed = await page.evaluate(finishCharter, 'hall');
  assert.equal(completed.status, 'won');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mumblewood.profile.v2'))?.runs.length === 1);
  assert.match(await page.locator('.final-celebration h2').innerText(), /Lantern <Grove> is a town/);
  assert.equal(await page.locator('.final-celebration img').count(), 0, 'colony names stay escaped');
  assert.deepEqual(await page.locator('.finale-highlights dd').allTextContents(), ['72', '12', '46', '1128']);
  await page.waitForTimeout(250);
  const before = await page.locator('.cc-build').first().evaluate(e => e.getAnimations()[0]?.currentTime ?? 3200);
  await page.evaluate(() => window.__game.ui.render(true));
  const after = await page.locator('.cc-build').first().evaluate(e => e.getAnimations()[0]?.currentTime ?? 3200);
  assert(after >= before - 30 && after > 100, 'live redraw preserves animation progress');
  await page.locator('.finale-details summary').click();
  await page.locator('.finale-details summary').focus();
  await page.evaluate(() => window.__game.ui.render(true));
  assert.equal(await page.locator('.finale-details').getAttribute('open'), '');
  assert.equal(await page.locator('.finale-details summary').evaluate(e => e === document.activeElement), true);
  await page.locator('[data-act=finale-peek]').click();
  assert.equal(await page.locator('#modal').isVisible(), false);
  assert.equal(await page.locator('#stage').evaluate(e => e.inert), false);
  const rules = await page.evaluate(() => JSON.stringify(window.__game.world.forbidden));
  await page.evaluate(() => { const g = window.__game; g.ui.open = true; g.ui.tab = 'colonists'; g.ui.render(true); document.querySelector('[data-key=food-rules]').open = true; });
  await page.locator('[data-act=food][data-arg=berries]').click();
  assert.equal(await page.evaluate(() => JSON.stringify(window.__game.world.forbidden)), rules, 'inspection cannot change the completed town');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__game.world.hour), completed.hour, 'finished town stays frozen during inspection');
  await page.locator('[data-act=finale-back]').click();
  assert.equal(await page.locator('.final-celebration').count(), 1);
  assert.equal(await page.evaluate(() => window.__game.world.gold), completed.gold, 'inspection never pays rewards again');
  await page.evaluate(() => window.__game.save());
  await page.reload(); await page.waitForFunction(() => window.__game);
  assert.equal(await page.evaluate(() => window.__game.world.status), 'won');
  assert.equal(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length), 0, 'resumed finale uses final illustration');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mumblewood.profile.v2')).runs.length), 1, 'reload records the result once');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('.final-celebration').screenshot({ path: `${out}/${width}-game-hall.png` });
  await page.locator('[data-act=restart]').scrollIntoViewIfNeeded();
  await page.locator('[data-act=restart]').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__game.world.status), 'playing');
  assert.equal(await page.evaluate(() => window.__game.world.chartersDone.length), 0);
  assert.equal(await page.evaluate(() => window.__game.ui.blocksSimulation), false, 'new settlement clears old dialogs');
  assert.notEqual(await page.evaluate(() => window.__game.world.seed), completed.seed);
  assert.equal(await page.evaluate(() => window.__game.canLoad()), true, 'fresh settlement is saved');
  assert.equal(await page.locator('.final-celebration').count(), 0);
  // Start again in the same JS turn as winning: the ticker has not had a chance to record it.
  const instant = await page.evaluate(finishCharter, { route: 'longtable', restartImmediately: true });
  assert.match(instant.sceneLabel, /pavilion/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mumblewood.profile.v2')).runs.length), 2);
  assert.equal(await page.evaluate(() => window.__game.world.status), 'playing');
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`${width}px: both final routes, stats, motion/reduced motion, redraw/focus, inspection, saved result, ledger dedupe and keyboard restart passed`);
 }
} finally { await browser.close(); }
