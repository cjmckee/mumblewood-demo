// Focused checks for the opt-in research policy. Run: npx tsx tools/research-policy-check.ts
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world';
import { autoDecide, BOT } from '../src/sim/autoplayer';

const saved = BOT.researchFeasible;
try {
  BOT.researchFeasible = true;
  const choose = (options: string[]) => {
    const w = createWorld(42);
    w.research.done = ['cookery', 'messhall', 'physick', 'warehousing', 'gardening', 'masonry', 'herblore'];
    w.res.wood = 100; w.res.berries = 100;
    w.decisions = [{ kind: 'research', options }];
    autoDecide(w, 'greedy', () => 0.5);
    return w.research.current;
  };
  assert.equal(choose(['quarantine', 'foraging']), 'foraging', 'avoid missing remedies with no owned production chain');
  assert.equal(choose(['rotation', 'malting']), choose(['malting', 'rotation']), 'equal scores do not depend on option order');
  assert.equal(choose(['rotation', 'foraging']), 'foraging', 'foraging remains preferable to unrelated farming in the fixture');
  console.log('research policy: 3 checks passed');
} finally {
  BOT.researchFeasible = saved;
}
