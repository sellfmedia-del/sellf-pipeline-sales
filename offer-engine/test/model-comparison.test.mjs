import test from 'node:test';
import assert from 'node:assert/strict';
import {createAllowance,candidates,fingerprint} from '../scripts/model-comparison-core.mjs';
test('comparison prevents calls beyond one total allowance; ambiguous results retain reservations',()=>{
 const budget=createAllowance(100),model=candidates[0],entry=budget.reserve(model,8,512,'health');
 assert.ok(budget.committed>0);const reserved=budget.committed;
 assert.equal(budget.settle(entry,{promptTokenCount:8,candidatesTokenCount:2,totalTokenCount:999}),false);
 assert.equal(budget.committed,reserved);
 assert.throws(()=>budget.reserve(model,100000,16384,'quality'),/comparison_budget_limit/);
 assert.equal(budget.committed,reserved);
 assert.equal(budget.settle(entry,{promptTokenCount:8,candidatesTokenCount:4,totalTokenCount:12}),true);
 assert.ok(budget.committed<reserved);
 assert.equal(budget.settle(entry,{promptTokenCount:8,candidatesTokenCount:4,totalTokenCount:12}),false);
});
test('comparison refuses uncounted or oversized inputs and hashes identical context consistently',()=>{
 const budget=createAllowance();
 for(const input of [0,NaN,200000])assert.throws(()=>budget.reserve(candidates[0],input,512,'bad'),/invalid_token_envelope/);
 assert.equal(budget.committed,0);assert.equal(fingerprint({packet:['one','two']}),fingerprint({packet:['one','two']}));
 assert.notEqual(fingerprint({packet:['one']}),fingerprint({packet:['two']}));
});
test('a quality pass retains every previous uncertain reservation and the same total cap',()=>{
 const first=createAllowance(100),entry=first.reserve(candidates[0],18,512,'health');
 const next=createAllowance(100,first.entries);assert.equal(next.committed,entry.reservedKurus);
 assert.throws(()=>next.reserve(candidates[0],10000,16384,'quality'),/comparison_budget_limit/);
 assert.equal(next.committed,first.committed);assert.notEqual(next.entries,first.entries);
 assert.throws(()=>createAllowance(1,first.entries),/comparison_budget_limit/);
});
