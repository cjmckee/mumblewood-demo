// npx tsx tools/clothing-deadline-check.ts
import assert from 'node:assert/strict';
import {createWorld,apply,findSpot,alive,runHours,reconcileStock} from '../src/sim/world';
import {winterClothingGoal,BOT} from '../src/sim/autoplayer';
const saved=BOT.clothingDeadline;
try {
 BOT.clothingDeadline=true;
 const w=createWorld(42,{colonists:6});w.nextEventHour=1e9;
 const put=(id:string)=>{w.owned.push(id);const spot=findSpot(w,id);assert(spot);assert.equal(apply(w,{type:'place',def:id,...spot}),null);const b=w.buildings.at(-1)!;b.built=true;return b;};
 put('leanto');w.res.stew=100;reconcileStock(w);
 assert.equal(winterClothingGoal(w),0,'goal opens fifteen days before winter');
 w.hour=5*24+12;assert.equal(winterClothingGoal(w),3,'fed and housed colony targets three coats');
 w.res.coats=2;assert.equal(winterClothingGoal(w),1,'existing stock reduces goal');
 const tailor=put('tailor');tailor.outbox.coats=1;assert.equal(winterClothingGoal(w),0,'finished output counts toward goal');
 w.res.coats=0;tailor.outbox.coats=0;alive(w)[0].coatHours=100;assert.equal(winterClothingGoal(w),2,'personal equipment also counts');
 w.res.stew=0;w.res.berries=0;assert.equal(winterClothingGoal(w),0,'food safety takes priority');
 w.res.stew=100;w.hour=20*24+12;assert.equal(winterClothingGoal(w),0,'first-winter deadline ends when winter arrives');
 // A three-coat goal must be deliverable: the usual four-unit hauling threshold cannot strand it.
 const haul=createWorld(7);haul.nextEventHour=1e9;haul.owned.push('tailor');const s=findSpot(haul,'tailor');assert(s);assert.equal(apply(haul,{type:'place',def:'tailor',...s}),null);const maker=haul.buildings.at(-1)!;maker.built=true;maker.outbox.coats=3;
 for(const c of alive(haul))apply(haul,{type:'assign',colonist:c.id,building:null});
 for(let h=0;h<12;h++){while(haul.decisions.length)apply(haul,{type:'resolve',option:99});runHours(haul,1);}
 assert.equal(haul.res.coats,3,'small finished batch reaches storage without needing a fourth coat');
 assert.equal(maker.outbox.coats??0,0,'output was physically hauled');
 maker.outbox.coats=1.4;
 const drive=(hours:number)=>{for(let h=0;h<hours;h++){while(haul.decisions.length)apply(haul,{type:'resolve',option:99});runHours(haul,1);}};
 drive(24);assert.equal(haul.res.coats,4,'fractional work does not enter stored coat stock');
 assert(Math.abs((maker.outbox.coats??0)-0.4)<1e-8,'partial coat remains at the tailor');
 maker.outbox.coats=(maker.outbox.coats??0)+0.6;drive(24);
 assert.equal(haul.res.coats,5,'finishing the partial coat makes a whole deliverable unit');
 console.log('clothing deadline: 12 checks passed');
} finally {BOT.clothingDeadline=saved;}
