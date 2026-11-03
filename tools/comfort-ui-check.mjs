import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
mkdirSync('dist/comfort-prototype', { recursive: true });
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, offline: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent(readFileSync('dist/comfort-prototype/index.html', 'utf8'));
    assert.equal(await page.locator('#comfort-value').innerText(), '90%');
    assert.equal(await page.locator('#current-rate').innerText(), '+0.35');
    assert.equal(await page.locator('#candidate-rate').innerText(), '+0.21');
    assert.equal(await page.locator('#difference').innerText(), '−0.14 strain/day');
    await page.locator('#comfort').fill('30');
    assert.equal(await page.locator('#current-rate').innerText(), '+0.77');
    assert.equal(await page.locator('#candidate-rate').innerText(), '+1.26');
    await page.locator('[data-mode=reward]').click();
    assert.equal(await page.locator('#candidate-rate').innerText(), '+0.77');
    assert.equal(await page.locator('[data-mode=reward]').getAttribute('aria-pressed'), 'true');
    await page.locator('#comfort').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#comfort-value').innerText(), '31%', 'slider works from keyboard');
    await page.locator('#people').fill('20');
    assert.doesNotMatch(await page.locator('#candidate-rate').innerText(), /NaN/);
    await page.locator('#day').fill('60');
    await page.locator('summary').first().click();
    assert.equal(await page.locator('details').first().locator('tbody tr').count(), 6);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page overflow on mobile');
    await page.screenshot({ path: `dist/comfort-prototype/${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`${width}px: offline load, shared curve calculations, profile selection, keyboard, diagnostics and layout passed`);
    await context.close();
  }
} finally { await browser.close(); }
