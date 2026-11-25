// When drafts come (claude/mumblewood-draft-cadence.md): the day timer, charter-paced drafts, and the cornerstone pool.
import assert from 'node:assert/strict';
import { createWorld, apply, runHours, offerCornerstone, debugGrow, World } from '../src/sim/world';
import { START } from '../src/sim/scenario';
import { CHARTERS } from '../src/sim/content';

const blueprints = (w: World) => w.decisions.filter(d => d.kind === 'blueprint').length;
const pickCharter = (w: World, id: string) => {
  w.decisions = [{ kind: 'charter', options: [id], tier: CHARTERS.find(c => c.id === id)!.tier } as never];
  apply(w, { type: 'resolve', option: 0 });
};

// the day timer (the default): the first charter brings a draft, a second one doesn't
{
  START.drafts.mode = 'days';
  const w = createWorld(77); w.decisions = [];
  pickCharter(w, 'settled');
  assert.equal(blueprints(w), 1, 'the first charter brings the first draft');
  w.decisions = []; w.chartersDone = ['settled']; w.charterTier = 2;
  pickCharter(w, 'bread');
  assert.equal(blueprints(w), 0, 'on the day timer, a later charter brings no draft of its own');
}

// charter-paced: every charter pick brings a draft, and so does each third of its progress
{
  START.drafts.mode = 'charter';
  const w = createWorld(77); w.decisions = [];
  pickCharter(w, 'settled');
  w.decisions = []; w.chartersDone = ['settled']; w.charterTier = 2;
  pickCharter(w, 'bread');
  assert.equal(blueprints(w), 1, 'a later charter brings a draft too');
  w.decisions = []; w.nextEventHour = 1e9;
  // the weakest part sets the progress: with the colony and mood in hand, half the bread is half the charter
  debugGrow(w, 6); w.moodLog = Array(24).fill(90);
  w.tally!.eaten.bread = 15;
  runHours(w, 1);
  assert(blueprints(w) >= 1, 'a third of the way brings another');
  const after = w.draftMarks;
  w.decisions = []; runHours(w, 2);
  assert.equal(w.draftMarks, after, 'the same third is rewarded once');
  START.drafts.mode = 'days';
}

// Open road (settlers as a boon) is out of the cornerstone pool
{
  for (let seed = 1; seed <= 40; seed++) {
    const w = createWorld(seed); w.decisions = [];
    offerCornerstone(w, 'charter');
    const d = w.decisions[0];
    assert(d?.kind === 'perk' && !d.options.includes('openRoad'), 'Open road is never offered');
  }
}
console.log('draft-cadence-check: ok');
