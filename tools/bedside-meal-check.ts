// Regression: illness interrupts a meal trip before/after food pickup.
import assert from 'node:assert/strict';
import {createWorld,alive,tick,TICKS_PER_HOUR,reconcileStock} from '../src/sim/world';
for(const pickedUp of [false,true]){
 const w=createWorld(42,{colonists:1});w.decisions=[];w.nextEventHour=1e9;
 const c=alive(w)[0];c.hunger=0;c.starvingHours=47;
 c.illness={id:'chill',name:'Winter chill',severity:65,worsen:1,contagious:false};
 c.activity='eating';c.meal={at:null,from:null,until:0,got:pickedUp?'fish':null};
 for(const r of Object.keys(w.res))w.res[r as keyof typeof w.res]=0;
 w.res.fish=10;reconcileStock(w);
 for(let i=0;i<TICKS_PER_HOUR;i++)tick(w);
 assert(!c.left,'interrupted meal is eaten before starvation');
 assert(c.hunger>70,'bedridden settler actually finishes the meal');
 assert.equal(c.meal,null);
 assert.equal(w.flows['fish:-eaten']??0,pickedUp?0:1,'food already held is not fetched twice');
 assert.equal(c.lastMeal?.table,false,'bedside meal earns no dining-table credit');
}
const w=createWorld(42,{colonists:1});w.decisions=[];w.nextEventHour=1e9;
const c=alive(w)[0];c.illness={id:'chill',name:'Winter chill',severity:65,worsen:1,contagious:false};
for(const r of Object.keys(w.res))w.res[r as keyof typeof w.res]=0;
reconcileStock(w);c.hunger=20;c.meal={at:null,from:null,until:0,got:null};
const before=c.hunger;for(let i=0;i<TICKS_PER_HOUR;i++)tick(w);
assert.equal(c.meal,null,'missing food clears the interrupted trip');
assert(c.hunger<=before,'bedside feeding does not invent a meal');
console.log('bedside meal interruption: picked-up, uncollected and no-food cases passed');
