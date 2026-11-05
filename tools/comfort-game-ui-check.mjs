import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:8769';
mkdirSync('dist/comfort-game-check', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
 for (const [width, height] of [[1440, 1000], [390, 844], [320, 640]]) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(e.message));
  console.log(`${width}px: loading game`);
  await page.goto(`${origin}/dist/site/index.html`);
  await page.waitForFunction(() => window.__game);
  await page.evaluate(() => { window.__game.view.app.ticker.stop(); });
  assert.equal(await page.evaluate(() => window.__game.world.comfortMilestones.profile), 'balanced');
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.view.app.ticker.stop(); g.ui.profile.firstRunDone = true; g.world.named = true; g.world.decisions = []; g.ui.render(true); });
  await page.locator('[data-act=comfort-open]').click();
  assert.match(await page.locator('.comfort-level').innerText(), /24 more hours/);
  assert.equal(await page.locator('.comfort-track').count(), 3);
  assert.equal(await page.evaluate(() => window.__game.ui.blocksSimulation), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.comfort-card').count(), 0);
  assert.equal(await page.locator('[data-act=comfort-open]').evaluate(e => e === document.activeElement), true);
  // Controlled history exercises the actual game UI and real milestone calculation.
  await page.evaluate(() => {
   const g = window.__game, w = g.world; w.hour = 100; w.chartersDone = ['settled'];
   w.comfortMilestones.history = Array.from({ length: 24 }, (_, i) => ({ hour: 77 + i, homes: .7, meals: .75, evenings: .45 })); g.ui.render(true);
  });
  assert.match(await page.locator('.comfort-chip').innerText(), /Comfort II/);
  await page.locator('[data-act=comfort-open]').click();
  assert.equal(await page.locator('.comfort-track.qualifies').count(), 2);
  assert.match(await page.locator('.comfort-hint').innerText(), /stage/);
  await page.locator('.comfort-ladder summary').click();
  await page.locator('.comfort-ladder summary').focus();
  await page.evaluate(() => window.__game.ui.render(true));
  assert.equal(await page.locator('.comfort-ladder').getAttribute('open'), '');
  assert.equal(await page.locator('.comfort-ladder summary').evaluate(e => e === document.activeElement), true);
  assert.equal(await page.locator('.comfort-ladder li.active').count(), 2);
  assert.doesNotMatch(await page.locator('.comfort-card').innerText(), /Your next level|After this charter|Provision over time/);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert(await page.locator('.comfort-card').evaluate(e => e.scrollWidth <= e.clientWidth + 1));
  await page.locator('#modal').screenshot({ path: `dist/comfort-game-check/${width}-comfort.png` });
  await page.keyboard.press('Escape');
  console.log(`${width}px: panel checked`);
  await page.evaluate(() => { const g = window.__game; g.world.decisions = [{ kind: 'recruit', options: g.world.colonists.slice(0, 3).map(c => ({ ...structuredClone(c), fee: 0 })) }]; g.ui.render(true); });
  await page.locator('[data-act=peek]').click();
  const decision = await page.evaluate(() => JSON.stringify(window.__game.world.decisions));
  await page.locator('[data-act=comfort-open]').click();
  assert.equal(await page.locator('.comfort-card').count(), 1, 'comfort can be inspected while peeking at a pending choice');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#peekbar').isVisible(), true);
  await page.locator('[data-act=peek-back]').click();
  assert.equal(await page.evaluate(() => JSON.stringify(window.__game.world.decisions)), decision, 'inspection leaves the choice intact');
  await page.evaluate(() => { const g = window.__game; g.world.decisions = []; g.ui.render(true); });
  const saved = await page.evaluate(() => { window.__game.save(); return JSON.stringify(window.__game.world.comfortMilestones); });
  await page.reload(); await page.waitForFunction(() => window.__game);
  await page.evaluate(() => { window.__game.view.app.ticker.stop(); });
  assert.equal(await page.evaluate(() => JSON.stringify(window.__game.world.comfortMilestones)), saved);
  await page.evaluate(() => window.__game.setSpeed(0)); await page.locator('[data-act=resume]').click();
  await page.evaluate(() => { const g = window.__game; g.world.chartersDone = ['settled', 'bread']; g.ui.render(true); });
  assert.match(await page.locator('.comfort-chip-main b').innerText(), /Comfort I$/);
  // Legacy saves start an honest warmup and preserve settlement progress.
  const hour = await page.evaluate(() => { const g = window.__game; delete g.world.comfortMilestones; g.save(); return g.world.hour; });
  await page.reload(); await page.waitForFunction(() => window.__game);
  await page.evaluate(() => { window.__game.view.app.ticker.stop(); });
  assert.deepEqual(await page.evaluate(() => ({ profile: window.__game.world.comfortMilestones.profile, samples: window.__game.world.comfortMilestones.history.length, hour: window.__game.world.hour })), { profile: 'balanced', samples: 0, hour });
  await page.evaluate(() => window.__game.setSpeed(0)); await page.locator('[data-act=resume]').click();
  // A completed settlement can restart into the same enabled system.
  await page.evaluate(() => { const g = window.__game; g.world.status = 'won'; g.world.chartersDone = ['settled', 'bread', 'hall']; g.world.decisions = []; g.ui.render(true); });
  await page.locator('[data-act=restart]').click();
  assert.deepEqual(await page.evaluate(() => [window.__game.world.status, window.__game.world.comfortMilestones.profile, window.__game.world.comfortMilestones.history.length]), ['playing', 'balanced', 0]);
  assert.equal(await page.locator('.comfort-card').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`${width}px: live comfort, focus, thresholds, persistence, migration and restart passed`);
 }
} finally { await browser.close(); }
