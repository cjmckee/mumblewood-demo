// npx tsx tools/tavern-serving-check.ts
import assert from 'node:assert/strict';
import {createWorld,apply,findSpot,spotOf,tick,TICKS_PER_HOUR,drinkTotal,World} from '../src/sim/world';
import {saveWorld,loadSave} from '../src/save';
function fixture(stock:number,cellaring=false){
 const w=createWorld(42,{colonists:2});w.owned.push('tavern');const s=findSpot(w,'tavern');assert(s);assert.equal(apply(w,{type:'place',def:'tavern',...s}),null);
 const pub=w.buildings.at(-1)!;pub.built=true;apply(w,{type:'assign',colonist:w.colonists[0].id,building:pub.uid});
 const c=w.colonists[1],p=spotOf(pub);c.x=p.x;c.y=p.y;c.fun=0;c.hunger=100;c.job=null;
 w.hour=18;w.nextEventHour=1e9;w.decisions=[];w.res.ale=stock;w.res.stew=100;
 if(cellaring)w.research!.done.push('cellaring');return {w,c,pub};
}
function run(w:World,hours:number){for(let t=0;t<hours*TICKS_PER_HOUR;t++){while(w.decisions.length)apply(w,{type:'resolve',option:99});tick(w);}}
for(const cellaring of [false,true]){
 const {w,c,pub}=fixture(10,cellaring),serving=cellaring?0.2:0.3;
 run(w,2);assert(c.drankTonight,'guest gets a serving');const drank=w.flows['ale:-drunk']??0;
 assert(Math.abs(drank-serving)<1e-8,'one guest consumes one serving');const last=c.lastDrink,fun=c.fun;
 run(w,1);assert.equal(w.flows['ale:-drunk'],drank,'remaining leisure hours do not consume more');
 assert.equal(c.lastDrink,last,'socializing does not refresh the drink timestamp');assert(c.fun>fun,'fun continues increasing after the serving');assert.equal(c.place,pub.uid,'guest keeps socializing at the tavern');
 const data=new Map<string,string>();Object.assign(globalThis,{localStorage:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)}});
 assert(saveWorld(w));const resumed=loadSave()!.world;const rc=resumed.colonists.find(x=>x.id===c.id)!;
 run(resumed,0.5);assert.equal(resumed.flows['ale:-drunk'],drank,'save/resume cannot grant another serving');assert(rc.drankTonight);
 run(w,23);assert((w.flows['ale:-drunk']??0)>drank,'next evening allows another serving');
}
const empty=fixture(0);run(empty.w,3);assert.equal(empty.c.place,empty.pub.uid,'a staffed tavern remains a social destination without stock');assert(empty.c.fun>0);assert(!empty.c.drankTonight);assert.equal(drinkTotal(empty.w),0);assert.equal(empty.c.lastDrink,undefined,'social time alone does not satisfy the drink need');
const efficient=fixture(0.2,true);run(efficient.w,3);assert(efficient.c.drankTonight,'cellaring accepts exactly its smaller serving');assert(Math.abs(drinkTotal(efficient.w))<1e-8);assert.equal(efficient.c.place,efficient.pub.uid,'socializing continues after the last serving');
const second=fixture(10);const spot=findSpot(second.w,'tavern');assert(spot);assert.equal(apply(second.w,{type:'place',def:'tavern',...spot}),null);
const other=second.w.buildings.at(-1)!;other.built=true;apply(second.w,{type:'assign',colonist:second.w.colonists[0].id,building:other.uid});
const pos=spotOf(other);second.c.x=pos.x;second.c.y=pos.y;second.c.goalKey='';run(second.w,3);
assert(second.c.drankTonight,'a guest at a second staffed tavern receives a serving');assert(Math.abs((second.w.flows['ale:-drunk']??0)-0.3)<1e-8,'multiple taverns share the settler serving limit');
console.log('tavern servings: once per evening, socializing, next evening, cellaring and save/resume passed');
