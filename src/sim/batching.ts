// Pure recipe-batch allocation. It never promises one ingredient to two overlapping inputs.
import { InputKey, ResourceId, membersOf } from './content';
export interface InputBatch { outputs: number; deliveries: Partial<Record<ResourceId, number>> }
export function planInputBatch(
  inputs: Partial<Record<InputKey, number>>,
  held: Partial<Record<ResourceId, number>>,
  available: Partial<Record<ResourceId, number>>,
  capacity: number,
  maxOutputs: number,
): InputBatch | undefined {
  const keys = (Object.keys(inputs) as InputKey[]).sort((a,b) => membersOf(a).length-membersOf(b).length || a.localeCompare(b));
  const heldUnits = Object.values(held).reduce((n,x)=>n+(x??0),0);
  for(let outputs=Math.floor(maxOutputs+1e-8);outputs>=1;outputs--){
    const own={...held}, stock={...available};const deliveries:InputBatch['deliveries']={};let possible=true;
    for(const key of keys){
      let need=(inputs[key]??0)*outputs;
      const members=membersOf(key);
      // Already buffered goods first, without borrowing them twice through a category alias.
      for(const r of members){const n=Math.min(need,own[r]??0);own[r]=(own[r]??0)-n;need-=n;}
      for(const r of [...members].sort((a,b)=>(stock[b]??0)-(stock[a]??0)||a.localeCompare(b))){
        const n=Math.min(need,Math.max(0,stock[r]??0));stock[r]=(stock[r]??0)-n;need-=n;if(n>1e-8)deliveries[r]=(deliveries[r]??0)+n;
      }
      if(need>1e-7){possible=false;break;}
    }
    const added=Object.values(deliveries).reduce((n,x)=>n+(x??0),0);
    if(possible && heldUnits+added<=capacity+1e-7)return {outputs,deliveries};
  }
}
