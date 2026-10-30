import { createWorld, tick, apply, runHours, TICKS_PER_HOUR, World, Command, day, debugEvent, colonyName, everyoneAsleep } from './sim/world';
import { IsoView } from './render/iso';
import { UI } from './ui/ui';
import { autoDecide, autoBuild } from './sim/autoplayer';
import { saveWorld, loadSave, clearSave } from './save';

/** in-game hours per real second at each speed setting (1x ≈ 90 s per day) */
const SPEEDS = [0, 0.27, 0.55, 1.1];
/** once everyone is asleep, the night runs this many times faster than the chosen speed */
const NIGHT_SKIP = 4;

async function boot() {
  const root = document.getElementById('game')!;
  const view = new IsoView();
  await view.init(document.getElementById('stage')!);
  // a small profile kept in this browser: run history now, unlocks later
  // v2: runs from the old six-settler start aren't comparable, so the run history starts fresh
  const PROFILE_KEY = 'mumblewood.profile.v2';
  type Profile = { runs: { result: string; day: number; charters: number; at: string; name?: string }[]; unlocks: string[]; firstRunDone?: boolean };
  let profile: Profile = { runs: [], unlocks: [] };
  try { const raw = localStorage.getItem(PROFILE_KEY); if (raw) profile = { ...profile, ...JSON.parse(raw) }; } catch { /* storage unavailable */ }
  const saveProfile = () => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* storage unavailable */ } };
  // a run in progress resumes where it left off; the game waits on the "welcome back" card until the player chooses
  const saved = loadSave();
  let world: World = saved?.world ?? createWorld((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  let recorded = false;
  let speed = 1, acc = 0;
  // autosave: right after anything the player does, every in-game hour (at most every few seconds), and when the tab goes
  let dirty = false, lastSave = 0, lastSavedHour = Math.floor(world.hour);
  const save = () => { if (ui.resumeOpen) return; saveWorld(world); dirty = false; lastSave = performance.now(); lastSavedHour = Math.floor(world.hour); };
  const send = (c: Command) => { const r = apply(world, c); dirty = true; return r; };
  const ui = new UI(root, () => world, send, view);
  ui.onSpeed = s => (speed = s);
  ui.profile = profile;
  ui.onProfile = saveProfile;
  ui.applyPrefs();
  ui.resumeOpen = !!saved;
  ui.resumeSavedAt = saved?.savedAt ?? '';
  ui.onRestart = () => {
    clearSave();
    world = createWorld((Date.now() ^ (Math.random() * 1e9)) >>> 0); recorded = false;
    acc = 0; view.resetWorld(); ui.detail = null; ui.resumeOpen = false; save(); ui.render(true);
  };
  ui.onResume = () => { ui.resumeOpen = false; acc = 0; save(); ui.render(true); };
  const flush = () => { if (world.status === 'playing') save(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
  // R turns the blueprint being placed
  window.addEventListener('keydown', e => { if ((e.key === 'r' || e.key === 'R') && view.placing && !(e.target instanceof HTMLInputElement)) ui.rotatePlacing(); });

  let last = performance.now(), uiTimer = 0;
  view.app.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (!world.decisions.length && world.status === 'playing' && !ui.resumeOpen && !ui.blocksSimulation) {
      // the night skip: nobody to watch, so the night goes by faster; not while the player is placing or laying paths
      let skip = speed > 0 && !view.placing && !view.pathMode && everyoneAsleep(world);
      acc += dt * SPEEDS[speed] * (skip ? NIGHT_SKIP : 1) * TICKS_PER_HOUR;
      while (acc >= 1) {
        tick(world); acc -= 1;
        if (world.decisions.length) { acc = 0; break; }
        // someone woke (or something came up): the rest of this frame runs at the normal speed
        if (skip && !everyoneAsleep(world)) { skip = false; acc /= NIGHT_SKIP; }
      }
      ui.nightSkip = skip;
    } else ui.nightSkip = false;
    if (world.status === 'playing' && !ui.resumeOpen && (dirty || Math.floor(world.hour) !== lastSavedHour) && now - lastSave > (dirty ? 300 : 5000)) save();
    if (world.status !== 'playing' && !recorded) {
      recorded = true;
      clearSave();
      profile.runs.push({ result: world.status, day: day(world), charters: world.chartersDone.length, at: new Date().toISOString(), name: colonyName(world) });
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
    /** testing: save now, and what's saved */
    save() { save(); return loadSave(); },
    /** testing: would what's in storage now be loaded? */
    canLoad: () => loadSave() !== null,
  };
}
boot();
