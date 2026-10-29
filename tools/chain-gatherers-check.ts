// npx tsx tools/chain-gatherers-check.ts
import assert from 'node:assert/strict';
import {createWorld,debugGrow,findSpot,apply,built,foodTotal} from '../src/sim/world';
import {BOT,staffPlan,charterChain} from '../src/sim/autoplayer';
const w=createWorld(24757);debugGrow(w,14);w.charter='woodsmoke';w.res.wood=100;w.res.berries=100;w.res.stew=30;w.res.fish=0;w.res.smokedFish=0;w.owned.push('dock');
for(const id of ['dock','kitchen','forager']){const spot=findSpot(w,id);assert(spot);assert.equal(apply(w,{type:'place',def:id,...spot}),null);w.buildings.at(-1)!.built=true;}
const dock=built(w).find(b=>b.def==='dock')!;dock.eff=0.5;
for(const b of built(w).filter(b=>b.def==='forager'))b.eff=2;
assert(charterChain(w).includes('dock'),'specific charter requires fishing');
BOT.chainGatherers=false;const baseline=staffPlan(w);
assert.equal(baseline.get(dock.uid)??0,0,'baseline loses the dock to higher-yield foragers');
BOT.chainGatherers=true;const candidate=staffPlan(w);
assert((candidate.get(dock.uid)??0)>=1,'charter ingredient gatherer receives a worker');
assert.equal([...candidate.values()].reduce((a,b)=>a+b,0),[...baseline.values()].reduce((a,b)=>a+b,0),'does not create extra worker budget');
w.res.berries=0;w.res.stew=0;assert(foodTotal(w)<28);
const famineCandidate=staffPlan(w);BOT.chainGatherers=false;const famineBaseline=staffPlan(w);
assert.deepEqual(famineCandidate,famineBaseline,'famine keeps existing allocation');
w.charter=null;BOT.chainGatherers=true;const noCharter=staffPlan(w);BOT.chainGatherers=false;
assert.deepEqual(noCharter,staffPlan(w),'no charter keeps existing allocation');
console.log('chain gatherer staffing: source identity, worker budget, famine and no-charter checks passed');
