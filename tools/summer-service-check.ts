// npx tsx tools/summer-service-check.ts
import assert from 'node:assert/strict';
import {createWorld,debugGrow,apply,findSpot,alive,foodTotal} from '../src/sim/world';
import {BOT,staffPlan,drinksToBank} from '../src/sim/autoplayer';
const saved={...BOT};
try{
 const w=createWorld(24757);debugGrow(w,14);w.charter='longtable';w.hour=40*24+8;
 w.res.wood=100;w.res.berries=100;w.res.stew=100;w.res.ale=6;
 for(const id of ['tavern','brewery']){w.owned.push(id);const spot=findSpot(w,id);assert(spot);assert.equal(apply(w,{type:'place',def:id,...spot}),null);w.buildings.at(-1)!.built=true;}
 const pub=w.buildings.find(b=>b.def==='tavern')!;
 BOT.summerService=true;const service=staffPlan(w);
 assert.equal(service.get(pub.uid),1,'summer service can staff the tavern while finale stock is short');
 BOT.summerService=false;BOT.summerBank=true;assert.equal(staffPlan(w).get(pub.uid)??0,0,'explicit banking can withhold tavern service throughout summer');
 BOT.summerBank=false;BOT.summerService=true;
 assert(drinksToBank(w)>0,'service does not pretend finale supplies are complete');
 assert([...service.values()].reduce((a,b)=>a+b,0)<=alive(w).length,'workers come from the existing colony');
 w.hour=50*24+8;const autumn=staffPlan(w);BOT.summerService=false;
 assert.deepEqual(autumn,staffPlan(w),'the experimental priority expires with summer');
 w.hour=40*24+8;w.res.berries=0;w.res.stew=0;assert(foodTotal(w)<28);
 const famine=staffPlan(w);BOT.summerService=true;
 // No priority is inserted during famine; any ordinary tavern staffing remains governed by the usual plan.
 assert.deepEqual(famine,staffPlan(w),'survival staffing takes precedence over summer service');
 console.log('summer service: finale tradeoff, worker budget, seasonal expiry and famine checks passed');
}finally{Object.assign(BOT,saved);}
