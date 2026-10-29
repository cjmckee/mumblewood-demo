// npx tsx tools/spring-recovery-check.ts
import assert from 'node:assert/strict';
import {createWorld,activeNeeds,comfortParts,workHours,seasonYield} from '../src/sim/world';
import {START,SEASONS} from '../src/sim/scenario';
const original=START.seasons.springFresh;
assert.equal(original,false,'spring recovery is the normal rule');
try{
 for(const season of SEASONS){
  const w=createWorld(42,{startDate:{season,day:1}});
  for(const standing of [0,1,2]){
   START.seasons.springFresh=true;const old=activeNeeds(w,standing);
   START.seasons.springFresh=false;const current=activeNeeds(w,standing);
   assert.deepEqual(current,old.filter(n=>n!=='fresh'),'only the legacy fresh-food requirement changes');
  }
 }
 const w=createWorld(42,{startDate:{season:'spring',day:1}}),c=w.colonists[0];
 c.ate=[{r:'stew',h:w.hour}];
 assert(!('fresh' in comfortParts(w,c,1)),'a cooked-meal preference cannot create a spring freshness gap');
 assert.deepEqual(workHours(w),[6,18]);
 assert.equal(seasonYield(w,'field'),0.4,'crops resume at their existing spring rate');
 assert.equal(seasonYield(w,'dock'),1.25,'existing spring fishing bonus remains');
 assert.equal(START.seasons.offPath.spring,0.85,'spring mud remains');
 assert.equal(START.seasons.build.spring,0.85,'wet-weather construction remains');
 START.seasons.springFresh=true;
 assert.equal(comfortParts(w,c,1).fresh,0,'legacy comparison still reproduces the cooked-meal mismatch');
 c.ate=[{r:'berries',h:w.hour}];assert.equal(comfortParts(w,c,1).fresh,1);
}finally{START.seasons.springFresh=original;}
console.log('spring recovery: all standings/seasons, legacy comparison, food and weather rules passed');
