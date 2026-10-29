// npx tsx tools/variety-plan-check.ts
import assert from 'node:assert/strict';
import {createWorld,apply,findSpot,recipesOf,alive} from '../src/sim/world';
import {BOT,varietyTargets,autoFoodRules} from '../src/sim/autoplayer';
const saved={...BOT};
try{
 const w=createWorld(24757);w.charter='menu';w.owned.push('kitchen','pieoven','smokehouse','dock');w.res.wood=100;w.res.berries=100;
 for(const id of ['kitchen','pieoven','smokehouse']){const spot=findSpot(w,id);assert(spot);assert.equal(apply(w,{type:'place',def:id,...spot}),null);w.buildings.at(-1)!.built=true;}
 for(const b of w.buildings)if(b.def==='kitchen'||b.def==='smokehouse')b.off=recipesOf(b).flatMap((r,i)=>r.output==='smokedFish'?[]:[i]);
 BOT.feasibleVariety=false;assert(varietyTargets(w,3).includes('bread'),'legacy plan counts an unfeedable bread recipe');
 BOT.feasibleVariety=true;assert(!varietyTargets(w,3).includes('bread'),'an empty recipe with no supply route is not a meal source');
 assert(varietyTargets(w,3).includes('pie'));assert(varietyTargets(w,3).includes('smokedFish'),'an owned fish route remains a plan even before dock construction');
 w.res.flour=1;assert(varietyTargets(w,3).includes('bread'),'imported ingredients sufficient for a complete recipe are usable');
 w.res.flour=0;const oven=w.buildings.find(b=>b.def==='pieoven')!;oven.inbox.flour=1;
 assert(varietyTargets(w,3).includes('bread'),'already-delivered recipe ingredients are usable');oven.inbox.flour=0;
 w.res.bread=15;assert(varietyTargets(w,3).includes('bread'),'already stored charter goods remain valid without a producer');
 w.res.bread=0;w.forbidden=['bread'];autoFoodRules(w);assert(!w.forbidden.includes('bread'),'stale impossible-food reservation is released');
 for(const r of Object.keys(w.res))w.res[r as keyof typeof w.res]=0;
 w.res.pie=2;w.res.smokedFish=2;w.res.stew=2;autoFoodRules(w);
 const allowed=['pie','smokedFish','stew'].filter(r=>!w.forbidden.includes(r as 'pie')).reduce((n,r)=>n+w.res[r as 'pie'],0);
 assert(allowed>=alive(w).length,'charter reservations do not hide the emergency food supply');
 console.log('variety feasibility: absent routes, owned routes, imported/buffered ingredients, existing stock and food safety passed');
}finally{Object.assign(BOT,saved);}
