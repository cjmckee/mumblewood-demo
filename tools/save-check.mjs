// Browser check for save and resume: build first (node build.mjs), then: node tools/save-check.mjs [outDir=dist]
// Plays, reloads, continues, restarts, and checks old or broken saves are ignored. Uses the pre-installed Playwright.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const page_ = fileURLToPath(new URL('../dist/mumblewood.html', import.meta.url));
const out = process.argv[2] ?? 'dist';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message));
const ready = () => p.waitForFunction(() => window.__game?.world, null, { timeout: 20000 });
const state = () => p.evaluate(() => { const w = window.__game.world; return { hour: w.hour, day: window.__game.day(), pop: w.colonists.filter(c => !c.left).length, rng: w.rngState, json: JSON.stringify(w), modal: !document.getElementById('modal').hidden, text: document.getElementById('modal').innerText.toLowerCase() }; });

await p.goto(process.env.UI_URL || 'file://' + page_); await ready();
let s = await state();
ok(s.day === 1 && !s.text.includes('welcome back'), 'a first visit starts a new colony, no welcome card');
await p.evaluate(() => { const g = window.__game; g.autoplay(24 * 6.4); g.setSpeed(0); });
const saved = await p.evaluate(() => window.__game.save());
ok(!!saved && saved.world.hour > 24 * 6, `the run saves (day ${Math.floor(saved?.world.hour / 24) + 1})`);
const before = await state();

await p.reload(); await ready();
s = await state();
ok(s.text.includes('welcome back') && s.text.includes('continue'), 'after a reload the welcome-back card offers Continue');
ok(s.json === before.json, 'the loaded world is exactly the saved one');
await p.waitForTimeout(1500);
ok((await state()).hour === s.hour, 'the clock waits while the card is up');
await p.screenshot({ path: `${out}/phone-welcome.png` });

await p.click('[data-act=resume]'); await p.waitForTimeout(300);
await p.evaluate(() => window.__game.setSpeed(3)); await p.waitForTimeout(2500);
s = await state();
ok(s.hour > before.hour && !s.text.includes('welcome back'), `Continue picks up the run (hour ${before.hour} → ${s.hour})`);

// a decision made, then the tab hidden: saved straight away
await p.evaluate(() => { window.__game.setSpeed(0); });
const h1 = (await state()).hour;
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await p.evaluate(() => Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }));
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const onHide = await p.evaluate(() => JSON.parse(localStorage.getItem('mumblewood.save.v1')).world.hour);
ok(onHide === h1, `hiding the tab saves the current moment (hour ${onHide})`);

// start over from the welcome card: asks first
await p.reload(); await ready();
await p.click('[data-act=restart]'); await p.waitForTimeout(200);
s = await state();
ok(s.text.includes('yes, start over') && s.day > 1, 'Start a new colony asks first, and nothing is lost yet');
await p.screenshot({ path: `${out}/phone-welcome-confirm.png` });
await p.click('[data-act=restart]'); await p.waitForTimeout(300);
s = await state();
ok(s.day === 1 && !s.text.includes('welcome back'), 'confirming starts a new colony on day 1');
const fresh = await p.evaluate(() => JSON.parse(localStorage.getItem('mumblewood.save.v1') ?? 'null'));
ok(fresh && fresh.world.hour < 12, 'and the save is replaced by the new colony');

// start over from the Log tab
await p.evaluate(() => { const g = window.__game; g.autoplay(30); g.setSpeed(0); });
await p.click('[data-act=tab][data-arg=log]'); await p.waitForTimeout(200);
await p.click('.restart-row [data-act=restart]'); await p.waitForTimeout(200);
ok(await p.isVisible('text=This one will be lost for good'), 'the Log tab’s Start over asks first');
await p.screenshot({ path: `${out}/phone-log-restart.png` });
await p.click('.restart-row [data-act=restart-cancel]'); await p.waitForTimeout(200);
ok((await state()).day > 1, 'Keep playing keeps the colony');

// a finished run clears the save, so the next visit starts fresh
await p.evaluate(() => { window.__game.world.status = 'lost'; });
await p.waitForTimeout(500);
ok(await p.evaluate(() => localStorage.getItem('mumblewood.save.v1') === null), 'a finished run clears the save');
await p.reload(); await ready();
s = await state();
ok(s.day === 1 && !s.text.includes('welcome back'), 'and the next visit starts a new colony');

// a save from an older version is set aside, not loaded
const verdicts = await p.evaluate(() => {
  const w = window.__game.world, put = (o) => localStorage.setItem('mumblewood.save.v1', JSON.stringify(o));
  put({ v: 1, savedAt: '', world: w }); const good = window.__game.canLoad();
  put({ v: 0, savedAt: '', world: w }); const old = window.__game.canLoad();
  put({ v: 1, savedAt: '', world: { ...w, colonists: undefined } }); const broken = window.__game.canLoad();
  localStorage.setItem('mumblewood.save.v1', '{not json'); const garbage = window.__game.canLoad();
  return { good, old, broken, garbage };
});
ok(verdicts.good && !verdicts.old && !verdicts.broken && !verdicts.garbage, `a current save loads; an old-version, broken or garbled one is ignored (${JSON.stringify(verdicts)})`);

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
console.log(fails ? `${fails} failed` : 'all passed');
process.exitCode = fails ? 1 : 0;
await browser.close();
