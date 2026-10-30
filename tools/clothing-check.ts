// End-to-end routes, personal equipment and seasonal storage. Run: npx tsx tools/clothing-check.ts
import assert from 'node:assert/strict';
import { createWorld, debugGrow, apply, findSpot, alive, runHours, reconcileStock, hasCoat, chillChance, seasonYield, World } from '../src/sim/world';
import { CLOTHING } from '../src/sim/content';
import { seasonOf, seasonOn } from '../src/sim/seasons';
import { loadSave, saveWorld } from '../src/save';
const clear = (w: World) => { while (w.decisions.length) apply(w, { type: 'resolve', option: 99 }); };
const run = (w: World, hours: number) => { for (let h=0;h<hours;h++) { clear(w); runHours(w,1); } };
function put(w: World, id: string) {
  w.owned.push(id); const spot = findSpot(w,id); assert(spot,`spot for ${id}`);
  assert.equal(apply(w,{type:'place',def:id,...spot}),null);
  const b=w.buildings.at(-1)!;b.built=true;return b;
}
const measurements: unknown[]=[];
for(const route of [['flaxfield','weaver','cloth'],['trapper','tanner','leather']]){
 let w=createWorld(101);for(let seed=102;!w.sites.includes('soil');seed++)w=createWorld(seed);
 debugGrow(w,10);clear(w);w.nextEventHour=1e9;
 for(let i=0;i<3;i++)put(w,'storehouse');
 w.res.wood=180;w.res.berries=200;w.res.stew=200;reconcileStock(w);
 const chain=[put(w,route[0]),put(w,route[1]),put(w,'tailor')];
 for(const c of alive(w))apply(w,{type:'assign',colonist:c.id,building:null});
 for(let i=0;i<6;i++)apply(w,{type:'assign',colonist:alive(w)[i].id,building:chain[Math.floor(i/2)].uid});
 run(w,240);
 assert((w.flows[`coats:+tailor`]??0)>=2,`${route.join('→')} produces clothes`);
 assert((w.flows[`${route[2]}:-tailor`]??0)>0,'tailor consumes the correct route material');
 assert((w.flows[`${route[2]}:+${route[1]}`]??0)>0,'intermediate is produced through its workshop');
 assert(alive(w).every(c=>!hasCoat(c)),'summer: nobody claims a new coat');
 measurements.push({route:route[0],days:10,coats:w.flows['coats:+tailor'],material:w.flows[`${route[2]}:+${route[1]}`]});
}
const w=createWorld(42);w.nextEventHour=1e9;w.res.coats=1;reconcileStock(w);
w.hour=20*24+8; // winter 1
for(const c of alive(w)){c.hunger=100;c.fun=100;c.job=null;}
run(w,5);
assert.equal(alive(w).filter(hasCoat).length,1,'one coat can protect only one settler');
assert.equal(w.res.coats,0,'equipped coat leaves tradeable stock');
assert.equal(w.flows['coats:-equipped'],1,'exactly one coat consumed');
const c=alive(w).find(hasCoat)!;const before=c.coatHours!;
run(w,2);assert.equal(c.coatHours,before-2,'wear while worn');
c.cold=true;const clothed=chillChance(w,c);const life=c.coatHours!;c.coatHours=0;
assert.equal(clothed,chillChance(w,c)*CLOTHING.chillRiskMultiplier,'coat reduces cold illness risk');c.coatHours=life;
w.hour=30*24+8; // spring 1
run(w,5);assert(c.coatStoredAt!=null,'personal coat is physically stored in spring');
const stored=c.coatHours!;run(w,24);assert.equal(c.coatHours,stored,'stored coats do not wear');
w.hour=60*24+8; // second winter
run(w,5);assert(hasCoat(c),'settler retrieves their own coat');assert(c.coatHours!<=stored&&c.coatHours!>stored-6,'retrieval preserves condition');assert.equal(w.flows['coats:-equipped'],1,'retrieval does not create or consume another coat');
c.coatHours=1;run(w,1);assert.equal(c.coatHours,0,'worn coat expires');
assert.equal(w.flows['coats:-wornOut'],1,'expiry is recorded');
const fuel=createWorld(9);fuel.nextEventHour=1e9;fuel.hour=20*24+8;fuel.res.wood=0;reconcileStock(fuel);
const bundled=alive(fuel)[0];bundled.coatHours=CLOTHING.lifetimeHours;run(fuel,1);
assert.equal(bundled.cold,true,'wearing a coat does not heat an unfuelled home');
const coatThought=bundled.thoughts.find(t=>t.label==='Cold, but bundled in a warm coat');
assert(coatThought && coatThought.value===-3,'a coat halves the actual cold-home mood penalty');
const fresh=createWorld(7);assert.equal(seasonOf(fresh).dayOf,1);assert.equal(seasonOf(fresh).season,'summer');assert.equal(seasonOf(fresh).toWinter,20);
assert.equal(seasonOn(21).season,'winter');assert.equal(seasonOn(16,{season:'summer',day:6}).season,'winter');
const alternate=createWorld(7,{colonists:5,startDate:{season:'spring',day:3}});assert.equal(alive(alternate).length,5);assert.equal(seasonOf(alternate).dayOf,3);assert.equal(seasonOf(alternate).season,'spring');
assert.throws(()=>createWorld(7,{startDate:{season:'summer',day:11}}));
w.hour=20*24;assert.equal(seasonYield(w,'flaxfield'),0);assert(seasonYield(w,'trapper')>0,'animal route works in winter');
// Real save round-trip and migration without a browser DOM.
const data=new Map<string,string>();Object.assign(globalThis,{localStorage:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)}});
assert(saveWorld(alternate));const loaded=loadSave()!;assert.deepEqual(loaded.world.startDate,alternate.startDate);
saveWorld(w);assert.equal(loadSave()!.world.colonists.find(x=>x.id===c.id)!.coatHours,c.coatHours);
const legacy=JSON.parse(data.get('mumblewood.save.v1')!);delete legacy.world.startDate;delete legacy.world.res.coats;data.set('mumblewood.save.v1',JSON.stringify(legacy));
const migrated=loadSave()!.world;assert.equal(migrated.res.coats,0);assert.deepEqual(migrated.startDate,{season:'summer',day:6});
console.log('clothing, calendar and save checks passed');console.log(JSON.stringify(measurements));
