// Inspect the actual clothing pipeline without changing stocks or staffing.
// npx tsx tools/clothing-trace.ts [seed=8919] [textile|leather] [maxDays=90]
import { createWorld, tick, day, TICKS_PER_HOUR, alive, built, workersAt, currentRecipe, blockedReason, foodTotal, seasonYield, stockOf, sites, beds } from '../src/sim/world';
import { autoDecide, autoBuild, BOT, TRACE, clothingChain, staffWants, winterClothingGoal } from '../src/sim/autoplayer';
import { seasonOf } from '../src/sim/seasons';
TRACE.on=true;
if(process.env.BOT)Object.assign(BOT,JSON.parse(process.env.BOT));
const seed=Number(process.argv[2]??8919),route=process.argv[3]??'textile',maxDays=Number(process.argv[4]??90);
if(!['textile','leather'].includes(route))throw new Error('Unknown route');
const w=createWorld(seed);let rng=seed;const rand=()=>((rng=(rng*1103515245+12345)>>>0)/4294967296);
const ids=route==='textile'?['flaxfield','weaver','tailor']:['trapper','tanner','tailor'];w.owned.push(...ids);
let previous='';
while(w.status==='playing'&&day(w)<=maxDays){
 autoDecide(w,'greedy',rand);for(let t=0;t<TICKS_PER_HOUR;t++){tick(w);if(w.decisions.length)autoDecide(w,'greedy',rand);}autoBuild(w);
 const want=staffWants(w);
 const buildNotes=TRACE.notes.filter(n=>n.kind==='build');TRACE.notes.length=0;
 const state={reserve:w.constructionReserve,beds:beds(w),goal:winterClothingGoal(w),fineProduction:Object.fromEntries(Object.entries(w.flows).filter(([k])=>/(planks|bricks|wicker):[+]/.test(k))),fineBuildings:built(w).filter(b=>['sawmill','carpenter','kiln'].includes(b.def)).map(b=>({id:b.def,staff:workersAt(w,b.uid).length,inbox:b.inbox,outbox:b.outbox})),fine:stockOf(w,'fine'),wood:w.res.wood,gold:w.gold,fineBlueprints:w.owned.filter(id=>['sawmill','carpenter','kiln','claypit'].includes(id)),sites:sites(w).map(b=>({id:b.def,progress:b.progress,delivered:b.delivered})),buildNotes,population:alive(w).length,food:Math.floor(foodTotal(w)),chain:clothingChain(w),stock:{flax:w.res.flax,cloth:w.res.cloth,hides:w.res.hides,leather:w.res.leather,coats:w.res.coats},buildings:built(w).filter(b=>ids.includes(b.def)).map(b=>({id:b.def,want:want[b.def]??0,staff:workersAt(w,b.uid).map(c=>({id:c.id,activity:c.activity,task:c.task?.kind})),recipe:currentRecipe(w,b)?.inputs,blocked:blockedReason(w,b),yield:seasonYield(w,b.def),inbox:b.inbox,outbox:b.outbox})),made:w.flows['coats:+tailor']??0};
 const key=JSON.stringify(state);
 if(key!==previous){console.log(JSON.stringify({day:1+w.hour/24,season:seasonOf(w).season,...state}));previous=key;}
}
console.log(JSON.stringify({status:w.status,day:1+w.hour/24}));
