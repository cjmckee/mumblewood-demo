// npx tsx tools/workshop-buffer-check.ts
import assert from 'node:assert/strict';
import {createWorld,apply,findSpot,alive,runHours,reconcileStock,workshopInputPlan,currentRecipe,orderedRecipes,INPUT_CAPACITY,tick,World} from '../src/sim/world';
import {saveWorld,loadSave} from '../src/save';
function fixture(){const w=createWorld(42);w.nextEventHour=1e9;for(const c of alive(w))apply(w,{type:'assign',colonist:c.id,building:null});return w;}
function put(w:World,id:string){w.owned.push(id);const s=findSpot(w,id);assert(s);assert.equal(apply(w,{type:'place',def:id,...s}),null);const b=w.buildings.at(-1)!;b.built=true;return b;}
function run(w:World,hours:number){for(let h=0;h<hours;h++){while(w.decisions.length)apply(w,{type:'resolve',option:99});runHours(w,1);}}
{
 const w=fixture(),oven=put(w,'pieoven');oven.off=[1];w.res.wood=40;w.res.berries=0;w.res.stew=60;reconcileStock(w);apply(w,{type:'assign',colonist:alive(w)[0].id,building:oven.uid});run(w,12);
 assert.equal(oven.inbox.wood??0,0,'missing berries: no orphan wood is collected');
 w.res.berries=30;reconcileStock(w);const plan=workshopInputPlan(w,oven,currentRecipe(w,oven)!)!;assert.equal(plan.outputs,12);assert(Math.abs(plan.deliveries.wood!-6)<1e-6);
 run(w,12);assert((w.flows['pie:+pieoven']??0)>0,'complete recipe gets supplied and produces');assert(Object.values(oven.inbox).reduce((n,x)=>n+(x??0),0)<=INPUT_CAPACITY+1e-6,'input capacity is shared');
}
{
 const w=fixture(),a=put(w,'kitchen'),b=put(w,'kitchen');w.res.stew=10;w.res.fish=20;w.res.berries=20;reconcileStock(w);
 assert.equal(apply(w,{type:'productionLimit',building:a.uid,output:'stew',limit:10}),null);
 assert.notEqual(currentRecipe(w,a)?.output,'stew','warehouse target pauses only that workshop output');
 assert.equal(currentRecipe(w,b)?.output,'stew','a different workshop has its own target');
 w.res.stew=9;a.outbox.stew=50;assert.equal(currentRecipe(w,a)?.output,'stew','finished output does not count toward warehouse-only target');
 assert.equal(apply(w,{type:'productionLimit',building:a.uid,output:'stew',limit:null}),null);
 assert.equal(apply(w,{type:'recipePriority',building:a.uid,recipe:1,delta:-1}),null);assert.equal(orderedRecipes(a)[0].i,1);assert.equal(currentRecipe(w,a)?.output,'smokedFish','explicit priority overrides stars');
 assert(apply(w,{type:'productionLimit',building:a.uid,output:'stew',limit:-1}));assert(apply(w,{type:'productionLimit',building:a.uid,output:'wood',limit:1}));
}
{
 const w=fixture(),oven=put(w,'pieoven');oven.off=[0,1];oven.inbox.wood=12;const before=w.res.wood;run(w,12);
 assert.equal(oven.inbox.wood??0,0,'disabled recipes return unused inputs physically');assert(w.res.wood>before,'returned inputs re-enter warehouse stock');
}
{
 const w=fixture(),oven=put(w,'pieoven');oven.off=[1];w.res.berries=30;w.res.wood=40;reconcileStock(w);
 const c=alive(w)[0];c.task={kind:'supply',to:oven.uid,res:'wood',amount:12};c.carrying={res:'wood',amount:12};w.res.wood-=12;
 apply(w,{type:'toggleRecipe',building:oven.uid,recipe:0,on:false});run(w,12);
 assert.equal(oven.inbox.wood??0,0,'an in-flight ingredient for a disabled recipe is returned rather than parked');
 assert.equal(c.carrying,null,'return trip completes');
}
{
 const w=fixture(),oven=put(w,'pieoven');oven.off=[1];oven.inbox={berries:7.2,wood:3};oven.outbox.pie=15;
 run(w,1);assert.deepEqual(oven.inbox,{berries:7.2,wood:3},'a full output buffer does not make valid input stock obsolete');
}
{
 const w=fixture(),oven=put(w,'pieoven');oven.off=[1];w.res.wood=40;w.res.berries=40;w.res.stew=20;reconcileStock(w);apply(w,{type:'assign',colonist:alive(w)[0].id,building:oven.uid});
 for(let t=0;t<24*6;t++){while(w.decisions.length)apply(w,{type:'resolve',option:99});tick(w);assert(Object.values(oven.inbox).reduce((n,x)=>n+(x??0),0)<=INPUT_CAPACITY+1e-6,'concurrent deliveries respect shared capacity');assert(Object.values(oven.outbox).reduce((n,x)=>n+(x??0),0)<=15+1e-6,'finished output respects shared capacity');}
}
{
 const data=new Map<string,string>();Object.assign(globalThis,{localStorage:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)}});
 const w=fixture(),b=put(w,'kitchen');apply(w,{type:'recipePriority',building:b.uid,recipe:1,delta:-1});apply(w,{type:'productionLimit',building:b.uid,output:'stew',limit:25});assert(saveWorld(w));
 const restored=loadSave()!.world.buildings.find(x=>x.uid===b.uid)!;assert.deepEqual(restored.recipeOrder,b.recipeOrder);assert.deepEqual(restored.productionLimits,b.productionLimits);
}
console.log('workshop buffers, priorities, targets, returns and save checks passed');
