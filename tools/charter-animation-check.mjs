// Checks motion and records frames from the standalone preview.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { previewCharterCompletion } from './charter-prototype.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:8765';
const out = 'dist/charter-prototype'; mkdirSync(`${out}/frames`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, reducedMotion: 'no-preference' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/dist/charter-prototype/index.html`);
  assert.equal(await page.evaluate(() => !!window.__game), false, 'preview needs no game boot');
  const frameAt = time => page.locator('.cc-scene').evaluate((scene, time) => {
    scene.classList.add('cc-animated');
    for (const animation of scene.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = time; }
  }, time);
  assert(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length > 0));
  await page.evaluate(() => { window.cancelAnimationFrame = () => {}; window.requestAnimationFrame = () => 0; });
  for (const tier of [1, 2]) {
    await page.locator(`[data-preview-tier="${tier}"]`).click();
    for (let i = 0; i <= 48; i++) {
      await frameAt(i * 50);
      await page.locator('.cc-scene').screenshot({ path: `${out}/frames/${tier}-${String(i).padStart(3, '0')}.png`, animations: 'allow' });
    }
    await page.locator('.charter-celebration').screenshot({ path: `${out}/animated-${tier === 1 ? 'settlement' : 'village'}.png`, animations: 'allow' });
  }
  await page.locator('[data-preview-calm]').click();
  assert.equal(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length), 0, 'calm preview shows final scene');
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.setContent(readFileSync(`${out}/index.html`, 'utf8'));
  assert.equal(await offline.locator('.charter-celebration').count(), 1, 'artifact works without network assets');
  await offline.locator('[data-preview-tier="2"]').click();
  assert.match(await offline.locator('h2').innerText(), /village/);
  await offline.close(); await context.setOffline(false);
  await page.goto(process.env.UI_URL || `${base}/dist/site/index.html`);
  await page.waitForFunction(() => window.__game);
  await page.evaluate(() => window.__game.view.app.ticker.stop());
  await page.evaluate(previewCharterCompletion, 1);
  assert(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length > 0), 'actual game plays the scene');
  await page.waitForTimeout(500);
  const before = await page.locator('.cc-build').first().evaluate(e => e.getAnimations()[0].currentTime);
  await page.evaluate(() => window.__game.ui.render(true));
  const after = await page.locator('.cc-build').first().evaluate(e => e.getAnimations()[0].currentTime);
  assert(after >= before - 30, 'redraw preserves elapsed animation time');
  await page.waitForTimeout(2500); await page.evaluate(() => window.__game.ui.render(true));
  assert.equal(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length), 0, 'finished scene stays finished');
  await page.locator('.peek-btn').click(); await page.locator('#peekbar button').click();
  assert.equal(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length), 0, 'inspection does not replay');
  await page.evaluate(() => localStorage.setItem('mumblewood.save.v1', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), world: window.__game.world })));
  await page.reload(); await page.waitForFunction(() => window.__game);
  await page.evaluate(() => window.__game.view.app.ticker.stop());
  await page.locator('[data-act=resume]').click();
  assert.equal(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length), 0, 'save/resume shows the finished scene');
  await page.evaluate(previewCharterCompletion, 2);
  await page.locator('.cc-continue').click();
  assert.equal(await page.evaluate(() => window.__game.world.decisions[0].kind), 'charter', 'Continue works during animation');
  await page.evaluate(() => { const g = window.__game; g.ui.prefs.calm = true; g.ui.applyPrefs(); });
  await page.evaluate(previewCharterCompletion, 1);
  assert.equal(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length), 0, 'calm setting shows final scene');
  await page.evaluate(() => { const g = window.__game; g.ui.prefs.calm = false; g.ui.applyPrefs(); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(previewCharterCompletion, 2);
  assert.equal(await page.locator('.cc-scene').evaluate(e => e.getAnimations({ subtree: true }).length), 0, 'system reduced motion shows final scene');
  assert.deepEqual(errors, []);
  console.log('animation: offline preview, both scenes, timeline, redraw continuity, inspection, early Continue and reduced motion passed');
  await context.close();
} finally { await browser.close(); }
