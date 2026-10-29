// Isolated, ready-to-operate food routes; no bot win-rate claims.
// npx tsx tools/winter-food-probe.ts [seed=8919] [days=40]
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {BUILDING_BY_ID,ResourceId,JOB_KINDS} from '../src/sim/content';
import {createWorld,apply,findSpot,alive,built,bdef,workersAt,currentRecipe,reconcileStock,tick,TICKS_PER_HOUR,foodTotal,avgMood,colonyComfort,blockedReason,seasonYield,World} from '../src/sim/world';
import {seasonOf} from '../src/sim/seasons';
const seed=Number(process.argv[2]??8919),days=Number(process.argv[3]??40);
const only=process.env.FOOD_ROUTE;assert(only==null||['fish','mushrooms','grain'].includes(only));
const redeploy=process.env.WINTER_REDEPLOY==='1';
assert(Number.isSafeInteger(seed)&&Number.isInteger(days)&&days>0);
const out=process.env.RESULT_DIR??'dist/winter-food';mkdirSync(out,{recursive:true});
const routes=[{id:'fish',buildings:['dock','kitchen'],raw:'fish',meal:'stew'},{id:'mushrooms',buildings:['cellar','kitchen'],raw:'mushrooms',meal:'stew'},{id:'grain',buildings:['field','mill','bakery'],raw:'grain',meal:'bread'}];
for(const route of routes.filter(r=>only==null||r.id===only)){
 const w=createWorld(seed,{colonists:8});assert(w.sites.includes('soil'),'use a soil-equipped map for the grain comparison');
 w.autoAssignNew=false;
 // Capital is deliberately granted. Costs below describe the omitted construction investment.
 const put=(id:string)=>{if(!w.owned.includes(id))w.owned.push(id);const pos=findSpot(w,id);assert(pos,`spot for ${id}`);assert.equal(apply(w,{type:'place',def:id,...pos}),null);const b=w.buildings.at(-1)!;b.built=true;return b;};
 const sourceBuildings=route.buildings.map(put);
 put('storehouse');put('storehouse');put('dining');const clinic=put('clinic');put('leanto');put('leanto');
 const homes=built(w).filter(b=>bdef(b).beds);for(const [i,c] of alive(w).entries()){c.job=null;c.task=null;c.carrying=null;c.bed=homes[Math.floor(i/2)].uid;for(const job of JOB_KINDS)c.skills[job]=5;}
 const people=alive(w);const assign=(i:number,b:number)=>assert.equal(apply(w,{type:'assign',colonist:people[i].id,building:b}),null);
 assign(0,sourceBuildings[0].uid);assign(1,sourceBuildings[0].uid);
 if(route.id==='grain'){assign(2,sourceBuildings[1].uid);assign(3,sourceBuildings[2].uid);}else{assign(2,sourceBuildings[1].uid);assign(3,sourceBuildings[1].uid);}
 const wood=built(w).find(b=>b.def==='woodcutter')!;wood.off=[1];wood.productionLimits={wood:80};assign(4,wood.uid);assign(5,clinic.uid);
 for(const b of sourceBuildings){const recs=bdef(b).recipes??[];b.off=recs.flatMap((r,i)=>r.output===(b.def==='mill'?'flour':b===sourceBuildings[0]?route.raw:route.meal)?[]:[i]);}
 for(const r of Object.keys(w.res))w.res[r as ResourceId]=0;w.res.wood=100;w.res.berries=30;w.res.stew=40;reconcileStock(w);
 w.chartersDone=['settled'];w.charterTier=2;w.charter=null;w.decisions=[];w.nextEventHour=1e9;
 let winterCaptured=false,previousSeason=seasonOf(w).season;
 const initial=structuredClone(w),hourly:any[]=[],actions:any[]=[],seasons:Record<string,any>={};
 const file=`${out}/${route.id}-${seed}-watch.jsonl`;writeFileSync(file,'');
 while(w.status==='playing'&&w.hour<6+days*24){
  const now=seasonOf(w).season;
  if(route.id==='grain'&&now==='winter'&&!winterCaptured){writeFileSync(`${out}/grain-${seed}-winter-fork.json`,JSON.stringify({world:w},null,2));winterCaptured=true;}
  if(redeploy&&route.id==='grain'&&now!==previousSeason){
   if(now==='winter')for(const i of [0,1])assert.equal(apply(w,{type:'assign',colonist:people[i].id,building:null}),null);
   if(previousSeason==='winter')for(const i of [0,1])assign(i,sourceBuildings[0].uid);
  }
  previousSeason=now;
  const start=w.hour,flow={...w.flows},season=seasonOf(w).season,sourceDormant=seasonYield(w,sourceBuildings[0].def)<=0;const work:Record<number,number>={},walk:Record<number,number>={};const trips:any[]=[];
  for(let t=0;t<TICKS_PER_HOUR;t++){
   w.decisions=[];const before=new Map(alive(w).map(c=>[c.id,c.carrying?{cargo:{...c.carrying},task:c.task?{...c.task}:null}:null]));tick(w);
   for(const c of alive(w)){
    if(c.activity==='working'&&c.job!=null){const bucket=c.goalReached?work:walk;bucket[c.job]=(bucket[c.job]??0)+1/TICKS_PER_HOUR;}
    const prev=before.get(c.id);if(!prev&&c.carrying)trips.push({hour:w.hour,event:'pickup',pawn:c.name,cargo:{...c.carrying},task:c.task?{...c.task}:null});
    if(prev&&!c.carrying)trips.push({hour:w.hour,event:'drop',pawn:c.name,...prev});
   }
  }
  const hours=w.hour-start,s=seasons[season]??={hours:0,pawnHours:0,production:{},eaten:{},foodMin:Infinity,foodShortHours:0,coldPawnHours:0,sickPawnHours:0,sourceWork:0,dormantSourceWork:0,processWork:0,jobWalking:0,supplyTrips:0,outputTrips:0};
  s.hours+=hours;s.pawnHours+=alive(w).length*hours;s.foodMin=Math.min(s.foodMin,foodTotal(w));s.foodShortHours+=foodTotal(w)<alive(w).length*2?hours:0;s.coldPawnHours+=alive(w).filter(c=>c.cold).length*hours;s.sickPawnHours+=alive(w).filter(c=>c.illness).length*hours;
  s.sourceWork+=work[sourceBuildings[0].uid]??0;if(sourceDormant)s.dormantSourceWork+=work[sourceBuildings[0].uid]??0;for(const b of sourceBuildings.slice(1))s.processWork+=work[b.uid]??0;for(const b of sourceBuildings)s.jobWalking+=walk[b.uid]??0;
  for(const [k,total]of Object.entries(w.flows)){const delta=total-(flow[k]??0);if(!delta)continue;if(k.includes(':+'))s.production[k]=(s.production[k]??0)+delta;if(k.endsWith(':-eaten'))s.eaten[k]=(s.eaten[k]??0)+delta;}
  for(const t of trips)if(t.event==='pickup'){if(t.task?.kind==='supply')s.supplyTrips++;if(t.task?.kind==='haul'&&!t.task.fromInbox&&!t.task.restock)s.outputTrips++;}
  const snapshot={hour:w.hour,day:1+w.hour/24,season:seasonOf(w).season,population:alive(w).length,food:foodTotal(w),stock:{...w.res},mood:avgMood(w),comfort:colonyComfort(w),losses:{deaths:w.stats.deaths,departures:w.stats.departures},workshops:sourceBuildings.map(b=>({uid:b.uid,def:b.def,eff:b.eff,recipe:currentRecipe(w,b),workers:workersAt(w,b.uid).map(c=>c.name),work:work[b.uid]??0,walking:walk[b.uid]??0,blocked:blockedReason(w,b),inbox:{...b.inbox},outbox:{...b.outbox}})),pawns:alive(w).map(c=>({name:c.name,hunger:c.hunger,illness:c.illness,activity:c.activity,meal:c.meal,lastMeal:c.lastMeal,ate:c.ate})),trips};
  appendFileSync(file,JSON.stringify(snapshot)+'\n');
  if(Math.round(w.hour)%24===6)hourly.push(snapshot);
  for(const c of alive(w))if(c.hunger<10&&foodTotal(w)>=alive(w).length*2)actions.push({hour:w.hour,pawn:c.name,hunger:c.hunger,activity:c.activity,meal:c.meal,illness:c.illness});
 }
 assert.equal(alive(w).length+w.stats.deaths+w.stats.departures,8,'probe does not recruit extra settlers');
 assert(Math.abs(Object.values(seasons).reduce((n,s)=>n+s.hours,0)-(w.hour-6))<1e-6,'season exposure accounts for elapsed time');
 for(const s of Object.values(seasons))assert(s.foodMin>=0,'stored food cannot become negative');
 const capital=route.buildings.reduce((n,id)=>{for(const [k,v]of Object.entries(BUILDING_BY_ID[id].cost))n[k]=(n[k]??0)+(v??0);return n;},{} as Record<string,number>);
 const report={route:route.id,seed,days,winterRedeploy:redeploy&&route.id==='grain',day:1+w.hour/24,status:w.status,population:alive(w).length,deaths:w.stats.deaths,departures:w.stats.departures,grants:{colonists:8,wood:100,berries:30,stew:40,readyBuildings:true,skills:5},routeCapital:capital,efficiencies:sourceBuildings.map(b=>({def:b.def,eff:b.eff})),initial,seasons,daily:hourly,flags:actions,log:w.log};
 writeFileSync(`${out}/${route.id}-${seed}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,initial:undefined,daily:undefined,flags:undefined,log:undefined}));
}
