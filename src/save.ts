// Save and resume: the whole world is plain data (the sim has no DOM, no classes, no functions in it), so a JSON
// snapshot resumes exactly where it left off, random numbers included. Kept in this browser's localStorage.
import type { World } from './sim/world';

const SAVE_KEY = 'mumblewood.save.v1';
/** Bump when a change to World would make old saves play wrongly; old saves are then set aside, not loaded. */
export const SAVE_VERSION = 1;

export interface SaveInfo { world: World; savedAt: string }

export function saveWorld(w: World): boolean {
  if (w.status !== 'playing') return clearSave();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, savedAt: new Date().toISOString(), world: w }));
    return true;
  } catch { return false; /* storage full or unavailable: play on without saving */ }
}

export function loadSave(): SaveInfo | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const w = s?.world as World | undefined;
    if (s?.v !== SAVE_VERSION || !w || w.status !== 'playing') return null;
    w.gold ??= 0; w.caravan ??= null;
    // the fields every world has; anything missing means the save is from somewhere it shouldn't be
    if (!Array.isArray(w.colonists) || !Array.isArray(w.buildings) || !Array.isArray(w.terrain) || typeof w.hour !== 'number' || typeof w.rngState !== 'number' || !w.res || !w.research) return null;
    return { world: w, savedAt: String(s.savedAt ?? '') };
  } catch { return null; }
}

export function clearSave(): boolean {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
  return true;
}
