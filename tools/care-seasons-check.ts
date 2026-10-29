// npx tsx tools/care-seasons-check.ts
import assert from 'node:assert/strict';
import {createWorld,apply,findSpot,workersAt,seasonYield} from '../src/sim/world';
import {BOT,autoBuild,staffPlan,autoStaff} from '../src/sim/autoplayer';
const saved={...BOT};
try{
 const w=createWorld(24757);w.charter='piesky';w.owned.push('pieoven','sawmill','clinic');w.res.wood=50;w.res.berries=60;
 w.colonists[0].illness={id:'flu',name:'Frontier flu',severity:60,worsen:1,contagious:true};
 Object.assign(BOT,{fineInputs:false,plannedRoughDemand:false,urgentClinic:false});
 const old=structuredClone(w),care=structuredClone(w);autoBuild(old);BOT.urgentClinic=true;autoBuild(care);
 assert(!old.buildings.some(b=>b.def==='clinic'),'old construction prioritizes the charter chain');
 assert(care.buildings.some(b=>b.def==='clinic'),'bedridden settlers unlock urgent clinic construction');
 const poor=structuredClone(w);poor.res.wood=24;autoBuild(poor);assert(!poor.buildings.some(b=>b.def==='clinic'),'care still respects construction costs and the wood buffer');
 const locked=structuredClone(w);locked.owned=locked.owned.filter(id=>id!=='clinic');autoBuild(locked);assert(!locked.buildings.some(b=>b.def==='clinic'),'care does not grant an unknown blueprint');
 const healthy=structuredClone(w);healthy.colonists[0].illness=null;BOT.urgentClinic=false;const base=structuredClone(healthy);autoBuild(base);BOT.urgentClinic=true;autoBuild(healthy);
 assert.deepEqual(healthy.buildings,base.buildings,'healthy colonies retain their normal construction priorities');
 const farm=createWorld(8919,{colonists:14});farm.owned.push('field','mill','bakery');farm.charter='bread';farm.res.berries=200;farm.res.stew=100;farm.res.wood=100;
 for(const id of ['field','mill','bakery']){const pos=findSpot(farm,id);assert(pos);assert.equal(apply(farm,{type:'place',def:id,...pos}),null);farm.buildings.at(-1)!.built=true;}
 const field=farm.buildings.find(b=>b.def==='field')!;farm.hour=480;BOT.seasonalStaffing=false;
 assert((staffPlan(farm).get(field.uid)??0)>0,'old winter plan allocates a dormant field');
 BOT.seasonalStaffing=true;assert.equal(staffPlan(farm).get(field.uid),0,'winter plan allocates no dormant field workers');
 apply(farm,{type:'assign',colonist:farm.colonists[0].id,building:field.uid});autoStaff(farm);assert.equal(workersAt(farm,field.uid).length,0,'actual reassignment releases winter field workers');
 farm.hour=720;autoStaff(farm);assert(seasonYield(farm,'field')>0);assert(workersAt(farm,field.uid).length>0,'field becomes eligible again in spring');
 const med=createWorld(8919,{colonists:6});med.owned.push('clinic');med.res.berries=200;med.res.wood=100;
 const cp=findSpot(med,'clinic');assert(cp);assert.equal(apply(med,{type:'place',def:'clinic',...cp}),null);const clinic=med.buildings.at(-1)!;clinic.built=true;
 const illDoctor=med.colonists[0],patient=med.colonists[1],healthyMedic=med.colonists[2];
 illDoctor.illness={id:'tummy',name:'Bad tummy',severity:1,worsen:0.15,contagious:false};illDoctor.skills.medicine=10;
 patient.illness={id:'flu',name:'Frontier flu',severity:60,worsen:1,contagious:true};
 for(const c of med.colonists.slice(2))c.skills.medicine=0;healthyMedic.skills.medicine=5;
 apply(med,{type:'assign',colonist:illDoctor.id,building:clinic.uid});
 const gatherer=med.buildings.find(b=>b.def==='forager')!;apply(med,{type:'assign',colonist:healthyMedic.id,building:gatherer.uid});
 BOT.urgentClinic=false;autoStaff(med);assert.equal(workersAt(med,clinic.uid)[0]?.id,illDoctor.id,'old staffing retains a mildly ill doctor');
 BOT.urgentClinic=true;autoStaff(med);assert.equal(workersAt(med,clinic.uid)[0]?.id,healthyMedic.id,'reserve a healthy medic even when they held a food job');
 assert(workersAt(med,clinic.uid).every(c=>!c.illness),'a clinic assignment satisfies the actual treatment eligibility rule');
 console.log('care and seasons: urgent construction, affordability/access, healthy colonies, winter release and spring staffing passed');
}finally{Object.assign(BOT,saved);}
