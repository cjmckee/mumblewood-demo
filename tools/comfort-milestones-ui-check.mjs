import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
 for (const width of [1440, 390, 320]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, offline: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent(readFileSync('dist/comfort-milestones-prototype/index.html', 'utf8'));
  assert.equal(await page.locator('#lab-level').innerText(), 'Level 3');
  assert.match(await page.locator('#lab-reward').innerText(), /5% chance of doubled/);
  await page.locator('#standing').selectOption('2');
  assert.equal(await page.locator('#lab-level').innerText(), 'Level 2');
  await page.locator('#lab-homes').fill('80');
  assert.equal(await page.locator('#lab-level').innerText(), 'Level 3');
  await page.locator('#lab-homes').focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#lab-level').innerText(), 'Level 2');
  await page.locator('#profile').selectOption('abundance');
  await page.locator('#lab-homes').fill('80');
  assert.match(await page.locator('#lab-reward').innerText(), /10% chance of doubled/);
  assert.equal(await page.locator('#live-level').getAttribute('data-samples'), '0');
  await page.locator('[data-hours="24"]').click();
  await page.waitForFunction(() => document.getElementById('live-level').dataset.samples === '24' && !document.querySelector('[data-hours="24"]').disabled, { timeout: 30000 });
  assert.match(await page.locator('#elapsed').innerText(), /24 hours played/);
  assert.doesNotMatch(await page.locator('#live-reward').innerText(), /Gathering/);
  await page.locator('#reset').click();
  assert.equal(await page.locator('#live-level').getAttribute('data-samples'), '0');
  await page.locator('#choice').selectOption('production');
  assert.match(await page.locator('#project').innerText(), /Stew kitchen/);
  await page.locator('#profile').selectOption('off');
  assert.match(await page.locator('#lab-reward').innerText(), /disabled/);
  assert.equal(await page.locator('#results tbody tr').count(), 5);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page overflow');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `dist/comfort-milestones-prototype/${width}.png`, fullPage: true });
  await context.close();
  console.log(`${width}px: threshold equality, charter requirements, keyboard controls, reward selection, real 24-hour simulation, restart, disabled baseline and layout passed`);
 }
} finally { await browser.close(); }
