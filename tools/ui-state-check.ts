import assert from 'node:assert/strict';
import { createWorld, charterRequirements, FOODS, recipesOf } from '../src/sim/world';
import { appearance } from '../src/characters/appearance';
import { avatar } from '../src/ui/avatars';
import { buildingDestination, fixDestination } from '../src/ui/navigation';
import { buildingStatus, saleQuantity } from '../src/ui/status';

const w = createWorld(12345);
assert(FOODS.includes('apples') && FOODS.includes('bread') && FOODS.includes('skewers'));
const woodcutter = w.buildings.find(b => b.def === 'woodcutter')!;
assert.equal(fixDestination(w, { staff: 'woodcutter', n: 1 }).kind, 'building');
assert.deepEqual(buildingDestination(w,'clinic'), { kind:'catalog', def:'desk', label:'Build research desk' });
w.buildings.push({...woodcutter, uid:900, def:'desk', built:false});
assert.equal(buildingDestination(w,'clinic').kind,'building');
w.buildings.push({...woodcutter,uid:901});
assert.equal(fixDestination(w,{staff:'woodcutter',n:2}).kind,'workplaces');
const forager = w.buildings.find(b=>b.def==='forager')!;
forager.off=recipesOf(forager).map((_,i)=>i);
assert.equal(buildingStatus(w,forager).label,'Recipes off');
assert.equal(saleQuantity(5,2,20),2);
assert.equal(saleQuantity(20,12,1),1);
assert.equal(saleQuantity(5,12,0),0);
w.charter='settled';
assert(charterRequirements(w).length>1);
assert(charterRequirements(w).every(r=>r.ratio>=0&&r.ratio<=1));

const before=JSON.stringify(w);
const identities = Array.from({length:20},(_,i)=>createWorld(i+1).colonists).flat();
const portraits = identities.map(c=>avatar(c));
assert.equal(new Set(portraits).size,identities.length,'sampled colonists have distinct portraits');
for (const c of identities) {
  assert.deepEqual(appearance(c),appearance(JSON.parse(JSON.stringify(c))),'appearance survives a save round-trip');
  const temporary = {...c,mood:0,sulking:true};
  assert.equal(avatar(c),avatar(temporary),'identity is independent of temporary status');
}
assert.equal(JSON.stringify(w),before,'presentation never changes simulation state');
console.log(`UI state checks passed; ${identities.length} distinct stable portraits`);
