// Build and serve dist first, then: node tools/recruit-ui-check.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { previewRecruits } from './recruit-prototype.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = 'dist/recruit-prototype'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  for (const [device, width, height] of [['desktop', 1440, 1000], ['phone', 390, 844], ['small-phone', 320, 640]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 600 });
    const page = await ctx.newPage(), errors = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.UI_URL || 'http://127.0.0.1:8765/dist/site/index.html');
    await page.waitForFunction(() => window.__game);
    await page.evaluate(previewRecruits);
    await page.evaluate(() => window.__game.view.app.ticker.stop());
    assert.equal(await page.locator('.rc-skill').count(), 9, `${device}: A is the default`);
    assert.equal(await page.locator('.rc-want.ok').count(), 1, `${device}: stocked sweet food supports Sweet tooth`);
    assert.equal(await page.locator('.recruit [title]').count(), 0, `${device}: no browser tooltips`);
    assert.equal(await page.locator('.recruit button button').count(), 0, `${device}: no nested controls`);
    await page.screenshot({ path: `${out}/${device}.png` });
    const want = page.locator('.rc-want').first(), trait = page.locator('.rc-trait').first();
    const tip = page.locator('#game-tooltip');
    const worldBefore = await page.evaluate(() => JSON.stringify(window.__game.world));
    await want.hover();
    await tip.waitFor({ state: 'visible' });
    assert.match(await tip.innerText(), /Sweet tooth/);
    assert.match(await tip.innerText(), /A sweet meal/);
    assert.match(await tip.innerText(), /Colony can support this/);
    assert.match(await tip.innerText(), /mood/);
    assert.equal(await want.getAttribute('aria-describedby'), 'game-tooltip');
    await page.screenshot({ path: `${out}/${device}-want.png` });
    // Moving into the explanation must keep it open (including its text for selection).
    await tip.hover(); await page.waitForTimeout(180);
    assert.equal(await tip.isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await tip.isVisible(), false);
    assert.equal(await page.locator('#modal').isVisible(), true);
    await trait.focus();
    assert.match(await tip.innerText(), /Sunny/);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__game.world)), worldBefore, `${device}: inspecting never recruits`);
    await page.evaluate(() => window.__game.ui.render(true));
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.helpName), 'Sunny', `${device}: help focus survives redraw`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    assert.equal(await tip.isVisible(), true, `${device}: Tab opens next trait`);
    await page.keyboard.press('Escape');
    if (width < 600) {
      await want.tap();
      assert.equal(await tip.isVisible(), true, `${device}: tap opens help`);
      assert.equal(await page.evaluate(() => JSON.stringify(window.__game.world)), worldBefore);
      await page.locator('#modal h2').tap();
      assert.equal(await tip.isVisible(), false, `${device}: outside tap dismisses help`);
    }
    // Every want's explanation fits, even near the bottom of a scrolled phone dialog.
    for (const id of ['sweetTooth', 'gourmand', 'tippler', 'bather', 'musicLover', 'greenThumb', 'homebody']) {
      await page.evaluate(id => { const g = window.__game; g.world.decisions[0].options[2].wants = [id]; g.ui.render(true); }, id);
      await page.locator('.recruit').last().locator('.rc-want').focus();
      const fits = await tip.evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
      assert(fits, `${device}: ${id} tooltip stays within viewport`);
    }
    assert.equal(await page.locator('.rc-take').last().isDisabled(), true);
    await page.locator('.rc-want').last().click();
    assert.equal(await tip.isVisible(), true, `${device}: unaffordable recruit still has help`);
    await page.keyboard.press('Escape');
    assert(await page.evaluate(() => [...document.querySelectorAll('#modal .recruit, #modal .rc-skill, #modal .help-chip')].every(e => e.getBoundingClientRect().right <= innerWidth)), `${device}: no card overflow`);
    await page.locator('.rc-take').first().click();
    assert.equal(await page.evaluate(() => window.__game.world.decisions.length), 0, `${device}: Invite resolves recruitment`);
    assert.equal(await tip.isVisible(), false);
    assert.deepEqual(errors, [], `${device}: no browser errors`);
    console.log(`${device}: layout, hover, keyboard, touch, focus, all wants, viewport fit and recruitment passed`);
    await ctx.close();
  }
} finally { await browser.close(); }
