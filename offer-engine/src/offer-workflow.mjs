import {createHash,randomUUID} from 'node:crypto';
import {stages,assertResult} from './contracts.mjs';
import {logoEngine} from './engines/logo-engine.mjs';
import {auditEngine} from './engines/audit-engine.mjs';
import {pricingEngine} from './engines/pricing-engine.mjs';
import {proposalEngine} from './engines/proposal-engine.mjs';

const defaults={logo:logoEngine,audit:auditEngine,pricing:pricingEngine,proposal:proposalEngine};
// One workflow instance belongs to one future offer draft; nothing is persisted.
// Unchanged successful stages can be reused when another stage fails/retries.
export function createOfferWorkflow(engines=defaults){
  const cache=new Map();
  return Object.freeze({async run(stage,input,dependencies={}){
    if(!stages.includes(stage)||!engines[stage])throw new Error('Bilinmeyen motor.');
    const required=stage==='pricing'?['audit']:stage==='proposal'?['logo','audit','pricing']:[];
    for(const name of required){
      const result=dependencies[name];
      const draftLogo=stage==='proposal'&&name==='logo'&&result?.status==='review';
      if(result?.stage!==name||result.status!=='ready'&&!draftLogo)throw new Error('Önce '+name+' sonucu doğrulanmalı.');
      assertResult(name,result);
    }
    const engine=engines[stage];
    const snapshot=structuredClone({input,dependencies});
    const inputHash=createHash('sha256').update(JSON.stringify({version:engine.version,...snapshot})).digest('hex');
    const key=stage+':'+inputHash;
    if(cache.has(key))return structuredClone(cache.get(key));
    const result={...await engine.run(snapshot.input,snapshot.dependencies)};
    // A transparent, technically valid logo can enter a draft before visual
    // approval; that draft must remain in review and can never become published.
    if(stage==='proposal'&&snapshot.dependencies.logo.status==='review')result.status='review';
    assertResult(stage,result);
    const envelope={...result,stage,engineVersion:engine.version,inputHash,runId:randomUUID()};
    cache.set(key,structuredClone(envelope));
    return structuredClone(envelope);
  }});
}
