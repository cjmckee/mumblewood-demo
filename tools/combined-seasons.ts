// Current systems together; wardrobe grants route blueprints, never goods or workers.
// npx tsx tools/combined-seasons.ts [current|taper|prepared|wardrobe] [runs=4] [maxDays=90]
// SEEDS=24757,1000 selects cases. WATCH=1 adds hourly state and pickup/drop traces.
// EXTRA_BLUEPRINTS=cellar labels an access probe; never grants goods/buildings/workers.
// CARE_STAFFING=legacy replays old priorities; urgent-care, seasonal-staffing
// and care-and-seasons fork policies enable the corrections at a chosen hour.
// STATE_HOURS=252,258 writes full observation states without changing decisions.
// CLINIC_TRIAGE=legacy preserves old admissions until TRIAGE_HOUR;
// TRIAGE_POLICY=control|triage selects the bed-allocation continuation.
// CHAIN_GATHERERS=1 enables the isolated bot staffing experiment.
// FORK_HOUR=1116 captures identical pre-intervention state; FORK_POLICY=source
// activates source allocation afterward (control is observation only).
// SPRING_FRESH=1 replays the historical need; FORK_POLICY=spring-recovery
// removes it at the fork. With no override, use current scenario rules.
// VARIETY_PLANNING=legacy reproduces pre-fix meal reservation planning.
// FINE_PLANNING=legacy reproduces pre-fix planning for historical comparisons.
// FORK_POLICY=rough-plan, fine-inputs or fine-planning enables those fixes at the fork.
// SERVICE_HOUR=1152 SERVICE_POLICY=bank|serve adds a second same-state
// intervention to compare optional summer service with charter banking.
// SUMMER_DRINK_WEIGHT=2 changes comfort weighting only at that second fork.
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {createWorld,tick,day,TICKS_PER_HOUR,alive,avgMood,colonyComfort,comfortGaps,standingOf,foodTotal,mealTotal,drinkTotal,hasCoat,built,workersAt,bdef,blockedReason,charterProgress,currentRecipe,recipesOf,recipeOn,World} from '../src/sim/world';
import {START} from '../src/sim/scenario';
import {BUILDING_BY_ID} from '../src/sim/content';
import {seasonOf} from '../src/sim/seasons';
import {autoDecide,autoBuild,staffWants,staffPlan,charterChain,TRACE} from '../src/sim/autoplayer';
const mode=process.argv[2]??'taper',runs=Number(process.argv[3]??4),days=Number(process.argv[4]??90);
if(!['current','taper','prepared','wardrobe'].includes(mode)||!Number.isInteger(runs)||runs<1||!Number.isInteger(days)||days<1)throw new Error('Invalid probe arguments');
const selected=process.env.SEEDS?.split(',').map(Number);
if(selected?.some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('Invalid seeds');
const extraBlueprints=process.env.EXTRA_BLUEPRINTS?.split(',').filter(Boolean)??[];
if(extraBlueprints.some(id=>!BUILDING_BY_ID[id]))throw new Error('Invalid extra blueprint');
const stateHours=process.env.STATE_HOURS?.split(',').map(Number)??[];
if(stateHours.some(n=>!Number.isInteger(n)||n<6))throw new Error('Invalid state hour');
const triageHour=process.env.TRIAGE_HOUR==null?undefined:Number(process.env.TRIAGE_HOUR);
if(triageHour!=null&&(!Number.isInteger(triageHour)||triageHour<6))throw new Error('Invalid triage hour');
const triagePolicy=process.env.TRIAGE_POLICY??'control';if(!['control','triage'].includes(triagePolicy))throw new Error('Invalid triage policy');
if(process.env.CLINIC_TRIAGE!=null&&!['legacy','current'].includes(process.env.CLINIC_TRIAGE))throw new Error('Invalid clinic triage mode');
const initialClinicTriage=process.env.CLINIC_TRIAGE==='legacy'?false:START.clinicTriage;
const watched=process.env.WATCH==='1';
if(process.env.CARE_STAFFING!=null&&!['legacy','current'].includes(process.env.CARE_STAFFING))throw new Error('Invalid care/staffing mode');
const initialUrgentClinic=process.env.CARE_STAFFING==='legacy'?false:BOT.urgentClinic;
const initialSeasonalStaffing=process.env.CARE_STAFFING==='legacy'?false:BOT.seasonalStaffing;
if(process.env.VARIETY_PLANNING!=null&&!['legacy','current'].includes(process.env.VARIETY_PLANNING))throw new Error('Invalid variety planning mode');
const initialFeasibleVariety=process.env.VARIETY_PLANNING==='legacy'?false:BOT.feasibleVariety;
if(process.env.FINE_PLANNING!=null&&!['legacy','current'].includes(process.env.FINE_PLANNING))throw new Error('Invalid fine planning mode');
const initialFineInputs=process.env.FINE_PLANNING==='legacy'?false:BOT.fineInputs;
const initialPlannedRough=process.env.FINE_PLANNING==='legacy'?false:BOT.plannedRoughDemand;
const initialSpringFresh=process.env.SPRING_FRESH==='1'?true:process.env.SPRING_FRESH==='0'?false:START.seasons.springFresh;
const forkHour=process.env.FORK_HOUR==null?undefined:Number(process.env.FORK_HOUR);
if(forkHour!=null&&(!Number.isInteger(forkHour)||forkHour<6))throw new Error('Invalid fork hour');
const serviceHour=process.env.SERVICE_HOUR==null?undefined:Number(process.env.SERVICE_HOUR);
if(serviceHour!=null&&(!Number.isInteger(serviceHour)||serviceHour<6))throw new Error('Invalid service hour');
const summerWeight=process.env.SUMMER_DRINK_WEIGHT==null?undefined:Number(process.env.SUMMER_DRINK_WEIGHT);
if(summerWeight!=null&&(!Number.isFinite(summerWeight)||summerWeight<1))throw new Error('Invalid summer weight');
const servicePolicy=process.env.SERVICE_POLICY??'bank';
if(!['bank','serve'].includes(servicePolicy))throw new Error('Invalid service policy');
const forkPolicy=process.env.FORK_POLICY??'control';
if(!['control','source','spring-recovery','rough-plan','fine-inputs','fine-planning','feasible-variety','urgent-care','seasonal-staffing','care-and-seasons','urgent-care-buffer'].includes(forkPolicy))throw new Error('Invalid fork policy');
const out=process.env.RESULT_DIR??'dist/combined-seasons';mkdirSync(out,{recursive:true});
if(mode!=='current')START.seasons.recruitTaper={from:10,later:13,multiplier:2,laterMultiplier:4};
// Keep preparation isolated from the taper itself.
import {BOT} from '../src/sim/autoplayer';
if(process.env.CHAIN_GATHERERS==='1')BOT.chainGatherers=true;
if(mode==='prepared'||mode==='wardrobe'){BOT.clothingDeadline=true;BOT.clothingReserve=true;}
for(let i=0;i<(selected?.length??runs);i++){
 START.clinicTriage=initialClinicTriage;
 START.seasons.summerDrinkWeight=undefined;
 BOT.urgentClinic=initialUrgentClinic;BOT.clinicWoodBuffer=10;BOT.seasonalStaffing=initialSeasonalStaffing;
 BOT.feasibleVariety=initialFeasibleVariety;
 BOT.summerBank=false;
 BOT.summerService=false;
 BOT.fineInputs=initialFineInputs;
 BOT.plannedRoughDemand=initialPlannedRough;
 BOT.chainGatherers=process.env.CHAIN_GATHERERS==='1';
 START.seasons.springFresh=initialSpringFresh;
 const seed=selected?.[i]??1000+i*7919,w=createWorld(seed);if(mode==='wardrobe')w.owned.push('trapper','tanner','tailor');for(const id of extraBlueprints)if(!w.owned.includes(id))w.owned.push(id);let rng=seed;const rand=()=>((rng=(rng*1103515245+12345)>>>0)/4294967296);
 const capturedStates=new Set<number>();
 let forked=false,serviceForked=false,triageForked=false;
 const tracePath=`${out}/${mode}-${seed}-watch.jsonl`;if(watched)writeFileSync(tracePath,'');
 const daily:any[]=[],milestones:any[]=[],seasons:Record<string,any>={},flags:any[]=[];let completed=0;let inputPickups=0,outputPickups=0,returns=0;const seenDays=new Set<number>();let lastCharter=w.charter;let pickedAt=w.hour;
 const snapshot=()=>({day:1+w.hour/24,season:seasonOf(w).season,standing:standingOf(w),population:alive(w).length,food:foodTotal(w),wood:w.res.wood,meals:mealTotal(w),drinks:drinkTotal(w),mood:avgMood(w),comfort:colonyComfort(w),strain:w.strain,cold:alive(w).filter(c=>c.cold).length,sick:alive(w).filter(c=>c.illness).length,wornCoats:alive(w).filter(hasCoat).length,storedCoats:alive(w).filter(c=>(c.coatHours??0)>0&&c.coatStoredAt!=null).length,unclaimedCoats:w.res.coats,needs:comfortGaps(w),charter:charterProgress(w)?.label??null});
 const watch=()=>{
  if(w.charter!==lastCharter){lastCharter=w.charter;pickedAt=w.hour;}
  if(w.chartersDone.length>completed){milestones.push({...snapshot(),completed:w.chartersDone.slice(completed)});completed=w.chartersDone.length;}
 };
 while(w.status==='playing'&&day(w)<=days){
  for(const hour of stateHours)if(w.hour>=hour&&!capturedStates.has(hour)){writeFileSync(`${out}/${mode}-${seed}-state-${hour}.json`,JSON.stringify({world:w,decisionRng:rng,bot:{...BOT},seasonRules:START.seasons},null,2));capturedStates.add(hour);}
  if(!forked&&forkHour!=null&&w.hour>=forkHour){
   writeFileSync(`${out}/${mode}-${seed}-fork.json`,JSON.stringify({world:w,decisionRng:rng,bot:{...BOT},seasonRules:START.seasons},null,2));
   forked=true;if(forkPolicy==='source')BOT.chainGatherers=true;
   if(forkPolicy==='spring-recovery')START.seasons.springFresh=false;
   if(forkPolicy==='rough-plan')BOT.plannedRoughDemand=true;
   if(forkPolicy==='fine-inputs'||forkPolicy==='fine-planning')BOT.fineInputs=true;
   if(forkPolicy==='fine-planning')BOT.plannedRoughDemand=true;
   if(forkPolicy==='feasible-variety')BOT.feasibleVariety=true;
   if(forkPolicy==='urgent-care'||forkPolicy==='urgent-care-buffer'||forkPolicy==='care-and-seasons')BOT.urgentClinic=true;
   if(forkPolicy==='seasonal-staffing'||forkPolicy==='care-and-seasons')BOT.seasonalStaffing=true;
   if(forkPolicy==='urgent-care-buffer')BOT.clinicWoodBuffer=2;
  }
  if(!serviceForked&&serviceHour!=null&&w.hour>=serviceHour){
   writeFileSync(`${out}/${mode}-${seed}-service-fork.json`,JSON.stringify({world:w,decisionRng:rng,bot:{...BOT},seasonRules:START.seasons},null,2));
   serviceForked=true;BOT.summerService=servicePolicy==='serve';BOT.summerBank=servicePolicy==='bank';
   START.seasons.summerDrinkWeight=summerWeight;
  }
  if(!triageForked&&triageHour!=null&&w.hour>=triageHour){writeFileSync(`${out}/${mode}-${seed}-triage-fork.json`,JSON.stringify({world:w,decisionRng:rng,bot:{...BOT},clinicTriage:START.clinicTriage},null,2));triageForked=true;START.clinicTriage=triagePolicy==='triage';}
  if(watched){TRACE.on=true;TRACE.notes=[];}
  autoDecide(w,'greedy',rand);watch();const start=w.hour;
  const trips:unknown[]=[];const workerTicks:Record<number,number>={};
  const before={losses:w.stats.departures,deaths:w.stats.deaths,strain:w.strain};
  for(let t=0;t<TICKS_PER_HOUR;t++){
   const carrying=new Map(alive(w).map(c=>[c.id,!!c.carrying]));
   const carried=watched?new Map(alive(w).filter(c=>c.carrying).map(c=>[c.id,{cargo:{...c.carrying!},task:c.task?{...c.task}:null}])):null;
   tick(w);watch();
   if(watched)for(const c of alive(w)){
    if(c.activity==='working'&&c.goalReached&&c.job!=null)workerTicks[c.job]=(workerTicks[c.job]??0)+1;
    if(!carrying.get(c.id)&&c.carrying)trips.push({hour:w.hour,pawn:c.name,event:'pickup',cargo:{...c.carrying},task:c.task?{...c.task}:null});
    else if(carried?.has(c.id)&&!c.carrying)trips.push({hour:w.hour,pawn:c.name,event:'drop',...carried.get(c.id)});
   }
   for(const c of alive(w))if(!carrying.get(c.id)&&c.carrying){if(c.task?.kind==='supply')inputPickups++;else if(c.task?.kind==='haul'){if(c.task.fromInbox)returns++;else if(!c.task.restock)outputPickups++;}}
   if(w.decisions.length){autoDecide(w,'greedy',rand);watch();}
  }
  autoBuild(w);watch();const elapsed=w.hour-start;if(elapsed<=0)throw new Error('Simulation did not advance');
  if(watched){
   const actionNotes=TRACE.notes.slice();TRACE.notes=[];const plan=staffPlan(w,true);TRACE.on=false;
   appendFileSync(tracePath,JSON.stringify({...snapshot(),hour:w.hour,charterId:w.charter,stock:{...w.res},forbidden:[...w.forbidden],flows:{...w.flows},chain:charterChain(w),wanted:staffWants(w),explanation:[...actionNotes,...TRACE.notes],owned:[...w.owned],construction:w.buildings.filter(b=>!b.built).map(b=>({uid:b.uid,def:b.def,progress:b.progress,delivered:{...b.delivered}})),workshops:built(w).filter(b=>bdef(b).slots>0).map(b=>({uid:b.uid,def:b.def,recipe:currentRecipe(w,b),recipes:recipesOf(b).map((r,i)=>({output:r.output,on:recipeOn(b,i)})),workers:workersAt(w,b.uid).map(c=>c.name),planned:plan.get(b.uid),workHours:(workerTicks[b.uid]??0)/TICKS_PER_HOUR,blocked:blockedReason(w,b),inbox:{...b.inbox},outbox:{...b.outbox}})),pawns:alive(w).map(c=>({name:c.name,job:c.job,activity:c.activity,place:c.place,inside:c.inside,medicine:c.skills.medicine,reached:c.goalReached,hunger:c.hunger,illness:c.illness,meal:c.meal,task:c.task,carrying:c.carrying})),trips})+'\n');
  }
  const p=alive(w),mood=avgMood(w),comfort=colonyComfort(w),gaps=comfortGaps(w);for(const key of [seasonOf(w).season,`${seasonOf(w).season}/${standingOf(w)}`]){const s=seasons[key]??={hours:0,moodHours:0,comfortHours:0,pawnHours:0,coldPawnHours:0,sickPawnHours:0,foodShortHours:0,lowWoodHours:0,departures:0,deaths:0,netStrain:0,standingHours:{},needHours:{},needs:{},minFood:Infinity,minWood:Infinity};
  s.hours+=elapsed;s.moodHours+=mood*elapsed;s.comfortHours+=comfort*elapsed;s.pawnHours+=p.length*elapsed;s.coldPawnHours+=p.filter(c=>c.cold).length*elapsed;s.sickPawnHours+=p.filter(c=>c.illness).length*elapsed;
  s.foodShortHours+=(foodTotal(w)<p.length*2?elapsed:0);s.lowWoodHours+=(w.res.wood<10?elapsed:0);s.departures+=w.stats.departures-before.losses;s.deaths+=w.stats.deaths-before.deaths;s.netStrain+=w.strain-before.strain;s.standingHours[standingOf(w)]=(s.standingHours[standingOf(w)]??0)+elapsed;
  for(const gap of gaps){s.needs[gap.need]=(s.needs[gap.need]??0)+gap.avg*elapsed;s.needHours[gap.need]=(s.needHours[gap.need]??0)+elapsed;}
  s.minFood=Math.min(s.minFood,foodTotal(w));s.minWood=Math.min(s.minWood,w.res.wood);}
  if(w.hour%24>=12&&!seenDays.has(day(w))){
   seenDays.add(day(w));daily.push({...snapshot(),workshops:built(w).filter(b=>bdef(b).slots>0).map(b=>({def:b.def,workers:workersAt(w,b.uid).length,blocked:blockedReason(w,b)}))});
   const runnable=built(w).filter(b=>bdef(b).slots>0&&!workersAt(w,b.uid).length&&!blockedReason(w,b)).map(b=>b.def);
   if(runnable.length)flags.push({day:day(w),kind:'runnable but unstaffed',buildings:runnable});
   if(w.charter&&w.hour-pickedAt>=20*24)flags.push({day:day(w),kind:'charter held 20+ days',charter:w.charter,progress:charterProgress(w)?.label});
   const hungry=p.filter(c=>c.hunger<25);if(hungry.length&&foodTotal(w)>=p.length*2)flags.push({day:day(w),kind:'hungry with food stored',pawns:hungry.map(c=>({name:c.name,hunger:c.hunger,activity:c.activity,meal:c.meal}))});
   if(p.some(c=>c.cold)&&w.res.wood>=10)flags.push({day:day(w),kind:'cold with wood stored',pawns:p.filter(c=>c.cold).map(c=>({name:c.name,bed:c.bed}))});
  }
 }
 const summary=Object.fromEntries(Object.entries(seasons).map(([key,s])=>[key,{hours:s.hours,avgMood:s.moodHours/s.hours,avgComfort:s.comfortHours/s.hours,coldShare:s.coldPawnHours/s.pawnHours,sickShare:s.sickPawnHours/s.pawnHours,foodShortHours:s.foodShortHours,lowWoodHours:s.lowWoodHours,departures:s.departures,deaths:s.deaths,netStrain:s.netStrain,standingHours:s.standingHours,needs:Object.fromEntries(Object.keys(s.needs).map(n=>[n,s.needs[n]/s.needHours[n]])),minFood:s.minFood,minWood:s.minWood}]));
 const report={mode,seed,...(extraBlueprints.length?{extraBlueprints}:{}),status:w.status==='playing'?'timeout':w.status,day:1+w.hour/24,population:alive(w).length,peak:w.stats.peakPop,departures:w.stats.departures,deaths:w.stats.deaths,roughPlanks:w.flows['planks:+woodcutter']??0,coatsMade:w.flows['coats:+tailor']??0,coatsEquipped:w.flows['coats:-equipped']??0,inputPickups,outputPickups,returns,milestones,daily,flags,log:w.log,seasons:Object.fromEntries(Object.entries(summary).filter(([k])=>!k.includes('/'))),seasonStanding:Object.fromEntries(Object.entries(summary).filter(([k])=>k.includes('/')))};
 writeFileSync(`${out}/${mode}-${seed}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,daily:undefined,flags:undefined,log:undefined}));
}
