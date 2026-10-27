import { createWorld, tick, apply, runHours, TICKS_PER_HOUR, World, Command, day, debugEvent } from './sim/world';
import { IsoView } from './render/iso';
import { UI } from './ui/ui';
import { autoDecide, autoBuild } from './sim/autoplayer';

/** in-game hours per real second at each speed setting (1x ≈ 90 s per day) */
const SPEEDS = [0, 0.27, 0.55, 1.1];

async function boot() {
  const root = document.getElementById('game')!;
  const view = new IsoView();
  await view.init(document.getElementById('stage')!);
  // a small profile kept in this browser: run history now, unlocks later
  // v2: runs from the old six-settler start aren't comparable, so the run history starts fresh
  const PROFILE_KEY = 'mumblewood.profile.v2';
  type Profile = { runs: { result: string; day: number; charters: number; at: string }[]; unlocks: string[] };
  let profile: Profile = { runs: [], unlocks: [] };
  try { const raw = localStorage.getItem(PROFILE_KEY); if (raw) profile = { ...profile, ...JSON.parse(raw) }; } catch { /* storage unavailable */ }
  const saveProfile = () => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* storage unavailable */ } };
  let world: World = createWorld((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  let recorded = false;
  let speed = 1, acc = 0;
  const send = (c: Command) => apply(world, c);
  const ui = new UI(root, () => world, send, view);
  ui.onSpeed = s => (speed = s);
  ui.profile = profile;
  ui.onRestart = () => {
    world = createWorld((Date.now() ^ (Math.random() * 1e9)) >>> 0); recorded = false;
    acc = 0; view.selected = null; view.placing = null; view.pathMode = false; ui.detail = null; ui.render(true);
  };

  let last = performance.now(), uiTimer = 0;
  view.app.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (!world.decisions.length && world.status === 'playing') {
      acc += dt * SPEEDS[speed] * TICKS_PER_HOUR;
      while (acc >= 1) { tick(world); acc -= 1; if (world.decisions.length) { acc = 0; break; } }
    }
    if (world.status !== 'playing' && !recorded) {
      recorded = true;
      profile.runs.push({ result: world.status, day: day(world), charters: world.chartersDone.length, at: new Date().toISOString() });
      saveProfile();
    }
    view.lastWorld = world;
    view.update(world, world.decisions.length ? 1 : acc, now);
    uiTimer += dt;
    if (uiTimer > 0.25) { uiTimer = 0; ui.render(); }
  });
  ui.render(true);

  // hooks for automated screenshots and debugging
  (window as any).__game = {
    get world() { return world; }, ui, view,
    advance(hours: number) { runHours(world, hours); ui.render(true); },
    resolve(option = 0) { apply(world, { type: 'resolve', option }); ui.render(true); },
    /** let the bot play for a while (for screenshots and testing) */
    autoplay(hours: number) { for (let h = 0; h < hours; h++) { autoDecide(world); for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(world); autoDecide(world); } autoBuild(world); } ui.render(true); },
    setSpeed(s: number) { speed = s; ui.speed = s; ui.render(true); },
    day: () => day(world),
    event(id: string) { debugEvent(world, id); ui.render(true); },
  };
}
boot();
