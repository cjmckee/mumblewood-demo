// npx tsx tools/batching-check.ts
import assert from 'node:assert/strict';
import {planInputBatch} from '../src/sim/batching';
assert.equal(planInputBatch({berries:1.2,wood:0.5},{},{wood:40},24,6),undefined,'missing co-ingredient prevents orphan stock');
assert.deepEqual(planInputBatch({berries:1.2,wood:0.5},{},{berries:12,wood:12},24,6),{outputs:6,deliveries:{berries:7.199999999999999,wood:3}},'stock in recipe proportions');
const overlap=planInputBatch({berries:1,rawFood:1},{},{berries:1,fish:1},24,1)!;
assert.equal(overlap.outputs,1);assert.equal(overlap.deliveries.berries,1);assert.equal(overlap.deliveries.fish,1);
assert.equal(planInputBatch({berries:1,rawFood:1},{},{berries:1},24,1),undefined,'categories cannot count the same item twice');
assert.deepEqual(planInputBatch({cloth:2},{cloth:2},{},24,6),{outputs:1,deliveries:{}},'use a complete buffered recipe without new collection');
assert.equal(planInputBatch({cloth:2,leather:2},{cloth:2},{leather:2},3,1),undefined,'shared input capacity includes existing materials');
assert.equal(planInputBatch({wood:3},{},{wood:30},12,6)!.outputs,4,'capacity bounds complete output batches');
assert.equal(planInputBatch({wood:3},{},{wood:30},12,0),undefined,'no batch when output has no room');
console.log('batch planner: 10 checks passed');
