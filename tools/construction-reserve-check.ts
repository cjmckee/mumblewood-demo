// npx tsx tools/construction-reserve-check.ts
import assert from 'node:assert/strict';
import {createWorld,apply,findSpot,reconcileStock,alive,runHours,constructionStock} from '../src/sim/world';
const w=createWorld(42);w.nextEventHour=1e9;
const put=(id:string)=>{w.owned.push(id);const spot=findSpot(w,id);assert(spot);assert.equal(apply(w,{type:'place',def:id,...spot}),null);return w.buildings.at(-1)!;};
const cottage=put('cottage'),weaver=put('weaver');w.res.planks=6;w.res.bricks=0;w.res.wicker=0;reconcileStock(w);
w.constructionReserve={defs:['weaver'],fine:4,until:w.hour+24};
assert.equal(constructionStock(w,cottage,'planks'),2,'unrelated building may use only the surplus');
assert.equal(constructionStock(w,weaver,'planks'),6,'planned building can use reserved material');
assert.equal(constructionStock(w,cottage,'wood'),w.res.wood,'wood is not reserved');
w.res.planks=3;w.res.bricks=3;
assert.equal(constructionStock(w,cottage,'planks'),2,'one reserve is shared across fine material kinds');
assert.equal(constructionStock(w,cottage,'bricks'),2,'brick route uses the same reserve');
w.res.planks=6;w.res.bricks=0;reconcileStock(w);
for(const c of alive(w))apply(w,{type:'assign',colonist:c.id,building:null});
for(let h=0;h<10;h++){while(w.decisions.length)apply(w,{type:'resolve',option:99});runHours(w,1);}
assert((cottage.delivered.planks??0)<=2+1e-6,'concurrent hauling cannot consume the reserve at pickup');
assert((weaver.delivered.planks??0)>=4-1e-6,'reserved planks reach the planned building');
w.hour=w.constructionReserve.until;w.res.planks=5;assert.equal(constructionStock(w,cottage,'planks'),5,'deadline releases the reserve');
console.log('construction reserve: 8 checks passed');
