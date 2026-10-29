// Fixed seeds; optional scenario grants only blueprints, never resources, buildings or workers.
// npx tsx tools/clothing-pacing.ts [natural|textile|leather] [runs=4]
import { createWorld, tick, day, TICKS_PER_HOUR, alive, hasCoat, foodTotal } from '../src/sim/world';
import { seasonOf } from '../src/sim/seasons';
import { autoDecide, autoBuild, BOT } from '../src/sim/autoplayer';
if(process.env.BOT)Object.assign(BOT,JSON.parse(process.env.BOT));
const route=process.argv[2]??'natural', n=Number(process.argv[3]??4);
if(!['natural','textile','leather'].includes(route))throw new Error('Unknown route');
const seeds=process.env.SEEDS?.split(',').map(Number);
for(let i=0;i<(seeds?.length??n);i++){
 const seed=seeds?.[i]??(1000+i*7919),w=createWorld(seed);let rng=seed;const rand=()=>((rng=(rng*1103515245+12345)>>>0)/4294967296);
 const grant=route==='textile'?['flaxfield','weaver','tailor']:route==='leather'?['trapper','tanner','tailor']:[];
 if(process.env.SUPPORT_FINE==='1')grant.push('sawmill');
 w.owned.push(...grant);let milestones=0;const timings:unknown[]=[];let firstCoat:number|null=null;let firstMade:number|null=null,firstStock:number|null=null;const winterCoverage:unknown[]=[];const winters=new Set<number>();let winterOpening:unknown=null;let firstBatch:number|null=null;
 const watch=()=>{if(firstBatch==null&&w.res.coats>=3)firstBatch=1+w.hour/24;if(firstMade==null&&(w.flows['coats:+tailor']??0)>=1)firstMade=1+w.hour/24;if(firstStock==null&&w.res.coats>=1)firstStock=1+w.hour/24;const season=seasonOf(w);if(winterOpening==null&&season.winter===1){winterOpening={day:1+w.hour/24,population:alive(w).length,stock:w.res.coats,outbox:w.buildings.reduce((n,b)=>n+(b.outbox.coats??0),0),food:foodTotal(w),wood:w.res.wood};}if(season.season==='winter'&&season.dayOf===1&&w.hour%24>=12&&!winters.has(season.winter)){winters.add(season.winter);winterCoverage.push({winter:season.winter,population:alive(w).length,worn:alive(w).filter(hasCoat).length,unclaimed:w.res.coats,personal:alive(w).filter(c=>(c.coatHours??0)>0).length,food:foodTotal(w),wood:w.res.wood});}if(w.chartersDone.length>milestones){timings.push({day:day(w),population:alive(w).length,completed:w.chartersDone.slice(milestones)});milestones=w.chartersDone.length;}if(firstCoat==null&&alive(w).some(hasCoat))firstCoat=1+w.hour/24;};
 while(w.status==='playing'&&day(w)<=90){autoDecide(w,'greedy',rand);for(let t=0;t<TICKS_PER_HOUR;t++){tick(w);if(w.decisions.length)autoDecide(w,'greedy',rand);watch();}autoBuild(w);}
 console.log(JSON.stringify({route,seed,clothingBatch:BOT.clothingBatch,clothingDeadline:BOT.clothingDeadline,clothingReserve:BOT.clothingReserve,fineSupport:process.env.SUPPORT_FINE==='1',roughPlanks:BOT.roughPlanks,roughPlankBudget:BOT.roughPlankBudget,roughWoodStart:BOT.roughWoodStart,roughWoodStop:BOT.roughWoodStop,roughKeepWinterReserve:BOT.roughKeepWinterReserve,soil:w.sites.includes('soil'),status:w.status,day:1+w.hour/24,population:alive(w).length,timings,firstCoat,firstMade,firstStock,firstBatch,winterOpening,winterCoverage,made:w.flows['coats:+tailor']??0,equipped:w.flows['coats:-equipped']??0,worn:alive(w).filter(hasCoat).length,stored:alive(w).filter(c=>(c.coatHours??0)>0&&c.coatStoredAt!=null).length,clothingBuildings:w.buildings.filter(b=>grant.includes(b.def)).map(b=>({id:b.def,built:b.built})),roughPlanksMade:w.flows['planks:+woodcutter']??0,materialUse:Object.fromEntries(Object.entries(w.flows).filter(([k])=>/:(\+|\-)(tailor|tanner|weaver|trapper|flaxfield)$/.test(k)))}));
}
