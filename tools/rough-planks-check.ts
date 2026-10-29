// The player and bot share the starting rough-plank recipe.
// npx tsx tools/rough-planks-check.ts
import assert from 'node:assert/strict';
import {BUILDING_BY_ID,ROUGH_PLANK_RECIPE,recipeRate} from '../src/sim/content';
import {createWorld,findSpot,apply,alive,runHours,reconcileStock} from '../src/sim/world';
import {BOT,roughPlankMaker,autoDecide} from '../src/sim/autoplayer';
const saved={...BOT};
try{
 Object.assign(BOT,{roughPlanks:true,roughWoodStart:55,roughWoodStop:30,roughKeepWinterReserve:true});
 const w=createWorld(42);w.nextEventHour=1e9;w.owned.push('weaver');const spot=findSpot(w,'weaver');assert(spot);assert.equal(apply(w,{type:'place',def:'weaver',...spot}),null);
 const hut=w.buildings.find(b=>b.def==='woodcutter')!;
 w.res.wood=60;assert.equal(roughPlankMaker(w),hut.uid,'baseline hut can cover missing construction materials');
 w.res.wood=29;assert.equal(roughPlankMaker(w),undefined,'stop before wood is depleted');
 w.res.wood=50;assert.equal(roughPlankMaker(w),undefined,'do not start a batch without the larger wood buffer');
 apply(w,{type:'toggleRecipe',building:hut.uid,recipe:0,on:false});w.res.wood=35;assert.equal(roughPlankMaker(w),hut.uid,'continue a started batch within the safety band');
 w.res.planks=4;assert.equal(roughPlankMaker(w),undefined,'stop when construction demand is covered');w.res.planks=0;
 assert(recipeRate(ROUGH_PLANK_RECIPE)<recipeRate(BUILDING_BY_ID.sawmill.recipes![0]),'drafted sawmill is faster at base skill/efficiency');
 assert(ROUGH_PLANK_RECIPE.inputs.wood!>BUILDING_BY_ID.sawmill.recipes![0].inputs.wood!,'rough method uses more wood');
 w.owned.push('sawmill');const millSpot=findSpot(w,'sawmill');assert(millSpot);assert.equal(apply(w,{type:'place',def:'sawmill',...millSpot}),null);
 const mill=w.buildings.at(-1)!;mill.built=true;mill.inbox.wood=2;w.res.wood=60;
 assert.equal(roughPlankMaker(w),undefined,'an operable drafted workshop replaces the fallback');w.buildings=w.buildings.filter(b=>b.uid!==mill.uid);
 w.res.wood=180;reconcileStock(w);for(const c of alive(w))apply(w,{type:'assign',colonist:c.id,building:null});apply(w,{type:'assign',colonist:alive(w)[0].id,building:hut.uid});
 for(let h=0;h<12;h++){while(w.decisions.length)apply(w,{type:'resolve',option:99});runHours(w,1);}
 const made=w.flows['planks:+woodcutter']??0;assert(made>0,'existing production and hauling execute the fallback recipe');
 assert(Math.abs(w.flows['wood:-woodcutter']/made-3)<1e-6,'actual production consumes three wood per plank');
 w.flows['planks:+woodcutter']=BOT.roughPlankBudget;w.res.wood=180;assert.equal(roughPlankMaker(w),undefined,'early rough production budget stops further batches');
 BOT.roughPlanks=false;assert.equal(roughPlankMaker(w),undefined,'bot opt-out does not remove the player recipe');
 assert(BUILDING_BY_ID.woodcutter.recipes!.includes(ROUGH_PLANK_RECIPE),'starting recipe is real game content');
 BOT.roughPlanks=true;
 const upgrade=createWorld(51);upgrade.flows['planks:+woodcutter']=BOT.roughPlankBudget;upgrade.decisions=[{kind:'blueprint',options:['dock','sawmill','ciderpress']}];
 autoDecide(upgrade,'greedy',()=>0.5);assert(upgrade.owned.includes('sawmill'),'bot drafts an efficient upgrade after spending its rough budget');
 const haul=createWorld(17);haul.nextEventHour=1e9;const producer=haul.buildings.find(b=>b.def==='woodcutter')!;
 producer.outbox.planks=2.5;producer.off=[0,1];for(const c of alive(haul))apply(haul,{type:'assign',colonist:c.id,building:null});
 for(let h=0;h<24;h++){while(haul.decisions.length)apply(haul,{type:'resolve',option:99});runHours(haul,1);}
 assert.equal(haul.res.planks,2.5,'a bounded rough batch is hauled without waiting for four planks');
 console.log('rough planks: 15 checks passed');
}finally{Object.assign(BOT,saved);}
