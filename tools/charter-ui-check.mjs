// Build and serve the repository first. Uses the same browser setup as test:ui.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { previewCharterCompletion } from './charter-prototype.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = 'dist/charter-prototype'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  for (const [device, width, height] of [['desktop', 1440, 1100], ['phone', 390, 844], ['small-phone', 320, 640]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await ctx.newPage(), errors = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.UI_URL || 'http://127.0.0.1:8765/dist/site/index.html');
    await page.waitForFunction(() => window.__game);
    await page.evaluate(() => window.__game.view.app.ticker.stop());
    for (const tier of [1, 2]) {
      await page.evaluate(previewCharterCompletion, tier);
      const modal = page.locator('#modal'), card = page.locator('.charter-celebration');
      assert.equal(await card.count(), 1);
      assert.match(await card.innerText(), tier === 1 ? /Cooked meals/ : /Better meals/);
      assert.match(await card.innerText(), tier === 1 ? /75% of the shelter need/ : /50% of the shelter need/);
      assert.match(await card.innerText(), tier === 1 ? /Health/ : /Variety/);
      assert.equal(await card.locator('li').filter({ hasText: 'A cold drink' }).count(), tier === 1 ? 1 : 0);
      assert.equal(await modal.getAttribute('role'), 'dialog');
      assert.equal(await modal.getAttribute('aria-labelledby'), 'dialog-title');
      assert.equal(await page.locator('#hud').evaluate(e => e.inert), true);
      assert(await card.evaluate(e => e.getBoundingClientRect().top >= 0), 'long card starts in view');
      assert(await card.evaluate(e => [...e.querySelectorAll('*')].every(n => n.getBoundingClientRect().right <= innerWidth + 1)), 'no horizontal overflow');
      assert(await card.evaluate(e => [...e.querySelectorAll('.cc-expectations li > div')].every(n => n.getBoundingClientRect().width >= 150)), 'every expectation has a readable text column');
      const economy = () => page.evaluate(() => ({ gold: window.__game.world.gold, strain: window.__game.world.strain, hour: window.__game.world.hour }));
      const before = await economy();
      await page.screenshot({ path: `${out}/${device}-${tier === 1 ? 'settlement' : 'village'}.png` });
      await page.keyboard.press('Escape');
      assert.equal(await card.isVisible(), true, 'completion cannot be accidentally dismissed');
      await page.locator('.cc-continue').focus();
      await page.evaluate(() => window.__game.ui.render(true));
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('cc-continue')), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('#modal')), true, 'focus remains trapped');
      await page.locator('.peek-btn').click();
      assert.equal(await modal.isVisible(), false);
      assert.equal(await page.locator('#peekbar').isVisible(), true);
      assert.equal(await page.evaluate(() => window.__game.world.decisions[0].kind), 'charter-complete');
      await page.locator('#peekbar button').click();
      assert.equal(await card.isVisible(), true);
      // Save the pending decision and use the real resume flow.
      await page.evaluate(() => localStorage.setItem('mumblewood.save.v1', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), world: window.__game.world })));
      await page.reload(); await page.waitForFunction(() => window.__game);
      await page.evaluate(() => window.__game.view.app.ticker.stop());
      await page.locator('[data-act=resume]').click();
      assert.equal(await card.isVisible(), true, 'saved completion is shown on resume');
      assert.deepEqual(await economy(), before, 'save/resume and inspection do not award rewards again');
      await page.locator('.cc-continue').focus(); await page.keyboard.press('Enter');
      assert.equal(await card.count(), 0);
      assert.equal(await page.evaluate(() => window.__game.world.decisions[0].kind), 'charter');
      assert.deepEqual(await economy(), before, 'Continue only acknowledges completion');
      await page.locator('#modal [data-act=resolve]').first().click();
      assert.equal(await page.evaluate(() => window.__game.world.decisions[0].kind), 'perk');
      await page.locator('#modal [data-act=resolve]').first().click();
      assert.equal(await page.evaluate(() => window.__game.world.decisions.length), 0);
      await page.evaluate(() => window.__game.ui.render(true));
      assert.equal(await card.count(), 0, 'completed celebration never reappears');
    }
    await page.evaluate(previewCharterCompletion, 1);
    await page.evaluate(() => { const g = window.__game; g.world.startDate = { season: 'winter', day: 1 }; g.ui.render(true); });
    assert.doesNotMatch(await page.locator('.cc-expectations').innerText(), /A cold drink/);
    await page.evaluate(() => { const g = window.__game; g.world.startDate = { season: 'spring', day: 1 }; g.ui.render(true); });
    assert.doesNotMatch(await page.locator('.cc-expectations').innerText(), /Something fresh/);
    await page.evaluate(() => { const g = window.__game; g.world.decisions = []; g.world.chartersDone = ['settled', 'bread', 'hall']; g.world.status = 'won'; g.ui.render(true); });
    assert.equal(await page.locator('.charter-celebration:not(.final-celebration)').count(), 0);
    assert.equal(await page.locator('.final-celebration').count(), 1, 'the third charter uses its own finale');
    assert.equal(await page.locator('.cc-continue').count(), 0, 'no fourth charter is promised');
    assert.deepEqual(errors, []);
    console.log(`${device}: both transitions, seasonal copy, viewport fit, keyboard, peek, save/resume, rewards and next choices passed`);
    await ctx.close();
  }
} finally { await browser.close(); }
