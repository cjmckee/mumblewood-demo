// npx tsx tools/summer-weight-check.ts
import assert from 'node:assert/strict';
import {createWorld,comfortOf,activeNeeds} from '../src/sim/world';
import {START} from '../src/sim/scenario';
const saved=START.seasons.summerDrinkWeight;
try{
 const w=createWorld(42,{startDate:{season:'summer',day:1}}),c=w.colonists[0];
 w.chartersDone=['settled','menu'];const needCount=activeNeeds(w).length;
 START.seasons.summerDrinkWeight=1;c.lastDrink=undefined;const missing=comfortOf(w,c);
 c.lastDrink=w.hour;const served=comfortOf(w,c);
 assert(Math.abs(served-missing-1/needCount)<1e-10,'ordinary summer drink contribution retains equal weighting');
 START.seasons.summerDrinkWeight=2;c.lastDrink=undefined;const weightedMissing=comfortOf(w,c);
 c.lastDrink=w.hour;const weightedServed=comfortOf(w,c);
 assert(Math.abs(weightedServed-weightedMissing-2/(needCount+1))<1e-10,'double weighting changes only the existing summer need');
 assert(weightedMissing<=missing&&weightedServed>=served);
 w.chartersDone=[];const camp=comfortOf(w,c);START.seasons.summerDrinkWeight=1;
 assert.equal(comfortOf(w,c),camp,'the summer starting camp has no drink requirement');
 const winter=createWorld(42,{startDate:{season:'winter',day:1}});winter.chartersDone=['settled','menu'];
 const before=comfortOf(winter,winter.colonists[0]);START.seasons.summerDrinkWeight=2;
 assert.equal(comfortOf(winter,winter.colonists[0]),before,'other seasonal needs retain their existing weight');
 console.log('summer weighting: direct incentive, camp start and winter isolation passed');
}finally{START.seasons.summerDrinkWeight=saved;}
