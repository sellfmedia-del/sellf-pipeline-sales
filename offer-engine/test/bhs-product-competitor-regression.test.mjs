import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

// These two regressions can also run against the unmodified release checkout.
const root=process.env.BHS_BASELINE_ROOT?pathToFileURL(process.env.BHS_BASELINE_ROOT+'/offer-engine/'):new URL('../',import.meta.url);
const {researchOutcomeIssues}=await import(new URL('src/bhs/conversation-research.mjs',root));
const {brief,source,peerSource,researchSources,completeResearchProgress,researchSummary}=await import(new URL('test/fixtures/bhs-conversation.mjs',root));
const options={analysisVersion:'product-buyer-competition-v1',progress:completeResearchProgress()};

test('the new selected-scope contract cannot call a market/brand-name-only handoff complete without product analysis',()=>{
 const issues=researchOutcomeIssues(researchSummary(),researchSources,brief,options);
 assert.ok(issues.includes('offering_scope_missing'),JSON.stringify(issues));
});
test('a named rival cannot stand in for the selected alternative product page that was never read',()=>{
 const value={...researchSummary(),offeringScope:'Seçili tüy bakım ürünü.',offerings:[{id:'coat',label:'Tüy bakım',audience:'Ev sahipleri',need:'Tüy bakımı',market:'Türkiye',channel:'Online',commercialRole:'Seçili ürün',productQuestionId:'brand',competitionQuestionId:'competition',
  products:[{name:'Bakım spreyi',url:source.url,analysis:'Ürün ve sipariş yolu birlikte değerlendirildi.',sourceIds:[source.id]}]}]};
 value.competitors=value.competitors.map(row=>({...row,offeringId:'coat',alternativeName:'Rakip model',alternativeUrl:new URL('/unread-model',peerSource.url).href}));
 const issues=researchOutcomeIssues(value,researchSources,brief,options);
 assert.ok(issues.includes('competitor_product_unread'),JSON.stringify(issues));
});
