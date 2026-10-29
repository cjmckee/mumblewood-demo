// npx tsx tools/clinic-triage-check.ts
import assert from 'node:assert/strict';
import {createWorld,apply,findSpot,clinicAdmissions,tick,TICKS_PER_HOUR,spotOf} from '../src/sim/world';
import {START} from '../src/sim/scenario';
import {saveWorld,loadSave} from '../src/save';
const saved=START.clinicTriage;
try{
 const w=createWorld(42,{colonists:5});w.owned.push('clinic');const pos=findSpot(w,'clinic');assert(pos);assert.equal(apply(w,{type:'place',def:'clinic',...pos}),null);const clinic=w.buildings.at(-1)!;clinic.built=true;
 const [injured,critical,other,waiting,mild]=w.colonists;
 for(const c of w.colonists){c.activity='sick';c.hunger=100;c.fun=100;c.job=null;c.place=null;c.inside=null;}
 injured.illness={id:'ankle',name:'Ankle',severity:99,worsen:0.2,contagious:false};injured.place=clinic.uid;injured.inside=clinic.uid;
 for(const [c,severity]of [[critical,90],[other,80],[waiting,70]] as const)c.illness={id:'flu',name:'Flu',severity,worsen:1,contagious:true};
 mild.illness={id:'tummy',name:'Tummy',severity:2,worsen:0.15,contagious:false};
 let plan=clinicAdmissions(w);assert.equal(plan.size,2);assert(plan.has(critical.id)&&plan.has(other.id),'fatal illness and severity outrank a nonfatal injury already in a bed');assert(!plan.has(mild.id));
 waiting.illness!.severity=65;waiting.place=clinic.uid;
 plan=clinicAdmissions(w);assert(plan.has(waiting.id)&&!plan.has(other.id),'ongoing critical care remains reserved while severity orders waiting patients');
 assert.deepEqual(clinicAdmissions(structuredClone(w)),plan,'admissions need no additional saved fields');
 const secondPos=findSpot(w,'clinic');assert(secondPos);apply(w,{type:'place',def:'clinic',...secondPos});const second=w.buildings.at(-1)!;second.built=true;
 plan=clinicAdmissions(w);assert.equal(plan.size,4);for(const b of [clinic,second])assert([...plan.values()].filter(uid=>uid===b.uid).length<=2,'incoming and resident patients share the same bed capacity');
 w.buildings=w.buildings.filter(b=>b!==second);waiting.illness=null;mild.illness=null;injured.illness!.severity=40;other.illness!.severity=75;critical.illness!.severity=80;
 const loc=spotOf(clinic);injured.x=loc.x;injured.y=loc.y;START.clinicTriage=true;w.nextEventHour=1e9;
 for(let t=0;t<4*TICKS_PER_HOUR;t++){w.decisions=[];tick(w);}
 assert.notEqual(injured.place,clinic.uid,'lower-priority patient physically yields the clinic');assert.equal(critical.place,clinic.uid);assert.equal(other.place,clinic.uid);
 assert(w.colonists.filter(c=>c.illness&&c.activity==='sick').every(c=>c.clinicRequestedAt!=null),'old saves without request times initialize on the next tick');
 const queue=structuredClone(w);const [first,secondInLine,urgent]=queue.colonists;
 for(const c of queue.colonists){c.illness=null;c.place=null;c.inside=null;}
 for(const [c,time,severity]of [[first,1,40],[secondInLine,2,99],[urgent,3,90]] as const){c.illness={id:'ankle',name:'Ankle',severity,worsen:0.2,contagious:false};c.clinicRequestedAt=time;}
 let order=clinicAdmissions(queue);assert(order.has(first.id)&&order.has(secondInLine.id)&&!order.has(urgent.id),'nonfatal severity cannot jump the first-come queue');
 urgent.illness!.contagious=true;order=clinicAdmissions(queue);assert(order.has(urgent.id)&&order.has(first.id)&&!order.has(secondInLine.id),'critical case displaces the last noncritical admission');
 assert.equal(secondInLine.clinicRequestedAt,2,'displacement preserves queue position');urgent.illness=null;order=clinicAdmissions(queue);assert(order.has(secondInLine.id),'displaced patient returns ahead of later requests');
 const data=new Map<string,string>();Object.assign(globalThis,{localStorage:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)}});
 assert(saveWorld(queue));const resumed=loadSave()!.world;assert.equal(resumed.colonists.find(c=>c.id===secondInLine.id)!.clinicRequestedAt,2,'queue position survives actual save/resume');assert.deepEqual(clinicAdmissions(resumed),order);
 console.log('clinic triage: mortality/severity ordering, care continuity, first-come queue, displacement, capacity, save data and actual movement passed');
}finally{START.clinicTriage=saved;}
