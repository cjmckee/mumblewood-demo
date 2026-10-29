// npx tsx tools/logistics-probe.ts [legacy|batch]; optional RESULT_DIR for detailed files.
import {writeFileSync,mkdirSync} from 'node:fs';
import {createWorld,apply,findSpot,alive,runHours,reconcileStock,tick,TICKS_PER_HOUR,day,built,currentRecipe,recipesOf} from '../src/sim/world';
import {autoDecide,autoBuild} from '../src/sim/autoplayer';
// Controlled ingredient mismatch: the selected recipe has wood, but no berries.
const mode=process.argv[2]??'batch';if(!['batch','legacy'].includes(mode))throw new Error('Use batch or legacy');
const output=process.env.RESULT_DIR??'dist/logistics';mkdirSync(output,{recursive:true});
const w=createWorld(42);w.recipeBatching=mode==='batch';w.nextEventHour=1e9;w.owned.push('pieoven');const spot=findSpot(w,'pieoven')!;apply(w,{type:'place',def:'pieoven',...spot});const oven=w.buildings.at(-1)!;oven.built=true;oven.off=[1];w.res.wood=40;w.res.berries=0;w.res.stew=60;reconcileStock(w);for(const c of alive(w))apply(w,{type:'assign',colonist:c.id,building:null});apply(w,{type:'assign',colonist:alive(w)[0].id,building:oven.uid});for(let h=0;h<12;h++){while(w.decisions.length)apply(w,{type:'resolve',option:99});runHours(w,1);}console.log(JSON.stringify({fixture:'missing co-ingredient',inbox:oven.inbox,made:w.flows['pie:+pieoven']??0}));
for(const seed of [1000,8919,16838,24757]){
 const world=createWorld(seed);world.recipeBatching=mode==='batch';let r=seed;const rand=()=>((r=(r*1103515245+12345)>>>0)/4294967296);
 let supplyPickups=0,supplyUnits=0,outputPickups=0,outputUnits=0,peakInbox=0,peakWorkshopInbox=0,returnPickups=0,returnUnits=0;const loads:number[]=[];
 while(world.status==='playing'&&day(world)<=90){autoDecide(world,'greedy',rand);for(let t=0;t<TICKS_PER_HOUR;t++){
  const before=new Map(alive(world).map(c=>[c.id,!!c.carrying]));tick(world);
  for(const c of alive(world))if(!before.get(c.id)&&c.carrying){if(c.task?.kind==='supply'){supplyPickups++;supplyUnits+=c.carrying.amount;loads.push(c.carrying.amount);}if(c.task?.kind==='haul'&&c.task.fromInbox){returnPickups++;returnUnits+=c.carrying.amount;}if(c.task?.kind==='haul'&&!c.task.restock&&!c.task.fromInbox){outputPickups++;outputUnits+=c.carrying.amount;}}
  if(world.decisions.length)autoDecide(world,'greedy',rand);
 }autoBuild(world);for(const b of built(world)){const n=Object.values(b.inbox).reduce((n,x)=>n+(x??0),0);peakInbox=Math.max(peakInbox,n);if(recipesOf(b).length)peakWorkshopInbox=Math.max(peakWorkshopInbox,n);}}
 const result={mode,seed,returnPickups,returnUnits,status:world.status,day:1+world.hour/24,supplyPickups,supplyUnits,meanSupplyLoad:supplyUnits/supplyPickups,supplyTripsPerDay:supplyPickups/(world.hour/24),outputPickups,outputUnits,meanOutputLoad:outputUnits/outputPickups,peakInbox,peakWorkshopInbox,loads};writeFileSync(`${output}/${mode}-${seed}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,loads:undefined}));
}
