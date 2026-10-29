// npx tsx tools/fine-inputs-check.ts
import assert from 'node:assert/strict';
import {createWorld,reconcileStock,apply,findSpot} from '../src/sim/world';
import {BOT,autoBuild,roughPlankMaker,fineMaterialChain} from '../src/sim/autoplayer';
const saved={...BOT};
try{
 const w=createWorld(24757);w.owned=['stockpile','leanto','woodcutter','forager','kiln','claypit','pieoven'];
 w.charter='piesky';w.res.wood=50;w.res.berries=30;w.res.stew=6;reconcileStock(w);
 Object.assign(BOT,{fineInputs:false,plannedRoughDemand:false});
 assert.equal(roughPlankMaker(w),undefined,'baseline waits for a site that cannot yet be placed');
 BOT.plannedRoughDemand=true;
 assert(roughPlankMaker(w)!=null,'candidate sees fine materials required by the planned charter route');
 w.flows['planks:+woodcutter']=BOT.roughPlankBudget;
 assert.equal(roughPlankMaker(w),undefined,'planning does not bypass the existing rough-work budget');
 w.flows['planks:+woodcutter']=0;BOT.plannedRoughDemand=false;
 const control=structuredClone(w),candidate=structuredClone(w);autoBuild(control);
 BOT.fineInputs=true;autoBuild(candidate);
 assert(!control.buildings.some(b=>b.def==='claypit'),'baseline does not select the fine-material supplier');
 assert(candidate.buildings.some(b=>b.def==='claypit'),'candidate starts the supplier needed to unlock fine construction');
 assert.equal(candidate.flows['planks:+woodcutter']??0,0,'supplier planning does not grant fine materials or use the rough-work experiment');
 const kilnRoute=fineMaterialChain(w);assert.deepEqual(kilnRoute,['claypit','kiln'],'kiln route includes its supplier');
 w.owned.push('sawmill','carpenter');
 const route=fineMaterialChain(w);assert.equal(route.filter(id=>['sawmill','kiln','carpenter'].includes(id)).length,1,'choose one alternative fine-material producer');
 const kilnSpot=findSpot(w,'kiln');assert(kilnSpot);assert.equal(apply(w,{type:'place',def:'kiln',...kilnSpot}),null);w.buildings.at(-1)!.built=true;
 assert.deepEqual(fineMaterialChain(w),['claypit','kiln'],'preserve the existing kiln instead of building competing routes');
 w.owned=w.owned.filter(id=>!['kiln','sawmill'].includes(id));w.buildings=w.buildings.filter(b=>b.def!=='kiln');
 assert.deepEqual(fineMaterialChain(w),['carpenter'],'carpenter can use wood without a reed supply');
 w.owned=w.owned.filter(id=>id!=='carpenter');assert.deepEqual(fineMaterialChain(w),[],'missing blueprints are not treated as an available fine route');
 console.log('fine-input planning: blocked route, bounded fallback and supplier construction passed');
}finally{Object.assign(BOT,saved);}
